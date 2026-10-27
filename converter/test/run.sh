#!/bin/sh
# Run the converter tests. Needs: python3 build.py done first (for build/samples
# and out/MouseCalc_HDD.2mg), Node.js, and "npm install" in converter/.
set -e
here=$(cd "$(dirname "$0")" && pwd); top="$here/../.."
work="$here/work"; rm -rf "$work"; mkdir -p "$work"
cp "$here"/../mclib.js "$here"/../mcxlsx.js "$here"/../mcimport.js "$work"/
cp -r "$top/build/samples" "$work/samples"
cp "$top/out/MouseCalc_HDD.2mg" "$work/hdd.2mg"
samp=$(ls "$top"/originals/*[Ss]ampl*.woz 2>/dev/null | head -1); [ -n "$samp" ] && cp "$samp" "$work/samples.woz"
cp "$top/build/original_program.dsk" "$work/prog.dsk"
cp "$here/fixtures/budget.xlsx" "$work/"
export NODE_PATH="$here/../node_modules"
cd "$work"
for t in "$here"/test*.js; do
  cp "$t" .; echo "== $(basename "$t")"
  case "$(basename "$t")" in test4.js)        # LibreOffice round trip, if installed
    command -v soffice >/dev/null && soffice --headless --convert-to xlsx --outdir lo_out all.xlsx >/dev/null 2>&1 || true;;
  esac
  node "$(basename "$t")"
done
echo "all converter tests ran"
