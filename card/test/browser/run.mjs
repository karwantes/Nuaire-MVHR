// Browser acceptance run (qa/ACCEPTANCE.md). Uses the fixture harness only: hass is a mock and
// callService is a spy, so nothing here can reach a real unit.
//   node test/browser/run.mjs            all checks, all installed engines
// Writes qa/browser-results.json and screenshots to qa/screenshots/.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium, firefox, webkit } = await import(pathToFileURL(join(ROOT, "node_modules", "playwright", "index.mjs")).href);
const { serve } = await import(pathToFileURL(join(ROOT, "test", "serve.mjs")).href);

const SHOTS = join(ROOT, "qa", "screenshots");
mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  [320, 568], [360, 800], [390, 844], [430, 932], [844, 390], [768, 1024], [1024, 768], [820, 1180],
  [1280, 720], [1366, 768], [1440, 900], [1920, 1080], [2560, 1440], [3440, 1440], [3840, 2160], [5120, 2880],
];
const DPR = [[1920, 1080, 2], [1280, 720, 3], [390, 844, 3]];
const ZOOM = [1, 1.25, 2, 4];
const FEATURE_SETS = {
  full: {},
  "aircon-off": { aircon: false },
  "bypass-off": { bypass: false },
  "both-off": { aircon: false, bypass: false },
  "metrics-minimal": { humidity: false, health: false, runtimes: false, water_circuit: false },
  "controls-off": { controls: false },
  "nav-off": { navigation: false },
};
const SHOT_SIZES = { phone: [390, 844], tablet: [820, 1180], desktop: [1440, 900] };
const FEATS6 = ["aircon", "water_circuit", "bypass", "humidity", "health", "runtimes"];

const results = {};
function rec(area, ok, detail) {
  const r = results[area] || (results[area] = { pass: 0, fail: 0, failures: [], notes: [] });
  if (ok === null) { r.notes.push(detail); return; }
  if (ok) r.pass++; else { r.fail++; if (r.failures.length < 40) r.failures.push(detail); }
}
function blocked(area, why) {
  const r = results[area] || (results[area] = { pass: 0, fail: 0, failures: [], notes: [] });
  r.blocked = (r.blocked || []).concat(why);
}

