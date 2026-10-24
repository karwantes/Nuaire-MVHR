"""Convert a Nuaire VSC SD card so the ESP bridge (or a serial dongle) can talk to the unit.

Works on the card in a PC card reader (Windows: run as admin, Linux: run as root), or on
an image file. Every run that changes a card first makes a full backup and checks it.

    vscconv.py                      menu
    vscconv.py list                 find VSC cards
    vscconv.py status  <target>     stock / converted / unknown
    vscconv.py backup  <target> [file]
    vscconv.py convert <target> [--any-eslcd]
                                    backup, then patch in place, then verify
    vscconv.py restore <target> <backup.img>   needs <backup.img>.sha256 next to it

<target> is a disk number (Windows), /dev/sdX (Linux) or an image file.
convert refuses an es-lcd that isn't the tested build unless --any-eslcd is given.

What convert changes, on the ext2 root partition (nothing else is touched):
  1. the never-loaded wifi module /etc/Wireless/RT2870STA/rt3070sta.ko gets i2clog.so
     written over its first blocks (inode size kept)
  2. /autoexec.bat starts es-lcd with LD_PRELOAD and in the background, so init reaches
     the getty on the console header and the bridge can log in as root
"""
import datetime, hashlib, os, struct, sys

P2_LBA = 40960
KO = '/etc/Wireless/RT2870STA/rt3070sta.ko'
ESLCD = '/opt/dvsdk/dm355/es-lcd'
# The es-lcd build i2clog.so was written for (it calls fixed addresses inside it)
ESLCD_SHA = 'cf180ac6f0642b9035174b59ab07e804966bcbf8e50b8ca00a5f6037a7df14f5'
STOCK_RUN = b'\n./es-lcd\n'
CONV_RUN = b'\nLD_PRELOAD=' + KO.encode() + b' ./es-lcd </dev/null >/dev/null 2>&1 &\n'
MAX_CARD = 64 << 30
CHUNK = 1 << 20
WIN = os.name == 'nt'


