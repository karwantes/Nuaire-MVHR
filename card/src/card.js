// The Lovelace card element. Owns lifecycle, measurement, rendering and user actions.
// Rendering is section by section: a section's markup is replaced only when it changed,
// so focus and hover survive unrelated state updates. Nothing here sends a command
// except a deliberate click on a control.

import { CONTROL_KEYS, CONTROL_INFO, ALIAS_TYPE } from "./constants.js";
import {
  ConfigError, defaultConfig, normalizeConfig, effectiveFeatures, metricVisible, controlVisible,
  isUnconfigured, navPathProblem,
} from "./config.js";
import { buildModel, watchedEntities, optionLabel, parseNumber, toCelsius, fromCelsius, displayTempUnit, localeOf } from "./state.js";
import { computeLayout, heuristicMeasure } from "./layout.js";
import { FONT, esc, layoutInputs, renderSvg, renderLabels, renderHeader, renderControls, renderRuntimes, renderNav } from "./render.js";
import { Commander, readbackSource, readbackValue } from "./actions.js";
import { demoHass, demoBindings } from "./fixture.js";
import { findDevices, proposeConfig } from "./discovery.js";

let instances = 0;
const NAV_ITEM_MIN = 76;
const lc = (s) => String(s).trim().toLowerCase();
const mix = (v, pct) => `color-mix(in srgb, var(--mvhr-${v}) ${pct}%, transparent)`;