// Runs in the page: layout validation, overflow, target size and mode for the first card.
const INSPECT = async () => {
  const { validateLayout } = await import("/src/layout.js");
  const c = window.__cards[0];
  const sr = c.shadowRoot;
  const wrap = sr.querySelector(".wrap");
  const W = wrap.getBoundingClientRect();
  const L = c.layoutModel;
  const out = { mode: wrap.dataset.mode, cardWidth: L ? L.cardWidth : null, requested: L ? L.requested : null,
    fallback: L && L.fallback ? L.fallback : null, violations: L ? validateLayout(L) : ["no layout model"],
    overflow: [], small: [], pageOverflow: document.documentElement.scrollWidth - window.innerWidth };
  for (const el of sr.querySelectorAll("*")) {
    if (el.closest("svg") && el.tagName.toLowerCase() !== "svg") continue;
    if (["STYLE", "DATALIST", "OPTION"].includes(el.tagName)) continue;
    if (el.contains(wrap)) continue; // ha-card and other hosts of .wrap span the full grid cell
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden") continue;
    if (r.left < W.left - 1 || r.right > W.right + 1) out.overflow.push(`${el.tagName.toLowerCase()}.${el.className}`.slice(0, 60) + ` ${Math.round(r.left - W.left)}..${Math.round(r.right - W.left)} of ${Math.round(W.width)}`);
    if (!el.children.length && el.textContent.trim() && el.scrollWidth > el.clientWidth + 1 && cs.overflowX !== "visible") {
      out.overflow.push(`clipped ${el.tagName.toLowerCase()}.${el.className}: "${el.textContent.trim().slice(0, 30)}"`);
    }
    if (el.matches("button, a[href], [role=button], [role=radio], [role=switch]")) {
      if (r.width < 44 - 0.5 || r.height < 44 - 0.5) out.small.push(`${el.tagName.toLowerCase()}.${el.className} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
    }
  }
  return out;
};

function expectedMode(cw) { return cw < 768 ? "mobile" : cw < 1280 ? "compact" : "wide"; }

async function open(browser, { width = 1400, height = 900, dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${BASE}/test/browser/harness.html`);
  await page.waitForFunction(() => window.__ready);
  return { ctx, page, errors };
}

const mountCfg = (page, extra = {}, opts = {}) => page.evaluate(([extra, opts]) => {
  const cfg = window.liveConfig({ ...extra, features: { navigation: true, ...(extra.features || {}) } });
  return window.mount(cfg, opts);
}, [extra, opts]);

async function geometry(area, page, label, expectMode = true, scale = 1) {
  const g = await page.evaluate(INSPECT);
  rec("Geometry / port continuity", g.violations.length === 0, `${label}: ${g.violations.slice(0, 2).join("; ")}`);
  rec(area, g.overflow.length === 0 && g.pageOverflow <= 1, `${label}: overflow ${g.pageOverflow}px page; ${g.overflow.slice(0, 2).join("; ")}`);
  if (expectMode) {
    const exp = expectedMode(g.cardWidth / scale); // text_scale reflows earlier
    const modeOk = g.requested === exp && (g.mode === exp || (g.fallback && g.fallback.length));
    rec(area, modeOk, `${label}: card ${g.cardWidth} requested ${g.requested} shown ${g.mode}, expected ${exp}`);
    if (g.fallback && g.fallback.length) rec(area, null, `${label}: fell back ${g.requested}→${g.mode} (${g.fallback[0]})`);
  }
  rec("Accessibility", g.small.length === 0, `${label}: targets under 44px: ${g.small.slice(0, 3).join("; ")}`);
  return g;
}

// ---------- per-engine checks ----------

async function responsive(name, browser) {
  const A = "Responsive screen matrix";
  for (const [w, h] of VIEWPORTS) {
    const { ctx, page, errors } = await open(browser, { width: w, height: h });
    await mountCfg(page);
    await geometry(A, page, `${name} ${w}x${h}`);
    rec(A, errors.length === 0, `${name} ${w}x${h}: ${errors[0]}`);
    await ctx.close();
  }
  for (const [w, h, dpr] of DPR) {
    const { ctx, page } = await open(browser, { width: w, height: h, dpr });
    await mountCfg(page);
    await geometry(A, page, `${name} ${w}x${h}@${dpr}x`);
    await ctx.close();
  }
  // Browser zoom Z on a 1280x720 screen = a 1280/Z CSS viewport at DPR Z.
  for (const z of ZOOM) {
    const { ctx, page } = await open(browser, { width: Math.round(1280 / z), height: Math.round(720 / z), dpr: z });
    await mountCfg(page);
    await geometry(A, page, `${name} 1280x720 zoom ${z * 100}%`);
    await ctx.close();
  }
  // Text size 125%/160% through the card's own text_scale.
  for (const s of [1.25, 1.6]) {
    for (const w of [390, 1024, 1440]) {
      const { ctx, page } = await open(browser, { width: w, height: 900 });
      await mountCfg(page, { layout: { text_scale: s } });
      await geometry(A, page, `${name} ${w} text ${s * 100}%`, true, s);
      await ctx.close();
    }
  }
  // Both sides of each breakpoint, by card width (cell = card + 32px of card padding).
  const { ctx, page } = await open(browser, { width: 1600, height: 900 });
  for (const cw of [766, 767, 768, 769, 1278, 1279, 1280, 1281]) {
    await mountCfg(page, {}, { width: cw + 32 });
    await geometry(A, page, `${name} card ${cw}`);
  }
  // 320..2560 sweep in 16px steps.
  let n = 0;
  for (let w = 320; w <= 2560; w += 16) {
    await page.setViewportSize({ width: w, height: 900 });
    await mountCfg(page);
    await geometry(A, page, `${name} sweep ${w}`);
    n++;
  }
  rec(A, null, `${name}: sweep 320–2560 step 16 (${n} widths)`);
  await ctx.close();
}

async function features(name, browser) {
  const A = "Feature combinations";
  const { ctx, page, errors } = await open(browser, { width: 1600, height: 900 });
  for (let mask = 0; mask < 64; mask++) {
    const f = {};
    FEATS6.forEach((k, i) => { f[k] = !!(mask & (1 << i)); });
    for (const cw of [358, 1000, 1440]) {
      await mountCfg(page, { features: f }, { width: cw + 32 });
      const g = await geometry(A, page, `${name} mask ${mask} @${cw}`);
      const dom = await page.evaluate(() => {
        const L = window.__cards[0].layoutModel;
        return { coil: !!(L.nodes && L.nodes.coil), water: L.edges.filter((e) => e.kind === "water").length, bypass: !!L.bypass };
      });
      if (!f.aircon) rec(A, !dom.coil && dom.water === 0, `${name} mask ${mask} @${cw}: aircon off but coil/water drawn`);
      if (!f.bypass) rec(A, !dom.bypass, `${name} mask ${mask} @${cw}: bypass off but bypass drawn`);
      void g;
    }
  }
  rec(A, errors.length === 0, `${name}: console errors: ${errors[0]}`);
  await ctx.close();
}

// ---------- Chromium-only checks ----------

async function screenshots(browser) {
  const A = "Screenshots";
  for (const [size, [w, h]] of Object.entries(SHOT_SIZES)) {
    const { ctx, page } = await open(browser, { width: w, height: h });
    for (const [set, f] of Object.entries(FEATURE_SETS)) {
      await mountCfg(page, { features: f });
      const file = `${set}-${size}.png`;
      await page.screenshot({ path: join(SHOTS, file), fullPage: true });
      rec(A, true, file);
    }
    await ctx.close();
  }
  // Demo mode at the reference size, for side-by-side with reference/approved-desktop.png.
  const { ctx, page } = await open(browser, { width: 1440, height: 900 });
  await page.evaluate(() => window.mount({ type: "custom:mvhr-airflow-card", demo: true, features: { navigation: false } }));
  await page.screenshot({ path: join(SHOTS, "demo-desktop.png"), fullPage: true });
  await ctx.close();
}

async function controls(browser) {
  const A = "Service payloads/readback";
  const { ctx, page, errors } = await open(browser, { width: 1440, height: 900 });
  const calls = () => page.evaluate(() => window.__calls.length);
  const reset = (mode = "ok") => page.evaluate((m) => { window.__calls.length = 0; window.__serviceMode = m; }, mode);
  const ctl = (key) => page.evaluate((k) => {
    const el = window.__cards[0].shadowRoot.querySelector(`.ctl[data-ctl="${k}"]`);
    return el ? { pending: el.classList.contains("pending"), error: el.classList.contains("error"), note: (el.querySelector(".ctl-note") || {}).textContent || "" } : null;
  }, key);
  const click = (sel) => page.evaluate((s) => { const b = window.__cards[0].shadowRoot.querySelector(s); if (!b) return false; b.click(); return true; }, sel);
  const wait = (ms) => page.waitForTimeout(ms);
  const fast = (extra = {}) => page.evaluate((extra) => {
    const c = window.liveConfig(extra);
    for (const k of Object.keys(c.controls)) c.controls[k].adapter.timeout_ms = 1000; // the minimum the config allows
    return window.mount(c);
  }, extra);

  // Passive: mount, resize, feature toggles, hass updates, editor - no service calls.
  await reset();
  await mountCfg(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await wait(100);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const f of Object.values(FEATURE_SETS)) await mountCfg(page, { features: f });
  await page.evaluate(() => { const c = window.__cards[0]; for (let i = 0; i < 20; i++) c.hass = window.makeHass({ outdoor_temperature: 10 + i }); });
  await page.evaluate(() => window.mount({ type: "custom:mvhr-airflow-card", demo: true }));
  await wait(200);
  rec(A, (await calls()) === 0, `passive: ${await calls()} calls`);

  // One call per click; a second click while pending is ignored; readback confirms.
  await reset();
  await fast();
  await click('button.segbtn[data-control="fan_speed"][data-value="2"]');
  await click('button.segbtn[data-control="fan_speed"][data-value="3"]');
  await wait(50);
  rec(A, (await calls()) === 1, `fan click: ${await calls()} calls`);
  const c1 = await page.evaluate(() => window.__calls[0]);
  rec(A, c1 && c1.domain === "select" && c1.service === "select_option" && c1.data.option === "2", `fan payload ${JSON.stringify(c1)}`);
  rec(A, (await ctl("fan_speed")).pending, "fan pending state shown");
  await page.evaluate(() => { window.__cards[0].hass = window.makeHass({ speed_state: "2" }); });
  await wait(50);
  const s1 = await ctl("fan_speed");
  rec(A, !s1.pending && !s1.error, `fan readback confirms: ${JSON.stringify(s1)}`);
  const on = await page.evaluate(() => window.__cards[0].shadowRoot.querySelector('button.segbtn[data-control="fan_speed"][aria-checked="true"]')?.dataset.value);
  rec(A, on === "2", `fan selected after readback: ${on}`);

  // Switch payload.
  await reset();
  await fast();
  await click('button.switch[data-control="night"]');
  await wait(50);
  const c2 = await page.evaluate(() => window.__calls);
  rec(A, c2.length === 1 && c2[0].domain === "switch" && /^turn_(on|off)$/.test(c2[0].service), `night payload ${JSON.stringify(c2)}`);

  // Rapid clicks across one control: one call.
  await reset("hang");
  await fast();
  for (let i = 0; i < 10; i++) await click(`button.segbtn[data-control="bypass_mode"][data-value="${["On", "Off"][i % 2]}"]`);
  await wait(50);
  rec(A, (await calls()) === 1, `rapid clicks: ${await calls()} calls`);

  // Timeout: error, no retry, value not assumed.
  await wait(1100);
  const t = await ctl("bypass_mode");
  rec(A, t.error && /No confirmation/.test(t.note), `timeout: ${JSON.stringify(t)}`);
  await wait(500);
  rec(A, (await calls()) === 1, `timeout no retry: ${await calls()} calls`);
  const stillAuto = await page.evaluate(() => window.__cards[0].shadowRoot.querySelector('button.segbtn[data-control="bypass_mode"][aria-checked="true"]')?.dataset.value);
  rec(A, stillAuto === "Auto", `timeout keeps readback value: ${stillAuto}`);

  // Reject and permission.
  for (const [mode, re] of [["reject", /^Failed/], ["perm", /Permission denied/]]) {
    await reset(mode);
    await fast();
    await click('button.segbtn[data-control="fan_speed"][data-value="3"]');
    await wait(100);
    const e = await ctl("fan_speed");
    rec(A, e.error && re.test(e.note), `${mode}: ${JSON.stringify(e)}`);
    const alert = await page.evaluate(() => !!window.__cards[0].shadowRoot.querySelector('.ctl[data-ctl="fan_speed"] [role=alert]'));
    rec("Accessibility", alert, `${mode}: error announced with role=alert`);
    await wait(1200);
    rec(A, (await calls()) === 1, `${mode}: no retry (${await calls()} calls)`);
  }

  // Stepper: three quick presses, one call after the debounce, with the summed value.
  await reset("hang");
  await fast();
  for (let i = 0; i < 3; i++) await click('button.step[data-control="bypass_threshold"][data-step="1"]');
  await wait(100);
  rec(A, (await calls()) === 0, `stepper before debounce: ${await calls()} calls`);
  const shown = await page.evaluate(() => window.__cards[0].shadowRoot.querySelector('.ctl[data-ctl="bypass_threshold"] output.stepval')?.textContent);
  rec(A, /27/.test(shown || ""), `stepper shows pending 27: ${shown}`);
  await wait(400);
  const c3 = await page.evaluate(() => window.__calls);
  rec(A, c3.length === 1 && c3[0].domain === "number" && c3[0].data.value === 27, `stepper call ${JSON.stringify(c3)}`);

  // Stepper limits: at max the + button is disabled and does nothing.
  await reset();
  await page.evaluate(() => { const c = window.liveConfig(); return window.mount(c, { hass: window.makeHass({ bypass_threshold: 30 }) }); });
  const lim = await page.evaluate(() => { const b = window.__cards[0].shadowRoot.querySelector('button.step[data-control="bypass_threshold"][data-step="1"]'); b.click(); return b.disabled; });
  await wait(450);
  rec(A, lim && (await calls()) === 0, `stepper at max: disabled=${lim} calls=${await calls()}`);
  await page.evaluate(() => window.mount(window.liveConfig(), { hass: window.makeHass({ bypass_threshold: 15 }) }));
  const limLo = await page.evaluate(() => window.__cards[0].shadowRoot.querySelector('button.step[data-control="bypass_threshold"][data-step="-1"]').disabled);
  rec(A, limLo, "stepper at min: − disabled");

  // Read-only (the default): every control disabled, clicks do nothing.
  await reset();
  await page.evaluate(() => window.mount({ ...window.liveConfig(), read_only: true }));
  await page.evaluate(() => { for (const b of window.__cards[0].shadowRoot.querySelectorAll("button[data-control]")) b.click(); });
  await wait(450);
  const ro = await page.evaluate(() => [...window.__cards[0].shadowRoot.querySelectorAll("button[data-control]")].every((b) => b.disabled));
  rec(A, ro && (await calls()) === 0, `read-only: all disabled=${ro}, calls=${await calls()}`);

  // Unavailable target: disabled, no call.
  await reset();
  await page.evaluate(() => window.mount(window.liveConfig(), { hass: window.makeHass({ speed_state: "unavailable" }) }));
  await click('button.segbtn[data-control="fan_speed"][data-value="2"]');
  await wait(50);
  rec(A, (await calls()) === 0, `unavailable entity: ${await calls()} calls`);

  rec(A, errors.length === 0, `console errors: ${errors.join(" | ")}`);
  await ctx.close();
}

async function states(browser) {
  const A = "State and units";
  const { ctx, page } = await open(browser, { width: 1440, height: 900 });
  const text = () => page.evaluate(() => window.__cards[0].shadowRoot.querySelector(".wrap").textContent);
  for (const v of ["unknown", "unavailable", "NaN", null]) {
    await page.evaluate((v) => window.mount(window.liveConfig(), { hass: window.makeHass({ outdoor_temperature: v, supply_temperature: v }) }), v);
    const t = await text();
    rec(A, t.includes("—") && !/NaN|undefined|null/.test(t), `${v}: em dash shown, no NaN/undefined`);
  }
  await page.evaluate(() => window.mount(window.liveConfig(), { hass: window.makeHass({ outdoor_temperature: 0 }) }));
  rec(A, (await text()).includes("0.0°C"), "0 shows 0.0°C");
  await page.evaluate(() => { const h = window.makeHass(); h.config = { ...(h.config || {}), unit_system: { temperature: "°F" } }; return window.mount(window.liveConfig(), { hass: h }); });
  const f = await text();
  rec(A, f.includes("°F") && !/\d°C/.test(f), "HA °F unit system converts all temperatures");
  await page.evaluate(() => { const h = window.makeHass(); h.locale = { language: "de" }; return window.mount(window.liveConfig(), { hass: h }); });
  rec(A, /\d,\d°C/.test(await text()), "comma-decimal locale");
  await page.evaluate(() => window.mount(window.liveConfig(), { hass: { ...window.makeHass(), connected: false } }));
  const disc = await page.evaluate(() => [...window.__cards[0].shadowRoot.querySelectorAll("button[data-control]")].every((b) => b.disabled));
  rec(A, disc, "disconnected: controls disabled");
  // Long labels at phone and tablet widths.
  for (const w of [320, 768]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.evaluate(() => {
      const c = window.liveConfig({ features: { navigation: true } });
      c.navigation = c.navigation.map((n) => ({ ...n, label: n.label + " with a much longer dashboard name" }));
      c.title = "Mechanical ventilation with heat recovery — upstairs plant room";
      return window.mount(c);
    });
    const g = await page.evaluate(INSPECT);
    rec(A, g.overflow.length === 0 && g.pageOverflow <= 1, `long labels @${w}: ${g.overflow.slice(0, 2).join("; ")}`);
  }
  await ctx.close();
}

async function instances(browser) {
  const A = "Navigation/assets";
  const { ctx, page, errors } = await open(browser, { width: 1440, height: 900 });
  await page.evaluate(() => window.mount(window.liveConfig({ features: { navigation: true } }), { count: 3 }));
  const ids = await page.evaluate(() => window.__cards.flatMap((c) => [...c.shadowRoot.querySelectorAll("[id]")].map((e) => e.id)));
  rec("GUI parity and persistence", ids.length > 0 && new Set(ids).size === ids.length, `unique ids across 3 cards: ${ids.length} ids, ${new Set(ids).size} unique`);
  const refs = await page.evaluate(() => window.__cards.every((c) => [...c.shadowRoot.querySelectorAll("[fill^='url('],[stroke^='url('],[marker-end],[clip-path],[mask],[filter]")]
    .every((e) => [...e.attributes].filter((a) => /url\(#/.test(a.value)).every((a) => c.shadowRoot.getElementById(a.value.match(/url\(#([^)]+)\)/)[1])))));
  rec(A, refs, "every url(#id) resolves in its own card");

  // Navigation: internal path changes without reload, no service calls; More menu and Escape.
  await page.evaluate(() => window.mount(window.liveConfig({ features: { navigation: true } })));
  await page.evaluate(() => { window.__calls.length = 0; window.__nav = 0; window.addEventListener("location-changed", () => window.__nav++); });
  const first = await page.evaluate(() => { const a = window.__cards[0].shadowRoot.querySelector("[data-nav]"); a.click(); return a.dataset.nav; });
  const nav = await page.evaluate(() => ({ path: location.pathname, n: window.__nav, calls: window.__calls.length }));
  rec(A, nav.n === 1 && nav.path.startsWith("/lovelace/") && nav.calls === 0, `nav item ${first}: ${JSON.stringify(nav)}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  const more = await page.evaluate(() => {
    const b = window.__cards[0].shadowRoot.querySelector("button.nav-item.more");
    if (!b) return { none: true };
    const before = b.getAttribute("aria-expanded");
    b.click();
    return { before };
  });
  await page.waitForTimeout(50);
  const opened = await page.evaluate(() => window.__cards[0].shadowRoot.querySelector("button.nav-item.more")?.getAttribute("aria-expanded"));
  await page.evaluate(() => window.__cards[0].shadowRoot.querySelector(".wrap").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  await page.waitForTimeout(50);
  const closed = await page.evaluate(() => window.__cards[0].shadowRoot.querySelector("button.nav-item.more")?.getAttribute("aria-expanded"));
  rec(A, !more.none && more.before === "false" && opened === "true" && closed === "false", `More menu ${JSON.stringify(more)} → ${opened} → Escape ${closed}`);
  // Metric tap opens more-info.
  await page.evaluate(() => { window.__moreInfo.length = 0; window.__cards[0].shadowRoot.querySelector("button.metric[data-entity]")?.click(); });
  rec(A, (await page.evaluate(() => window.__moreInfo.length)) === 1, "metric tap fires hass-more-info");

  // 100 attach/detach cycles: observers return to baseline, no errors.
  await page.evaluate(() => window.mount(window.liveConfig()));
  const leak = await page.evaluate(async () => {
    const root = document.getElementById("root");
    root.innerHTML = "";
    await new Promise((r) => requestAnimationFrame(r));
    const base = window.__ro.live;
    const cfg = window.liveConfig({ features: { navigation: true } });
    const hass = window.makeHass();
    for (let i = 0; i < 100; i++) {
      const card = document.createElement("mvhr-airflow-card");
      card.setConfig(cfg);
      card.hass = hass;
      root.appendChild(card);
      await new Promise((r) => requestAnimationFrame(r));
      card.remove();
    }
    const card = document.createElement("mvhr-airflow-card");
    card.setConfig(cfg); card.hass = hass; root.appendChild(card);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    root.removeChild(card); root.appendChild(card); // re-attach the same element
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const reattached = !!card.shadowRoot.querySelector(".stage svg");
    card.remove();
    return { base, after: window.__ro.live, made: window.__ro.made, reattached };
  });
  rec("Build and unit tests", leak.after === leak.base && leak.reattached, `100 attach/detach: live observers ${leak.base} → ${leak.after} (${leak.made} made), re-attach renders ${leak.reattached}`);
  rec(A, errors.length === 0, `console errors: ${errors.join(" | ")}`);
  await ctx.close();
}

async function editor(browser) {
  const A = "GUI parity and persistence";
  const { ctx, page, errors } = await open(browser, { width: 1000, height: 900 });
  const r = await page.evaluate(async () => {
    window.__calls.length = 0;
    const root = document.getElementById("root");
    root.innerHTML = "";
    const cfg = window.liveConfig({ features: { navigation: true }, custom_extra: { keep: 1 } });
    const ed = document.createElement("mvhr-airflow-card-editor");
    ed.hass = window.makeHass();
    ed.setConfig(cfg);
    root.appendChild(ed);
    await new Promise((r) => requestAnimationFrame(r));
    const got = [];
    ed.addEventListener("config-changed", (e) => got.push(e.detail.config));
    const sr = ed.shadowRoot;
    const sections = sr.querySelectorAll("details[data-sec]").length;
    const box = sr.querySelector('input[data-path="features.aircon"]');
    box.checked = false;
    box.dispatchEvent(new Event("change", { bubbles: true }));
    const out = got[got.length - 1];
    // Echo: HA feeds the emitted config back; the editor must not emit again.
    const n = got.length;
    ed.setConfig(out);
    const echo = got.length === n;
    // The card accepts what the editor emits.
    const card = document.createElement("mvhr-airflow-card");
    let ok = true;
    try { card.setConfig(out); } catch { ok = false; }
    // Re-open: a new editor shows the saved value.
    const ed2 = document.createElement("mvhr-airflow-card-editor");
    ed2.setConfig(out);
    root.appendChild(ed2);
    await new Promise((r) => requestAnimationFrame(r));
    const reopened = ed2.shadowRoot.querySelector('input[data-path="features.aircon"]').checked === false;
    // Invalid input is refused with a message, not emitted.
    const before = got.length;
    const mob = sr.querySelector('[data-path="layout.mobile_below"]');
    let refused = null;
    if (mob) {
      mob.value = "5000";
      mob.dispatchEvent(new Event("change", { bubbles: true }));
      refused = got.length === before && !sr.querySelector(".err").hidden;
    }
    return { sections, emitted: got.length, aircon: out && out.features.aircon, extra: out && out.custom_extra,
      sameEntities: out && out.bindings.outdoor_temperature && out.bindings.outdoor_temperature.entity === (cfg.bindings.outdoor_temperature.entity || cfg.bindings.outdoor_temperature),
      echo, ok, reopened, refused, calls: window.__calls.length };
  });
  rec(A, r.sections === 8, `editor sections: ${r.sections}`);
  rec(A, r.emitted >= 1 && r.aircon === false, `toggle emits config-changed with aircon false (${r.emitted})`);
  rec(A, r.extra && r.extra.keep === 1, "unknown keys survive the editor");
  rec(A, r.sameEntities, "bindings unchanged by unrelated edit");
  rec(A, r.echo, "own echo does not re-emit");
  rec(A, r.ok, "card accepts editor output");
  rec(A, r.reopened, "re-opened editor shows saved value");
  rec(A, r.refused === true, `invalid value refused with message (${r.refused})`);
  rec("Service payloads/readback", r.calls === 0, `editor use: ${r.calls} calls`);
  rec(A, errors.length === 0, `console errors: ${errors.join(" | ")}`);
  await ctx.close();
}

async function a11y(browser) {
  const A = "Accessibility";
  const { ctx, page } = await open(browser, { width: 1440, height: 900 });
  await mountCfg(page);
  const r = await page.evaluate(() => {
    const sr = window.__cards[0].shadowRoot;
    const btns = [...sr.querySelectorAll("button, a[href]")].filter((b) => b.getBoundingClientRect().width);
    const unnamed = btns.filter((b) => !(b.getAttribute("aria-label") || b.textContent.trim() || b.getAttribute("title") || (b.getAttribute("aria-labelledby") || "").split(" ").some((id) => (sr.getElementById(id) || {}).textContent)));
    const radios = [...sr.querySelectorAll("button.segbtn")].every((b) => b.getAttribute("role") === "radio" && ["true", "false"].includes(b.getAttribute("aria-checked")));
    const switches = [...sr.querySelectorAll("button.switch")].every((b) => b.getAttribute("role") === "switch" && ["true", "false"].includes(b.getAttribute("aria-checked")));
    const svg = sr.querySelector(".stage svg");
    return { n: btns.length, unnamed: unnamed.map((b) => b.className), radios, switches,
      svgLabel: !!(svg && (svg.getAttribute("aria-label") || svg.querySelector("title") || svg.getAttribute("aria-hidden") === "true")) };
  });
  rec(A, r.unnamed.length === 0, `buttons without a name: ${r.unnamed.join(", ")}`);
  rec(A, r.radios, "segment buttons are radios with aria-checked");
  rec(A, r.switches, "switches have role=switch and aria-checked");
  rec(A, r.svgLabel, "diagram has a text alternative");
  // Keyboard: Tab reaches a control, Enter/Space work like a click.
  await page.evaluate(() => { window.__calls.length = 0; });
  let reached = false;
  for (let i = 0; i < 60 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await page.evaluate(() => { const a = window.__cards[0].shadowRoot.activeElement; return !!(a && a.matches('button.segbtn[data-control="fan_speed"]:not(.on)')); });
  }
  rec(A, reached, "Tab reaches the fan speed control");
  const outline = await page.evaluate(() => { const a = window.__cards[0].shadowRoot.activeElement; if (!a) return null; const cs = getComputedStyle(a); return cs.outlineStyle !== "none" || cs.boxShadow !== "none"; });
  if (reached) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(50);
    rec(A, (await page.evaluate(() => window.__calls.length)) === 1, "Enter on a segment sends exactly one call");
  }
  rec(A, outline === true, "focused control has a visible focus ring");
  // Reduced motion and forced colours do not break the layout.
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await mountCfg(page);
  const g = await page.evaluate(INSPECT);
  rec(A, g.violations.length === 0 && g.overflow.length === 0, "reduced motion + forced colours");
  await ctx.close();
}

// ---------- run ----------

const server = await serve(0);
const BASE = `http://127.0.0.1:${server.address().port}`;
const engines = { chromium, firefox, webkit };
const versions = {};
for (const [name, type] of Object.entries(engines)) {
  let browser;
  try { browser = await type.launch(); } catch (e) {
    for (const a of ["Responsive screen matrix", "Feature combinations"]) blocked(a, `${name}: not installed (${String(e.message).split("\n")[0]})`);
    continue;
  }
  versions[name] = browser.version();
  console.log(`${name} ${versions[name]}`);
  try {
    await responsive(name, browser);
    await features(name, browser);
    if (name === "chromium") {
      await screenshots(browser);
      await controls(browser);
      await states(browser);
      await instances(browser);
      await editor(browser);
      await a11y(browser);
    } else {
      await controls(browser);
      await a11y(browser);
    }
  } catch (e) {
    rec("Build and unit tests", false, `${name}: runner error ${e.stack}`);
  }
  await browser.close();
}
server.close();

const summary = { generated: new Date().toISOString(), versions, results };
writeFileSync(join(ROOT, "qa", "browser-results.json"), JSON.stringify(summary, null, 2));
let failed = 0;
for (const [area, r] of Object.entries(results)) {
  failed += r.fail;
  console.log(`${r.fail ? "FAIL" : "PASS"}  ${area}: ${r.pass} passed, ${r.fail} failed${r.blocked ? `, blocked: ${r.blocked.join("; ")}` : ""}`);
  for (const f of r.failures.slice(0, 8)) console.log(`        - ${f}`);
}
process.exit(failed ? 1 : 0);
