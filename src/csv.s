; CSV.SEGMENT - CSV import/export overlay for Mouse Calc (6502 Retro 2026)
; Loaded at $AC00 by Mouse Calc's overlay loader (table entry 1, which was
; DIF.SEGMENT). $AC00-$AFFF are buffers; code starts at $B000.
;   $B000  import (File > Import CSV file)   - called after the sheet is cleared
;   $B003  export (File > Export CSV file)
; Uses Mouse Calc's own routines (the ones DIF.SEGMENT used):
;   $4018 grow sheet to cell X=col,Y=row  $4021 get cell ($85,$84) as text
;   $401E store text ($BC5C/$BC5D)        $4024 store number parsed from $0200
;   $408F input line ($0200, len $57)     $938D input -> filename $9AD4
;   $9431 create/open (type $93E4)        $95D9 file picker + open ($8CBD filter)
;   $9640 close $8BBF                     $8B41 message (inline .word)
;   $8C8B ProDOS error handler (A=error)
; RFC 4180: comma separated, CRLF line ends, text in double quotes ("" for a
; quote), numbers plain. Import also takes ; or TAB separated files, CR/LF/CRLF,
; quoted newlines, a UTF-8 byte-order mark, and Apple high-bit text.

.macro hstr str
        .repeat .strlen(str), i
        .byte .strat(str, i) | $80
        .endrepeat
        .byte 0
.endmacro

MLI     = $BF00
REF     = $8BBF
CELLF   = $BC5C                 ; cell flag: bit7 = number
CELLT   = $BC5D                 ; cell text, high bit set, end $7F/$FF
INBUF   = $0200
RBUF    = $AC00                 ; read buffer (256)
WBUF    = $AD00                 ; write buffer (256)
FBUF    = $AE00                 ; field buffer (low ASCII)
MAXCOL  = 63
MAXROW  = 254
MAXFLD  = 240

        .segment "BUF"
        .res $B000-$AC00, 0
        .segment "CODE"
        .org $B000
        jmp import
        jmp export

; ===================================================================
; EXPORT
; ===================================================================
export:
        jsr $8B41
        .word m_name
        jsr $408F               ; type the file name
        jsr $938D               ; -> $9AD4 (ProDOS-safe, max 15)
        ; add ".CSV" when the name has no extension and there is room
        ldy $9AD4
        beq @ext_done
        ldx #0
@scan:  lda $9AD5,x
        and #$7F
        cmp #'.'
        beq @ext_done
        inx
        cpx $9AD4
        bne @scan
        cpy #12
        bcs @ext_done
        ldx #0
@app:   lda dotcsv,x
        sta $9AD5,y
        iny
        inx
        cpx #4
        bne @app
        sty $9AD4
@ext_done:
        lda #$04                ; TXT
        sta $93E4
        jsr $9431               ; create/open (asks before replacing)
        lda #0
        sta wlen
        lda #1
        sta row
@rowlp: lda row
        cmp $7E
        beq :+
        bcs @done
:       lda #1
        sta col
@collp: lda col
        cmp $7F
        beq :+
        bcs @eol
:       cmp #2
        bcc :+
        lda #','
        jsr putc
:       jsr putcell
        inc col
        bne @collp
@eol:   lda #13
        jsr putc
        lda #10
        jsr putc
        inc row
        bne @rowlp
@done:  jsr flush
        jmp $9640               ; close, back to Mouse Calc

; write the current cell (col,row)
putcell:
        ldx col
        stx $85
        ldy row
        sty $84
        jsr $4021
        lda #$FF
        cmp CELLF
        beq @empty
        cmp CELLT
        bne @full
        lda CELLF
        and #$3F
        bne @full
@empty: rts
@full:  bit CELLF
        bpl @text
        ; number: plain digits; add a 0 before a bare decimal point
        ldy #0
        lda CELLT
        and #$7F
        cmp #'-'
        bne :+
        jsr putc
        ldy #1
