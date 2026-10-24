"""Switches: night mode, holiday mode, debug logging."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.const import EntityCategory

from .entity import VscEntity


async def async_setup_entry(hass, entry, async_add_entities):
    coord = entry.runtime_data
    async_add_entities([
        VscSwitch(coord, "night", "Night mode", None, "mdi:weather-night"),
        VscSwitch(coord, "holiday", "Holiday mode", None, "mdi:bag-suitcase"),
        # es-lcd log lines ("@L ...") go to the HA log at debug level for this integration
        VscSwitch(coord, "debug", "Debug logging", EntityCategory.CONFIG, "mdi:text-box-search"),
    ])


class VscSwitch(VscEntity, SwitchEntity):
    def __init__(self, coord, key, name, cat, icon):
        super().__init__(coord, key, name, icon)
        self._attr_entity_category = cat

    @property
    def is_on(self):
        return self.unit_value

    async def async_turn_on(self, **kwargs) -> None:
        await self.send(True)

    async def async_turn_off(self, **kwargs) -> None:
        await self.send(False)
