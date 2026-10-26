// src/constants.js
var VERSION = "0.3.0-alpha";
var SCHEMA_VERSION = 1;
var CARD_TYPE = "nuaire-mvhr-card";
var ALIAS_TYPE = "mvhr-airflow-card";
var METRIC_KEYS = [
  "outdoor_temperature",
  "exhaust_temperature",
  "supply_temperature",
  "extract_temperature",
  "extract_humidity",
  "indoor_temperature",
  "indoor_humidity",
  "recovery_efficiency",
  "supply_fan_percent",
  "extract_fan_percent",
  "speed_state",
  "coil_air_in",
  "coil_air_out",
  "coil_air_delta",
  "water_flow_temperature",
  "water_return_temperature",
  "buffer_temperature",
  "filter_runtime",
  "unit_runtime"
];
var BINDING_KEYS = [
  ...METRIC_KEYS.filter((k) => !["filter_runtime", "unit_runtime"].includes(k)),
  "bypass_position",
  "bypass_mode",
  "bypass_threshold",
  "coil_status",
  "online",
  "fault",
  "filter_runtime",
  "unit_runtime",
  "night_state",
  "holiday_state"
];
var BINDING_INFO = {
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
  coil_air_delta: { kind: "delta", label: "Air \u0394T", domains: ["sensor", "input_number", "number"] },
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
  holiday_state: { kind: "state", label: "Holiday", domains: ["switch", "input_boolean", "binary_sensor"] }
};
var CONTROL_KEYS = ["fan_speed", "bypass_mode", "bypass_threshold", "night", "holiday"];
var CONTROL_INFO = {
  fan_speed: { type: "option", label: "Fan speed", labels: ["1", "2", "3"], kinds: ["select", "action"] },
  bypass_mode: { type: "option", label: "Bypass", labels: ["Auto", "On", "Off"], kinds: ["select", "action"] },
  bypass_threshold: { type: "number", label: "Bypass above", kinds: ["number", "action"] },
  night: { type: "boolean", label: "Night", kinds: ["switch", "action"] },
  holiday: { type: "boolean", label: "Holiday", kinds: ["switch", "action"] }
};
var FEATURE_KEYS = [
  "aircon",
  "water_circuit",
  "bypass",
  "humidity",
  "health",
  "runtimes",
  "controls",
  "navigation"
];
var APPEARANCE_KEYS = [
  "background",
  "equipment",
  "border",
  "text",
  "secondary_text",
  "intake",
  "exhaust",
  "supply",
  "extract",
  "bypass",
  "water_flow",
  "water_return",
  "healthy"
];
var DEFAULT_APPEARANCE = {
  background: "#151B20",
  equipment: "#192127",
  border: "#AEBBC8",
  text: "#F1F5F9",
  secondary_text: "#ADBCC9",
  intake: "#16B9ED",
  exhaust: "#69B7EA",
  supply: "#F7B74C",
  extract: "#F87980",
  bypass: "#12C7EB",
  water_flow: "#27BED0",
  water_return: "#CB7BB4",
  healthy: "#35DA98"
};
var ENUMS = {
  "layout.mode": ["auto", "wide", "compact", "mobile"],
  "layout.width_mode": ["comfortable", "fill"],
  "layout.density": ["comfortable", "compact"],
  "format.temperature_unit": ["auto", "\xB0C", "\xB0F"],
  "format.unavailable": ["em_dash", "hide"],
  "derived.coil_air_delta": ["disabled", "air_out_minus_air_in"],
  "derived.recovery_efficiency": ["disabled", "temperature_ratio"],
  "freshness.timestamp_policy": ["disabled", "last_updated", "last_reported"]
};
var STATE_MAPPING_KEYS = {
  online: ["active_values", "inactive_values"],
  fault: ["active_values", "inactive_values"],
  bypass_position: ["open_values", "closed_values"],
  coil_status: ["idle_values", "heating_values", "cooling_values", "off_values"]
};
var NAV_ICONS = ["forecast", "inverter", "attic", "security", "bms", "mvhr", "pump", "boiler", "car", "home", "chart", "fan", "flame", "bolt", "drop", "link"];
var INPUT_UNITS = {
  temperature: ["\xB0C", "\xB0F", "K"],
  delta: ["\xB0C", "\xB0F", "K"],
  percent: ["%", "fraction"],
  runtime: ["h", "min", "s", "d"],
  text: [],
  state: []
};
var ADAPTER_KINDS = ["select", "number", "switch", "script"];
var ADAPTER_DOMAINS = {
  select: ["select", "input_select"],
  number: ["number", "input_number"],
  switch: ["switch", "input_boolean"],
  script: []
};

// src/config.js
var ConfigError = class extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ConfigError";
    this.path = path;
  }
};
var isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var clone = (v) => v === void 0 ? void 0 : JSON.parse(JSON.stringify(v));
var ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
function defaultConfig() {
  return {
    type: `custom:${ALIAS_TYPE}`,
    schema_version: SCHEMA_VERSION,
    title: "MVHR & Air Conditioning",
    subtitle: "Live airflow & climate",
    demo: false,
    read_only: true,
    device: null,
    layout: {
      mode: "auto",
      width_mode: "comfortable",
      max_content_width: 2e3,
      compact_below: 1280,
      mobile_below: 768,
      text_scale: 1,
      density: "comfortable",
      motion: false
    },
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, k !== "navigation"])),
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, true])),
    bindings: Object.fromEntries(BINDING_KEYS.map((k) => [k, null])),
    controls: Object.fromEntries(CONTROL_KEYS.map((k) => [k, { visible: true, adapter: null }])),
    state_mapping: {
      online: { active_values: [], inactive_values: [] },
      fault: { active_values: [], inactive_values: [] },
      bypass_position: { open_values: [], closed_values: [] },
      coil_status: { idle_values: [], heating_values: [], cooling_values: [] }
    },
    format: {
      temperature_unit: "auto",
      temperature_precision: 1,
      percent_precision: 0,
      unavailable: "em_dash",
      locale: "auto"
    },
    derived: { coil_air_delta: "disabled", recovery_efficiency: "disabled" },
    freshness: { max_age_seconds: null, timestamp_policy: "disabled" },
    appearance: { ...DEFAULT_APPEARANCE },
    navigation: []
  };
}
function enumValue(path, value, fallback) {
  if (value === void 0 || value === null) return fallback;
  const allowed = ENUMS[path];
  if (!allowed.includes(value)) {
    throw new ConfigError(path, `unknown value '${value}'. Choose one of: ${allowed.join(", ")}.`);
  }
  return value;
}
function bool(path, value, fallback) {
  if (value === void 0 || value === null) return fallback;
  if (typeof value !== "boolean") throw new ConfigError(path, `must be true or false (got ${JSON.stringify(value)}).`);
  return value;
}
function num(path, value, fallback, min, max, { integer = false, nullable = false } = {}) {
  if (value === void 0 || value === null && !nullable) return fallback;
  if (value === null) return null;
  const n2 = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n2 !== "number" || !Number.isFinite(n2)) throw new ConfigError(path, `must be a number (got ${JSON.stringify(value)}).`);
  if (integer && !Number.isInteger(n2)) throw new ConfigError(path, `must be a whole number (got ${n2}).`);
  if (n2 < min || n2 > max) throw new ConfigError(path, `must be between ${min} and ${max} (got ${n2}).`);
  return n2;
}
function str(path, value, fallback, { nullable = false } = {}) {
  if (value === void 0) return fallback;
  if (value === null) return nullable ? null : fallback;
  if (typeof value !== "string") throw new ConfigError(path, `must be text (got ${JSON.stringify(value)}).`);
  return value;
}
function entity(path, value) {
  if (value === void 0 || value === null || value === "") return null;
  if (typeof value !== "string" || !ENTITY_RE.test(value)) {
    throw new ConfigError(path, `'${value}' is not an entity ID like sensor.example.`);
  }
  return value;
}
function stringList(path, value) {
  if (value === void 0 || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((v, i) => {
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    if (typeof v !== "string") throw new ConfigError(`${path}[${i}]`, "must be text.");
    return v;
  });
}
function section(path, value) {
  if (value === void 0 || value === null) return {};
  if (!isObj(value)) throw new ConfigError(path, "must be a mapping of settings.");
  return value;
}
function normalizeBinding(key, raw) {
  const path = `bindings.${key}`;
  if (raw === void 0 || raw === null || raw === "") return null;
  const b = typeof raw === "string" ? { entity: raw } : raw;
  if (!isObj(b)) throw new ConfigError(path, "must be an entity ID or {entity, attribute, input_unit, precision, label}.");
  const kind = BINDING_INFO[key].kind;
  const out = { ...clone(b) };
  out.entity = entity(`${path}.entity`, b.entity);
  out.attribute = str(`${path}.attribute`, b.attribute, null, { nullable: true }) || null;
  const units = INPUT_UNITS[kind] || [];
  if (b.input_unit === void 0 || b.input_unit === null || b.input_unit === "") out.input_unit = null;
  else if (!units.includes(b.input_unit)) {
    throw new ConfigError(`${path}.input_unit`, units.length ? `unknown unit '${b.input_unit}'. Choose one of: ${units.join(", ")}.` : "this reading has no unit; remove input_unit.");
  } else out.input_unit = b.input_unit;
  out.precision = num(`${path}.precision`, b.precision, null, 0, 4, { integer: true, nullable: true });
  out.label = str(`${path}.label`, b.label, null, { nullable: true }) || null;
  if (key === "fault") {
    out.extra_entities = (Array.isArray(b.extra_entities) ? b.extra_entities : []).map((e, i) => entity(`${path}.extra_entities[${i}]`, e)).filter(Boolean);
  }
  if (key === "supply_fan_percent" || key === "extract_fan_percent") {
    if (b.by_speed !== void 0 && b.by_speed !== null) {
      if (!isObj(b.by_speed)) throw new ConfigError(`${path}.by_speed`, 'must map a speed to an entity ID, e.g. {"1": number.supply_speed_1}.');
      const m = {};
      for (const [s, e] of Object.entries(b.by_speed)) {
        const id = entity(`${path}.by_speed.${s}`, e);
        if (id) m[s] = id;
      }
      out.by_speed = Object.keys(m).length ? m : null;
    } else out.by_speed = null;
  }
  if (!out.entity && !(out.extra_entities && out.extra_entities.length) && !out.by_speed) return null;
  return out;
}
function normalizeAdapter(key, raw) {
  const path = `controls.${key}.adapter`;
  if (raw === void 0 || raw === null) return null;
  if (!isObj(raw)) throw new ConfigError(path, "must be a mapping with kind and entity.");
  const out = { ...clone(raw) };
  const info = CONTROL_INFO[key];
  if (!ADAPTER_KINDS.includes(raw.kind)) {
    throw new ConfigError(`${path}.kind`, `unknown kind '${raw.kind}'. Choose one of: ${ADAPTER_KINDS.join(", ")}.`);
  }
  const allowedKinds = info.type === "option" ? ["select", "script"] : info.type === "number" ? ["number", "script"] : ["switch", "script"];
  if (!allowedKinds.includes(raw.kind)) {
    throw new ConfigError(`${path}.kind`, `'${raw.kind}' can't drive ${info.label}. Use ${allowedKinds.join(" or ")}.`);
  }
  out.entity = entity(`${path}.entity`, raw.entity);
  const domains = ADAPTER_DOMAINS[raw.kind];
  if (out.entity && domains.length && !domains.includes(out.entity.split(".")[0])) {
    throw new ConfigError(`${path}.entity`, `${raw.kind} needs a ${domains.join(" or ")} entity (got ${out.entity}).`);
  }
  if (info.type === "option") {
    const opts = section(`${path}.options`, raw.options);
    out.options = {};
    for (const [label, actual] of Object.entries(opts)) {
      if (!info.labels.includes(label)) {
        throw new ConfigError(`${path}.options`, `unknown button '${label}'. Buttons are: ${info.labels.join(", ")}.`);
      }
      if (actual === null || actual === void 0 || actual === "") continue;
      if (typeof actual !== "string" && typeof actual !== "number") throw new ConfigError(`${path}.options.${label}`, "must be text.");
      out.options[label] = String(actual);
    }
  }
  if (info.type === "boolean" && raw.kind === "script") {
    const opts = section(`${path}.options`, raw.options);
    out.options = { on: opts.on == null ? "on" : String(opts.on), off: opts.off == null ? "off" : String(opts.off) };
  }
  if (info.type === "number") {
    out.min = num(`${path}.min`, raw.min, null, -1e9, 1e9, { nullable: true });
    out.max = num(`${path}.max`, raw.max, null, -1e9, 1e9, { nullable: true });
    out.step = num(`${path}.step`, raw.step, null, 1e-3, 1e6, { nullable: true });
    out.debounce_ms = num(`${path}.debounce_ms`, raw.debounce_ms, 800, 0, 1e4, { integer: true });
    if (out.min !== null && out.max !== null && out.min > out.max) throw new ConfigError(`${path}.min`, "must not exceed max.");
  }
  const rb = raw.readback === void 0 || raw.readback === null ? {} : section(`${path}.readback`, raw.readback);
  out.readback = {
    ...rb,
    entity: entity(`${path}.readback.entity`, rb.entity),
    attribute: str(`${path}.readback.attribute`, rb.attribute, null, { nullable: true }) || null
  };
  out.timeout_ms = num(`${path}.timeout_ms`, raw.timeout_ms, 1e4, 1e3, 12e4, { integer: true });
  if (raw.kind === "script") {
    if (typeof raw.action !== "string" || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(raw.action)) {
      throw new ConfigError(`${path}.action`, `needs an action like script.turn_on (got ${JSON.stringify(raw.action)}).`);
    }
    out.action = raw.action;
    const data = raw.data === void 0 || raw.data === null ? {} : section(`${path}.data`, raw.data);
    for (const [k, v] of Object.entries(data)) {
      if (!["string", "number", "boolean"].includes(typeof v)) {
        throw new ConfigError(`${path}.data.${k}`, "must be text, a number or true/false. Use $value for the chosen value.");
      }
    }
    out.data = { ...data };
    if (!out.readback.entity) throw new ConfigError(`${path}.readback.entity`, "a script control needs a readback entity to confirm the change.");
  }
  return out;
}
function navPathProblem(path, external) {
  if (typeof path !== "string" || path.trim() === "") return "No destination set.";
  const p = path.trim();
  if (/^\s*(javascript|data|vbscript|file):/i.test(p)) return "Script and data links are not allowed.";
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) {
    if (!/^https?:\/\//i.test(p)) return "Only http:// or https:// external links are allowed.";
    if (!external) return "External link: tick 'External link' to allow it.";
    try {
      new URL(p);
    } catch {
      return "Not a valid web address.";
    }
    return null;
  }
  if (p.startsWith("//")) return "Protocol-relative links are not allowed.";
  if (!p.startsWith("/")) return "Dashboard paths start with / (for example /lovelace/mvhr).";
  if (/[\s<>"`]/.test(p)) return "The path contains spaces or unsafe characters.";
  return null;
}
function normalizeNav(raw) {
  if (raw === void 0 || raw === null) return [];
  if (!Array.isArray(raw)) throw new ConfigError("navigation", "must be a list of {label, icon, path, enabled}.");
  return raw.map((item, i) => {
    const path = `navigation[${i}]`;
    if (!isObj(item)) throw new ConfigError(path, "must be {label, icon, path, enabled}.");
    const icon = item.icon === void 0 || item.icon === null || item.icon === "" ? "link" : item.icon;
    if (!NAV_ICONS.includes(icon) && !/^mdi:[a-z0-9-]+$/.test(icon)) {
      throw new ConfigError(`${path}.icon`, `unknown icon '${icon}'. Choose one of: ${NAV_ICONS.join(", ")}.`);
    }
    return {
      ...clone(item),
      label: str(`${path}.label`, item.label, "") || "",
      icon,
      path: str(`${path}.path`, item.path, "") || "",
      enabled: bool(`${path}.enabled`, item.enabled, true),
      external: bool(`${path}.external`, item.external, false),
      current: bool(`${path}.current`, item.current, false)
    };
  });
}
var LEGACY_KEYS = [
  "device",
  "entities",
  "unit",
  "coil",
  "colors",
  "show_controls",
  "show_status",
  "show_coil",
  "fit_height",
  "invert_bypass",
  "bottom_offset",
  "speed_seconds",
  "target_step"
];
function isLegacyConfig(raw) {
  if (!isObj(raw) || raw.schema_version !== void 0) return false;
  return typeof raw.layout === "string" || LEGACY_KEYS.some((k) => k in raw && k !== "device") || typeof raw.device === "string" && raw.device !== "";
}
var LEGACY_ROLES = {
  fan_speed: ["select", "fan_speed"],
  running_speed: ["sensor", "running_fan_speed"],
  bypass_mode: ["select", "bypass"],
  bypass_active: ["binary_sensor", "bypass_active"],
  bypass_setpoint: ["number", "bypass_setpoint"],
  humidity: ["sensor", "humidity"],
  intake_temp: ["sensor", "intake_air_temperature"],
  extract_temp: ["sensor", "extract_air_temperature"],
  night: ["switch", "night_mode"],
  holiday: ["switch", "holiday_mode"],
  run_hours: ["sensor", "run_hours"],
  filter_hours: ["sensor", "filter_hours"],
  comms: ["binary_sensor", "communication_with_unit"]
};
var LEGACY_FAULTS = ["supply_fan_fault", "extract_fan_fault", "heater_fault", "cooler_fault", "frost_fault"];
function migrateLegacy(raw) {
  const unit = isObj(raw.unit) ? raw.unit : {};
  const ent = isObj(raw.entities) ? raw.entities : {};
  const coil = isObj(raw.coil) ? raw.coil : {};
  const colors = isObj(raw.colors) ? raw.colors : {};
  const role = (r) => unit[r] || `${LEGACY_ROLES[r][0]}.mrxbox_${LEGACY_ROLES[r][1]}`;
  const b = (e, extra = {}) => e ? { entity: e, attribute: null, input_unit: null, precision: null, label: null, ...extra } : null;
  const out = {};
  const known = /* @__PURE__ */ new Set([...LEGACY_KEYS, "layout", "type", "title"]);
  for (const [k, v] of Object.entries(raw)) if (!known.has(k)) out[k] = clone(v);
  out.type = raw.type || `custom:${CARD_TYPE}`;
  out.schema_version = SCHEMA_VERSION;
  if (typeof raw.title === "string") out.title = raw.title;
  if (typeof raw.device === "string" && raw.device) out.device = raw.device;
  out.read_only = true;
  out.layout = { mode: { landscape: "wide", portrait: "mobile" }[raw.layout] || "auto" };
  out.features = {
    aircon: raw.show_coil === void 0 ? !!(coil.air_in || coil.air_out || coil.climate || coil.state) : !!raw.show_coil,
    controls: raw.show_controls !== false,
    health: raw.show_status !== false
  };
  out.features.water_circuit = out.features.aircon;
  const climateStatus = coil.state ? b(coil.state) : coil.climate ? b(coil.climate, { attribute: "hvac_action" }) : null;
  out.bindings = {
    outdoor_temperature: b(role("intake_temp")),
    extract_temperature: b(role("extract_temp")),
    extract_humidity: b(role("humidity")),
    exhaust_temperature: b(ent.exhaust_temp),
    supply_temperature: b(ent.supply_temp),
    recovery_efficiency: b(ent.efficiency),
    indoor_temperature: b(ent.house_temp),
    indoor_humidity: b(ent.house_humidity),
    speed_state: b(role("fan_speed")),
    bypass_position: b(role("bypass_active")),
    bypass_mode: b(role("bypass_mode")),
    bypass_threshold: b(role("bypass_setpoint")),
    coil_air_in: b(coil.air_in),
    coil_air_out: b(coil.air_out),
    water_flow_temperature: b(coil.water_flow_temp),
    water_return_temperature: b(coil.water_return_temp),
    buffer_temperature: b(coil.water_buffer),
    coil_status: climateStatus,
    online: b(role("comms")),
    fault: {
      entity: `binary_sensor.mrxbox_${LEGACY_FAULTS[0]}`,
      attribute: null,
      input_unit: null,
      precision: null,
      label: null,
      extra_entities: LEGACY_FAULTS.slice(1).map((f) => unit[`fault_${f.replace(/_fault$/, "")}`] || `binary_sensor.mrxbox_${f}`)
    },
    filter_runtime: b(role("filter_hours"), { input_unit: "h" }),
    unit_runtime: b(role("run_hours"), { input_unit: "h" }),
    night_state: b(role("night")),
    holiday_state: b(role("holiday"))
  };
  if (unit.fault_supply_fan) out.bindings.fault.entity = unit.fault_supply_fan;
  const open = raw.invert_bypass ? ["off"] : ["on"];
  const closed = raw.invert_bypass ? ["on"] : ["off"];
  out.state_mapping = {
    online: { active_values: ["on"], inactive_values: ["off"] },
    fault: { active_values: ["on"], inactive_values: ["off"] },
    bypass_position: { open_values: open, closed_values: closed },
    coil_status: coil.climate && !coil.state ? { idle_values: ["idle"], heating_values: ["heating", "preheating"], cooling_values: ["cooling"], off_values: ["off"] } : { idle_values: [], heating_values: [], cooling_values: [] }
  };
  const sel = (e, labels) => ({
    kind: "select",
    entity: e,
    options: Object.fromEntries(labels.map((l) => [l, l])),
    readback: { entity: null, attribute: null },
    timeout_ms: 1e4
  });
  out.controls = {
    fan_speed: { visible: true, adapter: sel(role("fan_speed"), ["1", "2", "3"]) },
    bypass_mode: { visible: true, adapter: sel(role("bypass_mode"), ["Auto", "On", "Off"]) },
    bypass_threshold: { visible: true, adapter: {
      kind: "number",
      entity: role("bypass_setpoint"),
      readback: { entity: null, attribute: null },
      timeout_ms: 1e4
    } },
    night: { visible: true, adapter: { kind: "switch", entity: role("night"), readback: { entity: null, attribute: null }, timeout_ms: 1e4 } },
    holiday: { visible: true, adapter: { kind: "switch", entity: role("holiday"), readback: { entity: null, attribute: null }, timeout_ms: 1e4 } }
  };
  out.appearance = {};
  for (const k of ["intake", "supply", "extract", "exhaust"]) if (typeof colors[k] === "string" && colors[k]) out.appearance[k] = colors[k];
  out.migrated_from = "0.2";
  return out;
}
function normalizeConfig(input) {
  if (input === void 0 || input === null) input = {};
  if (!isObj(input)) throw new ConfigError("config", "must be a mapping of settings.");
  let raw = clone(input);
  if (isLegacyConfig(raw)) raw = migrateLegacy(raw);
  const sv = raw.schema_version === void 0 ? SCHEMA_VERSION : raw.schema_version;
  if (sv !== SCHEMA_VERSION) {
    throw new ConfigError("schema_version", `version ${sv} is not supported by this card (expects ${SCHEMA_VERSION}). Update the card.`);
  }
  const d = defaultConfig();
  const out = { ...raw };
  out.type = typeof raw.type === "string" ? raw.type : d.type;
  out.schema_version = SCHEMA_VERSION;
  out.title = str("title", raw.title, d.title);
  out.subtitle = str("subtitle", raw.subtitle, d.subtitle);
  out.demo = bool("demo", raw.demo, false);
  out.read_only = bool("read_only", raw.read_only, true);
  out.device = str("device", raw.device, null, { nullable: true }) || null;
  const L = section("layout", raw.layout);
  out.layout = {
    ...L,
    mode: enumValue("layout.mode", L.mode, d.layout.mode),
    width_mode: enumValue("layout.width_mode", L.width_mode, d.layout.width_mode),
    max_content_width: num("layout.max_content_width", L.max_content_width, 2e3, 960, 4e3, { integer: true }),
    compact_below: num("layout.compact_below", L.compact_below, 1280, 960, 1920, { integer: true }),
    mobile_below: num("layout.mobile_below", L.mobile_below, 768, 480, 1200, { integer: true }),
    text_scale: num("layout.text_scale", L.text_scale, 1, 0.9, 1.6),
    density: enumValue("layout.density", L.density, d.layout.density),
    // Extension: "always" animates even when the system asks for reduced motion.
    motion: L.motion === "always" ? "always" : bool("layout.motion", L.motion, false)
  };
  if (out.layout.mobile_below >= out.layout.compact_below) {
    throw new ConfigError("layout.mobile_below", `must be smaller than compact_below (${out.layout.compact_below}).`);
  }
  const F = section("features", raw.features);
  out.features = { ...F };
  for (const k of FEATURE_KEYS) out.features[k] = bool(`features.${k}`, F[k], d.features[k]);
  const M = section("metrics", raw.metrics);
  out.metrics = { ...M };
  for (const k of METRIC_KEYS) out.metrics[k] = bool(`metrics.${k}`, M[k], true);
  const B = section("bindings", raw.bindings);
  out.bindings = { ...B };
  for (const k of BINDING_KEYS) out.bindings[k] = normalizeBinding(k, B[k]);
  const C = section("controls", raw.controls);
  out.controls = { ...C };
  for (const k of CONTROL_KEYS) {
    const c = section(`controls.${k}`, C[k]);
    out.controls[k] = { ...c, visible: bool(`controls.${k}.visible`, c.visible, true), adapter: normalizeAdapter(k, c.adapter) };
  }
  const S = section("state_mapping", raw.state_mapping);
  out.state_mapping = { ...S };
  for (const [k, lists] of Object.entries(STATE_MAPPING_KEYS)) {
    const m = section(`state_mapping.${k}`, S[k]);
    out.state_mapping[k] = { ...m };
    for (const l of lists) {
      if (l === "off_values" && m[l] === void 0) continue;
      out.state_mapping[k][l] = stringList(`state_mapping.${k}.${l}`, m[l]);
    }
  }
  const Fm = section("format", raw.format);
  out.format = {
    ...Fm,
    temperature_unit: enumValue("format.temperature_unit", Fm.temperature_unit, "auto"),
    temperature_precision: num("format.temperature_precision", Fm.temperature_precision, 1, 0, 3, { integer: true }),
    percent_precision: num("format.percent_precision", Fm.percent_precision, 0, 0, 2, { integer: true }),
    unavailable: enumValue("format.unavailable", Fm.unavailable, "em_dash"),
    locale: str("format.locale", Fm.locale, "auto") || "auto"
  };
  if (out.format.locale !== "auto") {
    try {
      new Intl.NumberFormat(out.format.locale);
    } catch {
      throw new ConfigError("format.locale", `'${out.format.locale}' is not a language tag like en-GB. Use auto to follow Home Assistant.`);
    }
  }
  const D = section("derived", raw.derived);
  out.derived = {
    ...D,
    coil_air_delta: enumValue("derived.coil_air_delta", D.coil_air_delta, "disabled"),
    recovery_efficiency: enumValue("derived.recovery_efficiency", D.recovery_efficiency, "disabled")
  };
  const Fr = section("freshness", raw.freshness);
  out.freshness = {
    ...Fr,
    max_age_seconds: num("freshness.max_age_seconds", Fr.max_age_seconds, null, 10, 604800, { integer: true, nullable: true }),
    timestamp_policy: enumValue("freshness.timestamp_policy", Fr.timestamp_policy, "disabled")
  };
  const A = section("appearance", raw.appearance);
  out.appearance = { ...A };
  for (const k of APPEARANCE_KEYS) {
    const v = A[k];
    if (v === void 0 || v === null || v === "") {
      out.appearance[k] = DEFAULT_APPEARANCE[k];
      continue;
    }
    if (typeof v !== "string" || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
      throw new ConfigError(`appearance.${k}`, `'${v}' is not a colour like #16B9ED.`);
    }
    out.appearance[k] = v.toUpperCase();
  }
  out.navigation = normalizeNav(raw.navigation);
  return out;
}
function effectiveFeatures(cfg) {
  const f = { ...cfg.features };
  f.water_circuit = f.aircon && f.water_circuit;
  f.navigation = f.navigation && cfg.navigation.some((n2) => n2.enabled);
  return f;
}
function metricVisible(cfg, key) {
  const f = effectiveFeatures(cfg);
  if (!cfg.metrics[key]) return false;
  if (["coil_air_in", "coil_air_out", "coil_air_delta", "buffer_temperature"].includes(key)) return f.aircon;
  if (["water_flow_temperature", "water_return_temperature"].includes(key)) return f.water_circuit;
  if (["extract_humidity", "indoor_humidity"].includes(key)) return f.humidity;
  if (["filter_runtime", "unit_runtime"].includes(key)) return f.runtimes;
  return true;
}
function controlVisible(cfg, key) {
  const f = effectiveFeatures(cfg);
  if (!f.controls || !cfg.controls[key].visible) return false;
  if ((key === "bypass_mode" || key === "bypass_threshold") && !f.bypass) return false;
  return true;
}
function isUnconfigured(cfg) {
  return !cfg.demo && BINDING_KEYS.every((k) => !cfg.bindings[k]);
}

// src/state.js
var BAD_STATES = /* @__PURE__ */ new Set(["unknown", "unavailable"]);
function toCelsius(v, unit) {
  if (unit === "\xB0F" || unit === "F") return (v - 32) * 5 / 9;
  if (unit === "K") return v - 273.15;
  return v;
}
function fromCelsius(v, unit) {
  return unit === "\xB0F" ? v * 9 / 5 + 32 : v;
}
function deltaToCelsius(v, unit) {
  if (unit === "\xB0F" || unit === "F") return v * 5 / 9;
  return v;
}
function deltaFromCelsius(v, unit) {
  return unit === "\xB0F" ? v * 9 / 5 : v;
}
var RUNTIME_TO_H = { h: 1, min: 1 / 60, s: 1 / 3600, d: 24 };
function parseNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "" || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n2 = Number(t);
  return Number.isFinite(n2) ? n2 : null;
}
function readBinding(hass, cfg, key, now = Date.now()) {
  let b = cfg.bindings[key];
  const kind = BINDING_INFO[key].kind;
  if (b && b.by_speed) {
    const sp = key === "speed_state" ? null : readBinding(hass, cfg, "speed_state", now);
    const e = sp && sp.status === "ok" ? b.by_speed[sp.value] : null;
    if (e) b = { ...b, entity: e };
  }
  if (!b || !b.entity) return { status: "unbound", reason: "Not set up" };
  const so = hass && hass.states ? hass.states[b.entity] : void 0;
  if (!so) return { status: "missing", entity: b.entity, reason: `${b.entity} not found` };
  let raw;
  if (b.attribute) {
    if (!so.attributes || !(b.attribute in so.attributes)) {
      return { status: "missing", entity: b.entity, reason: `${b.entity} has no attribute ${b.attribute}` };
    }
    raw = so.attributes[b.attribute];
    if (raw === null || raw === void 0 || raw === "") return { status: "unknown", entity: b.entity, reason: "Empty attribute" };
  } else {
    raw = so.state;
    if (BAD_STATES.has(raw)) return { status: raw, entity: b.entity, reason: raw === "unknown" ? "Unknown" : "Unavailable" };
  }
  const out = { status: "ok", raw, entity: b.entity, stale: isStale(so, cfg, now) };
  const metaUnit = b.attribute ? null : so.attributes && so.attributes.unit_of_measurement || null;
  const unit = b.input_unit || metaUnit;
  if (kind === "state" || kind === "text") {
    out.value = typeof raw === "boolean" ? raw ? "on" : "off" : String(raw);
    return out;
  }
  const n2 = parseNumber(raw);
  if (n2 === null) return { status: "invalid", entity: b.entity, raw, reason: `Not a number: ${String(raw).slice(0, 24)}` };
  if (kind === "temperature") out.value = toCelsius(n2, unit);
  else if (kind === "delta") out.value = deltaToCelsius(n2, unit);
  else if (kind === "percent") out.value = unit === "fraction" ? n2 * 100 : n2;
  else if (kind === "runtime") out.value = n2 * (RUNTIME_TO_H[unit] ?? 1);
  else out.value = n2;
  out.unit = unit;
  return out;
}
function isStale(so, cfg, now) {
  const { timestamp_policy: policy, max_age_seconds: max } = cfg.freshness;
  if (policy === "disabled" || !max) return false;
  const ts = so[policy] || so.last_updated;
  const t = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t)) return false;
  return now - t > max * 1e3;
}
var lc = (s) => String(s).trim().toLowerCase();
var inList = (list, v) => list.some((x) => lc(x) === lc(v));
var domainOf = (r) => r.entity ? r.entity.split(".")[0] : "";
function mapActive(r, mapping, onWord = "on", offWord = "off") {
  if (r.status !== "ok") return "unknown";
  const active = mapping.active_values || mapping.open_values || [];
  const inactive = mapping.inactive_values || mapping.closed_values || [];
  if (active.length || inactive.length) {
    if (inList(active, r.value)) return "active";
    if (inList(inactive, r.value)) return "inactive";
    return "unknown";
  }
  const d = domainOf(r);
  if (["binary_sensor", "switch", "input_boolean"].includes(d)) {
    if (lc(r.value) === onWord) return "active";
    if (lc(r.value) === offWord) return "inactive";
  }
  return "unknown";
}
function readHealth(hass, cfg) {
  const online = readBinding(hass, cfg, "online");
  const onlineState = online.status === "unbound" ? "unbound" : mapActive(online, cfg.state_mapping.online);
  const fb = cfg.bindings.fault;
  let fault = "unbound";
  const faultEntities = [];
  if (fb) {
    const ids = [fb.entity, ...fb.extra_entities || []].filter(Boolean);
    const states = ids.map((id) => {
      const one = { ...cfg, bindings: { ...cfg.bindings, fault: { ...fb, entity: id } } };
      const r = readBinding(hass, one, "fault");
      const s = mapActive(r, cfg.state_mapping.fault);
      if (s === "active") faultEntities.push(id);
      return s;
    });
    fault = states.includes("active") ? "active" : states.length && states.every((s) => s === "inactive") ? "inactive" : "unknown";
  }
  return {
    connected: !hass || hass.connected !== false,
    online: onlineState === "active" ? "online" : onlineState === "inactive" ? "offline" : onlineState === "unbound" ? "unbound" : "unknown",
    fault: fault === "active" ? "fault" : fault === "inactive" ? "ok" : fault,
    faultEntities
  };
}
function readBypassPosition(hass, cfg) {
  const r = readBinding(hass, cfg, "bypass_position");
  if (r.status === "unbound") return { state: "unbound", r };
  if (r.status !== "ok") return { state: "unknown", r };
  const m = cfg.state_mapping.bypass_position;
  if (m.open_values.length || m.closed_values.length) {
    if (inList(m.open_values, r.value)) return { state: "open", r };
    if (inList(m.closed_values, r.value)) return { state: "closed", r };
    return { state: "unknown", r };
  }
  const d = domainOf(r);
  const v = lc(r.value);
  if (d === "binary_sensor") return { state: v === "on" ? "open" : v === "off" ? "closed" : "unknown", r };
  if (d === "cover" || d === "valve") return { state: v === "open" ? "open" : v === "closed" ? "closed" : "unknown", r };
  return { state: "unknown", r };
}
function readCoilStatus(hass, cfg) {
  const r = readBinding(hass, cfg, "coil_status");
  if (r.status === "unbound") return { state: "unbound", r };
  if (r.status !== "ok") return { state: "unknown", r };
  const m = cfg.state_mapping.coil_status;
  const lists = [["idle", m.idle_values], ["heating", m.heating_values], ["cooling", m.cooling_values], ["off", m.off_values || []]];
  if (lists.some(([, l]) => l.length)) {
    for (const [s, l] of lists) if (inList(l, r.value)) return { state: s, r };
    return { state: "unknown", r };
  }
  const v = lc(r.value);
  return { state: ["idle", "heating", "cooling", "off"].includes(v) ? v : "unknown", r };
}
function optionLabel(cfg, controlKey, raw) {
  if (raw === void 0 || raw === null) return null;
  const labels = CONTROL_INFO[controlKey].labels;
  const ad = cfg.controls[controlKey].adapter;
  if (ad && ad.options) {
    for (const [label, actual] of Object.entries(ad.options)) if (lc(actual) === lc(raw)) return label;
  }
  const direct = labels.find((l) => lc(l) === lc(raw));
  return direct || null;
}
function readToggle(hass, cfg, key) {
  const r = readBinding(hass, cfg, key);
  if (r.status !== "ok") return { state: r.status === "unbound" ? "unbound" : "unknown", r };
  const v = lc(r.value);
  return { state: v === "on" ? "on" : v === "off" ? "off" : "unknown", r };
}
function deriveDelta(cfg, readings) {
  const own = readings.coil_air_delta;
  if (own.status !== "unbound") return { ...own, source: "sensor" };
  if (cfg.derived.coil_air_delta !== "air_out_minus_air_in") return own;
  const a = readings.coil_air_in;
  const b = readings.coil_air_out;
  if (a.status !== "ok" || b.status !== "ok") return { status: "unavailable", reason: "Air in/out needed", source: "derived" };
  return { status: "ok", value: b.value - a.value, source: "derived", stale: a.stale || b.stale };
}
function deriveEfficiency(cfg, readings, bypassState) {
  const own = readings.recovery_efficiency;
  if (own.status !== "unbound") return { ...own, source: "reported", flagged: own.status === "ok" && (own.value < 0 || own.value > 100) };
  if (cfg.derived.recovery_efficiency !== "temperature_ratio") return own;
  const o = readings.outdoor_temperature;
  const s = readings.supply_temperature;
  const e = readings.extract_temperature;
  if ([o, s, e].some((r) => r.status !== "ok")) return { status: "unavailable", reason: "Outdoor, supply and extract needed", source: "calculated" };
  if (bypassState === "open") return { status: "unavailable", reason: "Not applicable while bypass is open", source: "calculated" };
  const den = e.value - o.value;
  if (Math.abs(den) < 1) return { status: "unavailable", reason: "Indoor/outdoor difference too small", source: "calculated" };
  const v = (s.value - o.value) / den * 100;
  return { status: "ok", value: v, source: "calculated", flagged: v < 0 || v > 100 };
}
function displayTempUnit(cfg, hass) {
  if (cfg.format.temperature_unit !== "auto") return cfg.format.temperature_unit;
  const u = hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature;
  return u === "\xB0F" ? "\xB0F" : "\xB0C";
}
function localeOf(cfg, hass) {
  if (cfg.format.locale !== "auto") return cfg.format.locale;
  return hass && (hass.locale && hass.locale.language || hass.language) || "en";
}
var nfCache = /* @__PURE__ */ new Map();
function nf(locale, digits, grouping) {
  const k = `${locale}|${digits}|${grouping}`;
  if (!nfCache.has(k)) {
    let f;
    try {
      f = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping });
    } catch {
      f = new Intl.NumberFormat("en", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping });
    }
    nfCache.set(k, f);
  }
  return nfCache.get(k);
}
var EM_DASH = "\u2014";
function formatReading(cfg, hass, key, r) {
  if (!r || r.status !== "ok") return cfg.format.unavailable === "hide" ? null : EM_DASH;
  const kind = BINDING_INFO[key].kind;
  const b = cfg.bindings[key];
  const loc = localeOf(cfg, hass);
  if (kind === "temperature" || kind === "delta") {
    const unit = displayTempUnit(cfg, hass);
    const v = kind === "delta" ? deltaFromCelsius(r.value, unit) : fromCelsius(r.value, unit);
    const p = b && b.precision !== null ? b.precision : cfg.format.temperature_precision;
    const txt = nf(loc, p, false).format(v).replace(/^-/, "\u2212");
    return `${kind === "delta" && v > 0 ? "+" : ""}${txt}${unit}`;
  }
  if (kind === "percent") {
    const p = b && b.precision !== null ? b.precision : cfg.format.percent_precision;
    return `${nf(loc, p, false).format(r.value).replace(/^-/, "\u2212")}%`;
  }
  if (kind === "runtime") {
    const p = b && b.precision !== null ? b.precision : 0;
    return `${nf(loc, p, true).format(r.value)} h`;
  }
  return String(r.value);
}
function buildModel(hass, cfg, now = Date.now()) {
  const readings = {};
  for (const k of BINDING_KEYS) readings[k] = readBinding(hass, cfg, k, now);
  const bypass = readBypassPosition(hass, cfg);
  readings.coil_air_delta = deriveDelta(cfg, readings);
  readings.recovery_efficiency = deriveEfficiency(cfg, readings, bypass.state);
  const text = {};
  for (const k of BINDING_KEYS) text[k] = formatReading(cfg, hass, k, readings[k]);
  const speedRaw = readings.speed_state.status === "ok" ? readings.speed_state.value : null;
  const modeRaw = readings.bypass_mode.status === "ok" ? readings.bypass_mode.value : null;
  const feats = effectiveFeatures(cfg);
  return {
    features: feats,
    readings,
    text,
    health: readHealth(hass, cfg),
    bypass: bypass.state,
    bypassMode: optionLabel(cfg, "bypass_mode", modeRaw) || (modeRaw ? String(modeRaw) : null),
    coil: readCoilStatus(hass, cfg).state,
    speed: optionLabel(cfg, "fan_speed", speedRaw),
    speedRaw,
    night: readToggle(hass, cfg, "night_state").state,
    holiday: readToggle(hass, cfg, "holiday_state").state,
    stale: BINDING_KEYS.some((k) => readings[k].stale && (!(k in cfg.metrics) || metricVisible(cfg, k)))
  };
}
function watchedEntities(cfg) {
  const s = /* @__PURE__ */ new Set();
  for (const k of BINDING_KEYS) {
    const b = cfg.bindings[k];
    if (b && b.entity) s.add(b.entity);
    if (b && b.extra_entities) b.extra_entities.forEach((e) => s.add(e));
    if (b && b.by_speed) Object.values(b.by_speed).forEach((e) => s.add(e));
  }
  for (const c of Object.values(cfg.controls)) {
    const a = c.adapter;
    if (!a) continue;
    if (a.entity) s.add(a.entity);
    if (a.readback && a.readback.entity) s.add(a.readback.entity);
  }
  return [...s];
}

