import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeConfig } from "../../src/config.js";
import { buildCall, readbackMatches, readbackSource, Commander } from "../../src/actions.js";
import { CONTROL_INFO } from "../../src/constants.js";

const cfg = normalizeConfig({
  read_only: false,
  bindings: { speed_state: "select.fan", night_state: "switch.night" },
  controls: {
    fan_speed: { adapter: { kind: "select", entity: "select.fan", options: { 1: "Speed 1", 2: "Speed 2", 3: "Speed 3" }, timeout_ms: 1000 } },
    bypass_mode: { adapter: { kind: "select", entity: "select.bypass" } },
    bypass_threshold: { adapter: { kind: "number", entity: "number.thr", min: 15, max: 30, step: 1 } },
    night: { adapter: { kind: "switch", entity: "switch.night", timeout_ms: 1000 } },
    holiday: { adapter: { kind: "script", action: "script.turn_on", data: { entity_id: "script.holiday", variables: "$value" }, options: { on: "yes", off: "no" }, readback: { entity: "input_boolean.hol" } } },
  },
});

test("payloads per adapter kind", () => {
  assert.deepEqual(buildCall(cfg, "fan_speed", "2"), { domain: "select", service: "select_option", data: { entity_id: "select.fan", option: "Speed 2" }, expect: "Speed 2" });
  assert.deepEqual(buildCall(cfg, "bypass_mode", "Auto"), { domain: "select", service: "select_option", data: { entity_id: "select.bypass", option: "Auto" }, expect: "Auto" });
  assert.deepEqual(buildCall(cfg, "bypass_threshold", 22), { domain: "number", service: "set_value", data: { entity_id: "number.thr", value: 22 }, expect: 22 });
  assert.deepEqual(buildCall(cfg, "night", "on"), { domain: "switch", service: "turn_on", data: { entity_id: "switch.night" }, expect: "on" });
  assert.deepEqual(buildCall(cfg, "night", "off").service, "turn_off");
  assert.deepEqual(buildCall(cfg, "holiday", "on"), { domain: "script", service: "turn_on", data: { entity_id: "script.holiday", variables: "yes" }, expect: "yes" });
  assert.throws(() => buildCall(normalizeConfig({}), "fan_speed", "1"), /Not mapped/);
});

test("readback source prefers adapter readback, then binding", () => {
  assert.deepEqual(readbackSource(cfg, "holiday"), { entity: "input_boolean.hol", attribute: null });
  assert.deepEqual(readbackSource(cfg, "fan_speed"), { entity: "select.fan", attribute: null });
  assert.deepEqual(readbackSource(cfg, "bypass_mode"), { entity: "select.bypass", attribute: null });
});

test("readback matching: case, numbers within half a step, booleans", () => {
  assert.equal(readbackMatches(CONTROL_INFO.fan_speed, "Speed 2", "speed 2"), true);
  assert.equal(readbackMatches(CONTROL_INFO.fan_speed, "Speed 2", "Speed 1"), false);
  assert.equal(readbackMatches(CONTROL_INFO.bypass_threshold, 22, "22.4", 1), true);
  assert.equal(readbackMatches(CONTROL_INFO.bypass_threshold, 22, "23", 1), false);
  assert.equal(readbackMatches(CONTROL_INFO.night, "on", true), true);
  assert.equal(readbackMatches(CONTROL_INFO.night, "on", undefined), false);
});

function fakeHass(mode = "ok") {
  const calls = [];
  const h = {
    states: { "select.fan": { state: "Speed 1", attributes: {} }, "switch.night": { state: "off", attributes: {} } },
    callService(domain, service, data) {
      calls.push({ domain, service, data });
      if (mode === "reject") return Promise.reject(new Error("boom"));
      if (mode === "perm") return Promise.reject({ code: "unauthorized", message: "Unauthorized" });
      if (mode === "hang") return new Promise(() => {});
      if (mode === "throw") throw new Error("sync");
      return Promise.resolve();
    },
  };
  h.calls = calls;
  return h;
}
const tick = () => new Promise((r) => setTimeout(r, 0));

