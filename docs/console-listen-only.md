# Experimental: watch the console with a 10k resistor (listen only)

**This is not part of the installation.** For Home Assistant, use a MAX3232 module as in [convert-card.md](convert-card.md#6-wire-it-and-first-boot).

If you don't have a MAX3232 module yet, you can still watch the console, for example to see that a converted card boots to `login:`. You need one 10 kΩ resistor and 2 jumper wires.

![VSC TX to ESP32 GPIO16 through a 10 kΩ resistor, 0V to GND](images/vsc-console-resistor-hack.svg)

| VSC LINUX TERMINAL | | ESP32 |
|---|---|---|
| 0V | wire | GND |
| TX | 10 kΩ resistor in series | GPIO16 (RX) |
| RX | not connected | GPIO17 not connected |

- In the bridge, set the polarity to **RS232 (inverted)** (the default) and turn **TX off**.
- Leave ESP GPIO17 (TX) physically disconnected.
- The header's TX idles at about −5 V. The resistor only limits the current into the ESP pin. That is not the same as a proper RS232 interface, and it hasn't been checked that it is safe for the ESP long term. Use it for short checks only. **Never connect VSC TX straight to the ESP.**
- **Listen only.** The ESP can't type to the VSC, so it can't log in and Home Assistant gets nothing.
- Wire it with the unit and the ESP both unpowered. **Never connect the red bus wire (+10 V).**
