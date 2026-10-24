"""Selects: fan speed 1/2/3 and bypass Auto/On/Off."""
from __future__ import annotations

from homeassistant.components.select import SelectEntity

from .entity import VscEntity


async def async_setup_entry(hass, entry, async_add_entities):
    coord = entry.runtime_data
    async_add_entities([
        VscSelect(coord, "speed", "Fan speed", ["1", "2", "3"], "mdi:fan"),
        VscSelect(coord, "bypass", "Bypass", ["Auto", "On", "Off"], "mdi:valve"),
    ])


class VscSelect(VscEntity, SelectEntity):
    def __init__(self, coord, key, name, options, icon):
        super().__init__(coord, key, name, icon)
        self._attr_options = options

    @property
    def current_option(self):
        return self.unit_value

    async def async_select_option(self, option: str) -> None:
        await self.send(option)