:       lda CELLT,y
        and #$7F
        cmp #'.'
        bne @num
        lda #'0'
        jsr putc
@num:   lda CELLT,y
        and #$7F
        cmp #$7F
        beq @nd
        cmp #' '
        beq :+
        jsr putc
:       iny
        bne @num
@nd:    rts
@text:  lda #'"'
        jsr putc
        ldy #0
@tl:    lda CELLT,y
        and #$7F
        cmp #$7F
        beq @te
        cmp #'"'
        bne :+
        jsr putc                ; "" for a quote
        lda #'"'
:       jsr putc
        iny
        bne @tl
@te:    lda #'"'
        jmp putc

putc:   stx savx
        sty savy
        ldx wlen
        sta WBUF,x
        inx
        stx wlen
        bne :+
        jsr flush256
:       ldx savx
        ldy savy
        rts
flush:  lda wlen
        beq @r
        sta wcnt
        lda #0
        sta wcnt+1
        jsr dowrite
        lda #0
        sta wlen
@r:     rts
flush256:
        lda #0
        sta wcnt
        lda #1
        sta wcnt+1
        ; fall through
dowrite:
        lda REF
        sta wref
        jsr MLI
        .byte $CB
        .word wparm
        beq :+
        jmp $8C8B
:       rts

; ===================================================================
; IMPORT
; ===================================================================
import:
        lda #$04                ; list text (TXT) files and folders
        sta $8CBD
        jsr $95D9               ; pick + open -> REF
        lda REF
        sta rref
        sta mref
        lda #0
        sta trunc
        sta first
        sta maxr
        sta maxc
        sta pass
        lda #','
        sta delim
        jsr runpass             ; pass 1: just measure the sheet
        lda maxr
        beq @fin                ; nothing to import
        ; size the sheet once (Mouse Calc re-lays out its whole grid on every
        ; resize, so growing it cell by cell takes minutes on a big file)
        ldx maxc
        stx $85
        ldy maxr
        sty $84
        jsr $4018
        jsr MLI                 ; back to the start of the file
        .byte $CE
        .word mparm
        beq :+
        jmp $8C8B
:       inc pass                ; pass 2: store the cells
        jsr runpass
@fin:   jsr $9640
        lda trunc
        beq :+
        jsr $8B41
        .word m_trunc
        ldx #12                 ; leave it up ~2 s before Mouse Calc redraws
@w:     lda #$FF
        jsr $FCA8
        dex
        bne @w
:       rts

runpass:
        lda #1
        sta row
        sta col
        lda #0
        sta flen
        sta state
        sta quoted
        sta skiplf
        lda bom
        sta skipn
@chunk: jsr readchunk
        bcs @eof
        lda first
        bne @go
        inc first
        jsr sniff
        lda skipn
        sta bom
@go:    ldx #0
@byte:  cpx rcnt
        beq @chunk
        lda RBUF,x
        stx bx
        jsr feed
        ldx bx
        inx
        bne @byte
        beq @chunk
@eof:   lda flen                ; last line without a line end
        ora quoted
        bne :+
        lda col
        cmp #2
        bcc @r
:       jsr endfield
@r:     rts

readchunk:
        jsr MLI
        .byte $CA
        .word rparm
        beq :+
        cmp #$4C                ; end of file
        beq @e
        jmp $8C8B
:       lda rgot
        sta rcnt                ; 1..255
        clc
        rts
@e:     sec
        rts

; look at the first chunk: separator, UTF-8 BOM, Apple high-bit text
sniff:  ldx #0
        stx ncomma
        stx nsemi
        stx ntab
        stx nhigh
        stx nlow
@lp:    cpx rcnt
        beq @dec
        lda RBUF,x
        cmp #$A0
        bcc :+
        inc nhigh
:       and #$7F
        cmp #' '
        bcc :+
        cmp #$7F
        bcs :+
        lda RBUF,x
        bmi :+
        inc nlow
