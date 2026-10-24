"""Config flow: pick the USB serial dongle wired to the VSC console."""
from __future__ import annotations

import glob
import os

import serial
import serial.tools.list_ports
import voluptuous as vol

from homeassistant.config_entries import ConfigFlow, ConfigFlowResult
from homeassistant.helpers.selector import SelectOptionDict, SelectSelector, SelectSelectorConfig

from .const import BAUD, CONF_PORT, DOMAIN


def _ports() -> list[SelectOptionDict]:
    """Serial ports, as /dev/serial/by-id paths where they exist: those survive a
    reboot, /dev/ttyUSB0 may not."""
    by_id = {os.path.realpath(p): p for p in glob.glob("/dev/serial/by-id/*")}
    out = []
    for p in serial.tools.list_ports.comports():
        dev = by_id.get(p.device, p.device)
        label = f"{dev} ({p.description})" if p.description and p.description != "n/a" else dev
        out.append(SelectOptionDict(value=dev, label=label))
    return out


def _try_open(port: str) -> None:
    serial.serial_for_url(port, baudrate=BAUD, timeout=1).close()


class VscConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input=None) -> ConfigFlowResult:
        errors = {}
        if user_input is not None:
            port = user_input[CONF_PORT].strip()
            await self.async_set_unique_id(port)
            self._abort_if_unique_id_configured()
            try:
                await self.hass.async_add_executor_job(_try_open, port)
            except (serial.SerialException, OSError, ValueError):
                errors["base"] = "cannot_open"
            else:
                return self.async_create_entry(title=f"MRXBOX ({port})", data={CONF_PORT: port})

        ports = await self.hass.async_add_executor_job(_ports)
        # pick from the list, or type a path (or an rfc2217:// / socket:// URL)
        schema = vol.Schema({
            vol.Required(CONF_PORT): SelectSelector(SelectSelectorConfig(options=ports, custom_value=True)),
        })
        return self.async_show_form(step_id="user", data_schema=schema, errors=errors)
