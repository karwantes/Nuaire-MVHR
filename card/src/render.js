// Renders a computed layout to SVG (routes, enclosures, icons) plus HTML text overlays,
// and builds the header, controls, runtimes and navigation markup.

import { displayTempUnit } from "./state.js";
import { CONTROL_INFO } from "./constants.js";
import { iconGroup, iconSvg } from "./icons.js";

const BYPASS_TEXT = { open: "Bypass open", closed: "Bypass closed", unknown: "Bypass position unknown", unbound: "Bypass position unknown" };
const COIL_TEXT = { idle: "Idle", heating: "Heating", cooling: "Cooling", off: "Off", unknown: "Unknown", unbound: "Unknown" };

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const n = (v) => Math.round(v * 10) / 10;
const cv = (c) => `var(--mvhr-${c})`;

export function layoutInputs(cfg, model, hass, width, cardWidth, measure) {
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
      bypassMode: model.bypassMode,
    },
  };
}

// ---------- SVG ----------

// Orthogonal polyline with rounded corners.
function routePath(pts, r = 10) {
  let d = `M${n(pts[0][0])} ${n(pts[0][1])}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const d1 = Math.hypot(x1 - x0, y1 - y0);
    const d2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, d1 / 2, d2 / 2);
    const ax = x1 - ((x1 - x0) / d1) * rr;
    const ay = y1 - ((y1 - y0) / d1) * rr;
    const bx = x1 + ((x2 - x1) / d2) * rr;
    const by = y1 + ((y2 - y1) / d2) * rr;
    d += ` L${n(ax)} ${n(ay)} Q${n(x1)} ${n(y1)} ${n(bx)} ${n(by)}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${n(last[0])} ${n(last[1])}`;
}

// Solid arrowhead. The wrapping group carries the travel vector for the flow animation:
// the head glides half a step either side of its resting point and fades at the ends.
function arrowHead(a, travel, s = 7) {
  const { x, y } = a;
  const d = {
    right: `M${n(x + s)} ${n(y)} L${n(x - s * 0.7)} ${n(y - s)} L${n(x - s * 0.7)} ${n(y + s)} Z`,
    left: `M${n(x - s)} ${n(y)} L${n(x + s * 0.7)} ${n(y - s)} L${n(x + s * 0.7)} ${n(y + s)} Z`,
    down: `M${n(x)} ${n(y + s)} L${n(x - s)} ${n(y - s * 0.7)} L${n(x + s)} ${n(y - s * 0.7)} Z`,
    up: `M${n(x)} ${n(y - s)} L${n(x - s)} ${n(y + s * 0.7)} L${n(x + s)} ${n(y + s * 0.7)} Z`,
  }[a.dir];
  const v = { right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1] }[a.dir];
  const h = travel / 2;
  return `<g class="flow" style="--fx0:${n(-v[0] * h)}px;--fy0:${n(-v[1] * h)}px;--fx1:${n(v[0] * h)}px;--fy1:${n(v[1] * h)}px">`
    + `<path class="arrow" data-dir="${a.dir}" d="${d}"/></g>`;
}

// How far an arrow may glide: most of the gap to its neighbours on the same segment.
function travelFor(e, a) {
  const [x1, y1] = e.points[a.seg];
  const [x2, y2] = e.points[a.seg + 1];
  const count = e.arrows.filter((b) => b.seg === a.seg).length;
  return Math.min(64, (Math.hypot(x2 - x1, y2 - y1) / count) * 0.7);
}

// Coil tube: a hairpin of three passes inside a rounded frame.
function hairpin(s, state) {
  const r = s.h / 2;
  const frame = `<rect class="serp-frame" x="${n(s.x)}" y="${n(s.y)}" width="${n(s.w)}" height="${n(s.h)}" rx="${n(Math.min(r, 14))}"/>`;
  const gx = Math.max(10, s.h * 0.22);
  const x1 = s.x + gx;
  const x2 = s.x + s.w - gx;
  const pitch = (s.h - 2 * gx * 0.75) / 2;
  const y0 = s.y + gx * 0.75;
  const b = pitch / 2;
  const d = `M${n(x1 + b)} ${n(y0)} L${n(x2 - b)} ${n(y0)} A${n(b)} ${n(b)} 0 0 1 ${n(x2 - b)} ${n(y0 + pitch)}`
    + ` L${n(x1 + b)} ${n(y0 + pitch)} A${n(b)} ${n(b)} 0 0 0 ${n(x1 + b)} ${n(y0 + 2 * pitch)} L${n(x2 - b)} ${n(y0 + 2 * pitch)}`;
  return `<g data-part="coil-tube" data-state="${state}">${frame}<path class="serp" d="${d}"/></g>`;
}

// Cross-plate heat exchanger: two grey plate lines crossing in an X, with the
// supply (left) and extract (right) halves of the core drawn in their colours.
function exchangerMarkup(e) {
  const { cx, cy, r, lobeW: W, top } = e;
  const dy = Math.max(12, cy - top - 2);
  const rd = Math.min(r, dy * 0.95);
  const plate = (sgn) => {
    const pts = [[cx - W, cy - sgn * dy * 0.35], [cx - W * 0.6, cy - sgn * dy], [cx - dy * 0.9, cy - sgn * dy],
      [cx + dy * 0.9, cy + sgn * dy], [cx + W * 0.6, cy + sgn * dy], [cx + W, cy + sgn * dy * 0.35]];
    return `<path class="plate" d="M${pts.map(([x, y]) => `${n(x)} ${n(y)}`).join(" L")}"/>`;
  };
  return `<g data-part="exchanger">` + plate(1) + plate(-1)
    + `<path class="diamond" stroke="${cv("intake")}" d="M${n(cx)} ${n(cy - rd)} L${n(cx - rd)} ${n(cy)} L${n(cx)} ${n(cy + rd)}"/>`
    + `<path class="diamond" stroke="${cv("extract")}" d="M${n(cx)} ${n(cy - rd)} L${n(cx + rd)} ${n(cy)} L${n(cx)} ${n(cy + rd)}"/>`
    + `</g>`;
}

// Fan: tinted disc with three solid blades; only the blades turn.
function fanMarkup(ic, color, spin) {
  const R = ic.size / 2;
  const cx = ic.x + R;
  const cy = ic.y + R;
  const k = R * 0.78;
  const blade = `M0 0 C${n(0.2 * k)} ${n(-0.3 * k)} ${n(0.62 * k)} ${n(-0.55 * k)} ${n(0.3 * k)} ${n(-0.92 * k)} C${n(-0.05 * k)} ${n(-1.02 * k)} ${n(-0.38 * k)} ${n(-0.55 * k)} 0 0Z`;
  const blades = [0, 120, 240].map((a) => `<path d="${blade}" transform="rotate(${a})"/>`).join("");
  return `<g class="fan" data-icon="${ic.id}">`
    + `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(R - 1.5)}" fill="color-mix(in srgb, ${color} 22%, var(--mvhr-equipment))" stroke="${color}" stroke-width="3"/>`
    + `<g transform="translate(${n(cx)} ${n(cy)})"><g class="blades${spin ? " spin" : ""}" fill="${color}">${blades}`
    + `<circle r="${n(R * 0.13)}" fill="color-mix(in srgb, ${color} 22%, var(--mvhr-equipment))" stroke="${color}" stroke-width="2"/></g></g></g>`;
}