// src/layout.js
var COLLAR = { out: 10, len: 24, thick: 12 };
var CLEAR = 12;
var INSET = 8;
function heuristicMeasure(text, size, weight = 400) {
  return Math.ceil(String(text).length * size * (weight >= 600 ? 0.62 : 0.58));
}
var lineH = (size) => Math.ceil(size * 1.25);
var TARGET = 44;
var WIDE = {
  name: "wide",
  margin: 16,
  pad: 16,
  fanR: 28,
  fanDx: 104,
  diamond: 40,
  mvhrMin: 340,
  coilCols: 2,
  coilMin: 300,
  serpW: 220,
  serpH: 56,
  iconMax: 64,
  iconGap: 16,
  tee: 30,
  minSeg: 72,
  houseMin: 136,
  bridgeGap: 26,
  fs: { title: 22, body: 17, sec: 15, temp: 28, eff: 40, value: 17 }
};
var WIDE_TIGHT = { ...WIDE, mvhrMin: 320, coilMin: 260, tee: 28, minSeg: 56 };
var COMPACT = {
  ...WIDE,
  name: "compact",
  twoRow: true,
  margin: 12,
  pad: 14,
  fanR: 26,
  fanDx: 88,
  diamond: 32,
  mvhrMin: 280,
  coilCols: 2,
  coilMin: 200,
  serpW: 170,
  serpH: 48,
  iconMax: 48,
  iconGap: 12,
  tee: 28,
  minSeg: 60,
  houseMin: 120,
  bridgeGap: 26,
  fs: { title: 20, body: 16, sec: 14, temp: 26, eff: 36, value: 16 }
};
var MOBILE = {
  name: "mobile",
  pad: 12,
  fanR: 24,
  diamond: 22,
  serpW: 150,
  serpH: 44,
  tee: 30,
  railL: 14,
  railInset: 14,
  fs: { title: 18, body: 16, sec: 14, temp: 24, eff: 32, value: 16 }
};
function scaled(P, s) {
  const fs = {};
  for (const [k, v] of Object.entries(P.fs)) fs[k] = Math.round(Math.max(k === "sec" ? 14 : 16, v * s) * 10) / 10;
  fs.sec = Math.max(14, Math.round(P.fs.sec * s * 10) / 10);
  return { ...P, fs };
}
function tempTemplate(cfg, unit) {
  const p = cfg.format.temperature_precision;
  return `\u221288${p ? "." + "8".repeat(p) : ""}${unit}`;
}
function makeLabel(ctx, id, owner, lines, opts = {}) {
  const padX = opts.padX ?? 0;
  let w = 0;
  let h = 0;
  const out = lines.map((ln) => {
    const tw = Math.max(ctx.measure(ln.text, ln.size, ln.weight || 400), ln.reserve ? ctx.measure(ln.reserve, ln.size, ln.weight || 400) : 0);
    const boxed = !!ln.boxed;
    const lw = Math.max(tw + (boxed ? 28 : 0) + 4, ln.metric ? TARGET : 0);
    const lh = Math.max(lineH(ln.size) + (boxed ? 8 : 0), ln.metric ? TARGET : 0);
    w = Math.max(w, lw);
    h += lh + (ln.gapAfter || 0);
    return { ...ln, w: lw, h: lh };
  });
  return {
    id,
    owner,
    kind: opts.kind || "stack",
    align: opts.align || "center",
    lines: out,
    w: Math.ceil(w + padX * 2),
    h: Math.ceil(h),
    touches: opts.touches || [],
    metrics: opts.metrics || []
  };
}
function rowLabel(ctx, id, owner, name, value, P, metric) {
  const nw = ctx.measure(name, P.fs.sec, 400);
  const vw = Math.max(ctx.measure(value, P.fs.value, 600), ctx.measure(ctx.reserveTemp, P.fs.value, 600));
  return {
    id,
    owner,
    kind: "row",
    align: "left",
    name,
    value,
    nameSize: P.fs.sec,
    valueSize: P.fs.value,
    nameW: nw,
    valueW: vw,
    w: Math.ceil(nw + 16 + vw + 4),
    h: Math.max(lineH(P.fs.value) + 6, TARGET),
    touches: [],
    metrics: [metric]
  };
}
var waterPitch = (B) => Math.max(40, Math.max(B.flowLbl.h, B.returnLbl.h) + 6);
var place = (l, x, y) => Object.assign(l, { x: Math.round(x), y: Math.round(y) });
function blocks(cfg, ctx, P, mode) {
  const f = effectiveFeatures(cfg);
  const t = ctx.texts;
  const show = (k) => metricVisible(cfg, k) && t[k] !== null && t[k] !== void 0;
  const lab = (k, d) => cfg.bindings[k] && cfg.bindings[k].label || d;
  const B = { f, show };
  if (show("outdoor_temperature")) {
    B.intakeCap = makeLabel(ctx, "intake", "outside", [
      { text: t.outdoor_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 600, boxed: true, color: "intake", metric: "outdoor_temperature" },
      { text: lab("outdoor_temperature", "Outdoor intake"), size: P.fs.sec, color: "secondary" }
    ], { metrics: ["outdoor_temperature"] });
  }
  if (show("exhaust_temperature")) {
    B.exhaustCap = makeLabel(ctx, "exhaust", "outside", [
      { text: t.exhaust_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 600, boxed: true, color: "exhaust", metric: "exhaust_temperature" },
      { text: lab("exhaust_temperature", "Exhaust"), size: P.fs.sec, color: "secondary" }
    ], { metrics: ["exhaust_temperature"] });
  }
  B.mvhrTitle = makeLabel(ctx, "mvhr-title", "mvhr", [{ text: "MVHR", size: P.fs.title, weight: 700 }]);
  const fanLines = (name, key, color) => {
    const ls = [{ text: lab(key, name), size: P.fs.sec, color: "secondary" }];
    if (show(key)) ls.push({ text: t[key], reserve: "100%", size: P.fs.body, weight: 600, metric: key });
    return ls;
  };
  B.supplyFan = makeLabel(ctx, "fan-supply", "mvhr", fanLines("Supply", "supply_fan_percent"), { metrics: show("supply_fan_percent") ? ["supply_fan_percent"] : [] });
  B.extractFan = makeLabel(ctx, "fan-extract", "mvhr", fanLines("Extract", "extract_fan_percent"), { metrics: show("extract_fan_percent") ? ["extract_fan_percent"] : [] });
  const effLines = [];
  const effMetrics = [];
  if (show("recovery_efficiency")) {
    effLines.push({ text: lab("recovery_efficiency", "Heat recovery"), size: P.fs.sec, color: "secondary" });
    effLines.push({ text: t.recovery_efficiency + (ctx.flags.effFlagged ? " \u26A0" : ""), reserve: "100% \u26A0", size: P.fs.eff, weight: 700, metric: "recovery_efficiency" });
    effMetrics.push("recovery_efficiency");
  }
  const sub = [];
  if (show("recovery_efficiency")) sub.push(ctx.flags.effSource);
  if (show("speed_state")) {
    sub.push(`Speed ${t.speed_state}`);
    effMetrics.push("speed_state");
  }
  if (sub.length) effLines.push({ text: sub.join("  |  "), reserve: show("speed_state") ? "Calculated  |  Speed 8" : "Calculated", size: P.fs.sec, color: "secondary" });
  if (effLines.length) B.eff = makeLabel(ctx, "efficiency", "mvhr", effLines, { metrics: effMetrics });
  if (f.aircon) {
    B.coilTitle = makeLabel(ctx, "coil-title", "coil", [{ text: "Air conditioning", size: P.fs.title, weight: 700 }]);
    B.coilPill = makeLabel(ctx, "coil-status", "coil", [{ text: ctx.flags.coilText, reserve: "Unknown", size: P.fs.sec, weight: 600, boxed: true, color: "pill" }]);
    const left = [];
    const right = [];
    const row = (k, name, col) => {
      if (show(k)) col.push(rowLabel(ctx, `m-${k}`, "coil", lab(k, name), t[k], P, k));
    };
    row("coil_air_in", "Air in", left);
    row("coil_air_out", "Air out", left);
    row("coil_air_delta", "Air \u0394T", left);
    row("water_flow_temperature", "Water flow", right);
    row("water_return_temperature", "Water return", right);
    row("buffer_temperature", "Buffer", right);
    B.coilLeft = left;
    B.coilRight = right;
  }
  if (f.water_circuit) {
    const pipe = (id, name, key, plain) => {
      const v = !plain && show(key);
      const line = { text: v ? `${name} ${t[key]}` : name, size: P.fs.sec, weight: 600, boxed: true, color: id.replace("-", "_") };
      if (v) Object.assign(line, { reserve: `${name} ${ctx.reserveTemp}`, metric: key });
      return makeLabel(ctx, id, "route", [line], { touches: [id], metrics: v ? [key] : [] });
    };
    B.flowLbl = pipe("water-flow", "Flow", "water_flow_temperature");
    B.returnLbl = pipe("water-return", "Return", "water_return_temperature");
    B.plainWater = () => {
      B.flowLbl = pipe("water-flow", "Flow", "water_flow_temperature", true);
      B.returnLbl = pipe("water-return", "Return", "water_return_temperature", true);
    };
  }
  const houseLines = [];
  const houseMetrics = [];
  if (show("indoor_temperature")) {
    houseLines.push({ text: t.indoor_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 700, metric: "indoor_temperature" });
    houseMetrics.push("indoor_temperature");
  }
  if (show("indoor_humidity")) {
    houseLines.push({ text: `${lab("indoor_humidity", "Humidity")} ${t.indoor_humidity}`, reserve: `${lab("indoor_humidity", "Humidity")} 100%`, size: P.fs.sec, metric: "indoor_humidity" });
    houseMetrics.push("indoor_humidity");
  }
  if (houseLines.length) B.houseText = makeLabel(ctx, "house", "house", houseLines, { metrics: houseMetrics });
  const et = show("extract_temperature");
  const eh = show("extract_humidity");
  if (et || eh) {
    const lines = [];
    if (et) lines.push({ text: t.extract_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 600, boxed: true, color: "extract", metric: "extract_temperature" });
    const cap = lab("extract_temperature", "Extract");
    if (et && eh) lines.push({ text: `${cap} \xB7 RH ${t.extract_humidity}`, reserve: `${cap} \xB7 RH 100%`, size: P.fs.sec, color: "secondary", metric: "extract_humidity" });
    else if (eh) lines.push({ text: `${cap} RH ${t.extract_humidity}`, reserve: `${cap} RH 100%`, size: P.fs.body, weight: 600, boxed: true, color: "extract", metric: "extract_humidity" });
    else lines.push({ text: cap, size: P.fs.sec, color: "secondary" });
    B.extractCap = makeLabel(ctx, "extract", "route", lines, { metrics: [et && "extract_temperature", eh && "extract_humidity"].filter(Boolean) });
  }
  if (f.bypass) {
    const pos = ctx.flags.bypassText;
    const mode2 = ctx.flags.bypassMode;
    const reserve = "Bypass position unknown";
    if (!mode2) {
      B.badge = makeLabel(ctx, "bypass", "route", [{ text: pos, reserve, size: P.fs.sec, weight: 600, boxed: true, color: "bypass" }], { touches: ["bypass"] });
    } else if (P.name === "mobile") {
      B.badge = makeLabel(ctx, "bypass", "route", [
        { text: pos, reserve, size: P.fs.sec, weight: 600, color: "bypass" },
        { text: `Mode ${mode2}`, reserve: "Mode Auto", size: P.fs.sec, weight: 400, color: "secondary" }
      ], { touches: ["bypass"], padX: 14, kind: "badge-stack" });
    } else {
      B.badge = makeLabel(ctx, "bypass", "route", [{ text: `${pos}  \xB7  ${mode2}`, reserve: `${reserve}  \xB7  Auto`, size: P.fs.sec, weight: 600, boxed: true, color: "bypass" }], { touches: ["bypass"] });
    }
  }
  return B;
}
function arrowsFor(points, every) {
  const arrows = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 40) continue;
    const n2 = Math.max(1, Math.floor(len / every));
    const dir = x2 > x1 ? "right" : x2 < x1 ? "left" : y2 > y1 ? "down" : "up";
    for (let k = 0; k < n2; k++) {
      const t = (k + 0.5) / n2;
      arrows.push({ x: x1 + (x2 - x1) * t, y: y1 + (y2 - y1) * t, dir, seg: i });
    }
  }
  return arrows;
}
function collarFor(port) {
  const { x, y, side } = port;
  const o = COLLAR.out;
  const l = COLLAR.len;
  const th = COLLAR.thick;
  if (side === "left") return { x: x - o, y: y - l / 2, w: th, h: l };
  if (side === "right") return { x: x + o - th, y: y - l / 2, w: th, h: l };
  if (side === "top") return { x: x - l / 2, y: y - o, w: l, h: th };
  return { x: x - l / 2, y: y + o - th, w: l, h: th };
}
function sizeCoil(B, P, wantCols) {
  const pad = P.pad;
  const L = B.coilLeft;
  const R = B.coilRight;
  const colW = (c) => c.reduce((a, r) => Math.max(a, r.w), 0);
  const headerW = B.coilTitle.w + 12 + B.coilPill.w;
  const rowH = Math.max(lineH(P.fs.value) + 6, TARGET);
  let cols = wantCols === 2 && L.length && R.length ? 2 : 1;
  const twoW = colW(L) + 32 + colW(R);
  if (cols === 2 && twoW > Math.max(P.coilMin, headerW, P.serpW) + 160) cols = 1;
  const gridW = cols === 2 ? twoW : colW([...L, ...R]);
  const gridRows = cols === 2 ? Math.max(L.length, R.length) : L.length + R.length;
  const headerH = Math.max(B.coilTitle.h, B.coilPill.h);
  const gridH = gridRows ? gridRows * rowH + 12 : 0;
  const grid = { cols, rowH, gridW, gridRows, colLW: colW(L), colRW: colW(R), headerH, gridH };
  const coilW = Math.ceil(Math.max(P.coilMin, headerW, gridW, P.serpW) + 2 * pad);
  return { coilW, coilAbove: pad + headerH + 12 + gridH + P.serpH / 2, coilBelow: P.serpH / 2 + pad, grid };
}
function placeCoil(B, P, coil, grid, airY, labels) {
  const pad = P.pad;
  const coilW = coil.w;
  const hx = coil.x + pad;
  const hy = coil.y + pad;
  labels.push(place(B.coilTitle, hx, hy + (grid.headerH - B.coilTitle.h) / 2));
  labels.push(place(B.coilPill, hx + B.coilTitle.w + 12, hy + (grid.headerH - B.coilPill.h) / 2));
  const gy = hy + grid.headerH + 12;
  const innerW = coilW - 2 * pad;
  if (grid.cols === 2) {
    const lw = grid.colLW;
    const rw = grid.colRW;
    const spare2 = innerW - lw - rw - 32;
    const lx = coil.x + pad + spare2 / 4;
    const rx = coil.x + coilW - pad - rw - spare2 / 4;
    B.coilLeft.forEach((r, i) => {
      r.w = lw;
      labels.push(place(r, lx, gy + i * grid.rowH));
    });
    B.coilRight.forEach((r, i) => {
      r.w = rw;
      labels.push(place(r, rx, gy + i * grid.rowH));
    });
    grid.divider = { x: (lx + lw + rx) / 2, y1: gy, y2: gy + grid.gridRows * grid.rowH - 6 };
  } else {
    const w1 = grid.gridW;
    [...B.coilLeft, ...B.coilRight].forEach((r, i) => {
      r.w = w1;
      labels.push(place(r, coil.x + (coilW - w1) / 2, gy + i * grid.rowH));
    });
  }
  grid.serp = { x: coil.x + (coilW - P.serpW) / 2, y: airY - P.serpH / 2, w: P.serpW, h: P.serpH };
}
function desktopLayout(cfg, W, P, ctx) {
  const B = blocks(cfg, ctx, P, P.name);
  const f = B.f;
  const pad = P.pad;
  const m = P.margin;
  const two = !!P.twoRow;
  const fanBlockW = Math.max(2 * P.fanR, B.supplyFan.w, B.extractFan.w);
  const fanDx = Math.max(P.fanDx, P.diamond + 12 + fanBlockW / 2);
  const mvhrW = Math.ceil(Math.max(P.mvhrMin, 2 * (fanDx + fanBlockW / 2 + pad), B.mvhrTitle.w + 2 * pad, (B.eff ? B.eff.w : 0) + 2 * pad));
  const noCoil = { coilW: 0, coilAbove: 0, coilBelow: 0, grid: null };
  let C = f.aircon ? sizeCoil(B, P, P.coilCols) : noCoil;
  const iconT = 30;
  const houseBodyW = two ? Math.ceil(Math.max(P.houseMin, iconT + 12 + (B.houseText ? B.houseText.w : 0) + 2 * pad)) : Math.ceil(Math.max(P.houseMin, (B.houseText ? B.houseText.w : 0) + 2 * pad));
  const houseBodyH = two ? Math.ceil(Math.max(iconT, B.houseText ? B.houseText.h : 0) + 2 * pad) : Math.ceil(pad + iconT + 6 + (B.houseText ? B.houseText.h : 0) + pad);
  const houseBelow = 24;
  const roofH = Math.round(houseBodyW * 0.32);
  const effH = B.eff ? B.eff.h : 0;
  const fanLblH = Math.max(B.supplyFan.h, B.extractFan.h);
  const blockH = 2 * P.fanR + 6 + fanLblH;
  let h = two ? 280 : Math.max(320, (C.coilBelow + 24) / 0.2, (houseBelow + 24) / 0.2);
  let inner = null;
  for (let guard = 0; guard < 200; guard++, h += 4) {
    const up2 = 0.4 * h;
    const lo2 = 0.6 * h;
    const mid = 0.5 * h;
    const titleBottom = pad + B.mvhrTitle.h;
    const blockTop = Math.max(titleBottom + 8, mid - blockH / 2 + fanLblH / 2 - 8);
    const effTop = Math.max(blockTop + blockH + 14, lo2 + COLLAR.len / 2 + 6);
    const bottom = effH ? effTop + effH + pad : blockTop + blockH + pad;
    if (bottom <= h) {
      inner = { up: up2, lo: lo2, mid, blockTop, effTop };
      break;
    }
  }
  h = Math.ceil(h);
  const up = Math.round(0.4 * h * 2) / 2;
  const lo = Math.round(0.6 * h * 2) / 2;
  const iconMax = P.iconMax;
  const capW = Math.max(B.intakeCap ? B.intakeCap.w : 0, B.exhaustCap ? B.exhaustCap.w : 0);
  const outPortX = m + iconMax + 8;
  const capX = m + iconMax + P.iconGap;
  const capRight = capW ? capX + capW : outPortX + 24;
  const tee = Math.max(24, P.tee);
  const minMvhrX = f.bypass ? capRight + CLEAR + tee + COLLAR.out : Math.max(capRight + CLEAR, outPortX + P.minSeg) + COLLAR.out;
  const gap2Min = f.bypass ? COLLAR.out + tee + P.minSeg * 0.75 + COLLAR.out : COLLAR.out + P.minSeg + COLLAR.out;
  const gap3Min = COLLAR.out + P.minSeg + COLLAR.out;
  const extW = B.extractCap ? B.extractCap.w : 0;
  const waterW = f.water_circuit ? Math.max(B.flowLbl.w, B.returnLbl.w) : 0;
  let mx;
  let coil = null;
  let houseX;
  let houseY;
  let spare;
  let extraExt = 0;
  let xE = 0;
  let xS = 0;
  let airY = up;
  let corrY = 0;
  if (!two) {
    const extractSpan = () => (f.aircon ? gap2Min + C.coilW + gap3Min : gap2Min + P.minSeg * 0.5) + houseBodyW / 2 - COLLAR.out;
    const total = () => minMvhrX + mvhrW + (f.aircon ? gap2Min + C.coilW + gap3Min : gap2Min + P.minSeg * 0.5) + houseBodyW + m + Math.max(0, extW + 2 * CLEAR - extractSpan());
    let minTotal = total();
    if (minTotal > W && f.aircon && C.grid.cols === 2) {
      C = sizeCoil(B, P, 1);
      minTotal = total();
    }
    if (minTotal > W) {
      const parts = `left ${Math.ceil(minMvhrX)}, mvhr ${mvhrW}, coil ${C.coilW}, house ${houseBodyW}, extract ${extW}`;
      return { fail: `needs ${Math.ceil(minTotal)}px, has ${Math.floor(W)}px (${parts})` };
    }
    spare = W - minTotal;
    const g1 = spare * (f.aircon ? 0.4 : 0.45);
    const g2 = spare * (f.aircon ? 0.3 : 0.55);
    const g3 = f.aircon ? spare * 0.3 : 0;
    extraExt = Math.max(0, extW + 2 * CLEAR - extractSpan());
    mx = Math.round(minMvhrX + g1);
    const mR2 = mx + mvhrW;
    if (f.aircon) {
      const cx0 = Math.round(mR2 + gap2Min + g2 + extraExt / 2);
      coil = { x: cx0, y: up - Math.round(C.coilAbove), w: C.coilW, h: Math.round(C.coilAbove + C.coilBelow) };
      houseX = Math.round(cx0 + C.coilW + gap3Min + g3 + extraExt / 2);
    } else {
      houseX = Math.round(mR2 + gap2Min + P.minSeg * 0.5 + g2 + extraExt);
    }
    houseY = up + houseBelow - houseBodyH;
  } else {
    const corr = 28;
    const row1 = (cw) => minMvhrX + mvhrW + COLLAR.out + Math.max(f.bypass ? tee + corr : 0, corr + corr) + m;
    const row2 = (cw) => m + houseBodyW + (f.aircon ? gap3Min + cw : P.minSeg) + COLLAR.out + corr + m;
    let need = Math.max(row1(C.coilW), row2(C.coilW));
    if (need > W && f.aircon && C.grid.cols === 2) {
      C = sizeCoil(B, P, 1);
      need = Math.max(row1(C.coilW), row2(C.coilW));
    }
    if (need > W) return { fail: `needs ${Math.ceil(need)}px, has ${Math.floor(W)}px` };
    spare = W - need;
    mx = Math.round(minMvhrX + spare * 0.45);
    const mR2 = mx + mvhrW;
    xE = mR2 + COLLAR.out + corr;
    xS = Math.round(Math.max(xE + corr, f.bypass ? mR2 + COLLAR.out + tee + corr : 0, W - m - Math.round(spare * 0.1)));
    const exBottom = B.exhaustCap ? lo + CLEAR + B.exhaustCap.h : lo;
    const bandTop = Math.max(h, exBottom);
    corrY = Math.ceil(bandTop + CLEAR + (B.extractCap ? B.extractCap.h + CLEAR : 12));
    airY = f.aircon ? corrY + 24 + C.coilAbove : corrY + 24 + houseBodyH / 2;
    airY = Math.max(airY, corrY + 24 + houseBodyH / 2);
    airY = Math.round(airY * 2) / 2;
    const stubR = xS - COLLAR.out - corr;
    if (f.aircon) {
      const cxR = stubR;
      coil = { x: Math.round(cxR - C.coilW), y: airY - Math.round(C.coilAbove), w: C.coilW, h: Math.round(C.coilAbove + C.coilBelow) };
      const room = coil.x - gap3Min - houseBodyW - m;
      houseX = Math.round(m + Math.max(0, room) * 0.5);
    } else {
      houseX = Math.round(m + Math.max(0, stubR - P.minSeg - houseBodyW - m) * 0.5);
    }
    houseY = Math.round(airY - houseBodyH / 2);
  }
  const mR = mx + mvhrW;
  const mvhr = { x: mx, y: 0, w: mvhrW, h };
  const houseBody = { x: houseX, y: houseY, w: houseBodyW, h: houseBodyH };
  const house = two ? { ...houseBody, shape: "rect" } : { ...houseBody, roofH, shape: "pentagon" };
  const ports = {
    "outside.intake": { x: outPortX, y: up, side: "right" },
    "outside.exhaust": { x: outPortX, y: lo, side: "right" },
    "mvhr.intake": { x: mx, y: up, side: "left" },
    "mvhr.exhaust": { x: mx, y: lo, side: "left" },
    "mvhr.supply": { x: mR, y: up, side: "right" },
    "mvhr.extract": { x: mR, y: lo, side: "right" }
  };
  if (two) {
    ports["house.supply"] = { x: houseX + houseBodyW, y: airY, side: "right" };
    ports["house.extract"] = { x: houseX + houseBodyW / 2, y: houseY, side: "top" };
  } else {
    ports["house.supply"] = { x: houseX, y: up, side: "left" };
    ports["house.extract"] = { x: houseX + houseBodyW / 2, y: houseBody.y + houseBodyH, side: "bottom" };
  }
  const nodes = { mvhr, house };
  const edges = [];
  const labels = [];
  const icons = [];
  const gap = lo - up;
  const iconS = Math.min(iconMax, gap - 16);
  icons.push({ id: "outdoor", type: "outdoor", x: m + (iconMax - iconS), y: up - iconS / 2, size: iconS });
  icons.push({ id: "wind", type: "wind", x: m + (iconMax - iconS), y: lo - iconS / 2, size: iconS });
  if (B.intakeCap) labels.push(place(B.intakeCap, capX, up - CLEAR - B.intakeCap.h));
  if (B.exhaustCap) labels.push(place(B.exhaustCap, capX, lo + CLEAR));
  const cx = mx + mvhrW / 2;
  labels.push(place(B.mvhrTitle, cx - B.mvhrTitle.w / 2, pad));
  const fanY = inner.blockTop + P.fanR;
  const sfx = cx - fanDx;
  const efx = cx + fanDx;
  icons.push({ id: "fan-supply", type: "fan", x: sfx - P.fanR, y: fanY - P.fanR, size: 2 * P.fanR, color: "intake" });
  icons.push({ id: "fan-extract", type: "fan", x: efx - P.fanR, y: fanY - P.fanR, size: 2 * P.fanR, color: "extract" });
  labels.push(place(B.supplyFan, sfx - B.supplyFan.w / 2, fanY + P.fanR + 6));
  labels.push(place(B.extractFan, efx - B.extractFan.w / 2, fanY + P.fanR + 6));
  const exchanger = { cx, cy: fanY, r: P.diamond, lobeW: fanDx + P.fanR * 0.6, top: inner.blockTop - 6 };
  let divider = null;
  if (B.eff) {
    labels.push(place(B.eff, cx - B.eff.w / 2, inner.effTop));
    divider = { x1: mx + pad, x2: mR - pad, y: inner.effTop - 7 };
  }
  const grid = C.grid;
  let water = null;
  if (coil) {
    nodes.coil = coil;
    ports["coil.air_in"] = { x: two ? coil.x + coil.w : coil.x, y: airY, side: two ? "right" : "left" };
    ports["coil.air_out"] = { x: two ? coil.x : coil.x + coil.w, y: airY, side: two ? "left" : "right" };
    placeCoil(B, P, coil, grid, airY, labels);
    if (f.water_circuit && !two) {
      const retX = coil.x + coil.w - pad - 12;
      const flowX = retX - 32;
      const lblX = retX + 36;
      let yR = coil.y - 30;
      let yF = yR - waterPitch(B);
      const lblR = lblX + waterW;
      const roofTop = houseBody.y - roofH;
      if (lblR + CLEAR > houseX) {
        const limit = roofTop - CLEAR - Math.max(B.flowLbl.h, B.returnLbl.h) / 2;
        if (yR > limit) {
          yR = limit;
          yF = yR - waterPitch(B);
        }
      }
      ports["coil.water_flow"] = { x: flowX, y: coil.y, side: "top" };
      ports["coil.water_return"] = { x: retX, y: coil.y, side: "top" };
      ports["water.flow"] = { x: lblX, y: yF, side: "left" };
      ports["water.return"] = { x: lblX, y: yR, side: "left" };
      labels.push(place(B.flowLbl, lblX, yF - B.flowLbl.h / 2));
      labels.push(place(B.returnLbl, lblX, yR - B.returnLbl.h / 2));
      water = true;
    } else if (f.water_circuit) {
      const CB = coil.y + coil.h;
      const retX = coil.x + coil.w - pad - 12;
      const flowX = retX - 32;
      const yF = CB + COLLAR.out + 22;
      const yR = yF + waterPitch(B);
      const lblR = flowX - 16;
      if (lblR - waterW < coil.x) return { fail: "water labels too wide" };
      ports["coil.water_flow"] = { x: flowX, y: CB, side: "bottom" };
      ports["coil.water_return"] = { x: retX, y: CB, side: "bottom" };
      ports["water.flow"] = { x: lblR, y: yF, side: "right" };
      ports["water.return"] = { x: lblR, y: yR, side: "right" };
      labels.push(place(B.flowLbl, lblR - B.flowLbl.w, yF - B.flowLbl.h / 2));
      labels.push(place(B.returnLbl, lblR - B.returnLbl.w, yR - B.returnLbl.h / 2));
      water = true;
    }
  }
  if (two) {
    const htw = B.houseText ? B.houseText.w : 0;
    const gx = houseX + (houseBodyW - (iconT + 12 + htw)) / 2;
    icons.push({ id: "house", type: "house", x: gx, y: houseY + (houseBodyH - iconT) / 2, size: iconT, color: "supply" });
    if (B.houseText) labels.push(place(B.houseText, gx + iconT + 12, houseY + (houseBodyH - B.houseText.h) / 2));
  } else {
    icons.push({ id: "thermo", type: "thermometer", x: houseX + houseBodyW / 2 - iconT / 2, y: houseBody.y + pad, size: iconT, color: "extract" });
    if (B.houseText) labels.push(place(B.houseText, houseX + (houseBodyW - B.houseText.w) / 2, houseBody.y + pad + iconT + 6));
  }
  const e = (id, from, to, color, pts, kind = "air") => edges.push({ id, from, to, color, kind, points: pts });
  const P_ = (k) => [ports[k].x, ports[k].y];
  e("intake", "outside.intake", "mvhr.intake", "intake", [P_("outside.intake"), P_("mvhr.intake")]);
  const supplyEnd = coil ? "coil.air_in" : "house.supply";
  const supplyPts = two ? [P_("mvhr.supply"), [xS, up], [xS, airY], P_(supplyEnd)] : [P_("mvhr.supply"), P_(supplyEnd)];
  e("supply", "mvhr.supply", supplyEnd, "supply", supplyPts);
  if (coil) e("supply-house", "coil.air_out", "house.supply", "supply", [P_("coil.air_out"), P_("house.supply")]);
  const hxp = ports["house.extract"];
  if (two) e("extract", "house.extract", "mvhr.extract", "extract", [[hxp.x, hxp.y], [hxp.x, corrY], [xE, corrY], [xE, lo], P_("mvhr.extract")]);
  else e("extract", "house.extract", "mvhr.extract", "extract", [[hxp.x, hxp.y], [hxp.x, lo], P_("mvhr.extract")]);
  e("exhaust", "mvhr.exhaust", "outside.exhaust", "exhaust", [P_("mvhr.exhaust"), P_("outside.exhaust")]);
  if (water) {
    const wf = ports["water.flow"];
    const cf = ports["coil.water_flow"];
    const cr = ports["coil.water_return"];
    const wr = ports["water.return"];
    e("water-flow", "water.flow", "coil.water_flow", "water_flow", [[wf.x, wf.y], [cf.x, wf.y], [cf.x, cf.y]], "water");
    e("water-return", "coil.water_return", "water.return", "water_return", [[cr.x, cr.y], [cr.x, wr.y], [wr.x, wr.y]], "water");
  }
  if (B.extractCap) {
    if (two) {
      const spanL = hxp.x + CLEAR;
      const spanR = xE - CLEAR;
      if (B.extractCap.w > spanR - spanL) return { fail: "extract value too wide" };
      const ex = Math.max(spanL, Math.min(spanR - B.extractCap.w, cx - B.extractCap.w / 2));
      labels.push(place(B.extractCap, ex, corrY - CLEAR - B.extractCap.h));
    } else {
      const spanL = mR + COLLAR.out + CLEAR;
      const spanR = hxp.x - CLEAR;
      const ex = Math.max(spanL, Math.min(spanR - B.extractCap.w, (spanL + spanR) / 2 - B.extractCap.w / 2 + (coil ? coil.x + coil.w / 2 - (spanL + spanR) / 2 : 0)));
      labels.push(place(B.extractCap, ex, lo + CLEAR));
    }
  }
  let bypass = null;
  if (f.bypass) {
    const tL = mx - COLLAR.out - tee;
    const tR = mR + COLLAR.out + tee;
    const bridgeY = -P.bridgeGap;
    ports["tee.intake"] = { x: tL, y: up, side: "top" };
    ports["tee.supply"] = { x: tR, y: up, side: "top" };
    e("bypass", "tee.intake", "tee.supply", "bypass", [[tL, up], [tL, bridgeY], [tR, bridgeY], [tR, up]], "bypass");
    const b = B.badge;
    labels.push(place(b, cx - b.w / 2, bridgeY - 14 - b.h));
    bypass = { teeL: tL, teeR: tR, bridgeY, stem: { x: cx, y1: bridgeY - 14, y2: bridgeY } };
  }
  return finish({ mode: P.name, W, nodes, ports, edges, labels, icons, exchanger, divider, grid, bypass, P, rows: { up, lo, air: two ? airY : up, corridor: two ? corrY : null } }, ctx);
}
function mobileLayout(cfg, W, P, ctx) {
  const B = blocks(cfg, ctx, P, "mobile");
  const f = B.f;
  const pad = P.pad;
  const railL = P.railL;
  const railR = W - P.railL;
  const boxL = railL + 26;
  const boxR = railR - 26;
  const outside = { x: 12, y: 0, w: W - 24, h: 0 };
  const icon = 32;
  const halfW = outside.w / 2;
  const capW1 = B.intakeCap ? B.intakeCap.w : 0;
  const capW2 = B.exhaustCap ? B.exhaustCap.w : 0;
  const capH = Math.max(B.intakeCap ? B.intakeCap.h : 0, B.exhaustCap ? B.exhaustCap.h : 0);
  const labels = [];
  const icons = [];
  if (capW1 + 8 <= halfW - 2 * INSET && capW2 + 8 <= halfW - 2 * INSET) {
    outside.h = Math.ceil(pad + icon + 6 + capH + pad);
    icons.push({ id: "outdoor", type: "outdoor", x: outside.x + halfW / 2 - icon / 2, y: pad, size: icon });
    icons.push({ id: "wind", type: "wind", x: outside.x + halfW + halfW / 2 - icon / 2, y: pad, size: icon });
    if (B.intakeCap) labels.push(place(B.intakeCap, outside.x + halfW / 2 - B.intakeCap.w / 2, pad + icon + 6));
    if (B.exhaustCap) labels.push(place(B.exhaustCap, outside.x + halfW + halfW / 2 - B.exhaustCap.w / 2, pad + icon + 6));
  } else {
    if (pad + icon + 12 + Math.max(capW1, capW2) + pad > outside.w) return { fail: "outside readings too wide" };
    const rowH = Math.max(icon, capH);
    const r2 = pad + rowH + 10;
    icons.push({ id: "outdoor", type: "outdoor", x: outside.x + pad, y: pad + (rowH - icon) / 2, size: icon });
    icons.push({ id: "wind", type: "wind", x: outside.x + pad, y: r2 + (rowH - icon) / 2, size: icon });
    if (B.intakeCap) labels.push(place(B.intakeCap, outside.x + pad + icon + 12, pad + (rowH - B.intakeCap.h) / 2));
    if (B.exhaustCap) labels.push(place(B.exhaustCap, outside.x + pad + icon + 12, r2 + (rowH - B.exhaustCap.h) / 2));
    outside.h = Math.ceil(r2 + rowH + pad);
  }
  const mvhr = { x: boxL, y: 0, w: boxR - boxL, h: 0 };
  const inX = mvhr.x + 34;
  const exX = mvhr.x + mvhr.w - 34;
  const O = outside.y + outside.h;
  let gapTop = 56;
  if (f.bypass) gapTop = Math.max(84, B.badge.h + 2 * 18, lineH(P.fs.sec) * 3 + 2 * 18);
  mvhr.y = O + gapTop;
  const fanBlockW = Math.max(2 * P.fanR, B.supplyFan.w, B.extractFan.w);
  const fanDx = Math.min((mvhr.w - 2 * pad - fanBlockW) / 2, 110);
  if (fanDx < P.diamond + 8 + fanBlockW / 2 || B.mvhrTitle.w + 2 * pad > mvhr.w || B.eff && B.eff.w + 2 * pad > mvhr.w) return { fail: "MVHR content too wide" };
  const cx = mvhr.x + mvhr.w / 2;
  labels.push(place(B.mvhrTitle, cx - B.mvhrTitle.w / 2, mvhr.y + pad));
  const fanTop = mvhr.y + pad + B.mvhrTitle.h + 10;
  const fanY = fanTop + P.fanR;
  const fanLblH = Math.max(B.supplyFan.h, B.extractFan.h);
  icons.push({ id: "fan-supply", type: "fan", x: cx - fanDx - P.fanR, y: fanTop, size: 2 * P.fanR, color: "intake" });
  icons.push({ id: "fan-extract", type: "fan", x: cx + fanDx - P.fanR, y: fanTop, size: 2 * P.fanR, color: "extract" });
  labels.push(place(B.supplyFan, cx - fanDx - B.supplyFan.w / 2, fanY + P.fanR + 6));
  labels.push(place(B.extractFan, cx + fanDx - B.extractFan.w / 2, fanY + P.fanR + 6));
  const exchanger = { cx, cy: fanY, r: P.diamond, lobeW: fanDx + P.fanR * 0.6, top: fanTop - 6 };
  let y = fanY + P.fanR + 6 + fanLblH + 14;
  let divider = null;
  if (B.eff) {
    divider = { x1: mvhr.x + pad, x2: mvhr.x + mvhr.w - pad, y: y - 7 };
    labels.push(place(B.eff, cx - B.eff.w / 2, y));
    y += B.eff.h;
  }
  mvhr.h = Math.ceil(y + pad - mvhr.y);
  const MB = mvhr.y + mvhr.h;
  const ports = {
    "outside.intake": { x: inX, y: O, side: "bottom" },
    "outside.exhaust": { x: exX, y: O, side: "bottom" },
    "mvhr.intake": { x: inX, y: mvhr.y, side: "top" },
    "mvhr.exhaust": { x: exX, y: mvhr.y, side: "top" },
    "mvhr.supply": { x: inX, y: MB, side: "bottom" },
    "mvhr.extract": { x: exX, y: MB, side: "bottom" }
  };
  const yE = MB + COLLAR.out + P.tee + 4;
  let below = yE + 16;
  if (B.extractCap) {
    const spanL = inX + CLEAR + 2;
    const spanR = railR - CLEAR - 2;
    if (B.extractCap.w > spanR - spanL) return { fail: "extract value too wide" };
    labels.push(place(B.extractCap, Math.max(spanL, Math.min(spanR - B.extractCap.w, exX - B.extractCap.w / 2)), yE + CLEAR));
    below = yE + CLEAR + B.extractCap.h + 8;
  }
  const nodes = { outside, mvhr };
  let coil = null;
  let grid = null;
  let houseTop;
  const flowLblX = {};
  if (f.aircon) {
    coil = { x: 12 + 0, y: Math.max(below + 16, yE + COLLAR.out + 30), w: boxR - 12, h: 0 };
    coil.x = 12;
    coil.w = boxR - 12;
    const hx2 = coil.x + pad;
    let cy = coil.y + pad;
    if (B.coilTitle.w + 12 + B.coilPill.w + 2 * pad <= coil.w) {
      const hh = Math.max(B.coilTitle.h, B.coilPill.h);
      labels.push(place(B.coilTitle, hx2, cy + (hh - B.coilTitle.h) / 2));
      labels.push(place(B.coilPill, hx2 + B.coilTitle.w + 12, cy + (hh - B.coilPill.h) / 2));
      cy += hh + 12;
    } else {
      if (B.coilTitle.w + 2 * pad > coil.w) return { fail: "coil title too wide" };
      labels.push(place(B.coilTitle, hx2, cy));
      cy += B.coilTitle.h + 6;
      labels.push(place(B.coilPill, hx2, cy));
      cy += B.coilPill.h + 12;
    }
    const rowH = Math.max(lineH(P.fs.value) + 6, TARGET);
    const L = B.coilLeft;
    const R = B.coilRight;
    const colW = (c) => c.reduce((a, r) => Math.max(a, r.w), 0);
    const innerW = coil.w - 2 * pad;
    const two = L.length && R.length && colW(L) + 24 + colW(R) <= innerW;
    if (two) {
      const lw = colW(L);
      const rw = colW(R);
      L.forEach((r, i) => {
        r.w = lw;
        labels.push(place(r, hx2, cy + i * rowH));
      });
      R.forEach((r, i) => {
        r.w = rw;
        labels.push(place(r, coil.x + coil.w - pad - rw, cy + i * rowH));
      });
      cy += Math.max(L.length, R.length) * rowH + 8;
    } else {
      const all = [...L, ...R];
      const w1 = colW(all);
      if (w1 > innerW) return { fail: "coil readings too wide" };
      all.forEach((r, i) => {
        r.w = innerW;
        labels.push(place(r, hx2, cy + i * rowH));
      });
      cy += all.length * rowH + 8;
    }
    const serpW = Math.min(P.serpW, innerW);
    grid = { serp: { x: coil.x + (coil.w - serpW) / 2, y: cy, w: serpW, h: P.serpH } };
    coil.h = Math.ceil(cy + P.serpH + pad - coil.y);
    nodes.coil = coil;
    const CB = coil.y + coil.h;
    ports["coil.air_in"] = { x: inX, y: coil.y, side: "top" };
    ports["coil.air_out"] = { x: inX, y: CB, side: "bottom" };
    houseTop = CB + 44;
    if (f.water_circuit) {
      const retX = coil.x + coil.w - 24;
      const flowX = retX - 36;
      const yF = CB + COLLAR.out + 22;
      const yR = yF + waterPitch(B);
      const lblR = flowX - 16;
      const fits = () => lblR - Math.max(B.flowLbl.w, B.returnLbl.w) >= inX + CLEAR + 2;
      if (!fits()) B.plainWater();
      if (!fits()) return { fail: "water labels too wide" };
      ports["coil.water_flow"] = { x: flowX, y: CB, side: "bottom" };
      ports["coil.water_return"] = { x: retX, y: CB, side: "bottom" };
      ports["water.flow"] = { x: lblR, y: yF, side: "right" };
      ports["water.return"] = { x: lblR, y: yR, side: "right" };
      labels.push(place(B.flowLbl, lblR - B.flowLbl.w, yF - B.flowLbl.h / 2));
      labels.push(place(B.returnLbl, lblR - B.returnLbl.w, yR - B.returnLbl.h / 2));
      flowLblX.v = true;
      houseTop = Math.max(houseTop, yR + B.returnLbl.h / 2 + 24);
    }
  } else {
    houseTop = below + 24;
  }
  const hIcon = 30;
  const htw = B.houseText ? B.houseText.w : 0;
  const house = { x: 12, y: houseTop, w: boxR - 12, h: Math.ceil(Math.max(hIcon, B.houseText ? B.houseText.h : 0) + 2 * pad), shape: "rect" };
  if (hIcon + 12 + htw + 2 * pad > house.w) return { fail: "house text too wide" };
  nodes.house = house;
  const hcx = house.x + house.w / 2;
  const groupW = hIcon + 12 + htw;
  icons.push({ id: "house", type: "house", x: Math.max(inX + 20, hcx - groupW / 2), y: house.y + (house.h - hIcon) / 2, size: hIcon, color: "supply" });
  if (B.houseText) labels.push(place(B.houseText, Math.max(inX + 20, hcx - groupW / 2) + hIcon + 12, house.y + (house.h - B.houseText.h) / 2));
  ports["house.supply"] = { x: inX, y: house.y, side: "top" };
  ports["house.extract"] = { x: house.x + house.w, y: house.y + house.h / 2, side: "right" };
  const edges = [];
  const e = (id, from, to, color, pts, kind = "air") => edges.push({ id, from, to, color, kind, points: pts });
  const P_ = (k) => [ports[k].x, ports[k].y];
  e("intake", "outside.intake", "mvhr.intake", "intake", [P_("outside.intake"), P_("mvhr.intake")]);
  e("exhaust", "mvhr.exhaust", "outside.exhaust", "exhaust", [P_("mvhr.exhaust"), P_("outside.exhaust")]);
  if (coil) {
    e("supply", "mvhr.supply", "coil.air_in", "supply", [P_("mvhr.supply"), P_("coil.air_in")]);
    e("supply-house", "coil.air_out", "house.supply", "supply", [P_("coil.air_out"), P_("house.supply")]);
  } else {
    e("supply", "mvhr.supply", "house.supply", "supply", [P_("mvhr.supply"), P_("house.supply")]);
  }
  const hx = ports["house.extract"];
  e("extract", "house.extract", "mvhr.extract", "extract", [[hx.x, hx.y], [railR, hx.y], [railR, yE], [exX, yE], P_("mvhr.extract")]);
  if (ports["coil.water_flow"]) {
    const wf = ports["water.flow"];
    const cf = ports["coil.water_flow"];
    const cr = ports["coil.water_return"];
    const wr = ports["water.return"];
    e("water-flow", "water.flow", "coil.water_flow", "water_flow", [[wf.x, wf.y], [cf.x, wf.y], [cf.x, cf.y]], "water");
    e("water-return", "coil.water_return", "water.return", "water_return", [[cr.x, cr.y], [cr.x, wr.y], [wr.x, wr.y]], "water");
  }
  let bypass = null;
  if (f.bypass) {
    const t1 = O + COLLAR.out + P.tee;
    ports["tee.intake"] = { x: inX, y: t1, side: "left" };
    ports["tee.supply"] = { x: inX, y: yE, side: "left" };
    e("bypass", "tee.intake", "tee.supply", "bypass", [[inX, t1], [railL, t1], [railL, yE], [inX, yE]], "bypass");
    let b = B.badge;
    const spanL = inX + CLEAR + 2;
    const spanR = exX - CLEAR - 2;
    if (b.w > spanR - spanL) {
      const word = { "Bypass open": "Open", "Bypass closed": "Closed" }[ctx.flags.bypassText] || "Unknown";
      const ls = [
        { text: "Bypass", size: P.fs.sec, weight: 600, color: "bypass" },
        { text: word, reserve: "Unknown", size: P.fs.sec, weight: 600, color: "bypass" }
      ];
      if (ctx.flags.bypassMode) ls.push({ text: "Mode " + ctx.flags.bypassMode, reserve: "Mode Auto", size: P.fs.sec, weight: 400, color: "secondary" });
      b = makeLabel(ctx, "bypass", "route", ls, { touches: ["bypass"], padX: 8, kind: "badge-stack" });
      if (b.w > spanR - spanL) return { fail: "bypass badge too wide" };
    }
    labels.push(place(b, (spanL + spanR) / 2 - b.w / 2, O + (gapTop - b.h) / 2));
    bypass = { teeL: inX, teeR: inX, rail: railL, mobile: true };
  }
  return finish({ mode: "mobile", W, nodes, ports, edges, labels, icons, exchanger, divider, grid, bypass, P, rows: null }, ctx);
}
function finish(L, ctx) {
  let minY = Infinity;
  let maxY = -Infinity;
  const eat = (y1, y2) => {
    minY = Math.min(minY, y1);
    maxY = Math.max(maxY, y2);
  };
  for (const n2 of Object.values(L.nodes)) eat(n2.y - (n2.roofH || 0), n2.y + n2.h);
  for (const l of L.labels) eat(l.y, l.y + l.h);
  for (const i of L.icons) eat(i.y, i.y + i.size);
  for (const e of L.edges) for (const [, y] of e.points) eat(y - 2, y + 2);
  const dy = 8 - minY;
  const sh = (o, k = "y") => {
    o[k] += dy;
  };
  for (const n2 of Object.values(L.nodes)) sh(n2);
  for (const l of L.labels) sh(l);
  for (const i of L.icons) sh(i);
  for (const p of Object.values(L.ports)) sh(p);
  for (const e of L.edges) e.points = e.points.map(([x, y]) => [x, y + dy]);
  if (L.exchanger) {
    L.exchanger.cy += dy;
    L.exchanger.top += dy;
  }
  if (L.divider) L.divider.y += dy;
  if (L.grid) {
    if (L.grid.serp) L.grid.serp.y += dy;
    if (L.grid.divider) {
      L.grid.divider.y1 += dy;
      L.grid.divider.y2 += dy;
    }
  }
  if (L.bypass && !L.bypass.mobile) {
    L.bypass.bridgeY += dy;
    L.bypass.stem.y1 += dy;
    L.bypass.stem.y2 += dy;
  }
  if (L.rows) {
    L.rows.up += dy;
    L.rows.lo += dy;
    L.rows.air += dy;
    if (L.rows.corridor !== null) L.rows.corridor += dy;
  }
  L.H = Math.ceil(maxY + dy + 8);
  const every = L.mode === "mobile" ? 90 : 150;
  for (const e of L.edges) e.arrows = arrowsFor(e.points, e.kind === "water" ? 80 : every);
  L.collars = [];
  for (const [name, p] of Object.entries(L.ports)) {
    const owner = name.split(".")[0];
    if (owner === "outside" && L.mode !== "mobile") continue;
    if (owner === "tee" || owner === "water") continue;
    L.collars.push({ port: name, ...collarFor(p) });
  }
  L.tees = L.bypass ? [L.ports["tee.intake"], L.ports["tee.supply"]].map((p) => ({ x: p.x, y: p.y })) : [];
  return L;
}
function computeLayout(cfg, opts) {
  const s = cfg.layout.text_scale;
  const ctx = {
    measure: opts.measure || heuristicMeasure,
    texts: opts.texts || {},
    flags: { effSource: "Reported", effFlagged: false, coilText: "Unknown", bypassText: "Bypass position unknown", bypassMode: null, ...opts.flags || {} }
  };
  ctx.reserveTemp = tempTemplate(cfg, opts.tempUnit || "\xB0C");
  const cardW = opts.cardWidth ?? opts.width;
  const W = Math.max(280, Math.floor(opts.width));
  const eff = cardW / s;
  const order = ["wide", "compact", "mobile"];
  let start;
  if (cfg.layout.mode !== "auto") start = cfg.layout.mode;
  else start = eff >= cfg.layout.compact_below ? "wide" : eff >= cfg.layout.mobile_below ? "compact" : "mobile";
  const reasons = [];
  const variants = { wide: [WIDE, WIDE_TIGHT], compact: [COMPACT], mobile: [MOBILE] };
  for (const mode of order.slice(order.indexOf(start))) {
    let L2 = null;
    for (const V of variants[mode]) {
      const P2 = scaled(V, s);
      L2 = mode === "mobile" ? mobileLayout(cfg, W, P2, ctx) : desktopLayout(cfg, W, P2, ctx);
      if (!L2.fail) break;
    }
    if (!L2.fail) {
      L2.requested = start;
      L2.fallback = reasons;
      L2.cardWidth = cardW;
      return L2;
    }
    reasons.push(`${mode}: ${L2.fail}`);
  }
  const P = scaled(MOBILE, s);
  const minW = 300 * s;
  const L = mobileLayout(cfg, Math.max(W, minW), P, ctx);
  if (L.fail) throw new Error(`layout failed: ${reasons.join("; ")}; ${L.fail}`);
  L.requested = start;
  L.fallback = reasons;
  L.cardWidth = cardW;
  L.overwide = true;
  return L;
}

