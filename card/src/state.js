// Derived state model. Reads only the configured bindings from hass.states and turns
// them into typed readings. Nothing here invents a value: a reading that cannot be read
// carries a status and a reason instead.

import { BINDING_INFO, BINDING_KEYS, CONTROL_INFO } from "./constants.js";
import { metricVisible, effectiveFeatures } from "./config.js";

const BAD_STATES = new Set(["unknown", "unavailable"]);

// ---------- units ----------

export function toCelsius(v, unit) {
  if (unit === "°F" || unit === "F") return (v - 32) * 5 / 9;
  if (unit === "K") return v - 273.15;
  return v;
}
export function fromCelsius(v, unit) {
  return unit === "°F" ? v * 9 / 5 + 32 : v;
}
// Differences have no offset.
export function deltaToCelsius(v, unit) {
  if (unit === "°F" || unit === "F") return v * 5 / 9;
  return v;
}
export function deltaFromCelsius(v, unit) {
  return unit === "°F" ? v * 9 / 5 : v;
}
const RUNTIME_TO_H = { h: 1, min: 1 / 60, s: 1 / 3600, d: 24 };

export function parseNumber(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t === "" || !/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// ---------- one binding ----------

// Returns {status, value, raw, unit, entity, reason, stale}.
// status: unbound | missing | unknown | unavailable | invalid | ok
export function readBinding(hass, cfg, key, now = Date.now()) {
  let b = cfg.bindings[key];
  const kind = BINDING_INFO[key].kind;
  if (b && b.by_speed) {
    // Extension: the fan % comes from the per-speed setting that matches the running speed.
    const sp = key === "speed_state" ? null : readBinding(hass, cfg, "speed_state", now);
    const e = sp && sp.status === "ok" ? b.by_speed[sp.value] : null;
    if (e) b = { ...b, entity: e };
  }
  if (!b || !b.entity) return { status: "unbound", reason: "Not set up" };
  const so = hass && hass.states ? hass.states[b.entity] : undefined;
  if (!so) return { status: "missing", entity: b.entity, reason: `${b.entity} not found` };
  let raw;
  if (b.attribute) {
    if (!so.attributes || !(b.attribute in so.attributes)) {
      return { status: "missing", entity: b.entity, reason: `${b.entity} has no attribute ${b.attribute}` };
    }
    raw = so.attributes[b.attribute];
    if (raw === null || raw === undefined || raw === "") return { status: "unknown", entity: b.entity, reason: "Empty attribute" };
  } else {
    raw = so.state;
    if (BAD_STATES.has(raw)) return { status: raw, entity: b.entity, reason: raw === "unknown" ? "Unknown" : "Unavailable" };
  }
  const out = { status: "ok", raw, entity: b.entity, stale: isStale(so, cfg, now) };
  const metaUnit = b.attribute ? null : (so.attributes && so.attributes.unit_of_measurement) || null;
  const unit = b.input_unit || metaUnit;
  if (kind === "state" || kind === "text") {
    out.value = typeof raw === "boolean" ? (raw ? "on" : "off") : String(raw);
    return out;
  }
  const n = parseNumber(raw);
  if (n === null) return { status: "invalid", entity: b.entity, raw, reason: `Not a number: ${String(raw).slice(0, 24)}` };
  if (kind === "temperature") out.value = toCelsius(n, unit);
  else if (kind === "delta") out.value = deltaToCelsius(n, unit);
  else if (kind === "percent") out.value = unit === "fraction" ? n * 100 : n;
  else if (kind === "runtime") out.value = n * (RUNTIME_TO_H[unit] ?? 1);
  else out.value = n;
  out.unit = unit;
  return out;
}

function isStale(so, cfg, now) {
  const { timestamp_policy: policy, max_age_seconds: max } = cfg.freshness;
  if (policy === "disabled" || !max) return false;
  const ts = so[policy] || so.last_updated;
  const t = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t)) return false;
  return now - t > max * 1000;
}

// ---------- mapped states ----------

const lc = (s) => String(s).trim().toLowerCase();
const inList = (list, v) => list.some((x) => lc(x) === lc(v));
const domainOf = (r) => (r.entity ? r.entity.split(".")[0] : "");

// Two-way mapping with explicit lists; binary_sensor/switch on/off is HA-defined so it
// is the default only when no list is configured.
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

export function readHealth(hass, cfg) {
  const online = readBinding(hass, cfg, "online");
  const onlineState = online.status === "unbound" ? "unbound" : mapActive(online, cfg.state_mapping.online);
  const fb = cfg.bindings.fault;
  let fault = "unbound";
  const faultEntities = [];
  if (fb) {
    const ids = [fb.entity, ...(fb.extra_entities || [])].filter(Boolean);
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
    faultEntities,
  };
}