function houseMarkup(h) {
  if (h.shape !== "pentagon") return `<rect class="node" data-node="house" x="${n(h.x)}" y="${n(h.y)}" width="${n(h.w)}" height="${n(h.h)}" rx="14"/>`;
  const { x, y, w } = h;
  const apexY = y - h.roofH;
  const body = `M${n(x)} ${n(y + h.h)} L${n(x)} ${n(y)} L${n(x + w / 2)} ${n(apexY)} L${n(x + w)} ${n(y)} L${n(x + w)} ${n(y + h.h)} Z`;
  // Chimney on the right-hand roof slope, inside the roof's bounding box.
  const roofAt = (px) => y - h.roofH * (1 - Math.abs(px - (x + w / 2)) / (w / 2));
  const c1 = x + w * 0.7;
  const c2 = c1 + 12;
  const ct = apexY + h.roofH * 0.25;
  const chimney = `M${n(c1)} ${n(roofAt(c1))} L${n(c1)} ${n(ct)} L${n(c2)} ${n(ct)} L${n(c2)} ${n(roofAt(c2))}`;
  return `<path class="node" data-node="house" d="${body}"/><path class="chimney" d="${chimney}"/>`;
}

export function renderSvg(L, uid, model, opts = {}) {
  const parts = [];
  const N = L.nodes;
  // Enclosures
  if (N.outside) parts.push(`<rect class="node outside" data-node="outside" x="${n(N.outside.x)}" y="${n(N.outside.y)}" width="${n(N.outside.w)}" height="${n(N.outside.h)}" rx="14"/>`);
  parts.push(`<rect class="node" data-node="mvhr" x="${n(N.mvhr.x)}" y="${n(N.mvhr.y)}" width="${n(N.mvhr.w)}" height="${n(N.mvhr.h)}" rx="14"/>`);
  if (N.coil) parts.push(`<rect class="node" data-node="coil" x="${n(N.coil.x)}" y="${n(N.coil.y)}" width="${n(N.coil.w)}" height="${n(N.coil.h)}" rx="14"/>`);
  parts.push(houseMarkup(N.house));
  // Interiors
  if (L.exchanger) parts.push(exchangerMarkup(L.exchanger));
  if (L.divider) parts.push(`<line class="divider" x1="${n(L.divider.x1)}" y1="${n(L.divider.y)}" x2="${n(L.divider.x2)}" y2="${n(L.divider.y)}"/>`);
  if (L.grid && L.grid.divider) parts.push(`<line class="divider" x1="${n(L.grid.divider.x)}" y1="${n(L.grid.divider.y1)}" x2="${n(L.grid.divider.x)}" y2="${n(L.grid.divider.y2)}"/>`);
  if (N.coil && L.grid && L.grid.serp) parts.push(hairpin(L.grid.serp, model.coil));
  // Routes and direction arrows. Water only flows while the coil is heating or cooling.
  const bypassState = model.bypass;
  const waterMoving = model.coil === "heating" || model.coil === "cooling";
  for (const e of L.edges) {
    const dashed = e.kind === "bypass" && bypassState !== "open";
    const moving = e.kind !== "water" || waterMoving;
    parts.push(`<g class="edge ${e.kind}${dashed ? " closed" : ""}${moving ? " moving" : ""}" data-edge="${e.id}" data-from="${e.from}" data-to="${e.to}" data-kind="${e.kind}" stroke="${cv(e.color)}" fill="${cv(e.color)}">`
      + `<path class="route" d="${routePath(e.points, 14)}"/>`
      + (dashed ? "" : e.arrows.map((a) => arrowHead(a, travelFor(e, a))).join(""))
      + `</g>`);
  }
  // Port collars and tees
  for (const c of L.collars) parts.push(`<rect class="collar" data-port="${c.port}" x="${n(c.x)}" y="${n(c.y)}" width="${n(c.w)}" height="${n(c.h)}" rx="2"/>`);
  for (const t of L.tees) parts.push(`<circle class="tee" cx="${n(t.x)}" cy="${n(t.y)}" r="4.5"/>`);
  if (L.bypass && L.bypass.stem) {
    const s = L.bypass.stem;
    parts.push(`<line class="stem" x1="${n(s.x)}" y1="${n(s.y1)}" x2="${n(s.x)}" y2="${n(s.y2)}"/><circle class="knot" cx="${n(s.x)}" cy="${n(s.y2)}" r="6"/>`);
  }
  // Icons
  for (const ic of L.icons) {
    const color = ic.color ? cv(ic.color) : ic.type === "outdoor" ? cv("intake") : ic.type === "wind" ? cv("exhaust") : cv("text");
    if (ic.type === "fan") parts.push(fanMarkup(ic, color, opts.motion));
    else parts.push(iconGroup(ic.type, n(ic.x), n(ic.y), ic.size, color, 2));
  }
  return `<svg class="diagram-svg" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="${uid}-title" `
    + `width="${L.W}" height="${L.H}" viewBox="0 0 ${L.W} ${L.H}" data-mode="${L.mode}">`
    + `<title id="${uid}-title">Air flow diagram: outdoor air to MVHR${N.coil ? ", air conditioning coil" : ""} and house; extract air back to MVHR and out as exhaust.</title>`
    + parts.join("") + `</svg>`;
}