// src/icons.js
var ICONS = {
  outdoor: '<circle cx="8" cy="8" r="3.2"/><path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 3.6l-1.1 1.1"/><path d="M9 19.5h9.5a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.4-.8A3.9 3.9 0 0 0 9 19.5z"/>',
  wind: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  fan: '<circle cx="12" cy="12" r="10.5"/><circle cx="12" cy="12" r="1.6"/><path d="M12 10.4c-.6-2.6.2-5 2.6-5.6 1.9-.4 2.8 1.6 1.6 3.2-1 1.3-2.6 2-4.2 2.4zM13.4 12.8c2.5.8 4.2 2.7 3.4 5-.6 1.8-2.8 1.6-3.5-.3-.6-1.5-.3-3.2.1-4.7zM10.6 12.8c-1.9 1.8-4.4 2.4-5.9.6-1.2-1.5.1-3.2 2.1-3 1.6.2 2.9 1.2 3.8 2.4z"/>',
  thermometer: '<path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><path d="M12 9v7"/><circle cx="12" cy="16.8" r="1.2"/>',
  house: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5.5h4V20"/>',
  moon: '<path d="M19.5 14.8A8 8 0 0 1 9.2 4.5a8 8 0 1 0 10.3 10.3z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="12.5" rx="2"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M3 12.5h18"/>',
  bypass: '<path d="M3 17h4V8h10v9h4"/><path d="M3 17h18"/><circle cx="12" cy="8" r="1.4"/>',
  // navigation
  forecast: '<circle cx="8" cy="8" r="3"/><path d="M8 2v1.5M2 8h1.5M3.8 3.8l1 1M12.2 3.8l-1 1"/><path d="M9 19h9a3.5 3.5 0 0 0 0-7 5 5 0 0 0-9.3-.6A3.8 3.8 0 0 0 9 19z"/>',
  inverter: '<rect x="3.5" y="4" width="17" height="16" rx="2"/><path d="M7 12c1.2-3 2.3-3 3.5 0s2.3 3 3.5 0 2.3-3 3.5 0"/>',
  attic: '<path d="M2.5 13 12 4.5l9.5 8.5"/><path d="M5 11v8.5h14V11"/><path d="M9.5 13h5"/>',
  security: '<path d="M12 3 5 6v5.5c0 4.3 3 7.7 7 9 4-1.3 7-4.7 7-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  bms: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  mvhr: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m12 7.5 4.5 4.5-4.5 4.5L7.5 12z"/>',
  pump: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5v7l5.5-3.5z"/>',
  boiler: '<rect x="5" y="2.5" width="14" height="19" rx="2"/><path d="M12 17.5c-2 0-3-1.3-3-2.9 0-1.8 1.6-2.6 2-4.6 1.6 1 4 3 4 4.8 0 1.5-1 2.7-3 2.7z"/>',
  car: '<path d="M4 16.5V12l2-5h12l2 5v4.5z"/><path d="M4 12h16"/><circle cx="7.5" cy="16.5" r="1.8"/><circle cx="16.5" cy="16.5" r="1.8"/>',
  home: '<path d="M3 11 12 3.5 21 11"/><path d="M5.5 9v11h13V9"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.6 3-5.2 4-9.4 3 2 8 6 8 9.6 0 3-2.4 5.4-6 5.4z"/>',
  bolt: '<path d="M13.5 2.5 5 13.5h6l-1 8 8.5-11h-6z"/>',
  drop: '<path d="M12 3c3 4 6 7.2 6 10.7a6 6 0 0 1-12 0C6 10.2 9 7 12 3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  more: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>'
};
ICONS.fan_nav = ICONS.fan;
function iconSvg(name, size = 24, label = "") {
  const body = ICONS[name] || ICONS.link;
  const aria = label ? `role="img" aria-label="${label}"` : 'aria-hidden="true" focusable="false"';
  return `<svg ${aria} width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
function iconGroup(name, x, y, size, color, width = 1.8) {
  const s = size / 24;
  return `<g class="icon" transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${color}" stroke-width="${(width / s).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ""}</g>`;
}

// src/render.js
var BYPASS_TEXT = { open: "Bypass open", closed: "Bypass closed", unknown: "Bypass position unknown", unbound: "Bypass position unknown" };
var COIL_TEXT = { idle: "Idle", heating: "Heating", cooling: "Cooling", off: "Off", unknown: "Unknown", unbound: "Unknown" };
var FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
var n = (v) => Math.round(v * 10) / 10;
var cv = (c) => `var(--mvhr-${c})`;
function layoutInputs(cfg, model, hass, width, cardWidth, measure) {
  const eff = model.readings.recovery_efficiency;
  return {
    width,
    cardWidth,
    measure,
    texts: model.text,
    tempUnit: displayTempUnit(cfg, hass),
    flags: {
      effSource: eff && eff.source === "calculated" ? "Calculated" : "Reported",
      effFlagged: !!(eff && eff.flagged),
      coilText: COIL_TEXT[model.coil] || "Unknown",
      bypassText: BYPASS_TEXT[model.bypass] || BYPASS_TEXT.unknown,
      bypassMode: model.bypassMode
    }
  };
}
function routePath(pts, r = 10) {
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const d1 = Math.hypot(x1 - x0, y1 - y0);
    const d2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = x1 - (x1 - x0) / d1 * rr;
    const ay = y1 - (y1 - y0) / d1 * rr;
    const bx = x1 + (x2 - x1) / d2 * rr;
    const by = y1 + (y2 - y1) / d2 * rr;
    d += ` L${n(ax)} ${n(ay)} Q${n(x1)} ${n(y1)} ${n(bx)} ${n(by)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${n(last[0])} ${n(last[1])}`;
}
function arrowHead(a, travel, s = 7) {
  const { x, y } = a;
  const d = {
    right: `M${n(x + s)} ${n(y)} L${n(x - s * 0.7)} ${n(y - s)} L${n(x - s * 0.7)} ${n(y + s)} Z`,
    left: `M${n(x - s)} ${n(y)} L${n(x + s * 0.7)} ${n(y - s)} L${n(x + s * 0.7)} ${n(y + s)} Z`,
    down: `M${n(x)} ${n(y + s)} L${n(x - s)} ${n(y - s * 0.7)} L${n(x + s)} ${n(y - s * 0.7)} Z`,
    up: `M${n(x)} ${n(y - s)} L${n(x - s)} ${n(y + s * 0.7)} L${n(x + s)} ${n(y + s * 0.7)} Z`
  }[a.dir];
  const v = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[a.dir];
  const h = travel / 2;
  return `<g class="flow" style="--fx0:${n(-v[0] * h)}px;--fy0:${n(-v[1] * h)}px;--fx1:${n(v[0] * h)}px;--fy1:${n(v[1] * h)}px"><path class="arrow" data-dir="${a.dir}" d="${d}"/></g>`;
}
function travelFor(e, a) {
  const [x1, y1] = e.points[a.seg];
  const [x2, y2] = e.points[a.seg + 1];
  const count = e.arrows.filter((b) => b.seg === a.seg).length;
  return Math.min(64, Math.hypot(x2 - x1, y2 - y1) / count * 0.7);
}
function hairpin(s, state) {
  const r = s.h / 2;
  const frame = `<rect class="serp-frame" x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="${n(Math.min(r, 14))}"/>`;
  const gx = Math.max(10, s.h * 0.22);
  const x1 = s.x + gx;
  const x2 = s.x + s.w - gx;
  const pitch = (s.h - 2 * gx * 0.75) / 2;
  const y0 = s.y + gx * 0.75;
  const b = pitch / 2;
  const d = `M${n(x1 + b)} ${n(y0)} L${n(x2 - b)} ${n(y0)} A${n(b)} ${n(b)} 0 0 1 ${n(x2 - b)} ${n(y0 + pitch)} L${n(x1 + b)} ${n(y0 + pitch)} A${n(b)} ${n(b)} 0 0 0 ${n(x1 + b)} ${n(y0 + 2 * pitch)} L${n(x2 - b)} ${n(y0 + 2 * pitch)}`;
  return `<g data-part="coil-tube" data-state="${state}">${frame}<path class="serp" d="${d}"/></g>`;
}
function exchangerMarkup(e) {
  const { cx, cy, r, lobeW: W, top } = e;
  const dy = Math.max(12, cy - top - 2);
  const rd = Math.min(r, dy * 0.95);
  const plate = (sgn) => {
    const pts = [
      [cx - W, cy - sgn * dy * 0.35],
      [cx - W * 0.6, cy - sgn * dy],
      [cx - dy * 0.9, cy - sgn * dy],
      [cx + dy * 0.9, cy + sgn * dy],
      [cx + W * 0.6, cy + sgn * dy],
      [cx + W, cy + sgn * dy * 0.35]
    ];
    return `<path class="plate" d="M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L")}"/>`;
  };
  return `<g data-part="exchanger">` + plate(1) + plate(-1) + `<path class="diamond" stroke="${cv("intake")}" d="M${n(cx)} ${n(cy - rd)} L${n(cx - rd)} ${n(cy)} L${n(cx)} ${n(cy + rd)}"/><path class="diamond" stroke="${cv("extract")}" d="M${n(cx)} ${n(cy - rd)} L${n(cx + rd)} ${n(cy)} L${n(cx)} ${n(cy + rd)}"/></g>`;
}
function fanMarkup(ic, color, spin) {
  const R = ic.size / 2;
  const cx = ic.x + R;
  const cy = ic.y + R;
  const k = R * 0.78;
  const blade = `M0 0 C${n(0.2 * k)} ${n(-0.3 * k)} ${n(0.62 * k)} ${n(-0.55 * k)} ${n(0.3 * k)} ${n(-0.92 * k)} C${n(-0.05 * k)} ${n(-1.02 * k)} ${n(-0.38 * k)} ${n(-0.55 * k)} 0 0Z`;
  const blades = [0, 120, 240].map((a) => `<path d="${blade}" transform="rotate(${a})"/>`).join("");
  return `<g class="fan" data-icon="${ic.id}"><circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R - 1.5)}" fill="color-mix(in srgb, ${color} 22%, var(--mvhr-equipment))" stroke="${color}" stroke-width="3"/><g transform="translate(${n(cx)} ${n(cy)})"><g class="blades${spin ? " spin" : ""}" fill="${color}">${blades}<circle r="${n(R * 0.13)}" fill="color-mix(in srgb, ${color} 22%, var(--mvhr-equipment))" stroke="${color}" stroke-width="2"/></g></g></g>`;
}
function houseMarkup(h) {
  if (h.shape !== "pentagon") return `<rect class="node" data-node="house" x="${n(h.x)}" y="${n(h.y)}" width="${n(h.w)}" height="${n(h.h)}" rx="14"/>`;
  const { x, y, w } = h;
  const apexY = y - h.roofH;
  const body = `M${n(x)} ${n(y + h.h)} L${n(x)} ${n(y)} L${n(x + w / 2)} ${n(apexY)} L${n(x + w)} ${n(y)} L${n(x + w)} ${n(y + h.h)} Z`;
  const roofAt = (px) => y - h.roofH * (1 - Math.abs(px - (x + w / 2)) / (w / 2));
  const c1 = x + w * 0.7;
  const c2 = c1 + 12;
  const ct = apexY + h.roofH * 0.25;
  const chimney = `M${n(c1)} ${n(roofAt(c1))} L${n(c1)} ${n(ct)} L${n(c2)} ${n(ct)} L${n(c2)} ${n(roofAt(c2))}`;
  return `<path class="node" data-node="house" d="${body}"/><path class="chimney" d="${chimney}"/>`;
}
function renderSvg(L, uid, model, opts = {}) {
  const parts = [];
  const N = L.nodes;
  if (N.outside) parts.push(`<rect class="node outside" data-node="outside" x="${n(N.outside.x)}" y="${n(N.outside.y)}" width="${n(N.outside.w)}" height="${n(N.outside.h)}" rx="14"/>`);
  parts.push(`<rect class="node" data-node="mvhr" x="${n(N.mvhr.x)}" y="${n(N.mvhr.y)}" width="${n(N.mvhr.w)}" height="${n(N.mvhr.h)}" rx="14"/>`);
  if (N.coil) parts.push(`<rect class="node" data-node="coil" x="${n(N.coil.x)}" y="${n(N.coil.y)}" width="${n(N.coil.w)}" height="${n(N.coil.h)}" rx="14"/>`);
  parts.push(houseMarkup(N.house));
  if (L.exchanger) parts.push(exchangerMarkup(L.exchanger));
  if (L.divider) parts.push(`<line class="divider" x1="${n(L.divider.x1)}" y1="${n(L.divider.y)}" x2="${n(L.divider.x2)}" y2="${n(L.divider.y)}"/>`);
  if (L.grid && L.grid.divider) parts.push(`<line class="divider" x1="${n(L.grid.divider.x)}" y1="${n(L.grid.divider.y1)}" x2="${n(L.grid.divider.x)}" y2="${n(L.grid.divider.y2)}"/>`);
  if (N.coil && L.grid && L.grid.serp) parts.push(hairpin(L.grid.serp, model.coil));
  const bypassState = model.bypass;
  const waterMoving = model.coil === "heating" || model.coil === "cooling";
  for (const e of L.edges) {
    const dashed = e.kind === "bypass" && bypassState !== "open";
    const moving = e.kind !== "water" || waterMoving;
    parts.push(`<g class="edge ${e.kind}${dashed ? " closed" : ""}${moving ? " moving" : ""}" data-edge="${e.id}" data-from="${e.from}" data-to="${e.to}" data-kind="${e.kind}" stroke="${cv(e.color)}" fill="${cv(e.color)}"><path class="route" d="${routePath(e.points, 14)}"/>` + (dashed ? "" : e.arrows.map((a) => arrowHead(a, travelFor(e, a))).join("")) + `</g>`);
  }
  for (const c of L.collars) parts.push(`<rect class="collar" data-port="${c.port}" x="${n(c.x)}" y="${n(c.y)}" width="${n(c.w)}" height="${n(c.h)}" rx="2"/>`);
  for (const t of L.tees) parts.push(`<circle class="tee" cx="${n(t.x)}" cy="${n(t.y)}" r="4.5"/>`);
  if (L.bypass && L.bypass.stem) {
    const s = L.bypass.stem;
    parts.push(`<line class="stem" x1="${n(s.x)}" y1="${n(s.y1)}" x2="${n(s.x)}" y2="${n(s.y2)}"/><circle class="knot" cx="${n(s.x)}" cy="${n(s.y2)}" r="6"/>`);
  }
  for (const ic of L.icons) {
    const color = ic.color ? cv(ic.color) : ic.type === "outdoor" ? cv("intake") : ic.type === "wind" ? cv("exhaust") : cv("text");
    if (ic.type === "fan") parts.push(fanMarkup(ic, color, opts.motion));
    else parts.push(iconGroup(ic.type, n(ic.x), n(ic.y), ic.size, color, 2));
  }
  return `<svg class="diagram-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${uid}-title" width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" data-mode="${L.mode}"><title id="${uid}-title">Air flow diagram: outdoor air to MVHR${N.coil ? ", air conditioning coil" : ""} and house; extract air back to MVHR and out as exhaust.</title>` + parts.join("") + `</svg>`;
}
var COLOR = {
  intake: "intake",
  exhaust: "exhaust",
  extract: "extract",
  supply: "supply",
  secondary: "secondary_text",
  pill: "pill",
  water_flow: "water_flow",
  water_return: "water_return",
  bypass: "bypass"
};
function metricAttrs(model, key, label) {
  const r = model.readings[key];
  const ent = r && r.entity;
  if (!ent) return null;
  return `data-entity="${esc(ent)}" data-metric="${key}" aria-label="${esc(label)}: more info"`;
}
function lineHtml(ln, model, labelText) {
  const color = ln.color ? cv(COLOR[ln.color] || ln.color) : cv("text");
  const style = `height:${ln.h}px;font-size:${ln.size}px;font-weight:${ln.weight || 400}`;
  let inner;
  if (ln.boxed) {
    const txt = ln.metric ? cv("text") : color;
    inner = `<span class="box" style="border-color:${color};color:${txt};width:${ln.w - 4}px;height:${ln.h}px">${esc(ln.text)}</span>`;
  } else inner = `<span style="color:${color}">${esc(ln.text)}</span>`;
  const m = ln.metric && metricAttrs(model, ln.metric, `${labelText} ${ln.text}`);
  if (m) return `<button type="button" class="ln metric" ${m} style="${style}">${inner}</button>`;
  return `<div class="ln" style="${style}">${inner}</div>`;
}
function renderLabels(L, model) {
  const out = [];
  for (const lb of L.labels) {
    const pos = `left:${lb.x}px;top:${lb.y}px;width:${lb.w}px;height:${lb.h}px`;
    if (lb.kind === "row") {
      const m = metricAttrs(model, lb.metrics[0], `${lb.name} ${lb.value}`);
      const body = `<span class="nm" style="font-size:${lb.nameSize}px">${esc(lb.name)}</span><span class="val" style="font-size:${lb.valueSize}px">${esc(lb.value)}</span>`;
      out.push(m ? `<button type="button" class="lbl row metric" data-label="${lb.id}" ${m} style="${pos}">${body}</button>` : `<div class="lbl row" data-label="${lb.id}" style="${pos}">${body}</div>`);
      continue;
    }
    const name = lb.lines.filter((l) => !l.metric).map((l) => l.text).join(" ") || lb.id;
    const cls = lb.kind === "badge-stack" ? "lbl stack badge" : "lbl stack";
    out.push(`<div class="${cls}" data-label="${lb.id}" data-align="${lb.align}" style="${pos}">${lb.lines.map((ln) => lineHtml(ln, model, name)).join("")}</div>`);
  }
  return out.join("");
}
function renderHeader(cfg, model, features) {
  const pills = [];
  const h = model.health;
  if (features.health) {
    if (!h.connected) pills.push(["warn", "Disconnected from Home Assistant"]);
    else if (h.online === "unbound" && h.fault === "unbound") pills.push(["muted", "Status unavailable"]);
    else {
      if (h.online === "online") pills.push(["ok", "Online"]);
      else if (h.online === "offline") pills.push(["bad", "Offline"]);
      else if (h.online === "unknown") pills.push(["muted", "Online status unknown"]);
      if (h.fault === "ok") pills.push(["ok", "No faults"]);
      else if (h.fault === "fault") pills.push(["bad", h.faultEntities.length > 1 ? `${h.faultEntities.length} faults` : "Fault"]);
      else if (h.fault === "unknown") pills.push(["muted", "Fault status unknown"]);
    }
    if (model.stale) pills.push(["warn", "Stale data"]);
  }
  if (cfg.demo) pills.unshift(["demo", "Demo data"]);
  return `<div class="titles"><h2 class="title">${esc(cfg.title)}</h2>${cfg.subtitle ? `<div class="subtitle">${esc(cfg.subtitle)}</div>` : ""}</div><div class="pills" role="status">${pills.map(([k, t]) => `<span class="pill ${k}"><span class="dot" aria-hidden="true">\u25CF</span>${esc(t)}</span>`).join("")}</div>`;
}
var CONTROL_ICON = { fan_speed: "fan", bypass_mode: "bypass", bypass_threshold: "thermometer", night: "moon", holiday: "briefcase" };
function controlHtml(s) {
  const info = CONTROL_INFO[s.key];
  const dis = s.disabled || s.pending;
  const id = `${s.uid}-${s.key}`;
  let ctl;
  if (info.type === "option") {
    ctl = `<div class="seg" role="radiogroup" aria-labelledby="${id}-l">` + info.labels.map((lab) => {
      const on = s.selected === lab;
      return `<button type="button" role="radio" class="segbtn${on ? " on" : ""}" aria-checked="${on}" data-control="${s.key}" data-value="${esc(lab)}" data-focus="${s.key}:${esc(lab)}"${dis ? " disabled" : ""}>${esc(lab)}</button>`;
    }).join("") + `</div>`;
  } else if (info.type === "number") {
    ctl = `<div class="stepper" role="group" aria-labelledby="${id}-l"><button type="button" class="step" data-control="${s.key}" data-step="-1" data-focus="${s.key}:-" aria-label="Decrease ${esc(info.label)}"${dis || !s.canDec ? " disabled" : ""}>\u2212</button><output class="stepval" aria-live="off">${esc(s.display)}</output><button type="button" class="step" data-control="${s.key}" data-step="1" data-focus="${s.key}:+" aria-label="Increase ${esc(info.label)}"${dis || !s.canInc ? " disabled" : ""}>+</button></div>`;
  } else {
    const on = s.selected === "on";
    const known = s.selected === "on" || s.selected === "off";
    ctl = `<button type="button" role="switch" class="switch${on ? " on" : ""}${known ? "" : " unknown"}" aria-checked="${on}" aria-labelledby="${id}-l" data-control="${s.key}" data-value="${on ? "off" : "on"}" data-focus="${s.key}:sw"${dis ? " disabled" : ""}><span class="knob" aria-hidden="true"></span></button>`;
  }
  const note = s.pending ? "Sending\u2026" : s.error || s.reason || "";
  return `<div class="ctl${s.pending ? " pending" : ""}${s.error ? " error" : ""}" data-ctl="${s.key}" aria-busy="${!!s.pending}"><span class="ctl-ic" aria-hidden="true">${iconSvg(CONTROL_ICON[s.key], 22)}</span><div class="ctl-body"><span class="ctl-l" id="${id}-l">${esc(info.label)}</span>${ctl}` + (note ? `<span class="ctl-note" id="${id}-n"${s.error ? ' role="alert"' : ""}>${esc(note)}</span>` : "") + `</div></div>`;
}
function renderControls(states) {
  return states.map(controlHtml).join("");
}
function renderRuntimes(cfg, model, metricVisible2) {
  const items = [];
  for (const [k, lab] of [["filter_runtime", "Filter runtime"], ["unit_runtime", "Unit runtime"]]) {
    if (!metricVisible2(cfg, k)) continue;
    const t = model.text[k];
    if (t === null || t === void 0) continue;
    const label = cfg.bindings[k] && cfg.bindings[k].label || lab;
    const m = metricAttrs(model, k, `${label} ${t}`);
    const body = `<span class="nm">${esc(label)}</span> <span class="val">${esc(t)}</span>`;
    items.push(m ? `<button type="button" class="rt metric" ${m}>${body}</button>` : `<span class="rt">${body}</span>`);
  }
  return items.join(`<span class="sep" aria-hidden="true">|</span>`);
}
function navCurrent(item, pathname) {
  if (item.current) return true;
  if (!item.path || item.external) return false;
  return pathname === item.path || pathname === item.path.replace(/\/$/, "");
}
function renderNav(items, visibleCount, moreOpen, pathname, uid) {
  const link = (it, i, inMenu) => {
    const cur = navCurrent(it, pathname);
    const ext = it.external ? ` target="_blank" rel="noopener noreferrer"` : "";
    return `<a class="${inMenu ? "menu-item" : "nav-item"}${cur ? " current" : ""}" href="${esc(it.path)}" data-nav="${i}"${ext}${cur ? ' aria-current="page"' : ""}>${iconSvg(it.icon || "link", 22)}<span>${esc(it.label)}</span></a>`;
  };
  const shown = items.slice(0, visibleCount);
  const rest = items.slice(visibleCount);
  let html = shown.map((it, i) => link(it, i, false)).join("");
  if (rest.length) {
    html += `<div class="more-wrap"><button type="button" class="nav-item more" aria-expanded="${moreOpen}" aria-controls="${uid}-more" data-focus="nav:more">${iconSvg("more", 22)}<span>More</span></button><div class="menu" id="${uid}-more"${moreOpen ? "" : " hidden"}>${rest.map((it, j) => link(it, visibleCount + j, true)).join("")}</div></div>`;
  }
  return html;
}

