; ---------------------------------------------------------------------------
; SORT.SEGMENT  -  row sorting for Mouse Calc (Version Soft, 1984) - Version 2 update
;
; Loaded at $AC00 by the menu item Sort > "Sort rows A-Z / Z-A".
; Sorts the selected rows (whole rows) by a column the user types.
; Choosing Sort again on rows already in ascending order sorts descending.
; Numbers come before text; empty key cells always go last.
;
; Mouse Calc internals used (reverse engineered from 1.1):
;   $7E / $7F        last used row / column
;   $7906..$7909     selection top, left, bottom, right
;   $BB1E + row      row map: logical row -> physical grid row (1-based)
;   $732C            cell lookup: X = column, Y = row -> slot in $68/$69
;   $40AF / $4106    read / write the 8-byte slot $68/$69 <-> $409B..$40A2
;                    (A = 7).  Slot = 2-byte link + 6 payload bytes;
;                    a cell is a chain: type byte, contents, $FF
; Rows move by permuting the row map.  Formulas in the sorted rows that
; point at cells in the sorted rows are renumbered so they keep pointing
; at the same data (a range is followed only when both ends are in the
; same row).  Everything else is left alone, then the sheet recalculates.
; ---------------------------------------------------------------------------

        .setcpu "6502"

.macro  histr str
        .repeat .strlen(str), I
        .byte .strat(str, I) | $80
        .endrep
.endmacro

MAXROW    = $7E
MAXCOL    = $7F
SLOT      = $68        ; slot number for READSLOT / WRITESLOT
SLOTDATA  = $409B      ; 8-byte slot buffer
READSLOT  = $40AF
WRITESLOT = $4106
CELLSLOT  = $732C      ; X = column, Y = row -> SLOT (0 = empty)
ROWMAP    = $BB1E
SELTOP    = $7906
SELLEFT   = $7907
SELBOT    = $7908
SELRIGHT  = $7909
KBD       = $C000
KBDSTRB   = $C010
SHOWMSG   = $8B41      ; JSR SHOWMSG / .word msg  (zero-terminated)
BEEP      = $7E26
WAIT      = $FCA8      ; monitor delay
CALCNOW   = $5C54      ; "Calculate now!"
CURSOR    = $0BCD      ; cursor := selection end
REDRAW    = $0BD6      ; redraw window(s)
OVLENTRY  = $8996      ; overlay name table entry 4 (borrowed by the loader)
UNDO1     = $9B
UNDO2     = $98

        .segment "CODE"

entry:
        lda #$F2                ; put "PRINTER/" back in the overlay table
        sta OVLENTRY
        lda #$8B
        sta OVLENTRY+1

; ---- selected rows -> r1..r2 ------------------------------------------------
        lda SELTOP
        ldx SELBOT
        cmp SELBOT
        bcc :+
        lda SELBOT
        ldx SELTOP
:       sta r1
        stx r2
        lda SELLEFT
        cmp SELRIGHT
        bcc :+
        lda SELRIGHT
:       sta c1
        lda r2                  ; clamp to the used area
        cmp MAXROW
        bcc :+
        lda MAXROW
        sta r2
:       lda r1
        beq badsel
        cmp r2
        bcs badsel              ; fewer than two rows
        lda r2
        sec
        sbc r1
        clc
        adc #1
        sta n

; ---- ask for the key column -------------------------------------------------
        jsr SHOWMSG
        .word msg_ask
@key:   lda KBD
        bpl @key
        sta KBDSTRB
        and #$7F
        cmp #$1B                ; Esc: cancel
        bne :+
        jsr SHOWMSG
        .word msg_none
        rts
:       cmp #$0D                ; Return: leftmost selected column
        bne :+
        lda c1
        jmp @kchk
:       cmp #'a'
        bcc :+
        and #$DF
:       sec
        sbc #'A'-1              ; letter -> column number
@kchk:  beq @kbad
        cmp MAXCOL
        beq @kset
        bcc @kset
@kbad:  jsr BEEP
        jmp @key
@kset:  sta keycol
        jsr SHOWMSG
        .word msg_sorting

        jsr sortrows

        lsr UNDO1               ; nothing to undo after a sort
        lsr UNDO2
        jsr CALCNOW
        jsr CURSOR
        jsr REDRAW
        jsr SHOWMSG
        .word msg_none
        rts

badsel: jsr BEEP
        jsr SHOWMSG
        .word msg_sel
        ldx #10                 ; keep the message up for about 1.5 s
:       lda #$FF
        jsr WAIT
        dex
        bne :-
        rts

msg_sel:
        histr "Select two or more rows to sort"
