"""Base entity: one MRXBOX device per config entry."""
from __future__ import annotations

from homeassistant.helpers.device_registry import DeviceInfo
from homeassistant.helpers.update_coordinator import CoordinatorEntity

from .const import DOMAIN
from .coordinator import VscCoordinator


class VscEntity(CoordinatorEntity[VscCoordinator]):
    _attr_has_entity_name = True

    def __init__(self, coord: VscCoordinator, key: str, name: str, icon: str | None = None) -> None:
        super().__init__(coord)
        self.key = key
        self._attr_name = name
        self._attr_icon = icon
        entry_id = coord.config_entry.entry_id
        self._attr_unique_id = f"{entry_id}_{key}"
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, entry_id)},
            name="MRXBOX",
            manufacturer="Nuaire",
            model="MRXBOX VSC",
        )

    @property
    def unit_value(self):
        return (self.coordinator.data or {}).get(self.key)

    async def send(self, value) -> None:
        await self.coordinator.async_send(self.key, value)