// src/actions.js
var lc2 = (s) => String(s).trim().toLowerCase();
var ERROR_MS = 6e3;
function readbackSource(cfg, key) {
  const ad = cfg.controls[key].adapter;
  if (ad && ad.readback && ad.readback.entity) return { entity: ad.readback.entity, attribute: ad.readback.attribute || null };
  const bindKey = { fan_speed: "speed_state", bypass_mode: "bypass_mode", bypass_threshold: "bypass_threshold", night: "night_state", holiday: "holiday_state" }[key];
  const b = cfg.bindings[bindKey];
  if (b && b.entity) return { entity: b.entity, attribute: b.attribute || null };
  if (ad && ad.entity) return { entity: ad.entity, attribute: null };
  return null;
}
function readbackValue(hass, src) {
  if (!src || !hass || !hass.states) return void 0;
  const so = hass.states[src.entity];
  if (!so) return void 0;
  return src.attribute ? (so.attributes || {})[src.attribute] : so.state;
}
function buildCall(cfg, key, value) {
  const ad = cfg.controls[key].adapter;
  if (!ad) throw new Error("Not mapped");
  const info = CONTROL_INFO[key];
  if (ad.kind === "script") {
    let v = value;
    if (info.type === "option") v = ad.options && ad.options[value] !== void 0 ? ad.options[value] : value;
    if (info.type === "boolean") v = ad.options ? ad.options[value] : value;
    const data = {};
    for (const [k, d] of Object.entries(ad.data || {})) data[k] = d === "$value" ? v : typeof d === "string" ? d.split("$value").join(String(v)) : d;
    const [domain2, service] = ad.action.split(".");
    return { domain: domain2, service, data, expect: v };
  }
  const domain = ad.entity.split(".")[0];
  const target = { entity_id: ad.entity };
  if (ad.kind === "select") {
    const option = ad.options && ad.options[value] !== void 0 ? ad.options[value] : value;
    return { domain, service: "select_option", data: { ...target, option }, expect: option };
  }
  if (ad.kind === "number") return { domain, service: "set_value", data: { ...target, value }, expect: value };
  if (ad.kind === "switch") return { domain, service: value === "on" ? "turn_on" : "turn_off", data: target, expect: value };
  throw new Error(`Unsupported kind ${ad.kind}`);
}
function readbackMatches(info, expect, actual, step) {
  if (actual === void 0 || actual === null) return false;
  if (info.type === "number") {
    const a = parseNumber(actual);
    const e = Number(expect);
    return a !== null && Math.abs(a - e) <= (step || 1) / 2 + 1e-9;
  }
  if (typeof actual === "boolean") actual = actual ? "on" : "off";
  return lc2(actual) === lc2(expect);
}
function errorText(err) {
  const code = err && (err.code || err.error && err.error.code);
  const msg = String(err && (err.message || err.error && err.error.message) || err || "");
  if (code === "unauthorized" || code === 401 || /unauthori[sz]ed|forbidden|permission/i.test(msg)) return "Permission denied";
  return msg ? `Failed: ${msg.slice(0, 80)}` : "Failed";
}
var Commander = class {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = {};
    this.seq = 0;
    this.calls = 0;
  }
  get(key) {
    return this.state[key] || {};
  }
  // Dispatch once. Returns false when ignored (already pending).
  run(hass, cfg, key, value, step) {
    const cur = this.state[key];
    if (cur && cur.pending) return false;
    let call;
    try {
      call = buildCall(cfg, key, value);
    } catch (e) {
      this.setError(key, errorText(e));
      return false;
    }
    const id = ++this.seq;
    const ad = cfg.controls[key].adapter;
    const src = readbackSource(cfg, key);
    const st = { pending: true, error: null, expect: call.expect, id, src, step, resolved: false, confirmed: false };
    this.state[key] = st;
    st.timer = setTimeout(() => {
      if (this.state[key] !== st || !st.pending) return;
      this.setError(key, "No confirmation from the unit", { late: true, expect: st.expect, src: st.src, step: st.step });
    }, ad.timeout_ms || 1e4);
    this.onChange(key);
    this.calls++;
    let p;
    try {
      p = Promise.resolve(hass.callService(call.domain, call.service, call.data));
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(() => {
      if (this.state[key] !== st) return;
      st.resolved = true;
      this.check(hass, cfg, key);
    }, (err) => {
      if (this.state[key] !== st) return;
      clearTimeout(st.timer);
      this.setError(key, errorText(err));
    });
    return true;
  }
  // Called on every relevant hass update. Confirms pending commands whose readback matches.
  check(hass, cfg, key) {
    const keys = key ? [key] : Object.keys(this.state);
    for (const k of keys) {
      const st = this.state[k];
      if (st && st.late && readbackMatches(CONTROL_INFO[k], st.expect, readbackValue(hass, st.src), st.step)) {
        clearTimeout(st.timer);
        this.state[k] = {};
        this.onChange(k);
        continue;
      }
      if (!st || !st.pending) continue;
      const actual = readbackValue(hass, st.src);
      if (readbackMatches(CONTROL_INFO[k], st.expect, actual, st.step)) {
        st.confirmed = true;
        if (st.resolved) {
          clearTimeout(st.timer);
          this.state[k] = {};
          this.onChange(k);
        }
      }
    }
  }
  // Errors are transient notices: they clear themselves after ERROR_MS.
  setError(key, error, extra = {}) {
    const st = { error, ...extra };
    st.timer = setTimeout(() => {
      if (this.state[key] !== st) return;
      this.state[key] = {};
      this.onChange(key);
    }, ERROR_MS);
    this.state[key] = st;
    this.onChange(key);
  }
  clearError(key) {
    const st = this.state[key];
    if (st && st.error && !st.pending) {
      clearTimeout(st.timer);
      this.state[key] = {};
      return true;
    }
    return false;
  }
  dispose() {
    for (const st of Object.values(this.state)) if (st.timer) clearTimeout(st.timer);
    this.state = {};
  }
};

