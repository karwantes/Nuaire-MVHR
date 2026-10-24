# VSC card converter

Converts the VSC's SD card in a PC card reader, so the ESP bridge (or a serial dongle on
the console header) can log in and read the unit. Home Assistant only connects
afterwards; it does not convert anything.

A stock VSC can't be converted over the console: es-lcd runs in the foreground of the
boot script with no shell, and Ctrl-C doesn't reach it. So the card has to come out once.

## What it does

1. Checks the card really is a VSC card (MBR layout, ext2 root, `es-lcd` present).
2. Checks the boot script is stock. Anything else is left alone.
3. Makes a full backup of the card, reads the card a second time and checks the file,
   all by SHA256 (`vsc_backup_<date>.img` plus a `.sha256`).
4. Patches the root partition in place (26 blocks):
   - `i2clog.so` over the first blocks of `/etc/Wireless/RT2870STA/rt3070sta.ko`
     (the wifi module, never loaded on this unit);
   - `/autoexec.bat` starts es-lcd with `LD_PRELOAD` and in the background, so init
     reaches the console login.
5. Reads every written block back and checks the card now reads as converted.

**Restore** writes a backup back over the whole card and checks it by SHA256.

## Windows

`vscconv.exe` (Python and `i2clog.so` are inside), from the
[latest release](https://github.com/karwantes/Nuaire-MVHR/releases/latest). Start it,
accept the admin prompt, pick 1 to convert. Close any Explorer window on the card first.

![vscconv.exe converting a card](../../docs/images/vscconv.png)

Build: `build_exe.ps1` (needs PyInstaller).

## Linux (experimental)

```
sudo python3 vscconv.py
```

Same menu. Needs `i2clog.so` next to the script. **Requires further testing.**

## Command line

```
vscconv.py list
vscconv.py status  <disk number | /dev/sdX | file.img>
vscconv.py backup  <target> [file]
vscconv.py convert <target>
vscconv.py restore <target> <backup.img>
```

## Tested

- Convert, re-convert (no-op) and restore on image copies of a stock card: changes only
  the expected blocks, restore gives back the stock image bit for bit.
- On a real card in a USB reader (Windows EXE): backup checked, 26 writes verified. The
  converted card booted in the VSC, the ESP bridge logged in and read the unit.
- Restore on a real card, and the Linux version on a real card: **requires further
  testing**.

Step-by-step guide with parts and wiring: [docs/convert-card.md](../../docs/convert-card.md).
