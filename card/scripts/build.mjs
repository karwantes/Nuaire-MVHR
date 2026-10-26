// Bundles src/ into one ES module: card/dist/mvhr-airflow-card.js (tests, /config/www), copied to
// the repo's dist/ where HACS looks for it (hacs.json at the repo root).
// node scripts/build.mjs
import { build } from "esbuild";
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "../dist/mvhr-airflow-card.js");
const hacs = resolve(here, "../../dist/mvhr-airflow-card.js");

await build({
  entryPoints: [resolve(here, "../src/index.js")],
  outfile: dist,
  bundle: true,
  format: "esm",
  target: "es2020",
  minify: false,
  legalComments: "none",
  charset: "ascii", // °, Δ and − escaped, so the file is safe whatever charset it is served with
  logLevel: "warning",
});
mkdirSync(dirname(hacs), { recursive: true });
copyFileSync(dist, hacs);
console.log(`built ${dist} (${statSync(dist).size} bytes), copied to ${hacs}`);
