#!/usr/bin/env python3
"""Build Mouse Calc Version 2 from your own copy of the original disks.

    python3 build.py                      # looks in originals/
    python3 build.py PROGRAM.woz SAMPLES.woz

Inputs (not included in this repository - see originals/README.md):
    Mouse Calc program disk  (.woz, .po or .dsk)  - required
    Mouse Calc samples disk  (.woz, .po or .dsk)  - optional but recommended
                               (extra printer drivers, sample sheets, converter)
Needs: Python 3. cc65 (ca65 + ld65) is optional: without it the assembled
pieces in prebuilt/ are used (--prebuilt forces that, --update-prebuilt
refreshes them from src/). Node.js is optional (builds SORT.DEMO).

Outputs in out/:
    MouseCalc_HDD.po / .2mg        32 MB ProDOS hard disk, /MCALC/MOUSECALC/...
    MouseCalc_Program.po / .dsk    140K program floppy (same layout as the original)
    files/                         every new/changed file, for copying by hand
    mouse-calc-converter.html      offline PC converter (needs the samples disk)
"""
import os, sys, glob, shutil, struct, subprocess, hashlib

ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import woz, prodos
from mkprodos import Vol, F, D, po_to_dsk_physical

BUILD = os.path.join(ROOT, 'build'); OUT = os.path.join(ROOT, 'out')

def die(msg): sys.exit('build: ' + msg)
def step(msg): print('==>', msg)

# ---------------------------------------------------------------- inputs
def find_inputs(argv):
    if len(argv) >= 2: return argv[1], (argv[2] if len(argv) > 2 else None)
    cands = [f for f in glob.glob(os.path.join(ROOT, 'originals', '*'))
             if f.lower().endswith(('.woz', '.po', '.dsk'))]
    prog = [f for f in cands if 'prog' in os.path.basename(f).lower()]
    samp = [f for f in cands if 'sampl' in os.path.basename(f).lower()]
    if not prog: die('put the Mouse Calc program disk in originals/ (see originals/README.md)')
    return prog[0], (samp[0] if samp else None)

def load_po(path):
    d = open(path, 'rb').read()
    if d[:4] in (b'WOZ1', b'WOZ2'):
        dsk, missing = woz.woz_to_dsk(d)
        if missing: die('%s: %d unreadable sectors, e.g. track %d sector %d' % ((path, len(missing)) + missing[0]))
        return bytes(prodos.to_po(dsk))
    if d[:4] == b'2IMG':
        o, n = struct.unpack('<II', d[0x18:0x20]); d = d[o:o + n]
    if path.lower().endswith('.dsk'):
        return bytes(prodos.dsk_to_po(d))
    return d

def tree(vol, key):
    """read a ProDOS directory into mkprodos F/D nodes (keeping types and dates)"""
    out = []; b = key; first = True
    while b:
        bl = vol.blk(b)
        for e in range(13):
            if first and e == 0: continue
            o = 4 + e * 39; st = bl[o] >> 4; nl = bl[o] & 15
            if st == 0: continue
            name = bl[o+1:o+1+nl].decode(); ft = bl[o+16]
            kp = struct.unpack('<H', bl[o+17:o+19])[0]
            eof = bl[o+21] | bl[o+22] << 8 | bl[o+23] << 16
            aux = struct.unpack('<H', bl[o+31:o+33])[0]
            dates = bytes(bl[o+24:o+28]) + bytes(bl[o+33:o+37])
            if st == 0xD: out.append(D(name, tree(vol, kp)))
            else: out.append(F(name, vol.read(st, kp, eof), ft, aux, bl[o+30], dates))
        first = False; b = struct.unpack('<H', bl[2:4])[0]
    return out

byname = lambda L, n: next((x for x in L if x.name == n), None)

# ---------------------------------------------------------------- assembler
PREBUILT = os.path.join(ROOT, 'prebuilt')

def tool(name, required=True):
    for p in [os.environ.get('CC65_HOME', '') + '/bin/' + name, shutil.which(name) or '']:
        if p and os.path.exists(p): return p
    if required: die('%s not found - install cc65 (e.g. "apt install cc65" or "brew install cc65")' % name)
    return None