:       lda RBUF,x
        and #$7F
        ldy seenl
        bne @nx
        cmp #13
        beq @nl
        cmp #10
        beq @nl
        cmp #','
        bne :+
        inc ncomma
:       cmp #';'
        bne :+
        inc nsemi
:       cmp #9
        bne @nx
        inc ntab
        jmp @nx
@nl:    inc seenl
@nx:    inx
        bne @lp
@dec:   lda nhigh               ; mostly high-bit bytes: Apple text
        cmp nlow
        bcc :+
        beq :+
        lda #1
        sta hibit
:       lda nsemi
        cmp ncomma
        bcc :+
        beq :+
        cmp ntab
        bcc :+
        lda #';'
        sta delim
:       lda ntab
        cmp ncomma
        bcc :+
        beq :+
        cmp nsemi
        bcc :+
        beq :+
        lda #9
        sta delim
:       lda RBUF                ; UTF-8 byte order mark
        cmp #$EF
        bne :+
        lda RBUF+1
        cmp #$BB
        bne :+
        lda #3
        sta skipn
:       rts

; one input byte in A
feed:   ldy skipn
        beq :+
        dec skipn
        rts
:       ldy hibit
        beq :+
        and #$7F
:       cmp #$80
        bcc @asc
        cmp #$C0
        bcc @ret                ; UTF-8 continuation byte: drop
        lda #'?'                ; non-ASCII character
@asc:   cmp #10
        bne :+
        ldy skiplf
        beq @nl
        lda #0
        sta skiplf
@ret:   rts
:       ldy #0
        sty skiplf
        cmp #13
        bne @notcr
        inc skiplf
@nl:    lda state
        cmp #1
        bne :+
        lda #' '                ; line break inside quotes -> space
        jmp addch
:       jsr endfield
        jmp endrow
@notcr: ldy state
        cpy #1
        beq @inq
        cpy #2
        beq @qseen
        ; state 0: unquoted / start of field
        cmp delim
        bne :+
        jmp endfield
:       cmp #'"'
        bne @plain
        ldy flen
        bne @plain
        ldy quoted
        bne @plain
        lda #1
        sta state
        sta quoted
        rts
@plain: cmp #9
        bne :+
        lda #' '
:       cmp #' '
        bcc @ret
        jmp addch
@inq:   cmp #'"'
        bne @plain
        lda #2
        sta state
        rts
@qseen: cmp #'"'
        bne :+
        lda #1
        sta state
        lda #'"'
        jmp addch
:       ldy #0
        sty state
        cmp delim
        bne @plain
        jmp endfield

addch:  ldy flen
        cpy #MAXFLD
        bcs :+
        sta FBUF,y
        inc flen
:       rts

endrow: inc row
        bne :+
        dec row
:       lda #1
        sta col
        rts

; store the finished field at (col,row), then move right
endfield:
        lda #0
        sta state
        lda flen
        beq @next
        lda row
        cmp #MAXROW+1
        bcs @over
        lda col
        cmp #MAXCOL+1
        bcs @over
        lda pass
        bne @st
        lda row                 ; pass 1: remember the extents
        cmp maxr
        bcc :+
        sta maxr
:       lda col
        cmp maxc
        bcc @next
        sta maxc
        bcs @next
@st:    jsr store
        jmp @next
@over:  lda #1
        sta trunc
@next:  lda #0
        sta flen
        sta quoted
        inc col
        bne :+
        dec col
:       rts

store:  ldx col
        stx $85
        ldy row
        sty $84
        lda quoted
        bne @text
        jsr isnum
        bcc @text
        ; number -> $0200 (high bit, $FF end) -> $4024
        ldx #0
        ldy nstart
@cp:    cpy nend
        beq @cpe
        lda FBUF,y
        cmp #','
        bne :+
        lda #'.'                ; 12,5 in ; files
