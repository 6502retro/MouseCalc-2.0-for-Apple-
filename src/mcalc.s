; MCALC.SYSTEM - launcher for the hard-drive Mouse Calc.
; Finds M.SYSTEM in <dir>/MOUSECALC/ or in <dir>/ itself, where <dir> is
; tried in this order:
;   1. the current prefix (DeskTop sets it to the folder holding MCALC.SYSTEM)
;   2. the path at $280 (and its parent)  - selectors / Bitsy Bye
;   3. the path at $380 (and its parent)
;   4. the root of the last-used volume
; Sets the prefix to that folder, loads M.SYSTEM at $2000 and runs it.
; If nothing is found, shows a message instead of quitting silently.

MLI     = $BF00
CAND    = $1800          ; candidate directory (length-prefixed)
WORK    = $1880          ; candidate + "MOUSECALC/"

        .org $1000
reloc:  ldy #0
:       lda $2000,y
        sta $1000,y
        lda $2100,y
        sta $1100,y
        lda $2200,y
        sta $1200,y
        iny
        bne :-
        jmp main

main:   cld
        ; 1. current prefix
        jsr MLI
        .byte $C7
        .word gpfx
        bcs c2
        lda CAND
        beq c2
        jsr try_dir
        bcc run
c2:     lda #<$0280
        ldx #>$0280
        jsr try_buf
        bcc run
        lda #<$0380
        ldx #>$0380
        jsr try_buf
        bcc run
        ; 4. root of last-used volume
        lda $BF30
        sta online+1
        jsr MLI
        .byte $C5
        .word online
        bcs fail
        lda CAND+1
        and #$0F
        beq fail
        tax
        inx
        stx CAND
        lda #'/'
        sta CAND+1
        jsr try_dir
        bcc run
fail:   jmp showerr

; ---- load M.SYSTEM (relative to the prefix just set) and run it
run:    jsr MLI
        .byte $C8
        .word open
        bcs fail
        lda open+5
        sta rd+1
        sta cl+1
        jsr MLI
        .byte $CA
        .word rd
        php
        jsr MLI
        .byte $CC
        .word cl
        plp
        bcs fail
        jmp $2000

; ---- try_buf: A/X -> path; copy to CAND, try it, then its parent
try_buf:
        sta $06
        stx $07
        ldy #0
        lda ($06),y
        beq @bad
        cmp #60
        bcs @bad
        tay
:       lda ($06),y
        and #$7F
        sta CAND,y
        dey
        bpl :-
        lda CAND+1
        cmp #'/'
        bne @bad
        jsr try_dir
        bcc @ok
        ; parent: drop trailing '/', then everything after the last '/'
        ldx CAND
        lda CAND,x
        cmp #'/'
        bne :+
        dex
:       cpx #2
        bcc @bad
        lda CAND,x
        cmp #'/'
        beq @cut
        dex
        bne :-
@bad:   sec
@ok:    rts
@cut:   stx CAND
        jmp try_dir

; ---- try_dir: CAND = directory. Tries CAND/MOUSECALC/ then CAND/.
; C clear (and prefix set) when M.SYSTEM is found.
try_dir:
        ldx CAND
        cpx #50
        bcs @bad
        lda CAND,x
        cmp #'/'
        beq :+
        inx
        lda #'/'
        sta CAND,x
        stx CAND
:       ldx CAND
:       lda CAND,x
        sta WORK,x
        dex
        bpl :-
        ldy #0
        ldx WORK
:       inx
        lda sub,y
        sta WORK,x
        iny
        cpy #10
        bne :-
        stx WORK
        lda #<WORK
        sta spfx+1
        lda #>WORK
        sta spfx+2
        jsr check
        bcc @ok
        lda #<CAND
        sta spfx+1
        lda #>CAND
        sta spfx+2
        jsr check
        bcc @ok
@bad:   sec
@ok:    rts

check:  jsr MLI
        .byte $C6
        .word spfx
        bcs :+
        jsr MLI
        .byte $C4
        .word gfi
:       rts

; ---- error screen
showerr:
        sta $C00C
        sta $C000
        sta $C051
        sta $C054
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
        sta $0400,x
        inx
        bne :-
:       ldx #0
:       lda msg2,x
        beq :+
        ora #$80
        sta $0480,x
        inx
        bne :-
:       ldx #0
:       lda msg3,x
        beq :+
        ora #$80
        sta $0500,x
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

gpfx:   .byte 1
        .word CAND
spfx:   .byte 1
        .word WORK
online: .byte 2,0
        .word CAND+1
gfi:    .byte 10
        .word msname
        .res 15,0
open:   .byte 3
        .word msname
        .word $0C00
        .byte 0
rd:     .byte 4,0
        .word $2000,$4000,0
cl:     .byte 1,0
quit:   .byte 4,0,0,0,0,0,0
msname: .byte 8,"M.SYSTEM"
sub:    .byte "MOUSECALC/"
msg1:   .byte "MOUSE CALC: CAN'T FIND M.SYSTEM.",0
msg2:   .byte "KEEP MCALC.SYSTEM NEXT TO THE MOUSECALC",0
msg3:   .byte "FOLDER.  PRESS A KEY TO RETURN.",0
