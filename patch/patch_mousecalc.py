"""patch_mousecalc.py ORIGINAL_MOUSE.CALC BINDIR OUTPUT

Turns the original Mouse Calc (Version Soft, 1984) program file into Mouse Calc
Version 2. Every patch first checks the original bytes it replaces, so it
refuses to run on a different release. BINDIR holds the assembled pieces from
src/ (sortstub.bin, uplabel.bin).

  1) skip the key-disk check but keep its setup step (copy of the page-3 routine)
  2) move the program-folder path buffer from $904F (45 bytes) to $8C12 so Mouse
     Calc works from deep folders on a hard disk
  3) Link menu 'Copy to Mouse Word' -> 'Sort rows A-Z / Z-A' (loads SORT.SEGMENT)
  4) show '(Up a level)' on the Open/Save box's top bar
  5) Info menu: 'Version 2', 'Updated by 6502 Retro 2026'
  6) Link menu renamed Sort (DIF items removed); File > Import/Export CSV file
     (overlay 1 DIF.SEGMENT -> CSV.SEGMENT)
  7) splash picture: 'V: 2.0' + 'Updated by 6502 Retro 2026' (splash_patch.py)
"""
import sys, os, subprocess
src, bindir, out = sys.argv[1:4]
d = bytearray(open(src, 'rb').read())
off = lambda a: 0x8050 + (a - 0x4000)
def patch(addr, old, new):
    o = off(addr); assert d[o:o+len(old)] == old, ('$%04X' % addr, d[o:o+len(old)].hex(), old.hex())
    d[o:o+len(new)] = new
# --- 1) key-disk check at $9005
patch(0x9005, bytes.fromhex('ADE9C0' '2000A8' 'ADE8C0' 'AD03A8' '8D4D90' 'AD04A8' '8D4E90'),
              bytes.fromhex('20F7A9' 'A900' '8D4D90' '8D4E90') + bytes([0xEA] * 10))
# --- 2) path buffer $904F -> $8C12
refs = [0x899B, 0x89BF, 0x89EE, 0x89F9, 0x89FC, 0x8A06, 0x8A2C, 0x8A39, 0x8A9B, 0x8AC0, 0x8AF1,
        0x8B2F, 0x8B33, 0x8F7F, 0x9020, 0x9028, 0x9042, 0x904A, 0x913B, 0x9746]
for a in refs:
    o = off(a) + 1; assert d[o:o+2] == bytes([0x4F, 0x90]), '$%04X' % a
    d[o:o+2] = bytes([0x12, 0x8C])
# old "Copy to Mouse Word" code/data $8C12-$8C8A is dead; clear it for the new buffer
o = off(0x8C12); assert d[off(0x8C2F):off(0x8C2F)+2] == bytes([0xA9, 0x02]); assert d[off(0x8C8B):off(0x8C8B)+3] == bytes([0x8D, 0xC1, 0x8B])
d[o:off(0x8C8B)] = bytes(0x8C8B - 0x8C12)
# --- 3) Sort: loader in the old buffer, menu dispatch + jump table point to it
stub = open(os.path.join(bindir, 'sortstub.bin'), 'rb').read(); assert len(stub) <= 45
o = off(0x904F); assert d[o:o+45] == bytes(45), d[o:o+45].hex()
d[o:o+len(stub)] = stub
patch(0x482E, bytes([0x64, 0x48]), bytes([0x4E, 0x90]))           # Link item 4 handler-1
patch(0x8924, bytes([0x4C, 0x2F, 0x8C]), bytes([0x4C, 0x4F, 0x90]))
assert d[0x53A3] == 19 and d[0x53A4:0x53A4+19] == b'Copy to Mouse Word '
d[0x53A4:0x53A4+19] = b'Sort rows A-Z / Z-A'
# --- 4) visible "(Up a level)" label on the file box's top bar (click target already exists)
up = open(os.path.join(bindir, 'uplabel.bin'), 'rb').read(); assert len(up) <= 0x8C8B - 0x8C66
o = off(0x8C66); assert d[o:o+len(up)] == bytes(len(up)); d[o:o+len(up)] = up
patch(0x96DC, bytes.fromhex('A9514C091A'), bytes.fromhex('A9514C668C'))
# --- 5) Info menu: "Version 2" and "Updated by 6502 Retro 2026" under Author
lc = lambda a: a - 0x8FD8                      # Info menu data lives in the language card
def lcpatch(addr, old, new):
    o = lc(addr); assert d[o:o+len(old)] == old, ('LC $%04X' % addr, d[o:o+len(old)].hex()); d[o:o+len(new)] = new
ps = lambda t: bytes([len(t)]) + t.encode()
# old strings: Copyright (23 bytes at $E3F9) + Version (12 at $E410) -> new "Updated by" line
lcpatch(0xE3F9, ps('Copyright Version Soft') + ps('Version 1.0'),
        (ps('Updated by 6502 Retro 2026') + bytes(35))[:35])
