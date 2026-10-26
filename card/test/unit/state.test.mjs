import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../../src/config.js";
import {
  parseNumber, readBinding, readHealth, readBypassPosition, readCoilStatus, formatReading, buildModel,
  deriveDelta, deriveEfficiency, watchedEntities, EM_DASH, toCelsius, deltaToCelsius,
} from "../../src/state.js";
import { demoBindings, demoHass, demoEntity } from "../../src/fixture.js";

const cfgWith = (extra = {}) => normalizeConfig({ demo: true, bindings: demoBindings(), ...extra });
const one = (key, state, attrs = {}, extra = {}) => {
  const cfg = normalizeConfig({ bindings: { [key]: { entity: "sensor.x", ...(extra.binding || {}) } }, ...(extra.cfg || {}) });
  const hass = { states: state === undefined ? {} : { "sensor.x": { entity_id: "sensor.x", state, attributes: attrs } } };
  return { cfg, hass, r: readBinding(hass, cfg, key) };
};

test("parseNumber accepts only plain numbers", () => {
  assert.equal(parseNumber("21.5"), 21.5);
  assert.equal(parseNumber("0"), 0);
  assert.equal(parseNumber(0), 0);
  assert.equal(parseNumber("NaN"), null);
  assert.equal(parseNumber(NaN), null);
  assert.equal(parseNumber("21,5"), null);
  assert.equal(parseNumber(""), null);
  assert.equal(parseNumber("12abc"), null);
});

test("missing, unknown, unavailable, invalid are not zero", () => {
  assert.equal(one("outdoor_temperature", undefined).r.status, "missing");
  assert.equal(one("outdoor_temperature", "unknown").r.status, "unknown");
  assert.equal(one("outdoor_temperature", "unavailable").r.status, "unavailable");
  assert.equal(one("outdoor_temperature", "NaN").r.status, "invalid");
  const z = one("outdoor_temperature", "0", { unit_of_measurement: "°C" });
  assert.equal(z.r.status, "ok");
  assert.equal(z.r.value, 0);
  for (const s of [undefined, "unknown", "unavailable", "NaN"]) {
    const { cfg, hass, r } = one("outdoor_temperature", s);
    assert.equal(formatReading(cfg, hass, "outdoor_temperature", r), EM_DASH);
  }
  const { cfg, hass, r } = z;
  assert.equal(formatReading(cfg, hass, "outdoor_temperature", r), "0.0°C");
});

test("unavailable: hide policy returns null", () => {
  const { cfg, hass, r } = one("outdoor_temperature", "unavailable", {}, { cfg: { format: { unavailable: "hide" } } });
  assert.equal(formatReading(cfg, hass, "outdoor_temperature", r), null);
});

test("Fahrenheit in, Celsius stored; Fahrenheit display converts back", () => {
  const { cfg, hass, r } = one("outdoor_temperature", "68", { unit_of_measurement: "°F" });
  assert.ok(Math.abs(r.value - 20) < 1e-9);
  assert.equal(formatReading(cfg, hass, "outdoor_temperature", r), "20.0°C");
  const f = normalizeConfig({ ...cfg, format: { temperature_unit: "°F" } });
  assert.equal(formatReading(f, hass, "outdoor_temperature", r), "68.0°F");
  assert.equal(toCelsius(32, "°F"), 0);
  assert.ok(Math.abs(deltaToCelsius(9, "°F") - 5) < 1e-9);
});

test("HA unit system auto-selects °F", () => {
  const { cfg, r } = one("outdoor_temperature", "20", { unit_of_measurement: "°C" });
  const hass = { config: { unit_system: { temperature: "°F" } } };
  assert.equal(formatReading(cfg, hass, "outdoor_temperature", r), "68.0°F");
});

test("comma-decimal locale formats with a comma", () => {
  const { cfg, hass, r } = one("outdoor_temperature", "21.5", { unit_of_measurement: "°C" }, { cfg: { format: { locale: "de-DE" } } });
  assert.equal(formatReading(cfg, hass, "outdoor_temperature", r), "21,5°C");
  const h = { ...hass, locale: { language: "fr" } };
  const auto = normalizeConfig({ ...cfg, format: { locale: "auto" } });
  assert.equal(formatReading(auto, h, "outdoor_temperature", r), "21,5°C");
});

test("negative uses a true minus; delta shows sign", () => {
  const { cfg, hass, r } = one("outdoor_temperature", "-3.2", { unit_of_measurement: "°C" });
  assert.equal(formatReading(cfg, hass, "outdoor_temperature", r), "−3.2°C");
  const d = one("coil_air_delta", "1.25", { unit_of_measurement: "°C" });
  assert.equal(formatReading(d.cfg, d.hass, "coil_air_delta", d.r), "+1.3°C");
});

test("health: unknown is never treated as ok", () => {
  const cfg = cfgWith();
  const ok = readHealth(demoHass(), cfg);
  assert.equal(ok.online, "online");
  assert.equal(ok.fault, "ok");
  const bad = readHealth(demoHass({ online: null, fault: null }), cfg);
  assert.equal(bad.online, "unknown");
  assert.equal(bad.fault, "unknown");
  const odd = readHealth(demoHass({ fault: "maybe" }), cfg);
  assert.equal(odd.fault, "unknown");
  const f = readHealth(demoHass({ fault: true }), cfg);
  assert.equal(f.fault, "fault");
  const disc = readHealth({ ...demoHass(), connected: false }, cfg);
  assert.equal(disc.connected, false);
});

