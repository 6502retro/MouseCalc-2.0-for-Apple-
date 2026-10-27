import sys,struct
MAP=[0,2,4,6,8,10,12,14,1,3,5,7,9,11,13,15]  # input is physical-order
def to_po(d):
    o=bytearray(len(d))
    for t in range(35):
        for ps in range(16):
            o[(t*16+ps)*256:(t*16+ps+1)*256]=d[(t*16+MAP[ps])*256:(t*16+MAP[ps]+1)*256]
    return o
D2P=[0,14,13,12,11,10,9,8,7,6,5,4,3,2,1,15]  # ProDOS sector p <- DOS-order sector D2P[p]
def dsk_to_po(d):
    o=bytearray(len(d))
    for t in range(35):
        for p in range(16):
            o[(t*16+p)*256:(t*16+p+1)*256]=d[(t*16+D2P[p])*256:(t*16+D2P[p]+1)*256]
    return o
class Vol:
    def __init__(s,po): s.d=po
    def blk(s,n): return s.d[n*512:(n+1)*512]
    def dir(s,key,path=''):
        b=key;first=True;res=[]
        while b:
            bl=s.blk(b)
            for e in range(13):
                if first and e==0: continue
                o=4+e*39;st=bl[o]>>4;nl=bl[o]&15
                if st==0: continue
                name=bl[o+1:o+1+nl].decode()
                ft=bl[o+16];kp=struct.unpack('<H',bl[o+17:o+19])[0]
                bu=struct.unpack('<H',bl[o+19:o+21])[0]
                eof=bl[o+21]|bl[o+22]<<8|bl[o+23]<<16
                aux=struct.unpack('<H',bl[o+31:o+33])[0]
                res.append((path+name,st,ft,kp,eof,aux))
                if st==0xD: res+=s.dir(kp,path+name+'/')
            first=False
            b=struct.unpack('<H',bl[2:4])[0]
        return res
    def read(s,st,kp,eof):
        if st==1: data=s.blk(kp)
        elif st==2:
            ib=s.blk(kp);data=b''
            for i in range(256):
                p=ib[i]|ib[256+i]<<8
                data+=s.blk(p) if p else bytes(512)
        elif st==3:
            mb=s.blk(kp);data=b''
            for j in range(128):
                q=mb[j]|mb[256+j]<<8
                if not q: break
                ib=s.blk(q)
                for i in range(256):
                    p=ib[i]|ib[256+i]<<8
                    data+=s.blk(p) if p else bytes(512)
        return data[:eof]
if __name__=='__main__':
    po=to_po(open(sys.argv[1],'rb').read())
    open(sys.argv[2],'wb').write(po)
    v=Vol(po); vh=v.blk(2)
    print('VOLUME /'+vh[5:5+(vh[4]&15)].decode())
    for r in v.dir(2): print('%-30s st=%x type=%02x eof=%6d aux=%04x'%(r[0],r[1],r[2],r[4],r[5]))
