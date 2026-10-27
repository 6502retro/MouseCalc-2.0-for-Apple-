const M = require('./mclib.js'), X = require('./mcxlsx.js'), fs = require('fs');
const sheets = [];
for (const f of fs.readdirSync('samples')) sheets.push({ name: f.replace('TEMPLATES_', ''), sheet: M.parseFile(new Uint8Array(fs.readFileSync('samples/' + f))) });
fs.writeFileSync('all.xlsx', X.workbook(sheets));
// expected values for comparison
const exp = {};
for (const { name, sheet } of sheets) { const cyc = M.circularCells(sheet); console.log(name, 'circular cells', cyc.size); for (const c of sheet.cells) if (c.kind === 'formula') exp[name.slice(0,31) + '!' + M.cellName(c.r, c.c)] = { v: c.value, f: c.excel, mc: c.mc, circ: cyc.has(c.r*256+c.c) }; }
fs.writeFileSync('expected.json', JSON.stringify(exp));
fs.writeFileSync('bill.csv', X.csv(sheets.find(s => s.name === 'SAMPLE.BILL').sheet, { formulas: true }));
console.log('ok', Object.keys(exp).length);
