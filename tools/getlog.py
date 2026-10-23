"""Pull /i2clog.txt out of a card image read back after a logging run.

usage: python getlog.py <card.img> <out.txt>
"""
import struct, sys
f = open(sys.argv[1], 'rb')
P2 = 40960 * 512
def rd(off, n): f.seek(P2 + off); return f.read(n)
sb = rd(1024, 1024)
bs = 1024
ipg = struct.unpack_from('<I', sb, 40)[0]
def inode(n):
    g, i = divmod(n - 1, ipg)
    itab = struct.unpack_from('<I', rd(2048 + g * 32, 32), 8)[0]
    return rd(itab * bs + i * 128, 128)
ino = inode(2)
d = struct.unpack_from('<15I', ino, 40)
found = None
for blk in [b for b in d[:12] if b]:
    data = rd(blk * bs, bs); p = 0
    while p < bs:
        ni, rl, nl = struct.unpack_from('<IHB', data, p)
        if ni and data[p+8:p+8+nl] == b'i2clog.txt': found = ni
        if rl == 0: break
        p += rl
print('inode', found)
ino = inode(found)
size = struct.unpack_from('<I', ino, 4)[0]
b = struct.unpack_from('<15I', ino, 40)
bl = list(b[:12])
if b[12]: bl += struct.unpack('<256I', rd(b[12] * bs, bs))
if b[13]:
    for ib in struct.unpack('<256I', rd(b[13] * bs, bs)):
        if ib: bl += struct.unpack('<256I', rd(ib * bs, bs))
out = b''.join(rd(x * bs, bs) if x else bytes(bs) for x in bl)[:size]
open(sys.argv[2], 'wb').write(out)
print('size', size, 'written', len(out))
