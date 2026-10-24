"""Nuaire MVHR (MRXBOX VSC) over a USB serial dongle on the VSC console.

Experimental, requires further testing. The ESP bridge (MQTT discovery) doesn't need
this integration.
"""
from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady

from .const import CONF_PORT
from .coordinator import VscCoordinator

PLATFORMS = [
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    coord = VscCoordinator(hass, entry.data[CONF_PORT])
    try:
        await coord.async_connect()
    except Exception as err:   # serial raises SerialException / OSError
        raise ConfigEntryNotReady(f"cannot open {coord.port}: {err}") from err
    entry.runtime_data = coord
    # No first refresh here: the console may need a login first, and the entities
    # show unavailable until the first answer.
    coord.async_set_update_error(Exception("waiting for the VSC console"))
    hass.async_create_task(coord.async_refresh())
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if ok:
        await entry.runtime_data.async_close()
    return ok
