const M = require('./mclib.js'), fs = require('fs');
let bad = 0, nf = 0, nnum = 0;
for (const f of fs.readdirSync('samples')) {
  const b = new Uint8Array(fs.readFileSync('samples/' + f));
  const s = M.parseFile(b);
  const grid = {}; s.cells.forEach(c => grid[c.r + ',' + c.c] = c);
  const get = (r, c) => { const x = grid[r + ',' + c]; if (!x) return undefined; if (x.kind === 'text') return x.text; return x.value; };
  // 1) number round trip: encode(decode(bytes)) == bytes
  let p = M.HEADER_LEN + 2;
  for (const c of s.cells) {
    if (c.kind !== 'text') {
      nnum++;
      const enc = M.encodeNumber(typeof c.value === 'object' ? NaN : c.value);
      // locate raw bytes
    }
  }
  // 2) formulas: tokens re-emitted identical; evaluated value == cached
  for (const c of s.cells) {
    if (c.kind !== 'formula') continue; nf++;
    if (c.parseError) { console.log(f, M.cellName(c.r, c.c), 'PARSE', c.parseError); bad++; continue; }
    const re = M.formulaTokens(c.ast);
    const same = Buffer.from(re).equals(Buffer.from(c.tokens));
    const v = M.evaluate(c.ast, get, c);
    const cached = c.value;
    const ok = (typeof v === 'number' && typeof cached === 'number') ? Math.abs(v - cached) <= 2e-7 * Math.max(1, Math.abs(cached)) : JSON.stringify(v) === JSON.stringify(cached);
    if (!same || !ok) { bad++; console.log(f, M.cellName(c.r, c.c), c.mc, '| xl:', c.excel, '| eval', v, 'cached', cached, same ? '' : 'TOKENS DIFFER ' + Buffer.from(re).toString('hex') + ' vs ' + Buffer.from(c.tokens).toString('hex')); }
  }
}
console.log('formulas', nf, 'numbers', nnum, 'problems', bad);
