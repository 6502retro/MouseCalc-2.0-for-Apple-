# 6502 sources (ca65)

| File | Builds | Loaded at | Purpose |
|---|---|---|---|
| `sort.s` + `sort.cfg` | `SORT.SEGMENT` | `$AC00` overlay | Sort rows A-Z / Z-A |
| `sortstub.s` + `sortstub.cfg` | patched into `MOUSE.CALC` at `$904F` | | loads SORT.SEGMENT with Mouse Calc's overlay loader |
| `csv.s` + `csv.cfg` | `CSV.SEGMENT` | `$AC00` overlay, code at `$B000` | CSV import (`$B000`) / export (`$B003`) |
| `uplabel.s` | patched into `MOUSE.CALC` at `$8C66` | | draws "(Up a level)" on the file box |
| `msys.s` + `msys.cfg` | `M.SYSTEM` | `$2000` | finds its own folder, then runs Version Soft's original loader (`msys_body.bin`, taken from your disk by build.py) |
| `mcalc.s` | `MCALC.SYSTEM` | `$2000` → `$1000` | launcher that finds `MOUSECALC/` next to itself |

All of it uses only original 6502 instructions. See [docs/INTERNALS.md](../docs/INTERNALS.md) for the Mouse Calc routines they call.
