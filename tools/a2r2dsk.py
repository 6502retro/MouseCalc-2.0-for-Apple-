"""Decode an early-format A2R1 flux capture (DATA chunk, big-endian capture
records, 125 ns ticks) into a 140K physical-sector-order image."""
import sys, struct
d = open(sys.argv[1], 'rb').read()
o = d.index(b'DATA') + 8; end = d.index(b'INFO', o)
caps = {}
while o < end - 10:
    loc, typ = d[o], d[o+1]; ln, loop = struct.unpack('>II', d[o+2:o+10])
    if o + 10 + ln > end: break
    caps.setdefault(loc, []).append(d[o+10:o+10+ln]); o += 10 + ln
WR = [0x96,0x97,0x9a,0x9b,0x9d,0x9e,0x9f,0xa6,0xa7,0xab,0xac,0xad,0xae,0xaf,0xb2,0xb3,0xb4,0xb5,0xb6,0xb7,0xb9,0xba,0xbb,0xbc,0xbd,0xbe,0xbf,0xcb,0xcd,0xce,0xcf,0xd3,0xd6,0xd7,0xd9,0xda,0xdb,0xdc,0xdd,0xde,0xdf,0xe5,0xe6,0xe7,0xe9,0xea,0xeb,0xec,0xed,0xee,0xef,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff]
INV = {v: i for i, v in enumerate(WR)}
def flux_bits(raw, cell=32.0):
    out = []; acc = 0
    for b in raw:
        acc += b
        if b == 255: continue
        n = max(1, int(acc / cell + 0.5)); out.extend([0] * (n - 1)); out.append(1); acc = 0
    return out
def nibs(b):
    out = []; v = 0
    for x in b:
        v = ((v << 1) | x) & 0xff
        if v & 0x80: out.append(v); v = 0
    return out
dec44 = lambda a, b: ((a << 1) | 1) & b
def sectors(n, want_track):
    secs = {}; L = len(n)
    for i in range(L - 420):
        if n[i] == 0xd5 and n[i+1] == 0xaa and n[i+2] == 0x96:
            tt = dec44(n[i+5], n[i+6]); ss = dec44(n[i+7], n[i+8])
            if tt != want_track or ss in secs or ss > 15: continue
            j = i + 11
            while j < i + 80 and not (n[j] == 0xd5 and n[j+1] == 0xaa and n[j+2] == 0xad): j += 1
            if j >= i + 80: continue
            j += 3
            try: vals = [INV[n[j+k]] for k in range(343)]
            except (KeyError, IndexError): continue
            x = 0; buf = []
            for v in vals[:342]: x ^= v; buf.append(x)
            if x != vals[342]: continue
            aux, main = buf[:86], buf[86:]; sec = bytearray(256)
            for k in range(256):
                a = aux[k % 86] >> (2 * (k // 86))
                sec[k] = ((main[k] << 2) | ((a & 1) << 1) | ((a >> 1) & 1)) & 0xff
            secs[ss] = bytes(sec)
    return secs
img = bytearray(35 * 16 * 256); bad = []
for t in range(35):
    got = {}
    for c in caps.get(t * 4, []):
        for cell in (32.0, 31.5, 32.5, 31.0, 33.0):
            got.update({k: v for k, v in sectors(nibs(flux_bits(c + c, cell)), t).items() if k not in got})
            if len(got) == 16: break
        if len(got) == 16: break
    if len(got) != 16: bad.append((t, sorted(set(range(16)) - set(got))))
    for s, v in got.items(): img[(t*16+s)*256:(t*16+s+1)*256] = v
open(sys.argv[2], 'wb').write(img)
print('missing:', bad if bad else 'none')
