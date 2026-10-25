# Nuaire MRXBOX protocol

Two parts:

1. **[The RS485 bus](#1-rs485-bus-vsc--mrxbox)** between the wall controller (VSC) and the MRXBOX unit. Option 1 (ESP in place of the VSC) speaks this directly.
2. **[Inside the VSC](#2-inside-the-vsc-es-lcd-and-the-i²c-bus-chip)**: the screen program `es-lcd`, its I²C link to the VSC's bus chip, its menus and settings. Option 2 (ESP on the VSC console) works through this.

```
 touchscreen ── DM355 ARM Linux (es-lcd) ──I²C 0x26── bus chip ──RS485── MRXBOX unit
```

Everything here was measured on one MRXBOX (MRXBOXAB-ECO4) with a VSC running `es-lcd` V0.26 (Feb 2016).

## 1. RS485 bus (VSC ↔ MRXBOX)

### Cable

The 4-core cable from the unit ends in the VSC's wall box. The box has a red / yellow / green / blue colour label by the cable entry.

| Wire | Signal |
|---|---|
| Red | +10 V supply from the unit |
| Blue | 0 V |
| Yellow | RS485 A (A+ on an XY-485 module) |
| Green | RS485 B (B- on an XY-485 module) |

- On a multimeter green idles slightly higher than yellow, which would make green A. An XY-485 module only decodes with **A+ on yellow and B- on green**, so go by that. Swapping them does no harm if a module sees nothing.
- The bus is already terminated and biased at the VSC (R109/R110 "BIAS" and "T" on the board's back). A tap must not add a 120 Ω terminator.
- A tap needs its ground joined to blue.
- Red can power an ESP only through a 5 V regulator. Never connect it to an ESP pin directly.

![Wall box colour label](images/wallbox_wire_label.jpg)

### Line format

- **1200 baud, 8N1, idle high.**
- **Bytes go MSB first.** A normal UART receives them bit-reversed. The bridge reverses them back, and every byte in this document is shown MSB first, as on the wire.
- **The unit is the bus master.** It runs the same cycle of 9 frames about every 0.71 s, with or without a VSC.
- **Frame ID:** the first byte of a frame has bit 7 set. Every byte after it has bit 7 clear. `7F` is the empty value.
- **Checksum:** the last byte makes **all bytes of the frame, ID included, XOR to `D5`**.
- **Data bytes are the VSC's I²C bytes bit-reversed** (`rev8`). Reverse a data byte and you get the matching byte of the I²C reply (p0..p19) or settings frame (d0..d10) in [part 2](#2-inside-the-vsc-es-lcd-and-the-i²c-bus-chip), which decodes as described there. The I²C values are sent `<< 1`, so their low bit is 0 and becomes bit 7 = 0 on the wire.

### The cycle

Example cycle with the VSC running (speed 1, extract 22 °C, intake 13 °C, RH 49 %, airflow 18/32/100 %, humidity setpoint 66 %, bypass setpoint 24 °C):

| Frame | Data, then checksum | Data from | Meaning | I²C bytes |
|---|---|---|---|---|
| `84` | `55 6F` `6B` | unit | fault flags A, fault flags B / bypass state | p8, p9 |
| `88` | `6F` `32` | VSC | status: `6F` speed 1, `6B` speed 2 or 3 | p7 |
| `8A` | `7F 7F 7F` `20` | VSC | speed request in byte 2: `7F` / `1F` / `17` = speed 1 / 2 / 3 | p10, p11, p12 |
| `8C` | `7F 7F` `59` | unit | always empty on this unit | p13 / p14 |
| `CC` | `7F 7F` `19` | unit | always empty on this unit | p13 / p14 |
| `A1` | `34 7F 58 7F 7F` `67` | unit | extract temp, –, intake temp, –, – | p5, p16 |
| `C5` | `13 13 24 02 24 02` `10` | VSC | airflow % | d5..d10 |
| `AE` | `7F 06 21 00` `23` | VSC | mode flags, bypass setpoint, humidity setpoint, frost level | d0..d3 |
| `DC` | `4E 2A` `6D` | unit | humidity, second value | p18, p19 |

The same cycle on the forum capture (see [Prior art](#prior-art)) is the bit-reversed form of these bytes.

### Decoding each frame

`rev8(b)` reverses the 8 bits of a byte.

- **`84` fault flags.** `p8 = rev8(byte 1)`, `p9 = rev8(byte 2)`, decoded as in [p8 bits](#p8-bits-0--fault) and [p9 bits](#p9-bits-0--activefault). The useful ones:
  - supply fan fault: p8 0x08 clear;
  - extract fan fault: p8 0x20 clear;
  - frost fault: p9 0x20 clear;
  - **bypass open**: p9 0x08 set (on the wire, byte 2 bit 0x10). This is the unit's decision, re-checked about once a minute.
  - `84 55 6F 6B` = heat recovery, `84 55 7F 7B` = bypass open.
- **`A1` temperatures.** Byte 1 is extract air, byte 3 is the fresh-air intake. `v = rev8(b) >> 1`, signed 7-bit, in °C. −63 means the sensor is faulty. Example: `34` → `2C` → 22 °C; `58` → `1A` → 13 °C.
- **`DC` humidity.** Byte 1: `RH = byte ^ 7F` (the same as `rev8(b) >> 1`, active low). `4E` → 49 %. 0 or 127 means the sensor is faulty. Byte 2 is p19, `2A` → 85, meaning unknown.
- **`88` and `8A` speed.** The VSC's speed request, not an echo from the unit:

  | Speed | `88` | `8A` |
  |---|---|---|
  | 1 | `6F 32` | `7F 7F 7F 20` |
  | 2 | `6B 36` | `7F 1F 7F 40` |
  | 3 | `6B 36` | `7F 17 7F 48` |

  There is no running-speed echo on the bus; the p9 fan bits don't follow the speed.
- **`AE` modes and setpoints.**
  - Byte 1, mode flags (active low, one at a time):

    | Byte 1 | Mode | I²C d0 bit |
    |---|---|---|
    | `7F` | none (bypass Auto) | – |
    | `7E` | bypass override On (bypass open) | 0x80 |
    | `6F` | bypass Off (forces heat recovery) | 0x08 |
    | `77` | night | 0x10 |
    | `7B` | holiday | 0x20 |
    | `7D` | rising boost | 0x40 |

  - Byte 2: `rev8(bypass setpoint << 2)`, 15–30 °C. 24 °C = `06`, 23 °C = `3A`.
  - Byte 3: `rev8(humidity setpoint << 1)`, 50–85 %. 66 % = `21`, 65 % = `41`.
  - Byte 4: `rev8(frost level << 4)`, frost level 0–5 meaning 0 to −5 °C. 0 = `00`, 1 = `08`.
- **`C5` airflow.** Six bytes, each `rev8(% << 1)`, 0–100 %, in this order: **supply 3, extract 3, supply 1, supply 2, extract 1, extract 2.** `13` = 100 %, `24` = 18 %, `02` = 32 %.

### The VSC's slots: who sends what

In `88`, `8A`, `AE` and `C5` the **unit sends the ID as a poll and the VSC answers with the data** about 50 µs after the ID's stop bit. With no answer, the unit sends its own default data:

| Slot | Default (no VSC) |
|---|---|
| `88` | `6F 32` |
| `8A` | `7F 7F 7F 20` |
| `AE` | `7F 7F 7F 7F 7B` |
| `C5` | `7F 7F 7F 7F 7F 7F 10` |

How this was established:

- **Unplug test.** With the VSC powered off, or its bus cable unplugged, the unit keeps the cycle going with the same 9 frames, order, timing and valid checksums. Only the four slots above change, to the defaults. `84`, `8C`, `CC`, `A1` and `DC` carry on, so they are the unit's.
- **Speed 3, then VSC off.** `88` and `8A` dropped to the defaults in the same cycle the VSC died, before that cycle's `AE` and `C5` went blank, and the fans slowed at once. So `88`/`8A` are the VSC's request, not the unit's report.
- **Bit timing.** The unit's bytes are ~832.5 µs per bit with +33 to +75 µs idle between bytes. In the VSC's slots the ID has the unit's timing and the data bytes have the VSC's (834–846 µs, stop bit cut short).
- **Change tests.** Every setting changed on the VSC showed up first in a VSC slot, then, where the unit reacts, in its `84` one cycle (0.3 s) later.

Without a VSC the unit runs at the speed of its hard-wired speed input and ignores what the VSC last sent.

### Timing

| Gap | Silence before the frame |
|---|---|
| before `84` (start of a cycle) | ~205 ms |
| before `C5` | ~19 ms |
| before the other frames | 16.6–18.5 ms |

The schedule is fixed by the unit and is the same with or without the VSC. A silence longer than one byte (8.3 ms) separates frames; the bridge ends a frame after 20 ms of silence.

### Answering the polls (option 1)

This is how the bridge's **VSC emulation** takes the VSC's place, with the VSC off the bus:

- It takes the first falling edge after more than 12 ms of silence as an ID's start bit, samples the ID at its bit centres (a 25 µs timer interrupt) and checks for the stop bit.
- For `88`, `8A`, `AE` and `C5` it bit-bangs its own data bytes: start bit low, 8 bits MSB first, stop bit high, at 1200 baud. The first byte is due 30 µs after the end of the ID, as the VSC does.
- The unit still sends its defaults in the same slot. The bridge starts each byte on the unit's start bit (or on time if the unit sends none). The RS485 module only drives the bus while its TXD is low, so the bridge's 0 bits override the unit's default and the frame on the wire is the bridge's. The unit accepts it.
- Every frame ends with its checksum (XOR to `D5`).
- The bytes are built exactly as in [Decoding each frame](#decoding-each-frame).

A powered VSC on the same bus answers the same polls about 50 µs after the ID and garbles every frame. Run the emulation only with the VSC off the bus.

### What is not on the bus

- **The clock.** No frame changes once a minute. The unit has no clock.
- **Run hours and filter hours.** They are counters in `es-lcd`.
- **Timers.** Speed 3 time limit, night, holiday and bypass override lengths are counted by the controller. Only the resulting mode bits go out in `AE`. The emulation runs the same timers itself.
- **Screen settings.** They belong to the VSC.

### What the unit decides

The unit does the HVAC logic from the controller's requests and its own sensors:

- the bypass, from the bypass setpoint and its temperatures, with hysteresis, re-checked about once a minute;
- the humidity boost, from the humidity setpoint and its RH sensor;
- frost protection, from the frost level;
- the fan speeds, from the requested speed and the airflow %.

The controller only sends the speed, the modes and the setpoints.

### Odd frames

- **Single frames** that appear once and are gone the next cycle, with valid checksums, for example `AE 00 06 21 00 5C`, `AE 7F 06 00 00 02`, `C5 13 13 00 02 24 02 34`.
- **Second "pages"**: for 15–60 s a VSC slot alternates every cycle with a variant, for example `AE 7F 09 21 00 2C` or `AE 7F 06 58 00 5A` (together with `88 6B 36`), then goes back.

Both come from the VSC's bus chip; nothing in `es-lcd` asks for them. The unit ignores them. The emulation never sends them.

### Prior art

@jamesgrogantech posted a capture of the same bus on the [HA forum thread](https://community.home-assistant.io/t/nuaire-mrxbox-interface-for-home-assistant/573933): 1200 baud 8N1, bytes MSB first, 9 messages repeating about every 0.7 s. Read by a normal UART, so each byte is the bit-reversed form of the ones above:

```
21 AA F4 D4        (= 84 55 2F 2B)
11 F6 4C           (= 88 6F 32)
51 FE FE FE 04     (= 8A 7F 7F 7F 20)
31 FE FE 9A        (= 8C 7F 7F 59)
33 FE FE 98        (= CC 7F 7F 19)
85 2E FE 30 FE FE CE
A3 FE … 08         (C5)
75 FE … DE         (AE)
3B C2 54 06        (= DC 43 2A 60)
```

## 2. Inside the VSC: es-lcd and the I²C bus chip

Decoded from the `es-lcd` disassembly and checked live with `i2clog.so`. `S0` is the 32-bit settings word at 0x6ab70; its bytes go out as d0..d3. The airflow values live at 0x708ac and go out as d5..d10.

### The VSC board (Rev C, 650931)

![VSC board front, annotated](images/pcb_front_annotated.jpg)

![VSC board back, annotated](images/pcb_back_annotated.jpg)

- **TI DM355** running Linux from the SD card. The whole UI is one program, `/opt/dvsdk/dm355/es-lcd`.
- **LINUX TERMINAL** header (0V, TX, RX) next to the SD card: the Linux console, 115200 8N1, RS232 level through IC13 (a MAX3232-type transceiver). 0V is the pin nearest the blue sticker; TX and RX are named from the VSC's side. A full boot log is in [captures/vsc_console_boot.txt](../captures/vsc_console_boot.txt).
- **Grey 4-pin connector** (front, bottom left): the bus cable. On the back its pads are P1–P4, data on the middle two, power on the outer two.
- **R109/R110 "BIAS"** and **"T"** (termination) on the back sit on the RS485 pair.
- **IC12** "5430": a TPS5430 buck regulator. C71 (220 µF / 10 V) is a handy ground point at its "−" leg.
- **D7 "LINK"** blinks with bus traffic.
- **The bus chip**, a 20-pin TSSOP next to J3. The firmware calls it msp430; J3 (0V / MCLR / CLK / DAT) is a PIC-style programming header.

Close-ups: [bus connector, front](images/bus_connector_front.jpg), [bus pads, back](images/bus_pads_back.jpg).

### I²C framing (bus chip at 0x26)

- **Write:** `cmd, data[0..n-1], chk` with `chk = ~(data[0] ^ … ^ data[n-1])`. The settings frame is `cmd 0x20`, n = 11. A 100 µs pause follows.
- **Read:** write `00, req, ~req`, wait 100 µs, read 28 bytes. The first 8 are skipped; bytes 8–27 are payload p0..p19.
  - `req` is `01` normally, `0c` once when speed 3 starts, then `0d` on every poll while it runs.
  - The 8 skipped bytes are an echo of the last settings frame (d1..d8), or zeros. es-lcd ignores them.
- The exchange runs every 30 ticks: read at tick 1, write at tick 15. A successful write prints `Success!` on the console.

### Settings frame `20 d0..d10`

| Byte | Meaning | On the bus |
|---|---|---|
| d0 | Mode flags, active low: 0x80 bypass override, 0x40 rising boost, 0x20 holiday, 0x10 night, 0x08 bypass off (forces heat recovery), 0x04 frost timer running. Bit 0 always clear. | `AE` byte 1 |
| d1 | Bypass setpoint << 2 | `AE` byte 2 |
| d2 | Humidity setpoint << 1 | `AE` byte 3 |
| d3 | (−frost level) << 4 | `AE` byte 4 |
| d4 | `~(d0^d1^d2^d3)` | (not sent) |
| d5..d10 | Airflow %·2: supply 3, extract 3, supply 1, supply 2, extract 1, extract 2 | `C5` bytes 1–6 |

Starting a timed mode sets bits 4–7, then clears its own bit, so only one mode is active at a time. Starting the bypass override also clears bit 0 and cancels night, holiday and rising boost.

### Reply payload p0..p19

| Byte | Meaning | On the bus |
|---|---|---|
| p0–p4 | Clock: minutes, hours, day, month, year (BCD). Kept by the bus chip | not sent |
| p5 | Extract air temp: p5 >> 1, signed 7-bit, °C; −63 = sensor fault | `A1` byte 1 |
| p6 | ~p5 | – |
| p7 | `f6` at speed 1; bit 0x20 clear (`d6`) at speed 2/3 | `88` byte 1 |
| p8 | Fault flags A, see below | `84` byte 1 |
| p9 | Fault flags B / bypass, see below | `84` byte 2 |
| p10–p12 | p11 `fe` speed 1, `f8` speed 2, `e8` speed 3 | `8A` bytes 1–3 |
| p13, p14 | Always `fe fe`; unused by es-lcd | `8C` / `CC` |
| p15 | `~(p7^…^p14)` | – |
| p16 | Intake air temp, as p5 | `A1` byte 3 |
| p17 | ~p16 | – |
| p18 | Humidity %: p18 >> 1, active low and bit-reversed. 0 or 127 = sensor fault | `DC` byte 1 |
| p19 | Same encoding as p18, no reader in es-lcd (85 on this unit) | `DC` byte 2 |

p8 = p9 = 0xff means no communication with the unit.

#### p8 bits (0 = fault)

| Bit | Status line | Diagnostics row |
|---|---|---|
| 0x40 | "Heater fail" | – |
| 0x80 | "Cooler fail" | – |
| 0x08 | "Fan 1 fail" (supply fan) | Supply Fan |
| 0x20 | "Fan 2 fail" (extract fan) | Extractor Fan |

On a unit with no heater fitted, p8 is `aa`: the heater bit reads as a fault. The Home fan bars are coloured only when both fan bits are set.

#### p9 bits (0 = active/fault)

| Bit | Meaning |
|---|---|
| 0x20 | "Frost fail" |
| 0x08 | **Set = bypass open.** Not read by es-lcd |
| 0x04 | Clear → "Test routine required!" (also lights fan bar 3) |
| 0x02 | With 0x04, drives fan bar 2 |

es-lcd draws fan bars 2 and 3 from p9 as if they were the running speed, but on this unit p9 stays `f6` at every speed. The running speed is p7 bit 0x20 (with es-lcd's own speed 3 flag at 0x708ca).

#### Bypass, tested live (inside 22 °C, outside 12 °C)

An **open** bypass sends the air around the heat exchanger (no heat recovery, for cooling). A **closed** bypass is normal heat recovery.

| Action on the screen | Settings frame change | Unit (p9 0x08) |
|---|---|---|
| Setpoint 24 °C, nothing else on | `20 fe 60 …` | 0, heat recovery |
| Setpoint 24 → 15 °C | d1 `60` → `3c` | 1, bypass open |
| Commissioning bypass "disable" (key "s" on screen 30) | d0 `fe` → `f6` (0x08 clear) | 0 within 1 s |
| Enabled again | d0 `f6` → `fe` | 1 |
| User Options bypass override on | d0 `fe` → `7e` (0x80 clear) | 1 |
| Setpoint back to 24 °C, override still on | d1 `3c` → `60` | 1 (held) |

So d0 0x80 clear forces the bypass open, d0 0x08 clear forces heat recovery, and with both set the unit decides from the setpoint. p9 0x08 followed within about 1 s, but only 63 s after the override ended (the once-a-minute re-check). It is the unit's decision, not the damper's position. With it set, the unit's **HX Bypass** LED is lit.

### Settings: range, storage and frame byte

| Screen | Setting | Range / step | Stored in | Frame byte |
|---|---|---|---|---|
| 3 Humidity | RH boost setpoint | 50–85 % / 1 (default 65) | S0 bits 17–23 | d2 >> 1 |
| 30 Bypass | Bypass setpoint | 15–30 °C / 1 | S0 bits 10–15 | d1 >> 2 |
| 30 (key "s") | Bypass off timer (forces heat recovery) | 0 or 480 min | 0x1e31c | d0 & 0x08 |
| 21 Frost | Frost level | 0 to −5 / 1 | 0x708c4; S0 bits 28–31 | d3 >> 4 |
| 21 (key "s") | Frost timer | 0 or 480 min | 0x1e31e | d0 & 0x04 |
| 8 Air Flow Supply | speeds 1/2/3 | 0–100 % / 1 | 0x1e2af / ae / ad | d7 / d8 / d5 |
| 9 Air Flow Extract | speeds 1/2/3 | 0–100 % / 1 | 0x1e2ac / ab / aa | d9 / d10 / d6 |
| 6 Rising Boost | Enable | Yes / No | S0 bit 6 | d0 & 0x40 |
| 5 Boost Timer | Speed 3 time limit | 1–59 min; 60 = no limit | 0x708c2 | (timer) |
| 15 Night mode | Length | 4–8 h | 0x1e2dd; timer 0x1e324 | d0 & 0x10 |
| 16 Holiday mode | Length | 1–21 days | 0x1e2df; timer 0x1e322 | d0 & 0x20 |
| 18 Bypass override | Length | 1–12 h | 0x1e2a9; timer 0x1e320 | d0 & 0x80 |

- **Saving.** es-lcd keeps these in `/opt/dvsdk/dm355/setup3 ` (the name ends in a space), written by its save routine at 0xb894. Its loader doesn't restore S0 bits 28–31, so after a restart the frost level on the wire is 0 whatever the screen shows; `i2clog.so` keeps frost, night and holiday in `/etc/modes` and applies them again. Run and filter hours are saved by SaveRunTime at 0xb740.
- **Timers** count down once a minute from es-lcd's clock (p0..p4). If that clock stops, so do the timers and the screen sleep.
- **Screen sleep:** U16 at 0x1e2da. N minutes counts N+1; 0 is never.
- **Filter icon:** run hours (0x1e30c) over 8759 (one year). Maintenance key 0x72 resets the counter.

### PINs and menus

- **Settings → spanner → PIN** opens Commissioning (screen 37). The installer PIN is stored at 0x708fa (default **1234**); **0107** always works.
- **Settings (1):** User Options 19, User Guide 20, Commissioning, Maintenance 35, Diagnostics 33, Home 2.
- **User Options (19):** Boost Timer 5, Contact 23, Night 15, Holiday 16, Rising Boost 6, Bypass Override 18, Date/Time 14.
- **Commissioning (37):** Air Flow 8, Change PIN, Frost 21, Run Time 4, Bypass Setpoint 30, Humidity 3. The wizard runs 8 → 9 → 21 → 30 → 3 → 4.
- **Diagnostics (33)**, top to bottom: Extractor Fan (p8 0x20), Extractor Temp. Sensor (p5), Supply Fan (p8 0x08), Supply Fan Temp. Sensor (p16), Humidity Sensor (p18), Communication With Unit (p8/p9 not both 0xff).
- **Home (2):** intake temp top left, extract below ("Error" at −63). Frost icon when intake ≤ frost level. Mode icon for night, holiday or bypass override.
- **Test routine:** touch the four corners and the centre box; prompted by p9 0x04.
- The Settings logo (key 0x4e) does nothing in stock firmware; `i2clog.so` uses it for its debug page.

### CO2 (library only)

`msp430lib_get_co2` writes `22 00 08 2a` on a separate I²C handle (a Senseair K30-style read), reads 4 bytes and returns ppm = b1·256 + b2. No screen in this firmware shows it.

## Open questions

- **p19** (`DC` byte 2) is 85 on this unit and nothing reads it.
- **`8C`/`CC`** (p13/p14) are always empty. Possibly for a CO2 sensor; needs a unit with one fitted.
- **Heater and cooler fault bits** are decoded as es-lcd reads them, but not seen on a unit that has a heater or cooler.
- **Damper position.** p9 0x08 is the unit's decision. No byte has been found that follows the damper itself.