// ---------- HTML text overlays ----------

const COLOR = {
  intake: "intake", exhaust: "exhaust", extract: "extract", supply: "supply", secondary: "secondary_text",
  pill: "pill", water_flow: "water_flow", water_return: "water_return", bypass: "bypass",
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

export function renderLabels(L, model) {
  const out = [];
  for (const lb of L.labels) {
    const pos = `left:${lb.x}px;top:${lb.y}px;width:${lb.w}px;height:${lb.h}px`;
    if (lb.kind === "row") {
      const m = metricAttrs(model, lb.metrics[0], `${lb.name} ${lb.value}`);
      const body = `<span class="nm" style="font-size:${lb.nameSize}px">${esc(lb.name)}</span><span class="val" style="font-size:${lb.valueSize}px">${esc(lb.value)}</span>`;
      out.push(m
        ? `<button type="button" class="lbl row metric" data-label="${lb.id}" ${m} style="${pos}">${body}</button>`
        : `<div class="lbl row" data-label="${lb.id}" style="${pos}">${body}</div>`);
      continue;
    }
    const name = lb.lines.filter((l) => !l.metric).map((l) => l.text).join(" ") || lb.id;
    const cls = lb.kind === "badge-stack" ? "lbl stack badge" : "lbl stack";
    out.push(`<div class="${cls}" data-label="${lb.id}" data-align="${lb.align}" style="${pos}">${lb.lines.map((ln) => lineHtml(ln, model, name)).join("")}</div>`);
  }
  return out.join("");
}

// ---------- header ----------

export function renderHeader(cfg, model, features) {
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
  return `<div class="titles"><h2 class="title">${esc(cfg.title)}</h2>${cfg.subtitle ? `<div class="subtitle">${esc(cfg.subtitle)}</div>` : ""}</div>`
    + `<div class="pills" role="status">${pills.map(([k, t]) => `<span class="pill ${k}"><span class="dot" aria-hidden="true">●</span>${esc(t)}</span>`).join("")}</div>`;
}

// ---------- controls ----------

const CONTROL_ICON = { fan_speed: "fan", bypass_mode: "bypass", bypass_threshold: "thermometer", night: "moon", holiday: "briefcase" };

// s: {key, label, disabled, reason, pending, error, selected, value, display, canDec, canInc}
function controlHtml(s) {
  const info = CONTROL_INFO[s.key];
  const dis = s.disabled || s.pending;
  const id = `${s.uid}-${s.key}`;
  let ctl;
  if (info.type === "option") {
    ctl = `<div class="seg" role="radiogroup" aria-labelledby="${id}-l">`
      + info.labels.map((lab) => {
        const on = s.selected === lab;
        return `<button type="button" role="radio" class="segbtn${on ? " on" : ""}" aria-checked="${on}" data-control="${s.key}" data-value="${esc(lab)}" data-focus="${s.key}:${esc(lab)}"${dis ? " disabled" : ""}>${esc(lab)}</button>`;
      }).join("") + `</div>`;
  } else if (info.type === "number") {
    ctl = `<div class="stepper" role="group" aria-labelledby="${id}-l">`
      + `<button type="button" class="step" data-control="${s.key}" data-step="-1" data-focus="${s.key}:-" aria-label="Decrease ${esc(info.label)}"${dis || !s.canDec ? " disabled" : ""}>−</button>`
      + `<output class="stepval" aria-live="off">${esc(s.display)}</output>`
      + `<button type="button" class="step" data-control="${s.key}" data-step="1" data-focus="${s.key}:+" aria-label="Increase ${esc(info.label)}"${dis || !s.canInc ? " disabled" : ""}>+</button>`
      + `</div>`;
  } else {
    const on = s.selected === "on";
    const known = s.selected === "on" || s.selected === "off";
    ctl = `<button type="button" role="switch" class="switch${on ? " on" : ""}${known ? "" : " unknown"}" aria-checked="${on}" aria-labelledby="${id}-l" data-control="${s.key}" data-value="${on ? "off" : "on"}" data-focus="${s.key}:sw"${dis ? " disabled" : ""}><span class="knob" aria-hidden="true"></span></button>`;
  }
  const note = s.pending ? "Sending…" : s.error || s.reason || "";
  return `<div class="ctl${s.pending ? " pending" : ""}${s.error ? " error" : ""}" data-ctl="${s.key}" aria-busy="${!!s.pending}">`
    + `<span class="ctl-ic" aria-hidden="true">${iconSvg(CONTROL_ICON[s.key], 22)}</span>`
    + `<div class="ctl-body"><span class="ctl-l" id="${id}-l">${esc(info.label)}</span>${ctl}`
    + (note ? `<span class="ctl-note" id="${id}-n"${s.error ? ' role="alert"' : ""}>${esc(note)}</span>` : "")
    + `</div></div>`;
}

export function renderControls(states) {
  return states.map(controlHtml).join("");
}

// ---------- runtimes ----------

export function renderRuntimes(cfg, model, metricVisible) {
  const items = [];
  for (const [k, lab] of [["filter_runtime", "Filter runtime"], ["unit_runtime", "Unit runtime"]]) {
    if (!metricVisible(cfg, k)) continue;
    const t = model.text[k];
    if (t === null || t === undefined) continue;
    const label = (cfg.bindings[k] && cfg.bindings[k].label) || lab;
    const m = metricAttrs(model, k, `${label} ${t}`);
    const body = `<span class="nm">${esc(label)}</span> <span class="val">${esc(t)}</span>`;
    items.push(m ? `<button type="button" class="rt metric" ${m}>${body}</button>` : `<span class="rt">${body}</span>`);
  }
  return items.join(`<span class="sep" aria-hidden="true">|</span>`);
}

// ---------- navigation ----------

export function navCurrent(item, pathname) {
  if (item.current) return true;
  if (!item.path || item.external) return false;
  return pathname === item.path || pathname === item.path.replace(/\/$/, "");
}

export function renderNav(items, visibleCount, moreOpen, pathname, uid) {
  const link = (it, i, inMenu) => {
    const cur = navCurrent(it, pathname);
    const ext = it.external ? ` target="_blank" rel="noopener noreferrer"` : "";
    return `<a class="${inMenu ? "menu-item" : "nav-item"}${cur ? " current" : ""}" href="${esc(it.path)}" data-nav="${i}"${ext}${cur ? ' aria-current="page"' : ""}>`
      + `${iconSvg(it.icon || "link", 22)}<span>${esc(it.label)}</span></a>`;
  };
  const shown = items.slice(0, visibleCount);
  const rest = items.slice(visibleCount);
  let html = shown.map((it, i) => link(it, i, false)).join("");
  if (rest.length) {
    html += `<div class="more-wrap"><button type="button" class="nav-item more" aria-expanded="${moreOpen}" aria-controls="${uid}-more" data-focus="nav:more">${iconSvg("more", 22)}<span>More</span></button>`
      + `<div class="menu" id="${uid}-more"${moreOpen ? "" : " hidden"}>${rest.map((it, j) => link(it, visibleCount + j, true)).join("")}</div></div>`;
  }
  return html;
}
