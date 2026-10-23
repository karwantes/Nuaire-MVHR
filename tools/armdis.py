"""Annotated ARM disassembly of es-lcd (needs pyelftools + capstone).

usage: python armdis.py                 list functions
       python armdis.py <func> ...      disassemble functions
       python armdis.py callers <func>  find call sites
Set ESLCD to the es-lcd path if it isn't at rootfs_p2/opt/dvsdk/dm355/es-lcd.
"""
import os, sys, re
from elftools.elf.elffile import ELFFile
from capstone import *

P = os.environ.get('ESLCD', 'rootfs_p2/opt/dvsdk/dm355/es-lcd')
e = ELFFile(open(P, 'rb'))
syms = []
for s in e.get_section_by_name('.symtab').iter_symbols():
    if s['st_info']['type'] == 'STT_FUNC' and s['st_value']:
        syms.append((s['st_value'] & ~1, s['st_size'], s.name))
syms.sort()

secs = [(s['sh_addr'], s['sh_size'], s.data()) for s in e.iter_sections()
        if s['sh_addr'] and s['sh_type'] != 'SHT_NOBITS']


def rd(addr, n):
    for a, sz, d in secs:
        if a <= addr < a + sz:
            return d[addr - a:addr - a + n]
    return None


def symname(t):
    for a, sz, n in syms:
        if a <= t < a + max(sz, 4):
            return n + ('' if a == t else '+%d' % (t - a))
    return None


def cstr(v):
    b = rd(v, 60)
    if b and b[0] >= 32 and all(32 <= c < 127 for c in b.split(b'\x00')[0]):
        return b.split(b'\x00')[0].decode('latin1')


md = Cs(CS_ARCH_ARM, CS_MODE_ARM)


def dis(a, sz):
    out = []
    for i in md.disasm(rd(a, sz), a):
        x = ''
        if i.mnemonic == 'ldr' and '[pc' in i.op_str:
            m = re.search(r'#(-?0x[0-9a-f]+|-?[0-9]+)', i.op_str)
            off = int(m.group(1), 0) if m else 0
            b = rd(i.address + 8 + off, 4)
            if b:
                v = int.from_bytes(b, 'little')
                x = '   ; =%#x' % v
                s = cstr(v)
                if s:
                    x += ' "%s"' % s
        if i.mnemonic == 'bl' and i.op_str.startswith('#'):
            n = symname(int(i.op_str[1:], 0))
            if n:
                x = '   ; ' + n
        out.append('%x: %s %s%s' % (i.address, i.mnemonic, i.op_str, x))
    return out


if len(sys.argv) < 2:
    for a, sz, n in syms:
        print(hex(a), sz, n)
elif sys.argv[1] == 'callers':
    for a, sz, n in syms:
        if a < 0x9000:
            continue
        for l in dis(a, sz):
            if l.endswith('; ' + sys.argv[2]):
                print(n, l)
else:
    for name in sys.argv[1:]:
        for a, sz, n in syms:
            if n == name:
                print('=====', n, hex(a), sz)
                print('\n'.join(dis(a, sz)))
