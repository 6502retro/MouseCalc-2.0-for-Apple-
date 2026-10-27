; M.SYSTEM replacement prologue for Mouse Calc (hard-drive version)
; Makes sure the ProDOS prefix is the folder holding MOUSE.CALC before
; running Version Soft's original loader (copied to $0300 as before).
; Order tried: current prefix, $280 (and its parent), $380 parent.
; If MOUSE.CALC still can't be found, shows a message and QUITs instead
; of jumping into garbage.

MLI     = $BF00
PFXBUF  = $1E00          ; 64+ byte work buffer for the prefix
SCREEN  = $0400

        .org $2000
start:
        cld
        ; 1. current prefix
        jsr try_cur
        bcc ok
        ; 2. $280 as a folder, then its parent folder
        lda #<$0280
        ldx #>$0280
        jsr try_path
        bcc ok
        ; 3. $380 (Bitsy Bye / A2D: path of the program itself)
        lda #<$0380
        ldx #>$0380
        jsr try_path
        bcc ok
        jmp fail

ok:     ; copy the original Version Soft loader to $0300 and run it
        ldy #0
:       lda body,y
        sta $0300,y
        iny
        bne :-
        jmp $0300

; ---- try_cur: C clear if MOUSE.CALC visible with current prefix
try_cur:
        jsr MLI
        .byte $C4
        .word gfi
        rts

; ---- try_path: A/X -> length-prefixed pathname. Tries it as prefix,
; then with the last component stripped. C clear on success.
try_path:
        sta $06
        stx $07
        ldy #0
        lda ($06),y
        beq bad
        cmp #64
        bcs bad
        tax                     ; X = length
        iny
        lda ($06),y
        and #$7F
        cmp #'/'
        bne bad                 ; must be a full path
        ; copy to PFXBUF
        txa
        tay
:       lda ($06),y
        and #$7F
        sta PFXBUF,y
        dey
        bpl :-
        jsr setpfx
        bcs strip
        jsr try_cur
        bcc good
strip:  ; drop trailing '/' then last component
        ldx PFXBUF
        lda PFXBUF,x
        cmp #'/'
        bne :+
        dex
:       cpx #1
        bcc bad
        lda PFXBUF,x
        cmp #'/'
        beq cut
        dex
        bne :-
        beq bad
cut:    cpx #2
        bcc bad                 ; would leave just "/"
        stx PFXBUF              ; keep trailing '/'
        jsr setpfx
        bcs bad
        jsr try_cur
        bcc good
bad:    sec
good:   rts

setpfx: jsr MLI
        .byte $C6
        .word spfx
        rts

; ---- failure: text screen message, wait for key, QUIT
fail:
        sta $C00C               ; 40 columns
        sta $C000               ; 80STORE off
        sta $C051               ; text
        sta $C054               ; page 1
        ldy #0
        lda #$A0
:       sta $0400,y
        sta $0500,y
        sta $0600,y
        sta $0700,y
        iny
        bne :-
        ldx #0
:       lda msg1,x
        beq :+
        ora #$80
        sta $0400+40*0+$00,x   ; line 0 (row base $0400)
        inx
        bne :-
:       ; line 2 = $0500
        ldx #0
:       lda msg2,x
        beq :+
        ora #$80
        sta $0500,x
        inx
        bne :-
:       ; line 4 = $0600
        jsr MLI
        .byte $C7
        .word gpfx
        ldx #0
@pl:    cpx PFXBUF
        bcs @done
        cpx #39
        bcs @done
        lda PFXBUF+1,x
        ora #$80
        sta $0600,x
        inx
        bne @pl
@done:  ldx #0
:       lda msg3,x
        beq :+
        ora #$80
        sta $0700,x
        inx
        bne :-
:       sta $C010
:       lda $C000
        bpl :-
        sta $C010
        jsr MLI
        .byte $65
        .word quit
        brk

gfi:    .byte 10
        .word name
        .res 15,0
name:   .byte 10,"MOUSE.CALC"
spfx:   .byte 1
        .word PFXBUF
gpfx:   .byte 1
        .word PFXBUF
quit:   .byte 4,0,0,0,0,0,0

msg1:   .byte "MOUSE CALC: CAN'T FIND MOUSE.CALC IN",0
msg2:   .byte "THE SAME FOLDER AS M.SYSTEM. PREFIX IS:",0
msg3:   .byte "PRESS A KEY TO RETURN.",0

body:   .incbin "msys_body.bin"