msg_none:
        .byte 0
msg_ask:
        histr "Sort by which column? Type its letter (Return = leftmost, Esc = cancel)"
        .byte 0
msg_sorting:
        histr "Sorting..."
        .byte 0

; ===========================================================================
sortrows:
        ; direction: descending if the rows are already in ascending order
        lda #0
        sta desc
        lda #$FF
        sta tag0
        sta tag1
        ldx #0
@chk:   stx ka
        txa
        clc
        adc #1
        sta kb
        jsr greater             ; C=1 if row ka > row kb
        bcs @go
        ldx kb
        txa
        clc
        adc #1
        cmp n
        bcc @chk
        lda #1                  ; every pair in order -> sort descending
        sta desc
@go:
        ldx #0                  ; idx[k] = k
@ii:    txa
        sta idx,x
        inx
        cpx n
        bne @ii

        jsr mergesort

        ldx #0                  ; anything moved?
@any:   txa
        cmp idx,x
        bne @moved
        inx
        cpx n
        bne @any
        rts
@moved:
        ; permute the row map:  map[r1+k] = old map[r1+idx[k]]
        ldx #0
        ldy r1
@sv:    lda ROWMAP,y
        sta tmp,x
        iny
        inx
        cpx n
        bne @sv
        ldx #0
        ldy r1
@pm:    stx kk
        lda idx,x
        tax
        lda tmp,x
        sta ROWMAP,y
        iny
        ldx kk
        inx
        cpx n
        bne @pm
        ; inverse: inv[old] = new
        ldx #0
@inv:   lda idx,x
        tay
        txa
        sta inv,y
        inx
        cpx n
        bne @inv
        jmp fixformulas

; ===========================================================================
; bottom-up stable merge sort of idx[0..n-1]
mergesort:
        lda #1
        sta width
@wl:    lda width
        beq @done
        cmp n
        bcs @done
        lda #0
        sta lo
@ll:    lda lo
        cmp n
        bcs @nextw
        clc
        adc width
        bcs @midn
        cmp n
        bcc @midok
@midn:  lda n
@midok: sta mid
        clc
        adc width
        bcs @hin
        cmp n
        bcc @hiok
@hin:   lda n
@hiok:  sta hi
        lda mid
        cmp hi
        bcs @skip
        jsr merge
@skip:  lda hi
        sta lo
        jmp @ll
@nextw: asl width
        jmp @wl
@done:  rts

merge:
        lda lo
        sta mi
        sta mk
        lda mid
        sta mj
@m1:    lda mi
        cmp mid
        bcs @restj
        lda mj
        cmp hi
        bcs @resti
        ldx mi
        lda idx,x
        sta ka
        ldx mj
        lda idx,x
        sta kb
        jsr greater
        bcs @takej
        ldx mi                  ; equal or smaller: take left (stable)
        lda idx,x
        inc mi
        jmp @put
@takej: ldx mj
        lda idx,x
        inc mj
@put:   ldx mk
        sta tmp,x
        inc mk
        jmp @m1
@resti: ldx mi
        cpx mid
        bcs @copy
        lda idx,x
        ldx mk
        sta tmp,x
        inc mk
        inc mi
        jmp @resti
@restj: ldx mj
        cpx hi
        bcs @copy
        lda idx,x
        ldx mk
        sta tmp,x
        inc mk
        inc mj
        jmp @restj
@copy:  ldx lo
@cp:    lda tmp,x
        sta idx,x
        inx
        cpx hi
        bne @cp
        rts

; ===========================================================================
; greater: C=1 if row ka sorts after row kb (two-entry key cache)
greater:
        lda ka
        cmp tag0
        bne :+
        lda #0
        beq @ha
:       cmp tag1
        bne :+
        lda #16
        bne @ha
:       lda kb                  ; load ka into the entry not holding kb
        cmp tag0
        beq @ka1
        lda ka
        sta tag0
        ldx #0
        jsr loadkey
        lda #0
        beq @ha
@ka1:   lda ka
        sta tag1
        ldx #16
        jsr loadkey
        lda #16
@ha:    sta offa
        lda kb
        cmp tag0
        bne :+
        lda #0
        beq @hb
:       cmp tag1
        bne :+
        lda #16
        bne @hb
:       lda offa
        bne @kb0
        lda kb
        sta tag1
        ldx #16
        jsr loadkey
        lda #16
        bne @hb
@kb0:   lda kb
        sta tag0
        ldx #0
        jsr loadkey
        lda #0
@hb:    sta offb
        ldx offa
        ldy offb
        lda #16
        sta cnt
