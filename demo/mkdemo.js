// mkdemo.js MCLIB SAMPLE.BILL OUT - writes SORT.DEMO, a small sheet for trying
// Sort rows (mixed upper/lower case names, a negative, a blank, text in a
// number column, row formulas and summary formulas below the data).
const [, , mclibPath, billPath, outPath] = process.argv;
const M = require(require('path').resolve(mclibPath)), fs = require('fs');
M.setTemplateHeader(new Uint8Array(fs.readFileSync(billPath)));   // file header layout from a real sheet
const cells = [];
const T = (r, c, text) => cells.push({ r, c, kind: 'text', fmt: 0, text });
const N = (r, c, v, fmt = 0) => cells.push({ r, c, kind: 'number', fmt, value: v });
const F = (r, c, f, v) => cells.push({ r, c, kind: 'formula', fmt: 0, value: v, tokens: M.formulaTokens(M.parseExcel(f)) });
['Name', 'Score', 'Bonus', 'Total', 'RowSum'].forEach((t, i) => T(1, i + 1, t));
const rows = [['delta', 12.5, 1], ['Alpha', -3, 2], ['charlie', 100, 3], ['bravo', 0, 4], ['Echo', 12.25, 5], ['foxtrot', null, 6], ['golf', 'n/a', 7]];
rows.forEach(([nm, sc, bo], i) => {
  const r = i + 2; T(r, 1, nm);
  if (typeof sc === 'number') N(r, 2, sc); else if (sc) T(r, 2, sc);
  N(r, 3, bo);
  const sv = typeof sc === 'number' ? sc : 0;
  F(r, 4, `B${r}+C${r}`, sv + bo); F(r, 5, `SUM(B${r}:C${r})`, sv + bo);
});
T(10, 1, 'Sum'); F(10, 4, 'SUM(D2:D8)', 0);
T(11, 1, 'First'); F(11, 2, 'B2', 12.5);
T(12, 1, 'Max'); F(12, 2, 'MAX(B2:B8)', 100);
fs.writeFileSync(outPath, M.buildFile({ widths: [], cells }));
