// The card's GUI editor. Every config key has a field, grouped in the pack's eight
// sections. It keeps a draft of the raw config, validates each edit with
// normalizeConfig() and sends the full normalized config in config-changed. The editor
// never calls a service: "Fill from unit" only proposes bindings.

import {
  BINDING_KEYS, BINDING_INFO, CONTROL_KEYS, CONTROL_INFO, FEATURE_KEYS, METRIC_KEYS, APPEARANCE_KEYS,
  DEFAULT_APPEARANCE, ENUMS, STATE_MAPPING_KEYS, NAV_ICONS, INPUT_UNITS, ADAPTER_DOMAINS, VERSION,
} from "./constants.js";
import { defaultConfig, normalizeConfig, navPathProblem } from "./config.js";
import { findDevices, proposeConfig } from "./discovery.js";
import { FONT, esc } from "./render.js";

const clone = (v) => JSON.parse(JSON.stringify(v));
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

const SECTIONS = [
  ["setup", "Setup"], ["sensors", "Sensors"], ["controls", "Controls"], ["features", "Features"],
  ["appearance", "Appearance"], ["status", "Status"], ["navigation", "Navigation"], ["advanced", "Advanced"],
];

const FEATURE_LABELS = {
  aircon: "Air conditioning coil", water_circuit: "Water circuit", bypass: "Bypass", humidity: "Humidity",
  health: "Online and fault pills", runtimes: "Runtimes", controls: "Controls", navigation: "Navigation bar",
};
const CONTROL_KIND_LABEL = { select: "Select entity", number: "Number entity", switch: "Switch entity", script: "Script or action" };
const ENUM_LABELS = {
  auto: "Auto", wide: "Wide", compact: "Compact", mobile: "Mobile", comfortable: "Comfortable", fill: "Fill",
  em_dash: "Show —", hide: "Hide the value", disabled: "Off", air_out_minus_air_in: "Air out − air in",
  temperature_ratio: "From temperatures", last_updated: "Last updated", last_reported: "Last reported",
};
const COLOUR_LABELS = {
  background: "Background", equipment: "Equipment", border: "Borders", text: "Text", secondary_text: "Secondary text",
  intake: "Intake air", exhaust: "Exhaust air", supply: "Supply air", extract: "Extract air", bypass: "Bypass",
  water_flow: "Water flow", water_return: "Water return", healthy: "Healthy",
};
const MAPPING_LABELS = {
  online: "Online", fault: "Faults", bypass_position: "Bypass position", coil_status: "Air conditioning status",
};

