// Deterministic layout engine. One pass turns (config, width, texts) into node rects,
// named ports, routed edges, label rects and icons, all in one CSS-pixel coordinate
// system (the SVG viewBox is 1:1 with the card's diagram box). Paths are built from
// the same port objects, so an edge cannot miss its port.

import { metricVisible, effectiveFeatures } from "./config.js";

export const COLLAR = { out: 10, len: 24, thick: 12 };
const CLEAR = 12; // label/route and route/route clearance
const INSET = 8; // text to enclosure border

// Fallback measurement for node tests: deliberately generous so real fonts fit.
export function heuristicMeasure(text, size, weight = 400) {
  return Math.ceil(String(text).length * size * (weight >= 600 ? 0.62 : 0.58));
}

const lineH = (size) => Math.ceil(size * 1.25);
const TARGET = 44; // minimum hit target for a value that opens more-info

const WIDE = {
  name: "wide", margin: 16, pad: 16, fanR: 28, fanDx: 104, diamond: 40, mvhrMin: 340, coilCols: 2,
  coilMin: 300, serpW: 220, serpH: 56, iconMax: 64, iconGap: 16, tee: 30, minSeg: 72, houseMin: 136,
  bridgeGap: 26, fs: { title: 22, body: 17, sec: 15, temp: 28, eff: 40, value: 17 },
};
// Wide with tighter spacing, tried before compact so cards from 1280px stay one row.
const WIDE_TIGHT = { ...WIDE, mvhrMin: 320, coilMin: 260, tee: 28, minSeg: 56 };
const COMPACT = {
  ...WIDE, name: "compact", twoRow: true, margin: 12, pad: 14, fanR: 26, fanDx: 88, diamond: 32, mvhrMin: 280, coilCols: 2,
  coilMin: 200, serpW: 170, serpH: 48, iconMax: 48, iconGap: 12, tee: 28, minSeg: 60, houseMin: 120,
  bridgeGap: 26, fs: { title: 20, body: 16, sec: 14, temp: 26, eff: 36, value: 16 },
};
const MOBILE = {
  name: "mobile", pad: 12, fanR: 24, diamond: 22, serpW: 150, serpH: 44, tee: 30, railL: 14, railInset: 14,
  fs: { title: 18, body: 16, sec: 14, temp: 24, eff: 32, value: 16 },
};

function scaled(P, s) {
  const fs = {};
  for (const [k, v] of Object.entries(P.fs)) fs[k] = Math.round(Math.max(k === "sec" ? 14 : 16, v * s) * 10) / 10;
  fs.sec = Math.max(14, Math.round(P.fs.sec * s * 10) / 10);
  return { ...P, fs };
}

// ---------- text helpers ----------

function tempTemplate(cfg, unit) {
  const p = cfg.format.temperature_precision;
  return `−88${p ? "." + "8".repeat(p) : ""}${unit}`;
}

// A label is a block of lines. Its rect is reserved before any route is placed.
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
  return { id, owner, kind: opts.kind || "stack", align: opts.align || "center", lines: out, w: Math.ceil(w + padX * 2), h: Math.ceil(h),
    touches: opts.touches || [], metrics: opts.metrics || [] };
}

function rowLabel(ctx, id, owner, name, value, P, metric) {
  const nw = ctx.measure(name, P.fs.sec, 400);
  const vw = Math.max(ctx.measure(value, P.fs.value, 600), ctx.measure(ctx.reserveTemp, P.fs.value, 600));
  return { id, owner, kind: "row", align: "left", name, value, nameSize: P.fs.sec, valueSize: P.fs.value,
    nameW: nw, valueW: vw, w: Math.ceil(nw + 16 + vw + 4), h: Math.max(lineH(P.fs.value) + 6, TARGET), touches: [], metrics: [metric] };
}

// Vertical pitch between the stacked Flow and Return tags.
const waterPitch = (B) => Math.max(40, Math.max(B.flowLbl.h, B.returnLbl.h) + 6);

const place = (l, x, y) => Object.assign(l, { x: Math.round(x), y: Math.round(y) });

// ---------- content blocks shared by all modes ----------

