// Demo fixture: the pack's contracts/reference-state.json values behind made-up
// demo.* style entities. Used only when demo: true or by tests. Live mode never reads
// it, and the card never writes to these entities.

import { BINDING_KEYS } from "./constants.js";

export const REFERENCE = {
  outdoor_temperature: 13.0, exhaust_temperature: 15.9, supply_temperature: 21.9, extract_temperature: 22.0,
  extract_humidity: 46, indoor_temperature: 22.3, indoor_humidity: 46, recovery_efficiency: 98,
  supply_fan_percent: 18, extract_fan_percent: 18, speed_state: "1", bypass_position: "open",
  bypass_mode: "Auto", bypass_threshold: 24, coil_air_in: 21.9, coil_air_out: 21.8, coil_air_delta: -0.1,
  water_flow_temperature: 19.3, water_return_temperature: 21.1, buffer_temperature: 16.5,
  coil_status: "idle", online: true, fault: false, filter_runtime: 2957, unit_runtime: 29676,
  night_state: false, holiday_state: false,
};

const DOMAIN = {
  bypass_position: "binary_sensor", online: "binary_sensor", fault: "binary_sensor",
  bypass_mode: "select", speed_state: "select", bypass_threshold: "number",
  night_state: "switch", holiday_state: "switch",
};
const UNIT = {
  temperature: "°C", percent: "%", runtime: "h",
};
const KIND = {
  extract_humidity: "percent", indoor_humidity: "percent", recovery_efficiency: "percent",
  supply_fan_percent: "percent", extract_fan_percent: "percent", filter_runtime: "runtime", unit_runtime: "runtime",
};
const TEXTUAL = new Set(["speed_state", "bypass_position", "bypass_mode", "coil_status", "online", "fault", "night_state", "holiday_state"]);

export const demoEntity = (key) => `${DOMAIN[key] || "sensor"}.demo_mvhr_${key}`;

export function demoBindings() {
  const b = {};
  for (const k of BINDING_KEYS) b[k] = { entity: demoEntity(k), attribute: null, input_unit: null, precision: null, label: null };
  return b;
}

// A frozen hass-like object. connected is true; services reject so demo can't write.
export function demoHass(overrides = {}, base = REFERENCE) {
  const states = {};
  const ts = "2026-01-01T00:00:00+00:00";
  for (const k of BINDING_KEYS) {
    const v = k in overrides ? overrides[k] : base[k];
    const id = demoEntity(k);
    let state;
    if (typeof v === "boolean") state = v ? "on" : "off";
    else if (k === "bypass_position") state = v === "open" ? "on" : v === "closed" ? "off" : String(v);
    else state = v === null || v === undefined ? "unavailable" : String(v);
    const attrs = { friendly_name: `Demo ${k.replace(/_/g, " ")}` };
    if (!TEXTUAL.has(k)) attrs.unit_of_measurement = UNIT[KIND[k] || "temperature"];
    if (k === "speed_state") attrs.options = ["1", "2", "3"];
    if (k === "bypass_mode") attrs.options = ["Auto", "On", "Off"];
    if (k === "bypass_threshold") Object.assign(attrs, { min: 15, max: 30, step: 1 });
    states[id] = { entity_id: id, state, attributes: attrs, last_changed: ts, last_updated: ts, last_reported: ts };
  }
  return {
    states,
    connected: true,
    demo: true,
    config: { unit_system: { temperature: "°C" } },
    locale: { language: "en" },
    language: "en",
    user: { is_admin: false },
    callService: () => Promise.reject(new Error("Demo mode does not send commands.")),
  };
}