@cl:    lda keys,x
        cmp keys,y
        bne @diff
        inx
        iny
        dec cnt
        bne @cl
        clc
        rts
@diff:  php
        lda desc
        beq @asc
        ldx offa                ; descending: invert unless an empty cell
        lda keys,x
        cmp #$FF
        beq @asc
        ldx offb
        lda keys,x
        cmp #$FF
        beq @asc
        plp
        bcs @lt
        sec
        rts
@lt:    clc
        rts
@asc:   plp
        rts

; ---------------------------------------------------------------------------
; loadkey: 16-byte sort key of block row A into keys+X
;   class $10 number, $20 TRUE/FALSE/NA/ERROR, $30 text, $FF empty
loadkey:
        stx kout
        clc
        adc r1
        tay
        ldx keycol
        jsr CELLSLOT            ; -> SLOT
        ldx kout                ; clear the key
        ldy #16
        lda #0
@z:     sta keys,x
        inx
        dey
        bne @z
        lda SLOT
        ora SLOT+1
        bne :+
        jmp @empty
:       jsr kopen
        jsr kget                ; type byte
        bmi @num
        jsr kget                ; ---- text
        ldx kout
        cmp #$FF
        bne :+
        jmp @empty              ; "" counts as empty
:       pha
        lda #$30
        sta keys,x
        pla
        ldy #15
@tl:    inx
        and #$7F
        cmp #'a'
        bcc :+
        cmp #'z'+1
        bcs :+
        and #$DF                ; fold to upper case
:       sta keys,x
        dey
        beq @tdone
        stx kout2
        sty kcnt
        jsr kget
        ldx kout2
        ldy kcnt
        cmp #$FF
        bne @tl
@tdone: rts
@num:   jsr kget                ; ---- number: exponent/sign byte
        ldx kout
        cmp #$80
        bne :+
        lda #$20                ; ERROR/NA/FALSE/TRUE
        sta keys,x
        jsr kget
        ldx kout
        cmp #$80
        bcs @spx
        sta keys+1,x
@spx:   rts
:       cmp #$FE
        bcs @zero               ; no value stored -> 0
        sta expo
        lda #$10
        sta keys,x
        lda expo
        and #$40
        beq @pos
        lda expo                ; negative: reverse the order
        and #$3F
        eor #$7F
        sta keys+1,x
        lda #$FF
        ldy #6
@nf:    sta keys+2,x
        inx
        dey
        bne @nf
        ldx kout
        lda #$FF
        sta negmask
        jmp @dig
@pos:   lda expo
        and #$3F
        ora #$80
        sta keys+1,x
        lda #0
        sta negmask
@dig:   lda #6
        sta cnt
@dl:    stx kout2
        jsr kget
        ldx kout2
        cmp #$A0                ; stop at the first non-BCD byte
        bcs @ddone
        sta tmpb
        and #$0F
        cmp #$0A
        bcs @ddone
        lda tmpb
        eor negmask
        sta keys+2,x
        inx
        dec cnt
        bne @dl
@ddone: rts
@zero:  ldx kout
        lda #$10
        sta keys,x
        lda #$80
        sta keys+1,x
        rts
@empty: ldx kout
        lda #$FF
        sta keys,x
        rts

; stream reader over a slot chain:  kopen (slot in SLOT), kget -> A (N/Z set)
kopen:  jsr rdslot
        lda #2
        sta kpos
        rts
kget:   ldy kpos
        cpy #8
        bcc @have
        lda slotbuf             ; follow the link
        sta SLOT
        lda slotbuf+1
        sta SLOT+1
        ora SLOT
        bne :+
        lda #$FF                ; end of chain
        rts
:       jsr rdslot
        ldy #2
@have:  lda slotbuf,y
        iny
        sty kpos
        ora #0
        rts

rdslot: lda #7                  ; SLOT -> slotbuf
        jsr READSLOT
        ldy #7
@c:     lda SLOTDATA,y
        sta slotbuf,y
        dey
        bpl @c
        rts

; ===========================================================================
; renumber references inside formulas in the sorted rows
fixformulas:
        lda r1
        sta row
@rl:    lda #1
        sta col
@cl:    ldy row
        ldx col
        jsr CELLSLOT
        lda SLOT
        ora SLOT+1
        beq :+
        jsr fixcell
:       inc col
        lda col
        cmp MAXCOL
        beq @cl
        bcc @cl
        lda row
        cmp r2
        beq @done
        inc row
        jmp @rl
@done:  rts

fixcell:
        lda #0                  ; read the chain into sbuf, 6 bytes a slot
        sta nslots
        sta slen
@rd:    ldx nslots
        lda SLOT
        sta slotlo,x
        lda SLOT+1
        sta slothi,x
        jsr rdslot
        ldy #2
        ldx slen
