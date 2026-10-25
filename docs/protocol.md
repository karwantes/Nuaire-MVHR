# Nuaire MVHR controller (es-lcd V0.26 Feb 2016): options map

Decoded from the `es-lcd` disassembly. `S0` means the 32-bit settings word at 0x6ab70; its bytes are frame bytes d0..d3 of the `20 d0..d10` frame. Airflow values live at 0x708ac and go out as d5..d10.

## PINs and hidden screens
- Installer PIN: stored at 0x708fa (default **1234**). The master PIN **0107** always works.
- Settings → spanner key (0x63) → PIN → Commissioning (screen 37).
- Commissioning → change-PIN key: type 4 digits and press Enter; the new PIN is saved by SaveSetup.
- If the stored PIN is reset to 1234 it goes back to screen 2; otherwise 0x22.
- `EXITDV` → screen 36 (shows /logread.log). It is 6 characters, but entry is limited to 4, so it can't be typed.
- Settings logo (key 0x4e) does nothing in stock firmware; the debug page uses it.
- Maintenance → key 0x72 resets the run-time counter (0x1e30c).

## Menus
- **Settings (1):** User Options 19, User Guide 20, Commissioning (PIN), Maintenance 35, Diagnostics 33, Home 2.
- **User Options (19):** Boost Timer 5, Contact 23, Night 15, Holiday 16, Rising Boost 6, Bypass Override 18, Date/Time 14.
- **Commissioning (37):** Air Flow 8, Change PIN, Frost 21, Run Time 4, Bypass Setpoint 30, Humidity 3.
- **Commissioning wizard** (the "n" next key): 8 Supply → 9 Extract → 21 Frost → 30 Bypass → 3 Humidity → 4 Run Time.

## Settings: range, storage and frame byte

