"""VSC console protocol: the poll line, its parser and the command lines.

The same logic as the MQTT part of esp/vsc-serial-bridge, without Home Assistant imports
so it can be tested on its own.
"""
from __future__ import annotations

import re

# One console line that reports the state. "@""S" so the echoed command line doesn't
# look like the answer.
POLL_CMD = (
    'echo "@""S" $(cat /tmp/bypass_state 2>/dev/null) '
    '"@""T" $(cat /tmp/sensors 2>/dev/null) '
    '"@""R" $(cat /tmp/runtime 2>/dev/null) '
    '"@""C" $(cat /tmp/screen_state 2>/dev/null) '
    '"@""M" $(cat /tmp/modes 2>/dev/null) '
    '"@""A" $(cat /tmp/airflow_state 2>/dev/null) '
    "$(ls /tmp/speed2 /tmp/speed3 /tmp/bypass_on /tmp/bypass_off /tmp/debug 2>/dev/null)"
)

# Airflow % for supply speed 1/2/3 then extract speed 1/2/3, as /tmp/airflow_state reports it.
AIR_KEYS = ("air_s1", "air_s2", "air_s3", "air_e1", "air_e2", "air_e3")

# Fault bits from /tmp/sensors P8/P9 (active low: a clear bit is a fault). Heater fault,
# Cooler fault and "Test routine required" still need testing (see the bridge README).
FAULTS = (
    ("fault_supply_fan", "Supply fan fault", 8, 0x08),
    ("fault_extract_fan", "Extract fan fault", 8, 0x20),
    ("fault_heater", "Heater fault", 8, 0x40),
    ("fault_cooler", "Cooler fault", 8, 0x80),
    ("fault_frost", "Frost fault", 9, 0x20),
    ("test_required", "Test routine required", 9, 0x04),
)

# es-lcd shows the filter icon above 8759 hours (one year).
FILTER_HOURS_DUE = 8759


def _ints(text: str | None, n: int) -> list[int] | None:
    if text is None:
        return None
    parts = text.split()
    if len(parts) < n:
        return None
    try:
        return [int(p) for p in parts[:n]]
    except ValueError:
        return None


def _section(body: str, tag: str) -> str | None:
    """Text after "@<tag>" up to the next "@X" marker."""
    m = re.search(r"@" + tag + r"(?=\s|$)(.*?)(?=@[A-Z](?:\s|$)|$)", body)
    return m.group(1) if m else None


def parse_poll(line: str) -> dict | None:
    """Parse a poll answer ("@S 1 @T ... @A ...") into a state dict, or None if the
    line isn't one. Missing or broken sections leave their keys out."""
    i = line.find("@S")
    if i < 0 or (len(line) > i + 2 and line[i + 2] != " "):
        return None
    body = line[i:]
    st: dict = {
        "speed": "3" if "/tmp/speed3" in body else "2" if "/tmp/speed2" in body else "1",
        "bypass": "On" if "/tmp/bypass_on" in body else "Off" if "/tmp/bypass_off" in body else "Auto",
        "debug": "/tmp/debug" in body,
    }
    s = (_section(body, "S") or "").strip()
    if s[:1] in ("0", "1"):
        st["bypass_state"] = s[0] == "1"

    # "@T EXT IN RH SPD P8 P9" (/tmp/sensors). "-" is a sensor fault (None).
    # P8 = P9 = 255 is no communications with the unit.
    t = _section(body, "T")
    tok = t.split() if t else []
    if len(tok) >= 6:
        try:
            p8, p9 = int(tok[4]), int(tok[5])
        except ValueError:
            p8 = p9 = None
        if p8 is not None:
            comms = not (p8 == 255 and p9 == 255)
            st["comms"] = comms
            for key, val, conv in (
                ("temp_extract", tok[0], float),
                ("temp_intake", tok[1], float),
                ("humidity", tok[2], float),
                ("fan_running", tok[3], str),
            ):
                try:
                    st[key] = None if not comms or val == "-" else conv(val)
                except ValueError:
                    st[key] = None
            for key, _name, byte, bit in FAULTS:
                b = p8 if byte == 8 else p9
                st[key] = None if not comms else not (b & bit)

    # "@R RUN FILTER" (/tmp/runtime)
    r = _ints(_section(body, "R"), 2)
    if r:
        st["run_hours"], st["filter_hours"] = r
        st["filter_change"] = r[1] > FILTER_HOURS_DUE

    c = _ints(_section(body, "C"), 1)
    if c:
        st["screen_timeout"] = c[0]

    # "@M HUM FROST NIGHT HOLIDAY" (/tmp/modes): frost as 0-5 (= 0 to -5 °C),
    # night/holiday minutes left
    m = _ints(_section(body, "M"), 4)
    if m:
        st["humidity_sp"] = m[0]
        st["frost_sp"] = -m[1]
        st["night"] = bool(m[2])
        st["holiday"] = bool(m[3])

    a = _ints(_section(body, "A"), 6)
    if a:
        st.update(zip(AIR_KEYS, a))
    return st


