import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ConfigError, defaultConfig, normalizeConfig, normalizeBinding, navPathProblem, isLegacyConfig,
  migrateLegacy, effectiveFeatures, metricVisible, controlVisible, isUnconfigured,
} from "../../src/config.js";
import { FEATURE_KEYS, METRIC_KEYS, BINDING_KEYS, CONTROL_KEYS } from "../../src/constants.js";

test("defaults match the pack: read-only, nav off, breakpoints 768/1280", () => {
  const c = normalizeConfig({ type: "custom:mvhr-airflow-card" });
  assert.equal(c.read_only, true);
  assert.equal(c.demo, false);
  assert.equal(c.layout.compact_below, 1280);
  assert.equal(c.layout.mobile_below, 768);
  assert.equal(c.features.navigation, false);
  for (const k of FEATURE_KEYS.filter((k) => k !== "navigation")) assert.equal(c.features[k], true, k);
  assert.equal(Object.keys(c.metrics).length, METRIC_KEYS.length);
  assert.equal(METRIC_KEYS.length, 19);
  assert.equal(BINDING_KEYS.length, 27);
  assert.deepEqual(CONTROL_KEYS, ["fan_speed", "bypass_mode", "bypass_threshold", "night", "holiday"]);
  assert.equal(c.format.unavailable, "em_dash");
});

test("normalize is idempotent and keeps unknown keys", () => {
  const raw = { type: "custom:mvhr-airflow-card", custom_extra: { a: 1 }, layout: { foo: "bar" }, bindings: { outdoor_temperature: "sensor.outdoor" } };
  const a = normalizeConfig(raw);
  const b = normalizeConfig(a);
  assert.deepEqual(b, a);
  assert.deepEqual(a.custom_extra, { a: 1 });
  assert.equal(a.layout.foo, "bar");
  assert.equal(a.bindings.outdoor_temperature.entity, "sensor.outdoor");
});

test("input is not mutated", () => {
  const raw = { features: { aircon: false } };
  const copy = JSON.parse(JSON.stringify(raw));
  normalizeConfig(raw);
  assert.deepEqual(raw, copy);
});

test("errors name the path and the fix", () => {
  const bad = [
    [{ layout: { mode: "tiny" } }, "layout.mode"],
    [{ features: { aircon: "yes" } }, "features.aircon"],
    [{ layout: { mobile_below: 1300, compact_below: 1280 } }, "layout.mobile_below"],
    [{ bindings: { outdoor_temperature: "not an id" } }, "bindings.outdoor_temperature.entity"],
    [{ bindings: { outdoor_temperature: { entity: "sensor.x", input_unit: "%" } } }, "bindings.outdoor_temperature.input_unit"],
    [{ appearance: { supply: "red" } }, "appearance.supply"],
    [{ schema_version: 2 }, "schema_version"],
    [{ controls: { fan_speed: { adapter: { kind: "number", entity: "number.x" } } } }, "controls.fan_speed.adapter.kind"],
    [{ controls: { night: { adapter: { kind: "switch", entity: "select.x" } } } }, "controls.night.adapter.entity"],
    [{ controls: { night: { adapter: { kind: "script", action: "script.turn_on" } } } }, "controls.night.adapter.readback.entity"],
    [{ controls: { fan_speed: { adapter: { kind: "select", entity: "select.x", options: { "9": "x" } } } } }, "controls.fan_speed.adapter.options"],
    [{ format: { locale: "!!" } }, "format.locale"],
    [{ navigation: [{ icon: "nope", path: "/a" }] }, "navigation[0].icon"],
  ];
  for (const [raw, path] of bad) {
    assert.throws(() => normalizeConfig(raw), (e) => e instanceof ConfigError && e.path === path, path);
  }
});

test("binding shorthand and units", () => {
  assert.equal(normalizeBinding("outdoor_temperature", ""), null);
  const b = normalizeBinding("outdoor_temperature", { entity: "sensor.o", input_unit: "°F", precision: 2 });
  assert.equal(b.input_unit, "°F");
  assert.equal(b.precision, 2);
  const f = normalizeBinding("fault", { entity: "binary_sensor.a", extra_entities: ["binary_sensor.b"] });
  assert.deepEqual(f.extra_entities, ["binary_sensor.b"]);
});

