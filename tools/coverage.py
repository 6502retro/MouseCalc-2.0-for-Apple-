import sys; sys.path.insert(0,'tools')
from asmdiff import dis
a=open(sys.argv[5],'rb').read(); b=open(sys.argv[6],'rb').read()
off,ln,org=int(sys.argv[1],16),int(sys.argv[2],16),int(sys.argv[3],16)
K=int(sys.argv[4]) if len(sys.argv)>4 else 5
def toks(data):
    D=dis(data,org); out=[]
    for pc,bb,t in D:
        op=bb[0]
        if len(bb)==3: tok=(op,)          # mask 16-bit operands
        elif len(bb)==2:
            mn=t.split()[0]
            tok=(op,) if (t.find('#')>=0 or mn.startswith('B')) else (op,bb[1])   # mask immediates & branches
        else: tok=(op,)
        out.append((pc,bb,t,tok))
    return out
TA=toks(a[off:off+ln]); TB=toks(b[off:off+ln])
def grams(T): return set(tuple(x[3] for x in T[i:i+K]) for i in range(len(T)-K+1))
def uncovered(T, G):
    cov=[False]*len(T)
    for i in range(len(T)-K+1):
        if tuple(x[3] for x in T[i:i+K]) in G:
            for j in range(i,i+K): cov[j]=True
    runs=[];i=0
    while i<len(T):
        if not cov[i]:
            j=i
            while j<len(T) and not cov[j]: j+=1
            runs.append((i,j)); i=j
        else: i+=1
    return runs
def texty(ins):
    raw=b''.join(x[1] for x in ins)
    return sum(1 for c in raw if 0xA0<=c<=0xFA or 0x20<=c<=0x7A)/max(1,len(raw))>0.7
def show(label,T,runs):
    print('#####',label)
    for i,j in runs:
        seg=T[i:j]
        if j-i<3 or texty(seg) or sum('???' in x[2] for x in seg)>0: continue
        print('--- $%04X-$%04X (%d ins)'%(seg[0][0],seg[-1][0],j-i))
        for x in seg[:40]: print('    %04X %-8s %s'%(x[0],x[1].hex(),x[2]))
show('IN MOUSE CALC, NOT IN VERSION CALC',TA,uncovered(TA,grams(TB)))
show('IN VERSION CALC, NOT IN MOUSE CALC',TB,uncovered(TB,grams(TA)))
