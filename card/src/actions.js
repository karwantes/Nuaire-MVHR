// Commands. A command runs only from a deliberate user action, is dispatched once, and
// is confirmed only by a matching readback. No retries; an error never selects the
// requested state. Each control is tracked on its own so only that control is pending.

import { CONTROL_INFO } from "./constants.js";
import { parseNumber } from "./state.js";

const lc = (s) => String(s).trim().toLowerCase();
const ERROR_MS = 6000;

// Where the card reads a control's current value back from.
export function readbackSource(cfg, key) {
  const ad = cfg.controls[key].adapter;
  if (ad && ad.readback && ad.readback.entity) return { entity: ad.readback.entity, attribute: ad.readback.attribute || null };
  const bindKey = { fan_speed: "speed_state", bypass_mode: "bypass_mode", bypass_threshold: "bypass_threshold", night: "night_state", holiday: "holiday_state" }[key];
  const b = cfg.bindings[bindKey];
  if (b && b.entity) return { entity: b.entity, attribute: b.attribute || null };
  if (ad && ad.entity) return { entity: ad.entity, attribute: null };
  return null;
}

export function readbackValue(hass, src) {
  if (!src || !hass || !hass.states) return undefined;
  const so = hass.states[src.entity];
  if (!so) return undefined;
  return src.attribute ? (so.attributes || {})[src.attribute] : so.state;
}

// The service call for one control and a requested value (button label, number or on/off).
export function buildCall(cfg, key, value) {
  const ad = cfg.controls[key].adapter;
  if (!ad) throw new Error("Not mapped");
  const info = CONTROL_INFO[key];
  if (ad.kind === "script") {
    let v = value;
    if (info.type === "option") v = ad.options && ad.options[value] !== undefined ? ad.options[value] : value;
    if (info.type === "boolean") v = ad.options ? ad.options[value] : value;
    const data = {};
    for (const [k, d] of Object.entries(ad.data || {})) data[k] = d === "$value" ? v : typeof d === "string" ? d.split("$value").join(String(v)) : d;
    const [domain, service] = ad.action.split(".");
    return { domain, service, data, expect: v };
  }
  const domain = ad.entity.split(".")[0];
  const target = { entity_id: ad.entity };
  if (ad.kind === "select") {
    const option = ad.options && ad.options[value] !== undefined ? ad.options[value] : value;
    return { domain, service: "select_option", data: { ...target, option }, expect: option };
  }
  if (ad.kind === "number") return { domain, service: "set_value", data: { ...target, value }, expect: value };
  if (ad.kind === "switch") return { domain, service: value === "on" ? "turn_on" : "turn_off", data: target, expect: value };
  throw new Error(`Unsupported kind ${ad.kind}`);
}

export function readbackMatches(info, expect, actual, step) {
  if (actual === undefined || actual === null) return false;
  if (info.type === "number") {
    const a = parseNumber(actual);
    const e = Number(expect);
    return a !== null && Math.abs(a - e) <= (step || 1) / 2 + 1e-9;
  }
  if (typeof actual === "boolean") actual = actual ? "on" : "off";
  return lc(actual) === lc(expect);
}

function errorText(err) {
  const code = err && (err.code || (err.error && err.error.code));
  const msg = String((err && (err.message || (err.error && err.error.message))) || err || "");
  if (code === "unauthorized" || code === 401 || /unauthori[sz]ed|forbidden|permission/i.test(msg)) return "Permission denied";
  return msg ? `Failed: ${msg.slice(0, 80)}` : "Failed";
}

// One per card. onChange() is called whenever a control's pending/error state changes.
export class Commander {
  constructor(onChange) {
    this.onChange = onChange;
    this.state = {}; // key -> {pending, error, expect, id, timer}
    this.seq = 0;
    this.calls = 0; // dispatched service calls (tests read this)
  }

  get(key) {
    return this.state[key] || {};
  }

  // Dispatch once. Returns false when ignored (already pending).
  run(hass, cfg, key, value, step) {
    const cur = this.state[key];
    if (cur && cur.pending) return false;
    let call;
    try { call = buildCall(cfg, key, value); } catch (e) {
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
      // Keep watching: a slow unit that catches up later clears the error (see check()).
      this.setError(key, "No confirmation from the unit", { late: true, expect: st.expect, src: st.src, step: st.step });
    }, ad.timeout_ms || 10000);
    this.onChange(key);
    this.calls++;
    let p;
    try { p = Promise.resolve(hass.callService(call.domain, call.service, call.data)); } catch (e) { p = Promise.reject(e); }
    p.then(() => {
      if (this.state[key] !== st) return;
      st.resolved = true;
      // Readback may already match (it arrived before the call resolved).
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
    if (st && st.error && !st.pending) { clearTimeout(st.timer); this.state[key] = {}; return true; }
    return false;
  }

  dispose() {
    for (const st of Object.values(this.state)) if (st.timer) clearTimeout(st.timer);
    this.state = {};
  }
}
