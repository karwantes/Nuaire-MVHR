// Configuration: defaults, validation, legacy migration and serialisation.
// normalizeConfig() is the only way a raw Lovelace config enters the card or editor.
// Unknown keys are kept so newer or third-party settings survive a round trip.

import {
  SCHEMA_VERSION, CARD_TYPE, ALIAS_TYPE, METRIC_KEYS, BINDING_KEYS, BINDING_INFO, CONTROL_KEYS,
  CONTROL_INFO, FEATURE_KEYS, APPEARANCE_KEYS, DEFAULT_APPEARANCE, ENUMS, STATE_MAPPING_KEYS,
  NAV_ICONS, INPUT_UNITS, ADAPTER_KINDS, ADAPTER_DOMAINS,
} from "./constants.js";

export class ConfigError extends Error {
  constructor(path, message) {
    super(`${path}: ${message}`);
    this.name = "ConfigError";
    this.path = path;
  }
}

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
const ENTITY_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;

export function defaultConfig() {
  return {
    type: `custom:${ALIAS_TYPE}`,
    schema_version: SCHEMA_VERSION,
    title: "MVHR & Air Conditioning",
    subtitle: "Live airflow & climate",
    demo: false,
    read_only: true,
    device: null,
    layout: {
      mode: "auto", width_mode: "comfortable", max_content_width: 2000, compact_below: 1280,
      mobile_below: 768, text_scale: 1.0, density: "comfortable", motion: false,
    },
    features: Object.fromEntries(FEATURE_KEYS.map((k) => [k, k !== "navigation"])),
    metrics: Object.fromEntries(METRIC_KEYS.map((k) => [k, true])),
    bindings: Object.fromEntries(BINDING_KEYS.map((k) => [k, null])),
    controls: Object.fromEntries(CONTROL_KEYS.map((k) => [k, { visible: true, adapter: null }])),
    state_mapping: {
      online: { active_values: [], inactive_values: [] },
      fault: { active_values: [], inactive_values: [] },
      bypass_position: { open_values: [], closed_values: [] },
      coil_status: { idle_values: [], heating_values: [], cooling_values: [] },
    },
    format: {
      temperature_unit: "auto", temperature_precision: 1, percent_precision: 0,
      unavailable: "em_dash", locale: "auto",
    },
    derived: { coil_air_delta: "disabled", recovery_efficiency: "disabled" },
    freshness: { max_age_seconds: null, timestamp_policy: "disabled" },
    appearance: { ...DEFAULT_APPEARANCE },
    navigation: [],
  };
}

// ---------- small validators ----------

function enumValue(path, value, fallback) {
  if (value === undefined || value === null) return fallback;
  const allowed = ENUMS[path];
  if (!allowed.includes(value)) {
    throw new ConfigError(path, `unknown value '${value}'. Choose one of: ${allowed.join(", ")}.`);
  }
  return value;
}

function bool(path, value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new ConfigError(path, `must be true or false (got ${JSON.stringify(value)}).`);
  return value;
}

function num(path, value, fallback, min, max, { integer = false, nullable = false } = {}) {
  if (value === undefined || (value === null && !nullable)) return fallback;
  if (value === null) return null;
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new ConfigError(path, `must be a number (got ${JSON.stringify(value)}).`);
  if (integer && !Number.isInteger(n)) throw new ConfigError(path, `must be a whole number (got ${n}).`);
  if (n < min || n > max) throw new ConfigError(path, `must be between ${min} and ${max} (got ${n}).`);
  return n;
}

function str(path, value, fallback, { nullable = false } = {}) {
  if (value === undefined) return fallback;
  if (value === null) return nullable ? null : fallback;
  if (typeof value !== "string") throw new ConfigError(path, `must be text (got ${JSON.stringify(value)}).`);
  return value;
}

function entity(path, value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !ENTITY_RE.test(value)) {
    throw new ConfigError(path, `'${value}' is not an entity ID like sensor.example.`);
  }
  return value;
}

