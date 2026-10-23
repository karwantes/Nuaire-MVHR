# Nuaire-MVHR

Reverse-engineering the Nuaire MRXBOX **VSC / MRX Control** touchscreen, with the aim of replacing it with an ESP32 (ESPHome) and controlling the unit from Home Assistant.

Discussion: [Nuaire MRXBOX interface for Home Assistant](https://community.home-assistant.io/t/nuaire-mrxbox-interface-for-home-assistant/573933) (HA community).

## Status

- [x] VSC firmware disassembled; the UI program (`es-lcd`) is mapped.
- [x] An I²C logger runs on the real VSC via `LD_PRELOAD`, with a hidden live debug page.
- [x] Status payload decoded: temperatures, RH, fan speed, fault bits, boost acknowledgement.
- [x] Settings frame decoded: setpoints, airflow % and mode flags.
- [ ] Tap RS485 while logging I²C, to map I²C fields to the wire format.
- [ ] Read-only ESPHome component.
- [ ] ESP acting as the controller (replacing the VSC).

The full byte-level map is in **[docs/protocol.md](docs/protocol.md)**.

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
| `docs/protocol.md` | I²C framing, RX status bytes, TX settings frame, menus and ranges |
| `logger/i2clog.c` | `LD_PRELOAD` library: logs every I²C exchange to `/i2clog.txt` and adds the debug pages |
| `logger/build.sh` | Builds `i2clog.so` with `zig cc` (ARM926EJ-S, freestanding) |
| `tools/mkimg.py` | Builds a logger SD image from a **copy** of a stock card dump |
| `tools/getlog.py` | Extracts `/i2clog.txt` from a card image read back after a run |
| `tools/armdis.py` | Annotated disassembly of `es-lcd` (pyelftools + capstone) |
| `tools/mklogo.py` | Makes the replacement boot logo, so you can see the modified card booted |
| `captures/` | Real I²C logs from my unit |
| `research/` | Raw notes from the disassembly |

## Using the logger image

1. Write `disk3_i2clog5.img` (see Releases) to a spare SD card. **Keep your original card safe.**
2. Boot the VSC. The changed boot logo tells you the modified card is running.
3. Go to **Maintenance** and tap the Nuaire logo to open the debug page.
   - Page 1 shows the decoded status, the flags and the last TX frame.
   - Tap the logo again for page 2: the full 28-byte replies for each request type (`01`, `0c`, `0d`).
   - Press Home to exit.
4. Every exchange is appended to `/i2clog.txt` on the card's 2nd partition. Image the card and run `python tools/getlog.py card.img out.txt`.

To build your own image:

```sh
cd logger && ./build.sh && cd ..
python tools/mkimg.py stock.img my_logger.img
```

`mkimg.py` reuses the first blocks of the unused Wi-Fi module `rt3070sta.ko` for the library, adds `LD_PRELOAD` to `autoexec.bat`, and swaps the boot logo. All writes go to the output copy only.

## SD card images (Releases)

Images are about 470 MB each, so they are attached to the GitHub Release rather than committed. All are raw dumps of the whole card (two partitions; the ext2 rootfs starts at sector 40960).

| File | SHA-256 | What |
|---|---|---|
| `disk3.img` | `91ad9632ced6ebd1cf56fd6e37cc6e4f9506c5b6c8cce0f3610c588556a555e9` | Stock card as shipped (my unit) |
| `disk3_i2clog5.img` | `9e22006773472cdcb0381632ca30fed9048523bf17c20b106535c18f91bfbfd1` | Stock + latest logger (v5) and both debug pages, tested on the unit |
| `card_after_test1.img` | `3dfdf1b2dbcec0672b5457a5992f002ad5055efc802f3ac3ae5ff1f8d3fc8c19` | Card read back after the first logger run |
| `card_run2.img` | `31fbf75b1c902f42043f4dca52b66814c94fce3bb7ec97ce8a1a5db196ab765a` | Card read back after the second logger run |

Hashes are of the uncompressed `.img`.

## Plan: an ESP instead of the VSC

1. Tap the RS485 lines between the VSC and the unit while the I²C logger runs, so each RS485 message lines up with a known I²C field.
2. Read-only ESPHome first: temperatures, RH, fan speed, faults and boost state as HA sensors.
3. Then the ESP talks as the controller: boost, speed, airflow %, bypass setpoint, night/holiday modes.

## Disclaimer

Not affiliated with or endorsed by Nuaire. The card images contain Nuaire's firmware and are shared for interoperability research only. Flashing a modified card is at your own risk; always keep your original card.
