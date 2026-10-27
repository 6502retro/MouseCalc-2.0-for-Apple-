const M = require('./mclib.js'), I = require('./mcimport.js'), XLSX = require('xlsx'), fs = require('fs');
M.setTemplateHeader(new Uint8Array(fs.readFileSync('samples/SAMPLE.BILL')));
for (const src of ['all.xlsx', 'lo_out/all.xlsx'].filter(f => fs.existsSync(f))) {
  const wb = XLSX.read(fs.readFileSync(src), { cellFormula: true, cellNF: true, cellText: true, cellStyles: true });
  let mism = 0, total = 0, fmtDiff = 0, warns = 0;
  for (const name of wb.SheetNames) {
    const orig = M.parseFile(new Uint8Array(fs.readFileSync('samples/' + (fs.existsSync('samples/' + name) ? name : 'TEMPLATES_' + name))));
    const { sheet, warn } = I.fromWorksheet(wb.Sheets[name], XLSX); warns += warn.length; warn.slice(0, 3).forEach(w => console.log('  warn', name, w));
    const file = M.buildFile(sheet), back = M.parseFile(file);
    const O = {}; orig.cells.forEach(c => O[c.r + ',' + c.c] = c);
    const grid = {}; back.cells.forEach(c => grid[c.r + ',' + c.c] = c);
    const get = (r, c) => { const x = grid[r + ',' + c]; return x ? (x.kind === 'text' ? x.text : x.value) : undefined; };
    const cyc = M.circularCells(orig);
    for (const c of back.cells) {
      const o = O[c.r + ',' + c.c]; total++;
      if (!o) { mism++; console.log('  extra', name, M.cellName(c.r, c.c)); continue; }
      if (o.kind === 'text' && o.fmt === 1) continue;
      if (c.kind !== o.kind) { mism++; console.log('  kind', name, M.cellName(c.r, c.c), o.kind, c.kind); continue; }
      if (c.kind === 'formula') {
        const v = M.evaluate(c.ast, get, c);
        const ok = typeof v === 'number' && typeof o.value === 'number' ? Math.abs(v - o.value) <= 2e-7 * Math.max(1, Math.abs(o.value)) : JSON.stringify(v) === JSON.stringify(o.value);
        if (!ok && !cyc.has(c.r * 256 + c.c) && !['FMT3.bin'].includes(name)) { mism++; console.log('  value', name, M.cellName(c.r, c.c), o.mc, '->', c.mc, v, o.value); }
      } else if (c.kind === 'text' ? c.text !== o.text : JSON.stringify(c.value) !== JSON.stringify(o.value)) { mism++; console.log('  data', name, M.cellName(c.r, c.c)); }
      if (c.kind !== 'text' && c.fmt !== o.fmt && [2,5,6,7,8,9,10,11,12,13,14].includes(o.fmt)) { fmtDiff++; console.log('  fmt', name, M.cellName(c.r, c.c), o.fmt, c.fmt); }
    }
    const missing = orig.cells.filter(o => !grid[o.r + ',' + o.c] && !(o.kind === 'text' && o.text === ''));
    if (missing.length) { mism += missing.length; console.log('  missing', name, missing.map(o => M.cellName(o.r, o.c)).join(' ')); }
  }
  console.log(src, 'cells', total, 'mismatches', mism, 'number-format diffs', fmtDiff, 'warnings', warns);
}