function stringList(path, value) {
  if (value === undefined || value === null) return [];
  const list = Array.isArray(value) ? value : [value];
  return list.map((v, i) => {
    if (typeof v === "boolean" || typeof v === "number") return String(v);
    if (typeof v !== "string") throw new ConfigError(`${path}[${i}]`, "must be text.");
    return v;
  });
}

function section(path, value) {
  if (value === undefined || value === null) return {};
  if (!isObj(value)) throw new ConfigError(path, "must be a mapping of settings.");
  return value;
}

// ---------- bindings ----------

export function normalizeBinding(key, raw) {
  const path = `bindings.${key}`;
  if (raw === undefined || raw === null || raw === "") return null;
  const b = typeof raw === "string" ? { entity: raw } : raw;
  if (!isObj(b)) throw new ConfigError(path, "must be an entity ID or {entity, attribute, input_unit, precision, label}.");
  const kind = BINDING_INFO[key].kind;
  const out = { ...clone(b) };
  out.entity = entity(`${path}.entity`, b.entity);
  out.attribute = str(`${path}.attribute`, b.attribute, null, { nullable: true }) || null;
  const units = INPUT_UNITS[kind] || [];
  if (b.input_unit === undefined || b.input_unit === null || b.input_unit === "") out.input_unit = null;
  else if (!units.includes(b.input_unit)) {
    throw new ConfigError(`${path}.input_unit`, units.length
      ? `unknown unit '${b.input_unit}'. Choose one of: ${units.join(", ")}.`
      : "this reading has no unit; remove input_unit.");
  } else out.input_unit = b.input_unit;
  out.precision = num(`${path}.precision`, b.precision, null, 0, 4, { integer: true, nullable: true });
  out.label = str(`${path}.label`, b.label, null, { nullable: true }) || null;
  if (key === "fault") {
    // Extension: a unit with several fault sensors. Any active one is a fault.
    out.extra_entities = (Array.isArray(b.extra_entities) ? b.extra_entities : [])
      .map((e, i) => entity(`${path}.extra_entities[${i}]`, e)).filter(Boolean);
  }
  if (key === "supply_fan_percent" || key === "extract_fan_percent") {
    // Extension: {speed: entity} map, read for the speed in bindings.speed_state.
    if (b.by_speed !== undefined && b.by_speed !== null) {
      if (!isObj(b.by_speed)) throw new ConfigError(`${path}.by_speed`, "must map a speed to an entity ID, e.g. {\"1\": number.supply_speed_1}.");
      const m = {};
      for (const [s, e] of Object.entries(b.by_speed)) { const id = entity(`${path}.by_speed.${s}`, e); if (id) m[s] = id; }
      out.by_speed = Object.keys(m).length ? m : null;
    } else out.by_speed = null;
  }
  if (!out.entity && !(out.extra_entities && out.extra_entities.length) && !out.by_speed) return null;
  return out;
}

// ---------- controls ----------

