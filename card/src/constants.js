// Shared names and defaults. The public API follows the implementation pack's
// contracts/config.example.yaml (schema_version 1).

export const VERSION = "0.3.0-alpha";
export const SCHEMA_VERSION = 1;
export const CARD_TYPE = "nuaire-mvhr-card";
export const ALIAS_TYPE = "mvhr-airflow-card";

export const METRIC_KEYS = [
  "outdoor_temperature", "exhaust_temperature", "supply_temperature", "extract_temperature",
  "extract_humidity", "indoor_temperature", "indoor_humidity", "recovery_efficiency",
  "supply_fan_percent", "extract_fan_percent", "speed_state", "coil_air_in", "coil_air_out",
  "coil_air_delta", "water_flow_temperature", "water_return_temperature", "buffer_temperature",
  "filter_runtime", "unit_runtime",
];

export const BINDING_KEYS = [
  ...METRIC_KEYS.filter((k) => !["filter_runtime", "unit_runtime"].includes(k)),
  "bypass_position", "bypass_mode", "bypass_threshold", "coil_status", "online", "fault",
  "filter_runtime", "unit_runtime", "night_state", "holiday_state",
];

// What each binding holds. kind drives parsing, units and the editor's entity filter.
export const BINDING_INFO = {
  outdoor_temperature: { kind: "temperature", label: "Outdoor intake", domains: ["sensor", "input_number", "number"] },
  exhaust_temperature: { kind: "temperature", label: "Exhaust", domains: ["sensor", "input_number", "number"] },
  supply_temperature: { kind: "temperature", label: "Supply", domains: ["sensor", "input_number", "number"] },
  extract_temperature: { kind: "temperature", label: "Extract", domains: ["sensor", "input_number", "number"] },
  extract_humidity: { kind: "percent", label: "Extract RH", domains: ["sensor", "input_number", "number"] },
  indoor_temperature: { kind: "temperature", label: "House", domains: ["sensor", "climate", "input_number", "number"] },
  indoor_humidity: { kind: "percent", label: "Humidity", domains: ["sensor", "climate", "input_number", "number"] },
  recovery_efficiency: { kind: "percent", label: "Heat recovery", domains: ["sensor", "input_number", "number"] },
  supply_fan_percent: { kind: "percent", label: "Supply", domains: ["sensor", "number", "input_number", "fan"] },
  extract_fan_percent: { kind: "percent", label: "Extract", domains: ["sensor", "number", "input_number", "fan"] },
  speed_state: { kind: "text", label: "Speed", domains: ["sensor", "select", "input_select", "fan"] },
  coil_air_in: { kind: "temperature", label: "Air in", domains: ["sensor", "input_number", "number"] },
  coil_air_out: { kind: "temperature", label: "Air out", domains: ["sensor", "input_number", "number"] },
  coil_air_delta: { kind: "delta", label: "Air ΔT", domains: ["sensor", "input_number", "number"] },
  water_flow_temperature: { kind: "temperature", label: "Water flow", domains: ["sensor", "input_number", "number"] },
  water_return_temperature: { kind: "temperature", label: "Water return", domains: ["sensor", "input_number", "number"] },
  buffer_temperature: { kind: "temperature", label: "Buffer", domains: ["sensor", "input_number", "number"] },
  bypass_position: { kind: "state", label: "Bypass position", domains: ["binary_sensor", "sensor", "cover", "valve"] },
  bypass_mode: { kind: "state", label: "Bypass mode", domains: ["select", "input_select", "sensor"] },
  bypass_threshold: { kind: "temperature", label: "Bypass above", domains: ["number", "input_number", "sensor"] },
  coil_status: { kind: "state", label: "Air conditioning status", domains: ["sensor", "binary_sensor", "climate", "select", "input_select"] },
  online: { kind: "state", label: "Online", domains: ["binary_sensor", "sensor"] },
  fault: { kind: "state", label: "Faults", domains: ["binary_sensor", "sensor"] },
  filter_runtime: { kind: "runtime", label: "Filter runtime", domains: ["sensor", "number", "input_number"] },
  unit_runtime: { kind: "runtime", label: "Unit runtime", domains: ["sensor", "number", "input_number"] },
  night_state: { kind: "state", label: "Night", domains: ["switch", "input_boolean", "binary_sensor"] },
  holiday_state: { kind: "state", label: "Holiday", domains: ["switch", "input_boolean", "binary_sensor"] },
};