# "Copyright Version Soft" -> the dead "Insert Mouse Word disk" message ($9B0C, 24 bytes)
o = off(0x9B0C); assert bytes(b & 0x7F for b in d[o:o+23]) == b'Insert Mouse Word disk ' and d[o+23] == 0
d[o:o+24] = ps('Copyright Version Soft') + b'\0'
# "Version 2" -> spare bytes after the sort loader stub ($906E-$907B)
o = off(0x906E); assert d[o:o+14] == bytes(14); d[o:o+10] = ps('Version 2')
# item list: Author, Updated by, ----, Copyright, Version, ----, Help (items 5-10 are no-ops)
item = lambda p: bytes([0, 0, 0, 0, p & 255, p >> 8]); sep = bytes([0x40, 0, 0x13, 0, 0, 0])
lcpatch(0xE711, item(0xE3E3) + sep + item(0xE3F9) + sep + item(0xE410) + sep + item(0xE41C),
        item(0xE3E3) + item(0xE3F9) + sep + item(0x9B0C) + item(0x906E) + sep + item(0xE41C))
# --- 6) Link menu -> "Sort" (DIF items removed); File > Import/Export CSV file
W = lambda o: d[o] | d[o+1] << 8
def putw(o, v): d[o] = v & 255; d[o+1] = v >> 8
def lcstr(addr, old, new, room):
    o = lc(addr); assert d[o] == len(old) and d[o+1:o+1+len(old)] == old.encode(), (hex(addr), d[o:o+20])
    assert len(new) <= room; d[o:o+1+room] = (bytes([len(new)]) + new.encode() + bytes(room))[:1+room]
lcstr(0xE030, 'Link', 'Sort', 4)
lcstr(0xE35A, 'Read a DIF file', 'Import CSV file', 15)
lcstr(0xE36A, 'Write a DIF file', 'Export CSV file', 16)
# menu bar: 2-byte header, 10-byte entries (id, flags, title, item list, 4 reserved)
bar = lc(0xE421); nmenu = d[bar]; assert nmenu == 9
ents = [(bar + 2 + 10*i) for i in range(nmenu)]
menus = []                                   # (id, entry offset, [6-byte items])
for e in ents:
    mid = d[e]; lst = lc(W(e + 4)); cnt = d[lst]
    menus.append([mid, e, [bytes(d[lst+4+6*k: lst+10+6*k]) for k in range(cnt)]])
assert lc(W(ents[0] + 4)) == lc(0xE47D)
region_end = lc(W(ents[-1] + 4)) + 4 + 6 * len(menus[-1][2]); assert region_end == lc(0xE73B)
item = lambda p: bytes([0, 0, 0, 0, p & 255, p >> 8])
sep = bytes([0x40, 0, 0x13, 0, 0, 0])
byid = {m[0]: m for m in menus}
f = byid[0x10][2]; assert len(f) == 14 and W(0) is not None
f[12:12] = [item(0xE35A), item(0xE36A)]       # after "Read a text file"
lk = byid[0x70][2]; assert len(lk) == 7
byid[0x70][2] = lk[3:]                         # Sort rows, ----, Merge (+), Merge (-)
mbuf = bytearray(); addr = 0xE47D
for mid, e, items in menus:
    putw(e + 4, addr + len(mbuf))
    mbuf += bytes([len(items), 0, 0, 0]) + b''.join(items)
assert len(mbuf) <= region_end - lc(0xE47D)
d[lc(0xE47D):region_end] = bytes(mbuf) + bytes(region_end - lc(0xE47D) - len(mbuf))
# handler arrays: table at $477E + id/8 -> array of (handler-1) words, one per item
tab = lambda mid: off(0x477E + (mid >> 3))
order = [0x10, 0x20, 0x90, 0x40, 0x50, 0x60, 0x70, 0x80]
cnt = {0x10: 14, 0x20: 17, 0x90: 7, 0x40: 17, 0x50: 8, 0x60: 12, 0x70: 7, 0x80: 11}
arrays = {}; pos = 0x4792
for mid in order:
    a = W(tab(mid)); assert a == pos, (hex(mid), hex(a), hex(pos))
    arrays[mid] = [W(off(a) + 2*k) for k in range(cnt[mid])]; pos += 2 * cnt[mid]
assert pos == 0x484C and W(tab(0x30)) == 0xFFFF
fa = arrays[0x10]; la = arrays[0x70]
assert la[0] == 0x4A27 and la[1] == 0x49CC and la[3] == 0x904E
fa[12:12] = [0x4A27, 0x4A1D]                  # Import = old Read DIF path; Export = $4A1E (no row/column question)
arrays[0x70] = la[3:]
pos = 0x4792; blob = bytearray()
for mid in order:
    putw(tab(mid), pos + len(blob))
    for w in arrays[mid]: blob += bytes([w & 255, w >> 8])
assert len(blob) <= 0x484C - 0x4792
d[off(0x4792):off(0x484C)] = bytes(blob) + bytes(0x484C - 0x4792 - len(blob))
# overlay 1 is now CSV.SEGMENT, entered at $B000 (import) / $B003 (export)
o = off(0x8BCE); assert d[o] == 11 and bytes(c & 0x7F for c in d[o+1:o+12]) == b'DIF.SEGMENT'
d[o+1:o+12] = bytes(c | 0x80 for c in b'CSV.SEGMENT')
patch(0x99E1, bytes.fromhex('4C00B4'), bytes.fromhex('4C00B0'))
patch(0x99FB, bytes.fromhex('4CB6B5'), bytes.fromhex('4C03B0'))
open(out, 'wb').write(d)
# --- 7) splash picture: V: 2.0 and 'Updated by 6502 Retro 2026' (see splash_patch.py)
subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'splash_patch.py'), out], check=True)
