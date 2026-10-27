import sys, time, json, base64
from playwright.sync_api import sync_playwright
url, out = sys.argv[1], sys.argv[2]
steps = json.load(open(sys.argv[3]))
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=swiftshader','--enable-unsafe-swiftshader'])
    pg = b.new_page(viewport={'width':1100,'height':560})
    pg.goto(url)
    for st in steps:
        k = st[0]
        if k == 'wait': time.sleep(st[1])
        elif k == 'move': pg.mouse.move(st[1], st[2], steps=st[3] if len(st)>3 else 10)
        elif k == 'down': pg.mouse.down()
        elif k == 'up': pg.mouse.up()
        elif k == 'click':
            pg.mouse.move(st[1], st[2], steps=10); time.sleep(1.5); pg.mouse.down(); time.sleep(0.6); pg.mouse.up(); time.sleep(st[3] if len(st)>3 else 2)
        elif k == 'menu':  # menu x, item y
            pg.mouse.move(st[1], 103, steps=10); time.sleep(1.5); pg.mouse.down(); time.sleep(4)
            pg.mouse.move(st[1]+10, st[2], steps=15); time.sleep(3); pg.mouse.up(); time.sleep(st[3] if len(st)>3 else 4)
        elif k == 'menushot':  # x, y, shotname: hold menu open at y, screenshot, release
            pg.mouse.move(st[1], 103, steps=10); time.sleep(1.5); pg.mouse.down(); time.sleep(4)
            pg.mouse.move(st[1]+10, st[2], steps=15); time.sleep(3)
            pg.screenshot(path=f'{out}_{st[3]}.png', clip={'x':250,'y':92,'width':600,'height':425})
            pg.mouse.up(); time.sleep(st[4] if len(st)>4 else 4)
        elif k == 'dbl':
            pg.mouse.move(st[1], st[2], steps=10); time.sleep(1.5)
            for _ in range(2):
                pg.mouse.down(); time.sleep(0.15); pg.mouse.up(); time.sleep(0.2)
            time.sleep(st[3] if len(st)>3 else 3)
        elif k == 'oa':
            pg.keyboard.down('Meta'); time.sleep(0.3); pg.keyboard.press(st[1]); time.sleep(0.3); pg.keyboard.up('Meta'); time.sleep(st[2] if len(st)>2 else 3)
        elif k == 'metaclick':
            pg.keyboard.down('Meta'); time.sleep(0.4); pg.mouse.down(); time.sleep(0.6); pg.mouse.up(); time.sleep(0.4); pg.keyboard.up('Meta')
        elif k == 'mark': pass
        elif k == 'key': pg.keyboard.press(st[1]); time.sleep(st[2] if len(st)>2 else 0.4)
        elif k == 'type':
            SH={'+':'Equal','*':'Digit8','(':'Digit9',')':'Digit0','^':'Digit6','<':'Comma','>':'Period','$':'Digit4','"':'Quote',':':'Semicolon','%':'Digit5','#':'Digit3','!':'Digit1','@':'Digit2','&':'Digit7','_':'Minus','?':'Slash'}
            for ch in st[1]:
                if ch in SH:
                    pg.keyboard.down('Shift'); time.sleep(0.15); pg.keyboard.press(SH[ch]); time.sleep(0.15); pg.keyboard.up('Shift')
                else: pg.keyboard.type(ch)
                time.sleep(0.25)
            time.sleep(0.5)
        elif k == 'shot': pg.screenshot(path=f'{out}_{st[1]}.png', clip={'x':250,'y':92,'width':600,'height':425})
        elif k == 'dumpmem':
            js = """() => { const m = window.__a2.getMMU(); const out = new Uint8Array(0x30000);
              const banks = (p) => p < 2 ? m.mem00_01 : p < 4 ? m.mem02_03 : p < 8 ? m.mem04_07 : p < 0xc ? m.mem08_0B : p < 0x20 ? m.mem0C_1F : p < 0x40 ? m.mem20_3F : p < 0x60 ? m.mem40_5F : m.mem60_BF;
              for (let p = 0; p < 0xc0; p++) for (let o = 0; o < 256; o++) { out[p*256+o] = banks(p)[0].read(p, o); out[0x10000+p*256+o] = banks(p)[1].read(p, o); }
              // language card: main D000 bank1/bank2, E000; aux same (memD0_DF[1..4], memE0_FF[1..2])
              for (let p = 0xd0; p < 0xe0; p++) for (let o = 0; o < 256; o++) { out[0x20000 + (p-0xd0)*256 + o] = m.memD0_DF[1].read(p,o); out[0x21000 + (p-0xd0)*256 + o] = m.memD0_DF[2].read(p,o); out[0x22000 + (p-0xd0)*256 + o] = m.memD0_DF[3].read(p,o); out[0x23000 + (p-0xd0)*256 + o] = m.memD0_DF[4].read(p,o); }
              for (let p = 0xe0; p < 0x100; p++) for (let o = 0; o < 256; o++) { out[0x24000 + (p-0xe0)*256 + o] = m.memE0_FF[1].read(p,o); out[0x26000 + (p-0xe0)*256 + o] = m.memE0_FF[2].read(p,o); }
              let s = ''; for (let i = 0; i < out.length; i++) s += String.fromCharCode(out[i]); return btoa(s); }"""
            open(st[1],'wb').write(base64.b64decode(pg.evaluate(js)))
        elif k == 'trace_on':
            pg.evaluate("""() => { const c = window.__a2.theDebugger || window.__cpu; window.__hist = new Map(); const cpu0 = window.__cpu; window.__trace = []; window.__tlimit = %d;
              if (!c.__orig) c.__orig = c.stepCycles.bind(c);
              c.stepCycles = (n) => cpu0.stepCyclesDebug(n, (cpu) => { const pc = cpu.getPC(); window.__hist.set(pc, (window.__hist.get(pc)||0)+1); if (window.__trace.length < window.__tlimit) { const d = cpu.getDebugInfo ? cpu.getDebugInfo() : null; window.__trace.push(pc); } }); }""" % (st[1] if len(st)>1 else 0))
        elif k == 'trace_off':
            res = pg.evaluate("""() => { const c = window.__a2.theDebugger || window.__cpu; c.stepCycles = c.__orig; return {hist: [...window.__hist.entries()], trace: window.__trace}; }""")
            json.dump(res, open(st[1],'w'))
        elif k == 'dump':
            js = """async () => { const d = window.__sp.disks[1]; const n = await d.blockCount(); const parts=[];
                for (let i=0;i<n;i++){ const b = await d.read(i); parts.push(String.fromCharCode.apply(null, b)); }
                return btoa(parts.join('')); }"""
            data = base64.b64decode(pg.evaluate(js)); open(st[1],'wb').write(data)
    b.close()