function blocks(cfg, ctx, P, mode) {
  const f = effectiveFeatures(cfg);
  const t = ctx.texts;
  const show = (k) => metricVisible(cfg, k) && t[k] !== null && t[k] !== undefined;
  const lab = (k, d) => (cfg.bindings[k] && cfg.bindings[k].label) || d;
  const B = { f, show };

  // Outside endpoints
  if (show("outdoor_temperature")) {
    B.intakeCap = makeLabel(ctx, "intake", "outside", [
      { text: t.outdoor_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 600, boxed: true, color: "intake", metric: "outdoor_temperature" },
      { text: lab("outdoor_temperature", "Outdoor intake"), size: P.fs.sec, color: "secondary" },
    ], { metrics: ["outdoor_temperature"] });
  }
  if (show("exhaust_temperature")) {
    B.exhaustCap = makeLabel(ctx, "exhaust", "outside", [
      { text: t.exhaust_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 600, boxed: true, color: "exhaust", metric: "exhaust_temperature" },
      { text: lab("exhaust_temperature", "Exhaust"), size: P.fs.sec, color: "secondary" },
    ], { metrics: ["exhaust_temperature"] });
  }

  // MVHR internals
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
    effLines.push({ text: t.recovery_efficiency + (ctx.flags.effFlagged ? " ⚠" : ""), reserve: "100% ⚠", size: P.fs.eff, weight: 700, metric: "recovery_efficiency" });
    effMetrics.push("recovery_efficiency");
  }
  const sub = [];
  if (show("recovery_efficiency")) sub.push(ctx.flags.effSource);
  if (show("speed_state")) { sub.push(`Speed ${t.speed_state}`); effMetrics.push("speed_state"); }
  if (sub.length) effLines.push({ text: sub.join("  |  "), reserve: show("speed_state") ? "Calculated  |  Speed 8" : "Calculated", size: P.fs.sec, color: "secondary" });
  if (effLines.length) B.eff = makeLabel(ctx, "efficiency", "mvhr", effLines, { metrics: effMetrics });

  // Coil
  if (f.aircon) {
    B.coilTitle = makeLabel(ctx, "coil-title", "coil", [{ text: "Air conditioning", size: P.fs.title, weight: 700 }]);
    B.coilPill = makeLabel(ctx, "coil-status", "coil", [{ text: ctx.flags.coilText, reserve: "Unknown", size: P.fs.sec, weight: 600, boxed: true, color: "pill" }]);
    const left = [];
    const right = [];
    const row = (k, name, col) => { if (show(k)) col.push(rowLabel(ctx, `m-${k}`, "coil", lab(k, name), t[k], P, k)); };
    row("coil_air_in", "Air in", left);
    row("coil_air_out", "Air out", left);
    row("coil_air_delta", "Air ΔT", left);
    row("water_flow_temperature", "Water flow", right);
    row("water_return_temperature", "Water return", right);
    row("buffer_temperature", "Buffer", right);
    B.coilLeft = left;
    B.coilRight = right;
  }
  if (f.water_circuit) {
    // Pipe tags carry the water temperature, as in the approved design.
    const pipe = (id, name, key, plain) => {
      const v = !plain && show(key);
      const line = { text: v ? `${name} ${t[key]}` : name, size: P.fs.sec, weight: 600, boxed: true, color: id.replace("-", "_") };
      if (v) Object.assign(line, { reserve: `${name} ${ctx.reserveTemp}`, metric: key });
      return makeLabel(ctx, id, "route", [line], { touches: [id], metrics: v ? [key] : [] });
    };
    B.flowLbl = pipe("water-flow", "Flow", "water_flow_temperature");
    B.returnLbl = pipe("water-return", "Return", "water_return_temperature");
    // Name-only tags for screens too narrow for the values.
    B.plainWater = () => {
      B.flowLbl = pipe("water-flow", "Flow", "water_flow_temperature", true);
      B.returnLbl = pipe("water-return", "Return", "water_return_temperature", true);
    };
  }

  // House
  const houseLines = [];
  const houseMetrics = [];
  if (show("indoor_temperature")) { houseLines.push({ text: t.indoor_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 700, metric: "indoor_temperature" }); houseMetrics.push("indoor_temperature"); }
  if (show("indoor_humidity")) { houseLines.push({ text: `${lab("indoor_humidity", "Humidity")} ${t.indoor_humidity}`, reserve: `${lab("indoor_humidity", "Humidity")} 100%`, size: P.fs.sec, metric: "indoor_humidity" }); houseMetrics.push("indoor_humidity"); }
  if (houseLines.length) B.houseText = makeLabel(ctx, "house", "house", houseLines, { metrics: houseMetrics });

  // Extract value beside its return route
  const et = show("extract_temperature");
  const eh = show("extract_humidity");
  if (et || eh) {
    const lines = [];
    if (et) lines.push({ text: t.extract_temperature, reserve: ctx.reserveTemp, size: P.fs.temp, weight: 600, boxed: true, color: "extract", metric: "extract_temperature" });
    const cap = lab("extract_temperature", "Extract");
    if (et && eh) lines.push({ text: `${cap} · RH ${t.extract_humidity}`, reserve: `${cap} · RH 100%`, size: P.fs.sec, color: "secondary", metric: "extract_humidity" });
    else if (eh) lines.push({ text: `${cap} RH ${t.extract_humidity}`, reserve: `${cap} RH 100%`, size: P.fs.body, weight: 600, boxed: true, color: "extract", metric: "extract_humidity" });
    else lines.push({ text: cap, size: P.fs.sec, color: "secondary" });
    B.extractCap = makeLabel(ctx, "extract", "route", lines, { metrics: [et && "extract_temperature", eh && "extract_humidity"].filter(Boolean) });
  }

  // Bypass badge: position, then mode. One boxed line; two stacked lines on mobile.
  if (f.bypass) {
    const pos = ctx.flags.bypassText;
    const mode = ctx.flags.bypassMode;
    const reserve = "Bypass position unknown";
    if (!mode) {
      B.badge = makeLabel(ctx, "bypass", "route", [{ text: pos, reserve, size: P.fs.sec, weight: 600, boxed: true, color: "bypass" }], { touches: ["bypass"] });
    } else if (P.name === "mobile") {
      B.badge = makeLabel(ctx, "bypass", "route", [
        { text: pos, reserve, size: P.fs.sec, weight: 600, color: "bypass" },
        { text: `Mode ${mode}`, reserve: "Mode Auto", size: P.fs.sec, weight: 400, color: "secondary" },
      ], { touches: ["bypass"], padX: 14, kind: "badge-stack" });
    } else {
      B.badge = makeLabel(ctx, "bypass", "route", [{ text: `${pos}  ·  ${mode}`, reserve: `${reserve}  ·  Auto`, size: P.fs.sec, weight: 600, boxed: true, color: "bypass" }], { touches: ["bypass"] });
    }
  }
  return B;
}

