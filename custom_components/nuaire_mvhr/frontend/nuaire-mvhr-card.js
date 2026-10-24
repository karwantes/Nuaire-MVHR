/* Nuaire MVHR card: air flow diagram and controls for the MRXBOX VSC.
 *
 * Experimental, requires further testing. Works with the nuaire_mvhr integration and
 * with the ESP bridge's MQTT entities (mrxbox_*). The integration registers this file,
 * so the card type is "custom:nuaire-mvhr-card" with no dashboard resource to add.
 */
const VERSION = "0.2.3-alpha";

const COLORS = {
  intake: "#3fa9f5", supply: "#f5a623", extract: "#e35d4a", exhaust: "#6bb0d6",
  core: "#c9ccd1", house: "#3ecfa0", ac_cool: "#4ac5e0", ac_heat: "#f5804a",
  ac_idle: "#8899a6", water: "#2f9bd8", good: "#3ecfa0", warn: "#f5a623", bad: "#e0554a",
};

// Entities of the unit, found by domain and object_id ending on the unit's device.
const UNIT_ROLES = {
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
  filter_due: ["binary_sensor", "filter_change_due"],
  comms: ["binary_sensor", "communication_with_unit"],
  supply_1: ["number", "supply_speed_1_airflow"],
  supply_2: ["number", "supply_speed_2_airflow"],
  supply_3: ["number", "supply_speed_3_airflow"],
  extract_1: ["number", "extract_speed_1_airflow"],
  extract_2: ["number", "extract_speed_2_airflow"],
  extract_3: ["number", "extract_speed_3_airflow"],
};
const FAULT_ROLES = {
  fault_supply_fan: ["binary_sensor", "supply_fan_fault"],
  fault_extract_fan: ["binary_sensor", "extract_fan_fault"],
  fault_heater: ["binary_sensor", "heater_fault"],
  fault_cooler: ["binary_sensor", "cooler_fault"],
  fault_frost: ["binary_sensor", "frost_fault"],
  test_required: ["binary_sensor", "test_routine_required"],
};
const ALL_ROLES = { ...UNIT_ROLES, ...FAULT_ROLES };

const BAD = new Set(["unavailable", "unknown", "", undefined, null]);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fit = (s, n) => (s = String(s ?? ""), s.length > n ? s.slice(0, n - 1) + "…" : s);
const r1 = (v) => Math.round(v * 10) / 10;

function roundedPath(pts, r = 14) {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const d1 = Math.hypot(x1 - x0, y1 - y0), d2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = x1 - ((x1 - x0) / d1) * rr, ay = y1 - ((y1 - y0) / d1) * rr;
    const bx = x1 + ((x2 - x1) / d2) * rr, by = y1 + ((y2 - y1) / d2) * rr;
    d += ` L${r1(ax)},${r1(ay)} Q${x1},${y1} ${r1(bx)},${r1(by)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L${l[0]},${l[1]}`;
}

// Geometry in viewBox units. Every element sits inside its own box, so nothing overlaps
// at any size: the whole stage scales as one picture.
const LAYOUTS = {
  landscape: {
    w: 1120, h: 620, font: 19,
    intake: [20, 40, 240, 120], exhaust: [20, 460, 240, 120],
    core: [400, 200, 220, 220], coil: [655, 30, 215, 170], house: [900, 180, 200, 260],
    badge: [430, 455, 160, 44],
    ducts: (coil) => ({
      intake: [[260, 100], [330, 100], [330, 235], [400, 235]],
      fresh: [[400, 235], [620, 235]],
      supply: coil ? [[620, 235], [640, 235], [640, 105], [655, 105]] : [[620, 235], [900, 235]],
      supply2: coil ? [[870, 105], [885, 105], [885, 235], [900, 235]] : null,
      extract: [[900, 385], [620, 385]],
      stale: [[620, 385], [400, 385]],
      exhaust: [[400, 385], [330, 385], [330, 520], [260, 520]],
      bypass: [[372, 235], [372, 160], [632, 160], [632, 235]],
    }),
    supplyLabel: (coil) => coil ? [770, 222, "middle"] : [760, 222, "middle"],
    extractLabel: [760, 418, "middle"],
  },
  portrait: {
    w: 600, h: 1040, font: 22,
    intake: [20, 20, 260, 120], exhaust: [320, 20, 260, 120],
    core: [130, 330, 340, 220], coil: [40, 610, 320, 170], house: [20, 840, 560, 180],
    badge: [210, 190, 180, 48],
    ducts: (coil) => ({
      intake: [[150, 140], [150, 250], [200, 250], [200, 330]],
      fresh: [[200, 330], [200, 550]],
      supply: coil ? [[200, 550], [200, 610]] : [[200, 550], [200, 840]],
      supply2: coil ? [[200, 780], [200, 840]] : null,
      extract: [[400, 840], [400, 550]],
      stale: [[400, 550], [400, 330]],
      exhaust: [[400, 330], [400, 250], [450, 250], [450, 140]],
      bypass: [[200, 310], [95, 310], [95, 580], [200, 580]],
    }),
    supplyLabel: (coil) => coil ? [188, 818, "end"] : [188, 700, "end"],
    extractLabel: [416, 690, "start"],
  },
};

