import sys, struct
D2P=[0,14,13,12,11,10,9,8,7,6,5,4,3,2,1,15]
def load(fn):
    d=open(fn,'rb').read()
    if d[:4]==b'2IMG':
        off=struct.unpack('<I',d[0x18:0x1c])[0]; ln=struct.unpack('<I',d[0x1c:0x20])[0]; d=d[off:off+ln]
    if fn.endswith('.dsk'):
        o=bytearray(len(d))
        for t in range(35):
            for p in range(16): o[(t*16+p)*256:(t*16+p+1)*256]=d[(t*16+D2P[p])*256:(t*16+D2P[p]+1)*256]
        d=bytes(o)
    return d
d=load(sys.argv[1]); B=lambda n:d[n*512:n*512+512]
vh=B(2); total=struct.unpack('<H',vh[0x29:0x2b])[0]; bm=struct.unpack('<H',vh[0x27:0x29])[0]
used={}; errs=[]
def mark(b,why):
    if b in used: errs.append('block %d used twice (%s / %s)'%(b,used[b],why))
    used[b]=why
mark(0,'boot'); mark(1,'boot')
for i in range((total+4095)//4096): mark(bm+i,'bitmap')
def walkdir(key,path):
    b=key; first=True; count=0; prev=0
    while b:
        mark(b,'dir '+path); bl=B(b)
        if struct.unpack('<H',bl[0:2])[0]!=prev: errs.append('bad prev link in dir '+path)
        for e in range(13):
            if first and e==0: continue
            o=4+e*39; st=bl[o]>>4
            if not st: continue
            count+=1; name=bl[o+1:o+1+(bl[o]&15)].decode(); kp=struct.unpack('<H',bl[o+17:o+19])[0]
            bu=struct.unpack('<H',bl[o+19:o+21])[0]; eof=bl[o+21]|bl[o+22]<<8|bl[o+23]<<16
            hp=struct.unpack('<H',bl[o+37:o+39])[0]
            if hp!=key: errs.append('%s%s header pointer %d != %d'%(path,name,hp,key))
            n=0
            if st==1: mark(kp,path+name); n=1
            elif st==2:
                mark(kp,path+name+' idx'); n=1; ib=B(kp)
                for i in range(256):
                    p=ib[i]|ib[256+i]<<8
                    if p: mark(p,path+name); n+=1
                if (eof+511)//512 > 256: errs.append('eof too big '+name)
            elif st==3:
                mark(kp,path+name+' master'); n=1; mb=B(kp)
                for j in range(128):
                    q=mb[j]|mb[256+j]<<8
                    if q:
                        mark(q,path+name+' idx'); n+=1; ib=B(q)
                        for i in range(256):
                            p=ib[i]|ib[256+i]<<8
                            if p: mark(p,path+name); n+=1
            elif st==0xd:
                n=walkdir(kp,path+name+'/')
                sh=B(kp)
                if struct.unpack('<H',sh[0x27:0x29])[0]!=b or sh[0x29]!=e+1: errs.append('subdir %s parent pointer wrong'%name)
            if n!=bu: errs.append('%s%s blocks_used %d, actual %d'%(path,name,bu,n))
        first=False; prev=b; b=struct.unpack('<H',bl[2:4])[0]
    hdr=B(key); fc=struct.unpack('<H',hdr[0x25:0x27])[0]
    if fc!=count: errs.append('dir %s file_count %d actual %d'%(path or '/',fc,count))
    return blocks_in(key)
def blocks_in(key):
    n=0;b=key
    while b: n+=1; b=struct.unpack('<H',B(b)[2:4])[0]
    return n
walkdir(2,'')
for b in range(total):
    free=bool(d[bm*512+(b>>3)] & (0x80>>(b&7)))
    if b in used and free: errs.append('block %d in use (%s) but marked free'%(b,used[b]))
    if b not in used and not free: errs.append('block %d marked used but unreferenced'%b)
print(sys.argv[1], 'blocks', total, 'used', len(used), 'OK' if not errs else 'ERRORS:')
for e in errs[:15]: print('  ',e)