// ---------- geometry helpers ----------

function hseg(a, b) { return [a, b]; }
function arrowsFor(points, every) {
  const arrows = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    if (len < 40) continue;
    const n = Math.max(1, Math.floor(len / every));
    const dir = x2 > x1 ? "right" : x2 < x1 ? "left" : y2 > y1 ? "down" : "up";
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
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

// ---------- wide / compact ----------

// Coil box size: header, reading grid (one or two columns) and the serpentine on the air row.
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

// Coil contents: header, readings, serpentine centred on the air row at y = airY.
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
    B.coilLeft.forEach((r, i) => { r.w = lw; labels.push(place(r, lx, gy + i * grid.rowH)); });
    B.coilRight.forEach((r, i) => { r.w = rw; labels.push(place(r, rx, gy + i * grid.rowH)); });
    grid.divider = { x: (lx + lw + rx) / 2, y1: gy, y2: gy + grid.gridRows * grid.rowH - 6 };
  } else {
    const w1 = grid.gridW;
    [...B.coilLeft, ...B.coilRight].forEach((r, i) => { r.w = w1; labels.push(place(r, coil.x + (coilW - w1) / 2, gy + i * grid.rowH)); });
  }
  grid.serp = { x: coil.x + (coilW - P.serpW) / 2, y: airY - P.serpH / 2, w: P.serpW, h: P.serpH };
}

