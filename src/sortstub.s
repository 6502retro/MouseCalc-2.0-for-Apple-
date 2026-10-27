; Sort loader, placed in Mouse Calc's old 45-byte prefix buffer at $904F
        .setcpu "6502"
.macro  histr str
        .repeat .strlen(str), I
        .byte .strat(str, I) | $80
        .endrep
.endmacro
LOADOVL  = $899A        ; A = overlay table index; loads file into $AC00
OVLENTRY = $8996        ; table entry 4 ("PRINTER/"); SORT.SEGMENT restores it
        .segment "CODE"
        lda #<name
        sta OVLENTRY
        lda #>name
        sta OVLENTRY+1
        lda #4
        jsr LOADOVL
        jmp $AC00
name:   .byte 12
        histr "SORT.SEGMENT"
