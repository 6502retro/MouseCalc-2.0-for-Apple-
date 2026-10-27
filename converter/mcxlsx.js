/* Minimal XLSX + CSV writer for Mouse Calc sheets (no dependencies). */
(function (root) {
'use strict';
const M = (typeof module !== 'undefined') ? require('./mclib.js') : root.MCLib;

// ---- store-only ZIP
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = s => new TextEncoder().encode(s);
function zip(files) {
  const parts = [], central = []; let off = 0;
  const now = new Date(), dtime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1),
        ddate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  for (const [name, data] of files) {
    const nb = enc(name), crc = crc32(data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint16(10, dtime, true); h.setUint16(12, ddate, true); h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true); h.setUint16(28, 0, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true);
    c.setUint16(12, dtime, true); c.setUint16(14, ddate, true); c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true);
    c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const csize = central.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
  e.setUint32(12, csize, true); e.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(e.buffer)], out = new Uint8Array(all.reduce((s, x) => s + x.length, 0));
  let p = 0; for (const x of all) { out.set(x, p); p += x.length; } return out;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const numStr = v => String(v);

function sheetName(n, used) {
  let s = String(n).replace(/[\[\]:*?\/\\]/g, '_').slice(0, 31) || 'Sheet';
  let t = s, i = 2; while (used.has(t.toUpperCase())) t = s.slice(0, 28) + '_' + (i++); used.add(t.toUpperCase()); return t;
}

function workbook(sheets) {   // sheets: [{name, sheet}]
  const fmts = [], fmtId = {}, xfs = [{ num: 0, align: null }], xfKey = { '0|': 0 };
  const style = (code, isText) => {
    let num = 0, align = null;
    const z = M.excelNumFmt(code);
    if (z && !isText) { if (!(z in fmtId)) { fmtId[z] = 164 + fmts.length; fmts.push(z); } num = fmtId[z]; }
    if (code === 3) align = 'left'; else if (code === 4) align = 'right'; else if (code === 15) align = 'center'; else if (code === 1) align = 'fill';
    const k = num + '|' + (align || '');
    if (!(k in xfKey)) { xfKey[k] = xfs.length; xfs.push({ num, align }); }
    return xfKey[k];
  };
  const used = new Set(), sheetXml = [], names = [];
  const circular = sheets.some(({ sheet }) => M.circularCells(sheet).size > 0);
  for (const { name, sheet } of sheets) {
    names.push(sheetName(name, used));
    const rows = new Map();
    for (const c of sheet.cells) { if (!rows.has(c.r)) rows.set(c.r, []); rows.get(c.r).push(c); }
    let maxC = 1, maxR = 1; sheet.cells.forEach(c => { maxC = Math.max(maxC, c.c); maxR = Math.max(maxR, c.r); });
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:' + M.cellName(maxR, maxC) + '"/>';
    x += '<sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>';
    const lastW = Math.max(maxC, ...Object.keys(sheet.widths || {}).map(Number).filter(c => sheet.widths[c] !== M.DEFAULT_WIDTH));
    x += '<cols>'; for (let c = 1; c <= Math.min(lastW, M.MAX_COL); c++) x += '<col min="' + c + '" max="' + c + '" width="' + ((sheet.widths && sheet.widths[c]) || M.DEFAULT_WIDTH) + '" customWidth="1"/>'; x += '</cols>';
    x += '<sheetData>';
    for (const r of [...rows.keys()].sort((a, b) => a - b)) {
      x += '<row r="' + r + '">';
      for (const c of rows.get(r).sort((a, b) => a.c - b.c)) {
        const ref = M.cellName(c.r, c.c), width = (sheet.widths && sheet.widths[c.c]) || M.DEFAULT_WIDTH;
        if (c.kind === 'text') {
          if (c.text === '' ) continue;
          const s = style(c.fmt, true);
          x += '<c r="' + ref + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + esc(c.text) + '</t></is></c>';
          continue;
        }
        const s = style(c.fmt, false), sa = s ? ' s="' + s + '"' : '';
        const v = c.value, f = c.kind === 'formula' && c.excel ? '<f>' + esc(c.excel) + '</f>' : '';
        if (typeof v === 'boolean') x += '<c r="' + ref + '" t="b"' + sa + '>' + f + '<v>' + (v ? 1 : 0) + '</v></c>';
        else if (v && typeof v === 'object') x += '<c r="' + ref + '" t="e"' + sa + '>' + f + '<v>' + (v.error === 'NA' ? '#N/A' : '#VALUE!') + '</v></c>';
        else x += '<c r="' + ref + '"' + sa + '>' + f + '<v>' + numStr(v) + '</v></c>';
      }
      x += '</row>';
    }
    x += '</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>';
    sheetXml.push(x);
  }
  let st = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">';
  if (fmts.length) st += '<numFmts count="' + fmts.length + '">' + fmts.map((z, i) => '<numFmt numFmtId="' + (164 + i) + '" formatCode="' + esc(z) + '"/>').join('') + '</numFmts>';
  st += '<fonts count="1"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>';
  st += '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>';
  st += '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>';
  st += '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>';
  st += '<cellXfs count="' + xfs.length + '">' + xfs.map(s => '<xf numFmtId="' + s.num + '" fontId="0" fillId="0" borderId="0" xfId="0"' + (s.num ? ' applyNumberFormat="1"' : '') + (s.align ? ' applyAlignment="1"><alignment horizontal="' + s.align + '"/></xf>' : '/>')).join('') + '</cellXfs>';
  st += '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    sheetXml.map((_, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
  const wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>' +
    names.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets><calcPr calcId="0" fullCalcOnLoad="1"' + (circular ? ' iterate="1" iterateCount="1"' : '') + '/></workbook>';
  const wbrels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    names.map((_, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
    '<Relationship Id="rId' + (names.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const files = [['[Content_Types].xml', enc(ct)], ['_rels/.rels', enc(rels)], ['xl/workbook.xml', enc(wb)], ['xl/_rels/workbook.xml.rels', enc(wbrels)], ['xl/styles.xml', enc(st)]];
  sheetXml.forEach((x, i) => files.push(['xl/worksheets/sheet' + (i + 1) + '.xml', enc(x)]));
  return zip(files);
}

function csv(sheet, opts = {}) {
  let maxR = 0, maxC = 0; sheet.cells.forEach(c => { maxR = Math.max(maxR, c.r); maxC = Math.max(maxC, c.c); });
  const grid = Array.from({ length: maxR }, () => Array(maxC).fill(''));
  for (const c of sheet.cells) {
    let v;
    if (c.kind === 'text') v = c.fmt === 1 && c.text ? c.text.repeat(Math.max(1, Math.floor(((sheet.widths && sheet.widths[c.c]) || 11) / c.text.length))) : c.text;
    else if (opts.formulas && c.kind === 'formula' && c.excel) v = '=' + c.excel;
    else if (typeof c.value === 'boolean') v = c.value ? 'TRUE' : 'FALSE';
    else if (c.value && typeof c.value === 'object') v = c.value.error === 'NA' ? '#N/A' : '#VALUE!';
    else v = String(+(+c.value).toPrecision(12));
    grid[c.r - 1][c.c - 1] = v;
  }
  return grid.map(row => row.map(v => /[",\n\r]/.test(v) || /^\s|\s$/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v).join(',')).join('\r\n') + '\r\n';
}

const api = { workbook, csv, zip, crc32 };
if (typeof module !== 'undefined') module.exports = api; else root.MCXlsx = api;
})(this);
