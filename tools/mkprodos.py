"""Minimal ProDOS volume builder."""
import struct, datetime

def pdate(dt=None):
    dt = dt or datetime.datetime(2026, 10, 20, 12, 0)
    y = dt.year % 100
    d = (y << 9) | (dt.month << 5) | dt.day
    return struct.pack('<HH', d, (dt.hour << 8) | dt.minute)

class F:  # file node
    def __init__(s, name, data, ftype, aux, access=0xE3, dates=None):
        s.name, s.data, s.ftype, s.aux, s.access = name.upper(), data, ftype, aux, access
        s.dates = dates or (pdate() + pdate())  # create(4) + mod(4)
class D:  # directory node
    def __init__(s, name, children=None, access=0xC3):
        s.name, s.children, s.access = name.upper(), children or [], access

class Vol:
    def __init__(s, name, nblocks, boot=None):
        s.n = nblocks; s.img = bytearray(nblocks * 512); s.used = set()
        s.name = name.upper()
        if boot: s.img[0:1024] = boot[:1024]
        s.used |= {0, 1}
        s.nbm = (nblocks + 4095) // 4096
        s.next = 2
    def alloc(s, k=1):
        r = list(range(s.next, s.next + k)); s.next += k
        assert s.next <= s.n, 'volume full'
        s.used |= set(r); return r
    def put(s, b, data): s.img[b*512:b*512+len(data)] = data

    def write_data(s, data):
        nb = max(1, (len(data) + 511) // 512)
        chunks = [data[i*512:(i+1)*512] for i in range(nb)]
        if nb == 1:
            b = s.alloc()[0]; s.put(b, chunks[0]); return 1, b, 1
        if nb <= 256:
            ib = s.alloc()[0]; blks = s.alloc(nb)
            idx = bytearray(512)
            for i, (bb, c) in enumerate(zip(blks, chunks)):
                s.put(bb, c); idx[i] = bb & 255; idx[256+i] = bb >> 8
            s.put(ib, idx); return 2, ib, nb + 1
        raise NotImplementedError('tree files')

    def build(s, root_children):
        root = D(s.name, root_children)
        # pass 1: allocate directory blocks
        def plan(d, is_root):
            n = len(d.children) + 1
            nblk = max(1, (n + 12) // 13)
            if is_root: nblk = max(nblk, 4)
            d.blocks = s.alloc(nblk)
            if is_root:
                s.bitmap = s.alloc(s.nbm)
            for c in d.children:
                if isinstance(c, D): plan(c, False)
        plan(root, True)
        # pass 2: write files
        def wfiles(d):
            for c in d.children:
                if isinstance(c, F): c.st, c.key, c.bu = s.write_data(c.data)
                else: wfiles(c)
        wfiles(root)
        # pass 3: write directories
        def wdir(d, is_root, parent_ptr=None, parent_entry=None):
            blks = d.blocks
            bufs = [bytearray(512) for _ in blks]
            for i, b in enumerate(blks):
                bufs[i][0:2] = struct.pack('<H', blks[i-1] if i else 0)
                bufs[i][2:4] = struct.pack('<H', blks[i+1] if i+1 < len(blks) else 0)
            h = bufs[0]; o = 4
            h[o] = (0xF0 if is_root else 0xE0) | len(d.name); h[o+1:o+1+len(d.name)] = d.name.encode()
            if not is_root: h[o+16] = 0x75  # subdir header magic
            h[o+0x18:o+0x1C] = pdate()
            h[o+0x1C] = 0; h[o+0x1D] = 0
            h[o+0x1E] = d.access; h[o+0x1F] = 0x27; h[o+0x20] = 0x0D
            h[o+0x21:o+0x23] = struct.pack('<H', len(d.children))
            if is_root:
                h[o+0x23:o+0x25] = struct.pack('<H', s.bitmap[0])
                h[o+0x25:o+0x27] = struct.pack('<H', s.n)
            else:
                h[o+0x23:o+0x25] = struct.pack('<H', parent_ptr)
                h[o+0x25] = parent_entry; h[o+0x26] = 0x27
            for idx, c in enumerate(d.children):
                slot = idx + 1; bi, ei = divmod(slot, 13)
                e = bufs[bi]; o = 4 + ei * 39
                if isinstance(c, F):
                    st, key, bu, eof, ft, aux, acc = c.st, c.key, c.bu, len(c.data), c.ftype, c.aux, c.access
                    cd, md = c.dates[:4], c.dates[4:]
                else:
                    st, key, bu = 0xD, c.blocks[0], len(c.blocks)
                    eof, ft, aux, acc = len(c.blocks) * 512, 0x0F, 0, c.access
                    cd = md = pdate()
                e[o] = (st << 4) | len(c.name); e[o+1:o+1+len(c.name)] = c.name.encode()
                e[o+0x10] = ft
                e[o+0x11:o+0x13] = struct.pack('<H', key)
                e[o+0x13:o+0x15] = struct.pack('<H', bu)
                e[o+0x15:o+0x18] = struct.pack('<I', eof)[:3]
                e[o+0x18:o+0x1C] = cd
                e[o+0x1E] = acc
                e[o+0x1F:o+0x21] = struct.pack('<H', aux)
                e[o+0x21:o+0x25] = md
                e[o+0x25:o+0x27] = struct.pack('<H', blks[0])
                if isinstance(c, D): c._pp = (blks[bi], ei + 1)
            for b, buf in zip(blks, bufs): s.put(b, buf)
            for c in d.children:
                if isinstance(c, D): wdir(c, False, *c._pp)
        wdir(root, True)
        # bitmap: 1 = free
        bm = bytearray(s.nbm * 512)
        for b in range(s.n):
            if b not in s.used: bm[b >> 3] |= 0x80 >> (b & 7)
        for i, b in enumerate(s.bitmap): s.put(b, bm[i*512:(i+1)*512])
        return s.img

def po_to_dsk_physical(po):
    """ProDOS-order 140K -> DOS-order .dsk"""
    # ProDOS logical sector p (0..15 within track) -> DOS logical sector
    P2D = [0, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 15]
    out = bytearray(len(po))
    for t in range(35):
        for p in range(16):
            out[(t*16+P2D[p])*256:(t*16+P2D[p]+1)*256] = po[(t*16+p)*256:(t*16+p+1)*256]
    return out