export function readBypassPosition(hass, cfg) {
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

// HA's hvac_action words are the default only when no list is configured.
export function readCoilStatus(hass, cfg) {
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

// Map an entity option back to the card's button label through the adapter's option map.
export function optionLabel(cfg, controlKey, raw) {
  if (raw === undefined || raw === null) return null;
  const labels = CONTROL_INFO[controlKey].labels;
  const ad = cfg.controls[controlKey].adapter;
  if (ad && ad.options) {
    for (const [label, actual] of Object.entries(ad.options)) if (lc(actual) === lc(raw)) return label;
  }
  const direct = labels.find((l) => lc(l) === lc(raw));
  return direct || null;
}

export function readToggle(hass, cfg, key) {
  const r = readBinding(hass, cfg, key);
  if (r.status !== "ok") return { state: r.status === "unbound" ? "unbound" : "unknown", r };
  const v = lc(r.value);
  return { state: v === "on" ? "on" : v === "off" ? "off" : "unknown", r };
}

// ---------- derived ----------

export function deriveDelta(cfg, readings) {
  const own = readings.coil_air_delta;
  if (own.status !== "unbound") return { ...own, source: "sensor" };
  if (cfg.derived.coil_air_delta !== "air_out_minus_air_in") return own;
  const a = readings.coil_air_in;
  const b = readings.coil_air_out;
  if (a.status !== "ok" || b.status !== "ok") return { status: "unavailable", reason: "Air in/out needed", source: "derived" };
  return { status: "ok", value: b.value - a.value, source: "derived", stale: a.stale || b.stale };
}

// Reported value wins. The opt-in ratio needs valid temperatures, a 1 °C denominator
// and a closed bypass; out-of-range results are flagged, never clamped.
export function deriveEfficiency(cfg, readings, bypassState) {
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
  const v = ((s.value - o.value) / den) * 100;
  return { status: "ok", value: v, source: "calculated", flagged: v < 0 || v > 100 };
}

// ---------- formatting ----------

export function displayTempUnit(cfg, hass) {
  if (cfg.format.temperature_unit !== "auto") return cfg.format.temperature_unit;
  const u = hass && hass.config && hass.config.unit_system && hass.config.unit_system.temperature;
  return u === "°F" ? "°F" : "°C";
}

export function localeOf(cfg, hass) {
  if (cfg.format.locale !== "auto") return cfg.format.locale;
  return (hass && ((hass.locale && hass.locale.language) || hass.language)) || "en";
}

const nfCache = new Map();
function nf(locale, digits, grouping) {
  const k = `${locale}|${digits}|${grouping}`;
  if (!nfCache.has(k)) {
    let f;
    try { f = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping }); }
    catch { f = new Intl.NumberFormat("en", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping }); }
    nfCache.set(k, f);
  }
  return nfCache.get(k);
}

export const EM_DASH = "—";

// Returns the display text, or null when the unavailable policy says hide.
export function formatReading(cfg, hass, key, r) {
  if (!r || r.status !== "ok") return cfg.format.unavailable === "hide" ? null : EM_DASH;
  const kind = BINDING_INFO[key].kind;
  const b = cfg.bindings[key];
  const loc = localeOf(cfg, hass);
  if (kind === "temperature" || kind === "delta") {
    const unit = displayTempUnit(cfg, hass);
    const v = kind === "delta" ? deltaFromCelsius(r.value, unit) : fromCelsius(r.value, unit);
    const p = b && b.precision !== null ? b.precision : cfg.format.temperature_precision;
    const txt = nf(loc, p, false).format(v).replace(/^-/, "−");
    return `${kind === "delta" && v > 0 ? "+" : ""}${txt}${unit}`;
  }
  if (kind === "percent") {
    const p = b && b.precision !== null ? b.precision : cfg.format.percent_precision;
    return `${nf(loc, p, false).format(r.value).replace(/^-/, "−")}%`;
  }
  if (kind === "runtime") {
    const p = b && b.precision !== null ? b.precision : 0;
    return `${nf(loc, p, true).format(r.value)} h`;
  }
  return String(r.value);
}

// ---------- whole model ----------

// The model is a plain object so the card can diff it and tests can inspect it.
export function buildModel(hass, cfg, now = Date.now()) {
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
    stale: BINDING_KEYS.some((k) => readings[k].stale && (!(k in cfg.metrics) || metricVisible(cfg, k))),
  };
}

// Entities whose change can alter the card. The card ignores all other state updates.
export function watchedEntities(cfg) {
  const s = new Set();
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
