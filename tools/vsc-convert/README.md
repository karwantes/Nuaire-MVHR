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

**Restore** writes a backup back over the whole card and reads it all back to check it by
SHA256. It checks the backup file against its `.sha256` first only if that file sits next to
it with the same name, so keep the two together. The menu only offers cards it recognises
as a VSC card; for a blank or replacement card use `restore <disk> <backup.img>` from an
admin command prompt (no confirmation, **requires further testing**). See
[docs/convert-card.md](../../docs/convert-card.md#9-restore-and-recovery).

The backup is saved in the current folder and needs free space the size of the card.

## Windows

`vscconv.exe` (Python and `i2clog.so` are inside), from the
[latest release](https://github.com/karwantes/Nuaire-MVHR/releases/latest). Start it,
accept the admin prompt, pick 1 to convert. Close any Explorer window on the card first.

![vscconv.exe converting a card](../../docs/images/vscconv.png)

Build: `build_exe.ps1` (needs PyInstaller).

## Linux

```
sudo python3 vscconv.py
```

Same menu. Needs `i2clog.so` next to the script. Tested in WSL2 (Ubuntu) with the card
reader passed through by usbipd-win; a native Linux PC requires further testing.

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
- On the same real card in WSL2: status, backup, restore of the stock backup (read back
  identical, status `stock`), then convert again (26 writes verified). The card then
  matched a converted copy of the stock image bit for bit.
- Booting a restored stock card in the VSC, and restoring to a blank or replacement card:
  **requires further testing**.
- Tested release: vscconv-1.0. The 26 writes are for that release's `i2clog.so`.

Step-by-step guide with parts and wiring: [docs/convert-card.md](../../docs/convert-card.md).
