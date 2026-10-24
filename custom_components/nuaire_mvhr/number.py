"""Numbers: bypass setpoint, airflow per speed, screen timeout, humidity and frost setpoints."""
from __future__ import annotations

from homeassistant.components.number import NumberEntity, NumberMode
from homeassistant.const import PERCENTAGE, EntityCategory, UnitOfTemperature, UnitOfTime
from homeassistant.helpers.restore_state import RestoreEntity

from .entity import VscEntity
from .protocol import AIR_KEYS

# key, name, min, max, unit, category, icon
NUMBERS = [
    ("screen_timeout", "Screen timeout", 0, 120, UnitOfTime.MINUTES, EntityCategory.CONFIG, "mdi:monitor-off"),
    ("humidity_sp", "Humidity setpoint", 50, 85, PERCENTAGE, EntityCategory.CONFIG, "mdi:water-percent"),
    ("frost_sp", "Frost protection level", -5, 0, UnitOfTemperature.CELSIUS, EntityCategory.CONFIG,
     "mdi:snowflake-thermometer"),
] + [
    (key, f"{'Supply' if i < 3 else 'Extract'} speed {i % 3 + 1} airflow", 1, 100, PERCENTAGE,
     EntityCategory.CONFIG, "mdi:fan-chevron-down" if i < 3 else "mdi:fan-chevron-up")
    for i, key in enumerate(AIR_KEYS)
]


async def async_setup_entry(hass, entry, async_add_entities):
    coord = entry.runtime_data
    ents = [VscNumber(coord, *n) for n in NUMBERS]
    ents.append(VscBypassTemp(coord))
    async_add_entities(ents)


class VscNumber(VscEntity, NumberEntity):
    _attr_mode = NumberMode.BOX
    _attr_native_step = 1

    def __init__(self, coord, key, name, lo, hi, unit, cat, icon):
        super().__init__(coord, key, name, icon)
        self._attr_native_min_value = lo
        self._attr_native_max_value = hi
        self._attr_native_unit_of_measurement = unit
        self._attr_entity_category = cat

    @property
    def native_value(self):
        return self.unit_value

    async def async_set_native_value(self, value: float) -> None:
        await self.send(int(value))


class VscBypassTemp(VscNumber, RestoreEntity):
    """The unit can't report the bypass setpoint: show the last one sent, kept over restarts."""

    def __init__(self, coord):
        super().__init__(coord, "bypass_temp", "Bypass setpoint", 15, 30, UnitOfTemperature.CELSIUS, None,
                         "mdi:thermometer")

    async def async_added_to_hass(self) -> None:
        await super().async_added_to_hass()
        last = await self.async_get_last_state()
        if last is not None and self.coordinator.bypass_temp is None:
            try:
                self.coordinator.bypass_temp = int(float(last.state))
            except ValueError:
                pass

    @property
    def native_value(self):
        return self.coordinator.bypass_temp

    async def async_set_native_value(self, value: float) -> None:
        await self.send(int(value))
        self.async_write_ha_state()   # the poll answer doesn't carry it