export const CONTROL_KEYS = ["fan_speed", "bypass_mode", "bypass_threshold", "night", "holiday"];

// Labels the card shows. The adapter maps each label to the entity's real option.
export const CONTROL_INFO = {
  fan_speed: { type: "option", label: "Fan speed", labels: ["1", "2", "3"], kinds: ["select", "action"] },
  bypass_mode: { type: "option", label: "Bypass", labels: ["Auto", "On", "Off"], kinds: ["select", "action"] },
  bypass_threshold: { type: "number", label: "Bypass above", kinds: ["number", "action"] },
  night: { type: "boolean", label: "Night", kinds: ["switch", "action"] },
  holiday: { type: "boolean", label: "Holiday", kinds: ["switch", "action"] },
};

export const FEATURE_KEYS = [
  "aircon", "water_circuit", "bypass", "humidity", "health", "runtimes", "controls", "navigation",
];

// Metrics that belong to a feature group. Parent false overrides the metric switch.
export const METRIC_GROUP = {
  coil_air_in: "aircon", coil_air_out: "aircon", coil_air_delta: "aircon",
  water_flow_temperature: "water_circuit", water_return_temperature: "water_circuit",
  buffer_temperature: "aircon",
  extract_humidity: "humidity", indoor_humidity: "humidity",
  filter_runtime: "runtimes", unit_runtime: "runtimes",
};

export const APPEARANCE_KEYS = [
  "background", "equipment", "border", "text", "secondary_text", "intake", "exhaust", "supply",
  "extract", "bypass", "water_flow", "water_return", "healthy",
];

export const DEFAULT_APPEARANCE = {
  background: "#151B20", equipment: "#192127", border: "#AEBBC8", text: "#F1F5F9",
  secondary_text: "#ADBCC9", intake: "#16B9ED", exhaust: "#69B7EA", supply: "#F7B74C",
  extract: "#F87980", bypass: "#12C7EB", water_flow: "#27BED0", water_return: "#CB7BB4",
  healthy: "#35DA98",
};

export const ENUMS = {
  "layout.mode": ["auto", "wide", "compact", "mobile"],
  "layout.width_mode": ["comfortable", "fill"],
  "layout.density": ["comfortable", "compact"],
  "format.temperature_unit": ["auto", "°C", "°F"],
  "format.unavailable": ["em_dash", "hide"],
  "derived.coil_air_delta": ["disabled", "air_out_minus_air_in"],
  "derived.recovery_efficiency": ["disabled", "temperature_ratio"],
  "freshness.timestamp_policy": ["disabled", "last_updated", "last_reported"],
};

export const STATE_MAPPING_KEYS = {
  online: ["active_values", "inactive_values"],
  fault: ["active_values", "inactive_values"],
  bypass_position: ["open_values", "closed_values"],
  coil_status: ["idle_values", "heating_values", "cooling_values", "off_values"],
};

export const NAV_ICONS = ["forecast", "inverter", "attic", "security", "bms", "mvhr", "pump", "boiler", "car", "home", "chart", "fan", "flame", "bolt", "drop", "link"];

// Accepted input units per binding kind. "fraction" means 0..1 and is scaled to % only
// because it was chosen explicitly.
export const INPUT_UNITS = {
  temperature: ["°C", "°F", "K"],
  delta: ["°C", "°F", "K"],
  percent: ["%", "fraction"],
  runtime: ["h", "min", "s", "d"],
  text: [],
  state: [],
};

export const ADAPTER_KINDS = ["select", "number", "switch", "script"];
export const ADAPTER_DOMAINS = {
  select: ["select", "input_select"],
  number: ["number", "input_number"],
  switch: ["switch", "input_boolean"],
  script: [],
};