USE_PREBUILT = False
def assemble(src, cfg, out, trim=False):
    """assemble src/<src> with cc65, or - without cc65 - take the copy in prebuilt/
    (M.SYSTEM's prebuilt copy is only the new front part; Version Soft's original
    loader is appended from your disk)"""
    name = os.path.basename(out)
    if USE_PREBUILT:
        if name == 'M.SYSTEM':
            d = open(os.path.join(PREBUILT, 'M.SYSTEM.front'), 'rb').read() + open(os.path.join(BUILD, 'msys_body.bin'), 'rb').read()
        else:
            d = open(os.path.join(PREBUILT, name), 'rb').read()
        open(out, 'wb').write(d); return d
    obj = os.path.join(BUILD, os.path.basename(src) + '.o')
    subprocess.run([tool('ca65'), '-I', BUILD, '--bin-include-dir', BUILD, '-o', obj, '-l', obj[:-2] + '.lst',
                    os.path.join(ROOT, 'src', src)], check=True)
    subprocess.run([tool('ld65'), '-C', os.path.join(ROOT, 'src', cfg), '-o', out, obj], check=True)
    if trim:                                    # drop zero fill after the last code byte
        d = open(out, 'rb').read(); open(out, 'wb').write(d[:len(d.rstrip(b'\0')) + 1])
    d = open(out, 'rb').read()
    if UPDATE_PREBUILT:
        os.makedirs(PREBUILT, exist_ok=True)
        if name == 'M.SYSTEM': open(os.path.join(PREBUILT, 'M.SYSTEM.front'), 'wb').write(d[:-256])
        else: open(os.path.join(PREBUILT, name), 'wb').write(d)
    return d
UPDATE_PREBUILT = False

