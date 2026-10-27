"""Minimal WOZ 1/2 reader: 16-sector 6-and-2 disks -> 140K image in physical
sector order (use prodos.to_po for ProDOS block order)."""
import struct
WR = [0x96,0x97,0x9a,0x9b,0x9d,0x9e,0x9f,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xcb,0xcd,0xce,0xcf,0xd3,0xd6,0xd7,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,0xe5,0xe6,0xe7,0xe9,0xea,0xeb,0xec,0xed,0xee,0xef,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff]
INV = {v: i for i, v in enumerate(WR)}
dec44 = lambda a, b: ((a << 1) | 1) & b

def _tracks(d):
    """yield (track, bit list) for whole tracks 0..34"""
    if d[:4] not in (b'WOZ1', b'WOZ2'): raise ValueError('not a WOZ file')
    tmap = d[88:88 + 160]
    for t in range(35):
        idx = tmap[t * 4]
        if idx == 0xFF: yield t, []; continue
        if d[:4] == b'WOZ2':
            sb, bc, nb = struct.unpack('<HHI', d[256 + idx * 8: 264 + idx * 8])
            raw = d[sb * 512: sb * 512 + bc * 512]
        else:
            o = 256 + idx * 6656; raw = d[o:o + 6646]; nb = struct.unpack('<H', d[o + 6648:o + 6650])[0]
        yield t, [(raw[i >> 3] >> (7 - (i & 7))) & 1 for i in range(nb)]

def _nibs(bits):
    out = []; v = 0
    for x in bits + bits:                                   # wrap around the track
        v = (v << 1) | x
        if v & 0x80: out.append(v); v = 0
    return out

def woz_to_dsk(d):
    img = bytearray(35 * 16 * 256); missing = []
    for t, bits in _tracks(d):
        n = _nibs(bits); secs = {}
        for i in range(len(n) - 420):
            if n[i] == 0xD5 and n[i+1] == 0xAA and n[i+2] == 0x96:
                ss = dec44(n[i+7], n[i+8])
                if ss in secs or ss > 15: continue
                j = i + 11
                while j < i + 80 and not (n[j] == 0xD5 and n[j+1] == 0xAA and n[j+2] == 0xAD): j += 1
                if j >= i + 80: continue
                try: vals = [INV[n[j + 3 + k]] for k in range(343)]
                except KeyError: continue
                x = 0; buf = []
                for v in vals[:342]: x ^= v; buf.append(x)
                if x != vals[342]: continue
                aux, main = buf[:86], buf[86:]; sec = bytearray(256)
                for k in range(256):
                    a = aux[k % 86] >> (2 * (k // 86))
                    sec[k] = ((main[k] << 2) | ((a & 1) << 1) | ((a >> 1) & 1)) & 0xFF
                secs[ss] = bytes(sec)
        for s in range(16):
            if s in secs: img[(t*16+s)*256:(t*16+s+1)*256] = secs[s]
            else: missing.append((t, s))
    return bytes(img), missing
