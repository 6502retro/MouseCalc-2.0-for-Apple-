const M = require('./mclib.js'), fs = require('fs');
let fails = 0;
for (const f of fs.readdirSync('samples')) {
  const b = new Uint8Array(fs.readFileSync('samples/' + f));
  const s = M.parseFile(b);
  M.setTemplateHeader(s.header);
  const out = M.buildFile({ maxRow: s.maxRow, maxCol: s.maxCol, widths: s.widths, cells: s.cells.map(c => ({ ...c, tokens: c.tokens ? Array.from(c.tokens) : undefined })) });
  const A = Buffer.from(b.slice(M.HEADER_LEN)), B = Buffer.from(out.slice(M.HEADER_LEN));
  if (!A.equals(B)) {
    fails++;
    let i = 0; while (A[i] === B[i]) i++;
    console.log(f, 'differs at +' + (i + M.HEADER_LEN).toString(16), A.slice(i - 8, i + 12).toString('hex'), '|', B.slice(i - 8, i + 12).toString('hex'));
  } else console.log(f, 'identical', A.length);
}
// widths roundtrip
const pop = M.parseFile(new Uint8Array(fs.readFileSync('samples/TEMPLATES_POPULATION')));
console.log('POP widths', pop.widths.slice(1, 19).join(','));
console.log('fails', fails);
