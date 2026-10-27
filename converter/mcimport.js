/* Convert a SheetJS worksheet into a Mouse Calc sheet model. */
(function (root) {
'use strict';
const M = (typeof module !== 'undefined') ? require('./mclib.js') : root.MCLib;
function fromWorksheet(ws, XLSX) {
  const warn = [], cells = [], widths = [];
  let skipped = 0, valuesOnly = 0, formulas = 0;
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue;
    const x = ws[addr], { r: r0, c: c0 } = XLSX.utils.decode_cell(addr), r = r0 + 1, c = c0 + 1;
    if (x.t === 'z' || (x.v === undefined && !x.f)) continue;
    if (r > M.MAX_ROW || c > M.MAX_COL) { skipped++; continue; }
    const here = M.cellName(r, c);
    const fmt0 = M.mcFormatFromExcel(x.z);
    const isDate = x.t === 'd' || (x.t === 'n' && fmt0 === null);
    const fmt = fmt0 === null ? 0 : fmt0;
    if (x.f) {
      try {
        if (x.t === 's') throw new Error('it produces text');
        const ast = M.parseExcel(x.f); M.checkRefs(ast);
        const value = x.t === 'b' ? !!x.v : x.t === 'e' ? { error: x.w === '#N/A' ? 'NA' : 'ERROR' } : (typeof x.v === 'number' ? x.v : 0);
        cells.push({ r, c, kind: 'formula', fmt, value, tokens: M.formulaTokens(ast) });
        formulas++;
        continue;
      } catch (e) {
        valuesOnly++;
        warn.push(here + ': formula =' + x.f + ' kept as its value (' + e.message + ')');
      }
    }
    if (isDate) { cells.push({ r, c, kind: 'text', fmt: 0, text: M.asciiFold(x.w ?? String(x.v)) }); continue; }
    if (x.t === 's' || x.t === 'str') { const t = M.asciiFold(x.v); if (t !== '') cells.push({ r, c, kind: 'text', fmt: 0, text: t }); if (String(x.v).length > 250) warn.push(here + ': text shortened to 250 characters'); continue; }
    if (x.t === 'b') { cells.push({ r, c, kind: 'number', fmt, value: !!x.v }); continue; }
    if (x.t === 'e') { cells.push({ r, c, kind: 'number', fmt, value: { error: x.w === '#N/A' ? 'NA' : 'ERROR' } }); continue; }
    if (typeof x.v === 'number') cells.push({ r, c, kind: 'number', fmt, value: x.v });
  }
  for (const [i, col] of (ws['!cols'] || []).entries()) {
    if (!col || i + 1 > M.MAX_COL) continue;
    const w = col.width ?? col.wch ?? (col.wpx ? col.wpx / 7 : null);
    if (w) widths[i + 1] = Math.max(1, Math.min(70, Math.round(w)));
  }
  if (skipped) warn.push(skipped + ' cell(s) outside Mouse Calc\'s ' + M.colName(M.MAX_COL) + M.MAX_ROW + ' grid were left out');
  return { sheet: { cells, widths }, warn, stats: { cells: cells.length, formulas, valuesOnly, skipped } };
}
const api = { fromWorksheet };
if (typeof module !== 'undefined') module.exports = api; else root.MCImport = api;
})(this);
