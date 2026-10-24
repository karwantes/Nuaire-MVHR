"""Nuaire MVHR (MRXBOX VSC) over a USB serial dongle on the VSC console.

Experimental, requires further testing. The ESP bridge (MQTT discovery) doesn't need
this integration.
"""
from __future__ import annotations

from pathlib import Path

from homeassistant.components.frontend import add_extra_js_url
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant
from homeassistant.exceptions import ConfigEntryNotReady
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.typing import ConfigType

from .const import CONF_PORT, DOMAIN
from .coordinator import VscCoordinator

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

# The dashboard card ships with the integration: custom:nuaire-mvhr-card.
CARD_URL = "/nuaire_mvhr/nuaire-mvhr-card.js"
CARD_FILE = Path(__file__).parent / "frontend" / "nuaire-mvhr-card.js"

PLATFORMS = [
    Platform.BINARY_SENSOR,
    Platform.BUTTON,
    Platform.NUMBER,
    Platform.SELECT,
    Platform.SENSOR,
    Platform.SWITCH,
]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    await hass.http.async_register_static_paths([StaticPathConfig(CARD_URL, str(CARD_FILE), True)])
    # The file's mtime busts the browser cache when an update changes the card.
    version = int(await hass.async_add_executor_job(lambda: CARD_FILE.stat().st_mtime))
    add_extra_js_url(hass, f"{CARD_URL}?v={version}")
    return True


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
