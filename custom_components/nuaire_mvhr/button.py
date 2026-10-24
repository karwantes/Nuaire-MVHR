"""Button: reset filter hours."""
from __future__ import annotations

from homeassistant.components.button import ButtonEntity
from homeassistant.const import EntityCategory

from .entity import VscEntity


async def async_setup_entry(hass, entry, async_add_entities):
    async_add_entities([VscButton(entry.runtime_data, "filter_reset", "Reset filter hours", "mdi:restore")])


class VscButton(VscEntity, ButtonEntity):
    _attr_entity_category = EntityCategory.CONFIG

    async def async_press(self) -> None:
        await self.send(True)