// Wide: one row, outside -> MVHR -> coil -> house. Compact (P.twoRow): the same MVHR row,
// then a second equipment row below it, house <- coil, fed by a supply corridor down the
// right and returning extract along a corridor under the MVHR.
function desktopLayout(cfg, W, P, ctx) {
  const B = blocks(cfg, ctx, P, P.name);
  const f = B.f;
  const pad = P.pad;
  const m = P.margin;
  const two = !!P.twoRow;

  // MVHR horizontal sizing
  const fanBlockW = Math.max(2 * P.fanR, B.supplyFan.w, B.extractFan.w);
  const fanDx = Math.max(P.fanDx, P.diamond + 12 + fanBlockW / 2);
  const mvhrW = Math.ceil(Math.max(P.mvhrMin, 2 * (fanDx + fanBlockW / 2 + pad), B.mvhrTitle.w + 2 * pad, (B.eff ? B.eff.w : 0) + 2 * pad));

  // Coil sizing (compact prefers two reading columns and falls back to one if too wide)
  const noCoil = { coilW: 0, coilAbove: 0, coilBelow: 0, grid: null };
  let C = f.aircon ? sizeCoil(B, P, P.coilCols) : noCoil;

  // House sizing: pentagon (walls + roof) in wide; summary rect with house icon in compact.
  const iconT = 30;
  const houseBodyW = two
    ? Math.ceil(Math.max(P.houseMin, iconT + 12 + (B.houseText ? B.houseText.w : 0) + 2 * pad))
    : Math.ceil(Math.max(P.houseMin, (B.houseText ? B.houseText.w : 0) + 2 * pad));
  const houseBodyH = two
    ? Math.ceil(Math.max(iconT, B.houseText ? B.houseText.h : 0) + 2 * pad)
    : Math.ceil(pad + iconT + 6 + (B.houseText ? B.houseText.h : 0) + pad);
  const houseBelow = 24; // wide: supply port sits 24px above the body's bottom corner
  const roofH = Math.round(houseBodyW * 0.32);

  // Height of MVHR: rows at 0.4h/0.6h; in wide the extract row is >= 24px below the coil and house bodies.
  const effH = B.eff ? B.eff.h : 0;
  const fanLblH = Math.max(B.supplyFan.h, B.extractFan.h);
  const blockH = 2 * P.fanR + 6 + fanLblH;
  let h = two ? 280 : Math.max(320, (C.coilBelow + 24) / 0.2, (houseBelow + 24) / 0.2);
  let inner = null;
  for (let guard = 0; guard < 200; guard++, h += 4) {
    const up = 0.4 * h;
    const lo = 0.6 * h;
    const mid = 0.5 * h;
    const titleBottom = pad + B.mvhrTitle.h;
    const blockTop = Math.max(titleBottom + 8, mid - blockH / 2 + fanLblH / 2 - 8);
    const effTop = Math.max(blockTop + blockH + 14, lo + COLLAR.len / 2 + 6);
    const bottom = effH ? effTop + effH + pad : blockTop + blockH + pad;
    if (bottom <= h) { inner = { up, lo, mid, blockTop, effTop }; break; }
  }
  h = Math.ceil(h);
  const up = Math.round(0.4 * h * 2) / 2;
  const lo = Math.round(0.6 * h * 2) / 2;

  // Horizontal budget, left to right.
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
  // Compact corridors: xE carries extract up to the lower row, xS carries supply down.
  let xE = 0;
  let xS = 0;
  let airY = up;
  let corrY = 0;
  if (!two) {
    // The extract value capsule sits below the red row between MVHR and house; it needs room.
    const extractSpan = () => (f.aircon ? gap2Min + C.coilW + gap3Min : gap2Min + P.minSeg * 0.5) + houseBodyW / 2 - COLLAR.out;
    const total = () => minMvhrX + mvhrW + (f.aircon ? gap2Min + C.coilW + gap3Min : gap2Min + P.minSeg * 0.5) + houseBodyW + m
      + Math.max(0, extW + 2 * CLEAR - extractSpan());
    let minTotal = total();
    // Tight: one reading column makes the coil narrower (and taller above the air row).
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
    const mR = mx + mvhrW;
    if (f.aircon) {
      const cx0 = Math.round(mR + gap2Min + g2 + extraExt / 2);
      coil = { x: cx0, y: up - Math.round(C.coilAbove), w: C.coilW, h: Math.round(C.coilAbove + C.coilBelow) };
      houseX = Math.round(cx0 + C.coilW + gap3Min + g3 + extraExt / 2);
    } else {
      houseX = Math.round(mR + gap2Min + P.minSeg * 0.5 + g2 + extraExt);
    }
    houseY = up + houseBelow - houseBodyH;
  } else {
    // Row 1 width: MVHR, then the supply tee, the extract corridor and the supply corridor.
    const corr = 28;
    const row1 = (cw) => minMvhrX + mvhrW + COLLAR.out + Math.max(f.bypass ? tee + corr : 0, corr + corr) + m;
    // Row 2 width: house, gap, coil, stub into the coil's right side, supply corridor.
    const row2 = (cw) => m + houseBodyW + (f.aircon ? gap3Min + cw : P.minSeg) + COLLAR.out + corr + m;
    let need = Math.max(row1(C.coilW), row2(C.coilW));
    if (need > W && f.aircon && C.grid.cols === 2) {
      C = sizeCoil(B, P, 1);
      need = Math.max(row1(C.coilW), row2(C.coilW));
    }
    if (need > W) return { fail: `needs ${Math.ceil(need)}px, has ${Math.floor(W)}px` };
    spare = W - need;
    mx = Math.round(minMvhrX + spare * 0.45);
    const mR = mx + mvhrW;
    xE = mR + COLLAR.out + corr;
    xS = Math.round(Math.max(xE + corr, f.bypass ? mR + COLLAR.out + tee + corr : 0, W - m - Math.round(spare * 0.1)));
    // Band under the MVHR row: clears the enclosure and the exhaust reading, holds the extract value.
    const exBottom = B.exhaustCap ? lo + CLEAR + B.exhaustCap.h : lo;
    const bandTop = Math.max(h, exBottom);
    corrY = Math.ceil(bandTop + CLEAR + (B.extractCap ? B.extractCap.h + CLEAR : 12));
    // Second row: the air line sits on the serpentine (or mid-house without a coil).
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

  // Ports
  const ports = {
    "outside.intake": { x: outPortX, y: up, side: "right" },
    "outside.exhaust": { x: outPortX, y: lo, side: "right" },
    "mvhr.intake": { x: mx, y: up, side: "left" },
    "mvhr.exhaust": { x: mx, y: lo, side: "left" },
    "mvhr.supply": { x: mR, y: up, side: "right" },
    "mvhr.extract": { x: mR, y: lo, side: "right" },
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

  // Outside icons on their rows
  const gap = lo - up;
  const iconS = Math.min(iconMax, gap - 16);
  icons.push({ id: "outdoor", type: "outdoor", x: m + (iconMax - iconS), y: up - iconS / 2, size: iconS });
  icons.push({ id: "wind", type: "wind", x: m + (iconMax - iconS), y: lo - iconS / 2, size: iconS });

  if (B.intakeCap) labels.push(place(B.intakeCap, capX, up - CLEAR - B.intakeCap.h));
  if (B.exhaustCap) labels.push(place(B.exhaustCap, capX, lo + CLEAR));

  // MVHR internals
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

  // Coil and water
  const grid = C.grid;
  let water = null;
  if (coil) {
    nodes.coil = coil;
    // Wide: air enters on the left; compact: from the supply corridor on the right.
    ports["coil.air_in"] = { x: two ? coil.x + coil.w : coil.x, y: airY, side: two ? "right" : "left" };
    ports["coil.air_out"] = { x: two ? coil.x : coil.x + coil.w, y: airY, side: two ? "left" : "right" };
    placeCoil(B, P, coil, grid, airY, labels);

    if (f.water_circuit && !two) {
      const retX = coil.x + coil.w - pad - 12;
      const flowX = retX - 32;
      const lblX = retX + 36;
      let yR = coil.y - 30;
      let yF = yR - waterPitch(B);
      // Keep water labels clear of the house roof when they overhang it.
      const lblR = lblX + waterW;
      const roofTop = houseBody.y - roofH;
      if (lblR + CLEAR > houseX) {
        const limit = roofTop - CLEAR - Math.max(B.flowLbl.h, B.returnLbl.h) / 2;
        if (yR > limit) { yR = limit; yF = yR - waterPitch(B); }
      }
      ports["coil.water_flow"] = { x: flowX, y: coil.y, side: "top" };
      ports["coil.water_return"] = { x: retX, y: coil.y, side: "top" };
      ports["water.flow"] = { x: lblX, y: yF, side: "left" };
      ports["water.return"] = { x: lblX, y: yR, side: "left" };
      labels.push(place(B.flowLbl, lblX, yF - B.flowLbl.h / 2));
      labels.push(place(B.returnLbl, lblX, yR - B.returnLbl.h / 2));
      water = true;
    } else if (f.water_circuit) {
      // Compact: pipes leave the coil's underside, labels sit to their left.
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

  // House: thermometer above the text (wide), house icon beside it (compact).
  if (two) {
    const htw = B.houseText ? B.houseText.w : 0;
    const gx = houseX + (houseBodyW - (iconT + 12 + htw)) / 2;
    icons.push({ id: "house", type: "house", x: gx, y: houseY + (houseBodyH - iconT) / 2, size: iconT, color: "supply" });
    if (B.houseText) labels.push(place(B.houseText, gx + iconT + 12, houseY + (houseBodyH - B.houseText.h) / 2));
  } else {
    icons.push({ id: "thermo", type: "thermometer", x: houseX + houseBodyW / 2 - iconT / 2, y: houseBody.y + pad, size: iconT, color: "extract" });
    if (B.houseText) labels.push(place(B.houseText, houseX + (houseBodyW - B.houseText.w) / 2, houseBody.y + pad + iconT + 6));
  }

  // Edges
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

  // Extract value: wide, below the red row centred on its free span; compact, just above
  // the extract corridor, under the MVHR.
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
      const ex = Math.max(spanL, Math.min(spanR - B.extractCap.w, (spanL + spanR) / 2 - B.extractCap.w / 2 + (coil ? (coil.x + coil.w / 2 - (spanL + spanR) / 2) : 0)));
      labels.push(place(B.extractCap, ex, lo + CLEAR));
    }
  }

  // Bypass: tees on the intake and supply segments, bridge above the enclosure.
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

// ---------- mobile ----------

function mobileLayout(cfg, W, P, ctx) {
  const B = blocks(cfg, ctx, P, "mobile");
  const f = B.f;
  const pad = P.pad;
  const railL = P.railL;
  const railR = W - P.railL;
  const boxL = railL + 26;
  const boxR = railR - 26;

  // Outside summary node at the top
  const outside = { x: 12, y: 0, w: W - 24, h: 0 };
  const icon = 32;
  const halfW = outside.w / 2;
  const capW1 = B.intakeCap ? B.intakeCap.w : 0;
  const capW2 = B.exhaustCap ? B.exhaustCap.w : 0;
  const capH = Math.max(B.intakeCap ? B.intakeCap.h : 0, B.exhaustCap ? B.exhaustCap.h : 0);
  const labels = [];
  const icons = [];
  if (capW1 + 8 <= halfW - 2 * INSET && capW2 + 8 <= halfW - 2 * INSET) {
    // Side by side: intake half on the left, exhaust half on the right.
    outside.h = Math.ceil(pad + icon + 6 + capH + pad);
    icons.push({ id: "outdoor", type: "outdoor", x: outside.x + halfW / 2 - icon / 2, y: pad, size: icon });
    icons.push({ id: "wind", type: "wind", x: outside.x + halfW + halfW / 2 - icon / 2, y: pad, size: icon });
    if (B.intakeCap) labels.push(place(B.intakeCap, outside.x + halfW / 2 - B.intakeCap.w / 2, pad + icon + 6));
    if (B.exhaustCap) labels.push(place(B.exhaustCap, outside.x + halfW + halfW / 2 - B.exhaustCap.w / 2, pad + icon + 6));
  } else {
    // Narrow: one row per reading, icon beside its value.
    if (pad + icon + 12 + Math.max(capW1, capW2) + pad > outside.w) return { fail: "outside readings too wide" };
    const rowH = Math.max(icon, capH);
    const r2 = pad + rowH + 10;
    icons.push({ id: "outdoor", type: "outdoor", x: outside.x + pad, y: pad + (rowH - icon) / 2, size: icon });
    icons.push({ id: "wind", type: "wind", x: outside.x + pad, y: r2 + (rowH - icon) / 2, size: icon });
    if (B.intakeCap) labels.push(place(B.intakeCap, outside.x + pad + icon + 12, pad + (rowH - B.intakeCap.h) / 2));
    if (B.exhaustCap) labels.push(place(B.exhaustCap, outside.x + pad + icon + 12, r2 + (rowH - B.exhaustCap.h) / 2));
    outside.h = Math.ceil(r2 + rowH + pad);
  }

  // MVHR, full width between the rails
  const mvhr = { x: boxL, y: 0, w: boxR - boxL, h: 0 };
  const inX = mvhr.x + 34;
  const exX = mvhr.x + mvhr.w - 34;
  const O = outside.y + outside.h;
  let gapTop = 56;
  if (f.bypass) gapTop = Math.max(84, B.badge.h + 2 * 18, lineH(P.fs.sec) * 3 + 2 * 18);
  mvhr.y = O + gapTop;
  const fanBlockW = Math.max(2 * P.fanR, B.supplyFan.w, B.extractFan.w);
  const fanDx = Math.min((mvhr.w - 2 * pad - fanBlockW) / 2, 110);
  if (fanDx < P.diamond + 8 + fanBlockW / 2 || B.mvhrTitle.w + 2 * pad > mvhr.w || (B.eff && B.eff.w + 2 * pad > mvhr.w)) return { fail: "MVHR content too wide" };
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
    "mvhr.extract": { x: exX, y: MB, side: "bottom" },
  };

  // Between MVHR and coil: supply tee (left), extract row (right), extract value.
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
    const hx = coil.x + pad;
    let cy = coil.y + pad;
    if (B.coilTitle.w + 12 + B.coilPill.w + 2 * pad <= coil.w) {
      const hh = Math.max(B.coilTitle.h, B.coilPill.h);
      labels.push(place(B.coilTitle, hx, cy + (hh - B.coilTitle.h) / 2));
      labels.push(place(B.coilPill, hx + B.coilTitle.w + 12, cy + (hh - B.coilPill.h) / 2));
      cy += hh + 12;
    } else {
      if (B.coilTitle.w + 2 * pad > coil.w) return { fail: "coil title too wide" };
      labels.push(place(B.coilTitle, hx, cy));
      cy += B.coilTitle.h + 6;
      labels.push(place(B.coilPill, hx, cy));
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
      L.forEach((r, i) => { r.w = lw; labels.push(place(r, hx, cy + i * rowH)); });
      R.forEach((r, i) => { r.w = rw; labels.push(place(r, coil.x + coil.w - pad - rw, cy + i * rowH)); });
      cy += Math.max(L.length, R.length) * rowH + 8;
    } else {
      const all = [...L, ...R];
      const w1 = colW(all);
      if (w1 > innerW) return { fail: "coil readings too wide" };
      all.forEach((r, i) => { r.w = innerW; labels.push(place(r, hx, cy + i * rowH)); });
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

  // House summary node
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
      // Three short lines: "Bypass", its position, its mode.
      const word = { "Bypass open": "Open", "Bypass closed": "Closed" }[ctx.flags.bypassText] || "Unknown";
      const ls = [
        { text: "Bypass", size: P.fs.sec, weight: 600, color: "bypass" },
        { text: word, reserve: "Unknown", size: P.fs.sec, weight: 600, color: "bypass" },
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

// ---------- shared finish: normalise origin, arrows, collars, bounds ----------

function finish(L, ctx) {
  // Translate so the topmost item sits at y = 8.
  let minY = Infinity;
  let maxY = -Infinity;
  const eat = (y1, y2) => { minY = Math.min(minY, y1); maxY = Math.max(maxY, y2); };
  for (const n of Object.values(L.nodes)) eat(n.y - (n.roofH || 0), n.y + n.h);
  for (const l of L.labels) eat(l.y, l.y + l.h);
  for (const i of L.icons) eat(i.y, i.y + i.size);
  for (const e of L.edges) for (const [, y] of e.points) eat(y - 2, y + 2);
  const dy = 8 - minY;
  const sh = (o, k = "y") => { o[k] += dy; };
  for (const n of Object.values(L.nodes)) sh(n);
  for (const l of L.labels) sh(l);
  for (const i of L.icons) sh(i);
  for (const p of Object.values(L.ports)) sh(p);
  for (const e of L.edges) e.points = e.points.map(([x, y]) => [x, y + dy]);
  if (L.exchanger) { L.exchanger.cy += dy; L.exchanger.top += dy; }
  if (L.divider) L.divider.y += dy;
  if (L.grid) {
    if (L.grid.serp) L.grid.serp.y += dy;
    if (L.grid.divider) { L.grid.divider.y1 += dy; L.grid.divider.y2 += dy; }
  }
  if (L.bypass && !L.bypass.mobile) { L.bypass.bridgeY += dy; L.bypass.stem.y1 += dy; L.bypass.stem.y2 += dy; }
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

// ---------- entry ----------

export function computeLayout(cfg, opts) {
  const s = cfg.layout.text_scale;
  const ctx = {
    measure: opts.measure || heuristicMeasure,
    texts: opts.texts || {},
    flags: { effSource: "Reported", effFlagged: false, coilText: "Unknown", bypassText: "Bypass position unknown", bypassMode: null, ...(opts.flags || {}) },
  };
  ctx.reserveTemp = tempTemplate(cfg, opts.tempUnit || "°C");
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
    let L = null;
    for (const V of variants[mode]) {
      const P = scaled(V, s);
      L = mode === "mobile" ? mobileLayout(cfg, W, P, ctx) : desktopLayout(cfg, W, P, ctx);
      if (!L.fail) break;
    }
    if (!L.fail) {
      L.requested = start;
      L.fallback = reasons;
      L.cardWidth = cardW;
      return L;
    }
    reasons.push(`${mode}: ${L.fail}`);
  }
  // Very narrow or very large text: use mobile geometry at a minimum width and let the
  // card scroll vertically instead of shrinking text.
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

// ---------- invariants (shared by unit and browser tests) ----------

const segRect = ([x1, y1], [x2, y2]) => ({ x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) });
export function rectGap(a, b) {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return dx === 0 && dy === 0 ? -1 : Math.hypot(dx, dy);
}
const overlap = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const STROKE = 1.5;

export function validateLayout(L) {
  const v = [];
  const near = (a, b) => Math.abs(a - b) <= 1;
  for (const e of L.edges) {
    const a = L.ports[e.from];
    const b = L.ports[e.to];
    if (!a || !b) { v.push(`${e.id}: missing port`); continue; }
    const [sx, sy] = e.points[0];
    const [ex, ey] = e.points[e.points.length - 1];
    if (!near(sx, a.x) || !near(sy, a.y)) v.push(`${e.id}: start not at ${e.from}`);
    if (!near(ex, b.x) || !near(ey, b.y)) v.push(`${e.id}: end not at ${e.to}`);
    const water = [e.from, e.to].some((p) => p.includes("water"));
    if (e.kind === "air" && water) v.push(`${e.id}: air edge on water port`);
    if (e.kind === "water" && !water) v.push(`${e.id}: water edge on air port`);
    for (let i = 0; i < e.points.length - 1; i++) {
      const [x1, y1] = e.points[i];
      const [x2, y2] = e.points[i + 1];
      if (x1 !== x2 && y1 !== y2) v.push(`${e.id}: diagonal segment`);
    }
    for (const ar of e.arrows) {
      const [x1, y1] = e.points[ar.seg];
      const [x2, y2] = e.points[ar.seg + 1];
      const dir = x2 > x1 ? "right" : x2 < x1 ? "left" : y2 > y1 ? "down" : "up";
      if (dir !== ar.dir) v.push(`${e.id}: arrow ${ar.dir} on ${dir} segment`);
    }
  }
  const P = L.ports;
  const mv = L.nodes.mvhr;
  if (L.mode !== "mobile") {
    if (!near(P["mvhr.intake"].y, P["mvhr.supply"].y)) v.push("upper pair not level");
    if (!near(P["mvhr.exhaust"].y, P["mvhr.extract"].y)) v.push("lower pair not level");
    if (!near(P["mvhr.intake"].y, mv.y + 0.4 * mv.h)) v.push("upper row not at 40%");
    if (!near(P["mvhr.exhaust"].y, mv.y + 0.6 * mv.h)) v.push("lower row not at 60%");
    for (const id of ["intake", "exhaust"]) {
      const e = L.edges.find((x) => x.id === id);
      if (e.points.length !== 2 || e.points[0][1] !== e.points[1][1]) v.push(`${id}: not straight horizontal`);
    }
    const ex = L.edges.find((x) => x.id === "extract");
    const pts = ex.points;
    const last = pts[pts.length - 2];
    const hb = L.nodes.house;
    if (!(last[0] > pts[pts.length - 1][0])) v.push("extract: row not leftward");
    if (L.mode === "compact") {
      // Two rows: house leg rises to the corridor, which runs under the MVHR row.
      const corr = L.rows.corridor;
      if (pts.length !== 5) v.push("extract: not house -> corridor -> MVHR");
      if (!(pts[0][0] === pts[1][0] && pts[1][1] < pts[0][1])) v.push("extract: house leg not upward");
      if (!near(pts[1][1], corr)) v.push("extract: corridor not level");
      if (corr - (mv.y + mv.h) < CLEAR - 0.5) v.push("extract corridor too close to MVHR");
      if (L.nodes.coil && L.nodes.coil.y - corr < 24 - 0.5) v.push("coil top < 24px below extract corridor");
      if (hb.y - corr < 24 - 0.5) v.push("house body < 24px below extract corridor");
      const sp = L.edges.find((x) => x.id === "supply").points;
      if (sp.length !== 4 || sp[1][1] !== sp[0][1] || sp[2][0] !== sp[1][0] || !(sp[2][1] > sp[1][1])) v.push("supply: not right -> down -> left");
    } else {
      for (let i = 1; i < pts.length - 2; i++) if (pts[i][0] === pts[i + 1][0]) v.push("extract: middle vertical segment");
      if (pts.length > 3) v.push("extract: more than one elbow");
      if (!(pts[0][0] === pts[1][0] && pts[1][1] > pts[0][1])) v.push("extract: house leg not downward");
      if (L.nodes.coil && L.nodes.coil.y + L.nodes.coil.h > P["mvhr.extract"].y - 24 + 0.5) v.push("coil bottom < 24px above extract row");
      if (hb.y + hb.h > P["mvhr.extract"].y - 24 + 0.5) v.push("house body < 24px above extract row");
    }
    if (L.bypass) {
      const { teeL, teeR, bridgeY } = L.bypass;
      if (mv.x - COLLAR.out - teeL < 24 - 0.5) v.push("intake tee too close to collar");
      if (teeR - (mv.x + mv.w + COLLAR.out) < 24 - 0.5) v.push("supply tee too close to collar");
      if (Math.abs((mv.x - COLLAR.out - teeL) - (teeR - (mv.x + mv.w + COLLAR.out))) > 1) v.push("tees not symmetric");
      if (mv.y - bridgeY < 24 - 0.5) v.push("bridge < 24px above enclosure");
    }
  } else if (L.bypass) {
    const t1 = P["tee.intake"].y;
    const t2 = P["tee.supply"].y;
    if (t1 - (P["outside.intake"].y + COLLAR.out) < 24 - 0.5 || (mv.y - COLLAR.out) - t1 < 24 - 0.5) v.push("intake tee too close to collar");
    if (t2 - (mv.y + mv.h + COLLAR.out) < 24 - 0.5) v.push("supply tee too close to collar");
    if (L.nodes.coil && (L.nodes.coil.y - COLLAR.out) - t2 < 24 - 0.5) v.push("supply tee too close to coil collar");
    if (mv.x - L.bypass.rail < 24 - 0.5) v.push("bypass rail < 24px from enclosure");
  }

  // Labels: inside owners, no overlaps, clear of unrelated routes.
  for (const l of L.labels) {
    const n = L.nodes[l.owner];
    if (n) {
      if (l.x < n.x + INSET - 0.5 || l.y < n.y + INSET - 0.5 || l.x + l.w > n.x + n.w - INSET + 0.5 || l.y + l.h > n.y + n.h - INSET + 0.5) {
        v.push(`${l.id}: outside ${l.owner} inset`);
      }
    } else {
      for (const [k, node] of Object.entries(L.nodes)) if (overlap(l, node)) v.push(`${l.id}: overlaps ${k}`);
    }
    if (l.x < -0.5 || l.x + l.w > L.W + 0.5 || l.y < -0.5 || l.y + l.h > L.H + 0.5) v.push(`${l.id}: outside card`);
    for (const e of L.edges) {
      if (l.touches.includes(e.id)) continue;
      for (let i = 0; i < e.points.length - 1; i++) {
        const g = rectGap(l, segRect(e.points[i], e.points[i + 1]));
        if (g < CLEAR - STROKE - 0.5) v.push(`${l.id}: ${g < 0 ? "crosses" : "too close to"} ${e.id}`);
      }
    }
  }
  for (let i = 0; i < L.labels.length; i++) {
    for (let j = i + 1; j < L.labels.length; j++) {
      if (overlap(L.labels[i], L.labels[j])) v.push(`${L.labels[i].id} overlaps ${L.labels[j].id}`);
    }
  }
  // Icons do not overlap labels.
  for (const ic of L.icons) {
    const r = { x: ic.x, y: ic.y, w: ic.size, h: ic.size };
    for (const l of L.labels) if (overlap(r, l)) v.push(`icon ${ic.id} overlaps ${l.id}`);
  }
  // Routes do not cross nodes except at their own ports, and distinct routes keep 12px.
  for (const e of L.edges) {
    for (let i = 0; i < e.points.length - 1; i++) {
      const s = segRect(e.points[i], e.points[i + 1]);
      for (const [k, n] of Object.entries(L.nodes)) {
        const inner = { x: n.x + 1, y: n.y + 1, w: n.w - 2, h: n.h - 2 };
        if (overlap(s.w ? s : { ...s, w: 0.01 }, inner) || overlap(s.h ? s : { ...s, h: 0.01 }, inner)) v.push(`${e.id}: passes through ${k}`);
      }
    }
  }
  for (let a = 0; a < L.edges.length; a++) {
    for (let b = a + 1; b < L.edges.length; b++) {
      const A = L.edges[a];
      const Bd = L.edges[b];
      if (A.kind === "bypass" || Bd.kind === "bypass") {
        const other = A.kind === "bypass" ? Bd : A;
        if (["intake", "supply"].includes(other.id)) continue; // joined at the tees
      }
      // Edges that share a port legitimately meet there.
      if (A.to === Bd.from || Bd.to === A.from) continue;
      for (let i = 0; i < A.points.length - 1; i++) {
        for (let j = 0; j < Bd.points.length - 1; j++) {
          const g = rectGap(segRect(A.points[i], A.points[i + 1]), segRect(Bd.points[j], Bd.points[j + 1]));
          if (g < CLEAR - 0.5) v.push(`${A.id} and ${Bd.id} closer than 12px`);
        }
      }
    }
  }
  for (const e of L.edges) for (const [x, y] of e.points) if (x < -0.5 || x > L.W + 0.5 || y < -0.5 || y > L.H + 0.5) v.push(`${e.id}: outside card`);
  return v;
}