@cpy:   lda slotbuf,y
        sta sbuf,x
        inx
        iny
        cpy #8
        bne @cpy
        stx slen
        inc nslots
        lda slotbuf
        sta SLOT
        lda slotbuf+1
        sta SLOT+1
        ora SLOT
        beq @gotall
        lda nslots
        cmp #42
        bcc @rd
        rts                     ; too long; leave it alone
@gotall:
        lda sbuf
        and #$40
        bne :+
        rts                     ; not a formula
:       ldx #1                  ; find the $FE that starts the tokens
@fe:    cpx slen
        bcc :+
        rts
:       lda sbuf,x
        cmp #$FF
        bne :+
        rts
:       cmp #$FE
        beq @tok0
        inx
        bne @fe
@tok0:  inx
        lda #0
        sta changed
@tok:   cpx slen
        bcc :+
        jmp @end
:       lda sbuf,x
        cmp #$FF
        bne :+
        jmp @end
:       cmp #$80
        bcs :+
        jmp @num
:       beq @spc
        cmp #$C0
        bcs @one
        lda sbuf+1,x            ; ---- cell reference
        sta rr1
        lda sbuf+2,x
        cmp #$EC
        bne @single
        lda sbuf+4,x            ; range: follow only same-row ranges
        cmp rr1
        bne @skip5
        lda rr1
        jsr inblock
        bcc @skip5
        lda rr1
        jsr newrow
        sta sbuf+1,x
        sta sbuf+4,x
        lda #1
        sta changed
@skip5: inx
        inx
        inx
        inx
        inx
        jmp @tok
@single:
        lda rr1
        jsr inblock
        bcc @skip2
        lda rr1
        jsr newrow
        sta sbuf+1,x
        lda #1
        sta changed
@skip2: inx
        inx
        jmp @tok
@spc:   inx
        inx
        jmp @tok
@one:   inx
        jmp @tok
@num:   inx                     ; exponent, then BCD digit bytes
@nd:    cpx slen
        bcs @end
        lda sbuf,x
        cmp #$A0
        bcc :+
        jmp @tok
:       and #$0F
        cmp #$0A
        bcc :+
        jmp @tok
:       inx
        jmp @nd
@end:   lda changed
        bne :+
        rts
:       lda #0                  ; write every slot back
        sta wsl
@wb:    ldx wsl
        cpx nslots
        bne :+
        rts
:       lda slotlo,x
        sta SLOT
        lda slothi,x
        sta SLOT+1
        lda #0                  ; link = next slot in the chain (or 0)
        sta SLOTDATA
        sta SLOTDATA+1
        inx
        cpx nslots
        beq :+
        lda slotlo,x
        sta SLOTDATA
        lda slothi,x
        sta SLOTDATA+1
:       dex
        txa                     ; payload offset = 6 * slot index
        asl a
        sta tmpb
        asl a
        clc
        adc tmpb
        tax
        ldy #2
@wc:    lda sbuf,x
        sta SLOTDATA,y
        inx
        iny
        cpy #8
        bne @wc
        lda #7
        jsr WRITESLOT
        inc wsl
        jmp @wb

; inblock: row A -> C=1 if r1 <= A <= r2
inblock:
        cmp r1
        bcc @no
        cmp r2
        beq @yes
        bcs @no
@yes:   sec
        rts
@no:    clc
        rts

; newrow: old row A (inside the block) -> new row
newrow: sec
        sbc r1
        tay
        lda inv,y
        clc
        adc r1
        rts

; ===========================================================================
        .segment "BSS"
r1:      .res 1
r2:      .res 1
c1:      .res 1
n:       .res 1
keycol:  .res 1
desc:    .res 1
ka:      .res 1
kb:      .res 1
tag0:    .res 1
tag1:    .res 1
offa:    .res 1
offb:    .res 1
cnt:     .res 1
kout:    .res 1
kout2:   .res 1
kcnt:    .res 1
kpos:    .res 1
expo:    .res 1
negmask: .res 1
tmpb:    .res 1
width:   .res 1
lo:      .res 1
mid:     .res 1
hi:      .res 1
mi:      .res 1
mj:      .res 1
mk:      .res 1
kk:      .res 1
row:     .res 1
col:     .res 1
nslots:  .res 1
slen:    .res 1
changed: .res 1
wsl:     .res 1
rr1:     .res 1
slotbuf: .res 8
keys:    .res 32
slotlo:  .res 42
slothi:  .res 42
idx:     .res 256
tmp:     .res 256
inv:     .res 256
sbuf:    .res 256
