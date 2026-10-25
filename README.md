# Nuaire-MVHR

Reverse-engineering the Nuaire MRXBOX **VSC / MRX Control** touchscreen, with the aim of replacing it with an ESP32 (ESPHome) and controlling the unit from Home Assistant.

<p align="center">
  <a href="https://buymeacoffee.com/karwantes"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy me a coffee" height="60"></a>
  <br>
  <b>If this project saved you time or a new controller, a coffee keeps it going. Thank you!</b>
</p>

> **Get your MRXBOX into Home Assistant:** convert the VSC's SD card once with
> `vscconv.exe` (Windows, backs up first) and add an ESP32 on the console header.
> Step by step, parts list and wiring: **[docs/convert-card.md](docs/convert-card.md)**.
> Download: [latest release](https://github.com/karwantes/Nuaire-MVHR/releases/latest).

Discussion: [Nuaire MRXBOX interface for Home Assistant](https://community.home-assistant.io/t/nuaire-mrxbox-interface-for-home-assistant/573933) (HA community).

## Home Assistant with an ESP32: start here

This is the way to use the project today. Your VSC stays on the wall and keeps working; Home Assistant gets the unit alongside it.

![VSC LINUX TERMINAL header to MAX3232 module to ESP32](docs/images/vsc-console-wiring.svg)

**How it works**

1. **The card, once.** The VSC runs Linux from an SD card. You take the card out and convert it in a PC card reader with `vscconv.exe`. It adds a small library (`i2clog.so`) to the screen program and lets the boot reach a console login. It backs the card up first and can put the backup back.
2. **The library** runs inside the screen program. It reports the unit's state in files under `/tmp` (temperatures, humidity, speed, bypass, faults, airflow, setpoints, hours) and watches other `/tmp` files for commands (speed 1/2/3, bypass, airflow %, setpoints, night and holiday mode). The screen keeps working as normal.
3. **The ESP32** sits on the VSC's **LINUX TERMINAL** header through a MAX3232 module. It logs in as root, reads those files every 20 s and writes them when Home Assistant asks.
4. **Home Assistant** finds the ESP by MQTT discovery (the Mosquitto add-on) as a device called **MRXBOX**, with controls and sensors. No custom integration and no YAML.

**What you need:** an ESP32 dev board, a 3.3 V MAX3232 module, 7 jumper wires, a 5 V USB supply, a USB SD card reader and a Windows PC.

**What you get:** fan speed 1/2/3, bypass Auto/On/Off and its setpoint, humidity and frost setpoints, night and holiday mode, airflow % for each speed, screen timeout, both temperatures, humidity, running speed, run and filter hours, fault sensors and communication status. Full list: [the bridge](esp/vsc-serial-bridge/README.md#home-assistant-mqtt).

**Step by step** (full how-to with pictures: **[docs/convert-card.md](docs/convert-card.md)**)

1. **Flash the ESP32.** Open `esp/vsc-serial-bridge/vsc-serial-bridge.ino` in Arduino IDE (board package Espressif `esp32`, board "ESP32 Dev Module") and upload it over USB. Later updates can go over WiFi (network port `vsc-bridge`).
2. **WiFi.** On first boot the ESP makes its own WiFi network `vsc-bridge`, password `nuaire123`. Join it from a phone or laptop and open `http://192.168.4.1/wifi`. Enter your WiFi name (SSID) and password (2.4 GHz network) and save, then reconnect your phone to your normal WiFi. The ESP restarts onto your network. If it can't join within 20 s, the `vsc-bridge` network comes back so you can try again.
3. **Find the bridge.** Open `http://vsc-bridge.local/`. If that name doesn't resolve, use the ESP's IP from your router. Set the polarity to **TTL (normal)** (the default RS232 setting is only for the resistor hack).
4. **MQTT in Home Assistant.** If you don't have a broker yet: Settings → Add-ons → install **Mosquitto broker** and start it, then Settings → Devices & services: the **MQTT** integration is discovered, so press Configure. Create an HA user for the bridge (Settings → People → Users, for example `mqtt-vsc`) or use an existing login.
5. **MQTT on the ESP.** Open `http://vsc-bridge.local/mqtt` and enter the broker host (your HA address), port `1883`, and that user and password, then save. The login is kept on the ESP only. Leave the host empty to turn MQTT off.
6. **Convert the card.** Power the unit off at the isolator and take the SD card out of the VSC. On a Windows PC, put it in a card reader and run `vscconv.exe` from the [latest release](https://github.com/karwantes/Nuaire-MVHR/releases/latest). Press `1`, then `y`. Wait for `converted: 26 writes, all verified`. Keep the backup it makes.
7. **Wire it.** Put the card back. Wire the ESP to the **LINUX TERMINAL** header through the MAX3232 module as in the diagram above.
8. **Power on.** The bridge page shows `login: root`, then a status line every 20 s.
9. **Home Assistant.** The **MRXBOX** device appears under Settings → Devices & services → MQTT.

The rest of this page is the research behind it: how the VSC works, the logger image and the protocol.

## Status

- [x] VSC firmware disassembled; the UI program (`es-lcd`) is mapped.
- [x] An I²C logger runs on the real VSC via `LD_PRELOAD`, with a hidden live debug page.
- [x] Status payload decoded: temperatures, RH, fan speed, fault bits, boost acknowledgement.
- [x] Settings frame decoded: setpoints, airflow % and mode flags.
- [x] Bus cable wiring measured: red +10 V, blue 0 V, green RS485 A, yellow RS485 B (see [docs/protocol.md](docs/protocol.md#wiring-vsc-to-mrxbox-4-core-bus-cable)).
- [x] Linux console found: the **LINUX TERMINAL** header next to the SD card (RS232 level, 115200 8N1). A card built with `mkimg.py --shell` gives a root login there; the ESP bridge makes it reachable over WiFi (see [captures/vsc_console_boot.txt](captures/vsc_console_boot.txt)).
- [x] Custom screen theme (dark) and a **Controlled by HASSOS** tick box that hands control to Home Assistant, with the screen as a manual override (see [theme/README.md](theme/README.md)).
- [x] Home Assistant through the ESP bridge (MQTT): speed, bypass, airflow %, humidity, both temperatures, running speed, comms and fault sensors, debug log. Heater fault, Cooler fault and Test routine required still need testing (see [the bridge](esp/vsc-serial-bridge/README.md#home-assistant-mqtt)).
- [x] Card converter: `vscconv.exe` converts a stock card in a PC card reader in place, with a checked backup and restore, so no card image needs building (see [docs/convert-card.md](docs/convert-card.md)).
- [x] Home Assistant custom integration for a USB serial dongle on the VSC console, with no ESP: same entities as the bridge. Experimental, **requires further testing** on a real VSC (see [custom_components/nuaire_mvhr](custom_components/nuaire_mvhr/README.md)). The ESP bridge stays on MQTT.
- [ ] Integration mode 3: a TTL/RS485 tap on the bus (read only), once the bus is mapped.
- [ ] Bridge authentication: a login for the web page, `/send` and OTA. Until then, keep the bridge on a trusted network.
- [ ] Tap RS485 while logging I²C, to map I²C fields to the wire format.
- [ ] Read-only ESPHome component.
- [ ] ESP acting as the controller (replacing the VSC).

The full byte-level map is in **[docs/protocol.md](docs/protocol.md)**.

## Control options

| # | Setup | Control | Status |
|---|---|---|---|
| 1 | Linux serial console, logger card | Full: HA → console → shell files → `es-lcd` → bus chip → bus | Implemented |
| 2 | I²C tap, stock card | Read only: the ESP listens to `es-lcd` and the bus chip | In progress |
| 3 | I²C, logger card with **Controlled by HASSOS** ticked | Full: `es-lcd` goes quiet on I²C and the ESP talks to the bus chip itself; a screen press hands control back | In progress |
| 4 | No VSC, ESP on RS485 | Full: the ESP answers the unit in the VSC's bus slots | In progress |

## How the VSC works

```
 touchscreen  ──  DM355 ARM Linux (es-lcd)  ──I²C 0x26──  MSP430  ──RS485──  MRXBOX unit
```

- The board is a TI DM355 running embedded Linux from an SD card. The whole UI is one binary, `/opt/dvsdk/dm355/es-lcd` (V0.26, Feb 2016).
- Linux never touches RS485 itself. It polls an MSP430 at I²C address 0x26, and the MSP430 handles the bus to the unit.
- On a read, the VSC writes `00 req ~req` and then reads 28 bytes. `req` is `01` (normal), `0c` (sent once to start boost) or `0d` (every poll while boost runs).
- On a write, the VSC sends `20 d0..d10 chk`: the settings frame.

## Things you can use without any hacking

- **Settings → spanner → PIN** opens the Commissioning menu. The installer PIN defaults to `1234`, and the firmware also always accepts `0107`.
- In Commissioning you can set supply and extract airflow % for each speed (1 % steps), plus the bypass, frost and humidity setpoints.
- **Settings → Diagnostics** shows fan status, both temperature sensors, RH and comms.

## Repo layout

| Path | What |
|---|---|
| `docs/protocol.md` | I²C framing, RX status bytes, TX settings frame, menus and ranges, bus wiring, RS485 cross-reference |
| `docs/images/` | Annotated VSC board photos and the wall box colour label |
| `esp/vsc-serial-bridge/` | ESP32 WiFi bridge to the VSC's Linux console (browser + telnet) |
| `custom_components/nuaire_mvhr/` | Home Assistant integration for a USB serial dongle on the VSC console (experimental) |
| `logger/i2clog.c` | `LD_PRELOAD` library: the debug pages, the theme, HASSOS mode and shell control, and (when debug logging is on) a log of every I²C exchange in `/i2clog.txt` |
| `logger/build.sh` | Builds `i2clog.so` with `zig cc` (ARM926EJ-S, freestanding) |
| `theme/README.md` | How the screen theme and HASSOS mode work, and how to make and install your own screens |
| `theme/darken.py` | Makes a dark set from your card's own screen images |
| `theme/overview.py` | Contact sheet of every screen in a folder, for checking a set |
| `docs/convert-card.md` | Step by step: convert the card, wire the ESP, Home Assistant. Parts list and diagram |
| `tools/vsc-convert/` | `vscconv.py` card converter (backup, convert, restore) and the script that builds `vscconv.exe` |
| `tools/mkimg.py` | Builds a logger SD image from a **copy** of a stock card dump |
| `tools/getlog.py` | Extracts `/i2clog.txt` from a card image read back after a run |
| `tools/armdis.py` | Annotated disassembly of `es-lcd` (pyelftools + capstone) |
| `tools/mklogo.py` | Makes the replacement boot logo, so you can see the modified card booted |
| `captures/` | Real I²C logs from my unit |

No firmware, card images, disassembly or Nuaire artwork are published here. The tools work on a copy of your own card.

## Using the logger image

1. Build a logger image from your own card (below) and write it to a spare SD card. **Keep your original card safe.**
2. Boot the VSC. The changed boot logo tells you the modified card is running.
3. Go to **Maintenance** and tap the Nuaire logo to open the debug page.
   - Page 1 shows the decoded status, the flags and the last TX frame.
   - Tap the logo again for page 2: the full 28-byte replies for each request type (`01`, `0c`, `0d`).
   - Press Home to exit.
4. Debug logging is off by default, so the card isn't written all the time. To turn it on, run `touch /tmp/debug` from a shell (or use the **Debug logging** switch in Home Assistant, see [the bridge](esp/vsc-serial-bridge/README.md#home-assistant-mqtt)). `rm /tmp/debug` turns it off, and a restart turns it off too. While it's on, every exchange is appended to `/i2clog.txt` on the card's 2nd partition and also printed on the console as `@L <line>`. Start, exit and crash notes are always written. Image the card and run `python tools/getlog.py card.img out.txt`, or read the lines live from the console or Home Assistant.

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

## Plan: an ESP instead of the VSC

1. Tap the RS485 lines between the VSC and the unit while the I²C logger runs, so each RS485 message lines up with a known I²C field.
2. Read-only ESPHome first: temperatures, RH, fan speed, faults and boost state as HA sensors.
3. Then the ESP talks as the controller: boost, speed, airflow %, bypass setpoint, night/holiday modes.

## Disclaimer

Not affiliated with or endorsed by Nuaire. This is interoperability research; no Nuaire firmware or artwork is published here. Flashing a modified card is at your own risk; always keep your original card.