test("navigation paths: only safe internal paths, external needs opt-in", () => {
  assert.equal(navPathProblem("/lovelace/mvhr"), null);
  assert.match(navPathProblem("javascript:alert(1)"), /not allowed/);
  assert.match(navPathProblem("data:text/html,x"), /not allowed/);
  assert.match(navPathProblem("//evil.example"), /Protocol-relative/);
  assert.match(navPathProblem("lovelace"), /start with \//);
  assert.match(navPathProblem("https://example.com"), /External link/);
  assert.equal(navPathProblem("https://example.com", true), null);
  assert.match(navPathProblem("ftp://x", true), /Only http/);
  assert.match(navPathProblem(""), /No destination/);
});

test("effective features: water needs aircon, nav needs an enabled item", () => {
  const c = normalizeConfig({ features: { aircon: false, water_circuit: true, navigation: true } });
  const f = effectiveFeatures(c);
  assert.equal(f.water_circuit, false);
  assert.equal(f.navigation, false);
  assert.equal(metricVisible(c, "coil_air_in"), false);
  assert.equal(metricVisible(c, "water_flow_temperature"), false);
  assert.equal(metricVisible(c, "outdoor_temperature"), true);
  const n = normalizeConfig({ features: { navigation: true }, navigation: [{ label: "A", path: "/a" }] });
  assert.equal(effectiveFeatures(n).navigation, true);
});

test("control visibility follows controls and bypass features", () => {
  const c = normalizeConfig({ features: { bypass: false } });
  assert.equal(controlVisible(c, "fan_speed"), true);
  assert.equal(controlVisible(c, "bypass_mode"), false);
  assert.equal(controlVisible(c, "bypass_threshold"), false);
  const off = normalizeConfig({ features: { controls: false } });
  for (const k of CONTROL_KEYS) assert.equal(controlVisible(off, k), false);
});

test("unconfigured until something is bound, demo counts as configured", () => {
  assert.equal(isUnconfigured(normalizeConfig({})), true);
  assert.equal(isUnconfigured(normalizeConfig({ demo: true })), false);
  assert.equal(isUnconfigured(normalizeConfig({ bindings: { online: "binary_sensor.x" } })), false);
});

test("legacy 0.2.x config migrates to schema 1, read-only, same entities", () => {
  const old = { type: "custom:nuaire-mvhr-card", layout: "portrait", show_coil: false, invert_bypass: true,
    unit: { fan_speed: "select.my_fan" }, entities: { supply_temp: "sensor.sup" }, colors: { supply: "#123456" } };
  assert.equal(isLegacyConfig(old), true);
  assert.equal(isLegacyConfig(defaultConfig()), false);
  const m = migrateLegacy(old);
  assert.equal(m.migrated_from, "0.2");
  const c = normalizeConfig(old);
  assert.equal(c.schema_version, 1);
  assert.equal(c.type, "custom:nuaire-mvhr-card");
  assert.equal(c.read_only, true);
  assert.equal(c.layout.mode, "mobile");
  assert.equal(c.features.aircon, false);
  assert.equal(c.bindings.speed_state.entity, "select.my_fan");
  assert.equal(c.bindings.supply_temperature.entity, "sensor.sup");
  assert.equal(c.bindings.bypass_position.entity, "binary_sensor.mrxbox_bypass_active");
  assert.deepEqual(c.state_mapping.bypass_position.open_values, ["off"]);
  assert.equal(c.controls.fan_speed.adapter.entity, "select.my_fan");
  assert.equal(c.appearance.supply, "#123456");
  assert.equal(c.bindings.fault.extra_entities.length, 4);
});

test("fill from unit hides air conditioning when the unit has no coil entities", async () => {
  const { proposeConfig } = await import("../../src/discovery.js");
  const ids = ["select.mrxbox_fan_speed", "sensor.mrxbox_intake_air_temperature", "sensor.mrxbox_extract_air_temperature"];
  const hass = {
    devices: { d1: { name: "MRXBOX", manufacturer: "Nuaire" } },
    entities: Object.fromEntries(ids.map((id) => [id, { entity_id: id, device_id: "d1" }])),
    states: Object.fromEntries(ids.map((id) => [id, { entity_id: id, state: "1", attributes: {} }])),
  };
  const { config, bound } = proposeConfig(hass, defaultConfig(), "d1");
  assert.ok(bound >= 3);
  assert.equal(config.features.aircon, false);
  assert.equal(config.features.water_circuit, false);
  assert.equal(config.title, "MVHR");
  const withCoil = { ...defaultConfig(), bindings: { ...defaultConfig().bindings, coil_air_in: { entity: "sensor.coil_in" } } };
  const kept = proposeConfig(hass, withCoil, "d1").config;
  assert.equal(kept.features.aircon, true);
  assert.equal(kept.title, "MVHR & Air Conditioning");
});