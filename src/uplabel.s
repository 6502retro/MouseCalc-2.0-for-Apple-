; Draws "(Up a level)" on the Open/Save box's top bar, which Mouse Calc
; already treats as "go up one folder" (at a disk's top: list all disks).
; Hooked at the end of the box-drawing routine ($96DC). Lives in the spare
; tail of the relocated path buffer ($8C66-$8C8A).
        .org $8C66
        jsr $1A09          ; the call we replaced (draws last border char)
        lda $8AE7          ; nonzero = Help/printer list: no folder navigation
        bne done
        ldy #5             ; row 5 = top bar
        ldx #$17           ; column
        jsr $96E1          ; HTAB/VTAB
        jsr $8B64          ; print inline-addressed string
        .word str
done:   rts
str:    .byte "(Up a level)",0
