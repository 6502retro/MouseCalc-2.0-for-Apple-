import sys, difflib
from py65.devices.mpu65c02 import MPU
from py65.disassembler import Disassembler
def dis(data, org):
    m = MPU(); m.memory[org:org+len(data)] = list(data); D = Disassembler(m); pc = org; out = []
    while pc < org + len(data):
        l, t = D.instruction_at(pc)
        out.append((pc, bytes(data[pc-org:pc-org+l]), t)); pc += l
    return out
def norm(ins, lo, hi):
    pc, b, t = ins
    op = t.split()[0]
    if len(b) == 3:
        w = b[1] | b[2] << 8
        return op + (' ABS' if lo <= w < hi else ' $%04X' % w)
    if len(b) == 2 and op in ('BCC','BCS','BEQ','BNE','BMI','BPL','BVC','BVS','BRA'): return op + ' REL'
    return t
def diff(a, b, org, lo=0x0800, hi=0xC000):
    A = dis(a, org); B = dis(b, org)
    na = [norm(x, lo, hi) for x in A]; nb = [norm(x, lo, hi) for x in B]
    sm = difflib.SequenceMatcher(None, na, nb, autojunk=False)
    return A, B, sm.get_opcodes()