const STYLE = `
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

// Canvas text measurement in the card's own font, cached per (text, size, weight).
function makeMeasure() {
  const cache = new Map();
  let ctx = null;
  try { ctx = document.createElement("canvas").getContext("2d"); } catch { ctx = null; }
  const m = (text, size, weight = 400) => {
    const k = `${weight}|${size}|${text}`;
    let v = cache.get(k);
    if (v === undefined) {
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

export class MvhrAirflowCard extends HTMLElement {
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
    this._local = {}; // stepper values waiting for debounce or confirmation
    this._debounce = {};
    this._moreOpen = false;
    this._width = 0;
    this._cardWidth = 0;
    this._measure = makeMeasure();
    this._commander = new Commander(() => this._schedule());
    this._onClick = (e) => this._click(e);
    this._onKey = (e) => this._key(e);
    this._onDocClick = (e) => {
      if (this._moreOpen && !e.composedPath().some((n) => n && n.classList && n.classList.contains("more-wrap") && this.shadowRoot.contains(n))) {
        this._moreOpen = false;
        this._schedule();
      }
    };
    this._onLocation = () => { this._moreOpen = false; this._schedule(); };
    this.layoutModel = null;
  }

  setConfig(config) {
    const cfg = normalizeConfig(config); // ConfigError reaches HA's error card
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

  get hass() { return this._hass; }

  // HA sets layout = "panel" on the card of a panel view.
  set layout(v) { this._layout = v; this.toggleAttribute("panel", v === "panel"); }
  get layout() { return this._layout; }
  set isPanel(v) { this.toggleAttribute("panel", !!v); } // HA before 2024.x

  set preview(v) { this._preview = !!v; this._schedule(); }
  get preview() { return this._preview; }

  // HA's edit wrapper around this card, if any. In a panel view its Edit bar can end up out of
  // sight, so the card then shows its own Edit button that fires the same event.
  _cardOptions() {
    let n = this;
    for (let i = 0; n && i < 6; i++) {
      if (n.localName === "hui-card-options") return n;
      n = n.parentElement || (n.getRootNode && n.getRootNode().host);
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
    const s = ids.map((id) => (h.states ? h.states[id] : undefined));
    s.push(h.connected, h.locale && h.locale.language, h.language, h.config && h.config.unit_system && h.config.unit_system.temperature);
    return s;
  }

  connectedCallback() {
    if (!this.shadowRoot.querySelector(".wrap")) {
      this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card><div class="wrap">`
        + `<div class="head" data-sec="head"></div><div class="body" data-sec="body" style="display:contents"></div>`
        + `</div></ha-card>`;
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
      }).catch(() => {});
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
    // Pending commands lose their UI; their timers must not fire into a detached card.
    this._commander.dispose();
  }

  _setupFreshness() {
    if (this._fresh) clearInterval(this._fresh);
    this._fresh = 0;
    const c = this._cfg;
    if (!this.isConnected || !c || c.freshness.timestamp_policy === "disabled" || !c.freshness.max_age_seconds) return;
    this._fresh = setInterval(() => { this._html = { ...this._html, head: null }; this._sig = null; this._schedule(); }, 15000);
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
      try { this._render(); } catch (e) { this._renderFailure(e); }
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
      this._html[name] = undefined;
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
    console.warn("mvhr-airflow-card:", e); // eslint-disable-line no-console
  }

  _render() {
    if (!this._wrap || !this._cfg) return;
    const cfg = this._effCfg();
    const raw = this._cfg;
    const hass = this._effHass();
    const wrap = this._wrap;
    const appearance = Object.entries(raw.appearance).filter(([k]) => typeof raw.appearance[k] === "string")
      .map(([k, v]) => `--mvhr-${k}:${v}`).join(";");
    const model = buildModel(hass, cfg);
    const pill = model.coil === "heating" ? "var(--mvhr-extract)" : model.coil === "cooling" ? "var(--mvhr-intake)" : "var(--mvhr-secondary_text)";
    const comfortable = raw.layout.width_mode === "comfortable";
    wrap.setAttribute("style", `${appearance};--mvhr-pill:${pill};max-width:${comfortable ? raw.layout.max_content_width + "px" : "none"};font-size:${16 * raw.layout.text_scale}px`);
    wrap.dataset.density = raw.layout.density;
    wrap.dataset.motion = raw.layout.motion ? "on" : "off";
    if (raw.layout.motion === "always") wrap.dataset.motionForced = ""; else delete wrap.dataset.motionForced;
    if (raw.demo) wrap.dataset.demo = ""; else delete wrap.dataset.demo;

    const features = effectiveFeatures(cfg);
    this._section("head", renderHeader(raw, model, features), wrap);
    const opts = this._preview ? this._cardOptions() : null;
    const panelEdit = opts && (this.hasAttribute("panel") || opts.classList.contains("panel") || (opts.parentNode && opts.parentNode.host && opts.parentNode.host.localName === "hui-panel-view"));
    this._section("editbar", panelEdit ? `<button type="button" class="editbtn" data-act="edit-card">Edit card</button>` : null, wrap, "div", { class: "editbar" });
    const body = wrap.querySelector('[data-sec="body"]');

    if (!raw.demo && isUnconfigured(raw)) {
      wrap.dataset.mode = "onboarding";
      for (const s of ["diagram", "controls", "runtimes", "nav"]) this._section(s, null, body);
      this._section("onboard", `<strong>Set up the MVHR card.</strong> Open the card editor and choose your unit under Setup, `
        + `or turn on Demo mode to preview it with sample values.`, body, "div", { class: "onboard" });
      this.layoutModel = null;
      return;
    }
    this._section("onboard", null, body);

    // Diagram: lay out to the measured box width, choose the mode from the card width.
    let diagram = body.querySelector(':scope > [data-sec="diagram"]');
    if (!diagram) {
      diagram = document.createElement("div");
      diagram.className = "diagram";
      diagram.dataset.sec = "diagram";
      body.insertBefore(diagram, body.firstChild);
      this._html.diagram = undefined;
    }
    if (this._ro && this._observed !== diagram) { this._ro.observe(diagram); this._observed = diagram; }
    const width = Math.floor(diagram.clientWidth || wrap.clientWidth || 800);
    const card = this.shadowRoot.querySelector("ha-card");
    const cardWidth = Math.floor((card && card.clientWidth) || width);
    const L = computeLayout(cfg, layoutInputs(cfg, model, hass, width, cardWidth, this._measure));
    this.layoutModel = L;
    wrap.dataset.mode = L.mode;
    diagram.classList.toggle("overwide", !!L.overwide);
    const dHtml = `<div class="stage" style="width:${L.W}px;height:${L.H}px">${renderSvg(L, this._uid, model, { motion: raw.layout.motion })}`
      + `<div class="labels">${renderLabels(L, model)}</div></div>`;
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

    // Controls
    const states = this._controlStates(cfg, hass);
    this._section("controls", states.length ? renderControls(states) : null, body, "div", { class: "controls", role: "group", "aria-label": "MVHR controls" });

    // Runtimes
    const rt = features.runtimes ? renderRuntimes(cfg, model, metricVisible) : "";
    this._section("runtimes", rt ? rt : null, body, "div", { class: "runtimes" });

    // Navigation
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
    const ent = (ad && ad.entity && hass && hass.states && hass.states[ad.entity])
      || (src && hass && hass.states && hass.states[src.entity]) || null;
    const at = (ent && ent.attributes) || {};
    const min = ad && ad.min !== null && ad.min !== undefined ? ad.min : parseNumber(at.min);
    const max = ad && ad.max !== null && ad.max !== undefined ? ad.max : parseNumber(at.max);
    const step = ad && ad.step ? ad.step : parseNumber(at.step) || 1;
    const unit = at.unit_of_measurement || (cfg.bindings.bypass_threshold && cfg.bindings.bypass_threshold.input_unit) || "°C";
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
    const so = target && hass.states ? hass.states[target] : undefined;
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
        if (v !== undefined && v !== null && ad && ad.kind === "script" && ad.options) {
          v = lc(v) === lc(ad.options.on) ? "on" : lc(v) === lc(ad.options.off) ? "off" : v;
        }
        s.selected = v === undefined || v === null ? null : lc(v) === "on" ? "on" : lc(v) === "off" ? "off" : null;
      } else {
        const ni = this._numberInfo(cfg, hass, key);
        if (!s.pending && !this._debounce[key]) delete this._local[key];
        const v = key in this._local ? this._local[key] : parseNumber(raw);
        const unit = displayTempUnit(cfg, hass);
        if (v === null || v === undefined) s.display = "—";
        else {
          const shown = fromCelsius(toCelsius(v, ni.unit), unit);
          const same = (ni.unit === "°F" || ni.unit === "F") === (unit === "°F");
          const d = same ? decimals(ni.step) : 0;
          let txt;
          try { txt = new Intl.NumberFormat(localeOf(cfg, hass), { minimumFractionDigits: d, maximumFractionDigits: d }).format(shown); } catch { txt = shown.toFixed(d); }
          s.display = `${txt.replace(/^-/, "−")}${unit}`;
        }
        s.canDec = v !== null && v !== undefined && (ni.min === null || v - ni.step >= ni.min - 1e-9);
        s.canInc = v !== null && v !== undefined && (ni.max === null || v + ni.step <= ni.max + 1e-9);
        if (this._debounce[key] && !s.pending && !s.error) s.note = "Adjusting…";
      }
      out.push(s);
    }
    // "Adjusting…" uses the reason slot only while the control is otherwise enabled.
    for (const s of out) if (s.note && !s.disabled) s.reason = s.note;
    return out;
  }

  _command(key, value) {
    const cfg = this._effCfg();
    const hass = this._effHass();
    if (this._disabledReason(cfg, hass, key)) return;
    if (this._commander.get(key).pending) return;
    this._commander.clearError(key);
    const step = CONTROL_INFO[key].type === "number" ? this._numberInfo(cfg, hass, key).step : undefined;
    this._commander.run(hass, cfg, key, value, step);
  }

  _step(key, dir) {
    const cfg = this._effCfg();
    const hass = this._effHass();
    if (this._disabledReason(cfg, hass, key) || this._commander.get(key).pending) return;
    const ni = this._numberInfo(cfg, hass, key);
    const current = key in this._local ? this._local[key] : parseNumber(readbackValue(hass, readbackSource(cfg, key)));
    if (current === null || current === undefined) return;
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
      if (target === undefined || (now !== null && Math.abs(now - target) < 1e-9) || this._disabledReason(c, h, key)) {
        delete this._local[key];
        this._schedule();
        return;
      }
      if (!this._commander.run(h, c, key, target, ni.step)) delete this._local[key];
      this._schedule();
    }, ad && ad.debounce_ms !== undefined ? ad.debounce_ms : 800);
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
      if (t.dataset.step) { this._step(key, Number(t.dataset.step)); return; }
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
    if (t.dataset.nav !== undefined) {
      const it = (this._navItems || [])[Number(t.dataset.nav)];
      if (!it || it.external) return; // external opens in a new tab natively
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
      requestAnimationFrame(() => { const b = this.shadowRoot.querySelector(".more"); if (b) b.focus({ preventScroll: true }); });
      return;
    }
    const b = e.target.closest && e.target.closest(".segbtn");
    if (b && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      const sib = e.key === "ArrowLeft" ? b.previousElementSibling : b.nextElementSibling;
      if (sib) { e.preventDefault(); sib.focus(); }
    }
  }
}

export { ConfigError };
