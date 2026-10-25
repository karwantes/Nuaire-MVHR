# Build a logger card (research)

For research only. To get Home Assistant working you do not need this: use [option 2](option2-vsc-console.md), which converts the card in place with `vscconv.exe`.

## Using the logger image

1. Build a logger image from your own card (below) and write it to a spare SD card. **Keep your original card safe.**
2. Boot the VSC. The changed boot logo tells you the modified card is running.
3. Go to **Maintenance** and tap the Nuaire logo to open the debug page.
   - Page 1 shows the decoded status, the flags and the last TX frame.
   - Tap the logo again for page 2: the full 28-byte replies for each request type (`01`, `0c`, `0d`).
   - Press Home to exit.
4. Debug logging is off by default, so the card isn't written all the time. To turn it on, run `touch /tmp/debug` from a shell (or use the **Debug logging** switch in Home Assistant, see [the bridge](../esp/vsc-serial-bridge/README.md#home-assistant-mqtt)). `rm /tmp/debug` turns it off, and a restart turns it off too. While it's on, every exchange is appended to `/i2clog.txt` on the card's 2nd partition and also printed on the console as `@L <line>`. Start, exit and crash notes are always written. Image the card and run `python tools/getlog.py card.img out.txt`, or read the lines live from the console or Home Assistant.

To build your own image:

```sh
cd logger && ./build.sh && cd ..
python tools/mkimg.py stock.img my_logger.img
```

Add `--shell` (`python tools/mkimg.py --shell stock.img my_shell.img`) to start `es-lcd` in the background with its console output discarded. The boot script then finishes and you get a `login:` prompt on the serial console; log in as `root`, which has no password.

`mkimg.py` reuses the first blocks of the unused Wi-Fi module `rt3070sta.ko` for the library, adds `LD_PRELOAD` to `autoexec.bat`, and swaps the boot logo. All writes go to the output copy only.

## SD card images

Card images contain Nuaire's firmware, so none are published. Make your own from the card in your VSC. Every step below only reads the original card; all changes go to copies.

### 1. Copy your card to an image file

1. Power the unit off at the isolator and take the SD card out of the VSC board.
2. Put it in a card reader on your PC.
3. Read the whole card to a file called `stock.img`:
   - **Windows:** install [Win32 Disk Imager](https://sourceforge.net/projects/win32diskimager/). Pick the card's drive letter, type a path ending in `stock.img`, leave **Read Only Allocated Partitions** unticked, and press **Read** (not Write). If Windows offers to format the card, press **Cancel**.
   - **Linux:** find the card with `lsblk` (e.g. `/dev/sdb`), then `sudo dd if=/dev/sdb of=stock.img bs=1M status=progress`.
4. Put the original card back in the VSC and power the unit on. Keep `stock.img` safe as your backup.

My card gave a 493,879,296-byte image with SHA-256 `91ad9632ced6ebd1cf56fd6e37cc6e4f9506c5b6c8cce0f3610c588556a555e9`. If yours matches, it is the same firmware build these notes were written against. Check it with `certutil -hashfile stock.img SHA256` (Windows) or `sha256sum stock.img` (Linux).

### 2. Extract the second partition

The card has two partitions; the second is the ext2 Linux root filesystem and starts at sector 40960. The tools need a copy of it in a folder called `rootfs_p2` in the repo root (git ignores it).

- **Linux or WSL** (from the repo root):
  ```sh
  mkdir -p mnt rootfs_p2
  sudo mount -o loop,ro,offset=$((40960*512)) stock.img mnt
  sudo cp -a mnt/. rootfs_p2/ && sudo chown -R $USER rootfs_p2
  sudo umount mnt
  ```
- **Windows only:** open `stock.img` in [7-Zip](https://www.7-zip.org/), open the second partition (the larger of the two partition files inside), and extract everything into `rootfs_p2`.

### 3. Build the logger image

From the repo root (needs Python 3 with Pillow, and [zig](https://ziglang.org/download/) for the library):

```sh
cd logger && ./build.sh && cd ..
python tools/mklogo.py
python tools/mkimg.py stock.img my_logger.img
```

`mklogo.py` makes `welcomepage_new.png` from your card's own welcome screen, so you can see the modified card booted. `mkimg.py` only reads `stock.img` and writes everything to `my_logger.img`.

### 4. Write it to a spare card

Use a **different** SD card of at least the same size, never your original.

- **Windows:** in Win32 Disk Imager pick the spare card's drive letter, choose `my_logger.img` and press **Write**. Check the drive letter twice; it overwrites the whole card.
- **Linux:** `sudo dd if=my_logger.img of=/dev/sdX bs=1M conv=fsync status=progress`, with `sdX` the spare card.

Then follow [Using the logger image](#using-the-logger-image). To go back to stock, power off and put your original card back.