// src/fixture.js
var REFERENCE = {
  outdoor_temperature: 13,
  exhaust_temperature: 15.9,
  supply_temperature: 21.9,
  extract_temperature: 22,
  extract_humidity: 46,
  indoor_temperature: 22.3,
  indoor_humidity: 46,
  recovery_efficiency: 98,
  supply_fan_percent: 18,
  extract_fan_percent: 18,
  speed_state: "1",
  bypass_position: "open",
  bypass_mode: "Auto",
  bypass_threshold: 24,
  coil_air_in: 21.9,
  coil_air_out: 21.8,
  coil_air_delta: -0.1,
  water_flow_temperature: 19.3,
  water_return_temperature: 21.1,
  buffer_temperature: 16.5,
  coil_status: "idle",
  online: true,
  fault: false,
  filter_runtime: 2957,
  unit_runtime: 29676,
  night_state: false,
  holiday_state: false
};
var DOMAIN = {
  bypass_position: "binary_sensor",
  online: "binary_sensor",
  fault: "binary_sensor",
  bypass_mode: "select",
  speed_state: "select",
  bypass_threshold: "number",
  night_state: "switch",
  holiday_state: "switch"
};
var UNIT = {
  temperature: "\xB0C",
  percent: "%",
  runtime: "h"
};
var KIND = {
  extract_humidity: "percent",
  indoor_humidity: "percent",
  recovery_efficiency: "percent",
  supply_fan_percent: "percent",
  extract_fan_percent: "percent",
  filter_runtime: "runtime",
  unit_runtime: "runtime"
};
var TEXTUAL = /* @__PURE__ */ new Set(["speed_state", "bypass_position", "bypass_mode", "coil_status", "online", "fault", "night_state", "holiday_state"]);
var demoEntity = (key) => `${DOMAIN[key] || "sensor"}.demo_mvhr_${key}`;
function demoBindings() {
  const b = {};
  for (const k of BINDING_KEYS) b[k] = { entity: demoEntity(k), attribute: null, input_unit: null, precision: null, label: null };
  return b;
}
function demoHass(overrides = {}, base = REFERENCE) {
  const states = {};
  const ts = "2026-01-01T00:00:00+00:00";
  for (const k of BINDING_KEYS) {
    const v = k in overrides ? overrides[k] : base[k];
    const id = demoEntity(k);
    let state;
    if (typeof v === "boolean") state = v ? "on" : "off";
    else if (k === "bypass_position") state = v === "open" ? "on" : v === "closed" ? "off" : String(v);
    else state = v === null || v === void 0 ? "unavailable" : String(v);
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
    config: { unit_system: { temperature: "\xB0C" } },
    locale: { language: "en" },
    language: "en",
    user: { is_admin: false },
    callService: () => Promise.reject(new Error("Demo mode does not send commands."))
  };
}

