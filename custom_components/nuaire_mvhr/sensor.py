"""Sensors: temperatures, humidity, running fan speed, run and filter hours."""
from __future__ import annotations

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorStateClass
from homeassistant.const import PERCENTAGE, EntityCategory, UnitOfTemperature, UnitOfTime

from .entity import VscEntity

# key, name, device class, state class, unit, category, icon
SENSORS = (
    ("humidity", "Humidity", SensorDeviceClass.HUMIDITY, SensorStateClass.MEASUREMENT, PERCENTAGE, None, None),
    ("temp_extract", "Extract air temperature", SensorDeviceClass.TEMPERATURE, SensorStateClass.MEASUREMENT,
     UnitOfTemperature.CELSIUS, None, None),
    ("temp_intake", "Intake air temperature", SensorDeviceClass.TEMPERATURE, SensorStateClass.MEASUREMENT,
     UnitOfTemperature.CELSIUS, None, None),
    ("fan_running", "Running fan speed", None, None, None, None, "mdi:fan-auto"),
    ("run_hours", "Run hours", SensorDeviceClass.DURATION, SensorStateClass.TOTAL_INCREASING, UnitOfTime.HOURS,
     EntityCategory.DIAGNOSTIC, "mdi:timer-outline"),
    ("filter_hours", "Filter hours", SensorDeviceClass.DURATION, SensorStateClass.TOTAL_INCREASING,
     UnitOfTime.HOURS, None, "mdi:air-filter"),
)


async def async_setup_entry(hass, entry, async_add_entities):
    coord = entry.runtime_data
    async_add_entities(VscSensor(coord, *s) for s in SENSORS)


class VscSensor(VscEntity, SensorEntity):
    def __init__(self, coord, key, name, dev_cla, stat_cla, unit, cat, icon):
        super().__init__(coord, key, name, icon)
        self._attr_device_class = dev_cla
        self._attr_state_class = stat_cla
        self._attr_native_unit_of_measurement = unit
        self._attr_entity_category = cat

    @property
    def native_value(self):
        return self.unit_value