def command(key: str, value, state: dict | None = None) -> str | None:
    """Shell line for a change from HA, or None if the value is out of range."""
    if key == "speed":
        return {
            "1": "rm -f /tmp/speed2 /tmp/speed3",
            "2": "rm -f /tmp/speed3; touch /tmp/speed2",
            "3": "rm -f /tmp/speed2; touch /tmp/speed3",
        }.get(str(value))
    if key == "bypass":
        return {
            "Auto": "rm -f /tmp/bypass_on /tmp/bypass_off",
            "On": "rm -f /tmp/bypass_off; touch /tmp/bypass_on",
            "Off": "rm -f /tmp/bypass_on; touch /tmp/bypass_off",
        }.get(str(value))
    if key == "debug":
        return "touch /tmp/debug" if value else "rm -f /tmp/debug"
    if key in ("night", "holiday"):
        return f"echo {1 if value else 0} > /tmp/{key}; sleep 2"
    if key == "filter_reset":
        return "touch /tmp/filter_reset; sleep 2"
    v = int(value)
    if key == "bypass_temp":
        return f"echo {v} > /tmp/bypasstemp" if 15 <= v <= 30 else None
    if key == "screen_timeout":
        return f"echo {v} > /tmp/screen_timeout; sleep 2" if 0 <= v <= 120 else None
    if key == "humidity_sp":
        return f"echo {v} > /tmp/humidity_sp; sleep 2" if 50 <= v <= 85 else None
    if key == "frost_sp":
        return f"echo {-v} > /tmp/frost_sp; sleep 2" if -5 <= v <= 0 else None
    if key in AIR_KEYS:
        # The unit takes all six at once; the next poll puts HA back to what the unit has.
        if not state or not all(k in state for k in AIR_KEYS) or not 1 <= v <= 100:
            return None
        a = [v if k == key else state[k] for k in AIR_KEYS]
        return "echo " + " ".join(str(x) for x in a) + " > /tmp/airflow; sleep 2"
    return None


class ConsoleTracker:
    """Follows the console byte stream like the bridge's mqConsole: assembles lines,
    answers "login:" with root, and tracks whether the console is at a root shell.

    feed() returns (lines, actions); actions are "login" (send "root") and "shell"
    (just reached a shell: poll soon)."""

    def __init__(self) -> None:
        self.shell = False
        self._buf = ""

    def feed(self, data: str) -> tuple[list[str], list[str]]:
        lines: list[str] = []
        actions: list[str] = []
        for ch in data:
            if ch in "\r\n":
                if self._buf:
                    if "Starting Kernel" in self._buf or "INIT: Entering runlevel" in self._buf:
                        self.shell = False
                    lines.append(self._buf)
                self._buf = ""
                continue
            if len(self._buf) < 1024:
                self._buf += ch
            if self._buf.endswith("login:"):
                self.shell = False
                actions.append("login")
            elif self._buf.endswith("Password:"):
                self.shell = False   # the next Enter gives "Login incorrect" and a new "login:"
            elif self._buf == "# " and not self.shell:
                self.shell = True
                actions.append("shell")
        for ln in lines:
            if parse_poll(ln) is not None:
                self.shell = True
        return lines, actions
