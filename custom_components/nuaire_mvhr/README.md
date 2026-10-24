# Nuaire MVHR (VSC serial): Home Assistant custom integration

**Experimental, requires further testing.** It has been installed and run on a real Home
Assistant against a simulated console, but not on a real VSC yet. That comes later on the
roadmap.

This runs the ESP bridge's console logic inside Home Assistant, for a USB serial dongle
wired straight to the VSC's **LINUX TERMINAL** header, with no ESP:

- it logs in as root when the console shows `login:`;
- every 20 s it types the same poll line as the bridge and parses the `@S` answer;
- it types the same shell lines when you change something in HA.

So you get the same entities as the bridge's MQTT discovery.

The VSC card must be converted first ([docs/convert-card.md](../../docs/convert-card.md)).
Home Assistant doesn't convert anything.

## Connection modes

| Mode | How | Status |
|---|---|---|
| 1. ESP bridge on the VSC console | MQTT discovery from [the bridge](../../esp/vsc-serial-bridge/README.md). It doesn't need this integration. | Working |
| 2. USB serial dongle on the VSC console | This integration | Experimental, requires further testing |
| 3. TTL/RS485 adapter on the bus | Read only, planned once the bus is mapped | Not started |

Use mode 1 or mode 2, not both: two masters on one console would type over each other.

## Wiring

The header is RS232 level (115200 8N1), so a **USB-to-RS232** dongle connects to it
directly: dongle TX to VSC RX, dongle RX to VSC TX, GND to 0V. A plain USB-TTL (3.3 V)
adapter needs a MAX3232 module in between, as on the ESP.

Pin positions are in [docs/convert-card.md](../../docs/convert-card.md).

## Install

1. In HACS, open the menu, choose **Custom repositories**, add
   `https://github.com/karwantes/Nuaire-MVHR` as type **Integration**, then download
   **Nuaire MVHR (VSC serial)**. Or copy `custom_components/nuaire_mvhr` to
   `/config/custom_components/` by hand.
2. Restart Home Assistant.
3. Go to **Settings > Devices & services > Add integration > Nuaire MVHR (VSC serial)**.
   Pick the dongle, or type a path. A `/dev/serial/by-id/...` path survives a reboot.
   An `rfc2217://` or `socket://` URL also works, for a serial server.

## Entities

These are the same as the MQTT bridge:

- **Controls:**
  - Fan speed 1/2/3
  - Bypass Auto/On/Off and the bypass setpoint
  - Night mode and holiday mode
  - Humidity setpoint and frost protection level
  - Supply and extract airflow for speed 1/2/3
  - Screen timeout
  - Reset filter hours
  - Debug logging. The es-lcd log lines go to the HA log at debug level for `custom_components.nuaire_mvhr`.
- **Sensors:**
  - Humidity
  - Extract and intake air temperature
  - Running fan speed
  - Run hours and filter hours
  - Filter change due
  - Bypass active
  - Communication with unit
  - Clock (the VSC's clock). As on the bridge, the integration sets it to HA's local time
    when it is more than a minute out (requires further testing).
- **Fault sensors:** supply fan, extract fan, heater, cooler, frost, and test routine required.

Heater fault, Cooler fault and Test routine required still need testing, as on the bridge.
Disable the heater and cooler entities if your unit has neither fitted.

If the VSC doesn't answer 3 polls in a row, the entities go unavailable and
**Communication with unit** shows off. That happens when the VSC is off or unplugged, or
the console isn't at a root shell. Unlike the ESP bridge there is no debug log entity, no
telnet and no file upload.

## Dashboard card (alpha)

The integration also loads a dashboard card, so there is no resource to add. Add a card
and pick **Nuaire MVHR**, or use `type: custom:nuaire-mvhr-card`. Everything is set in the
visual editor:

- It finds the unit's entities by itself; you can pick others under **Unit entities**.
- Extra sensors (supply and exhaust air temperature, heat recovery, house temperature,
  humidity and target) are optional.
- **Show coil** adds a heating/cooling coil after the MVHR, with its own sensors. It's off
  by default.
- **Bypass active 'on' means air goes through the exchanger** flips the bypass drawing, for
  units whose Bypass active sensor reads on while the damper is shut.
- Every box, value and chip opens its entity; the controls row sets fan speed, bypass,
  bypass setpoint, night and holiday.
- The layout switches to portrait below 720 px wide and scales up to 4K without overlaps.
- **Space under the card for a fixed bottom bar** keeps the controls clear of a kiosk or
  nav bar fixed to the bottom of the screen.

It also works with the ESP bridge's MQTT entities, without this integration: copy
`frontend/nuaire-mvhr-card.js` to `/config/www/` and add it as a dashboard resource
(`/local/nuaire-mvhr-card.js`, JavaScript module).

Alpha: tested on a dashboard with the bridge's entities; **requires further testing** on
other setups.

## Tested

- The parser and command lines, offline against real poll answers.
- Loaded in Home Assistant against a simulated console over `socket://`:
  - the config flow, login and all entities;
  - commands;
  - going unavailable when the console stops answering, and recovering.
- On a real VSC with a USB dongle: **requires further testing**.
