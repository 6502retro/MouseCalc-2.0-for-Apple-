# Testing in an emulator

Everything was tested by driving the [apple2js](https://github.com/whscullin/apple2js) emulator (enhanced IIe, SmartPort hard disk in slot 7) from Python with Playwright: mouse moves and clicks, typing, screenshots, and dumping the disk afterwards to check the files Mouse Calc wrote.

## Setup

```sh
git clone https://github.com/whscullin/apple2js.git
cd apple2js
git apply /path/to/mousecalc-v2/test/apple2js-expose.patch   # exposes the machine as window.__a2/__sp/__cpu
npm install && npm run build
python3 -m http.server 8765            # serve it (and your .po images) from this folder
pip install playwright && playwright install chromium
```

## Running a scenario

```sh
cp ../mousecalc-v2/out/MouseCalc_HDD.po test.po
python3 ../mousecalc-v2/test/drive.py "http://localhost:8765/apple2jse.html#http://localhost:8765/test.po" shots/run \
        ../mousecalc-v2/test/scenarios/sort_help_printer.json
```

A scenario is a JSON list of steps:

| Step | Meaning |
|---|---|
| `["wait", s]` | pause *s* seconds (the emulator runs at about real Apple II speed) |
| `["move", x, y, steps]`, `["down"]`, `["up"]`, `["click", x, y, wait]`, `["dbl", x, y]` | mouse, in page pixels |
| `["menu", x, y, wait]` | open the menu at *x*, release on the item at height *y* |
| `["menushot", x, y, name]` | the same, with a screenshot while the menu is open |
| `["type", "text"]`, `["key", "Enter"]`, `["oa", "KeyO"]`, `["metaclick"]` | keyboard; `oa` = Open-Apple + key |
| `["shot", name]` | screenshot to `<prefix>_<name>.png` |
| `["dump", file.po]` | save the hard disk image as it is now |
| `["dumpmem", file]`, `["trace_on"]`/`["trace_off", file]` | memory snapshot; per-address instruction histogram (used to find the slow grid re-layout) |

Note: the emulated mouse is not perfectly linear, so menu item heights in the scenarios were calibrated with `menushot`.

## Scenarios

| File | Checks |
|---|---|
| `sort_help_printer.json` | open `SORT.DEMO`, select rows, Sort by column B, SORT help page, *Set printer type* after a sort |
| `open_other_folder.json` | *(Up a level)*, open a sheet from another folder, Help still works afterwards |
| `csv_export_bill.json` | export `SAMPLE.BILL` to CSV, dump the disk |
| `csv_import_roundtrip.json` | import a CSV, export it again, dump — compare the two files |
| `csv_import_3000_cells.json` | import a 100 × 30 file, export, compare all 3,000 values |
| `desktop_launch_from_folder.json` | launch `MCALC.SYSTEM` from a sub-folder of an Apple II DeskTop disk |

`mkcsvimg.py HDD.po OUT.po` adds the CSV test files (Excel-style UTF-8 with quotes and line breaks, a European semicolon file, number edge cases, 3,000 cells, 66 columns) to `SAMPLES/`. Read files back from a dumped image with `tools/prodos.py`.
