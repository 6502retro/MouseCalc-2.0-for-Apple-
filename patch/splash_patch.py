"""Edit Mouse Calc's double hi-res splash picture (first 16K of MOUSE.CALC:
aux page then main page) using Mouse Calc's own 7x8 font (table at 0x7C50):
  - 'V: 1.0' -> 'V: 2.0'
  - add 'Updated by 6502 Retro 2026' in row 5 of the little sheet
  - menu bar in the picture: 'Link' -> 'Sort'"""
import sys
path = sys.argv[1]
d = bytearray(open(path, 'rb').read())
AUX, MAIN = 0, 0x2000
def rowaddr(y): return (y & 7) * 0x400 + ((y >> 3) & 7) * 0x80 + (y >> 6) * 0x28
def setpix(x, y, v):
    k = x // 7; o = (AUX if k % 2 == 0 else MAIN) + rowaddr(y) + k // 2; b = 1 << (x % 7)
    d[o] = (d[o] | b) if v else (d[o] & ~b)
def getpix(x, y):
    k = x // 7; o = (AUX if k % 2 == 0 else MAIN) + rowaddr(y) + k // 2; return (d[o] >> (x % 7)) & 1
def glyph(ch):
    c = ord(ch); i = c - 0x40 if 0x40 <= c < 0x60 else c
    return d[0x7C50 + i * 8: 0x7C50 + i * 8 + 8]
def draw(x0, y0, text, clear=True):
    for n, ch in enumerate(text):
        g = glyph(ch)
        for r in range(8):
            for i in range(7):
                v = (g[r] >> i) & 1
                if v or clear: setpix(x0 + n * 7 + i, y0 + r, v)
# sanity: the existing '1' of 'V: 1.0' starts at x=503, line y=14
assert all(getpix(503 + i, 14 + r) == (glyph('1')[r] >> i) & 1 for r in range(8) for i in range(7))
draw(503, 14, '2')
draw(42 * 7, 64, 'Updated by 6502 Retro 2026')
# the picture's own menu bar still says "Link" (dark letters on white): -> "Sort"
assert all(getpix(449, y) == 0 for y in range(0, 6)) and getpix(449, 6) == 0   # the L
for x in range(448, 484):
    for y in range(0, 7): setpix(x, y, 1)
for n, ch in enumerate('Sort'):
    g = glyph(ch)
    for r in range(7):
        for i in range(7):
            if (g[r] >> i) & 1: setpix(448 + n * 7 + i, r, 0)
open(path, 'wb').write(d)
print('splash ok')