test("exactly one call per action; second click while pending is ignored", async () => {
  const hass = fakeHass();
  const cmd = new Commander(() => {});
  assert.equal(cmd.run(hass, cfg, "fan_speed", "2"), true);
  assert.equal(cmd.run(hass, cfg, "fan_speed", "3"), false);
  assert.equal(hass.calls.length, 1);
  assert.equal(cmd.calls, 1);
  await tick();
  assert.equal(cmd.get("fan_speed").pending, true, "still pending until readback");
  hass.states["select.fan"].state = "Speed 2";
  cmd.check(hass, cfg);
  assert.equal(cmd.get("fan_speed").pending, undefined);
  assert.equal(cmd.get("fan_speed").error, undefined);
  cmd.dispose();
});

test("readback before the call resolves still confirms after resolve", async () => {
  const hass = fakeHass();
  const cmd = new Commander(() => {});
  cmd.run(hass, cfg, "night", "on");
  hass.states["switch.night"].state = "on";
  cmd.check(hass, cfg);
  assert.equal(cmd.get("night").pending, true, "not confirmed until the call resolves");
  await tick();
  assert.equal(cmd.get("night").pending, undefined);
  cmd.dispose();
});

test("reject, permission and sync throw give errors, no retry", async () => {
  for (const [mode, re] of [["reject", /^Failed: boom/], ["perm", /^Permission denied$/], ["throw", /^Failed: sync/]]) {
    const hass = fakeHass(mode);
    const cmd = new Commander(() => {});
    cmd.run(hass, cfg, "fan_speed", "2");
    await tick();
    assert.match(cmd.get("fan_speed").error, re, mode);
    assert.equal(hass.calls.length, 1, `${mode}: no retry`);
    assert.equal(cmd.clearError("fan_speed"), true);
    cmd.dispose();
  }
});

test("no readback within timeout: error, state not assumed", async () => {
  const hass = fakeHass("hang");
  const cmd = new Commander(() => {});
  cmd.run(hass, cfg, "night", "on");
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(cmd.get("night").error, "No confirmation from the unit");
  assert.equal(hass.calls.length, 1);
  assert.equal(hass.states["switch.night"].state, "off");
  cmd.dispose();
});

test("controls are tracked separately", async () => {
  const hass = fakeHass("hang");
  const cmd = new Commander(() => {});
  assert.equal(cmd.run(hass, cfg, "fan_speed", "2"), true);
  assert.equal(cmd.run(hass, cfg, "night", "on"), true);
  assert.equal(hass.calls.length, 2);
  cmd.dispose();
});

test("unmapped control dispatches nothing", () => {
  const hass = fakeHass();
  const cmd = new Commander(() => {});
  assert.equal(cmd.run(hass, normalizeConfig({}), "fan_speed", "1"), false);
  assert.equal(hass.calls.length, 0);
  assert.equal(cmd.get("fan_speed").error, "Failed: Not mapped");
  cmd.dispose();
});

test("a late readback after the timeout clears the error", async () => {
  const hass = fakeHass("hang");
  const cmd = new Commander(() => {});
  cmd.run(hass, cfg, "night", "on");
  await new Promise((r) => setTimeout(r, 1100));
  assert.equal(cmd.get("night").error, "No confirmation from the unit");
  hass.states["switch.night"].state = "on";
  cmd.check(hass, cfg);
  assert.equal(cmd.get("night").error, undefined);
  cmd.dispose();
});

test("errors clear themselves after a few seconds", async () => {
  const hass = fakeHass("reject");
  let changes = 0;
  const cmd = new Commander(() => changes++);
  cmd.run(hass, cfg, "fan_speed", "2");
  await tick();
  assert.match(cmd.get("fan_speed").error, /^Failed/);
  await new Promise((r) => setTimeout(r, 6100));
  assert.equal(cmd.get("fan_speed").error, undefined);
  assert.ok(changes >= 3, "pending, error and clear each notify");
  cmd.dispose();
});
