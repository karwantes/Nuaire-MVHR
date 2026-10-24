# Custom screen theme and HASSOS mode

`i2clog.so` (in `logger/`) can reskin the VSC screen and adds a **Controlled by HASSOS** tick box to the Settings page. It all runs on the stock `es-lcd`; no firmware file is changed.

No screen artwork is published here, stock or custom. You make your own set from your own card, using the steps below.

## How it works

`es-lcd` draws every screen from PNG files in `/opt/dvsdk/dm355/images/`. Over those it draws live text (time, temperatures, values) and erase boxes, and it assumes a white page.

If `images/.dark` exists when `es-lcd` starts, `i2clog.so` redirects five of its drawing routines:

| es-lcd draws | Theme draws |
|---|---|
| Dark text | Light text |
| White or light-grey erase boxes | The colour under the box (most of its 4 corners), so values sit cleanly on any background |
| Grey (`c0 c0 c0`) fills | Muted blue-grey |
| Fan speed bars, off / on | Theme bar colours |
| Green selection highlight | Dark blue highlight |

Without `.dark`, nothing is patched and the unit looks and behaves as stock. The log shows `THEME dark` or `THEME off` after `START`.

The colours are the `C_*` defines in `logger/i2clog.c`:

```c
#define C_NAVY 0x08c6    /* #081831 page background, used when the corners disagree */
#define C_BAR_OFF 0x2a2b /* #29455a fan bar, off */
#define C_BAR_ON 0x05dd  /* #00baef fan bar, on */
#define C_MUTED 0x5b90   /* #5a7184 replaces the stock light grey */
#define C_SELECT 0x0aaf  /* #08557b selection highlight */
```

They are RGB565 (the screen's format). Change them to match your artwork and rebuild with `logger/build.sh`.

## Making your own screens

### Rules for the artwork

- **Same file names** as the stock images, including spelling, case and spaces. `es-lcd` loads them by name.
- **Same sizes.** Full screens are 320 × 240; icons keep the size of the stock file they replace. Save as plain RGB PNG.
- **Keep every button where it is.** The touch areas are fixed in `es-lcd`; only the artwork changes.
- **Leave value areas blank** with one solid colour. Live text and its erase box are drawn there, and the box takes the colour of its corners.
- **No baked-in numbers**, times or sample values.

### Settings page (the old Maintenance page)

The tick box needs two full-screen images:

| File | Shows |
|---|---|
| `Maintenance.png` | The Settings page with the box **unticked** |
| `Settings-HASSOS-checked.png` | The same page with the box **ticked** (a new file, not in the stock set) |

The touch area for the tick box and its label is x 78–307, y 155–187. Draw the box and the "Controlled by HASSOS" label inside it. The design I use has the box outline at x 79, y 161, 18 × 18.

Tapping the logo at the top right of this page still opens the hidden debug page.

### Quick start: a dark version of your stock set

`darken.py` turns your card's stock images into a dark set automatically: the page goes dark, coloured panels get muted and the text goes light. It's a good base to edit by hand.

From the repo root, after [extracting your card's root filesystem](../README.md#2-extract-the-second-partition) into `rootfs_p2`:

```sh
pip install pillow numpy
python theme/darken.py rootfs_p2/opt/dvsdk/dm355/images my_dark
python theme/overview.py my_dark overview.png
```

`overview.png` is a contact sheet of every full screen, so you can check them all at once. Then:

1. Edit `my_dark/Maintenance.png` into the Settings page, and save the ticked copy as `my_dark/Settings-HASSOS-checked.png`.
2. Replace the logo, if you want one, in the same place and at the same size.
3. Create an empty file `my_dark/.dark`.

Keep `my_dark/` to yourself. It is made from Nuaire's artwork, so don't publish it (`theme/dark/` is git-ignored for that reason).

## Installing it

You need `i2clog.so` in place first: a card built with `tools/mkimg.py` (see the [main README](../README.md#sd-card-images)) already has it.

### On a spare card (simplest)

With the card in a Linux or WSL machine, mount its second partition read-write (`/dev/sdX2` is the card):

```sh
sudo mount /dev/sdX2 mnt
cd mnt/opt/dvsdk/dm355
sudo mv images images.orig
sudo cp -r /path/to/my_dark images
ls -a images/.dark
cd - && sudo umount mnt
```

Boot the VSC. You should see the new screens with light values on them.

### On a running unit (root shell)

Copy your set to the unit as `/opt/dvsdk/dm355/images.dark` (with `.dark` inside), then:

```sh
cd /opt/dvsdk/dm355 && mv images images.orig && mv images.dark images && sync
```

Reboot to load it. Use `mv` as shown, never copy over the live `images` folder.

### Going back

```sh
cd /opt/dvsdk/dm355 && mv images images.dark && mv images.orig images && sync
```

Reboot. The stock screens are back and the theme switches itself off, because `.dark` is gone.

## HASSOS mode ("Controlled by HASSOS")

The tick box turns the VSC into a **screen and manual override** for Home Assistant. HA runs the schedule; the VSC stops making decisions of its own.

Ticking it creates `/etc/hassos`; unticking deletes it. It's kept across reboots. You can also set it from the shell: `echo 1 > /etc/hassos` or `rm /etc/hassos`.

The tick box only appears with a theme installed (`images/.dark`), because the stock artwork has no box to draw. The mode itself works either way.

### What changes when it's ticked

| es-lcd normally | In HASSOS mode |
|---|---|
| Ends speed 2/3 when its timer runs out | Speed 2/3 stays until a touch or HA changes it |
| Ends night, holiday and summer bypass override after their timers | They stay on until a touch or HA turns them off |
| Ends the Commissioning bypass "disable" (forced heat recovery) and frost protection timers after 8 h | They stay until changed |
| Goes to speed 3 by itself on rising humidity | Rising humidity is turned off in the settings frame, so it doesn't |

### What does not change

- **The touch screen keeps working.** Any key does what it always did. That's the end-user override; it stays in place until HA or another touch changes it.
- **The MSP430 and MRXBOX keep their own protections.** Only `es-lcd`'s automations are stopped. Faults and any safety logic in the unit itself still run.
- **The screen still shows the live state**, including changes made from HA.

### How HA drives it

For now, HA uses small files on the unit (through the ESP serial bridge in `esp/vsc-serial-bridge/`):

| File | Effect |
|---|---|
| `touch /tmp/speed2` | Speed 2, shown on screen as if Home was pressed |
| `touch /tmp/speed3` | Speed 3 (wins over speed 2) |
| `rm /tmp/speed2 /tmp/speed3` | Back to speed 1 |
| `echo HHMMDD > /tmp/settime` | Sets the clock (e.g. `143024` = 14:30 on the 24th), then deletes itself |
| `touch /tmp/bypass_on` | Bypass ON: damper open, air skips the heat exchanger (wins over `bypass_off`) |
| `touch /tmp/bypass_off` | Bypass OFF: damper closed, heat recovery |
| `rm /tmp/bypass_on /tmp/bypass_off` | Auto: the unit decides from the setpoint |
| `echo 24 > /tmp/bypasstemp` | Sets the bypass setpoint (15–30 °C), then deletes itself. Not saved, so a restart goes back to the stored value |
| `cat /tmp/bypass_state` | `1` = the unit has bypass ON, `0` = heat recovery. Updated when it changes |

These work with the tick box off too. Without HASSOS mode, es-lcd's timers end speed 2/3 as normal, and bypass on/off after 12 h / 8 h.

`/tmp/bypass_state` is the unit's own decision (p9 0x08), not a switch on the damper. The damper has a wax actuator and follows over about a minute.
