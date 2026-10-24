"""Binary sensors: bypass active, filter change due, faults, communication with unit."""
from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorDeviceClass, BinarySensorEntity
from homeassistant.const import EntityCategory

from .entity import VscEntity
from .protocol import FAULTS


async def async_setup_entry(hass, entry, async_add_entities):
    coord = entry.runtime_data
    ents = [
        VscBinary(coord, "bypass_state", "Bypass active", None, None, "mdi:valve-open"),
        VscBinary(coord, "filter_change", "Filter change due", BinarySensorDeviceClass.PROBLEM, None, "mdi:air-filter"),
        VscComms(coord),
    ]
    # Heater fault, Cooler fault and Test routine required still need testing; disable the
    # heater/cooler entities if the unit has neither fitted.
    ents += [
        VscBinary(coord, key, name, BinarySensorDeviceClass.PROBLEM, EntityCategory.DIAGNOSTIC, None)
        for key, name, _byte, _bit in FAULTS
    ]
    async_add_entities(ents)


class VscBinary(VscEntity, BinarySensorEntity):
    def __init__(self, coord, key, name, dev_cla, cat, icon):
        super().__init__(coord, key, name, icon)
        self._attr_device_class = dev_cla
        self._attr_entity_category = cat

    @property
    def is_on(self):
        return self.unit_value


class VscComms(VscEntity, BinarySensorEntity):
    """Off when the VSC doesn't answer or reports no communications with the unit."""

    _attr_device_class = BinarySensorDeviceClass.CONNECTIVITY
    _attr_entity_category = EntityCategory.DIAGNOSTIC

    def __init__(self, coord):
        super().__init__(coord, "comms", "Communication with unit")

    @property
    def available(self):
        return True

    @property
    def is_on(self):
        return bool(self.coordinator.last_update_success and self.unit_value)
