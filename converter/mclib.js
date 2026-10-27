/* Mouse Calc (Version Soft, 1984) file format + ProDOS disk image library.
   Format reverse-engineered from Mouse Calc 1.1 samples and test files.
   All processing is local; no network. */
(function (root) {
'use strict';

// ---------------------------------------------------------------- constants
const HEADER_LEN = 0x883;          // program state block before the cell data
const WIDTHS_A = 0x29, WIDTHS_B = 0x68; // per-column widths (0xFF = default)
const DEFAULT_WIDTH = 11;
const POS_A = 0xa7;              // per-column screen x positions for the main window
const MAX_COL = 62, MAX_ROW = 254;
const FUNCS = {0xc1:'SUM',0xc2:'MIN',0xc3:'MAX',0xc4:'COUNT',0xc5:'AVERAGE',0xc6:'ABS',0xc7:'INT',
  0xca:'CHOOSE',0xcb:'LOOKUP',0xcc:'NOT',0xcd:'AND',0xce:'OR',0xcf:'IF',0xd0:'SQRT',0xd1:'EXP',
  0xd2:'LOG10',0xd3:'LN',0xd5:'ROUND',0xd6:'ROW',0xd7:'COLUMN',0xd8:'ERROR',0xd9:'NA',0xda:'TRUE',0xdb:'FALSE'};
const FUNC_CODE = {}; for (const k in FUNCS) FUNC_CODE[FUNCS[k]] = +k;
const OPS = {0xe0:'+',0xe1:'-',0xe2:'*',0xe3:'/',0xe4:'<',0xe5:'=',0xe6:'>',0xe7:'<=',0xe8:'>=',0xe9:'<>',0xea:'^'};
const OP_CODE = {}; for (const k in OPS) OP_CODE[OPS[k]] = +k;
const T_SEP = 0xeb, T_RANGE = 0xec, T_LP = 0xed, T_RP = 0xee, T_FORMULA = 0xfe, T_END = 0xff;
const SPECIAL = {0:'ERROR', 1:'NA', 3:'FALSE', 4:'TRUE'};
// type byte: 0x80 number, 0x40 formula, 0x30 protection, low nibble = display format
const FORMATS = {0:'normal',1:'fill',2:'XXXX',3:'left',4:'right',5:'X,XXX.XX',6:'$X,XXX',7:'X,XXX',
  8:'$X,XXX.XX',9:'1 decimal',10:'2 decimals',11:'3 decimals',12:'4 decimals',13:'5 decimals',14:'6 decimals',15:'center'};

// ---------------------------------------------------------------- helpers
function colName(c) { let s = ''; while (c > 0) { const m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = (c - 1 - m) / 26; } return s; }
function colNum(s) { let n = 0; for (const ch of s.toUpperCase()) n = n * 26 + ch.charCodeAt(0) - 64; return n; }
function cellName(r, c) { return colName(c) + r; }
const isBCD = b => (b >> 4) <= 9 && (b & 15) <= 9;

// ---------------------------------------------------------------- numbers
// value = 0.<BCD pairs> * 100^((e & 0x3F) - 0x1F); bit 0x40 = negative; trailing 00 pairs dropped.
// 0x80 <code> = special value (ERROR/NA/FALSE/TRUE).
function decodeNumber(b, p) {
  const e = b[p];
  if (e === 0x80) {
    let code = 0, len = 1;
    if (p + 1 < b.length && b[p + 1] < 0x80) { code = b[p + 1]; len = 2; }
    return { special: SPECIAL[code] || 'ERROR', code, len };
  }
  let q = p + 1, digits = '';
  while (q < b.length && isBCD(b[q])) { digits += (b[q] >> 4) + '' + (b[q] & 15); q++; }
  if (!digits) return { value: 0, len: q - p };
  const k = (e & 0x3f) - 0x1f;
  let v = Number('0.' + digits + 'e' + (2 * k));
  if (e & 0x40) v = -v;
  return { value: v, len: q - p };
}
function encodeNumber(v) {
  if (typeof v === 'boolean') return [0x80, v ? 4 : 3];
  if (!isFinite(v) || isNaN(v)) return [0x80];
  if (v === 0) return [0x00];
  const neg = v < 0; v = Math.abs(v);
  // up to 12 BCD digits; value = 0.D * 10^(E+1) with (E+1) even so digits pair into bytes
  const dig = sig => { const [m, ex] = v.toExponential(sig - 1).split('e'); return { D: m.replace('.', ''), E: +ex }; };
  let { D, E } = dig(12), k;
  if ((E + 1) % 2 === 0) k = (E + 1) / 2;
  else {
    const r = dig(11);                           // one digit is spent on the leading zero
    if ((r.E + 1) % 2 === 0) { D = r.D; k = (r.E + 1) / 2; }
    else { D = '0' + r.D; k = (r.E + 2) / 2; }
  }
  if (D.length % 2) D += '0';
  const out = [];
  for (let i = 0; i < D.length; i += 2) out.push(parseInt(D[i], 10) * 16 + parseInt(D[i + 1], 10));
  while (out.length && out[out.length - 1] === 0) out.pop();
  if (k + 0x1f < 0) return [0x00];
  if (k + 0x1f > 0x3f) return [0x80];
  return [(k + 0x1f) | (neg ? 0x40 : 0), ...out];
}

// ---------------------------------------------------------------- formula tokens -> AST
// Mouse Calc evaluates strictly left to right (no operator precedence), like VisiCalc.
function parseTokens(b) {
  let p = 0;
  const peek = () => b[p];
  function operand() {
    const t = peek();
    if (t === 0xe0) { p++; return { t: 'pos', x: operand() }; }
    if (t === 0xe1) { p++; return { t: 'neg', x: operand() }; }
    return primary();
  }
  function primary() {
    const t = b[p];
    if (t === undefined) throw new Error('unexpected end of formula');
    if (t < 0x80 || t === 0x80) {
      if (t === 0x80) { const n = decodeNumber(b, p); p += n.len; return { t: 'sp', name: n.special }; }
      const n = decodeNumber(b, p); p += n.len; return { t: 'num', v: n.value };
    }
    if (t > 0x80 && t < 0xc0) {
      const ref = { t: 'ref', c: t & 0x7f, r: b[p + 1] }; p += 2;
      if (peek() === T_RANGE) {
        p++; const t2 = b[p];
        if (!(t2 > 0x80 && t2 < 0xc0)) throw new Error('bad range');
        const ref2 = { t: 'ref', c: t2 & 0x7f, r: b[p + 1] }; p += 2;
        return { t: 'range', a: ref, b: ref2 };
      }
      return ref;
    }
    if (FUNCS[t]) {
      p++; const node = { t: 'fn', name: FUNCS[t], args: [], paren: false };
      if (peek() === T_LP) {
        p++; node.paren = true;
        if (peek() !== T_RP) { node.args.push(expr()); while (peek() === T_SEP) { p++; node.args.push(expr()); } }
        if (peek() !== T_RP) throw new Error('missing )'); p++;
      }
      return node;
    }
    if (t === T_LP) { p++; const x = expr(); if (peek() !== T_RP) throw new Error('missing )'); p++; return { t: 'paren', x }; }
    throw new Error('unknown token $' + t.toString(16));
  }
  function expr() {
    let l = operand();
    while (p < b.length && OPS[peek()]) { const op = OPS[b[p++]]; l = { t: 'bin', op, l, r: operand() }; }
    return l;
  }
  const ast = expr();
  if (p !== b.length) throw new Error('trailing tokens at ' + p);
  if (!(b[0] === 0xe0 || b[0] === 0xe1 || b[0] === T_LP)) ast.noLead = true;
  return ast;
}

// ---------------------------------------------------------------- AST -> text
function fmtNum(v) { let s = String(+v.toPrecision(12)); if (s.startsWith('0.')) s = s.slice(1); else if (s.startsWith('-0.')) s = '-' + s.slice(2); return s; }
function toMouseCalc(n, top = true) {   // display in Mouse Calc's own syntax
  const s = (() => { switch (n.t) {
    case 'num': return fmtNum(n.v);
    case 'sp': return n.name;
    case 'ref': return cellName(n.r, n.c);
    case 'range': return toMouseCalc(n.a, false) + '...' + toMouseCalc(n.b, false);
    case 'fn': return n.name + (n.paren ? '(' + n.args.map(a => toMouseCalc(a, false)).join(';') + ')' : '');
    case 'paren': return '(' + toMouseCalc(n.x, false) + ')';
    case 'pos': return '+' + toMouseCalc(n.x, false);
    case 'neg': return '-' + toMouseCalc(n.x, false);
    case 'bin': return toMouseCalc(n.l, false) + n.op + toMouseCalc(n.r, false);
  } })();
  if (top && !/^[+\-(]/.test(s)) return '+' + s;
  return s;
}
// Excel: wrap left operands that are binary ops so Excel's precedence gives the same
// left-to-right result Mouse Calc computes.
function toExcel(n) {
  switch (n.t) {
    case 'num': return String(+n.v.toPrecision(12));
    case 'sp': return { ERROR: '#VALUE!', NA: 'NA()', TRUE: 'TRUE', FALSE: 'FALSE' }[n.name];
    case 'ref': return cellName(n.r, n.c);
    case 'range': return cellName(n.a.r, n.a.c) + ':' + cellName(n.b.r, n.b.c);
    case 'paren': return '(' + toExcel(n.x) + ')';
    case 'pos': return toExcel(n.x);
    case 'neg': { const x = toExcel(n.x); return n.x.t === 'bin' ? '-(' + x + ')' : '-' + x; }
    case 'bin': {
      let l = toExcel(n.l);
      if (n.l.t === 'bin' || n.l.t === 'neg') l = '(' + l + ')';
      let r = toExcel(n.r);
      if (n.r.t === 'neg' || n.r.t === 'bin') r = '(' + r + ')';
      return l + n.op + r;
    }
    case 'fn': {
      const A = n.args;
      switch (n.name) {
        case 'ROW': case 'COLUMN': case 'NA': return n.name + '()';
        case 'ERROR': return '#VALUE!';
        case 'TRUE': case 'FALSE': return n.name;
        case 'INT': return 'TRUNC(' + A.map(toExcel).join(',') + ')';
        case 'CHOOSE':
          if (A.length === 2 && A[1].t === 'range') return 'INDEX(' + toExcel(A[1]) + ',' + toExcel(A[0]) + ')';
          return 'CHOOSE(' + A.map(toExcel).join(',') + ')';
        case 'LOOKUP':
          if (A.length === 2 && A[1].t === 'range') {
            const g = A[1], vertical = g.a.c === g.b.c;
            const sh = vertical ? { t: 'range', a: { t: 'ref', r: g.a.r, c: g.a.c + 1 }, b: { t: 'ref', r: g.b.r, c: g.b.c + 1 } }
                                : { t: 'range', a: { t: 'ref', r: g.a.r + 1, c: g.a.c }, b: { t: 'ref', r: g.b.r + 1, c: g.b.c } };
            return 'LOOKUP(' + toExcel(A[0]) + ',' + toExcel(g) + ',' + toExcel(sh) + ')';
          }
          return 'LOOKUP(' + A.map(toExcel).join(',') + ')';
        default: return n.name + '(' + A.map(toExcel).join(',') + ')';
      }
    }
  }
}

// ---------------------------------------------------------------- AST -> tokens
function emitTokens(n, out, atStart) {
  switch (n.t) {
    case 'num': out.push(...encodeNumber(n.v)); break;
    case 'sp': out.push(0x80, { ERROR: 0, NA: 1, FALSE: 3, TRUE: 4 }[n.name]); break;
    case 'ref': out.push(0x80 | n.c, n.r); break;
    case 'range': emitTokens(n.a, out); out.push(T_RANGE); emitTokens(n.b, out); break;
    case 'paren': out.push(T_LP); emitTokens(n.x, out, true); out.push(T_RP); break;
    case 'pos': case 'neg':
      if (atStart) { out.push(n.t === 'neg' ? 0xe1 : 0xe0); emitTokens(n.x, out, false); }
      else { out.push(T_LP); emitTokens(n, out, true); out.push(T_RP); }
      break;
    case 'bin':
      emitTokens(n.l, out, atStart);
      out.push(OP_CODE[n.op]);
      if (n.r.t === 'bin' || n.r.t === 'neg' || n.r.t === 'pos') { out.push(T_LP); emitTokens(n.r, out, true); out.push(T_RP); }
      else emitTokens(n.r, out, false);
      break;
    case 'fn':
      out.push(FUNC_CODE[n.name]);
      if (n.paren) { out.push(T_LP); n.args.forEach((a, i) => { if (i) out.push(T_SEP); emitTokens(a, out, true); }); out.push(T_RP); }
      break;
  }
  return out;
}
function formulaTokens(ast) {
  // Mouse Calc formulas begin with + - or (; supply a leading + when the leftmost operand has none
  let lm = ast; while (lm.t === 'bin') lm = lm.l;
  const out = [];
  if (!ast.noLead && !(lm.t === 'neg' || lm.t === 'pos' || lm.t === 'paren')) out.push(0xe0);
  emitTokens(ast, out, true);
  return out;
}

// ---------------------------------------------------------------- evaluator (Mouse Calc semantics)
function evaluate(ast, get, here) {
  const num = x => { if (typeof x === 'number') return x; throw 'ERR'; };
  const vals = n => n.t === 'range' ? rangeCells(n).map(([r, c]) => get(r, c)) : [ev(n)];
  const rangeCells = g => { const out = []; for (let c = Math.min(g.a.c, g.b.c); c <= Math.max(g.a.c, g.b.c); c++) for (let r = Math.min(g.a.r, g.b.r); r <= Math.max(g.a.r, g.b.r); r++) out.push([r, c]); return out; };
  function ev(n) {
    switch (n.t) {
      case 'num': return n.v;
      case 'sp': if (n.name === 'TRUE') return true; if (n.name === 'FALSE') return false; throw 'ERR';
      case 'ref': { const v = get(n.r, n.c); return v === undefined || v === null || typeof v === 'string' ? 0 : v; }
      case 'paren': case 'pos': return ev(n.x);
      case 'neg': return -num(ev(n.x));
      case 'bin': {
        const a = ev(n.l), b = ev(n.r);
        switch (n.op) {
          case '+': return num(a) + num(b); case '-': return num(a) - num(b);
          case '*': return num(a) * num(b); case '/': if (num(b) === 0) throw 'ERR'; return num(a) / num(b);
          case '^': return Math.pow(num(a), num(b));
          case '<': return num(a) < num(b); case '>': return num(a) > num(b); case '=': return num(a) === num(b);
          case '<=': return num(a) <= num(b); case '>=': return num(a) >= num(b); case '<>': return num(a) !== num(b);
        }
      }
      case 'fn': {
        const A = n.args, flat = () => A.flatMap(vals).filter(v => typeof v === 'number');
        switch (n.name) {
          case 'SUM': return flat().reduce((s, v) => s + v, 0);
          case 'MIN': return Math.min(...flat()); case 'MAX': return Math.max(...flat());
          case 'COUNT': return flat().length;
          case 'AVERAGE': { const f = flat(); return f.reduce((s, v) => s + v, 0) / f.length; }
          case 'ABS': return Math.abs(num(ev(A[0]))); case 'INT': return Math.trunc(num(ev(A[0])));
          case 'SQRT': return Math.sqrt(num(ev(A[0]))); case 'EXP': return Math.exp(num(ev(A[0])));
          case 'LN': return Math.log(num(ev(A[0]))); case 'LOG10': return Math.log10(num(ev(A[0])));
          case 'ROUND': { const f = Math.pow(10, num(ev(A[1]))); return Math.round(num(ev(A[0])) * f) / f; }
          case 'CHOOSE': { const i = Math.trunc(num(ev(A[0]))); const items = A.slice(1).flatMap(vals); if (i < 1 || i > items.length) throw 'ERR'; return items[i - 1] ?? 0; }
          case 'LOOKUP': {
            const x = num(ev(A[0])), g = A[1], cells = rangeCells(g), vertical = g.a.c === g.b.c;
            let hit = null; for (const [r, c] of cells) { const v = get(r, c); if (typeof v === 'number' && v <= x) hit = [r, c]; }
            if (!hit) throw 'ERR'; const v = vertical ? get(hit[0], hit[1] + 1) : get(hit[0] + 1, hit[1]); return v ?? 0;
          }
          case 'IF': return ev(A[0]) ? ev(A[1]) : ev(A[2]);
          case 'NOT': return !ev(A[0]); case 'AND': return A.every(a => ev(a)); case 'OR': return A.some(a => ev(a));
          case 'TRUE': return true; case 'FALSE': return false;
          case 'ROW': return here ? here.r : 0; case 'COLUMN': return here ? here.c : 0;
          default: throw 'ERR';
        }
      }
    }
    throw 'ERR';
  }
  try { return ev(ast); } catch (e) { return { error: 'ERROR' }; }
}

// ---------------------------------------------------------------- whole file
const textOf = b => Array.from(b, c => String.fromCharCode(c & 0x7f)).join('');
function parseFile(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < HEADER_LEN + 2) throw new Error('Too short to be a Mouse Calc file');
  const sheet = { maxRow: b[HEADER_LEN], maxCol: b[HEADER_LEN + 1], widths: [], cells: [], header: b.slice(0, HEADER_LEN) };
  for (let c = 1; c <= MAX_COL; c++) { const w = b[WIDTHS_A + c]; sheet.widths[c] = (w === 0xff || w === 0) ? DEFAULT_WIDTH : w; }
  let p = HEADER_LEN + 2;
  while (p < b.length) {
    if (p + 3 > b.length) throw new Error('Truncated cell record');
    const r = b[p], c = b[p + 1], type = b[p + 2]; let q = p + 3;
    while (q < b.length && b[q] !== T_END) q++;
    if (r < 1 || c < 1 || c > 0x3f) throw new Error('Bad cell record at offset ' + p);
    const body = b.slice(p + 3, q);
    const cell = { r, c, type, fmt: type & 15, prot: (type >> 4) & 3 };
    if (!(type & 0x80)) { cell.kind = 'text'; cell.text = textOf(body); }
    else {
      const fpos = body.indexOf(T_FORMULA);
      const valBytes = fpos < 0 ? body : body.slice(0, fpos);
      const n = valBytes.length ? decodeNumber(valBytes, 0) : { value: 0 };
      cell.value = n.special ? (n.special === 'TRUE' ? true : n.special === 'FALSE' ? false : { error: n.special }) : n.value;
      if (type & 0x40 && fpos >= 0) {
        cell.kind = 'formula'; cell.tokens = body.slice(fpos + 1);
        try { cell.ast = parseTokens(cell.tokens); cell.mc = toMouseCalc(cell.ast); cell.excel = toExcel(cell.ast); }
        catch (e) { cell.parseError = e.message; }
      } else cell.kind = 'number';
    }
    sheet.cells.push(cell);
    p = q + 1;
  }
  return sheet;
}
function looksLikeMouseCalc(b) {
  try { if (b.length < HEADER_LEN + 2) return false; const s = parseFile(b); return s.cells.length > 0 || b.length === HEADER_LEN + 2; } catch (e) { return false; }
}

// template header: a real Mouse Calc 1.1 sheet header (window state, cursor at A1)
let TEMPLATE_HEADER = null;
function setTemplateHeader(h) { TEMPLATE_HEADER = new Uint8Array(h.slice(0, HEADER_LEN)); }

function buildFile(sheet) {
  if (!TEMPLATE_HEADER) throw new Error('template header not set');
  const h = new Uint8Array(TEMPLATE_HEADER);
  for (let c = 1; c <= MAX_COL; c++) {
    const w = sheet.widths && sheet.widths[c];
    const v = (!w || w === DEFAULT_WIDTH) ? 0xff : Math.max(1, Math.min(70, Math.round(w)));
    h[WIDTHS_A + c] = v; h[WIDTHS_B + c] = v;
  }
  // on-screen x position of each visible column (window starts at column A, x=3, screen is 80 wide)
  let x = 3;
  for (let c = 1; c <= MAX_COL; c++) {
    const w = (sheet.widths && sheet.widths[c]) || DEFAULT_WIDTH;
    if (x !== null && x + w <= 0x4f) { h[POS_A + c] = x; x += w; } else { h[POS_A + c] = 0xff; x = null; }
  }
  const cells = sheet.cells.filter(x => x.r >= 1 && x.r <= MAX_ROW && x.c >= 1 && x.c <= MAX_COL)
    .sort((a, b) => a.c - b.c || a.r - b.r);
  let maxR = Math.min(sheet.maxRow || 0, MAX_ROW), maxC = Math.min(sheet.maxCol || 0, MAX_COL); cells.forEach(x => { maxR = Math.max(maxR, x.r); maxC = Math.max(maxC, x.c); });
  const out = [...h, maxR, maxC];
  for (const x of cells) {
    const fmt = (x.fmt || 0) & 15, prot = ((x.prot || 0) & 3) << 4;
    if (x.kind === 'text') {
      out.push(x.r, x.c, fmt | prot);
      for (const ch of asciiFold(x.text).slice(0, 250)) out.push(ch.charCodeAt(0) | 0x80);
    } else if (x.kind === 'formula') {
      out.push(x.r, x.c, 0xc0 | fmt | prot, ...cachedBytes(x.value), T_FORMULA, ...x.tokens);
    } else {
      out.push(x.r, x.c, 0x80 | fmt | prot, ...cachedBytes(x.value));
    }
    out.push(T_END);
  }
  return new Uint8Array(out);
}
function cachedBytes(v) {
  if (v && typeof v === 'object') return v.error === 'NA' ? [0x80, 1] : [0x80];
  if (typeof v === 'boolean') return encodeNumber(v);
  return encodeNumber(typeof v === 'number' ? v : 0);
}
function asciiFold(s) {
  s = String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...')
    .replace(/[\r\n\t]+/g, ' ');
  return s.replace(/[^\x20-\x7e]/g, '?');
}

// ---------------------------------------------------------------- Excel formula -> AST
function parseExcel(src) {
  let s = src.trim(); if (s.startsWith('=')) s = s.slice(1);
  const toks = []; let i = 0;
  const re = { ws: /^\s+/, num: /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?%?/i, err: /^#(N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!)/i,
    ref: /^\$?([A-Za-z]{1,3})\$?(\d+)(?::\$?([A-Za-z]{1,3})\$?(\d+))?(?![\w(])/, name: /^[A-Za-z_][A-Za-z0-9_.]*/, op: /^(<=|>=|<>|[-+*\/^<>=&(),;:%])/, str: /^"(?:[^"]|"")*"/ };
  while (i < s.length) {
    const rest = s.slice(i); let m;
    if ((m = rest.match(re.ws))) { i += m[0].length; continue; }
    if ((m = rest.match(re.str))) throw new Error('text strings are not supported');
    if (rest[0] === "'" || /^[A-Za-z0-9_ ]+!/.test(rest)) throw new Error('references to other sheets are not supported');
    if ((m = rest.match(re.err))) { toks.push({ k: 'err', v: m[1].toUpperCase() }); i += m[0].length; continue; }
    if ((m = rest.match(re.num))) { let v = parseFloat(m[1] + (m[2] || '')); if (m[0].endsWith('%')) v /= 100; toks.push({ k: 'num', v }); i += m[0].length; continue; }
    if ((m = rest.match(re.ref))) {
      const a = { t: 'ref', c: colNum(m[1]), r: +m[2] };
      toks.push(m[3] ? { k: 'range', v: { t: 'range', a, b: { t: 'ref', c: colNum(m[3]), r: +m[4] } } } : { k: 'ref', v: a });
      i += m[0].length; continue;
    }
    if ((m = rest.match(re.name))) { toks.push({ k: 'name', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    if ((m = rest.match(re.op))) { toks.push({ k: 'op', v: m[0] }); i += m[0].length; continue; }
    throw new Error('cannot read formula near "' + rest.slice(0, 10) + '"');
  }
  let p = 0;
  const pk = () => toks[p], isOp = v => pk() && pk().k === 'op' && pk().v === v;
  const PREC = { '=': 1, '<>': 1, '<': 1, '>': 1, '<=': 1, '>=': 1, '&': 2, '+': 3, '-': 3, '*': 4, '/': 4, '^': 5 };
  function binary(minPrec) {
    let l = unary();
    while (pk() && pk().k === 'op' && PREC[pk().v] >= minPrec) {
      const op = toks[p++].v; if (op === '&') throw new Error('text joining (&) is not supported');
      const r = binary(PREC[op] + 1); l = { t: 'bin', op, l, r };
    }
    return l;
  }
  function unary() {
    if (isOp('-')) { p++; return { t: 'neg', x: unary() }; }
    if (isOp('+')) { p++; return unary(); }
    let x = primary();
    while (isOp('%')) { p++; x = { t: 'bin', op: '/', l: x, r: { t: 'num', v: 100 } }; }
    return x;
  }
  function primary() {
    const t = toks[p++]; if (!t) throw new Error('formula ends early');
    if (t.k === 'num') return { t: 'num', v: t.v };
    if (t.k === 'ref' || t.k === 'range') return t.v;
    if (t.k === 'err') return { t: 'sp', name: t.v === 'N/A' ? 'NA' : 'ERROR' };
    if (t.k === 'op' && t.v === '(') { const x = binary(1); if (!isOp(')')) throw new Error('missing )'); p++; return { t: 'paren', x }; }
    if (t.k === 'name') {
      if ((t.v === 'TRUE' || t.v === 'FALSE') && !isOp('(')) return { t: 'sp', name: t.v };
      if (!isOp('(')) throw new Error('named ranges (' + t.v + ') are not supported');
      p++; const args = [];
      if (!isOp(')')) { args.push(binary(1)); while (isOp(',') || isOp(';')) { p++; args.push(binary(1)); } }
      if (!isOp(')')) throw new Error('missing )'); p++;
      return excelFunc(t.v, args);
    }
    throw new Error('unexpected "' + t.v + '"');
  }
  const ast = binary(1);
  if (p !== toks.length) throw new Error('unexpected "' + toks[p].v + '"');
  return ast;
}
function excelFunc(name, args) {
  const same = ['SUM', 'MIN', 'MAX', 'COUNT', 'AVERAGE', 'ABS', 'NOT', 'AND', 'OR', 'IF', 'SQRT', 'EXP', 'LOG10', 'LN', 'ROUND', 'CHOOSE'];
  name = name.replace(/^_XLFN\./, '');
  if (same.includes(name)) {
    if (name === 'IF' && args.length === 2) args.push({ t: 'sp', name: 'FALSE' });
    if (name === 'ROUND' && args.length === 1) args.push({ t: 'num', v: 0 });
    return { t: 'fn', name, args, paren: true };
  }
  if (name === 'TRUNC' && args.length === 1) return { t: 'fn', name: 'INT', args, paren: true };
  if (name === 'INT') throw new Error("Excel's INT rounds negatives down but Mouse Calc's INT cuts toward zero; use TRUNC() in Excel for a live formula");
  if (name === 'TRUE' || name === 'FALSE') return { t: 'sp', name };
  if (name === 'NA') return { t: 'sp', name: 'NA' };
  if ((name === 'ROW' || name === 'COLUMN') && args.length === 0) return { t: 'fn', name, args: [], paren: false };
  if (name === 'INDEX' && args.length === 2 && args[0].t === 'range') return { t: 'fn', name: 'CHOOSE', args: [args[1], args[0]], paren: true };
  if (name === 'LOOKUP' && args.length === 3 && args[1].t === 'range' && args[2].t === 'range') {
    const a = args[1], b = args[2];
    const vert = a.a.c === a.b.c && b.a.c === a.a.c + 1 && b.b.c === a.b.c + 1 && b.a.r === a.a.r && b.b.r === a.b.r;
    const horz = a.a.r === a.b.r && b.a.r === a.a.r + 1 && b.b.r === a.b.r + 1 && b.a.c === a.a.c && b.b.c === a.b.c;
    if (vert || horz) return { t: 'fn', name: 'LOOKUP', args: [args[0], a], paren: true };
    throw new Error('LOOKUP needs the result column right next to the search column');
  }
  throw new Error(name + '() is not available in Mouse Calc');
}
function checkRefs(ast) {
  const walk = n => {
    if (!n) return;
    if (n.t === 'ref' && (n.c < 1 || n.c > MAX_COL || n.r < 1 || n.r > MAX_ROW)) throw new Error('reference ' + cellName(n.r, n.c) + ' is outside Mouse Calc\'s ' + colName(MAX_COL) + MAX_ROW + ' grid');
    ['x', 'l', 'r', 'a', 'b'].forEach(k => n[k] && walk(n[k])); (n.args || []).forEach(walk);
  };
  walk(ast);
}

// number format <-> Mouse Calc format code
function excelNumFmt(code) {
  return { 2: '0', 5: '#,##0.00', 6: '"$"#,##0', 7: '#,##0', 8: '"$"#,##0.00', 9: '0.0', 10: '0.00', 11: '0.000', 12: '0.0000', 13: '0.00000', 14: '0.000000' }[code] || null;
}
function mcFormatFromExcel(z) {
  if (!z || z === 'General') return 0;
  const s = z.replace(/\[[^\]]*\]/g, '').replace(/\\/g, '').replace(/"/g, '').split(';')[0];
  if (/[ymdhs]/i.test(s.replace(/\$/g, ''))) return null;           // date/time: caller uses formatted text
  if (s.includes('%')) return 0;
  const dollar = s.includes('$'), comma = s.includes(','), m = s.match(/\.(0+)/), d = m ? m[1].length : 0;
  if (dollar) return d ? 8 : 6;
  if (comma) return d ? 5 : 7;
  if (d >= 1 && d <= 6) return 8 + d;
  if (/^0+$/.test(s.trim())) return 2;
  return 0;
}

// ---------------------------------------------------------------- disk images
const D2P = [0, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 15];   // ProDOS sector -> DOS-order sector
function dosToProdos(d) { const o = new Uint8Array(d.length); for (let t = 0; t < d.length / 4096; t++) for (let p = 0; p < 16; p++) o.set(d.subarray((t * 16 + D2P[p]) * 256, (t * 16 + D2P[p] + 1) * 256), (t * 16 + p) * 256); return o; }
function prodosToDos(d) { const o = new Uint8Array(d.length); for (let t = 0; t < d.length / 4096; t++) for (let p = 0; p < 16; p++) o.set(d.subarray((t * 16 + p) * 256, (t * 16 + p + 1) * 256), (t * 16 + D2P[p]) * 256); return o; }
function validVolume(po) {
  if (po.length < 3 * 512) return false;
  const v = po.subarray(1024, 1536);
  return (v[4] >> 4) === 0xf && v[0x23] === 0x27 && v[0x24] === 0x0d && (v[4] & 15) > 0;
}
function wozToProdos(d) {
  const u32 = o => d[o] | d[o + 1] << 8 | d[o + 2] << 16 | (d[o + 3] << 24 >>> 0);
  const sig = String.fromCharCode(...d.subarray(0, 4));
  if (sig !== 'WOZ1' && sig !== 'WOZ2') throw new Error('not a WOZ file');
  let p = 12, tmap = null, trks = null;
  while (p + 8 <= d.length) { const id = String.fromCharCode(...d.subarray(p, p + 4)), sz = u32(p + 4); if (id === 'TMAP') tmap = p + 8; if (id === 'TRKS') trks = p + 8; p += 8 + sz; }
  if (tmap === null || trks === null) throw new Error('WOZ file is missing track data');
  const WR = [0x96,0x97,0x9a,0x9b,0x9d,0x9e,0x9f,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xcb,0xcd,0xce,0xcf,0xd3,0xd6,0xd7,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,0xe5,0xe6,0xe7,0xe9,0xea,0xeb,0xec,0xed,0xee,0xef,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff];
  const INV = new Int16Array(256).fill(-1); WR.forEach((v, i) => INV[v] = i);
  const phys = new Uint8Array(35 * 16 * 256); let missing = 0;
  for (let t = 0; t < 35; t++) {
    const idx = d[tmap + t * 4]; if (idx === 0xff) { missing += 16; continue; }
    let bitsBytes, nbits;
    if (sig === 'WOZ2') { const o = trks + idx * 8; const sb = d[o] | d[o + 1] << 8, bc = d[o + 2] | d[o + 3] << 8; nbits = u32(o + 4); bitsBytes = d.subarray(sb * 512, sb * 512 + bc * 512); }
    else { const o = trks + idx * 6656; bitsBytes = d.subarray(o, o + 6646); nbits = d[o + 6648] | d[o + 6649] << 8; }
    const n = []; let v = 0;
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < nbits; i++) { v = (v << 1) | ((bitsBytes[i >> 3] >> (7 - (i & 7))) & 1); if (v & 0x80) { n.push(v); v = 0; } }
    const got = new Set();
    for (let i = 0; i < n.length - 420; i++) {
      if (n[i] !== 0xd5 || n[i + 1] !== 0xaa || n[i + 2] !== 0x96) continue;
      const dec = (a, b) => ((a << 1) | 1) & b, s = dec(n[i + 7], n[i + 8]);
      if (got.has(s) || s > 15) continue;
      let j = i + 11; while (j < i + 80 && !(n[j] === 0xd5 && n[j + 1] === 0xaa && n[j + 2] === 0xad)) j++;
      if (j >= i + 80) continue; j += 3;
      const vals = []; let ok = true; for (let k = 0; k < 343; k++) { const x = INV[n[j + k]]; if (x < 0) { ok = false; break; } vals.push(x); }
      if (!ok) continue;
      let x = 0; const buf = []; for (let k = 0; k < 342; k++) { x ^= vals[k]; buf.push(x); }
      if (x !== vals[342]) continue;
      const sec = new Uint8Array(256);
      for (let k = 0; k < 256; k++) { const a = buf[k % 86] >> (2 * Math.floor(k / 86)); sec[k] = ((buf[86 + k] << 2) | ((a & 1) << 1) | ((a >> 1) & 1)) & 0xff; }
      phys.set(sec, (t * 16 + s) * 256); got.add(s);
    }
    missing += 16 - got.size;
  }
  // physical sector order -> ProDOS block order
  const P = [0, 2, 4, 6, 8, 10, 12, 14, 1, 3, 5, 7, 9, 11, 13, 15];
  const po = new Uint8Array(phys.length);
  for (let t = 0; t < 35; t++) for (let i = 0; i < 16; i++) po.set(phys.subarray((t * 16 + P[i]) * 256, (t * 16 + P[i] + 1) * 256), (t * 16 + i) * 256);
  return { po, missing };
}
function openImage(name, bytes) {
  const d = new Uint8Array(bytes), lower = name.toLowerCase();
  let kind, po, extra = {};
  if (d.length >= 64 && String.fromCharCode(...d.subarray(0, 4)) === '2IMG') {
    const u32 = o => d[o] | d[o + 1] << 8 | d[o + 2] << 16 | (d[o + 3] << 24 >>> 0);
    const fmt = u32(0x0c), off = u32(0x18), len = u32(0x1c) || (d.length - off);
    const data = d.slice(off, off + len); po = fmt === 0 ? dosToProdos(data) : data;
    kind = '2mg'; extra = { fmt, off, len };
  } else if (/^WOZ[12]/.test(String.fromCharCode(...d.subarray(0, 4)))) {
    const r = wozToProdos(d); po = r.po; kind = 'woz'; extra.missing = r.missing;
  } else if (d.length === 143360) {
    const asDos = dosToProdos(d);
    if (/\.po$/.test(lower) && validVolume(d)) { po = d.slice(); kind = 'po'; }
    else if (validVolume(asDos)) { po = asDos; kind = 'dsk'; }
    else if (validVolume(d)) { po = d.slice(); kind = 'po'; }
    else throw new Error('This 140K disk is not a ProDOS disk (Mouse Calc disks are ProDOS).');
  } else { po = d.slice(); kind = 'po'; }
  if (!validVolume(po)) throw new Error('No ProDOS volume found in this image.');
  return new Volume(po, kind, extra, d);
}

class Volume {
  constructor(po, kind, extra, original) { this.d = po; this.kind = kind; this.extra = extra; this.original = original; }
  blk(n) { return this.d.subarray(n * 512, n * 512 + 512); }
  get name() { const v = this.blk(2); return textOf(v.subarray(5, 5 + (v[4] & 15))); }
  get totalBlocks() { const v = this.blk(2); return v[0x29] | v[0x2a] << 8; }
  // walk directory blocks; returns entries with location info
  entries(key) {
    const out = []; let b = key, first = true, blocks = [];
    while (b) {
      blocks.push(b); const bl = this.blk(b);
      for (let e = 0; e < 13; e++) {
        if (first && e === 0) continue;
        const o = 4 + e * 39, st = bl[o] >> 4; if (!st) continue;
        out.push({ block: b, index: e, st, name: textOf(bl.subarray(o + 1, o + 1 + (bl[o] & 15))), type: bl[o + 16],
          key: bl[o + 17] | bl[o + 18] << 8, blocksUsed: bl[o + 19] | bl[o + 20] << 8, eof: bl[o + 21] | bl[o + 22] << 8 | bl[o + 23] << 16,
          aux: bl[o + 31] | bl[o + 32] << 8 });
      }
      first = false; b = bl[2] | bl[3] << 8; if (blocks.length > 2000) break;
    }
    out.dirBlocks = blocks; return out;
  }
  walk(key = 2, path = '') {
    let all = [];
    for (const e of this.entries(key)) {
      e.path = path + e.name; all.push(e);
      if (e.st === 0xd) all = all.concat(this.walk(e.key, e.path + '/'));
    }
    return all;
  }
  dataBlocks(st, key, eof) {
    const nb = Math.max(1, Math.ceil(eof / 512)), list = [];
    if (st === 1) return [key];
    if (st === 2) { const ib = this.blk(key); for (let i = 0; i < Math.min(256, nb); i++) list.push(ib[i] | ib[256 + i] << 8); return list; }
    if (st === 3) { const mb = this.blk(key); for (let j = 0; j < 128 && list.length < nb; j++) { const q = mb[j] | mb[256 + j] << 8; const ib = q ? this.blk(q) : new Uint8Array(512); for (let i = 0; i < 256 && list.length < nb; i++) list.push(ib[i] | ib[256 + i] << 8); } return list; }
    return [];
  }
  read(e) {
    const out = new Uint8Array(e.eof); const list = this.dataBlocks(e.st, e.key, e.eof);
    list.forEach((b, i) => { if (b) { const chunk = this.blk(b).subarray(0, Math.min(512, e.eof - i * 512)); out.set(chunk, i * 512); } });
    return out;
  }
  // ---- writing
  bitmap() { const v = this.blk(2); return { start: v[0x27] | v[0x28] << 8, total: this.totalBlocks }; }
  isFree(n) { const { start } = this.bitmap(); const byte = this.d[start * 512 + (n >> 3)]; return !!(byte & (0x80 >> (n & 7))); }
  setFree(n, free) { const { start } = this.bitmap(); const o = start * 512 + (n >> 3); if (free) this.d[o] |= (0x80 >> (n & 7)); else this.d[o] &= ~(0x80 >> (n & 7)); }
  alloc() { const { total } = this.bitmap(); for (let n = 3; n < total; n++) if (this.isFree(n)) { this.setFree(n, false); this.blk(n).fill(0); return n; } throw new Error('The disk image is full.'); }
  freeFile(e) {
    const list = this.dataBlocks(e.st, e.key, e.eof).filter(Boolean);
    list.forEach(b => this.setFree(b, true));
    if (e.st === 2) this.setFree(e.key, true);
    if (e.st === 3) { const mb = this.blk(e.key); for (let j = 0; j < 128; j++) { const q = mb[j] | mb[256 + j] << 8; if (q) this.setFree(q, true); } this.setFree(e.key, true); }
  }
  writeFile(dirKey, name, data, type, aux, replace) {
    name = name.toUpperCase();
    if (!/^[A-Z][A-Z0-9.]{0,14}$/.test(name)) throw new Error('ProDOS names: 1-15 letters, digits or dots, starting with a letter.');
    const ents = this.entries(dirKey), existing = ents.find(e => e.name === name);
    if (existing && !replace) throw new Error(name + ' already exists in that folder.');
    if (existing && existing.st === 0xd) throw new Error(name + ' is a folder.');
    if (data.length > 128 * 1024) throw new Error('File too large.');
    // locate a directory slot
    let slot = existing ? { block: existing.block, index: existing.index } : null;
    if (existing) this.freeFile(existing);
    if (!slot) {
      for (const b of ents.dirBlocks) { const bl = this.blk(b); for (let e = (b === dirKey ? 1 : 0); e < 13; e++) if (!(bl[4 + e * 39] >> 4)) { slot = { block: b, index: e }; break; } if (slot) break; }
    }
    if (!slot) {
      if (dirKey === 2) throw new Error('The main (volume) folder is full; choose a subfolder.');
      const last = ents.dirBlocks[ents.dirBlocks.length - 1], nb = this.alloc();
      const lb = this.blk(last); lb[2] = nb & 255; lb[3] = nb >> 8;
      const nbb = this.blk(nb); nbb[0] = last & 255; nbb[1] = last >> 8;
      slot = { block: nb, index: 0 };
      this.adjustDirSize(dirKey, 1);
    }
    // data blocks
    const nb = Math.max(1, Math.ceil(data.length / 512)); let st, key, used;
    if (nb === 1) { key = this.alloc(); this.blk(key).set(data.subarray(0, 512)); st = 1; used = 1; }
    else {
      key = this.alloc(); const ib = this.blk(key);
      for (let i = 0; i < nb; i++) { const b = this.alloc(); this.blk(b).set(data.subarray(i * 512, i * 512 + 512)); ib[i] = b & 255; ib[256 + i] = b >> 8; }
      st = 2; used = nb + 1;
    }
    const bl = this.blk(slot.block), o = 4 + slot.index * 39;
    bl.fill(0, o, o + 39);
    bl[o] = (st << 4) | name.length; for (let i = 0; i < name.length; i++) bl[o + 1 + i] = name.charCodeAt(i);
    bl[o + 16] = type; bl[o + 17] = key & 255; bl[o + 18] = key >> 8; bl[o + 19] = used & 255; bl[o + 20] = used >> 8;
    bl[o + 21] = data.length & 255; bl[o + 22] = (data.length >> 8) & 255; bl[o + 23] = data.length >> 16;
    const now = new Date(), dt = ((now.getFullYear() % 100) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    bl[o + 24] = dt & 255; bl[o + 25] = dt >> 8; bl[o + 26] = now.getMinutes(); bl[o + 27] = now.getHours();
    bl[o + 30] = 0xe3; bl[o + 31] = aux & 255; bl[o + 32] = aux >> 8;
    bl[o + 33] = bl[o + 24]; bl[o + 34] = bl[o + 25]; bl[o + 35] = bl[o + 26]; bl[o + 36] = bl[o + 27];
    bl[o + 37] = dirKey & 255; bl[o + 38] = dirKey >> 8;
    if (!existing) this.adjustFileCount(dirKey, 1);
  }
  adjustFileCount(dirKey, delta) { const h = this.blk(dirKey); const n = (h[0x25] | h[0x26] << 8) + delta; h[0x25] = n & 255; h[0x26] = n >> 8; }
  adjustDirSize(dirKey, blocks) {
    // update the parent's entry for this subdirectory (blocks used + EOF)
    const h = this.blk(dirKey), pb = h[0x27] | h[0x28] << 8, pe = h[0x29];
    const pbl = this.blk(pb), o = 4 + (pe - 1) * 39;
    const used = (pbl[o + 19] | pbl[o + 20] << 8) + blocks; pbl[o + 19] = used & 255; pbl[o + 20] = used >> 8;
    const eof = used * 512; pbl[o + 21] = eof & 255; pbl[o + 22] = (eof >> 8) & 255; pbl[o + 23] = eof >> 16;
  }
  // serialize back to the original container
  toBytes() {
    if (this.kind === 'dsk') return prodosToDos(this.d);
    if (this.kind === '2mg') { const out = this.original.slice(); const data = this.extra.fmt === 0 ? prodosToDos(this.d) : this.d; out.set(data.subarray(0, this.extra.len), this.extra.off); return out; }
    return this.d.slice();      // po / hdv (and woz is saved as .po)
  }
}

// cells that sit on a circular chain of references (Mouse Calc allows these; they recalc once per pass)
function circularCells(sheet) {
  const key = (r, c) => r * 256 + c, deps = new Map();
  const refsOf = n => { const out = []; const w = x => { if (!x) return;
      if (x.t === 'ref') out.push(key(x.r, x.c));
      else if (x.t === 'range') { for (let c = Math.min(x.a.c, x.b.c); c <= Math.max(x.a.c, x.b.c); c++) for (let r = Math.min(x.a.r, x.b.r); r <= Math.max(x.a.r, x.b.r); r++) out.push(key(r, c)); }
      ['x', 'l', 'r'].forEach(k => x[k] && w(x[k])); (x.args || []).forEach(w); }; w(n); return out; };
  sheet.cells.forEach(c => { if (c.ast) deps.set(key(c.r, c.c), refsOf(c.ast)); });
  const state = new Map(), onCycle = new Set(), stack = [];
  const visit = k => {
    state.set(k, 1); stack.push(k);
    for (const d of deps.get(k) || []) {
      if (!deps.has(d)) continue;
      if (state.get(d) === 1) { for (let i = stack.lastIndexOf(d); i < stack.length; i++) onCycle.add(stack[i]); }
      else if (!state.get(d)) visit(d);
    }
    stack.pop(); state.set(k, 2);
  };
  for (const k of deps.keys()) if (!state.get(k)) visit(k);
  return onCycle;
}

const api = { circularCells, HEADER_LEN, MAX_COL, MAX_ROW, DEFAULT_WIDTH, FORMATS, colName, colNum, cellName, decodeNumber, encodeNumber,
  parseTokens, toMouseCalc, toExcel, formulaTokens, evaluate, parseFile, buildFile, setTemplateHeader, looksLikeMouseCalc,
  parseExcel, checkRefs, excelNumFmt, mcFormatFromExcel, asciiFold, openImage, Volume, dosToProdos, prodosToDos, wozToProdos };
if (typeof module !== 'undefined') module.exports = api; else root.MCLib = api;
})(this);