// src/discovery.js
var MAKER = "Nuaire";
var PREFIX = "mrxbox_";
var COIL_KEYS = ["coil_air_in", "coil_air_out", "water_flow_temperature", "water_return_temperature", "buffer_temperature", "coil_status"];
function isUnitEntity(hass, e) {
  const d = e.device_id && hass.devices && hass.devices[e.device_id];
  if (d && d.manufacturer === MAKER) return true;
  return String(e.entity_id || "").split(".")[1]?.startsWith(PREFIX) || false;
}
function findDevices(hass) {
  const out = /* @__PURE__ */ new Map();
  for (const e of Object.values(hass && hass.entities || {})) {
    if (!e.device_id || !isUnitEntity(hass, e)) continue;
    const d = hass.devices && hass.devices[e.device_id];
    out.set(e.device_id, { id: e.device_id, name: d && (d.name_by_user || d.name) || e.device_id });
  }
  return [...out.values()];
}
function unitEntities(hass, deviceId) {
  const ents = Object.values(hass && hass.entities || {}).filter((e) => isUnitEntity(hass, e) && (!deviceId || e.device_id === deviceId));
  return ents.map((e) => e.entity_id);
}
function detectUnit(hass, deviceId) {
  const ids = unitEntities(hass, deviceId);
  const unit = {};
  const match = (domain, suffix) => ids.find((id) => id.startsWith(domain + ".") && (id.endsWith("_" + suffix) || id === `${domain}.${suffix}`));
  for (const [role, [domain, suffix]] of Object.entries(LEGACY_ROLES)) {
    const id = match(domain, suffix);
    if (id) unit[role] = id;
  }
  for (const f of LEGACY_FAULTS) {
    const id = match("binary_sensor", f);
    if (id) unit[`fault_${f.replace(/_fault$/, "")}`] = id;
  }
  return { unit, found: ids.length };
}
function proposeConfig(hass, base, deviceId) {
  const { unit, found } = detectUnit(hass, deviceId);
  if (!found) return { config: null, found: 0, bound: 0 };
  const migrated = normalizeConfig(migrateLegacy({ unit, show_coil: false }));
  const exists = (id) => !!(id && hass.states && hass.states[id]);
  let bound = 0;
  const bindings = { ...base.bindings };
  for (const [k, b] of Object.entries(migrated.bindings)) {
    if (!b) continue;
    if (k === "fault") {
      const all = [b.entity, ...b.extra_entities || []].filter(exists);
      if (!all.length) continue;
      bindings.fault = { ...b, entity: all[0], extra_entities: all.slice(1) };
      bound++;
      continue;
    }
    if (exists(b.entity)) {
      bindings[k] = b;
      bound++;
    }
  }
  const controls = { ...base.controls };
  for (const [k, c] of Object.entries(migrated.controls)) {
    if (c.adapter && exists(c.adapter.entity)) controls[k] = { ...base.controls[k], adapter: c.adapter };
  }
  const state_mapping = { ...base.state_mapping };
  for (const k of ["online", "fault", "bypass_position"]) state_mapping[k] = migrated.state_mapping[k];
  const features = { ...base.features };
  const names = {};
  if (!COIL_KEYS.some((k) => bindings[k])) {
    features.aircon = false;
    features.water_circuit = false;
    if (base.title === "MVHR & Air Conditioning") names.title = "MVHR";
    if (base.subtitle === "Live airflow & climate") names.subtitle = "Live airflow";
  }
  return {
    config: { ...base, ...names, device: deviceId || base.device, demo: false, features, bindings, controls, state_mapping },
    found,
    bound
  };
}