:       cmp #'e'
        bne :+
        lda #'E'                ; Mouse Calc only reads upper-case E
:       ora #$80
        sta INBUF,x
        inx
        iny
        bne @cp
@cpe:   lda #$FF
        sta INBUF,x
        jmp $4024
@text:  ldy #0
@tc:    cpy flen
        beq @tce
        lda FBUF,y
        ora #$80
        sta CELLT,y
        iny
        bne @tc
@tce:   lda #$FF
        sta CELLT,y
        lda #0
        sta CELLF
        jmp $401E

; is FBUF[0..flen) a number?  C=1 yes, with nstart/nend (spaces and a
; leading + trimmed). Accepts -1  .5  12.  1.5E-3  and 12,5 when ; separated
isnum:  jmp @start
@no0:   clc
        rts
@start: ldy #0
@sp:    cpy flen
        beq @no0
        lda FBUF,y
        cmp #' '
        bne :+
        iny
        bne @sp
:       ldx flen
@tr:    lda FBUF-1,x
        cmp #' '
        bne :+
        dex
        bne @tr
:       stx nend
        lda FBUF,y
        cmp #'+'
        bne :+
        iny
:       sty nstart
        lda FBUF,y
        cmp #'-'
        bne :+
        iny
:       lda #0
        sta ndig
        sta ndot
@m:     cpy nend
        beq @ok
        lda FBUF,y
        cmp #'0'
        bcc @nd
        cmp #'9'+1
        bcs @nd
        inc ndig
        iny
        bne @m
@nd:    cmp #'.'
        beq @dot
        cmp #','
        bne @exp
        ldx delim
        cpx #';'
        bne @no
@dot:   lda ndot
        bne @no
        inc ndot
        iny
        bne @m
@exp:   cmp #'E'
        beq :+
        cmp #'e'
        bne @no
:       lda ndig
        beq @no
        iny
        cpy nend
        beq @no
        lda FBUF,y
        cmp #'+'
        beq :+
        cmp #'-'
        bne @ed
:       iny
@ed:    ldx #0
@el:    cpy nend
        beq @ee
        lda FBUF,y
        cmp #'0'
        bcc @no
        cmp #'9'+1
        bcs @no
        inx
        iny
        bne @el
@ee:    cpx #0
        beq @no
        sec
        rts
@ok:    lda ndig
        beq @no
        lda nend                ; keep it short enough for the parser
        sec
        sbc nstart
        cmp #30
        bcs @no
        sec
        rts
@no:    clc
        rts

; ------------------------------------------------------------------
wparm:  .byte 4
wref:   .byte 0
        .word WBUF
wcnt:   .word 0
        .word 0
rparm:  .byte 4
rref:   .byte 0
        .word RBUF
        .word 255
rgot:   .word 0
mparm:  .byte 2
mref:   .byte 0
        .byte 0,0,0
maxr:   .byte 0
maxc:   .byte 0
pass:   .byte 0
bom:    .byte 0

row:    .byte 0
col:    .byte 0
wlen:   .byte 0
savx:   .byte 0
savy:   .byte 0
rcnt:   .byte 0
bx:     .byte 0
flen:   .byte 0
state:  .byte 0
quoted: .byte 0
skiplf: .byte 0
skipn:  .byte 0
trunc:  .byte 0
first:  .byte 0
delim:  .byte 0
hibit:  .byte 0
seenl:  .byte 0
ncomma: .byte 0
nsemi:  .byte 0
ntab:   .byte 0
nhigh:  .byte 0
nlow:   .byte 0
nstart: .byte 0
nend:   .byte 0
ndig:   .byte 0
ndot:   .byte 0

dotcsv: .byte $AE,$C3,$D3,$D6            ; ".CSV" (high bit, as $938D makes)
m_name: hstr "CSV file name: "
m_trunc: hstr "Only 63 columns x 254 rows were read"
