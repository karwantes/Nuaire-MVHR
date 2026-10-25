# Option 4: the ESP replaces the VSC

With the VSC (the wall controller) off the bus, the ESP bridge answers the MRXBOX on RS485 in the VSC's place. Home Assistant controls the unit over MQTT, with no VSC, no SD card hack and no serial console.

**Status:** validated on one MRXBOX on 2026-10-25, with the VSC powered off and the ESP on the same parallel tap used for listening. Every control in HA was checked against the bus, and by ear for the fan speeds. The VSC was still wired to the bus, but powered off. Running with the VSC powered and the ESP wired in series between the VSC and the unit isn't done yet.

![HA diagnostic card with VSC emulation on](images/ha-mrxbox-emulation-diagnostic.png)

## What "VSC emulation" is

The VSC is two parts: the touchscreen program `es-lcd` (Linux) and a bus chip (MSP430) that talks to the unit. The unit is the bus master. About three times a second it runs a fixed cycle of frames, and in four of them it polls the VSC:

| Slot | What the VSC answers | Emulation sends |
|---|---|---|
| `88` | status (speed 1 vs 2/3) | `6F` at speed 1, `6B` at speed 2 or 3 |
| `8A` | requested speed | `7F` / `1F` / `17` in byte 2 for speed 1 / 2 / 3 |
| `AE` | mode flags, bypass setpoint, humidity setpoint, frost level | the settings from HA |
| `C5` | six airflow % (supply and extract for each speed) | the airflow % from HA |

If nobody answers a poll, the unit fills the slot with its own defaults and runs at the speed set by its hard-wired speed input. The emulation answers these four polls instead. It doesn't copy the VSC's program; it reproduces the bytes the VSC puts on the wire, and the part of the VSC's logic whose only output is those bytes. The byte-level detail is in [protocol.md](protocol.md#rs485-capture-on-my-unit-work-in-progress-requires-further-testing), under "Writing, VSC powered off".

### What the unit decides, and what the controller decides

The unit does the HVAC logic itself. The controller only sends requests and setpoints.

- **The unit decides:** whether the bypass opens (from the bypass setpoint and its own temperatures, re-checked about once a minute, with some hysteresis), the humidity boost (from the humidity setpoint and its RH sensor), frost protection (from the frost level), and the actual fan speeds (from the requested speed and the airflow %). It reports temperatures, RH, the bypass state and faults in its own frames, which the bridge reads.
- **The controller decides** what to ask for: the speed, the modes and the setpoints. On the VSC that is `es-lcd`; with option 4 it is the bridge, driven by HA.

### What the bridge does in `es-lcd`'s place

`es-lcd` keeps some state that never travels on the bus; only its result does. The emulation keeps the same state on the ESP:

- **Modes, as `AE` byte 1 (active low):** `7F` none, `7E` bypass override On, `6F` bypass Off (forces heat recovery), `77` night, `7B` holiday, `7D` rising boost.
- **Timers.** Each one returns the unit to normal when it runs out:

  | HA entity | Range | When it ends |
  |---|---|---|
  | Speed 3 time limit | 1–59 min | back to the speed it was at before speed 3 |
  | Night mode length | 4–8 h | night off |
  | Holiday length | 1–21 days | holiday off |
  | Bypass override length | 1–12 h | bypass back to Auto |

  A length of 0 means no limit, which is how the VSC behaves with **Controlled by HASSOS** ticked. "Time left" shows what is running. Timers carry on after an ESP restart. They count on a minute tick, so a timer can end up to a minute early.
- **Starting a bypass override cancels night, holiday and rising boost,** as `es-lcd` does.
- **Run hours and filter hours** are counted while the unit answers and saved every 15 minutes. They start from the VSC's last values (see setup below). "Filter change due" comes on at 8760 h, as on the VSC.
- **Settings are kept in flash:** speed, modes, setpoints, airflow and timer lengths come back after a power cut.

### What doesn't work without the VSC