def here(name):
    base = getattr(sys, '_MEIPASS', os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


def load_so():
    so = open(here('i2clog.so'), 'rb').read()
    # ELF, 32-bit, little endian, machine 40 (ARM), shared object
    if so[:6] != b'\x7fELF\x01\x01' or struct.unpack_from('<HH', so, 16) != (3, 40):
        raise SystemExit('i2clog.so next to this tool is not an ARM shared library')
    return so


# ---------------------------------------------------------------- devices

class Image:
    """An image file, or a raw disk opened as a file (Linux)."""
    def __init__(self, path, write=False):
        self.name = path
        self.f = open(path, 'r+b' if write else 'rb', buffering=0)
        self.f.seek(0, 2); self.size = self.f.tell()

    def read(self, off, n):
        self.f.seek(off); return self.f.read(n)

    def write(self, off, data):
        self.f.seek(off); self.f.write(data)

    def flush(self):
        os.fsync(self.f.fileno())

    def close(self):
        self.f.close()


if WIN:
    import ctypes, msvcrt
    from ctypes import wintypes
    k32 = ctypes.WinDLL('kernel32', use_last_error=True)
    k32.CreateFileW.restype = wintypes.HANDLE
    k32.CreateFileW.argtypes = [wintypes.LPCWSTR, wintypes.DWORD, wintypes.DWORD, ctypes.c_void_p,
                                wintypes.DWORD, wintypes.DWORD, wintypes.HANDLE]
    k32.DeviceIoControl.argtypes = [wintypes.HANDLE, wintypes.DWORD, ctypes.c_void_p, wintypes.DWORD,
                                    ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(wintypes.DWORD), ctypes.c_void_p]
    k32.CloseHandle.argtypes = [wintypes.HANDLE]
    INVALID = wintypes.HANDLE(-1).value
    GENERIC_RW, SHARE_RW, OPEN_EXISTING = 0xC0000000, 3, 3
    IOCTL_DISK_GET_LENGTH_INFO = 0x7405C
    IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS = 0x560000
    FSCTL_LOCK_VOLUME, FSCTL_DISMOUNT_VOLUME = 0x90018, 0x90020

    def _open(path, access=0x80000000):
        h = k32.CreateFileW(path, access, SHARE_RW, None, OPEN_EXISTING, 0, None)
        if h == INVALID or h is None:
            raise OSError(ctypes.get_last_error(), 'cannot open ' + path)
        return h

    def _ioctl(h, code, out=None):
        n = wintypes.DWORD()
        ok = k32.DeviceIoControl(h, code, None, 0, ctypes.byref(out) if out is not None else None,
                                 ctypes.sizeof(out) if out is not None else 0, ctypes.byref(n), None)
        return ok

    def _disk_size(h):
        out = ctypes.c_longlong()
        if not _ioctl(h, IOCTL_DISK_GET_LENGTH_INFO, out):
            raise OSError(ctypes.get_last_error(), 'disk size')
        return out.value

    def _volumes_on(disk):
        """Drive letters whose volume sits on this physical disk."""
        res = []
        for c in 'ABCDEFGHIJKLMNOPQRSTUVWXYZ':
            try:
                h = _open('\\\\.\\%s:' % c, 0)
            except OSError:
                continue
            buf = (ctypes.c_byte * 256)()
            if _ioctl(h, IOCTL_VOLUME_GET_VOLUME_DISK_EXTENTS, buf):
                count = struct.unpack_from('<I', bytes(buf), 0)[0]
                for i in range(count):
                    if struct.unpack_from('<I', bytes(buf), 8 + i * 24)[0] == disk:
                        res.append(c)
            k32.CloseHandle(h)
        return res

    class Disk(Image):
        """\\\\.\\PhysicalDriveN. Writing locks and dismounts its lettered volumes first."""
        def __init__(self, num, write=False):
            self.num, self.name, self.locks = num, 'disk %d' % num, []
            if write:
                for c in _volumes_on(num):
                    h = _open('\\\\.\\%s:' % c, GENERIC_RW)
                    if not _ioctl(h, FSCTL_LOCK_VOLUME):
                        raise OSError(ctypes.get_last_error(), 'cannot lock %s: (close Explorer windows on it)' % c)
                    _ioctl(h, FSCTL_DISMOUNT_VOLUME)
                    self.locks.append(h)
            self.h = _open('\\\\.\\PhysicalDrive%d' % num, GENERIC_RW if write else 0x80000000)
            self.size = _disk_size(self.h)
            fd = msvcrt.open_osfhandle(self.h, 0 if write else os.O_RDONLY)
            self.f = os.fdopen(fd, 'r+b' if write else 'rb', buffering=0)

        def close(self):
            self.f.close()
            for h in self.locks:
                k32.CloseHandle(h)


def open_target(t, write=False):
    if WIN and t.isdigit():
        return Disk(int(t), write)
    if write and t.startswith('/dev/'):
        mounted = [l.split()[0] for l in open('/proc/mounts') if l.startswith(t)]
        if mounted:
            raise VscError('unmount first: ' + ' '.join(mounted))
    return Image(t, write)


def candidates():
    """Disks that look like a VSC card."""
    found = []
    if WIN:
        names = [str(i) for i in range(32)]
    else:
        names = ['/dev/' + d for d in sorted(os.listdir('/sys/block'))
                 if not d.startswith(('loop', 'ram', 'zram', 'dm-', 'sr'))]
    for n in names:
        try:
            dev = open_target(n)
        except OSError:
            continue
        try:
            if dev.size <= MAX_CARD:
                fs = Ext2(dev)
                found.append((n, dev.size, state(fs)))
        except (VscError, OSError, struct.error):
            pass
        finally:
            dev.close()
    return found


def any_cards():
    """Every disk up to MAX_CARD that isn't the system disk, VSC or not (for restoring to a blank card)."""
    found = []
    if WIN:
        sysdrive = os.environ.get('SystemDrive', 'C:')[0].upper()
        names = [str(i) for i in range(32)]
    else:
        root = [l.split()[0] for l in open('/proc/mounts') if l.split()[1] == '/']
        names = ['/dev/' + d for d in sorted(os.listdir('/sys/block'))
                 if not d.startswith(('loop', 'ram', 'zram', 'dm-', 'sr'))]
    for n in names:
        try:
            dev = open_target(n)
        except OSError:
            continue
        try:
            if not 0 < dev.size <= MAX_CARD:
                continue
            letters = _volumes_on(int(n)) if WIN else []
            if (WIN and sysdrive in letters) or (not WIN and any(r.startswith(n) for r in root)):
                continue
            try:
                what = 'VSC card, ' + state(Ext2(dev))
            except (VscError, OSError, struct.error):
                what = 'not a VSC card'
            if letters:
                what += ', drive ' + ' '.join(c + ':' for c in letters)
            found.append((n, dev.size, what))
        finally:
            dev.close()
    return found


# ---------------------------------------------------------------- ext2 (read and in-place patch)

class VscError(Exception):
    pass


class EslcdError(VscError):
    pass


class Ext2:
    """The VSC root partition. Reads go through a sector cache so small reads are aligned."""
    def __init__(self, dev):
        self.dev = dev
        mbr = dev.read(0, 512)
        if mbr[510:512] != b'\x55\xaa':
            raise VscError('no MBR')
        parts = [struct.unpack_from('<4xB3xII', mbr, 446 + 16 * i) for i in range(4)]
        if parts[0][0] not in (0x0b, 0x0c) or parts[1][0] != 0x83 or parts[1][1] != P2_LBA:
            raise VscError('partition layout is not a VSC card')
        self.base = P2_LBA * 512
        sb = self.rd(1024, 1024)
        if struct.unpack_from('<H', sb, 56)[0] != 0xEF53:
            raise VscError('partition 2 is not ext2')
        self.bs = 1024 << struct.unpack_from('<I', sb, 24)[0]
        self.ipg = struct.unpack_from('<I', sb, 40)[0]
        self.isz = struct.unpack_from('<H', sb, 88)[0] or 128
        self.gdt = 2048 if self.bs == 1024 else self.bs
        self.lookup(ESLCD)

    def rd(self, off, n):
        a = (self.base + off) // 512 * 512
        e = -(-(self.base + off + n) // 512) * 512
        d = self.dev.read(a, e - a)
        s = self.base + off - a
        return d[s:s + n]

    def inode_off(self, n):
        g, i = divmod(n - 1, self.ipg)
        return struct.unpack_from('<I', self.rd(self.gdt + g * 32, 32), 8)[0] * self.bs + i * self.isz

    def inode(self, n):
        ino = self.rd(self.inode_off(n), self.isz)
        return struct.unpack_from('<I', ino, 4)[0], struct.unpack_from('<15I', ino, 40)

    def file_blocks(self, n, need=None):
        """Size and the first `need` data blocks (default all)."""
        size, b = self.inode(n)
        nb = -(-size // self.bs) if need is None else need
        bl = list(b[:12])

        def ind(blk, depth):
            ptrs = struct.unpack('<%dI' % (self.bs // 4), self.rd(blk * self.bs, self.bs))
            if depth == 1:
                bl.extend(ptrs); return
            for p in ptrs:
                if len(bl) >= nb or not p:
                    return
                ind(p, depth - 1)

        for depth, blk in ((1, b[12]), (2, b[13]), (3, b[14])):
            if len(bl) >= nb or not blk:
                break
            ind(blk, depth)
        if nb > len(bl):
            raise VscError('file blocks missing')
        return size, bl[:nb]

    def lookup(self, path):
        n = 2
        for part in path.strip('/').split('/'):
            _, bl = self.file_blocks(n)
            found = None
            for blk in bl:
                d = self.rd(blk * self.bs, self.bs); p = 0
                while p < self.bs:
                    ni, rl, nl = struct.unpack_from('<IHB', d, p)
                    if ni and d[p + 8:p + 8 + nl] == part.encode():
                        found = ni; break
                    if rl < 8:
                        break
                    p += rl
                if found:
                    break
            if not found:
                raise VscError('not found on card: ' + path)
            n = found
        return n

    def read_file(self, path, limit=None):
        n = self.lookup(path)
        size = self.inode(n)[0] if limit is None else min(self.inode(n)[0], limit)
        _, bl = self.file_blocks(n, -(-size // self.bs))
        data = b''.join(self.rd(b * self.bs, self.bs) for b in bl[:-(-size // self.bs)])
        return data[:size]


def state(fs):
    auto = fs.read_file('/autoexec.bat')
    if CONV_RUN in auto:
        return 'converted'
    if STOCK_RUN in auto and b'LD_PRELOAD' not in auto:
        return 'stock'
    return 'unknown'


def eslcd_sha(fs):
    return hashlib.sha256(fs.read_file(ESLCD)).hexdigest()


def plan_convert(fs, so):
    """List of (absolute offset, bytes) writes. Nothing is written here."""
    writes = []
    # 1. i2clog.so over the first blocks of the wifi module, size unchanged
    ko = fs.lookup(KO)
    size, bl = fs.file_blocks(ko, -(-len(so) // fs.bs))
    if len(so) > size:
        raise VscError('i2clog.so is larger than the wifi module it replaces')
    for i in range(-(-len(so) // fs.bs)):
        chunk = so[i * fs.bs:(i + 1) * fs.bs]
        chunk += fs.rd(bl[i] * fs.bs + len(chunk), fs.bs - len(chunk))
        writes.append((fs.base + bl[i] * fs.bs, chunk))
    # 2. autoexec.bat: same blocks, new size
    an = fs.lookup('/autoexec.bat')
    size, bl = fs.file_blocks(an)
    old = fs.read_file('/autoexec.bat')
    new = old.replace(STOCK_RUN, CONV_RUN, 1).rstrip() + b'\n'
    if -(-len(new) // fs.bs) > len(bl):
        raise VscError('autoexec.bat would need a new block')
    for i in range(-(-len(new) // fs.bs)):
        writes.append((fs.base + bl[i] * fs.bs, new[i * fs.bs:(i + 1) * fs.bs].ljust(fs.bs, b'\0')))
    ioff = fs.base + fs.inode_off(an)
    sec = ioff // 512 * 512
    s = bytearray(fs.dev.read(sec, 512))
    struct.pack_into('<I', s, ioff - sec + 4, len(new))
    writes.append((sec, bytes(s)))
    return writes


# ---------------------------------------------------------------- actions

def sha_of(dev, length, progress=''):
    h = hashlib.sha256(); done = 0
    while done < length:
        n = min(CHUNK, length - done)
        h.update(dev.read(done, n)); done += n
        if progress and done % (64 * CHUNK) == 0:
            print('\r%s %d%%' % (progress, done * 100 // length), end='', flush=True)
    if progress:
        print('\r%s 100%%' % progress)
    return h.hexdigest()


def backup(target, out=None):
    dev = open_target(target)
    try:
        Ext2(dev)
        out = out or 'vsc_backup_%s.img' % datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        if os.path.exists(out):
            raise VscError(out + ' already exists')
        h = hashlib.sha256(); done = 0
        with open(out, 'wb') as f:
            while done < dev.size:
                b = dev.read(done, min(CHUNK, dev.size - done))
                f.write(b); h.update(b); done += len(b)
                if done % (64 * CHUNK) == 0:
                    print('\rreading card %d%%' % (done * 100 // dev.size), end='', flush=True)
        print('\rreading card 100%')
        a = h.hexdigest()
        b = sha_of(dev, dev.size, 'reading card again')
        c = sha_of(Image(out), dev.size, 'checking backup file')
        if not a == b == c:
            raise VscError('backup does not match the card (card %s / %s, file %s)' % (a, b, c))
        open(out + '.sha256', 'w').write('%s  %s\n' % (a, os.path.basename(out)))
        print('backup ok:', os.path.abspath(out), a)
        return out, a
    finally:
        dev.close()


def convert(target, so=None, any_eslcd=False):
    so = so or load_so()
    dev = open_target(target)
    try:
        fs = Ext2(dev)
        st = state(fs)
        print('card is', st)
        if st == 'converted':
            return
        if st != 'stock':
            raise VscError('boot script is not the stock one, not touching it (restore a backup first)')
        if eslcd_sha(fs) != ESLCD_SHA:
            if not any_eslcd:
                raise EslcdError('es-lcd on this card is not the tested build. i2clog.so calls fixed '
                                 'addresses inside it, so the screen may not work. Nothing was changed.')
            print('WARNING: es-lcd is not the tested build, converting anyway')
        plan_convert(fs, so)  # fail here, before the backup, if the card can't be patched
    finally:
        dev.close()
    backup(target)
    dev = open_target(target, write=True)
    try:
        fs = Ext2(dev)
        writes = plan_convert(fs, so)
        for off, data in writes:
            dev.write(off, data)
        dev.flush()
        for off, data in writes:
            if dev.read(off, len(data)) != data:
                raise VscError('readback differs at offset %d, restore the backup' % off)
        fs = Ext2(dev)
        if state(fs) != 'converted' or fs.read_file(KO, len(so)) != so:
            raise VscError('card does not read back as converted, restore the backup')
    finally:
        dev.close()
    print('converted: %d writes, all verified. Put the card back in the VSC.' % len(writes))


def restore(target, image):
    side = image + '.sha256'
    if not os.path.exists(side):
        raise VscError('%s is missing. Keep it next to the backup, it is needed to check the backup '
                       'before writing' % os.path.basename(side))
    src = Image(image)
    try:
        Ext2(src)
        want = sha_of(src, src.size, 'checking backup file')
        if open(side).read().split()[0].lower() != want:
            raise VscError('backup file does not match its .sha256, not writing it')
        dev = open_target(target, write=True)
        try:
            if src.size > dev.size:
                raise VscError('backup is larger than the card (%d > %d bytes)' % (src.size, dev.size))
            done = 0
            while done < src.size:
                b = src.read(done, min(CHUNK, src.size - done))
                dev.write(done, b.ljust(-(-len(b) // 512) * 512, b'\0')); done += len(b)
                if done % (64 * CHUNK) == 0:
                    print('\rwriting card %d%%' % (done * 100 // src.size), end='', flush=True)
            print('\rwriting card 100%')
            dev.flush()
            got = sha_of(dev, src.size, 'reading card back')
            if got != want:
                raise VscError('card readback does not match the backup')
        finally:
            dev.close()
    finally:
        src.close()
    print('restored and verified:', want)


def need_admin():
    if WIN:
        if not ctypes.windll.shell32.IsUserAnAdmin():
            raise SystemExit('run this as administrator')
    elif os.geteuid() != 0:
        raise SystemExit('run this as root')


def show(found):
    if not found:
        print('no VSC card found. Put it in the card reader and try again.')
    for n, size, st in found:
        print('  %-12s %6.2f GB  %s' % (n if not WIN else 'disk ' + n, size / 1e9, st))


def restore_any():
    """Menu 5: restore a backup to any card, blank or not. The disk number has to be typed twice."""
    cards = any_cards()
    if not cards:
        print('no card found (the system disk and disks over %d GB are never listed)' % (MAX_CARD >> 30))
        return
    for n, size, what in cards:
        print('  %-12s %6.2f GB  %s' % (n if not WIN else 'disk ' + n, size / 1e9, what))
    t = input('which disk (as listed)? ').strip().replace('disk ', '')
    card = [f for f in cards if f[0] == t]
    if not card:
        print('not one of the listed disks'); return
    img = input('backup .img file: ').strip().strip('"')
    if not os.path.isfile(img):
        print('no such file'); return
    if os.path.getsize(img) > card[0][1]:
        print('backup is larger than this card (%d > %d bytes)' % (os.path.getsize(img), card[0][1])); return
    print('EVERYTHING on %s (%.2f GB, %s) will be overwritten with %s.'
          % (t if not WIN else 'disk ' + t, card[0][1] / 1e9, card[0][2], img))
    if input('type the disk %s again to go ahead: ' % ('number' if WIN else 'name')).strip().replace('disk ', '') != t:
        print('not restored'); return
    restore(t, img)


def menu():
    need_admin()
    while True:
        print('\nNuaire VSC card converter')
        found = candidates(); show(found)
        print('\n  1 convert   2 backup only   3 restore a backup   4 rescan'
              '\n  5 restore to a blank or other card   q quit')
        c = input('> ').strip().lower()
        if c == 'q':
            return
        try:
            if c == '5':
                restore_any(); continue
            if c not in ('1', '2', '3') or not found:
                continue
            t = found[0][0] if len(found) == 1 else input('which card (as listed)? ').strip().replace('disk ', '')
            if t not in [f[0] for f in found]:
                print('not one of the listed cards'); continue
            if c == '1':
                if input('convert %s? backup is made first [y/N] ' % t).lower() == 'y':
                    try:
                        convert(t)
                    except EslcdError as e:
                        print('WARNING:', e)
                        if input('type yes to convert anyway: ').strip().lower() == 'yes':
                            convert(t, any_eslcd=True)
            elif c == '2':
                backup(t)
            else:
                img = input('backup .img file: ').strip().strip('"')
                if input('overwrite the WHOLE card %s with %s? [y/N] ' % (t, img)).lower() == 'y':
                    restore(t, img)
        except (VscError, OSError) as e:
            print('ERROR:', e)


def main(a):
    if not a:
        menu(); return
    any_eslcd = '--any-eslcd' in a
    a = [x for x in a if x != '--any-eslcd']
    cmd, rest = a[0], a[1:]
    if cmd == 'list':
        show(candidates())
    elif cmd == 'status':
        dev = open_target(rest[0])
        try:
            fs = Ext2(dev)
            print(state(fs))
            print('es-lcd:', 'tested build' if eslcd_sha(fs) == ESLCD_SHA else 'NOT the tested build')
        finally:
            dev.close()
    elif cmd == 'backup':
        backup(*rest)
    elif cmd == 'convert':
        convert(rest[0], any_eslcd=any_eslcd)
    elif cmd == 'restore':
        restore(rest[0], rest[1])
    else:
        print(__doc__)


if __name__ == '__main__':
    try:
        main(sys.argv[1:])
    except VscError as e:
        raise SystemExit('ERROR: %s' % e)
    if WIN and getattr(sys, 'frozen', False) and len(sys.argv) == 1:
        input('press Enter to close')