// src/card.js
var instances = 0;
var NAV_ITEM_MIN = 76;
var lc3 = (s) => String(s).trim().toLowerCase();
var mix = (v, pct) => `color-mix(in srgb, var(--mvhr-${v}) ${pct}%, transparent)`;
var STYLE = `
:host { display: block; }
/* Panel view: fill the box HA gives the card and scroll inside it, so HA's edit bar below stays visible. */
:host([panel]) { height: 100%; }
:host([panel]) ha-card { height: 100%; box-sizing: border-box; overflow: auto; }
ha-card {
  display: block; background: var(--mvhr-background); color: var(--mvhr-text); border-radius: 14px;
  border: 1px solid ${mix("border", 28)}; box-shadow: none; overflow: hidden;
  font-family: ${FONT}; font-variant-numeric: tabular-nums; font-size: 16px; line-height: 1.25;
}
.wrap {
  box-sizing: border-box; margin: 0 auto; display: flex; flex-direction: column; gap: 16px;
  padding: 16px max(16px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left));
}
.wrap[data-density="compact"] { gap: 8px; padding-top: 12px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px 16px; flex-wrap: wrap; }
.title { margin: 0; font-size: 20px; font-weight: 600; line-height: 1.25; }
.subtitle { margin-top: 4px; font-size: 14px; color: var(--mvhr-secondary_text); }
.pills { display: flex; gap: 8px; flex-wrap: wrap; }
.pill {
  display: inline-flex; align-items: center; gap: 8px; min-height: 32px; padding: 0 12px; box-sizing: border-box;
  border-radius: 999px; border: 1px solid ${mix("border", 30)}; font-size: 14px; white-space: nowrap;
}
.pill .dot { font-size: 10px; line-height: 1; }
.editbar { order: -1; display: flex; justify-content: flex-end; }
.editbtn {
  font: inherit; font-size: 14px; min-height: 40px; padding: 0 16px; border-radius: 8px; cursor: pointer; border: 0;
  background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff);
}
.pill.ok .dot { color: var(--mvhr-healthy); }
.pill.bad { border-color: var(--mvhr-extract); } .pill.bad .dot { color: var(--mvhr-extract); }
.pill.warn { border-color: var(--mvhr-supply); } .pill.warn .dot { color: var(--mvhr-supply); }
.pill.muted .dot { color: var(--mvhr-secondary_text); }
.pill.demo { border-color: var(--mvhr-bypass); } .pill.demo .dot { color: var(--mvhr-bypass); }

.diagram { position: relative; width: 100%; }
.diagram.overwide { overflow-x: auto; }
.stage { position: relative; }
.diagram-svg { position: absolute; left: 0; top: 0; display: block; overflow: visible; }
.labels { position: absolute; inset: 0; }
.node { fill: var(--mvhr-equipment); stroke: ${mix("border", 50)}; stroke-width: 2; }
.node.outside { fill: none; stroke: ${mix("border", 30)}; }
.chimney { fill: none; stroke: ${mix("border", 50)}; stroke-width: 2; }
.lobe, .diamond { fill: none; stroke-width: 3; stroke-linejoin: round; stroke-linecap: round; }
.plate { fill: none; stroke: ${mix("border", 55)}; stroke-width: 2; stroke-linejoin: round; }
.thin { stroke: ${mix("border", 40)}; stroke-width: 1; }
.divider { stroke: ${mix("border", 25)}; stroke-width: 1; }
.serp-frame { fill: ${mix("border", 6)}; stroke: ${mix("border", 45)}; stroke-width: 1.5; }
.serp { fill: none; stroke: ${mix("border", 60)}; stroke-width: 3; stroke-linecap: round; }
[data-part="coil-tube"][data-state="heating"] .serp { stroke: var(--mvhr-extract); }
[data-part="coil-tube"][data-state="cooling"] .serp { stroke: var(--mvhr-intake); }
.route { fill: none; stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; }
.edge.water .route { stroke-width: 3.5; }
.edge.closed .route { stroke-dasharray: 8 7; stroke-width: 3; }
.arrow { stroke: none; }
.collar { fill: color-mix(in srgb, var(--mvhr-border) 22%, var(--mvhr-background)); stroke: ${mix("border", 65)}; stroke-width: 1.5; }
.tee { fill: var(--mvhr-background); stroke: ${mix("border", 70)}; stroke-width: 2; }
.knot { fill: var(--mvhr-bypass); stroke: var(--mvhr-background); stroke-width: 2; }
.stem { stroke: var(--mvhr-bypass); stroke-width: 2; stroke-dasharray: 3 4; }
.wrap[data-motion="on"] .spin { animation: mvhr-spin 3s linear infinite; }
@keyframes mvhr-spin { to { transform: rotate(360deg); } }
.wrap[data-motion="on"] .edge.moving .flow { animation: mvhr-flow 2.4s linear infinite; }
@keyframes mvhr-flow {
  0% { transform: translate(var(--fx0), var(--fy0)); opacity: 0; }
  20% { opacity: 1; } 80% { opacity: 1; }
  100% { transform: translate(var(--fx1), var(--fy1)); opacity: 0; }
}

.lbl { position: absolute; box-sizing: border-box; display: flex; flex-direction: column; justify-content: center; }
.lbl[data-align="center"] { align-items: center; text-align: center; }
.lbl[data-align="left"] { align-items: flex-start; }
.lbl[data-align="right"] { align-items: flex-end; text-align: right; }
.lbl.badge { border: 1.5px solid var(--mvhr-bypass); border-radius: 10px; background: var(--mvhr-background); }
.ln { display: flex; align-items: center; white-space: nowrap; line-height: 1.25; }
.box {
  display: inline-flex; align-items: center; justify-content: center; box-sizing: border-box;
  border: 1.5px solid; border-radius: 8px; background: var(--mvhr-background);
}
.lbl.row { flex-direction: row; justify-content: space-between; align-items: center; gap: 16px; }
.lbl.row .nm { color: var(--mvhr-secondary_text); }
.lbl.row .val { font-weight: 600; }
button.metric, button.ln.metric {
  appearance: none; background: none; border: 0; margin: 0; padding: 0; color: inherit; font: inherit;
  cursor: pointer; border-radius: 6px; text-align: inherit;
}
button.ln.metric { min-width: 44px; justify-content: center; }
button.metric:hover { background: ${mix("border", 12)}; }
:focus-visible { outline: 2px solid var(--mvhr-intake); outline-offset: 2px; }
.wrap[data-demo] button.metric { cursor: default; }

.onboard { padding: 16px; border: 1px dashed ${mix("border", 40)}; border-radius: 12px; color: var(--mvhr-secondary_text); }
.onboard strong { color: var(--mvhr-text); font-weight: 600; }
.failure { padding: 16px; border: 1px solid var(--mvhr-extract); border-radius: 12px; }

.controls {
  display: flex; flex-wrap: wrap; gap: 1px; background: ${mix("border", 25)};
  border: 1px solid ${mix("border", 28)}; border-radius: 14px; overflow: hidden;
}
.ctl { position: relative; flex: 1 1 auto; display: flex; align-items: center; gap: 12px; padding: 12px 16px; background: var(--mvhr-background); min-width: 0; }
.wrap[data-mode="mobile"] .controls { flex-direction: column; }
.wrap[data-mode="compact"] .ctl { flex-basis: 280px; }
.ctl-ic { display: flex; color: var(--mvhr-secondary_text); flex: none; }
.ctl-body { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; min-width: 0; flex: 1 1 auto; }
.ctl-l { white-space: nowrap; }
.wrap[data-mode="mobile"] .ctl-body { justify-content: space-between; }
.ctl-note {
  position: absolute; right: 8px; bottom: 2px; max-width: calc(100% - 16px); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; font-size: 11px; line-height: 1.3; color: var(--mvhr-secondary_text); pointer-events: none;
}
.ctl.pending .ctl-note { color: var(--mvhr-intake); }
.ctl.error .ctl-note { color: var(--mvhr-extract); }
.seg { display: inline-flex; border: 1px solid ${mix("border", 40)}; border-radius: 10px; overflow: hidden; }
.segbtn, .step {
  appearance: none; min-width: 48px; min-height: 44px; padding: 0 12px; margin: 0; border: 0; background: transparent;
  color: var(--mvhr-text); font: inherit; font-weight: 600; cursor: pointer;
}
.segbtn + .segbtn { border-left: 1px solid ${mix("border", 40)}; }
.segbtn.on { background: var(--mvhr-intake); color: var(--mvhr-background); }
.segbtn:disabled, .step:disabled, .switch:disabled { cursor: not-allowed; }
.segbtn:disabled:not(.on), .step:disabled { color: var(--mvhr-secondary_text); }
.stepper { display: inline-flex; align-items: center; border: 1px solid ${mix("border", 40)}; border-radius: 10px; }
.step { min-width: 44px; padding: 0; font-size: 20px; }
.stepval { min-width: 64px; text-align: center; font-weight: 600; }
.switch { position: relative; width: 60px; height: 44px; padding: 0; margin: 0; border: 0; background: transparent; cursor: pointer; flex: none; }
.switch::before {
  content: ""; position: absolute; left: 4px; right: 4px; top: 10px; height: 24px; border-radius: 12px;
  background: ${mix("border", 30)}; box-sizing: border-box;
}
.switch.on::before { background: var(--mvhr-intake); }
.switch.unknown::before { background: transparent; border: 1.5px dashed ${mix("border", 60)}; }
.knob { position: absolute; top: 13px; left: 7px; width: 18px; height: 18px; border-radius: 50%; background: var(--mvhr-text); }
.switch.on .knob { left: 35px; background: var(--mvhr-background); }
.switch.unknown .knob { left: 21px; background: var(--mvhr-secondary_text); }
.wrap[data-motion="on"] .knob { transition: left 0.15s; }

.runtimes { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 4px 12px; font-size: 14px; color: var(--mvhr-secondary_text); }
.runtimes .val { color: var(--mvhr-text); font-weight: 600; }
.runtimes .sep { color: ${mix("border", 50)}; }
.rt.metric { min-height: 44px; min-width: 44px; }

nav.nav { display: flex; border: 1px solid ${mix("border", 28)}; border-radius: 14px; }
.nav-item {
  appearance: none; flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 4px; min-height: 56px; padding: 8px 4px; box-sizing: border-box; margin: 0; background: transparent;
  border: 0; border-bottom: 3px solid transparent; color: var(--mvhr-secondary_text); font: inherit; font-size: 14px;
  text-decoration: none; cursor: pointer;
}
.nav-item > span { max-width: 100%; text-align: center; overflow-wrap: anywhere; line-height: 1.2; }
.nav > * + * { border-left: 1px solid ${mix("border", 25)}; }
.nav > :first-child { border-radius: 13px 0 0 13px; }
.nav > :last-child, .more-wrap .nav-item { border-radius: 0 13px 13px 0; }
.nav-item:hover { color: var(--mvhr-text); }
.nav-item.current { background: ${mix("intake", 16)}; color: var(--mvhr-text); border-bottom-color: var(--mvhr-intake); }
.more-wrap { position: relative; flex: 1 1 0; min-width: 0; display: flex; }
.more-wrap .nav-item { width: 100%; }
.menu {
  position: absolute; right: 0; bottom: calc(100% + 4px); z-index: 2; min-width: 220px; padding: 4px;
  background: var(--mvhr-equipment); border: 1px solid ${mix("border", 40)}; border-radius: 10px;
}
.menu[hidden] { display: none; }
.menu-item { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 8px; color: var(--mvhr-text); text-decoration: none; }
.menu-item.current { background: ${mix("intake", 16)}; }
.menu-item:hover { background: ${mix("border", 12)}; }
@media (prefers-reduced-motion: reduce) {
  .wrap:not([data-motion-forced]) .spin, .wrap:not([data-motion-forced]) .flow { animation: none !important; }
  .wrap .knob { transition: none !important; }
}
`;
function makeMeasure() {
  const cache = /* @__PURE__ */ new Map();
  let ctx = null;
  try {
    ctx = document.createElement("canvas").getContext("2d");
  } catch {
    ctx = null;
  }
  const m = (text, size, weight = 400) => {
    const k = `${weight}|${size}|${text}`;
    let v = cache.get(k);
    if (v === void 0) {
      if (ctx) {
        ctx.font = `${weight} ${size}px ${FONT}`;
        v = Math.ceil(ctx.measureText(String(text)).width);
        if (!Number.isFinite(v) || v <= 0) v = String(text).length ? heuristicMeasure(text, size, weight) : 0;
      } else v = heuristicMeasure(text, size, weight);
      cache.set(k, v);
    }
    return v;
  };
  m.clear = () => cache.clear();
  return m;
}
function decimals(step) {
  const s = String(step);
  return s.includes(".") ? s.split(".")[1].length : 0;
}
var MvhrAirflowCard = class extends HTMLElement {
  static getConfigElement() {
    return document.createElement(`${ALIAS_TYPE}-editor`);
  }
  // A proposal only. Found bridge (mrxbox_*) entities are bound; nothing else is guessed. With no
  // bridge entities the picker preview and the new card show demo values until bindings are set.
  static getStubConfig(hass) {
    try {
      const devices = findDevices(hass);
      if (!devices.length) return { demo: true };
      const { config } = proposeConfig(hass, defaultConfig(), devices[0].id);
      if (!config) return { demo: true };
      const out = { title: config.title, subtitle: config.subtitle, device: config.device, features: config.features, bindings: {}, controls: {}, state_mapping: config.state_mapping };
      for (const [k, b] of Object.entries(config.bindings)) if (b) out.bindings[k] = b;
      for (const [k, c] of Object.entries(config.controls)) if (c.adapter) out.controls[k] = c;
      return out;
    } catch {
      return { demo: true };
    }
  }
  constructor() {
    super();
    this._uid = `mvhr${++instances}`;
    this.attachShadow({ mode: "open" });
    this._cfg = null;
    this._hass = null;
    this._preview = false;
    this._sig = null;
    this._raf = 0;
    this._html = {};
    this._local = {};
    this._debounce = {};
    this._moreOpen = false;
    this._width = 0;
    this._cardWidth = 0;
    this._measure = makeMeasure();
    this._commander = new Commander(() => this._schedule());
    this._onClick = (e) => this._click(e);
    this._onKey = (e) => this._key(e);
    this._onDocClick = (e) => {
      if (this._moreOpen && !e.composedPath().some((n2) => n2 && n2.classList && n2.classList.contains("more-wrap") && this.shadowRoot.contains(n2))) {
        this._moreOpen = false;
        this._schedule();
      }
    };
    this._onLocation = () => {
      this._moreOpen = false;
      this._schedule();
    };
    this.layoutModel = null;
  }
  setConfig(config) {
    const cfg = normalizeConfig(config);
    this._raw = config;
    this._cfg = cfg;
    this._demoHass = cfg.demo ? demoHass() : null;
    this._sig = null;
    this._html = {};
    this._commander.dispose();
    for (const t of Object.values(this._debounce)) clearTimeout(t);
    this._debounce = {};
    this._local = {};
    this._setupFreshness();
    this._schedule();
  }
  set hass(h) {
    this._hass = h;
    if (!this._cfg) return;
    const sig = this._signature();
    if (this._sig && sig.length === this._sig.length && sig.every((v, i) => v === this._sig[i])) return;
    this._sig = sig;
    this._commander.check(this._effHass(), this._effCfg());
    this._schedule();
  }
  get hass() {
    return this._hass;
  }
  // HA sets layout = "panel" on the card of a panel view.
  set layout(v) {
    this._layout = v;
    this.toggleAttribute("panel", v === "panel");
  }
  get layout() {
    return this._layout;
  }
  set isPanel(v) {
    this.toggleAttribute("panel", !!v);
  }
  // HA before 2024.x
  set preview(v) {
    this._preview = !!v;
    this._schedule();
  }
  get preview() {
    return this._preview;
  }
  // HA's edit wrapper around this card, if any. In a panel view its Edit bar can end up out of
  // sight, so the card then shows its own Edit button that fires the same event.
  _cardOptions() {
    let n2 = this;
    for (let i = 0; n2 && i < 6; i++) {
      if (n2.localName === "hui-card-options") return n2;
      n2 = n2.parentElement || n2.getRootNode && n2.getRootNode().host;
    }
    return null;
  }
  // The config the model is built from: demo swaps in the fixture's bindings.
  _effCfg() {
    const c = this._cfg;
    if (!c.demo) return c;
    if (!this._demoCfg || this._demoCfgFor !== c) {
      this._demoCfg = { ...c, bindings: demoBindings() };
      this._demoCfgFor = c;
    }
    return this._demoCfg;
  }
  _effHass() {
    return this._cfg && this._cfg.demo ? this._demoHass : this._hass;
  }
  _signature() {
    const h = this._effHass();
    if (!h) return ["nohass"];
    const ids = watchedEntities(this._effCfg());
    const s = ids.map((id) => h.states ? h.states[id] : void 0);
    s.push(h.connected, h.locale && h.locale.language, h.language, h.config && h.config.unit_system && h.config.unit_system.temperature);
    return s;
  }
  connectedCallback() {
    if (!this.shadowRoot.querySelector(".wrap")) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="wrap"><div class="head" data-sec="head"></div><div class="body" data-sec="body" style="display:contents"></div></div></ha-card>`;
    }
    this._wrap = this.shadowRoot.querySelector(".wrap");
    this._wrap.addEventListener("click", this._onClick);
    this._wrap.addEventListener("keydown", this._onKey);
    window.addEventListener("location-changed", this._onLocation);
    window.addEventListener("popstate", this._onLocation);
    this._ro = new ResizeObserver(() => this._schedule());
    this._ro.observe(this);
    this._observed = null;
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (!this.isConnected) return;
        this._measure.clear();
        this._html = {};
        this._schedule();
      }).catch(() => {
      });
    }
    this._setupFreshness();
    this._schedule();
  }
  disconnectedCallback() {
    if (this._ro) this._ro.disconnect();
    this._ro = null;
    this._observed = null;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._wrap) {
      this._wrap.removeEventListener("click", this._onClick);
      this._wrap.removeEventListener("keydown", this._onKey);
    }
    window.removeEventListener("location-changed", this._onLocation);
    window.removeEventListener("popstate", this._onLocation);
    document.removeEventListener("click", this._onDocClick, true);
    if (this._fresh) clearInterval(this._fresh);
    this._fresh = 0;
    for (const t of Object.values(this._debounce)) clearTimeout(t);
    this._debounce = {};
    this._local = {};
    this._moreOpen = false;
    this._commander.dispose();
  }
  _setupFreshness() {
    if (this._fresh) clearInterval(this._fresh);
    this._fresh = 0;
    const c = this._cfg;
    if (!this.isConnected || !c || c.freshness.timestamp_policy === "disabled" || !c.freshness.max_age_seconds) return;
    this._fresh = setInterval(() => {
      this._html = { ...this._html, head: null };
      this._sig = null;
      this._schedule();
    }, 15e3);
  }
  getCardSize() {
    const h = this.offsetHeight || (this.layoutModel ? this.layoutModel.H + 260 : 0);
    return h ? Math.max(1, Math.ceil(h / 50)) : 9;
  }
  getGridOptions() {
    return { columns: "full", min_columns: 6, rows: "auto" };
  }
  _schedule() {
    if (this._raf || !this.isConnected) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = 0;
      try {
        this._render();
      } catch (e) {
        this._renderFailure(e);
      }
    });
  }
  // ---------- rendering ----------
  _section(name, html, parent, tag = "div", attrs = "") {
    let el = parent.querySelector(`:scope > [data-sec="${name}"]`);
    if (html === null) {
      if (el) el.remove();
      delete this._html[name];
      return null;
    }
    if (!el) {
      el = document.createElement(tag);
      el.dataset.sec = name;
      parent.appendChild(el);
      this._html[name] = void 0;
    }
    if (attrs) for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    if (this._html[name] !== html) {
      const active = this.shadowRoot.activeElement;
      const key = active && el.contains(active) && active.dataset ? active.dataset.focus : null;
      el.innerHTML = html;
      this._html[name] = html;
      if (key) {
        const again = el.querySelector(`[data-focus="${CSS.escape(key)}"]`);
        if (again && !again.disabled) again.focus({ preventScroll: true });
      }
    }
    return el;
  }
  _renderFailure(e) {
    if (!this._wrap) return;
    const body = this._wrap.querySelector('[data-sec="body"]');
    body.innerHTML = `<div class="failure" role="alert">Card could not be drawn: ${esc(e && e.message)}</div>`;
    this._html = {};
    console.warn("mvhr-airflow-card:", e);
  }
  _render() {
    if (!this._wrap || !this._cfg) return;
    const cfg = this._effCfg();
    const raw = this._cfg;
    const hass = this._effHass();
    const wrap = this._wrap;
    const appearance = Object.entries(raw.appearance).filter(([k]) => typeof raw.appearance[k] === "string").map(([k, v]) => `--mvhr-${k}:${v}`).join(";");
    const model = buildModel(hass, cfg);
    const pill = model.coil === "heating" ? "var(--mvhr-extract)" : model.coil === "cooling" ? "var(--mvhr-intake)" : "var(--mvhr-secondary_text)";
    const comfortable = raw.layout.width_mode === "comfortable";
    wrap.setAttribute("style", `${appearance};--mvhr-pill:${pill};max-width:${comfortable ? raw.layout.max_content_width + "px" : "none"};font-size:${16 * raw.layout.text_scale}px`);
    wrap.dataset.density = raw.layout.density;
    wrap.dataset.motion = raw.layout.motion ? "on" : "off";
    if (raw.layout.motion === "always") wrap.dataset.motionForced = "";
    else delete wrap.dataset.motionForced;
    if (raw.demo) wrap.dataset.demo = "";
    else delete wrap.dataset.demo;
    const features = effectiveFeatures(cfg);
    this._section("head", renderHeader(raw, model, features), wrap);
    const opts = this._preview ? this._cardOptions() : null;
    const panelEdit = opts && (this.hasAttribute("panel") || opts.classList.contains("panel") || opts.parentNode && opts.parentNode.host && opts.parentNode.host.localName === "hui-panel-view");
    this._section("editbar", panelEdit ? `<button type="button" class="editbtn" data-act="edit-card">Edit card</button>` : null, wrap, "div", { class: "editbar" });
    const body = wrap.querySelector('[data-sec="body"]');
    if (!raw.demo && isUnconfigured(raw)) {
      wrap.dataset.mode = "onboarding";
      for (const s of ["diagram", "controls", "runtimes", "nav"]) this._section(s, null, body);
      this._section("onboard", `<strong>Set up the MVHR card.</strong> Open the card editor and choose your unit under Setup, or turn on Demo mode to preview it with sample values.`, body, "div", { class: "onboard" });
      this.layoutModel = null;
      return;
    }
    this._section("onboard", null, body);
    let diagram = body.querySelector(':scope > [data-sec="diagram"]');
    if (!diagram) {
      diagram = document.createElement("div");
      diagram.className = "diagram";
      diagram.dataset.sec = "diagram";
      body.insertBefore(diagram, body.firstChild);
      this._html.diagram = void 0;
    }
    if (this._ro && this._observed !== diagram) {
      this._ro.observe(diagram);
      this._observed = diagram;
    }
    const width = Math.floor(diagram.clientWidth || wrap.clientWidth || 800);
    const card = this.shadowRoot.querySelector("ha-card");
    const cardWidth = Math.floor(card && card.clientWidth || width);
    const L = computeLayout(cfg, layoutInputs(cfg, model, hass, width, cardWidth, this._measure));
    this.layoutModel = L;
    wrap.dataset.mode = L.mode;
    diagram.classList.toggle("overwide", !!L.overwide);
    const dHtml = `<div class="stage" style="width:${L.W}px;height:${L.H}px">${renderSvg(L, this._uid, model, { motion: raw.layout.motion })}<div class="labels">${renderLabels(L, model)}</div></div>`;
    if (this._html.diagram !== dHtml) {
      const active = this.shadowRoot.activeElement;
      const key = active && diagram.contains(active) && active.dataset ? active.dataset.metric : null;
      diagram.innerHTML = dHtml;
      this._html.diagram = dHtml;
      if (key) {
        const again = diagram.querySelector(`[data-metric="${CSS.escape(key)}"]`);
        if (again) again.focus({ preventScroll: true });
      }
    }
    const states = this._controlStates(cfg, hass);
    this._section("controls", states.length ? renderControls(states) : null, body, "div", { class: "controls", role: "group", "aria-label": "MVHR controls" });
    const rt = features.runtimes ? renderRuntimes(cfg, model, metricVisible) : "";
    this._section("runtimes", rt ? rt : null, body, "div", { class: "runtimes" });
    const items = features.navigation ? cfg.navigation.filter((it) => it.enabled && !navPathProblem(it.path, it.external)) : [];
    if (items.length) {
      const fit = Math.max(1, Math.floor((width || 320) / NAV_ITEM_MIN));
      const visible = items.length <= fit ? items.length : Math.max(1, fit - 1);
      if (visible >= items.length) this._moreOpen = false;
      const nav = this._section("nav", renderNav(items, visible, this._moreOpen, location.pathname, this._uid), body, "nav", { class: "nav", "aria-label": "Dashboards" });
      this._navItems = items;
      if (nav) {
        if (this._moreOpen) document.addEventListener("click", this._onDocClick, true);
        else document.removeEventListener("click", this._onDocClick, true);
      }
    } else {
      this._section("nav", null, body);
      this._navItems = [];
    }
  }
  // ---------- controls ----------
  _numberInfo(cfg, hass, key) {
    const ad = cfg.controls[key].adapter;
    const src = readbackSource(cfg, key);
    const ent = ad && ad.entity && hass && hass.states && hass.states[ad.entity] || src && hass && hass.states && hass.states[src.entity] || null;
    const at = ent && ent.attributes || {};
    const min = ad && ad.min !== null && ad.min !== void 0 ? ad.min : parseNumber(at.min);
    const max = ad && ad.max !== null && ad.max !== void 0 ? ad.max : parseNumber(at.max);
    const step = ad && ad.step ? ad.step : parseNumber(at.step) || 1;
    const unit = at.unit_of_measurement || cfg.bindings.bypass_threshold && cfg.bindings.bypass_threshold.input_unit || "\xB0C";
    return { min, max, step, unit };
  }
  _disabledReason(cfg, hass, key) {
    const ad = cfg.controls[key].adapter;
    if (this._cfg.demo) return "Demo mode: commands are off";
    if (!ad) return "Not set up";
    if (cfg.read_only) return "Read-only";
    if (this._preview) return "Preview: commands are off";
    if (!hass || hass.connected === false) return "Disconnected";
    const target = ad.kind === "script" ? ad.readback.entity : ad.entity;
    const so = target && hass.states ? hass.states[target] : void 0;
    if (!so) return "Entity missing";
    if (so.state === "unavailable" || so.state === "unknown") return "Unavailable";
    return null;
  }
  _controlStates(cfg, hass) {
    const out = [];
    for (const key of CONTROL_KEYS) {
      if (!controlVisible(cfg, key)) continue;
      const info = CONTROL_INFO[key];
      const ad = cfg.controls[key].adapter;
      const cs = this._commander.get(key);
      const raw = readbackValue(hass, readbackSource(cfg, key));
      const reason = this._disabledReason(cfg, hass, key);
      const s = { uid: this._uid, key, disabled: !!reason, reason, pending: !!cs.pending, error: cs.error || null, selected: null };
      if (info.type === "option") {
        s.selected = optionLabel(cfg, key, raw);
      } else if (info.type === "boolean") {
        let v = raw;
        if (typeof v === "boolean") v = v ? "on" : "off";
        if (v !== void 0 && v !== null && ad && ad.kind === "script" && ad.options) {
          v = lc3(v) === lc3(ad.options.on) ? "on" : lc3(v) === lc3(ad.options.off) ? "off" : v;
        }
        s.selected = v === void 0 || v === null ? null : lc3(v) === "on" ? "on" : lc3(v) === "off" ? "off" : null;
      } else {
        const ni = this._numberInfo(cfg, hass, key);
        if (!s.pending && !this._debounce[key]) delete this._local[key];
        const v = key in this._local ? this._local[key] : parseNumber(raw);
        const unit = displayTempUnit(cfg, hass);
        if (v === null || v === void 0) s.display = "\u2014";
        else {
          const shown = fromCelsius(toCelsius(v, ni.unit), unit);
          const same = (ni.unit === "\xB0F" || ni.unit === "F") === (unit === "\xB0F");
          const d = same ? decimals(ni.step) : 0;
          let txt;
          try {
            txt = new Intl.NumberFormat(localeOf(cfg, hass), { minimumFractionDigits: d, maximumFractionDigits: d }).format(shown);
          } catch {
            txt = shown.toFixed(d);
          }
          s.display = `${txt.replace(/^-/, "\u2212")}${unit}`;
        }
        s.canDec = v !== null && v !== void 0 && (ni.min === null || v - ni.step >= ni.min - 1e-9);
        s.canInc = v !== null && v !== void 0 && (ni.max === null || v + ni.step <= ni.max + 1e-9);
        if (this._debounce[key] && !s.pending && !s.error) s.note = "Adjusting\u2026";
      }
      out.push(s);
    }
    for (const s of out) if (s.note && !s.disabled) s.reason = s.note;
    return out;
  }
  _command(key, value) {
    const cfg = this._effCfg();
    const hass = this._effHass();
    if (this._disabledReason(cfg, hass, key)) return;
    if (this._commander.get(key).pending) return;
    this._commander.clearError(key);
    const step = CONTROL_INFO[key].type === "number" ? this._numberInfo(cfg, hass, key).step : void 0;
    this._commander.run(hass, cfg, key, value, step);
  }
  _step(key, dir) {
    const cfg = this._effCfg();
    const hass = this._effHass();
    if (this._disabledReason(cfg, hass, key) || this._commander.get(key).pending) return;
    const ni = this._numberInfo(cfg, hass, key);
    const current = key in this._local ? this._local[key] : parseNumber(readbackValue(hass, readbackSource(cfg, key)));
    if (current === null || current === void 0) return;
    let next = current + dir * ni.step;
    if (ni.min !== null) next = Math.max(ni.min, next);
    if (ni.max !== null) next = Math.min(ni.max, next);
    next = Number(next.toFixed(Math.max(decimals(ni.step), 0) + 0));
    if (next === current) return;
    this._commander.clearError(key);
    this._local[key] = next;
    clearTimeout(this._debounce[key]);
    const ad = cfg.controls[key].adapter;
    this._debounce[key] = setTimeout(() => {
      delete this._debounce[key];
      if (!this.isConnected) return;
      const h = this._effHass();
      const c = this._effCfg();
      const target = this._local[key];
      const now = parseNumber(readbackValue(h, readbackSource(c, key)));
      if (target === void 0 || now !== null && Math.abs(now - target) < 1e-9 || this._disabledReason(c, h, key)) {
        delete this._local[key];
        this._schedule();
        return;
      }
      if (!this._commander.run(h, c, key, target, ni.step)) delete this._local[key];
      this._schedule();
    }, ad && ad.debounce_ms !== void 0 ? ad.debounce_ms : 800);
    this._schedule();
  }
  // ---------- events ----------
  _click(e) {
    const t = e.target.closest && e.target.closest("button, a");
    if (!t || !this._wrap.contains(t)) return;
    if (t.dataset.act === "edit-card") {
      const opts = this._cardOptions();
      if (opts) opts.dispatchEvent(new CustomEvent("ll-edit-card", { detail: { path: opts.path }, bubbles: true, composed: true }));
      return;
    }
    if (t.dataset.control) {
      e.preventDefault();
      if (t.disabled) return;
      const key = t.dataset.control;
      if (t.dataset.step) {
        this._step(key, Number(t.dataset.step));
        return;
      }
      if (t.classList.contains("segbtn") && t.classList.contains("on")) return;
      this._command(key, t.dataset.value);
      return;
    }
    if (t.classList.contains("metric")) {
      e.preventDefault();
      if (this._cfg.demo || !t.dataset.entity) return;
      this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: t.dataset.entity } }));
      return;
    }
    if (t.classList.contains("more")) {
      e.preventDefault();
      this._moreOpen = !this._moreOpen;
      this._schedule();
      return;
    }
    if (t.dataset.nav !== void 0) {
      const it = (this._navItems || [])[Number(t.dataset.nav)];
      if (!it || it.external) return;
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button) return;
      e.preventDefault();
      this._moreOpen = false;
      if (location.pathname !== it.path) {
        history.pushState(null, "", it.path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      }
      this._schedule();
    }
  }
  _key(e) {
    if (e.key === "Escape" && this._moreOpen) {
      this._moreOpen = false;
      this._schedule();
      requestAnimationFrame(() => {
        const b2 = this.shadowRoot.querySelector(".more");
        if (b2) b2.focus({ preventScroll: true });
      });
      return;
    }
    const b = e.target.closest && e.target.closest(".segbtn");
    if (b && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const sib = e.key === "ArrowLeft" ? b.previousElementSibling : b.nextElementSibling;
      if (sib) {
        e.preventDefault();
        sib.focus();
      }
    }
  }
};

// src/editor.js
var clone2 = (v) => JSON.parse(JSON.stringify(v));
var isObj2 = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
var SECTIONS = [
  ["setup", "Setup"],
  ["sensors", "Sensors"],
  ["controls", "Controls"],
  ["features", "Features"],
  ["appearance", "Appearance"],
  ["status", "Status"],
  ["navigation", "Navigation"],
  ["advanced", "Advanced"]
];
var FEATURE_LABELS = {
  aircon: "Air conditioning coil",
  water_circuit: "Water circuit",
  bypass: "Bypass",
  humidity: "Humidity",
  health: "Online and fault pills",
  runtimes: "Runtimes",
  controls: "Controls",
  navigation: "Navigation bar"
};
var CONTROL_KIND_LABEL = { select: "Select entity", number: "Number entity", switch: "Switch entity", script: "Script or action" };
var ENUM_LABELS = {
  auto: "Auto",
  wide: "Wide",
  compact: "Compact",
  mobile: "Mobile",
  comfortable: "Comfortable",
  fill: "Fill",
  em_dash: "Show \u2014",
  hide: "Hide the value",
  disabled: "Off",
  air_out_minus_air_in: "Air out \u2212 air in",
  temperature_ratio: "From temperatures",
  last_updated: "Last updated",
  last_reported: "Last reported"
};
var COLOUR_LABELS = {
  background: "Background",
  equipment: "Equipment",
  border: "Borders",
  text: "Text",
  secondary_text: "Secondary text",
  intake: "Intake air",
  exhaust: "Exhaust air",
  supply: "Supply air",
  extract: "Extract air",
  bypass: "Bypass",
  water_flow: "Water flow",
  water_return: "Water return",
  healthy: "Healthy"
};
var MAPPING_LABELS = {
  online: "Online",
  fault: "Faults",
  bypass_position: "Bypass position",
  coil_status: "Air conditioning status"
};
function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isObj2(o[k]) && !Array.isArray(o[k])) o[k] = {};
    o = o[k];
  }
  const last = keys[keys.length - 1];
  if (value === void 0) delete o[last];
  else o[last] = value;
}
var STYLE2 = `
:host { display: block; font-family: ${FONT}; color: var(--primary-text-color, #1f2933); }
.top { display: flex; flex-direction: column; gap: 8px; }
.err { padding: 12px; border-radius: 8px; border: 1px solid var(--error-color, #c62828); color: var(--error-color, #c62828); }
.err[hidden] { display: none; }
details { border: 1px solid var(--divider-color, #cfd8dc); border-radius: 10px; }
summary { min-height: 44px; display: flex; align-items: center; padding: 0 16px; cursor: pointer; font-weight: 600; font-size: 16px; }
.sec { padding: 8px 16px 16px; display: flex; flex-direction: column; gap: 12px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; }
label.f { display: flex; flex-direction: column; gap: 4px; font-size: 14px; }
label.f > span.l { color: var(--secondary-text-color, #52606d); }
label.c { display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 16px; }
input, select, textarea {
  font: inherit; font-size: 16px; min-height: 40px; box-sizing: border-box; padding: 6px 8px; border-radius: 6px;
  border: 1px solid var(--divider-color, #b0bec5); background: var(--card-background-color, #fff); color: inherit; width: 100%;
}
textarea { min-height: 72px; font-family: ui-monospace, monospace; font-size: 14px; }
input[type="checkbox"] { width: 20px; height: 20px; min-height: 0; margin: 0; }
input[type="color"] { padding: 2px; width: 48px; flex: none; }
.colour { display: flex; gap: 8px; align-items: center; }
fieldset { border: 1px solid var(--divider-color, #cfd8dc); border-radius: 8px; margin: 0; padding: 8px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
legend { font-weight: 600; padding: 0 4px; }
.hint { font-size: 14px; color: var(--secondary-text-color, #52606d); margin: 0; }
.warn { font-size: 14px; color: var(--warning-color, #b26a00); margin: 0; }
.row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
button { font: inherit; font-size: 14px; min-height: 40px; padding: 0 12px; border-radius: 6px; cursor: pointer;
  border: 1px solid var(--divider-color, #b0bec5); background: transparent; color: inherit; }
button.primary { background: var(--primary-color, #03a9f4); color: var(--text-primary-color, #fff); border-color: transparent; }
`;
var MvhrAirflowCardEditor = class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._draft = null;
    this._lastSent = null;
    this._hass = null;
    this._open = /* @__PURE__ */ new Set(["setup"]);
    this._error = null;
    this._renderedWithHass = false;
  }
  setConfig(config) {
    const json = JSON.stringify(config || {});
    if (this._lastSent !== null && json === this._lastSent) return;
    this._draft = clone2(config || {});
    this._error = null;
    try {
      normalizeConfig(this._draft);
    } catch (e) {
      this._error = e.message;
    }
    this._render();
  }
  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first && this._draft) this._render();
  }
  get hass() {
    return this._hass;
  }
  // The normalized view the fields read from; falls back to defaults while a draft is invalid.
  _view() {
    try {
      return normalizeConfig(this._draft);
    } catch {
      return { ...defaultConfig(), ...this._draft };
    }
  }
  _emit() {
    let cfg;
    try {
      cfg = normalizeConfig(this._draft);
      this._error = null;
    } catch (e) {
      this._error = e.message;
      this._showError();
      return;
    }
    this._showError();
    this._lastSent = JSON.stringify(cfg);
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
  }
  _showError() {
    const el = this.shadowRoot.querySelector(".err");
    if (!el) return;
    el.hidden = !this._error;
    el.textContent = this._error ? `Not saved: ${this._error}` : "";
  }
  // ---------- field helpers ----------
  _entityList(domains) {
    const id = `dl-${domains.join("-") || "all"}`;
    if (!this._lists.has(id)) {
      const ids = Object.keys(this._hass && this._hass.states || {}).filter((e) => !domains.length || domains.includes(e.split(".")[0])).sort();
      this._lists.set(id, `<datalist id="${id}">${ids.map((e) => `<option value="${esc(e)}"></option>`).join("")}</datalist>`);
    }
    return id;
  }
  _text(path, label, value, { type = "text", list = "", placeholder = "", kind = "text", hint = "" } = {}) {
    return `<label class="f"><span class="l">${esc(label)}</span><input type="${type}" data-path="${path}" data-kind="${kind}"${list ? ` list="${list}"` : ""} value="${esc(value === null || value === void 0 ? "" : value)}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""} autocomplete="off" spellcheck="false">${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;
  }
  _num(path, label, value, { step = "any", min = "", max = "", placeholder = "" } = {}) {
    return `<label class="f"><span class="l">${esc(label)}</span><input type="number" inputmode="decimal" data-path="${path}" data-kind="number" step="${step}"${min !== "" ? ` min="${min}"` : ""}${max !== "" ? ` max="${max}"` : ""} value="${value === null || value === void 0 ? "" : esc(value)}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}></label>`;
  }
  _check(path, label, value, extra = "") {
    return `<label class="c"><input type="checkbox" data-path="${path}" data-kind="bool"${value ? " checked" : ""}${extra}>${esc(label)}</label>`;
  }
  _select(path, label, value, options, { kind = "text", structural = false } = {}) {
    return `<label class="f"><span class="l">${esc(label)}</span><select data-path="${path}" data-kind="${kind}"${structural ? " data-structural" : ""}>` + options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value ?? "") ? " selected" : ""}>${esc(t)}</option>`).join("") + `</select></label>`;
  }
  _enum(path, label, value) {
    return this._select(path, label, value, ENUMS[path].map((v) => [v, ENUM_LABELS[v] || v]));
  }
  // ---------- sections ----------
  _setup(v) {
    const devices = findDevices(this._hass);
    const devOpts = [["", devices.length ? "Choose a unit\u2026" : "No Nuaire MVHR unit found"], ...devices.map((d) => [d.id, d.name])];
    if (v.device && !devices.some((d) => d.id === v.device)) devOpts.push([v.device, `${v.device} (not found)`]);
    return `<p class="hint">Card ${esc(VERSION)} \xB7 schema ${v.schema_version}</p><div class="grid">${this._select("device", "Unit", v.device || "", devOpts, { kind: "text" })}${this._text("title", "Title", v.title)}${this._text("subtitle", "Subtitle", v.subtitle)}</div><div class="row"><button type="button" class="primary" data-act="fill"${devices.length ? "" : " disabled"}>Fill sensors and controls from unit</button></div><p class="hint">Fill binds only entities that exist on the chosen unit. Check the result under Sensors and Controls.</p>` + this._check("demo", "Demo mode (sample values, no commands)", v.demo) + this._check("read_only", "Read-only (controls show state but send nothing)", v.read_only);
  }
  _sensors(v) {
    let html = `<p class="hint">Pick the entity for each reading. Leave a field empty to show it as unavailable.</p>`;
    for (const k of BINDING_KEYS) {
      const info = BINDING_INFO[k];
      const b = v.bindings[k] || {};
      const units = INPUT_UNITS[info.kind] || [];
      const base = `bindings.${k}`;
      html += `<fieldset><legend>${esc(info.label)} <span class="hint">(${k})</span></legend><div class="grid">` + this._text(`${base}.entity`, "Entity", b.entity, { list: this._entityList(info.domains), kind: "entity", placeholder: `${info.domains[0]}.example` }) + this._text(`${base}.attribute`, "Attribute (optional)", b.attribute, { kind: "opt" }) + (units.length ? this._select(`${base}.input_unit`, "Entity unit", b.input_unit || "", [["", "From the entity"], ...units.map((u) => [u, u === "fraction" ? "Fraction (0\u20131)" : u])], { kind: "opt" }) : "") + (["temperature", "delta", "percent", "runtime"].includes(info.kind) ? this._num(`${base}.precision`, "Decimals (optional)", b.precision, { step: 1, min: 0, max: 4 }) : "") + this._text(`${base}.label`, "Label (optional)", b.label, { kind: "opt", placeholder: info.label }) + (k === "fault" ? this._text(`${base}.extra_entities`, "More fault entities (comma separated)", (b.extra_entities || []).join(", "), { kind: "list", list: this._entityList(info.domains) }) : "") + `</div></fieldset>`;
    }
    return html;
  }
  _controls(v) {
    let html = `<p class="hint">Each control needs an entity to drive it. A command is sent once per tap and confirmed by reading the state back.</p>`;
    for (const k of CONTROL_KEYS) {
      const info = CONTROL_INFO[k];
      const c = v.controls[k];
      const ad = c.adapter;
      const base = `controls.${k}`;
      const kinds = info.type === "option" ? ["select", "script"] : info.type === "number" ? ["number", "script"] : ["switch", "script"];
      html += `<fieldset><legend>${esc(info.label)}</legend>` + this._check(`${base}.visible`, "Show this control", c.visible) + `<div class="grid">${this._select(`${base}.adapter.kind`, "Driven by", ad ? ad.kind : "", [["", "Not set up"], ...kinds.map((x) => [x, CONTROL_KIND_LABEL[x]])], { kind: "adapter-kind", structural: true })}`;
      if (ad) {
        if (ad.kind !== "script") {
          html += this._text(`${base}.adapter.entity`, "Entity", ad.entity, { kind: "entity", list: this._entityList(ADAPTER_DOMAINS[ad.kind]) });
        } else {
          html += this._text(`${base}.adapter.action`, "Action", ad.action, { placeholder: "script.turn_on" });
        }
        html += this._text(`${base}.adapter.readback.entity`, ad.kind === "script" ? "Read back from (required)" : "Read back from (optional)", ad.readback.entity, { kind: "entity", list: this._entityList([]) }) + this._text(`${base}.adapter.readback.attribute`, "Read back attribute (optional)", ad.readback.attribute, { kind: "opt" }) + this._num(`${base}.adapter.timeout_ms`, "Confirm within (ms)", ad.timeout_ms, { step: 500, min: 1e3, max: 12e4 });
        if (info.type === "option") {
          for (const lab of info.labels) {
            html += this._text(`${base}.adapter.options.${lab}`, `Button "${lab}" sends`, ad.options ? ad.options[lab] : "", { kind: "opt", placeholder: lab });
          }
        }
        if (info.type === "number") {
          html += this._num(`${base}.adapter.min`, "Minimum (optional)", ad.min) + this._num(`${base}.adapter.max`, "Maximum (optional)", ad.max) + this._num(`${base}.adapter.step`, "Step (optional)", ad.step, { min: 1e-3 }) + this._num(`${base}.adapter.debounce_ms`, "Wait after last tap (ms)", ad.debounce_ms, { step: 100, min: 0, max: 1e4 });
        }
        if (info.type === "boolean" && ad.kind === "script") {
          html += this._text(`${base}.adapter.options.on`, "On sends", ad.options.on, { kind: "opt" }) + this._text(`${base}.adapter.options.off`, "Off sends", ad.options.off, { kind: "opt" });
        }
        if (ad.kind === "script") {
          html += `<label class="f"><span class="l">Action data (JSON, $value is the chosen value)</span><textarea data-path="${base}.adapter.data" data-kind="json" spellcheck="false">${esc(JSON.stringify(ad.data || {}, null, 2))}</textarea></label>`;
        }
      }
      html += `</div></fieldset>`;
    }
    return html;
  }
  _features(v) {
    let html = `<div class="grid">`;
    for (const k of FEATURE_KEYS) html += this._check(`features.${k}`, FEATURE_LABELS[k], v.features[k]);
    html += `</div><p class="hint">Water circuit needs air conditioning. Navigation shows only when it has enabled items.</p><fieldset><legend>Readings</legend><div class="grid">`;
    for (const k of METRIC_KEYS) html += this._check(`metrics.${k}`, BINDING_INFO[k] ? BINDING_INFO[k].label + (["supply_fan_percent", "extract_fan_percent"].includes(k) ? " fan" : "") : k, v.metrics[k]);
    return html + `</div></fieldset>`;
  }
  _appearance(v) {
    const L = v.layout;
    let html = `<div class="grid">${this._enum("layout.mode", "Layout", L.mode)}${this._enum("layout.width_mode", "Width", L.width_mode)}` + this._num("layout.max_content_width", "Comfortable width limit (px)", L.max_content_width, { step: 10, min: 960, max: 4e3 }) + this._num("layout.compact_below", "Compact below (px)", L.compact_below, { step: 1, min: 960, max: 1920 }) + this._num("layout.mobile_below", "Mobile below (px)", L.mobile_below, { step: 1, min: 480, max: 1200 }) + this._num("layout.text_scale", "Text size", L.text_scale, { step: 0.05, min: 0.9, max: 1.6 }) + this._enum("layout.density", "Spacing", L.density) + `</div>${this._check("layout.motion", "Animate fans (off when the system asks for reduced motion)", L.motion)}<fieldset><legend>Colours</legend><div class="grid">`;
    for (const k of APPEARANCE_KEYS) {
      const val = v.appearance[k];
      html += `<label class="f"><span class="l">${esc(COLOUR_LABELS[k])}</span><span class="colour"><input type="color" data-path="appearance.${k}" data-kind="colour" value="${esc(val.length === 4 ? "#" + [...val.slice(1)].map((c) => c + c).join("") : val)}" aria-label="${esc(COLOUR_LABELS[k])} picker"><input type="text" data-path="appearance.${k}" data-kind="opt" value="${esc(val)}" aria-label="${esc(COLOUR_LABELS[k])} hex" spellcheck="false"></span></label>`;
    }
    return html + `</div><div class="row"><button type="button" data-act="reset-colours">Reset colours</button></div></fieldset>`;
  }
  _status(v) {
    let html = `<p class="hint">Which entity states mean what. Separate values with commas. Empty lists use the usual on/off meanings.</p>`;
    for (const [k, lists] of Object.entries(STATE_MAPPING_KEYS)) {
      html += `<fieldset><legend>${esc(MAPPING_LABELS[k])}</legend><div class="grid">`;
      for (const l of lists) {
        const cur = v.state_mapping[k][l];
        html += this._text(`state_mapping.${k}.${l}`, l.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()), (cur || []).join(", "), { kind: "list" });
      }
      html += `</div></fieldset>`;
    }
    return html + `<fieldset><legend>Freshness</legend><div class="grid">` + this._enum("freshness.timestamp_policy", "Check age using", v.freshness.timestamp_policy) + this._num("freshness.max_age_seconds", "Stale after (seconds)", v.freshness.max_age_seconds, { step: 1, min: 10, max: 604800 }) + `</div></fieldset>`;
  }
  _navigation(v) {
    let html = `<p class="hint">Links to your other dashboards. Paths start with /, for example /lovelace/mvhr. Items with a problem are left out of the card.</p>`;
    v.navigation.forEach((it, i) => {
      const base = `navigation.${i}`;
      const problem = navPathProblem(it.path, it.external);
      html += `<fieldset><legend>Item ${i + 1}</legend><div class="grid">` + this._text(`${base}.label`, "Label", it.label) + this._select(`${base}.icon`, "Icon", it.icon, [...NAV_ICONS.map((n2) => [n2, n2]), ...NAV_ICONS.includes(it.icon) ? [] : [[it.icon, it.icon]]]) + this._text(`${base}.path`, "Path or URL", it.path, { placeholder: "/lovelace/home" }) + `</div><div class="row">${this._check(`${base}.enabled`, "Enabled", it.enabled)}${this._check(`${base}.external`, "External link", it.external)}${this._check(`${base}.current`, "Always mark as current", it.current)}</div>` + (problem ? `<p class="warn">${esc(problem)}</p>` : "") + `<div class="row"><button type="button" data-act="nav-up" data-i="${i}"${i ? "" : " disabled"}>Move up</button><button type="button" data-act="nav-down" data-i="${i}"${i < v.navigation.length - 1 ? "" : " disabled"}>Move down</button><button type="button" data-act="nav-remove" data-i="${i}">Remove</button></div></fieldset>`;
    });
    return html + `<div class="row"><button type="button" data-act="nav-add">Add item</button></div>`;
  }
  _advanced(v) {
    const F = v.format;
    return `<fieldset><legend>Number format</legend><div class="grid">` + this._enum("format.temperature_unit", "Temperature unit", F.temperature_unit) + this._num("format.temperature_precision", "Temperature decimals", F.temperature_precision, { step: 1, min: 0, max: 3 }) + this._num("format.percent_precision", "Percent decimals", F.percent_precision, { step: 1, min: 0, max: 2 }) + this._enum("format.unavailable", "When a reading is unavailable", F.unavailable) + this._text("format.locale", "Locale", F.locale, { placeholder: "auto", hint: "auto follows Home Assistant, or a tag like en-GB." }) + `</div></fieldset><fieldset><legend>Derived readings</legend><div class="grid">` + this._enum("derived.coil_air_delta", "Coil air \u0394T when not bound", v.derived.coil_air_delta) + this._enum("derived.recovery_efficiency", "Heat recovery when not bound", v.derived.recovery_efficiency) + `</div><p class="hint">Derived values are calculated by the card and only used when the reading has no entity.</p></fieldset>`;
  }
  // ---------- render and events ----------
  _render() {
    if (!this._draft) return;
    const active = this.shadowRoot.activeElement;
    const focusPath = active && active.dataset ? active.dataset.path || active.dataset.act : null;
    for (const d of this.shadowRoot.querySelectorAll("details")) {
      if (d.open) this._open.add(d.dataset.sec);
      else this._open.delete(d.dataset.sec);
    }
    const v = this._view();
    this._lists = /* @__PURE__ */ new Map();
    const body = SECTIONS.map(([key, title]) => `<details data-sec="${key}"${this._open.has(key) ? " open" : ""}><summary>${title}</summary><div class="sec">${this[`_${key}`](v)}</div></details>`).join("");
    this.shadowRoot.innerHTML = `<style>${STYLE2}</style><div class="top"><div class="err" role="alert" hidden></div>${body}${[...this._lists.values()].join("")}</div>`;
    this._showError();
    if (!this._bound) {
      this.shadowRoot.addEventListener("change", (e) => this._change(e));
      this.shadowRoot.addEventListener("click", (e) => this._act(e));
      this._bound = true;
    }
    if (focusPath) {
      const el = this.shadowRoot.querySelector(`[data-path="${CSS.escape(focusPath)}"], [data-act="${CSS.escape(focusPath)}"]`);
      if (el) el.focus({ preventScroll: true });
    }
    this._renderedWithHass = !!this._hass;
  }
  _change(e) {
    const el = e.target;
    const path = el.dataset && el.dataset.path;
    if (!path) return;
    const kind = el.dataset.kind;
    let value;
    let structural = el.hasAttribute("data-structural");
    if (kind === "bool") value = el.checked;
    else if (kind === "number") value = el.value === "" ? null : Number(el.value);
    else if (kind === "list") value = el.value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (kind === "json") {
      try {
        value = el.value.trim() ? JSON.parse(el.value) : {};
      } catch {
        this._error = `${path}: not valid JSON.`;
        this._showError();
        return;
      }
    } else if (kind === "colour") value = el.value.toUpperCase();
    else value = el.value.trim() === "" ? null : el.value.trim();
    const draft = this._draft;
    if (kind === "adapter-kind") {
      const key = path.split(".")[1];
      setPath(draft, `controls.${key}.adapter`, value ? { kind: value } : null);
    } else if (path.startsWith("bindings.")) {
      const [, key, field] = path.split(".");
      const cur = draft.bindings && draft.bindings[key];
      const b = typeof cur === "string" ? { entity: cur } : isObj2(cur) ? cur : {};
      if (value === null) delete b[field];
      else b[field] = value;
      setPath(draft, `bindings.${key}`, b.entity || b.extra_entities && b.extra_entities.length ? b : null);
    } else if (path.startsWith("navigation.")) {
      const [, i, field] = path.split(".");
      draft.navigation[Number(i)][field] = value === null ? "" : value;
      structural = true;
    } else if (kind === "number" && value === null) {
      const nullable = /max_age_seconds|\.min$|\.max$|\.step$|\.precision$/.test(path);
      setPath(draft, path, nullable ? null : void 0);
    } else if (path === "device") {
      setPath(draft, path, value);
    } else {
      setPath(draft, path, value === null && kind !== "text" ? void 0 : value);
    }
    if (path.startsWith("appearance.")) structural = true;
    if (path === "features.aircon" || path === "demo") structural = true;
    this._emit();
    if (structural) this._render();
  }
  _act(e) {
    const b = e.target.closest && e.target.closest("button[data-act]");
    if (!b) return;
    const act = b.dataset.act;
    const draft = this._draft;
    if (act === "fill") {
      const v = this._view();
      const device = v.device || (findDevices(this._hass)[0] || {}).id;
      if (!device) return;
      const { config } = proposeConfig(this._hass, v, device);
      if (!config) {
        this._error = "No entities found for that unit.";
        this._showError();
        return;
      }
      this._draft = clone2(config);
    } else if (act === "reset-colours") {
      draft.appearance = { ...DEFAULT_APPEARANCE };
    } else if (act.startsWith("nav-")) {
      if (!Array.isArray(draft.navigation)) draft.navigation = [];
      const i = Number(b.dataset.i);
      const n2 = draft.navigation;
      if (act === "nav-add") {
        n2.push({ label: "Home", icon: "home", path: "/lovelace/0", enabled: true });
        if (!draft.features || draft.features.navigation !== true) setPath(draft, "features.navigation", true);
      } else if (act === "nav-remove") n2.splice(i, 1);
      else if (act === "nav-up" && i > 0) [n2[i - 1], n2[i]] = [n2[i], n2[i - 1]];
      else if (act === "nav-down" && i < n2.length - 1) [n2[i + 1], n2[i]] = [n2[i], n2[i + 1]];
    } else return;
    this._emit();
    this._render();
  }
};

// src/index.js
var define = (name, cls) => {
  if (!customElements.get(name)) customElements.define(name, cls);
};
define(ALIAS_TYPE, MvhrAirflowCard);
define(CARD_TYPE, class extends MvhrAirflowCard {
});
define(`${ALIAS_TYPE}-editor`, MvhrAirflowCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === ALIAS_TYPE)) {
  window.customCards.push({
    type: ALIAS_TYPE,
    name: "MVHR airflow",
    description: "Live airflow, heat recovery, bypass and controls for a Nuaire MVHR unit.",
    preview: true,
    documentationURL: "https://github.com/karwantes/Nuaire-MVHR/blob/main/card/docs/install.md"
  });
}
if (!window.__mvhrAirflowCardLogged) {
  window.__mvhrAirflowCardLogged = true;
  console.info(`%c MVHR-AIRFLOW-CARD %c ${VERSION} `, "background:#0f766e;color:#fff;border-radius:3px 0 0 3px", "background:#e2e8f0;color:#0f172a;border-radius:0 3px 3px 0");
}