- **Clock** and **Debug log** (shown as Unavailable / Unknown in the screenshot) come from the VSC's Linux console. They have no source with the VSC off, and nothing needs them: the unit has no clock.
- **Screen** settings (sleep time and so on) belong to the VSC's touchscreen.
- There is no wall screen. Control is HA, or the bridge's `/emu` page.

## How to set it up

You need the ESP bridge with the RS485 module, as in the [bridge README](../esp/vsc-serial-bridge/README.md). Do steps 1–3 with the VSC still running.

### 1. Wire the RS485 module, with TXD connected

Use the XY-485 wiring from the [bridge README](../esp/vsc-serial-bridge/README.md#rs485-bus-tap-optional-listen-only): A+ to yellow, B- to green, GND to blue **and** ESP GND, RXD to GPIO25, **TXD to GPIO26**. For listening, TXD is optional. For option 4 it is required, because that is how the ESP transmits.

- **Never the red wire (+10 V)** to the ESP or the module. Power the ESP from its own USB supply.
- Turn the unit off at its isolator before touching the bus wires.

### 2. Set up the bridge

Flash the firmware, join it to your Wi-Fi and enter the MQTT broker on its setup page (`http://vsc-bridge.local/`). The steps are in the [main README](../README.md#home-assistant-with-an-esp32-start-here). Then check that `http://vsc-bridge.local/bus` shows frames such as `84 …`, `AE …` and `C5 …` scrolling. If it shows none, fix the wiring before you go on.

### 3. Note the VSC's settings

The bridge starts with the factory defaults, so copy your own values before you switch the VSC off. They are on the VSC's screen (the Commissioning menu is under **Settings → spanner → PIN**, with installer PIN `1234`):

- airflow % for supply and extract at speeds 1, 2 and 3;
- bypass setpoint, humidity setpoint and frost level;
- run hours and filter hours (**Settings → Diagnostics**).

### 4. Switch the VSC off

Power the VSC off: disconnect it at its wall box with the unit isolated, but leave the ESP's yellow, green and blue connections in place. Turn the unit back on. It now runs on its own defaults at the speed of its hard-wired input. That's normal.

**Don't run the emulation with the VSC powered on the same bus.** Both would answer the same polls about 50 µs apart and garble every frame.

### 5. Turn on the emulation

In HA, on the MRXBOX device, turn on **VSC emulation** (or open `http://vsc-bridge.local/emu`). Within a few seconds:

- **Communication with unit** shows **Connected**;
- the controls (speed, bypass, setpoints, modes, airflow, timers) become available;
- the temperatures, RH and bypass state carry on from the unit.

### 6. Enter your settings

Set the airflow %, setpoints and timer lengths in HA (the airflow and timer entities are in the device's Configuration section). Carry over the hours once, from a computer on the same network:

```bash
curl -X POST -d "run=12345&filt=2345" http://vsc-bridge.local/emu
```

Use your own numbers: `run` and `filt` are whole hours.

### 7. Check it

- Set speed 3, then speed 1. The fans should speed up and slow down within a second or two.
- Set the bypass to On. "Bypass active" should turn on within about a minute, then go back when you set Auto.
- `http://vsc-bridge.local/emu` shows the bytes being sent and counters: `sent` should keep rising, and `late` should stay near 0.

## Going back to the VSC

Turn **VSC emulation** off in HA. The bridge stops transmitting at once and the unit goes back to its defaults. Then power the VSC back on. The bridge goes on listening, and with the console wired, option 1 works as before.

## Things to know

- **If the ESP stops** (power cut, crash), the unit carries on with its own defaults at the hard-wired speed, as it does when the VSC is off. It doesn't stay at the last speed HA set. The bridge picks up again once it has restarted.
- **No login on the bridge yet.** Anyone on your network can use the web pages and `/emu`. Keep the bridge on a trusted network.
- **Checked by frame only:** the humidity setpoint and the frost level produce the same bytes as the VSC, but the unit's reaction wasn't seen: RH stayed below the setpoint and the intake air stayed above 0 °C.
- **Next:** wiring the ESP in series between the VSC and the unit, so the VSC can stay powered and the two can hand control back and forth.
