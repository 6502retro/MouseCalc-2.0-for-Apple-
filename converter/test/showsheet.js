const M=require('./mclib.js'),fs=require('fs');
const [img, name] = process.argv.slice(2);
const v=M.openImage('a.po',fs.readFileSync(img)); const e=v.walk().find(e=>e.path===name);
const s=M.parseFile(v.read(e)); console.log(name, 'size', e.eof, 'dims', s.maxRow, s.maxCol);
const g={}; s.cells.forEach(c=>g[c.r+','+c.c]=c);
for(let r=1;r<=s.maxRow;r++){let line=String(r).padStart(2)+' '; for(let c=1;c<=s.maxCol;c++){const x=g[r+','+c]; line+=(x?(x.kind==='text'?x.text:(x.mc?x.mc+'='+(+(+x.value).toPrecision(8)):String(x.value))):'.').slice(0,24).padEnd(25);} console.log(line);}