# ---------------------------------------------------------------- main
def main():
    global USE_PREBUILT, UPDATE_PREBUILT
    args = [a for a in sys.argv if not a.startswith('--')]
    UPDATE_PREBUILT = '--update-prebuilt' in sys.argv
    USE_PREBUILT = '--prebuilt' in sys.argv or (not UPDATE_PREBUILT and not tool('ca65', False))
    prog_path, samp_path = find_inputs(args)
    shutil.rmtree(BUILD, ignore_errors=True); os.makedirs(BUILD)
    os.makedirs(os.path.join(OUT, 'files'), exist_ok=True)

    step('reading ' + os.path.basename(prog_path))
    prog = load_po(prog_path); P = tree(prodos.Vol(prog), 2)
    open(os.path.join(BUILD, 'original_program.dsk'), 'wb').write(po_to_dsk_physical(prog))   # for converter tests
    S = []
    if samp_path:
        step('reading ' + os.path.basename(samp_path))
        S = tree(prodos.Vol(load_po(samp_path)), 2)
    orig = byname(P, 'MOUSE.CALC'); msys = byname(P, 'M.SYSTEM'); helpd = byname(P, 'HELP')
    if not (orig and msys and helpd and byname(P, 'DIF.SEGMENT')):
        die('that does not look like the Mouse Calc program disk')
    sha = hashlib.sha1(orig.data).hexdigest()
    print('    MOUSE.CALC sha1', sha)

    step('using prebuilt/ (cc65 not found)' if USE_PREBUILT else 'assembling (ca65)')
    open(os.path.join(BUILD, 'msys_body.bin'), 'wb').write((msys.data[0x0E:] + bytes(256))[:256])
    sortseg = assemble('sort.s', 'sort.cfg', os.path.join(BUILD, 'SORT.SEGMENT'))
    assemble('sortstub.s', 'sortstub.cfg', os.path.join(BUILD, 'sortstub.bin'))
    assemble('uplabel.s', 'msys.cfg', os.path.join(BUILD, 'uplabel.bin'))
    csvseg = assemble('csv.s', 'csv.cfg', os.path.join(BUILD, 'CSV.SEGMENT'), trim=True)
    msys_new = assemble('msys.s', 'msys.cfg', os.path.join(BUILD, 'M.SYSTEM'))
    launcher = assemble('mcalc.s', 'msys.cfg', os.path.join(BUILD, 'MCALC.SYSTEM'))

    step('patching MOUSE.CALC')
    open(os.path.join(BUILD, 'MOUSE.CALC.orig'), 'wb').write(orig.data)
    subprocess.run([sys.executable, os.path.join(ROOT, 'patch', 'patch_mousecalc.py'),
                    os.path.join(BUILD, 'MOUSE.CALC.orig'), BUILD, os.path.join(BUILD, 'MOUSE.CALC')], check=True)
    mcalc = open(os.path.join(BUILD, 'MOUSE.CALC'), 'rb').read()

    step('help files')
    hin = os.path.join(BUILD, 'help_orig'); hout = os.path.join(BUILD, 'help'); os.makedirs(hin); os.makedirs(hout)
    for h in helpd.children: open(os.path.join(hin, h.name), 'wb').write(h.data)
    subprocess.run([sys.executable, os.path.join(ROOT, 'help', 'mkhelp.py'), hin, hout], check=True, stdout=subprocess.DEVNULL)
    subprocess.run([sys.executable, os.path.join(ROOT, 'help', 'mkwhatsnew.py'), os.path.join(hout, 'WHATS.NEW')], check=True, stdout=subprocess.DEVNULL)
    rd = lambda n: open(os.path.join(hout, n), 'rb').read()

    demo = None
    bill = byname(S, 'SAMPLE.BILL')
    if bill and shutil.which('node'):
        step('SORT.DEMO (node)')
        open(os.path.join(BUILD, 'SAMPLE.BILL'), 'wb').write(bill.data)
        subprocess.run(['node', os.path.join(ROOT, 'demo', 'mkdemo.js'), os.path.join(ROOT, 'converter', 'mclib.js'),
                        os.path.join(BUILD, 'SAMPLE.BILL'), os.path.join(BUILD, 'SORT.DEMO')], check=True)
        demo = open(os.path.join(BUILD, 'SORT.DEMO'), 'rb').read()
    else:
        print('    (skipping SORT.DEMO: needs Node.js and the samples disk)')

    step('program files')
    for f in P:
        if f.name == 'MOUSE.CALC': f.data = mcalc
        if f.name == 'M.SYSTEM': f.data = msys_new
        if f.name == 'HELP':
            for h in f.children:
                if h.name == 'LINK': h.name = 'SORT'; h.data = rd('SORT')
                elif h.name == 'FILE': h.data = rd('FILE')
            f.children.append(F('WHATS.NEW', rd('WHATS.NEW'), 0x04, 0))
    i = next(k for k, f in enumerate(P) if f.name == 'DIF.SEGMENT')
    P[i] = F('CSV.SEGMENT', csvseg, 0x06, 0xAC00)
    P.insert(i + 1, F('SORT.SEGMENT', sortseg, 0x06, 0xAC00))

    step('program floppy')
    fl = Vol('M.CALC', 280, boot=prog[:1024]).build(P)
    open(os.path.join(OUT, 'MouseCalc_Program.po'), 'wb').write(fl)
    open(os.path.join(OUT, 'MouseCalc_Program.dsk'), 'wb').write(po_to_dsk_physical(fl))

    step('hard disk image')
    folder = [x for x in P if x.name != 'PRODOS']
    pr = byname(folder, 'PRINTER'); have = {c.name for c in pr.children}
    if byname(S, 'PRINTER'):
        pr.children += [c for c in byname(S, 'PRINTER').children if c.name not in have]
    samples = [x for x in S if x.name != 'PRINTER'] + ([F('SORT.DEMO', demo, 0xF8, 0)] if demo else [])
    if samples: folder.append(D('SAMPLES', samples))
    root = [byname(P, 'PRODOS'), F('MCALC.SYSTEM', launcher, 0xFF, 0x2000), D('MOUSECALC', folder)]
    hd = Vol('MCALC', 65535, boot=prog[:1024]).build(root)
    open(os.path.join(OUT, 'MouseCalc_HDD.po'), 'wb').write(hd)
    hdr = bytearray(64); hdr[0:4] = b'2IMG'; hdr[4:8] = b'MCV2'
    struct.pack_into('<HHIIIII', hdr, 8, 64, 1, 1, 0, 65535, 64, len(hd))
    open(os.path.join(OUT, 'MouseCalc_HDD.2mg'), 'wb').write(hdr + hd)

    step('loose files (out/files)')
    loose = {'MOUSE.CALC': mcalc, 'M.SYSTEM': msys_new, 'MCALC.SYSTEM': launcher, 'SORT.SEGMENT': sortseg,
             'CSV.SEGMENT': csvseg, 'HELP_SORT': rd('SORT'), 'HELP_FILE': rd('FILE'), 'HELP_WHATS.NEW': rd('WHATS.NEW')}
    if demo: loose['SORT.DEMO'] = demo
    for n, b in loose.items(): open(os.path.join(OUT, 'files', n), 'wb').write(b)

    if S:
        step('PC converter page')
        sdir = os.path.join(BUILD, 'samples'); os.makedirs(sdir)
        for x in S:                                     # Mouse Calc sheets only (type $F8)
            if isinstance(x, F) and x.ftype == 0xF8: open(os.path.join(sdir, x.name), 'wb').write(x.data)
        for x in byname(S, 'TEMPLATES').children if byname(S, 'TEMPLATES') else []:
            if x.ftype == 0xF8: open(os.path.join(sdir, 'TEMPLATES_' + x.name), 'wb').write(x.data)
        subprocess.run([sys.executable, os.path.join(ROOT, 'converter', 'build_page.py'), sdir,
                        os.path.join(OUT, 'mouse-calc-converter.html')], check=True, stdout=subprocess.DEVNULL)
    print('done - see out/')

if __name__ == '__main__':
    main()