test("state mapping lists override defaults", () => {
  const cfg = cfgWith({ state_mapping: { bypass_position: { open_values: ["Open"], closed_values: ["Shut"] } } });
  assert.equal(readBypassPosition(demoHass({ bypass_position: "open" }), cfg).state, "unknown"); // "on" not listed
  const h = demoHass();
  h.states[demoEntity("bypass_position")].state = "Shut";
  assert.equal(readBypassPosition(h, cfg).state, "closed");
  const c2 = cfgWith({ state_mapping: { coil_status: { heating_values: ["preheat"] } } });
  const h2 = demoHass({ coil_status: "preheat" });
  assert.equal(readCoilStatus(h2, c2).state, "heating");
  assert.equal(readCoilStatus(demoHass({ coil_status: "idle" }), c2).state, "unknown");
});

test("derived values are opt-in and need valid inputs", () => {
  const base = cfgWith({ bindings: { ...demoBindings(), coil_air_delta: null, recovery_efficiency: null } });
  const m = buildModel(demoHass(), base);
  assert.equal(m.readings.coil_air_delta.status, "unbound");
  assert.equal(m.readings.recovery_efficiency.status, "unbound");
  const on = normalizeConfig({ ...base, derived: { coil_air_delta: "air_out_minus_air_in", recovery_efficiency: "temperature_ratio" } });
  const m2 = buildModel(demoHass({ bypass_position: "closed" }), on);
  assert.ok(Math.abs(m2.readings.coil_air_delta.value - (-0.1)) < 1e-9);
  assert.equal(m2.readings.recovery_efficiency.source, "calculated");
  const m3 = buildModel(demoHass({ bypass_position: "open" }), on);
  assert.equal(m3.readings.recovery_efficiency.status, "unavailable");
  const m4 = buildModel(demoHass({ coil_air_in: null }), on);
  assert.equal(m4.readings.coil_air_delta.status, "unavailable");
  assert.equal(deriveDelta(on, { ...m4.readings, coil_air_delta: { status: "ok", value: 2 } }).source, "sensor");
  assert.equal(deriveEfficiency(on, { ...m2.readings, recovery_efficiency: { status: "ok", value: 120 } }, "closed").flagged, true);
});

test("runtimes convert and format with grouping", () => {
  const cfg = cfgWith();
  const m = buildModel(demoHass(), cfg);
  assert.equal(m.text.unit_runtime, "29,676 h");
  const { cfg: c2, hass, r } = one("filter_runtime", "120", {}, { binding: { input_unit: "min" } });
  assert.equal(r.value, 2);
  assert.equal(formatReading(c2, hass, "filter_runtime", r), "2 h");
});

test("staleness uses the configured timestamp", () => {
  const cfg = cfgWith({ freshness: { max_age_seconds: 60, timestamp_policy: "last_updated" } });
  const r = readBinding(demoHass(), cfg, "outdoor_temperature", Date.parse("2026-01-01T00:05:00Z"));
  assert.equal(r.stale, true);
  const r2 = readBinding(demoHass(), cfgWith(), "outdoor_temperature", Date.parse("2030-01-01T00:00:00Z"));
  assert.equal(r2.stale, false);
});

test("demo model matches the reference values", () => {
  const m = buildModel(demoHass(), cfgWith());
  assert.equal(m.text.outdoor_temperature, "13.0°C");
  assert.equal(m.text.supply_temperature, "21.9°C");
  assert.equal(m.text.water_flow_temperature, "19.3°C");
  assert.equal(m.text.recovery_efficiency, "98%");
  assert.equal(m.bypass, "closed");
  assert.equal(m.speed, "1");
  assert.equal(m.coil, "idle");
});

test("open bypass shows heat recovery as Off, not a number", () => {
  const m = buildModel(demoHass({ bypass_position: "open" }), cfgWith());
  assert.equal(m.effBypassed, true);
  assert.equal(m.text.recovery_efficiency, "Off");
  assert.equal(buildModel(demoHass(), cfgWith()).effBypassed, false);
  const noBypass = buildModel(demoHass({ bypass_position: "open" }), cfgWith({ features: { bypass: false } }));
  assert.equal(noBypass.text.recovery_efficiency, "98%");
});

test("fan percent by_speed follows the running speed", () => {
  const cfg = normalizeConfig({
    bindings: {
      speed_state: "sensor.speed",
      supply_fan_percent: { by_speed: { 1: "number.s1", 2: "number.s2", 3: "number.s3" } },
    },
  });
  const hass = { states: {
    "sensor.speed": { state: "2", attributes: {} },
    "number.s1": { state: "18", attributes: {} }, "number.s2": { state: "32", attributes: {} }, "number.s3": { state: "100", attributes: {} },
  } };
  const r = readBinding(hass, cfg, "supply_fan_percent");
  assert.equal(r.status, "ok");
  assert.equal(r.value, 32);
  assert.equal(r.entity, "number.s2");
  hass.states["sensor.speed"].state = "unavailable";
  assert.equal(readBinding(hass, cfg, "supply_fan_percent").status, "unbound");
  assert.ok(watchedEntities(cfg).includes("number.s3"));
  assert.throws(() => normalizeConfig({ bindings: { supply_fan_percent: { by_speed: "x" } } }), /by_speed/);
});

test("watched entities cover bindings, extras and adapters", () => {
  const cfg = normalizeConfig({
    bindings: { fault: { entity: "binary_sensor.a", extra_entities: ["binary_sensor.b"] } },
    controls: { fan_speed: { adapter: { kind: "select", entity: "select.f", readback: { entity: "sensor.rb" } } } },
  });
  assert.deepEqual(watchedEntities(cfg).sort(), ["binary_sensor.a", "binary_sensor.b", "select.f", "sensor.rb"]);
});
