"""mkcsvimg.py HDD.po OUT.po - adds test CSV files (Excel-style UTF-8, European
semicolon, number edge cases, 3,000 cells, 66 columns) to SAMPLES/."""
import struct, sys, os; sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tools'))
from prodos import Vol as RVol
from mkprodos import Vol, F, D
def tree(v, key):
    out=[]; b=key; first=True
    while b:
        bl=v.blk(b)
        for e in range(13):
            if first and e==0: continue
            o=4+e*39; st=bl[o]>>4; nl=bl[o]&15
            if st==0: continue
            name=bl[o+1:o+1+nl].decode(); ft=bl[o+16]; kp=struct.unpack('<H',bl[o+17:o+19])[0]
            eof=bl[o+21]|bl[o+22]<<8|bl[o+23]<<16; aux=struct.unpack('<H',bl[o+31:o+33])[0]
            if st==0xD: out.append(D(name, tree(v,kp)))
            else: out.append(F(name, v.read(st,kp,eof), ft, aux))
        first=False; b=struct.unpack('<H',bl[2:4])[0]
    return out
img,out=sys.argv[1:3]
raw=open(img,'rb').read(); root=tree(RVol(raw),2)
mc=[x for x in root if x.name=='MOUSECALC'][0]
smp=[x for x in mc.children if x.name=='SAMPLES'][0]
t1=('﻿Name,Amount,Note,Qty\r\n'
    '"Smith, John",1234.5,"He said ""hi""",-3\r\n'
    'Café,0.001,plain text,1E3\r\n'
    ',,"",\r\n'
    '"007",-0.25,"multi\r\nline",+42\r\n'
    'Total,=SUM(B2:B3),x,3.14159265\r\n').encode('utf-8')
t2='Name;Value;Other\nA;12,5;x\nB;-3,75;"y;z"\n'.encode()
smp.children.append(F('TEST.CSV', t1, 0x04, 0))
smp.children.append(F('EURO.CSV', t2, 0x04, 0))
t3='1E20,123456789012,0.000001,-1234567.89,1e-7,99999999,0.1,-0\n'.encode()
smp.children.append(F('NUMS.CSV', t3, 0x04, 0))
rows=[','.join(str(r*100+c) for c in range(30)) for r in range(100)]
smp.children.append(F('BIG.CSV', ('\n'.join(rows)+'\n').encode(), 0x04, 0))
wide=[','.join('w%d' % c for c in range(66)) for r in range(20)]
smp.children.append(F('WIDE.CSV', ('\r\n'.join(wide)+'\r\n').encode(), 0x04, 0))
open(out,'wb').write(Vol('MCALC',65535,boot=raw[:1024]).build(root))
