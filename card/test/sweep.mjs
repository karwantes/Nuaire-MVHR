// Developer sweep: node test/sweep.mjs [step] — prints layout violations per width/combination.
import { normalizeConfig } from "../src/config.js";
import { buildModel } from "../src/state.js";
import { computeLayout, validateLayout } from "../src/layout.js";
import { demoBindings, demoHass } from "../src/fixture.js";
import { layoutInputs } from "../src/render.js";

const step = Number(process.argv[2] || 16);
const FEATS = ["aircon", "water_circuit", "bypass", "humidity", "health", "runtimes"];
const hass = demoHass();
let bad = 0;
let runs = 0;
const seen = new Map();
for (let mask = 0; mask < 64; mask++) {
  const features = {};
  FEATS.forEach((f, i) => { features[f] = !!(mask & (1 << i)); });
  const cfg = normalizeConfig({ type: "custom:mvhr-airflow-card", demo: true, bindings: demoBindings(), features });
  const model = buildModel(hass, cfg);
  for (let w = 280; w <= 2560; w += step) {
    runs++;
    let L;
    try { L = computeLayout(cfg, layoutInputs(cfg, model, hass, w, w)); } catch (e) { bad++; console.log(mask, w, "THROW", e.message); continue; }
    const v = validateLayout(L);
    if (v.length) {
      bad++;
      for (const x of v) { const k = `${L.mode}|${x}`; if (!seen.has(k)) seen.set(k, `${mask}@${w}`); }
    }
  }
}
for (const [k, at] of seen) console.log(k, " first:", at);
console.log(`${runs} runs, ${bad} with violations`);
