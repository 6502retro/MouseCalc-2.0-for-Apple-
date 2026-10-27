# How it works — Mouse Calc internals

Notes from reverse-engineering Mouse Calc for this update. Addresses are for the English *Mouse Calc* `MOUSE.CALC` (60,240 bytes, SHA-1 `94c3a7eed4789c65931748e4736047069e44393c`); *Version Calc* 1.086 has the same code with its text moved (see [VERSION_CALC.md](VERSION_CALC.md)).

## Loading

`M.SYSTEM` (265 bytes) copies itself to `$0300` and reads `MOUSE.CALC` in six pieces:

| File offset | Length | Loaded to | Contents |
|---|---|---|---|
| `$0000` | `$2000` | `$2000`, then moved to aux `$2000` | start-up picture, aux half (double hi-res) |
| `$2000` | `$2000` | main `$2000` | start-up picture, main half |
| `$4000` | `$1828` | `$4FD8` (mover) → language card `$D000–$E7FF` | menus, strings, toolkit data |
| `$5828` | `$1028` | `$4FD8` (mover) → language card, other `$D000` bank | more toolkit code |
| `$6850` | `$1800` | `$0800–$1FFF` | mouse/graphics toolkit, 7×8 font at `$1C00` |
| `$8050` | `$6B00` | `$4000–$AAFF` | the spreadsheet |

Handy conversions: main program `offset = $8050 + (addr − $4000)`; language-card data `offset = addr − $8FD8`.

The whole screen is double hi-res; all text, including the menu bar, is drawn by the toolkit from the font at `$1C00` (glyph table at file offset `$7C50`, 8 bytes per character, upper case in slots `$00–$1F`).

## Toolkit

Calls are `JSR $0800` followed by `.byte command, .word parameters` (it switches in the auxiliary language card for the call). `$0803`/`$0806` turn the mouse interrupt off/on.

**Menus** — the menu bar is at `$E421`: count, reserved, then 10-byte entries *(id, flags, title pointer, item list pointer, 4 reserved)*. Each item list has a 4-byte header *(count, 3 reserved)* followed by 6-byte items *(options, mark, key 1, key 2, text pointer)*; a separator is `40 00 13 00 00 00`. Strings are length-prefixed. Text pointers may point into main memory (the new Info lines do).

**Dispatch** — the menu id (`$10` File, `$20` Edit, `$90` Print, `$30` Function, `$40` Format, `$50` Graph, `$60` Calculate, `$70` Link/Sort, `$80` Info) divided by 8 indexes the word table at `$477E`, which points at a per-menu array of *handler − 1* words, one per item (separators included). Function (`$30`) is special-cased (`$FFFF`).

## Resident routines used by the new code

| Address | What it does |
|---|---|
| `$4018` | grow the sheet to include column X, row Y (re-lays out the whole grid — slow) |
| `$401E` | store the text at `$BC5D` (high-bit, `$FF` end) in the current cell (`$85` col, `$84` row) |
| `$4021` | current cell → `$BC5C` flag (bit 7 = number) + text at `$BC5D` |
| `$4024` | parse the number at `$0200` (high-bit, `$FF` end) into the current cell |
| `$408F` | input a line into `$0200` (length in `$57`) |
| `$40AF` / `$4106` | read / write an 8-byte cell slot via the `$409B` buffer |
| `$732C` | cell lookup: X = column, Y = row → slot number in `$68/$69` |
| `$5C54` | Calculate now |
| `$0BCD` / `$0BD6` | cursor / redraw |
| `$7E26` | beep |
| `$899A` | load overlay A (table at `$898E`) into `$AC00` |
| `$8B41` | show a message (inline `.word` pointer to a high-bit, zero-ended string) |
| `$8C8B` | ProDOS error handler (A = error code) |
| `$938D` | `$0200` → ProDOS file name at `$9AD4` |
| `$9431` | create/open a file (type in `$93E4`), asks before replacing |
| `$95D9` | file window (type filter in `$8CBD`), opens the chosen file → ref in `$8BBF` |
| `$9640` | close `$8BBF` |

Zero page: `$7E`/`$7F` last used row/column; `$7906–$7909` selection; row map at `$BB1E` + row; column map at `$BC1C` + column.

**Overlays** load at `$AC00` (area up to `$B7FC`). Table at `$898E`: 0 `HELP/`, 1 `DIF.SEGMENT` (now `CSV.SEGMENT`), 2 `PRINTER/DEF`, 3 `FMT.SEGMENT`, 4 `PRINTER/`, 5 the file name buffer. The loader prepends the program folder path kept at `$8C12` (originally `$904F`).

**File box**: its folder path is at `$9A83`. Clicking the box's top bar (row 5) runs `$9529` — go up one folder, or at the top of a disk list all disks (`$9207`). The original had no label there; `uplabel.s` draws one.

## The patches

All in [patch/patch_mousecalc.py](../patch/patch_mousecalc.py); each one asserts the original bytes first.

| # | Where | What |
|---|---|---|
| 1 | `$9005` | key-disk check → `JSR $A9F7` + set the two "key found" flags, NOPs |
| 2 | 20 operands | program path buffer `$904F` → `$8C12`; old "Copy to Mouse Word" code at `$8C12–$8C8A` cleared |
| 3 | `$904F` | 31-byte Sort loader ([sortstub.s](../src/sortstub.s)); Link item 4 handler `$482E`; jump table `$8924`; menu text |
| 4 | `$96DC` → `$8C66` | file box drawing hook that prints "(Up a level)" ([uplabel.s](../src/uplabel.s)) |
| 5 | LC `$E3F9`, `$E711`; `$9B0C`; `$906E` | Info menu: *Updated by…* line (LC), *Copyright…* moved to the dead "Insert Mouse Word disk" message, *Version 2* after the Sort stub |
| 6 | LC `$E030`, `$E35A`, `$E36A`, `$E47D–$E73A`; `$4780–$484B`; `$8BCE`; `$99E1`, `$99FB` | menu bar and item lists rebuilt (Link → Sort, DIF items out, CSV items into File), handler arrays rebuilt, overlay 1 renamed, entry points → `$B000`/`$B003` |
| 7 | file `$0000–$3FFF` | start-up picture: *V: 2.0*, *Updated by 6502 Retro 2026*, menu bar *Sort* ([splash_patch.py](../patch/splash_patch.py)) |

## Tools

* `tools/woz.py` — WOZ 1/2 → 140K image (6-and-2 GCR decode with checksum).
* `tools/a2r2dsk.py` — early-format Applesauce **A2R** flux captures → 140K image (used for *Version Calc*).
* `tools/prodos.py`, `tools/mkprodos.py`, `tools/fsck.py` — read, build and check ProDOS volumes.
* `tools/asmdiff.py`, `tools/coverage.py` — disassemble two builds and compare them with addresses normalised, in both directions, so moved code isn't reported as changed.