function normalizeAdapter(key, raw) {
  const path = `controls.${key}.adapter`;
  if (raw === undefined || raw === null) return null;
  if (!isObj(raw)) throw new ConfigError(path, "must be a mapping with kind and entity.");
  const out = { ...clone(raw) };
  const info = CONTROL_INFO[key];
  if (!ADAPTER_KINDS.includes(raw.kind)) {
    throw new ConfigError(`${path}.kind`, `unknown kind '${raw.kind}'. Choose one of: ${ADAPTER_KINDS.join(", ")}.`);
  }
  const allowedKinds = info.type === "option" ? ["select", "script"]
    : info.type === "number" ? ["number", "script"] : ["switch", "script"];
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
      if (actual === null || actual === undefined || actual === "") continue;
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
    out.step = num(`${path}.step`, raw.step, null, 0.001, 1e6, { nullable: true });
    out.debounce_ms = num(`${path}.debounce_ms`, raw.debounce_ms, 800, 0, 10000, { integer: true });
    if (out.min !== null && out.max !== null && out.min > out.max) throw new ConfigError(`${path}.min`, "must not exceed max.");
  }
  const rb = raw.readback === undefined || raw.readback === null ? {} : section(`${path}.readback`, raw.readback);
  out.readback = {
    ...rb,
    entity: entity(`${path}.readback.entity`, rb.entity),
    attribute: str(`${path}.readback.attribute`, rb.attribute, null, { nullable: true }) || null,
  };
  out.timeout_ms = num(`${path}.timeout_ms`, raw.timeout_ms, 10000, 1000, 120000, { integer: true });
  if (raw.kind === "script") {
    if (typeof raw.action !== "string" || !/^[a-z0-9_]+\.[a-z0-9_]+$/.test(raw.action)) {
      throw new ConfigError(`${path}.action`, `needs an action like script.turn_on (got ${JSON.stringify(raw.action)}).`);
    }
    out.action = raw.action;
    const data = raw.data === undefined || raw.data === null ? {} : section(`${path}.data`, raw.data);
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

// ---------- navigation ----------

// Returns null when fine, or a reason the path can't be used.
export function navPathProblem(path, external) {
  if (typeof path !== "string" || path.trim() === "") return "No destination set.";
  const p = path.trim();
  if (/^\s*(javascript|data|vbscript|file):/i.test(p)) return "Script and data links are not allowed.";
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) {
    if (!/^https?:\/\//i.test(p)) return "Only http:// or https:// external links are allowed.";
    if (!external) return "External link: tick 'External link' to allow it.";
    try { new URL(p); } catch { return "Not a valid web address."; }
    return null;
  }
  if (p.startsWith("//")) return "Protocol-relative links are not allowed.";
  if (!p.startsWith("/")) return "Dashboard paths start with / (for example /lovelace/mvhr).";
  if (/[\s<>"`]/.test(p)) return "The path contains spaces or unsafe characters.";
  return null;
}

function normalizeNav(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new ConfigError("navigation", "must be a list of {label, icon, path, enabled}.");
  return raw.map((item, i) => {
    const path = `navigation[${i}]`;
    if (!isObj(item)) throw new ConfigError(path, "must be {label, icon, path, enabled}.");
    const icon = item.icon === undefined || item.icon === null || item.icon === "" ? "link" : item.icon;
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
      current: bool(`${path}.current`, item.current, false),
    };
  });
}

// ---------- legacy (0.2.x) migration ----------

const LEGACY_KEYS = ["device", "entities", "unit", "coil", "colors", "show_controls", "show_status", "show_coil",
  "fit_height", "invert_bypass", "bottom_offset", "speed_seconds", "target_step"];

export function isLegacyConfig(raw) {
  if (!isObj(raw) || raw.schema_version !== undefined) return false;
  return typeof raw.layout === "string" || LEGACY_KEYS.some((k) => k in raw && k !== "device")
    || (typeof raw.device === "string" && raw.device !== "");
}

// The 0.2.x card found unit entities by object_id suffix and fell back to these IDs,
// so the migrated config names the same entities the old card showed.
export const LEGACY_ROLES = {
  fan_speed: ["select", "fan_speed"], running_speed: ["sensor", "running_fan_speed"],
  bypass_mode: ["select", "bypass"], bypass_active: ["binary_sensor", "bypass_active"],
  bypass_setpoint: ["number", "bypass_setpoint"], humidity: ["sensor", "humidity"],
  intake_temp: ["sensor", "intake_air_temperature"], extract_temp: ["sensor", "extract_air_temperature"],
  night: ["switch", "night_mode"], holiday: ["switch", "holiday_mode"], run_hours: ["sensor", "run_hours"],
  filter_hours: ["sensor", "filter_hours"], comms: ["binary_sensor", "communication_with_unit"],
};
export const LEGACY_FAULTS = ["supply_fan_fault", "extract_fan_fault", "heater_fault", "cooler_fault", "frost_fault"];

export function migrateLegacy(raw) {
  const unit = isObj(raw.unit) ? raw.unit : {};
  const ent = isObj(raw.entities) ? raw.entities : {};
  const coil = isObj(raw.coil) ? raw.coil : {};
  const colors = isObj(raw.colors) ? raw.colors : {};
  const role = (r) => unit[r] || `${LEGACY_ROLES[r][0]}.mrxbox_${LEGACY_ROLES[r][1]}`;
  const b = (e, extra = {}) => (e ? { entity: e, attribute: null, input_unit: null, precision: null, label: null, ...extra } : null);
  const out = {};
  const known = new Set([...LEGACY_KEYS, "layout", "type", "title"]);
  for (const [k, v] of Object.entries(raw)) if (!known.has(k)) out[k] = clone(v);
  out.type = raw.type || `custom:${CARD_TYPE}`;
  out.schema_version = SCHEMA_VERSION;
  if (typeof raw.title === "string") out.title = raw.title;
  if (typeof raw.device === "string" && raw.device) out.device = raw.device;
  out.read_only = true;
  out.layout = { mode: { landscape: "wide", portrait: "mobile" }[raw.layout] || "auto" };
  out.features = {
    aircon: raw.show_coil === undefined ? !!(coil.air_in || coil.air_out || coil.climate || coil.state) : !!raw.show_coil,
    controls: raw.show_controls !== false,
    health: raw.show_status !== false,
  };
  out.features.water_circuit = out.features.aircon;
  const climateStatus = coil.state ? b(coil.state)
    : coil.climate ? b(coil.climate, { attribute: "hvac_action" }) : null;
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
    fault: { entity: `binary_sensor.mrxbox_${LEGACY_FAULTS[0]}`, attribute: null, input_unit: null, precision: null,
      label: null, extra_entities: LEGACY_FAULTS.slice(1).map((f) => unit[`fault_${f.replace(/_fault$/, "")}`] || `binary_sensor.mrxbox_${f}`) },
    filter_runtime: b(role("filter_hours"), { input_unit: "h" }),
    unit_runtime: b(role("run_hours"), { input_unit: "h" }),
    night_state: b(role("night")),
    holiday_state: b(role("holiday")),
  };
  if (unit.fault_supply_fan) out.bindings.fault.entity = unit.fault_supply_fan;
  // Old 0.2.x semantics: bypass_active on = bypass open, unless invert_bypass was set.
  const open = raw.invert_bypass ? ["off"] : ["on"];
  const closed = raw.invert_bypass ? ["on"] : ["off"];
  out.state_mapping = {
    online: { active_values: ["on"], inactive_values: ["off"] },
    fault: { active_values: ["on"], inactive_values: ["off"] },
    bypass_position: { open_values: open, closed_values: closed },
    coil_status: coil.climate && !coil.state
      ? { idle_values: ["idle"], heating_values: ["heating", "preheating"], cooling_values: ["cooling"], off_values: ["off"] }
      : { idle_values: [], heating_values: [], cooling_values: [] },
  };
  const sel = (e, labels) => ({ kind: "select", entity: e, options: Object.fromEntries(labels.map((l) => [l, l])),
    readback: { entity: null, attribute: null }, timeout_ms: 10000 });
  out.controls = {
    fan_speed: { visible: true, adapter: sel(role("fan_speed"), ["1", "2", "3"]) },
    bypass_mode: { visible: true, adapter: sel(role("bypass_mode"), ["Auto", "On", "Off"]) },
    bypass_threshold: { visible: true, adapter: { kind: "number", entity: role("bypass_setpoint"),
      readback: { entity: null, attribute: null }, timeout_ms: 10000 } },
    night: { visible: true, adapter: { kind: "switch", entity: role("night"), readback: { entity: null, attribute: null }, timeout_ms: 10000 } },
    holiday: { visible: true, adapter: { kind: "switch", entity: role("holiday"), readback: { entity: null, attribute: null }, timeout_ms: 10000 } },
  };
  out.appearance = {};
  for (const k of ["intake", "supply", "extract", "exhaust"]) if (typeof colors[k] === "string" && colors[k]) out.appearance[k] = colors[k];
  out.migrated_from = "0.2";
  return out;
}

// ---------- normalisation ----------

export function normalizeConfig(input) {
  if (input === undefined || input === null) input = {};
  if (!isObj(input)) throw new ConfigError("config", "must be a mapping of settings.");
  let raw = clone(input);
  if (isLegacyConfig(raw)) raw = migrateLegacy(raw);
  const sv = raw.schema_version === undefined ? SCHEMA_VERSION : raw.schema_version;
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
    max_content_width: num("layout.max_content_width", L.max_content_width, 2000, 960, 4000, { integer: true }),
    compact_below: num("layout.compact_below", L.compact_below, 1280, 960, 1920, { integer: true }),
    mobile_below: num("layout.mobile_below", L.mobile_below, 768, 480, 1200, { integer: true }),
    text_scale: num("layout.text_scale", L.text_scale, 1, 0.9, 1.6),
    density: enumValue("layout.density", L.density, d.layout.density),
    // Extension: "always" animates even when the system asks for reduced motion.
    motion: L.motion === "always" ? "always" : bool("layout.motion", L.motion, false),
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
      if (l === "off_values" && m[l] === undefined) continue;
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
    locale: str("format.locale", Fm.locale, "auto") || "auto",
  };
  if (out.format.locale !== "auto") {
    try { new Intl.NumberFormat(out.format.locale); } catch {
      throw new ConfigError("format.locale", `'${out.format.locale}' is not a language tag like en-GB. Use auto to follow Home Assistant.`);
    }
  }

  const D = section("derived", raw.derived);
  out.derived = {
    ...D,
    coil_air_delta: enumValue("derived.coil_air_delta", D.coil_air_delta, "disabled"),
    recovery_efficiency: enumValue("derived.recovery_efficiency", D.recovery_efficiency, "disabled"),
  };

  const Fr = section("freshness", raw.freshness);
  out.freshness = {
    ...Fr,
    max_age_seconds: num("freshness.max_age_seconds", Fr.max_age_seconds, null, 10, 604800, { integer: true, nullable: true }),
    timestamp_policy: enumValue("freshness.timestamp_policy", Fr.timestamp_policy, "disabled"),
  };

  const A = section("appearance", raw.appearance);
  out.appearance = { ...A };
  for (const k of APPEARANCE_KEYS) {
    const v = A[k];
    if (v === undefined || v === null || v === "") { out.appearance[k] = DEFAULT_APPEARANCE[k]; continue; }
    if (typeof v !== "string" || !/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v)) {
      throw new ConfigError(`appearance.${k}`, `'${v}' is not a colour like #16B9ED.`);
    }
    out.appearance[k] = v.toUpperCase();
  }

  out.navigation = normalizeNav(raw.navigation);
  return out;
}