| Screen | Setting | Range / step | Default | Stored in | On the wire |
|---|---|---|---|---|---|
| 3 Humidity | RH boost setpoint | 50–85 % / 1 | 65 ("s" key) | S0 bits 17–23 | d2 >> 1 |
| 30 Summer bypass setpoint | Bypass temperature | 15–30 °C / 1 | – | S0 bits 10–15 | d1 >> 2 |
| 30 (key "s") | Bypass "disable" timer (forces heat recovery) | 0 or 480 min | | 0x1e31c | d0 & 0x08 |
| 21 Frost protection | Frost level | 0 to −5 / 1 | – | 0x708c4 (s16); S0 bits 28–31 = −value | d3 >> 4 |
| 21 (key "s") | Frost timer toggle | 0 or 480 | | 0x1e31e | (local) |
| 8 Air Flow Supply | 3 speeds | each 0–100 % / 1, speed1 ≤ speed2 (rule of the screen menu only; `/tmp/airflow` doesn't apply it) | – | 0x1e2af / 0x1e2ae / 0x1e2ad | 0x708ac bytes 2 / 3 / 0, value << 1 |
| 9 Air Flow Extract | 3 speeds | same | – | 0x1e2ac / 0x1e2ab / 0x1e2aa | 0x708ac bytes 4 / 5 / 1, value << 1 |
| 6 Rising Boost | Enable | Yes / No | | S0 bit 6 (0 = Yes) | d0 & 0x40 (active low) |
| 5 Boost Timer | Boost duration | 1–59 min; 60 = "None" (no limit) | | 0x708c2 | (local timer) |
| 15 Night mode | Duration | 4–8 h | | 0x1e2dd; running timer 0x1e324 = h × 60 min | d0 & 0x10 (active low) |
| 16 Holiday mode | Duration | 1–21 days | | 0x1e2df; timer 0x1e322 = days × 1440 min | d0 & 0x20 (active low) |
| 18 Bypass override | Duration | 1–12 h | | 0x1e2a9; timer 0x1e320 = h × 60 min | d0 & 0x80 |

**Saving.** es-lcd keeps these settings in `/opt/dvsdk/dm355/setup3 ` (the name ends in a space). The save routine is at 0xb894 (no arguments) and the loader at 0xc390–0xc5b0. The loader restores airflow, 0x708c4 frost, S0 bits 10–15 (bypass), S0 bits 17–23 (humidity) and Rising Boost, but **not** S0 bits 28–31, so after a restart the frost level on the wire is 0 whatever the screen shows. `i2clog.so` saves through 0xb894 too, and keeps frost, night and holiday in `/etc/modes`, which it applies again at start. Run hours and filter hours are saved by SaveRunTime at 0xb740.

**Screen sleep.** The countdown is U16 0x1e2da; the immediate sleep is at 0xe200. A setting of N minutes counts N+1; 0 means never sleep.

When the bypass override starts, it clears d0 bit 7 (override on) and bit 0, and it sets bits 4–6, which cancels Holiday, Night and Rising Boost. Stopping the override sets bit 7 again.

**Summer bypass setpoint** (for example "bypass 24C"): above this inside temperature the unit opens the summer bypass so fresh air skips the heat exchanger (free cooling), as long as it is cooler outside. It is the setpoint, not the live damper state.

### Bypass control, tested live (MRXBOXAB-ECO4, inside 22 °C, outside 12 °C)

**Which way round?** Think about where the air goes, not about the damper:

| Words you might see | Damper | Air path | p9 0x08 | HX Bypass LED |
|---|---|---|---|---|
| **Bypass ON** (bypass open, "summer bypass") | Open | Skips the heat exchanger, so no heat recovery. Fresh outside air, for cooling. | 1 | Amber |
| **Bypass OFF** (bypass closed, "heat recovery") | Closed | Goes through the heat exchanger, so heat is recovered. Normal winter running. | 0 | Off |

Rule of thumb: an open bypass is an open shortcut around the heat exchanger. In this document "bypass" always means bypass ON, and "heat recovery" means bypass OFF.

| Screen action | TX change | Unit (p9 bit 0x08) |
|---|---|---|
| Start: setpoint 24 °C, nothing else on | `20 fe 60 …` | 0, heat recovery |
| Setpoint 24 → 15 °C | d1 `60` → `3c` | 1, bypass (first reply after) |
| Commissioning bypass "disable" (key "s" on screen 30) | d0 `fe` → `f6` (0x08 clear) | 0, heat recovery within 1 s, setpoint still 15 |
| Commissioning bypass enabled again | d0 `f6` → `fe` | 1, bypass |
| User Options bypass override on (6 h) | d0 `fe` → `7e` (0x80 clear) | 1, bypass |
| Setpoint back to 24 °C, override still on | d1 `3c` → `60` | 1, bypass (held a minute later) |

So:
- **d0 0x80 clear (bypass override) forces bypass**, whatever the setpoint.
- **d0 0x08 clear (Commissioning "disable") forces heat recovery**, whatever the setpoint. The name of the 0x1e31c timer was a guess; this is what it does.
- With both set, the unit decides from the d1 setpoint and its own temperatures.
- **p9 0x08 = 1 means the unit is in bypass.** es-lcd never reads it. In the last state the unit's **HX Bypass** status LED was lit (top LED in Fig 21 of Nuaire I&M 671797).
- **p9 0x08 is the unit's decision, not the damper's position.** It changed within about 1 s of the Commissioning disable and re-enable, but only 63 s after the override ended (the unit re-checking the setpoint once a minute). A wax actuator can't move in 1 s. No other byte from the unit tracks the bypass, so this is the best status available.
- **How es-lcd builds the bits:** byFsa rebuilds d0 every pass from the timers. 0x1e31c running clears 0x08; 0x1e320 running clears 0x80 (after setting bits 4–6); 0x1e31e running clears 0x04. The timers count down once a minute, and HASSOS mode holds them.
- **Shell control** (i2clog.so, see `theme/README.md`): `/tmp/bypass_on` runs 0x1e320 (720 min), `/tmp/bypass_off` runs 0x1e31c (480 min), neither = auto. `/tmp/bypasstemp` writes the setpoint into S0 (0x6ab71, sent as d1). `/tmp/bypass_state` holds p9 0x08 as `1`/`0`, from replies with a good checksum. `/tmp/airflow` ("S1 S2 S3 E1 E2 E3" in %) writes 0x708ac (bit 0 kept) and the 0x1e2aa–af screen values; `/tmp/airflow_state` reports 0x708ac in the same order. `/tmp/sensors` ("EXT IN RH SPD P8 P9") holds p5, p16 and p18 decoded, the running speed (p7 bit 0x20 and 0x708ca) and the raw p8/p9 fault bytes, from replies with a good checksum.

## I²C framing (MSP430 at 0x26)
- **Write (TX):** `cmd, data[0..n-1], chk` where `chk = ~(data[0] ^ … ^ data[n-1])`. The settings frame is `cmd 0x20`, n = 11. A 100 µs pause follows.
- **Read (RX):** write 3 bytes `00, req, ~req`, wait 100 µs, then read 28 bytes. The first 8 are skipped; bytes 8–27 become payload p0..p19.
  - `req` = 0x01 normally. While a boost countdown runs (0x708c0 ≠ 0): 0x0c, or 0x0d if 0x708ca is set.
  - Live (debug page 2, logger v5): pressing boost sends `0c` exactly **once**, then `0d` on every poll until boost ends. The reply to the `0c` itself is identical to a normal `01` reply (p7 f6, p11 fe, p15 ab). The acknowledgement first appears in the next (`0d`) reply: p7 d6, p11 e8, p15 9d.
- The exchange runs every 30 ticks: RX at tick 1, TX at tick 15. A TX that succeeds prints "Success!".

## TX frame `20 d0..d10`
| Byte | Meaning |
|---|---|
| d0 | Mode flags, all active low. 0x80 bypass override, 0x40 Rising Boost, 0x20 Holiday, 0x10 Night, 0x08 bypass "disable" timer running, forces heat recovery (0x1e31c), 0x04 frost "s" timer running (0x1e31e). Bit 0 is always cleared. |
| d1 | Bypass setpoint << 2 |
| d2 | Humidity setpoint << 1 |
| d3 | (−frost level) << 4 |
| d4 | Checksum `~(d0^d1^d2^d3)` |
| d5..d10 | Airflow bytes 0x708ac[0..5], each %·2: supply speed 3, extract speed 3, supply speed 1, supply speed 2, extract speed 1, extract speed 2 |

Starting a timed mode sets bits 4–7 and then clears its own bit, so only one mode is active at a time.

## RX payload p0..p19
| Byte | Meaning | Stored at |
|---|---|---|
| p0 | Minutes, BCD (&0x7f) | 0x6ab5e |
| p1 | Hours, BCD (&0x3f) | 0x6ab5c |
| p2 | Day, BCD | struct tm |
| p3 | Month (bit 4 = +10, low nibble) | struct tm |
| p4 | Year, BCD (+70 → tm_year) | struct tm → mktime → 0x7080c |
| p5 | Inside temp: p5>>1, signed 7-bit, °C. −63 means sensor fault ("Error") | 0x708c6 |
| p6 | ~p5 (check byte) | – |
| p7 | Only used in the checksum. Live capture: f6 normally, bit 0x20 clears (d6) while the unit is boosting | – |
| **p8** | **Fault flags A** (active low, see below) | 0x6ab68 |
| **p9** | **Fault flags B / fan state** (active low, see below) | 0x6ab69 |
| p10–p12 | Only used in the checksum. Live capture: p11 fe normally, f8 (0x06 clear) once boost req 0c is acknowledged, e8 (0x10 also clear) after req 0d; back to fe about 2 s after req returns to 01 | – |
| p13, p14 | Bit-reversed active-low value → 0x1e376. Written by byFsa only; nothing else reads it, so it is unused in this firmware | 0x1e376 |
| p15 | Checksum `~(p7^…^p14)` | – |
| p16 | Outside temp: p16>>1, signed 7-bit, °C; −63 = fault | 0x708c8 |
| p17 | ~p16 (check byte); mismatch prints "Outside temp checksum error" | – |
| p18 | **Humidity %**: v = p18>>1, active low and bit-reversed (bit 6 clear = +1 … bit 0 clear = +64). 0 or 127 = sensor fault (Diagnostics "Humidity Sensor" row). Live: 2a → 43 %, ca → 44 %, 4a → 45 %, 8a → 46 %, 0a → 47 %, f2 → 48 % | 0x708cb |
| p19 | Same encoding as p18; no reader found. Live: 0x54 → 85 | 0x708cc |

The 8 header bytes of every reply (before p0) were 00 in runs 1 and 2. In run 3 (logger v5) they were `60 84 00 e5 c8 c8 24 40` in every reply, which is d1..d8 of the settings frame sent just before. es-lcd ignores them. Debug page 2 shows the same 8 bytes in the replies to `01`, `0c` and `0d` alike, so they don't depend on the request: the MSP430 most likely just returns its last receive buffer. An ESP can ignore them.

p8 = p9 = 0xff means "No communications" (every Diagnostics row shows "?" and the comms row a cross). A change in p1, p5, p8, p9 or p16 triggers a redraw.

### p8 bits (0 = fault)
| Bit | Status line (Settings/Menu screen) | Diagnostics row |
|---|---|---|
| 0x40 | "Heater fail" (checked first) | – |
| 0x80 | "Cooler fail" | – |
| 0x08 | "Fan 1 fail" | Row 3 (y 0x88) |
| 0x20 | "Fan 2 fail" | Row 1 (y 0x58) |

The fan bars on Home are drawn coloured only when both 0x08 and 0x20 are set (both fans OK); otherwise they are grey.

### p9 bits (0 = active/fault)
| Bit | Meaning |
|---|---|
| 0x20 | "Frost fail" on the status line (lowest priority; otherwise "OK") |
| 0x08 | **Set = HX bypass on** (not read by es-lcd; see [Bypass control](#bypass-control-tested-live-mrxboxab-eco4-inside-22-c-outside-12-c)) |
| 0x04 | Clear → "Test routine required!", and 0x1e334 = 1. Also lights fan bar 3 |
| 0x02 | With 0x04, lights fan bar 2: bar 2 is lit unless both bits are set |

es-lcd draws fan bars 2 and 3 from these bits, as if they were the running speed (both set = speed 1, 0x02 clear = speed 2, 0x04 clear = speed 3). On my unit they stayed at f6 (speed 1) during speed 2 and speed 3, so they don't report the running speed. The running speed comes from p7 bit 0x20 (clear while the unit runs speed 2/3) and es-lcd's 0c/0d selector (0x708ca: 1 = speed 3). This was tested live with `/tmp/speed2` and `/tmp/speed3`.

### Diagnostics screen (33), top to bottom (labels confirmed from `Diagnostics.png`)
1. Extractor Fan: p8 0x20 (so "Fan 2" = extract)
2. Extractor Temp. Sensor: p5 ≠ −63 (so "inside temp" is the extract-air temperature)
3. Supply Fan: p8 0x08 (so "Fan 1" = supply)
4. Supply Fan Temp. Sensor: p16 ≠ −63 (so "outside temp" is the fresh-air intake temperature)
5. Humidity Sensor: p18 not 0 or 127 (so p18 = relative humidity %)
6. Communication With Unit: p8/p9 not both 0xff

## Home screen (2)
- Outside temp at top left, inside temp below; "Error" if −63.
- **Frost icon:** shown when outside temp ≤ frost level (0x708c4), the sensor is OK and the frost "s" timer is not running.
- **Mode icon:** Night (d0 0x10 clear), else Holiday (0x20 clear), else summer icon when the bypass override (0x80) is clear.
- **Filter-change icon:** run hours (0x1e30c) > 8759, i.e. one year. Maintenance key 0x72 resets it.
- Fan bars: see the p8/p9 notes. Extra bar segments while boost (0x708c0) or 0x708ca is active.

## Test routine (screen, key-driven)
A touchscreen test: touch the four corners (keys 0x31–0x34) and the centre box (0x35). When all 5 are done (mask 0x1f) it shows "V0.26 Feb 2016", the system type, the time and "Test routine completed". Key 0x20 resets it. It is prompted by p9 bit 0x04.

## CO2 sensor support (library only)
`msp430lib_get_co2` uses a separate I²C handle (CO2lib_init). It writes `22 00 08 2a` (a Senseair K30-style "read RAM 0x08" command), waits 20 ms, reads 4 bytes, and returns CO2 ppm = b1·256 + b2. No screen in this firmware shows it.

## Wiring: VSC to MRXBOX (4-core bus cable)

The wall box has a colour label red / yellow / green / blue next to the cable entry. Measured on my unit with the VSC powered and connected, meter black probe on blue:

| Wire | Signal | Measured |
|---|---|---|
| Red | Supply + | +10 V, steady |
| Blue | 0 V / GND | reference |
| Green | RS485 A (D+) | 1–2 V, jumping with traffic |
| Yellow | RS485 B (D−) | 1–2 V, jumping with traffic |

- Red probe on yellow, black on green reads slightly negative (under 0.5 V), so green idles higher and is A. The difference is small and the meter averages over traffic, and some vendors label A/B the other way round. If a tap decodes garbage or inverted bytes, swap green and yellow; it does no harm.
- Blue → C71 "−" leg (board ground) should read ~0 Ω with power off. Not yet checked.
- **Tested tap (XY-485 module): A+ ← yellow, B- ← green, GND ← blue.** With green on A+ the receiver never switched, so on this unit yellow behaves as A despite the meter reading above. Wiring details: [esp/vsc-serial-bridge/README.md](../esp/vsc-serial-bridge/README.md). **Red (supply) must never connect to the ESP.**

![Wall box colour label](images/wallbox_wire_label.jpg)

### VSC board (Rev C, 650931)

![VSC board front, annotated](images/pcb_front_annotated.jpg)

![VSC board back, annotated](images/pcb_back_annotated.jpg)

- **Grey 4-pin connector** (front, bottom left) is the bus cable. On the back its pads are P1–P4, with D1 (SMA diode, likely supply-input protection) next to one end pad.
- **R109/R110 "BIAS"** and **"T"** (termination) on the back sit on the RS485 pair; the traces run to the two middle pads, so data is in the middle and power on the outer pins.
- **IC12** "5430" is a TPS5430 buck regulator (with L3/L4/L5 15 µH, D2/D5/D6). C71 (220 µF / 10 V) is a handy ground point at its "−" leg.
- **D7 "LINK"** LED blinks with bus traffic.
- **20-pin TSSOP** next to J3 is most likely the bus micro (the firmware calls it msp430). **J3** is labelled 0V / MCLR / CLK / DAT, a PIC-style ICSP header, so the part number still needs reading off the chip.
- **Linux serial console** RX / TX / 0V header is next to the SD card.
- The RS485 transceiver chip has not been identified from the photos yet.

Close-ups: [bus connector, front](images/bus_connector_front.jpg), [bus pads, back](images/bus_pads_back.jpg).

## RS485 cross-reference (prior art)

@jamesgrogantech posted an RS485 capture of the same bus on the [HA forum thread](https://community.home-assistant.io/t/nuaire-mrxbox-interface-for-home-assistant/573933): 1200 baud 8N1, bytes sent MSB-first (a normal UART sees them bit-reversed), a burst of 9 messages repeating about every 0.7 s:

```
21 AA F4 D4
11 F6 4C
51 FE FE FE 04
31 FE FE 9A
33 FE FE 98
85 2E FE 30 FE FE CE
A3 FE … 08
75 FE … DE
3B C2 54 06
```

How that lines up with the I²C fields above:

| RS485 | I²C | Note |
|---|---|---|
| `21` byte 1 = `AA` | p8 = `aa` | Fault flags A ("Flt: Htr") |
| `21` byte 2 bit 0x02 (F4 boost / F6 normal) | p7 f6 → d6 on boost | Boost state; exact bit mapping still to confirm |
| `3B` byte 1 (C2 → 67 % reversed) | p18 | RH, same bit-reversed active-low encoding |
| `3B` byte 2 = `54` | p19 = `54` | Same value; meaning still open |

His capture has no temperatures in the broadcast, the checksum is unknown, and replaying a boost message did not work. Lining up a simultaneous RS485 + I²C capture is the next step.

## RS485 capture on my unit (work in progress, requires further testing)

Captured with the ESP bridge's bus tap (1200 baud 8N1, shown MSB-first). The same 9 frames repeat every 0.71 s, matching the forum capture above with each byte bit-reversed:

```
84 55 6F 6B
88 6F 32
8A 7F 7F 7F 20
8C 7F 7F 59
CC 7F 7F 19
A1 54 7F 58 7F 7F 07
C5 13 13 24 02 24 02 10
AE 7F 06 21 00 23
DC 4D 2A 6E
```

- **Framing:** the first byte (frame ID) always has bit 7 set; every byte after it is 7-bit. `7F` is the empty value.
- **Checksum:** all bytes of a frame XOR to `D5`, including the ID. Valid for every frame captured so far.
- **Data bytes are the I²C bytes bit-reversed.** Reverse the 8 bits of a bus data byte and you get the matching I²C byte from the tables above (the reply payload p0..p19 or the TX frame d0..d10), which then decodes as described there. Their lowest bit is always 0 (values are sent `<< 1`), so on the bus bit 7 is 0 and only the ID byte has it set. Checked against the VSC's own readings (extract 22 °C, intake 13 °C, RH 49 %, speed 1, airflow 18 / 32 / 100, humidity setpoint 66, bypass setpoint 24):

  | Frame | Sender (bit timing) | Bytes before the checksum | I²C bytes | Example |
  |---|---|---|---|---|
  | `84` | unit | fault flags A, fault flags B | p8, p9 | `55 6F` = `aa f6`: no fan faults, heat recovery. p9 0x08 (bypass on) is bus bit 0x10 |
  | `88` | VSC (speed request), see unplug test below | status | p7 | `6F` = `f6`; `6B` = `d6` at speed 2/3 |
  | `8A` | VSC (speed request), see unplug test below | speed | p10, p11, p12 | `7F` / `1F` / `17` in byte 2 = p11 `fe` / `f8` / `e8` at speed 1 / 2 / 3 |
  | `8C`, `CC` | unit | always empty | p13, p14 (one each, order unknown) | `7F 7F` |
  | `A1` | unit | extract temp, ?, intake temp, ?, ? | p5, –, p16 | `34` = `2c` → 22 °C, `58` = `1a` → 13 °C. Earlier `54` = 21 °C |
  | `C5` | VSC | airflow supply 3, extract 3, supply 1, supply 2, extract 1, extract 2 | d5..d10 | `13 13 24 02 24 02` = `c8 c8 24 40 24 40` → 100 100 18 32 18 32 % |
  | `AE` | VSC | mode flags, bypass setpoint, humidity setpoint, frost level | d0..d3 | `7F 06 21 00` = `fe 60 84 00` → no modes, 24 °C, 66 %, 0 |
  | `DC` | unit (unchanged with the VSC unplugged) | humidity, p19 | p18, p19 | `4E` → 49 % (for humidity, XOR with `7F` gives the same), `2A` = `54` → 85 |

  This corrects an earlier guess that `AE` byte 3 and `C5` held temperatures in BCD: those were the humidity setpoint and airflow.
- **Not on the bus:** the clock (p0..p4: no frame changes once a minute, so es-lcd's clock comes from the VSC's own bus chip), run hours and filter hours (es-lcd counters), and es-lcd's timers (boost length, night/holiday/override countdowns). Only the resulting mode bits go out, in `AE`.
- **Speed 2/3: `88` and `8A` are probably the VSC's request, not the unit's answer (requires further testing).** es-lcd asks for speed through the I²C read request byte (`01` / `0c` / `0d`), not the settings frame, so `AE` and `C5` never change with speed. A capture of every frame (not just changes) around `touch /tmp/speed2`, `/tmp/speed3` and back showed:
  - the same 9 frames in the same order every cycle, no extra frame, no odd gap;
  - `88` and `8A` changing in the first cycle after the request, about 0.4 s after the command, with no VSC frame changing before them. The unit had nothing on the bus to react to, so they most likely come from the VSC's bus chip.

  Against that, one "second page" `AE 7F 06 58 00 5A` was followed by a single `88 6B 36` at the start of the next cycle, which looks like the unit reacting. The unplug test below points to the VSC.
- **Unplug test (VSC power off, then bus cable off as well, then back):**
  - The unit keeps the whole cycle going on its own: the same 9 frames, same order, same timing, valid checksums. It is the bus master.
  - In the VSC's slots it sends defaults: `88 6F 32`, `8A 7F 7F 7F 20`, `AE 7F 7F 7F 7F 7B`, `C5 7F 7F 7F 7F 7F 7F 10`. `84`, `8C`, `CC`, `A1` and `DC` carry on unchanged, so `DC` (humidity) is the unit's, not the VSC's.
  - Pulling only the VSC's power gives the same result as pulling the bus cable too.
  - After plugging back in, the VSC's `AE`/`C5` came back once it had booted, with one boot-time `C5 13 13 24 02 24 7F 6D` (extract 2 still blank).
  - **Speed 3, then VSC power off:** `88 6B` → `6F` and `8A 17` → `7F` in the same cycle that the VSC died, before the `C5`/`AE` slots of that cycle went blank. If the unit were reporting its own speed and only reacting to losing the VSC, it could not know before the `AE`/`C5` slots, so `88`/`8A` are the VSC's speed request. The fans dropped at once.
  - The silence before each frame is the same with or without the VSC (`88` 18.3 ms, `8A` 16.6, `AE` 16.8, `C5` 19.3, unit frames 16.7–18.5, `84` ~205 ms after the previous cycle). The slot schedule is fixed by the unit; it probably waits a set time and fills a slot only if the VSC stays silent. **Requires further testing.**
  - Without the VSC the unit runs at the speed set by its hard-wired 4-core speed input (here wired for speed 1); it does not hold the VSC's speed.
  - **Requires further testing:** with the VSC unplugged, switch the hard-wired input to speed 3 and check `88`/`8A` stay at the defaults (not done: mains wiring).
- **Change tests (VSC shell controls, one at a time, each restored after ~45 s):** every settings change shows up first in a VSC frame and, where the unit reacts, in its reply one cycle (0.3 s) later. Mode bits in `AE` byte 1 are active low (`7F` = none; a mode clears its bit):

  | Control | Bus change | I²C |
  |---|---|---|
  | `touch /tmp/bypass_on` | `AE` byte 1 `7F` → `7E`, then `84 55 7F 7B` (byte 2 bit 0x10 set = bypass open) | d0 0x80 override; p9 0x08 |
  | `touch /tmp/bypass_off` | `AE` byte 1 `7F` → `6F`, then `84 55 6F 6B` (bypass closed) | d0 0x08 disable |
  | `echo 1 > /tmp/night` | `AE` byte 1 `7F` → `77` (VSC shows a 359 min night timer) | d0 0x10 night |
  | `echo 23 > /tmp/bypasstemp` | `AE` byte 2 `06` → `3A` | d1 = 23<<2 |
  | `echo 65 > /tmp/humidity_sp` | `AE` byte 3 `21` → `41` | d2 = 65<<1 |
  | `echo 1 > /tmp/holiday` | `AE` byte 1 `7F` → `7B` | d0 0x20 holiday |
  | `echo 1 > /tmp/frost_sp` | `AE` byte 4 `00` → `08` | d3 `10`: `frost_sp` 1 means −1 °C, so (−frost) << 4 as above |
  | airflow supply 1 18 → 19 % | `C5` byte 3 `24` → `64` | 19<<1 |
  | airflow `17 33 99 19 31 98` (S1 S2 S3 E1 E2 E3) | `C5 63 23 44 42 64 7C` → 99 98 17 33 19 31 | confirms the byte order supply 3, extract 3, supply 1, supply 2, extract 1, extract 2 |
  | `/tmp/speed2`, `/tmp/speed3` | `88 6B 36`; `8A` byte 2 `1F` / `17` | p7, p10..p12 |
  | `/tmp/settime` (clock +1 h) | nothing | the VSC showed the new time once, then went back to the real time within ~20 s, before the restore was sent (requires further testing) |

  Rising boost (screen: User Options → Rising Boost → Yes) has no shell control: `AE` byte 1 `7F` → `7D` (d0 0x40), nothing from the unit at 47 % RH. That the bit reached the bus also shows HASSOS mode was off. After the bypass tests the unit went from heat recovery to bypass open in auto, with no override set. Why is not known yet (requires further testing).
- **One-off frames:** single frames that appear once and are gone the next cycle, e.g. `AE 00 06 21 00 5C`, `AE 09 06 41 00 35`, `AE 7F 06 00 00 02`, `C5 13 13 00 02 24 02 34`, `C5 13 13 24 02 09 02 3D`. Their checksums are valid. Unknown whether they are deliberate or a glitch in the VSC's bus chip.
- **Second "pages":** for 15–60 s at a time a frame alternates every cycle with a variant, then goes back. Seen in a 30-minute log at speed 1, bypass off, with nothing changing in HA:
  - `AE 7F 09 21 00 2C` (byte 2 `06` → `09`)
  - `AE 7F 06 21 40 63` (byte 4 `00` → `40`)
  - `AE 7F 06 40 00 42` and `AE 7F 06 58 00 5A` (byte 3 `21` → `40` / `58`), each time together with `88 6B 36` (the speed 2/3 value of `88`)
  - `C5 13 13 24 02 00 02 34` (byte 5 `24` → `00`)
- **Two senders (from bit timing, see the bridge's `/bustiming`):** each byte's edges were timed with the ESP's microsecond clock. The frames split into two groups:

  | Frames | Bit length | Idle between bytes (beyond one stop bit) |
  |---|---|---|
  | `84` `88` `8A` `8C` `CC` `A1` | ~832.5 µs, the same in every frame | +33 to +75 µs |
  | `C5` `AE` `DC` | 834–841 µs, different per frame | −15 to −30 µs (stop bit cut short) |

  **Caveat:** the fit shifts with a frame's contents (`88 6F` 832.8 µs but `88 6B` 836.6 µs; `DC`'s idle −14 to +14 µs as its humidity byte changes), so it can't assign short frames on its own. `84` is the unit regardless: it changes one cycle after `AE` in the bypass tests.

  Silence is ~205 ms before `84`, ~19 ms before `C5` and ~17 ms elsewhere. The contents settle which is which: the first group carries the unit's temperatures and fault flags, so it is the MRXBOX; the second carries the VSC's settings and airflow, so it is the VSC (its bus chip). `DC` timing groups with the VSC, but the unplug test shows it comes from the unit, so timing alone is not a reliable sender test.
- **Per byte (the bridge's `/busbytes`, VSC on, speed 1):** in `C5` and `AE` the frame ID byte has the unit's bit length (833–834 µs) and is followed by the usual idle (+44 to +57 µs beyond one stop bit). The data bytes after it have the VSC's (841–846 µs) with the stop bit cut short (−7 to −80 µs). So **the unit sends the ID as a poll and the VSC answers with the data** about 50 µs after the ID's stop bit. That also explains the defaults with the VSC off: the unit polls, gets no answer and sends its own data. In `88` and `8A` the data bytes have too few edges (`6F`, `7F`) to tell the sender apart (requires further testing, e.g. at speed 3). The last byte of a frame often fits short (830–831 µs) whoever sends it, so treat its value with care.
- **Writing, with the VSC in parallel (2026-10-25):** the ESP answered each `88`/`8A` poll with speed 3 data while the VSC stayed connected. The fans sped up, but the VSC's bus chip answered in the same slot about 50 µs after the ID, so the tap saw garbled frames (`88 EF FC`, `8A FF FF FF DF`) and never a clean one, and the unit restarted its cycle from `84` far more often. Writing in parallel fights the chip; it needs the VSC off the bus or the ESP wired in series.
- **Writing, VSC powered off: the ESP replaces the VSC (2026-10-25, validated).** The bridge's VSC emulation (`/emu`, and the HA switch "VSC emulation") answers the `88`, `8A`, `AE` and `C5` polls itself:
  - It watches for an ID after a silence of more than a byte, samples it bit by bit in a 25 µs timer interrupt, and bit-bangs the slot's bytes (MSB first, start bit low, stop bit high) in step with where the unit's default would start. The XY-485 only drives the bus while TXD is low, so our 0 bits win over the unit's default (wired-AND) and the result on the wire is our frame. The XY-485 blanks its receiver while it transmits, so the tap sees only the ID of the slots we answer.
  - Bytes sent: `88` `6F` (speed 1) / `6B` (2, 3); `8A 7F xx 7F` with `7F` / `1F` / `17` for speed 1 / 2 / 3; `AE` mode, rev8(bypass SP << 2), rev8(humidity SP << 1), rev8(frost << 4); `C5` the six airflows, rev8(% << 1), in the order supply 3, extract 3, supply 1, supply 2, extract 1, extract 2. Each frame XORs to `D5`.
  - `AE` byte 1 (active low): `7E` bypass override On, `6F` bypass Off (forces heat recovery), `77` night, `7B` holiday, `7D` rising boost, `7F` none. These match the VSC's bytes in the change tests above.
  - Checked: speed 1/2/3 (by ear, and the frames), airflow % (the fans slowed at 50 %), bypass Auto/On/Off (the unit followed in `84`, p9 0x08), bypass setpoint, night, holiday, rising boost, humidity setpoint and frost level (frames byte-identical to the VSC's; the unit's response not seen, as RH stayed below the setpoint and the intake above 0 °C). Switching the emulation off gives the unit's defaults again within one cycle.
  - **The unit decides** the bypass and the humidity boost from the `AE` setpoints and its own sensors. The bypass has hysteresis around the setpoint and is re-checked about once a minute. There is no speed echo on the bus: the p8 fan bits don't follow the speed.
  - **What the emulation does instead of es-lcd:** run and filter hours (counted while the unit answers, seeded from the VSC's last values, saved every 15 min), and es-lcd's timers: speed 3 time limit (1–59 min, back to the speed before), night (4–8 h), holiday (1–21 days) and bypass override (1–12 h, On or Off). Each length can be 0 for no limit, as in HASSOS mode. Starting the bypass override cancels night, holiday and rising boost, as es-lcd does. The timers count down on a free-running minute tick, so a timer can end up to a minute early, and they survive a restart of the ESP.

## Still open
- **Later: real damper position.** p9 0x08 is the unit's decision, not the damper. Once the other reply bits are understood, look for one that lags p9 0x08 by about a minute (the wax actuator travelling), or capture the RS485 bus during a bypass change.
- p7, p11: boost acknowledgement bits (see table); exact meaning of each bit still open. p10, p12 constant so far. Run 3: pressing speed 3 (boost) on Home sent req 0c and then 0d, which stayed for about 26 minutes (from 158 s to the end), with p11 at e8 throughout; p15 follows as the checksum (ab → 8b → 8d → 9d). p9 stayed f6 (the speed-1 pattern) the whole time, so the p9 speed bits don't reflect boost; the v5 debug page also shows "Spd 1" during boost. Use p7 bit 0x20 / p11 to detect boost.
- Reply header bytes: zero in runs 1–2, but an echo of TX d1..d8 from run 3 on, identical for every req (see above).
- p19 meaning (no reader in es-lcd). The RS485 bus capture posted on the HA forum shows a `3B C2 54 06` message whose byte 2 is also 0x54, so p19 likely mirrors that field.
- p13, p14: always `fe fe` (0) on this unit and unused by es-lcd. Possibly for the CO2 sensor (see above); needs a unit with one fitted, or a change to watch for.
- p8 = 0xaa has bit 0x40 clear ("Heater fail"): check what the Settings status line shows on the real unit (possibly no heater fitted). The v5 debug page decodes it as "Flt: Htr", with both fan bits OK.
