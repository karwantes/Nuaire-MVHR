import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../../src/config.js";
import { buildModel } from "../../src/state.js";
import { computeLayout, validateLayout } from "../../src/layout.js";
import { demoBindings, demoHass } from "../../src/fixture.js";
import { layoutInputs } from "../../src/render.js";

const FEATS = ["aircon", "water_circuit", "bypass", "humidity", "health", "runtimes"];
const hass = demoHass();
const cfgFor = (mask, extra = {}) => {
  const features = {};
  FEATS.forEach((f, i) => { features[f] = !!(mask & (1 << i)); });
  return normalizeConfig({ demo: true, bindings: demoBindings(), features, ...extra });
};
const lay = (cfg, w) => computeLayout(cfg, layoutInputs(cfg, buildModel(hass, cfg), hass, w, w));

test("all 64 feature combinations x 280..2560 step 32: no violations", () => {
  const bad = [];
  for (let mask = 0; mask < 64; mask++) {
    const cfg = cfgFor(mask);
    for (let w = 280; w <= 2560; w += 32) {
      const v = validateLayout(lay(cfg, w));
      if (v.length) bad.push(`${mask}@${w}: ${v[0]}`);
    }
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test("breakpoints: both sides of 768 and 1280", () => {
  const cfg = cfgFor(63);
  assert.equal(lay(cfg, 767).mode, "mobile");
  assert.equal(lay(cfg, 768).mode, "compact");
  assert.equal(lay(cfg, 1279).requested, "compact");
  // Node measures text with a conservative estimate; the browser test checks the real mode at 1280.
  assert.equal(lay(cfg, 1280).requested, "wide");
  assert.equal(lay(cfg, 1400).mode, "wide");
});

test("aircon off: no coil node, no water edges, no coil ports", () => {
  for (const w of [390, 1000, 1440]) {
    const L = lay(cfgFor(63 & ~1), w);
    assert.equal(L.nodes.coil, undefined, `${w}`);
    assert.equal(L.edges.filter((e) => e.kind === "water").length, 0);
    assert.equal(Object.keys(L.ports).filter((p) => p.includes("coil") || p.includes("water")).length, 0);
  }
});

test("bypass off: no bypass geometry", () => {
  for (const w of [390, 1000, 1440]) assert.ok(!lay(cfgFor(63 & ~4), w).bypass, `${w}`);
});

test("text scale and forced modes still validate", () => {
  for (const s of [1, 1.25, 1.6]) {
    for (const w of [320, 800, 1400, 2560]) {
      const L = lay(cfgFor(63, { layout: { text_scale: s } }), w);
      assert.deepEqual(validateLayout(L), [], `scale ${s} @ ${w}`);
    }
  }
  for (const mode of ["wide", "compact", "mobile"]) {
    const L = lay(cfgFor(63, { layout: { mode } }), 1600);
    assert.deepEqual(validateLayout(L), [], mode);
  }
});
