"""Serial connection to the VSC console and the poll loop."""
from __future__ import annotations

import asyncio
import logging
from datetime import timedelta

import serial_asyncio_fast as serial_asyncio

from homeassistant.core import HomeAssistant
from homeassistant.helpers.update_coordinator import DataUpdateCoordinator, UpdateFailed
from homeassistant.util import dt as dt_util

from .const import BAUD, CLOCK_SET_SECONDS, DOMAIN, NO_REPLY, POLL_SECONDS, REPLY_TIMEOUT
from .protocol import POLL_CMD, ConsoleTracker, clock_command, command, parse_poll

_LOGGER = logging.getLogger(__name__)


class VscCoordinator(DataUpdateCoordinator[dict]):
    """Owns the serial port. Every POLL_SECONDS it types the poll line (or only Enter
    until the console is at a root shell) and waits for the "@S" answer. After NO_REPLY
    polls with no answer (VSC off, unplugged or not logged in) the entities go
    unavailable."""

    def __init__(self, hass: HomeAssistant, port: str) -> None:
        super().__init__(hass, _LOGGER, name=DOMAIN, update_interval=timedelta(seconds=POLL_SECONDS))
        self.port = port
        self._reader: asyncio.StreamReader | None = None
        self._writer: asyncio.StreamWriter | None = None
        self._task: asyncio.Task | None = None
        self._tracker = ConsoleTracker()
        self._reply = asyncio.Event()
        self._state: dict = {}
        self._no_reply = 0
        self._lock = asyncio.Lock()
        self.bypass_temp: int | None = None   # last setpoint sent; the unit can't report it
        self._speed1 = 0   # polls in a row at speed 1, where es-lcd reads the clock
        self._clock_set = 0.0

    async def async_connect(self) -> None:
        self._reader, self._writer = await serial_asyncio.open_serial_connection(
            url=self.port, baudrate=BAUD
        )
        self._task = self.hass.async_create_background_task(self._read_loop(), f"{DOMAIN} reader")

    async def async_close(self) -> None:
        if self._task:
            self._task.cancel()
            self._task = None
        if self._writer:
            self._writer.close()
            self._writer = None

    def _write_line(self, text: str) -> None:
        if self._writer is None:
            raise UpdateFailed("serial port not open")
        self._writer.write(text.encode() + b"\r")

    async def _read_loop(self) -> None:
        assert self._reader is not None
        while True:
            data = await self._reader.read(256)
            if not data:
                _LOGGER.warning("Serial port %s closed", self.port)
                return
            lines, actions = self._tracker.feed(data.decode("latin-1"))
            for action in actions:
                if action == "login":
                    self._write_line("root")
                elif action == "shell":
                    # poll 1 s after reaching the shell
                    self.hass.loop.call_later(1, lambda: self.hass.async_create_task(self.async_request_refresh()))
            for line in lines:
                if line.startswith("@L "):
                    _LOGGER.debug("VSC: %s", line[3:])
                    continue
                st = parse_poll(line)
                if st is None:
                    continue
                self._no_reply = 0
                self._state = {**self._state, **st}
                self._reply.set()
                self.async_set_updated_data(self._state)

    async def _poll(self, prefix: str = "") -> None:
        """Type the poll line (after prefix) and wait for the answer."""
        async with self._lock:
            self._reply.clear()
            if not self._tracker.shell:
                self._write_line("")
            else:
                self._write_line(prefix + POLL_CMD)
            try:
                await asyncio.wait_for(self._reply.wait(), REPLY_TIMEOUT)
            except asyncio.TimeoutError:
                pass

    async def _async_update_data(self) -> dict:
        if self._task is None or self._task.done():
            # dongle unplugged or the port closed: try to open it again
            await self.async_close()
            try:
                await self.async_connect()
            except Exception as err:   # serial raises SerialException / OSError
                raise UpdateFailed(f"cannot open {self.port}: {err}") from err
        await self._poll()
        if self._reply.is_set():
            self._clock_check()
            return self._state
        self._no_reply += 1
        if self._no_reply >= NO_REPLY or not self._state:
            raise UpdateFailed("no answer from the VSC console")
        return self._state

    def _clock_check(self) -> None:
        """Set the VSC clock to HA's local time when it is more than a minute out, as
        the ESP bridge does. es-lcd only reads the clock at speed 1, so this waits for
        two polls in a row at speed 1."""
        self._speed1 = self._speed1 + 1 if self._state.get("speed") == "1" else 0
        clock = self._state.get("clock")
        mono = self.hass.loop.time()
        if not clock or self._speed1 < 2 or (self._clock_set and mono - self._clock_set < CLOCK_SET_SECONDS):
            return
        now = dt_util.now()
        cmd = clock_command(clock, now.hour, now.minute, now.day)
        if cmd and self._tracker.shell:
            _LOGGER.info("VSC clock %s, setting it to %02d:%02d", clock, now.hour, now.minute)
            self._write_line(cmd)
            self._clock_set = mono

    async def async_send(self, key: str, value) -> None:
        """A change from HA: type the shell line, then the poll so HA sees the result."""
        cmd = command(key, value, self._state)
        if cmd is None:
            raise ValueError(f"{key}: value {value} out of range or airflow not known yet")
        if not self._tracker.shell:
            raise UpdateFailed("VSC console is not at a shell")
        if key == "bypass_temp":
            self.bypass_temp = int(value)
        await self._poll(cmd + "; ")
