"""Build a logging/debug SD card image from a copy of a stock VSC card dump.

usage: python mkimg.py <stock.img> <out.img>
Run from a folder that has logger/i2clog.so, rootfs_p2/autoexec.bat (extracted from the
stock card's 2nd partition) and welcomepage_new.png. The stock image is only read.
"""
import struct, sys, shutil, hashlib
SRC, DST = sys.argv[1], sys.argv[2]
assert SRC != DST
P2 = 40960 * 512
shutil.copyfile(SRC, DST)
f = open(DST, 'r+b')
def rd(off, n): f.seek(P2 + off); return f.read(n)
def wr(off, b): f.seek(P2 + off); f.write(b)
sb = rd(1024, 1024)
assert struct.unpack_from('<H', sb, 56)[0] == 0xEF53
bs = 1024 << struct.unpack_from('<I', sb, 24)[0]
ipg = struct.unpack_from('<I', sb, 40)[0]
isz = struct.unpack_from('<H', sb, 88)[0] or 128
gdt = (2 if bs == 1024 else 1) * bs if bs == 1024 else bs
print('block size', bs, 'inodes/group', ipg, 'inode size', isz)
def inode_off(n):
    g, i = divmod(n - 1, ipg)
    itab = struct.unpack_from('<I', rd(gdt + g * 32, 32), 8)[0]
    return itab * bs + i * isz
def inode(n):
    return rd(inode_off(n), isz)
def blocks(ino):
    b = struct.unpack_from('<15I', ino, 40)
    out = [x for x in b[:12]]
    return out, b[12:]
def lookup(path):
    n = 2
    for part in path.strip('/').split('/'):
        ino = inode(n); size = struct.unpack_from('<I', ino, 4)[0]
        d, _ = blocks(ino)
        found = None
        for blk in d:
            if not blk: continue
            data = rd(blk * bs, bs); p = 0
            while p < bs:
                ni, rl, nl = struct.unpack_from('<IHB', data, p)
                if ni and data[p+8:p+8+nl].decode('latin1') == part: found = ni; break
                if rl == 0: break
                p += rl
            if found: break
        assert found, part
        n = found
    return n
def rewrite_first_block(path, content, set_size=None):
    n = lookup(path); ino = inode(n)
    d, _ = blocks(ino)
    nb = (len(content) + bs - 1) // bs
    assert nb <= 12 and all(d[:nb])
    for i in range(nb):
        chunk = content[i*bs:(i+1)*bs]
        if set_size is not None: chunk = chunk.ljust(bs, bytes([0]))
        wr(d[i] * bs, chunk)
    if set_size is not None:
        wr(inode_off(n) + 4, struct.pack('<I', set_size))
    print(path, 'inode', n, 'blocks', d[:nb])
    return n

# 1. logger library into the first block of the (never loaded) wifi module
so = open('logger/i2clog.so', 'rb').read()
rewrite_first_block('/etc/Wireless/RT2870STA/rt3070sta.ko', so)
# 2. autoexec.bat
old = open('rootfs_p2/autoexec.bat', 'rb').read()
new = old.replace(b'./es-lcd\n', b'LD_PRELOAD=/etc/Wireless/RT2870STA/rt3070sta.ko ./es-lcd\n', 1).rstrip() + b'\n'
assert new != old
rewrite_first_block('/autoexec.bat', new, set_size=len(new))
# 3. boot logo: same-size overwrite, walking direct + single-indirect blocks
def write_same_size(path, content):
    n = lookup(path); ino = inode(n)
    size = struct.unpack_from('<I', ino, 4)[0]
    assert len(content) <= size
    content = content.ljust(size, bytes([0]))
    d, ind = blocks(ino)
    bl = list(d) + list(struct.unpack('<%dI' % (bs // 4), rd(ind[0] * bs, bs)))
    nb = (size + bs - 1) // bs
    assert nb <= len(bl) and all(bl[:nb])
    for i in range(nb):
        wr(bl[i] * bs, content[i*bs:(i+1)*bs].ljust(bs, bytes([0])))
    print(path, 'inode', n, 'size', size, 'blocks', nb)
write_same_size('/opt/dvsdk/dm355/images/welcomepage.png', open('welcomepage_new.png', 'rb').read())
f.close()
print(len(old), '->', len(new))
h = lambda p: hashlib.sha256(open(p, 'rb').read()).hexdigest().upper()
print('original', h(SRC)); print('modified', h(DST))
