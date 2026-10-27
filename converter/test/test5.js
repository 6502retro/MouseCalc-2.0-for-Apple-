const M = require('./mclib.js'), fs = require('fs');
// 1) WOZ read
const w = M.openImage('samples.woz', fs.readFileSync('samples.woz'));
console.log('WOZ volume', w.name, 'missing sectors', w.extra.missing, 'kind', w.kind);
const bill = w.walk().find(e => e.path === 'SAMPLE.BILL');
console.log('SAMPLE.BILL from WOZ identical:', Buffer.from(w.read(bill)).equals(fs.readFileSync('samples/SAMPLE.BILL')));
const mcFiles = w.walk().filter(e => e.type === 0xf8);
console.log('Mouse Calc files on WOZ:', mcFiles.map(e => e.path).join(', '));
// 2) write into 2mg (subfolder), dsk (root), po
const data = new Uint8Array(fs.readFileSync('samples/TEMPLATES_POPULATION'));   // 6808 bytes, sapling
for (const [fn, dirPath] of [['hdd.2mg', 'MOUSECALC/SAMPLES'], ['prog.dsk', ''], ['samples.woz', 'TEMPLATES']]) {
  const v = M.openImage(fn, fs.readFileSync(fn));
  const dirKey = dirPath ? v.walk().find(e => e.path === dirPath).key : 2;
  v.writeFile(dirKey, 'POP.COPY', data, 0xf8, 0, false);
  v.writeFile(dirKey, 'TINY', new Uint8Array(300).fill(0x41), 0xf8, 0, false);
  v.writeFile(dirKey, 'TINY', new Uint8Array(900).fill(0x42), 0xf8, 0, true);  // replace grows seedling->sapling
  const outName = 'out_' + fn.replace('.woz', '.po');
  fs.writeFileSync(outName, v.toBytes());
  const v2 = M.openImage(outName, fs.readFileSync(outName));
  const e = v2.walk().find(e => e.path === (dirPath ? dirPath + '/' : '') + 'POP.COPY');
  const t = v2.walk().find(e => e.path === (dirPath ? dirPath + '/' : '') + 'TINY');
  console.log(outName, 'reads back:', Buffer.from(v2.read(e)).equals(Buffer.from(data)), 'tiny', t.eof, v2.read(t)[899] === 0x42);
}
// many files into a subfolder to force a directory extension block
const v = M.openImage('hdd.2mg', fs.readFileSync('hdd.2mg'));
const dk = v.walk().find(e => e.path === 'MOUSECALC/SAMPLES').key;
for (let i = 0; i < 30; i++) v.writeFile(dk, 'F' + i, new Uint8Array(1000 + i), 0xf8, 0, false);
fs.writeFileSync('out_many.po', v.d);
const v3 = M.openImage('out_many.po', fs.readFileSync('out_many.po'));
const fsx = v3.walk().filter(e => /^MOUSECALC\/SAMPLES\/F\d+$/.test(e.path));
console.log('30 files written, read back', fsx.length, fsx.every(e => v3.read(e).length === 1000 + +e.name.slice(1)));