function getPath(obj, path) {
  return path.split(".").reduce((o, k) => (o === undefined || o === null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split(".");
  let o = obj;
  for (const k of keys.slice(0, -1)) {
    if (!isObj(o[k]) && !Array.isArray(o[k])) o[k] = {};
    o = o[k];
  }
  const last = keys[keys.length - 1];
  if (value === undefined) delete o[last];
  else o[last] = value;
}

const STYLE = `
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

export class MvhrAirflowCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._draft = null;
    this._lastSent = null;
    this._hass = null;
    this._open = new Set(["setup"]);
    this._error = null;
    this._renderedWithHass = false;
  }

  setConfig(config) {
    const json = JSON.stringify(config || {});
    if (this._lastSent !== null && json === this._lastSent) return; // our own echo
    this._draft = clone(config || {});
    this._error = null;
    try { normalizeConfig(this._draft); } catch (e) { this._error = e.message; }
    this._render();
  }

  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first && this._draft) this._render();
  }

  get hass() { return this._hass; }

  // The normalized view the fields read from; falls back to defaults while a draft is invalid.
  _view() {
    try { return normalizeConfig(this._draft); } catch { return { ...defaultConfig(), ...this._draft }; }
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
      const ids = Object.keys((this._hass && this._hass.states) || {})
        .filter((e) => !domains.length || domains.includes(e.split(".")[0])).sort();
      this._lists.set(id, `<datalist id="${id}">${ids.map((e) => `<option value="${esc(e)}"></option>`).join("")}</datalist>`);
    }
    return id;
  }

  _text(path, label, value, { type = "text", list = "", placeholder = "", kind = "text", hint = "" } = {}) {
    return `<label class="f"><span class="l">${esc(label)}</span><input type="${type}" data-path="${path}" data-kind="${kind}"`
      + `${list ? ` list="${list}"` : ""} value="${esc(value === null || value === undefined ? "" : value)}"`
      + `${placeholder ? ` placeholder="${esc(placeholder)}"` : ""} autocomplete="off" spellcheck="false">`
      + `${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</label>`;
  }

  _num(path, label, value, { step = "any", min = "", max = "", placeholder = "" } = {}) {
    return `<label class="f"><span class="l">${esc(label)}</span><input type="number" inputmode="decimal" data-path="${path}" data-kind="number"`
      + ` step="${step}"${min !== "" ? ` min="${min}"` : ""}${max !== "" ? ` max="${max}"` : ""}`
      + ` value="${value === null || value === undefined ? "" : esc(value)}"${placeholder ? ` placeholder="${esc(placeholder)}"` : ""}></label>`;
  }

  _check(path, label, value, extra = "") {
    return `<label class="c"><input type="checkbox" data-path="${path}" data-kind="bool"${value ? " checked" : ""}${extra}>${esc(label)}</label>`;
  }

  _select(path, label, value, options, { kind = "text", structural = false } = {}) {
    return `<label class="f"><span class="l">${esc(label)}</span><select data-path="${path}" data-kind="${kind}"${structural ? " data-structural" : ""}>`
      + options.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value ?? "") ? " selected" : ""}>${esc(t)}</option>`).join("")
      + `</select></label>`;
  }

  _enum(path, label, value) {
    return this._select(path, label, value, ENUMS[path].map((v) => [v, ENUM_LABELS[v] || v]));
  }

  // ---------- sections ----------

  _setup(v) {
    const devices = findDevices(this._hass);
    const devOpts = [["", devices.length ? "Choose a unit…" : "No Nuaire MVHR unit found"], ...devices.map((d) => [d.id, d.name])];
    if (v.device && !devices.some((d) => d.id === v.device)) devOpts.push([v.device, `${v.device} (not found)`]);
    return `<p class="hint">Card ${esc(VERSION)} · schema ${v.schema_version}</p>`
      + `<div class="grid">${this._select("device", "Unit", v.device || "", devOpts, { kind: "text" })}`
      + `${this._text("title", "Title", v.title)}${this._text("subtitle", "Subtitle", v.subtitle)}</div>`
      + `<div class="row"><button type="button" class="primary" data-act="fill"${devices.length ? "" : " disabled"}>Fill sensors and controls from unit</button></div>`
      + `<p class="hint">Fill binds only entities that exist on the chosen unit. Check the result under Sensors and Controls.</p>`
      + this._check("demo", "Demo mode (sample values, no commands)", v.demo)
      + this._check("read_only", "Read-only (controls show state but send nothing)", v.read_only);
  }

  _sensors(v) {
    let html = `<p class="hint">Pick the entity for each reading. Leave a field empty to show it as unavailable.</p>`;
    for (const k of BINDING_KEYS) {
      const info = BINDING_INFO[k];
      const b = v.bindings[k] || {};
      const units = INPUT_UNITS[info.kind] || [];
      const base = `bindings.${k}`;
      html += `<fieldset><legend>${esc(info.label)} <span class="hint">(${k})</span></legend><div class="grid">`
        + this._text(`${base}.entity`, "Entity", b.entity, { list: this._entityList(info.domains), kind: "entity", placeholder: `${info.domains[0]}.example` })
        + this._text(`${base}.attribute`, "Attribute (optional)", b.attribute, { kind: "opt" })
        + (units.length ? this._select(`${base}.input_unit`, "Entity unit", b.input_unit || "", [["", "From the entity"], ...units.map((u) => [u, u === "fraction" ? "Fraction (0–1)" : u])], { kind: "opt" }) : "")
        + (["temperature", "delta", "percent", "runtime"].includes(info.kind) ? this._num(`${base}.precision`, "Decimals (optional)", b.precision, { step: 1, min: 0, max: 4 }) : "")
        + this._text(`${base}.label`, "Label (optional)", b.label, { kind: "opt", placeholder: info.label })
        + (k === "fault" ? this._text(`${base}.extra_entities`, "More fault entities (comma separated)", (b.extra_entities || []).join(", "), { kind: "list", list: this._entityList(info.domains) }) : "")
        + `</div></fieldset>`;
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
      html += `<fieldset><legend>${esc(info.label)}</legend>`
        + this._check(`${base}.visible`, "Show this control", c.visible)
        + `<div class="grid">${this._select(`${base}.adapter.kind`, "Driven by", ad ? ad.kind : "", [["", "Not set up"], ...kinds.map((x) => [x, CONTROL_KIND_LABEL[x]])], { kind: "adapter-kind", structural: true })}`;
      if (ad) {
        if (ad.kind !== "script") {
          html += this._text(`${base}.adapter.entity`, "Entity", ad.entity, { kind: "entity", list: this._entityList(ADAPTER_DOMAINS[ad.kind]) });
        } else {
          html += this._text(`${base}.adapter.action`, "Action", ad.action, { placeholder: "script.turn_on" });
        }
        html += this._text(`${base}.adapter.readback.entity`, ad.kind === "script" ? "Read back from (required)" : "Read back from (optional)", ad.readback.entity, { kind: "entity", list: this._entityList([]) })
          + this._text(`${base}.adapter.readback.attribute`, "Read back attribute (optional)", ad.readback.attribute, { kind: "opt" })
          + this._num(`${base}.adapter.timeout_ms`, "Confirm within (ms)", ad.timeout_ms, { step: 500, min: 1000, max: 120000 });
        if (info.type === "option") {
          for (const lab of info.labels) {
            html += this._text(`${base}.adapter.options.${lab}`, `Button "${lab}" sends`, ad.options ? ad.options[lab] : "", { kind: "opt", placeholder: lab });
          }
        }
        if (info.type === "number") {
          html += this._num(`${base}.adapter.min`, "Minimum (optional)", ad.min)
            + this._num(`${base}.adapter.max`, "Maximum (optional)", ad.max)
            + this._num(`${base}.adapter.step`, "Step (optional)", ad.step, { min: 0.001 })
            + this._num(`${base}.adapter.debounce_ms`, "Wait after last tap (ms)", ad.debounce_ms, { step: 100, min: 0, max: 10000 });
        }
        if (info.type === "boolean" && ad.kind === "script") {
          html += this._text(`${base}.adapter.options.on`, "On sends", ad.options.on, { kind: "opt" })
            + this._text(`${base}.adapter.options.off`, "Off sends", ad.options.off, { kind: "opt" });
        }
        if (ad.kind === "script") {
          html += `<label class="f"><span class="l">Action data (JSON, $value is the chosen value)</span>`
            + `<textarea data-path="${base}.adapter.data" data-kind="json" spellcheck="false">${esc(JSON.stringify(ad.data || {}, null, 2))}</textarea></label>`;
        }
      }
      html += `</div></fieldset>`;
    }
    return html;
  }

  _features(v) {
    let html = `<div class="grid">`;
    for (const k of FEATURE_KEYS) html += this._check(`features.${k}`, FEATURE_LABELS[k], v.features[k]);
    html += `</div><p class="hint">Water circuit needs air conditioning. Navigation shows only when it has enabled items.</p>`
      + `<fieldset><legend>Readings</legend><div class="grid">`;
    for (const k of METRIC_KEYS) html += this._check(`metrics.${k}`, BINDING_INFO[k] ? BINDING_INFO[k].label + (["supply_fan_percent", "extract_fan_percent"].includes(k) ? " fan" : "") : k, v.metrics[k]);
    return html + `</div></fieldset>`;
  }

  _appearance(v) {
    const L = v.layout;
    let html = `<div class="grid">${this._enum("layout.mode", "Layout", L.mode)}${this._enum("layout.width_mode", "Width", L.width_mode)}`
      + this._num("layout.max_content_width", "Comfortable width limit (px)", L.max_content_width, { step: 10, min: 960, max: 4000 })
      + this._num("layout.compact_below", "Compact below (px)", L.compact_below, { step: 1, min: 960, max: 1920 })
      + this._num("layout.mobile_below", "Mobile below (px)", L.mobile_below, { step: 1, min: 480, max: 1200 })
      + this._num("layout.text_scale", "Text size", L.text_scale, { step: 0.05, min: 0.9, max: 1.6 })
      + this._enum("layout.density", "Spacing", L.density)
      + `</div>${this._check("layout.motion", "Animate fans (off when the system asks for reduced motion)", L.motion)}`
      + `<fieldset><legend>Colours</legend><div class="grid">`;
    for (const k of APPEARANCE_KEYS) {
      const val = v.appearance[k];
      html += `<label class="f"><span class="l">${esc(COLOUR_LABELS[k])}</span><span class="colour">`
        + `<input type="color" data-path="appearance.${k}" data-kind="colour" value="${esc(val.length === 4 ? "#" + [...val.slice(1)].map((c) => c + c).join("") : val)}" aria-label="${esc(COLOUR_LABELS[k])} picker">`
        + `<input type="text" data-path="appearance.${k}" data-kind="opt" value="${esc(val)}" aria-label="${esc(COLOUR_LABELS[k])} hex" spellcheck="false"></span></label>`;
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
    return html + `<fieldset><legend>Freshness</legend><div class="grid">`
      + this._enum("freshness.timestamp_policy", "Check age using", v.freshness.timestamp_policy)
      + this._num("freshness.max_age_seconds", "Stale after (seconds)", v.freshness.max_age_seconds, { step: 1, min: 10, max: 604800 })
      + `</div></fieldset>`;
  }

  _navigation(v) {
    let html = `<p class="hint">Links to your other dashboards. Paths start with /, for example /lovelace/mvhr. Items with a problem are left out of the card.</p>`;
    v.navigation.forEach((it, i) => {
      const base = `navigation.${i}`;
      const problem = navPathProblem(it.path, it.external);
      html += `<fieldset><legend>Item ${i + 1}</legend><div class="grid">`
        + this._text(`${base}.label`, "Label", it.label)
        + this._select(`${base}.icon`, "Icon", it.icon, [...NAV_ICONS.map((n) => [n, n]), ...(NAV_ICONS.includes(it.icon) ? [] : [[it.icon, it.icon]])])
        + this._text(`${base}.path`, "Path or URL", it.path, { placeholder: "/lovelace/home" })
        + `</div><div class="row">${this._check(`${base}.enabled`, "Enabled", it.enabled)}${this._check(`${base}.external`, "External link", it.external)}`
        + `${this._check(`${base}.current`, "Always mark as current", it.current)}</div>`
        + (problem ? `<p class="warn">${esc(problem)}</p>` : "")
        + `<div class="row"><button type="button" data-act="nav-up" data-i="${i}"${i ? "" : " disabled"}>Move up</button>`
        + `<button type="button" data-act="nav-down" data-i="${i}"${i < v.navigation.length - 1 ? "" : " disabled"}>Move down</button>`
        + `<button type="button" data-act="nav-remove" data-i="${i}">Remove</button></div></fieldset>`;
    });
    return html + `<div class="row"><button type="button" data-act="nav-add">Add item</button></div>`;
  }

  _advanced(v) {
    const F = v.format;
    return `<fieldset><legend>Number format</legend><div class="grid">`
      + this._enum("format.temperature_unit", "Temperature unit", F.temperature_unit)
      + this._num("format.temperature_precision", "Temperature decimals", F.temperature_precision, { step: 1, min: 0, max: 3 })
      + this._num("format.percent_precision", "Percent decimals", F.percent_precision, { step: 1, min: 0, max: 2 })
      + this._enum("format.unavailable", "When a reading is unavailable", F.unavailable)
      + this._text("format.locale", "Locale", F.locale, { placeholder: "auto", hint: "auto follows Home Assistant, or a tag like en-GB." })
      + `</div></fieldset><fieldset><legend>Derived readings</legend><div class="grid">`
      + this._enum("derived.coil_air_delta", "Coil air ΔT when not bound", v.derived.coil_air_delta)
      + this._enum("derived.recovery_efficiency", "Heat recovery when not bound", v.derived.recovery_efficiency)
      + `</div><p class="hint">Derived values are calculated by the card and only used when the reading has no entity.</p></fieldset>`;
  }

  // ---------- render and events ----------

  _render() {
    if (!this._draft) return;
    const active = this.shadowRoot.activeElement;
    const focusPath = active && active.dataset ? active.dataset.path || active.dataset.act : null;
    for (const d of this.shadowRoot.querySelectorAll("details")) {
      if (d.open) this._open.add(d.dataset.sec); else this._open.delete(d.dataset.sec);
    }
    const v = this._view();
    this._lists = new Map();
    const body = SECTIONS.map(([key, title]) => `<details data-sec="${key}"${this._open.has(key) ? " open" : ""}><summary>${title}</summary>`
      + `<div class="sec">${this[`_${key}`](v)}</div></details>`).join("");
    this.shadowRoot.innerHTML = `<style>${STYLE}</style><div class="top"><div class="err" role="alert" hidden></div>${body}${[...this._lists.values()].join("")}</div>`;
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
      try { value = el.value.trim() ? JSON.parse(el.value) : {}; } catch {
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
      const b = typeof cur === "string" ? { entity: cur } : isObj(cur) ? cur : {};
      if (value === null) delete b[field]; else b[field] = value;
      setPath(draft, `bindings.${key}`, b.entity || (b.extra_entities && b.extra_entities.length) ? b : null);
    } else if (path.startsWith("navigation.")) {
      const [, i, field] = path.split(".");
      draft.navigation[Number(i)][field] = value === null ? "" : value;
      structural = true; // refresh the path warning
    } else if (kind === "number" && value === null) {
      const nullable = /max_age_seconds|\.min$|\.max$|\.step$|\.precision$/.test(path);
      setPath(draft, path, nullable ? null : undefined);
    } else if (path === "device") {
      setPath(draft, path, value);
    } else {
      setPath(draft, path, value === null && kind !== "text" ? undefined : value);
    }
    if (path.startsWith("appearance.")) structural = true; // keep the picker and hex in step
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
      if (!config) { this._error = "No entities found for that unit."; this._showError(); return; }
      this._draft = clone(config);
    } else if (act === "reset-colours") {
      draft.appearance = { ...DEFAULT_APPEARANCE };
    } else if (act.startsWith("nav-")) {
      if (!Array.isArray(draft.navigation)) draft.navigation = [];
      const i = Number(b.dataset.i);
      const n = draft.navigation;
      if (act === "nav-add") {
        n.push({ label: "Home", icon: "home", path: "/lovelace/0", enabled: true });
        if (!draft.features || draft.features.navigation !== true) setPath(draft, "features.navigation", true);
      } else if (act === "nav-remove") n.splice(i, 1);
      else if (act === "nav-up" && i > 0) [n[i - 1], n[i]] = [n[i], n[i - 1]];
      else if (act === "nav-down" && i < n.length - 1) [n[i + 1], n[i]] = [n[i], n[i + 1]];
    } else return;
    this._emit();
    this._render();
  }
}