// Effective visibility after parent switches. Water needs aircon.
export function effectiveFeatures(cfg) {
  const f = { ...cfg.features };
  f.water_circuit = f.aircon && f.water_circuit;
  f.navigation = f.navigation && cfg.navigation.some((n) => n.enabled);
  return f;
}

export function metricVisible(cfg, key) {
  const f = effectiveFeatures(cfg);
  if (!cfg.metrics[key]) return false;
  if (["coil_air_in", "coil_air_out", "coil_air_delta", "buffer_temperature"].includes(key)) return f.aircon;
  if (["water_flow_temperature", "water_return_temperature"].includes(key)) return f.water_circuit;
  if (["extract_humidity", "indoor_humidity"].includes(key)) return f.humidity;
  if (["filter_runtime", "unit_runtime"].includes(key)) return f.runtimes;
  return true;
}

export function controlVisible(cfg, key) {
  const f = effectiveFeatures(cfg);
  if (!f.controls || !cfg.controls[key].visible) return false;
  if ((key === "bypass_mode" || key === "bypass_threshold") && !f.bypass) return false;
  return true;
}

// True when nothing is bound yet: the card shows onboarding instead of a diagram.
export function isUnconfigured(cfg) {
  return !cfg.demo && BINDING_KEYS.every((k) => !cfg.bindings[k]);
}