class NuaireMvhrCard extends HTMLElement {
  static getConfigElement() {
    return document.createElement("nuaire-mvhr-card-editor");
  }

  static getStubConfig() {
    return { show_coil: false };
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = { show_controls: true, show_status: true, fit_height: true, layout: "auto", ...config };
    this._detected = null;
    this._lastStage = this._lastCtrl = null;
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  getCardSize() {
    return 9;
  }

  getGridOptions() {
    return { columns: "full", min_columns: 6, rows: "auto" };
  }

  connectedCallback() {
    if (this._ro) return;
    this._ro = new ResizeObserver(() => this._resized());
    this._ro.observe(this);
  }

  disconnectedCallback() {
    this._ro?.disconnect();
    this._ro = null;
  }

  // ---- entities ------------------------------------------------------------------

  _detect() {
    const hass = this._hass;
    const key = `${this._config.device || ""}|${Object.keys(hass.entities || {}).length}`;
    if (this._detected?.key === key) return this._detected.map;
    const ents = Object.values(hass.entities || {});
    let dev = this._config.device;
    if (!dev) {
      const e = ents.find((x) => x.platform === "nuaire_mvhr" && x.device_id)
        || hass.entities?.["sensor.mrxbox_humidity"];
      dev = e?.device_id;
    }
    const mine = dev ? ents.filter((x) => x.device_id === dev) : [];
    const map = {};
    for (const [role, [domain, suffix]] of Object.entries(ALL_ROLES)) {
      const hit = mine.find((x) => {
        const [d, oid] = x.entity_id.split(".");
        return d === domain && (oid === suffix || oid.endsWith("_" + suffix));
      });
      const fallback = `${domain}.mrxbox_${suffix}`;
      map[role] = hit?.entity_id || (hass.states[fallback] ? fallback : undefined);
    }
    this._detected = { key, map };
    return map;
  }

  _e(role) {
    const c = this._config;
    if (role in ALL_ROLES) return c.unit?.[role] || this._detect()[role];
    if (role.startsWith("coil_")) return c.coil?.[role.slice(5)];
    return c.entities?.[role];
  }

  _st(role) {
    const id = this._e(role);
    return id ? this._hass.states[id] : undefined;
  }

  _num(role) {
    const s = this._st(role);
    if (!s || BAD.has(s.state)) return null;
    const v = parseFloat(s.state);
    return Number.isFinite(v) ? v : null;
  }

  _on(role) {
    return this._st(role)?.state === "on";
  }

  _fmt(role, digits = 1, unit) {
    const s = this._st(role);
    const v = this._num(role);
    if (v === null) return "—";
    const u = unit ?? s.attributes.unit_of_measurement ?? "";
    return `${v.toFixed(digits)}${u === "%" || u.startsWith("°") ? "" : u ? " " : ""}${u}`;
  }

  _color(k) {
    return this._config.colors?.[k] || COLORS[k];
  }

  // ---- derived state -------------------------------------------------------------

  _speed() {
    const run = this._num("running_speed");
    if (run !== null) return Math.round(run);
    const sel = parseInt(this._st("fan_speed")?.state, 10);
    return Number.isFinite(sel) ? sel : null;
  }

  _running() {
    const comms = this._st("comms");
    if (comms) return comms.state === "on";
    return this._speed() !== null;
  }

  _bypass() {
    const s = this._st("bypass_active");
    if (!s || BAD.has(s.state)) return { tone: this._color("warn"), text: "Bypass ?", open: false };
    // Some units report "on" while the damper is shut and all the air goes through the exchanger.
    const open = (s.state === "on") !== !!this._config.invert_bypass;
    return { tone: open ? this._color("ac_cool") : this._color("core"), text: open ? "Bypass open" : "Bypass closed", open };
  }

  _efficiency() {
    const eff = this._num("efficiency");
    if (eff !== null) return eff;
    const sup = this._num("supply_temp"), inn = this._num("intake_temp"), ext = this._num("extract_temp");
    if (sup === null || inn === null || ext === null || Math.abs(ext - inn) < 2) return null;
    return Math.max(0, Math.min(100, ((sup - inn) / (ext - inn)) * 100));
  }

  _coil() {
    const tin = this._num("coil_air_in") ?? this._num("supply_temp");
    const tout = this._num("coil_air_out");
    const dt = tin !== null && tout !== null ? tout - tin : null;
    const clim = this._st("coil_climate");
    const stateTxt = (this._st("coil_state")?.state || "").toLowerCase();
    const action = (clim?.attributes.hvac_action || "").toLowerCase();
    let mode = "idle";
    if (/cool/.test(action) || /cool/.test(stateTxt)) mode = "cool";
    else if (/heat/.test(action) || /heat/.test(stateTxt)) mode = "heat";
    else if (dt !== null && dt > 0.4) mode = "heat";
    else if (dt !== null && dt < -0.4) mode = "cool";
    const tone = this._color(mode === "cool" ? "ac_cool" : mode === "heat" ? "ac_heat" : "ac_idle");
    return { mode, tone, dt, tout, label: { cool: "Cooling", heat: "Heating", idle: "Idle" }[mode] };
  }

  // ---- render --------------------------------------------------------------------

  _layoutName() {
    const l = this._config.layout;
    if (l === "landscape" || l === "portrait") return l;
    return (this._width || this.clientWidth || 1000) < 720 ? "portrait" : "landscape";
  }

  _resized() {
    const w = this.clientWidth;
    if (!w || w === this._width) return;
    this._width = w;
    if (this._layoutName() !== this._shownLayout) this._render();
    const ctrl = this.shadowRoot?.querySelector(".controls");
    if (ctrl) this.style.setProperty("--nmc-ctrl-h", `${ctrl.offsetHeight}px`);
  }

  _ensureShell() {
    if (this.shadowRoot) return;
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><ha-card><div class="title"></div>
      <div class="stage"><svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet"></svg></div>
      <div class="controls"></div></ha-card>`;
    root.addEventListener("click", (ev) => this._click(ev));
    root.addEventListener("keydown", (ev) => {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches?.("[data-entity],[data-act]") && ev.target.tagName !== "BUTTON") {
        ev.preventDefault();
        this._click(ev);
      }
    });
  }

  _render() {
    if (!this._config || !this._hass) return;
    this._ensureShell();
    const root = this.shadowRoot;
    this._shownLayout = this._layoutName();
    const lay = LAYOUTS[this._shownLayout];
    const title = this._config.title || "";
    const t = root.querySelector(".title");
    t.textContent = title;
    t.hidden = !title;
    root.querySelector("ha-card").classList.toggle("fit", this._config.fit_height !== false);
    // Room kept free under the card for a fixed bar at the bottom of the screen (a kiosk nav bar, say).
    this.style.setProperty("--nmc-bottom", `${Math.max(0, Number(this._config.bottom_offset) || 0)}px`);

    const svg = root.querySelector("svg");
    const stage = this._stage(lay);
    if (stage !== this._lastStage) {
      svg.setAttribute("viewBox", `0 0 ${lay.w} ${lay.h}`);
      svg.style.aspectRatio = `${lay.w} / ${lay.h}`;
      svg.style.setProperty("--f", lay.font);
      svg.innerHTML = stage;   // the <svg> root stays, so the flow dots keep their phase
      this._lastStage = stage;
    }
    const ctrlHtml = this._controls();
    if (ctrlHtml !== this._lastCtrl) {
      const ctrl = root.querySelector(".controls");
      ctrl.innerHTML = ctrlHtml;
      ctrl.hidden = !ctrlHtml;
      this._lastCtrl = ctrlHtml;
      requestAnimationFrame(() => this.style.setProperty("--nmc-ctrl-h", `${ctrl.offsetHeight}px`));
    }
  }

  _node([x, y, w, h], { entity, tone, title, big, lines = [], extra = "" }) {
    const f = LAYOUTS[this._layoutName()].font;
    const chars = Math.floor(w / (f * 0.56));
    const attrs = entity ? `class="node click" data-entity="${esc(entity)}" tabindex="0" role="button"` : `class="node"`;
    let out = `<g ${attrs}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" style="stroke:${tone}"/>`;
    out += `<rect x="${x}" y="${y}" width="6" height="${h}" rx="3" style="fill:${tone}"/>`;
    let ty = y + f * 1.35;
    out += `<text x="${x + 18}" y="${ty}" class="ttl">${esc(fit(title, chars))}</text>`;
    if (big !== undefined) {
      ty += f * 2.05;
      out += `<text x="${x + 18}" y="${ty}" class="big">${esc(fit(big, Math.floor(chars / 1.7)))}</text>`;
    }
    let gap = big !== undefined ? 1.5 : 1.35;
    for (const ln of lines) {
      if (!ln) continue;
      ty += f * gap;
      gap = 1.35;
      if (ty > y + h - 6) break;
      const [txt, ent] = Array.isArray(ln) ? ln : [ln];
      const a = ent ? ` class="sub click" data-entity="${esc(ent)}"` : ` class="sub"`;
      out += `<text x="${x + 18}" y="${ty}"${a}>${esc(fit(txt, chars))}</text>`;
    }
    return out + extra + "</g>";
  }

  _duct(id, pts, color, { active, dur, gradTo, width = 14 } = {}) {
    if (!pts) return "";
    const d = roundedPath(pts);
    let stroke = color, defs = "";
    if (gradTo) {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      defs = `<linearGradient id="g-${id}" gradientUnits="userSpaceOnUse" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}">
        <stop offset="0" stop-color="${color}"/><stop offset="1" stop-color="${gradTo}"/></linearGradient>`;
      stroke = `url(#g-${id})`;
    }
    let out = `${defs ? `<defs>${defs}</defs>` : ""}<g class="flow${active ? "" : " inactive"}">
      <path d="${d}" class="tube" style="stroke:${stroke};stroke-width:${width}"/>
      <path d="${d}" class="core-line" style="stroke:${stroke}"/>`;
    if (active && dur) {
      for (let i = 0; i < 3; i++) {
        out += `<circle r="${width / 2.6}" style="fill:${gradTo || color}"><animateMotion dur="${dur}s" begin="${r1((-dur * i) / 3)}s" repeatCount="indefinite" path="${d}"/></circle>`;
      }
    }
    return out + "</g>";
  }

  _stage(lay) {
    const c = this._config, coilOn = !!c.show_coil;
    const ducts = lay.ducts(coilOn);
    const run = this._running();
    const speed = this._speed();
    const dur = c.speed_seconds?.[speed] ?? { 1: 6, 2: 4, 3: 2.4 }[speed] ?? 4;
    const byp = this._bypass();
    const coil = coilOn ? this._coil() : null;
    const col = (k) => this._color(k);
    const f = lay.font;
    let s = "";

    // Ducts first, nodes on top.
    s += this._duct("bypass", ducts.bypass, col("intake"), { active: run && byp.open, dur, gradTo: col("supply"), width: 10 });
    s += this._duct("intake", ducts.intake, col("intake"), { active: run, dur });
    s += this._duct("fresh", ducts.fresh, col("intake"), { active: run && !byp.open, dur, gradTo: col("supply") });
    s += this._duct("supply", ducts.supply, col("supply"), { active: run, dur });
    s += this._duct("supply2", ducts.supply2, coil?.tone || col("supply"), { active: run, dur });
    s += this._duct("extract", ducts.extract, col("extract"), { active: run, dur });
    s += this._duct("stale", ducts.stale, col("extract"), { active: run, dur, gradTo: col("exhaust") });
    s += this._duct("exhaust", ducts.exhaust, col("exhaust"), { active: run, dur });

    // Outdoor
    s += this._node(lay.intake, {
      entity: this._e("intake_temp"), tone: col("intake"), title: "Outdoor intake", big: this._fmt("intake_temp"),
    });
    const exT = this._e("exhaust_temp");
    s += this._node(lay.exhaust, {
      entity: exT || this._e("extract_temp"), tone: col("exhaust"), title: "Exhaust",
      big: exT ? this._fmt("exhaust_temp") : undefined,
      lines: exT ? [] : ["to outside"],
    });

    // Heat exchanger
    const [cx, cy, cw, ch] = lay.core;
    const eff = this._efficiency();
    const effEnt = this._e("efficiency") || this._e("supply_temp");
    const sp = speed !== null ? `Speed ${speed}` : "Speed —";
    const sup = speed ? this._num(`supply_${speed}`) : null, ext = speed ? this._num(`extract_${speed}`) : null;
    // Portrait has the two air paths through the middle of the box, so keep it short there.
    const air = sup === null || ext === null ? ""
      : lay.w > lay.h ? `Supply ${sup}% · Extract ${ext}%` : `S ${sup}% · E ${ext}%`;
    const mx = cx + cw / 2, my = cy + ch / 2;
    // The whole box is clickable; the lines inside keep their own targets.
    const coreEnt = eff !== null ? effEnt : this._e("running_speed") || this._e("fan_speed");
    s += `<g class="node${coreEnt ? " click" : ""}"${coreEnt ? ` data-entity="${esc(coreEnt)}" tabindex="0" role="button"` : ""}>`;
    s += `<rect x="${cx}" y="${cy}" width="${cw}" height="${ch}" rx="18" class="exch" style="stroke:${col("core")}"/>`;
    for (let i = 1; i < 8; i++) {
      const fx = cx + (cw * i) / 8;
      s += `<line x1="${fx}" y1="${cy + 8}" x2="${fx}" y2="${cy + ch - 8}" class="fin"/>`;
    }
    const chars = Math.floor(cw / (f * 0.56));
    if (eff !== null) {
      s += `<g class="click" data-entity="${esc(effEnt)}" tabindex="0" role="button">
        <text x="${mx}" y="${my - f * 1.1}" class="ttl mid">Heat recovery</text>
        <text x="${mx}" y="${my + f * 0.95}" class="big mid">${Math.round(eff)}%</text></g>`;
      s += `<text x="${mx}" y="${my + f * 2.45}" class="sub mid click" data-entity="${esc(this._e("running_speed") || this._e("fan_speed") || "")}">${esc(fit(sp, chars))}</text>`;
    } else {
      s += `<g class="click" data-entity="${esc(this._e("running_speed") || this._e("fan_speed") || "")}" tabindex="0" role="button">
        <text x="${mx}" y="${my - f * 1.1}" class="ttl mid">Heat exchanger</text>
        <text x="${mx}" y="${my + f * 0.95}" class="big mid">${esc(sp)}</text></g>`;
    }
    if (air) {
      s += `<text x="${mx}" y="${my + f * (eff !== null ? 3.8 : 2.45)}" class="sub mid click" data-entity="${esc(this._e(`supply_${speed}`))}">${esc(fit(air, chars))}</text>`;
    }
    s += "</g>";

    // Bypass badge
    const [bx, by, bw, bh] = lay.badge;
    // The bypass damper is either open or closed, so the badge shows no percentage.
    const mode = this._st("bypass_mode")?.state;
    s +=`<g class="click" data-entity="${esc(this._e("bypass_active") || this._e("bypass_mode") || "")}" tabindex="0" role="button">
      <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh / 2}" class="badge" style="stroke:${byp.tone}"/>
      <text x="${bx + bw / 2}" y="${by + bh / 2 + f * 0.36}" class="sub mid" style="fill:${byp.tone}">${esc(fit(byp.text, Math.floor(bw / (f * 0.5))))}</text></g>`;
    if (mode && !BAD.has(mode)) {
      s += `<text x="${bx + bw / 2}" y="${by + bh + f * 1.05}" class="tiny mid click" data-entity="${esc(this._e("bypass_mode"))}">mode ${esc(mode)}</text>`;
    }

    // Duct labels
    const [lx, ly, la] = lay.supplyLabel(coilOn);
    if (this._e("supply_temp")) {
      s += `<text x="${lx}" y="${ly}" class="sub click" text-anchor="${la}" data-entity="${esc(this._e("supply_temp"))}" style="fill:${col("supply")}">Supply ${esc(this._fmt("supply_temp"))}</text>`;
    }
    const [ex, ey, ea] = lay.extractLabel;
    const hum = this._num("humidity");
    s += `<text x="${ex}" y="${ey}" class="sub click" text-anchor="${ea}" data-entity="${esc(this._e("extract_temp"))}" style="fill:${col("extract")}">Extract ${esc(this._fmt("extract_temp"))}</text>`;
    if (hum !== null) {
      s += `<text x="${ex}" y="${ey + f * 1.3}" class="sub click" text-anchor="${ea}" data-entity="${esc(this._e("humidity"))}" style="fill:${col("extract")}">RH ${Math.round(hum)}%</text>`;
    }

    // Coil
    if (coil) {
      const lines = [];
      if (coil.tout !== null) lines.push([`Air out ${this._fmt("coil_air_out")}`, this._e("coil_air_out")]);
      // Lines whose sensor is missing or unavailable are left out, so the box keeps room.
      const pw = this._num("coil_power") !== null ? this._fmt("coil_power", 2) : null;
      const dt = coil.dt !== null ? `ΔT ${coil.dt > 0 ? "+" : ""}${coil.dt.toFixed(1)}°` : null;
      if (pw || dt) lines.push([[pw, dt].filter(Boolean).join(" · "), pw ? this._e("coil_power") : this._e("coil_air_out")]);
      const wf = this._num("coil_water_flow_temp"), wr = this._num("coil_water_return_temp");
      if (wf !== null || wr !== null) {
        lines.push([`Water ${wf !== null ? wf.toFixed(1) : "—"}→${wr !== null ? wr.toFixed(1) : "—"}°`, this._e("coil_water_flow_temp") || this._e("coil_water_return_temp")]);
      }
      if (this._num("coil_water_flow") !== null) lines.push([`Flow ${this._fmt("coil_water_flow")}`, this._e("coil_water_flow")]);
      if (this._num("coil_water_buffer") !== null) lines.push([`Buffer ${this._fmt("coil_water_buffer")}`, this._e("coil_water_buffer")]);
      s += this._node(lay.coil, {
        entity: this._e("coil_climate") || this._e("coil_state") || this._e("coil_air_out"),
        tone: coil.tone, title: `Coil · ${coil.label}`, lines,
      });
    }

    // House
    const [hx, hy, hw, hh] = lay.house;
    const houseT = this._e("house_temp") ? "house_temp" : "extract_temp";
    const houseH = this._e("house_humidity") ? "house_humidity" : "humidity";
    const tgt = this._st("house_target");
    const lines = [[`Humidity ${this._fmt(houseH, 0)}`, this._e(houseH)]];
    let extra = "";
    if (tgt) {
      const v = tgt.attributes.temperature;
      lines.push([`Target ${v ?? "—"}°`, tgt.entity_id]);
      const by2 = hy + hh - f * 1.6;
      const bxr = hx + hw - f * 1.6;
      for (const [dx, sign, d] of [[0, "+", 1], [-f * 2.4, "−", -1]]) {
        extra += `<g class="btn" data-act="clim" data-e="${esc(tgt.entity_id)}" data-d="${d}" tabindex="0" role="button" aria-label="Target ${sign}">
          <circle cx="${bxr + dx}" cy="${by2}" r="${f * 0.95}"/><text x="${bxr + dx}" y="${by2 + f * 0.36}" class="sub mid">${sign}</text></g>`;
      }
    }
    s += this._node(lay.house, {
      entity: this._e(houseT), tone: col("house"), title: "House",
      big: this._fmt(houseT), lines, extra,
    });
    return s;
  }

  _controls() {
    const c = this._config;
    let out = "";
    if (c.show_controls !== false) {
      const seg = (role, label, opts) => {
        const st = this._st(role);
        if (!st) return "";
        const options = opts || st.attributes.options || [];
        const dis = BAD.has(st.state) ? " disabled" : "";
        return `<div class="grp"><span class="lbl click" data-entity="${esc(st.entity_id)}" tabindex="0" role="button">${label}</span><div class="seg">${
          options.map((o) => `<button data-act="opt" data-e="${esc(st.entity_id)}" data-v="${esc(o)}" class="${st.state === o ? "on" : ""}"${dis}>${esc(o)}</button>`).join("")
        }</div></div>`;
      };
      const tog = (role, label) => {
        const st = this._st(role);
        if (!st) return "";
        const dis = BAD.has(st.state) ? " disabled" : "";
        return `<button class="pill ${st.state === "on" ? "on" : ""}" data-act="toggle" data-e="${esc(st.entity_id)}"${dis}>${label}</button>`;
      };
      out += seg("fan_speed", "Fan speed");
      out += seg("bypass_mode", "Bypass");
      const sp = this._st("bypass_setpoint");
      if (sp) {
        const dis = BAD.has(sp.state) ? " disabled" : "";
        out += `<div class="grp"><span class="lbl click" data-entity="${esc(sp.entity_id)}" tabindex="0" role="button">Bypass above</span><div class="seg">
          <button data-act="num" data-e="${esc(sp.entity_id)}" data-d="-1"${dis} aria-label="Lower">−</button>
          <span class="val click" data-entity="${esc(sp.entity_id)}">${esc(this._fmt("bypass_setpoint", 0))}</span>
          <button data-act="num" data-e="${esc(sp.entity_id)}" data-d="1"${dis} aria-label="Raise">+</button></div></div>`;
      }
      const toggles = tog("night", "Night") + tog("holiday", "Holiday");
      if (toggles) out += `<div class="grp">${toggles}</div>`;
    }
    if (c.show_status !== false) {
      const chip = (ent, txt, tone) => ent ? `<span class="chip click ${tone}" data-entity="${esc(ent)}" tabindex="0" role="button">${esc(txt)}</span>` : "";
      let chips = "";
      const comms = this._st("comms");
      if (comms) chips += chip(comms.entity_id, comms.state === "on" ? "Unit online" : "Unit offline", comms.state === "on" ? "good" : "bad");
      const due = this._on("filter_due");
      const fh = this._num("filter_hours");
      if (this._e("filter_hours") || this._e("filter_due")) {
        chips += chip(due ? this._e("filter_due") : this._e("filter_hours") || this._e("filter_due"),
          due ? "Filter change due" : `Filter ${fh !== null ? Math.round(fh) + " h" : "—"}`, due ? "warn" : "");
      }
      const faults = Object.keys(FAULT_ROLES).map((r) => this._st(r)).filter(Boolean);
      if (faults.length) {
        const active = faults.filter((x) => x.state === "on");
        chips += chip((active[0] || faults[0]).entity_id, active.length ? `${active.length} fault${active.length > 1 ? "s" : ""}` : "No faults", active.length ? "bad" : "good");
      }
      const rh = this._num("run_hours");
      if (rh !== null) chips += chip(this._e("run_hours"), `Run ${Math.round(rh)} h`, "");
      if (chips) out += `<div class="grp chips">${chips}</div>`;
    }
    return out;
  }

  // ---- actions -------------------------------------------------------------------

  _click(ev) {
    const path = ev.composedPath();
    const act = path.find((n) => n.dataset?.act);
    if (act) {
      ev.stopPropagation();
      if (act.disabled) return;
      this._action(act.dataset);
      return;
    }
    const ent = path.find((n) => n.dataset?.entity);
    if (ent?.dataset.entity) {
      const e = new Event("hass-more-info", { bubbles: true, composed: true });
      e.detail = { entityId: ent.dataset.entity };
      this.dispatchEvent(e);
    }
  }

  _action({ act, e, v, d }) {
    const hass = this._hass, st = hass.states[e];
    if (!st) return;
    if (act === "opt") {
      if (st.state !== v) hass.callService("select", "select_option", { entity_id: e, option: v });
    } else if (act === "toggle") {
      hass.callService("switch", "toggle", { entity_id: e });
    } else if (act === "num") {
      const a = st.attributes, step = a.step || 1;
      const cur = parseFloat(st.state);
      const base = Number.isFinite(cur) ? cur : (a.min ?? 0);
      const val = Math.min(a.max ?? Infinity, Math.max(a.min ?? -Infinity, base + step * Number(d)));
      hass.callService("number", "set_value", { entity_id: e, value: val });
    } else if (act === "clim") {
      const a = st.attributes, step = this._config.target_step || a.target_temp_step || 0.5;
      if (typeof a.temperature !== "number") return;
      const val = Math.min(a.max_temp ?? 35, Math.max(a.min_temp ?? 5, Math.round((a.temperature + step * Number(d)) / step) * step));
      hass.callService("climate", "set_temperature", { entity_id: e, temperature: val });
    }
  }
}

const CSS = `
  :host { display: block; padding-bottom: var(--nmc-bottom, 0px); }
  ha-card { display: block; container-type: inline-size; overflow: hidden; padding: 8px 8px 10px;
    color: var(--nmc-text, var(--primary-text-color)); }
  .title { font-size: clamp(16px, 0.6rem + 0.9cqw, 34px); font-weight: 500; padding: 6px 10px 2px; }
  .stage { display: block; }
  svg { display: block; width: 100%; height: auto; overflow: visible;
    font-family: var(--ha-font-family-body, var(--paper-font-body1_-_font-family, sans-serif)); }
  /* The floor stops a short screen (phone on its side) squeezing the drawing to nothing; the page scrolls instead. */
  ha-card.fit svg { max-height: max(320px, calc(100vh - var(--header-height, 56px) - var(--nmc-ctrl-h, 0px) - var(--nmc-bottom, 0px) - 64px)); }
  .node > rect:first-child { fill: var(--secondary-background-color, rgba(127,127,127,.08)); stroke-width: 2; }
  .exch { fill: var(--secondary-background-color, rgba(127,127,127,.08)); stroke-width: 3; }
  .fin { stroke: var(--divider-color, rgba(127,127,127,.3)); stroke-width: 1.5; }
  .badge { fill: var(--card-background-color, #fff); stroke-width: 2.5; }
  text { fill: currentColor; font-size: calc(var(--f) * 1px); }
  .ttl { fill: var(--secondary-text-color); }
  .big { font-size: calc(var(--f) * 1.9px); font-weight: 600; }
  .sub { font-size: calc(var(--f) * 1px); }
  .tiny { font-size: calc(var(--f) * 0.8px); fill: var(--secondary-text-color); }
  .mid { text-anchor: middle; }
  .tube { fill: none; stroke-opacity: .28; stroke-linecap: round; stroke-linejoin: round; }
  .core-line { fill: none; stroke-width: 3; stroke-linecap: round; }
  .flow.inactive { opacity: .15; }
  .click { cursor: pointer; }
  .click:hover > rect:first-child, .click:focus-visible > rect:first-child { stroke-width: 4; }
  text.click:hover, .click:hover text.big { text-decoration: underline; }
  text.click, .click text { pointer-events: bounding-box; }
  .btn { cursor: pointer; }
  .btn circle { fill: var(--card-background-color, #fff); stroke: var(--secondary-text-color); stroke-width: 2; }
  .btn:hover circle { stroke: var(--primary-color); stroke-width: 3; }
  [tabindex]:focus-visible { outline: 2px solid var(--primary-color); outline-offset: 2px; }
  .controls { display: flex; flex-wrap: wrap; gap: .6em 1.2em; align-items: center; justify-content: center;
    padding: .6em .4em 0; font-size: clamp(13px, 0.4rem + 0.6cqw, 30px); }
  .controls[hidden] { display: none; }
  .grp { display: flex; align-items: center; gap: .45em; flex-wrap: wrap; justify-content: center; }
  .lbl { color: var(--secondary-text-color); }
  .seg { display: inline-flex; align-items: center; border: 1px solid var(--divider-color, #8884);
    border-radius: 999px; overflow: hidden; }
  .seg button, .pill { font: inherit; color: inherit; background: none; border: 0; cursor: pointer;
    padding: .35em .9em; min-width: 2.6em; min-height: 2.2em; }
  .seg button + button { border-left: 1px solid var(--divider-color, #8884); }
  .seg button.on, .pill.on { background: var(--primary-color); color: var(--text-primary-color, #fff); }
  .seg button:disabled, .pill:disabled { opacity: .4; cursor: default; }
  .val { padding: 0 .6em; min-width: 3em; text-align: center; }
  .pill { border: 1px solid var(--divider-color, #8884); border-radius: 999px; }
  .chip { border-radius: 999px; padding: .3em .8em; background: var(--secondary-background-color, #8882); }
  .chip.good { color: ${COLORS.good}; } .chip.warn { color: ${COLORS.warn}; } .chip.bad { color: ${COLORS.bad}; font-weight: 600; }
  .chips { gap: .45em; }
`;

// ---- GUI editor --------------------------------------------------------------------

const ent = (name, domain) => ({ name, selector: { entity: domain ? { domain } : {} } });
const LABELS = {
  title: "Title", device: "MVHR device (blank: find it)", layout: "Layout",
  show_controls: "Show controls", show_status: "Show status chips", fit_height: "Fit to screen height",
  show_coil: "Show coil (heating/cooling after the MVHR)",
  bottom_offset: "Space under the card for a fixed bottom bar (px)",
  invert_bypass: "Bypass active 'on' means air goes through the exchanger",
  supply_temp: "Supply air temperature (after the MVHR)", exhaust_temp: "Exhaust air temperature",
  efficiency: "Heat recovery efficiency sensor",
  house_temp: "House temperature", house_humidity: "House humidity", house_target: "House target (climate)",
  climate: "Coil climate entity", power: "Coil power", state: "Coil state sensor",
  air_in: "Air into coil", air_out: "Air out of coil", water_flow_temp: "Water flow temperature",
  water_return_temp: "Water return temperature", water_flow: "Water flow rate", water_buffer: "Buffer temperature",
};

function editorSchema(cfg) {
  const schema = [
    { name: "title", selector: { text: {} } },
    { name: "device", selector: { device: {} } },
    { name: "layout", selector: { select: { mode: "dropdown", options: [
      { value: "auto", label: "Auto (by width)" }, { value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" },
    ] } } },
    { type: "grid", name: "", schema: [
      { name: "show_controls", selector: { boolean: {} } },
      { name: "show_status", selector: { boolean: {} } },
      { name: "fit_height", selector: { boolean: {} } },
      { name: "show_coil", selector: { boolean: {} } },
      { name: "invert_bypass", selector: { boolean: {} } },
    ] },
    { name: "bottom_offset", selector: { number: { min: 0, max: 200, step: 1, mode: "box", unit_of_measurement: "px" } } },
    { type: "expandable", name: "entities", title: "Extra sensors", schema: [
      ent("supply_temp", "sensor"), ent("exhaust_temp", "sensor"), ent("efficiency", "sensor"),
      ent("house_temp", "sensor"), ent("house_humidity", "sensor"),
      ent("house_target", "climate"),
    ] },
  ];
  if (cfg.show_coil) {
    schema.push({ type: "expandable", name: "coil", title: "Coil", schema: [
      ent("climate", "climate"), ent("state"), ent("power", "sensor"), ent("air_in", "sensor"), ent("air_out", "sensor"),
      ent("water_flow_temp", "sensor"), ent("water_return_temp", "sensor"), ent("water_flow", "sensor"), ent("water_buffer", "sensor"),
    ] });
  }
  schema.push({ type: "expandable", name: "unit", title: "Unit entities (found automatically)",
    schema: Object.entries(ALL_ROLES).map(([k, [d]]) => ent(k, d)) });
  schema.push({ type: "expandable", name: "colors", title: "Colours", schema: [
    { type: "grid", name: "", schema: ["intake", "supply", "extract", "exhaust", "house", "ac_cool", "ac_heat", "ac_idle"]
      .map((k) => ({ name: k, selector: { text: {} } })) },
  ] });
  return schema;
}

class NuaireMvhrCardEditor extends HTMLElement {
  setConfig(config) {
    this._config = { ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    if (this._form) this._form.hass = hass;
    else this._render();
  }

  _render() {
    if (!this._hass || !this._config) return;
    if (!this._form) {
      this._form = document.createElement("ha-form");
      this._form.computeLabel = (s) => LABELS[s.name] || s.title
        || s.name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
      this._form.addEventListener("value-changed", (ev) => {
        const cfg = { ...ev.detail.value };
        for (const k of ["entities", "coil", "unit", "colors"]) {
          if (cfg[k]) {
            cfg[k] = Object.fromEntries(Object.entries(cfg[k]).filter(([, v]) => v !== "" && v != null));
            if (!Object.keys(cfg[k]).length) delete cfg[k];
          }
        }
        if (!cfg.device) delete cfg.device;
        this._config = cfg;
        this._form.schema = editorSchema(cfg);
        this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: cfg }, bubbles: true, composed: true }));
      });
      this.appendChild(this._form);
    }
    this._form.hass = this._hass;
    this._form.data = { show_controls: true, show_status: true, fit_height: true, layout: "auto", ...this._config };
    this._form.schema = editorSchema(this._config);
  }
}

if (!customElements.get("nuaire-mvhr-card")) {
  customElements.define("nuaire-mvhr-card", NuaireMvhrCard);
  customElements.define("nuaire-mvhr-card-editor", NuaireMvhrCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "nuaire-mvhr-card",
    name: "Nuaire MVHR",
    description: "Air flow diagram and controls for a Nuaire MRXBOX (experimental).",
    preview: true,
    documentationURL: "https://github.com/karwantes/Nuaire-MVHR",
  });
  console.info(`%c NUAIRE-MVHR-CARD %c ${VERSION} `, "background:#3fa9f5;color:#fff", "");
}
