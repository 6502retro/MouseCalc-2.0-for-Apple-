# Mouse Calc converter (PC side)

A single offline web page that moves spreadsheets between a PC and Mouse Calc:

* **Apple II → PC** — drop a disk image (`.po`, `.2mg`, `.hdv`, `.dsk`, `.woz`) or a Mouse Calc file copied off a disk, pick a sheet, save as **Excel (.xlsx)** with live formulas, or as CSV. "All sheets in one workbook" puts every sheet on the disk in one file.
* **PC → Apple II** — drop an `.xlsx`/`.csv`, get a Mouse Calc file, or have it written straight into a disk image.

Everything runs in the browser; nothing is uploaded. It understands Mouse Calc's file format completely (numbers, text, formulas, formats, column widths). Formulas are translated both ways — Mouse Calc evaluates strictly left to right (`2+3*4` is 20), so brackets are added on export to keep every result identical, and Excel functions without a Mouse Calc equivalent are kept as values with a warning.

The page is complementary to the new **CSV import/export** inside Mouse Calc: CSV moves values, the converter also keeps formulas and formatting.

## Building

`python3 build.py` (in the repository root) builds `out/mouse-calc-converter.html`, embedding the sample sheets from your samples disk; they serve as examples and as the template for the Mouse Calc file header. Manually:

```sh
python3 converter/build_page.py SAMPLES_DIR out.html
```

The page loads [SheetJS](https://sheetjs.com/) 0.18.5 from cdnjs for `.xlsx` support.

## Files

| File | |
|---|---|
| `mclib.js` | Mouse Calc file format: parse/build sheets, number encoding, formula tokens ↔ Excel, formula evaluator; ProDOS / WOZ disk image reader and writer |
| `mcxlsx.js` | Mouse Calc sheet → SheetJS workbook (formats, widths, formulas) |
| `mcimport.js` | SheetJS worksheet → Mouse Calc sheet |
| `page_template.html` | the page; `build_page.py` inlines the three libraries |
| `test/` | Node tests: byte-exact round trips of every sample sheet, formula evaluation against Mouse Calc's results, xlsx round trip (also through LibreOffice when installed), disk image write/read-back |

## Tests

```sh
cd converter && npm install && cd ..
python3 build.py             # provides build/samples and the disk images the tests use
sh converter/test/run.sh
```
