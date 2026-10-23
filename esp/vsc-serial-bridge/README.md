# VSC serial bridge (ESP32)

A WiFi-to-serial bridge for the VSC's Linux console. Plug the ESP32 into the serial header next to the SD card, and you get the console in a browser or over telnet. Nothing needs to be cabled to a laptop. Use it to watch the boot log, get a shell and diagnose things, before the ESPHome integration exists.

## Wiring

The header next to the SD card is silkscreened **LINUX TERMINAL** (0V, TX, RX; 0V is the pin nearest the blue sticker). TX/RX are named from the VSC's side.

**It is RS232 level, not TTL.** TX idles at about -5 V (IC13 beside it is a MAX3232-type transceiver). Connected straight to an ESP pin you get steady garbage at 115200, and the negative voltage can damage the ESP. Use a MAX3232 RS232-to-TTL module in between:

| ESP32 | MAX3232 module | VSC LINUX TERMINAL |
|---|---|---|
| 3V3 | VCC | |
| GND | GND | 0V |
| GPIO16 (RX) | TTL TX / RXD out | |
| GPIO17 (TX) | TTL RX / TXD in | |
| | RS232 RX in | TX |
| | RS232 TX out | RX |

- Through a MAX3232 module the levels are already TTL polarity, so set the bridge to **TTL (normal)** with the inv button. The firmware defaults to **RS232 (inverted)**, which is only for the quick hack below.
- Quick hack without a module: a 10 kΩ resistor in series between VSC TX and GPIO16, with the bridge on RS232 (inverted). Leave TX off. Use it only to read the boot log.
- **Never connect the red bus wire (+10 V) to the ESP.**
- Power the ESP from USB for now.
- On a WROVER module, GPIO16/17 are taken by PSRAM. Change `VSC_RX_PIN` / `VSC_TX_PIN` (for example to 25/26).
- If you see nothing at all, TX and RX are probably swapped.

## Setup

1. Arduino IDE with the ESP32 board package (Espressif `esp32`). Board: "ESP32 Dev Module".
2. Flash over USB once. After that you can reflash over WiFi: in Arduino IDE pick the network port `vsc-bridge`, or from the command line run `espota.exe -i <ip> -p 3232 -f vsc-serial-bridge.ino.bin -r` (espota is in the esp32 core's `tools` folder).
3. WiFi is set on the device, not in the code. On first boot the ESP starts its own network `vsc-bridge` (password `nuaire123`). Join it from a phone, open `http://192.168.4.1/wifi`, and enter your WiFi name and password. The ESP saves them and restarts onto your network.
4. If it can't join the saved network within 20 s, it starts the `vsc-bridge` network again so you can fix the settings. You can change them any time at `/wifi`.

## Use

- **Browser:** `http://vsc-bridge.local/` (or the IP). You get the live log (last 16 KB), a line to send commands, Ctrl-C and Enter buttons, a baud rate selector, a **TX on/off** switch and the **RS232 (inverted) / TTL (normal)** polarity switch, which is saved across reboots. With TX off, the bridge only listens and nothing reaches the VSC. TX goes back to on after the ESP restarts.
- **Telnet:** PuTTY, connection type **Raw**, host `vsc-bridge.local`, port 23. One client at a time.
- **Plain log:** `http://vsc-bridge.local/log`. **Status JSON:** `/status`.

The default is 115200 8N1, the usual DM355 console speed. If the log shows garbage, try other rates from the dropdown.

## Things to know

- There is no U-Boot: the board uses its own "SD direct kernel boot" loader, so the boot can't be interrupted and keys sent during boot do nothing harmful. The kernel runs with `console=ttyS0,115200n8`.
- On the stock card, `es-lcd` runs in the foreground of the boot script and fills the console with `Init I2C` / `Success!`, so `getty` never starts and there is no login prompt.
- With a card built by `tools/mkimg.py --shell`, `es-lcd` runs in the background and you get `login:`. Log in as `root` (no password). A full boot log and shell session is in [captures/vsc_console_boot.txt](../../captures/vsc_console_boot.txt).
- Everything you do from a shell is on the live SD card. Experiment on a copy of the card, never the original.
