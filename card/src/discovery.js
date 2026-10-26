// Finds the ESP bridge's MQTT entities (device "MRXBOX", maker Nuaire, ids mrxbox_*) so the
// editor can fill bindings in one step. It only proposes a config; the user sees and saves
// it. Entities that don't exist are left unbound instead of guessed.

import { LEGACY_ROLES, LEGACY_FAULTS, migrateLegacy, normalizeConfig } from "./config.js";

const MAKER = "Nuaire";
const PREFIX = "mrxbox_";
const COIL_KEYS = ["coil_air_in", "coil_air_out", "water_flow_temperature", "water_return_temperature", "buffer_temperature", "coil_status"];

// An entity of the bridge: its device is made by Nuaire, or its object id starts mrxbox_.
function isUnitEntity(hass, e) {
  const d = e.device_id && hass.devices && hass.devices[e.device_id];
  if (d && d.manufacturer === MAKER) return true;
  return String(e.entity_id || "").split(".")[1]?.startsWith(PREFIX) || false;
}

// Devices that own at least one bridge entity: [{id, name}].
export function findDevices(hass) {
  const out = new Map();
  for (const e of Object.values((hass && hass.entities) || {})) {
    if (!e.device_id || !isUnitEntity(hass, e)) continue;
    const d = hass.devices && hass.devices[e.device_id];
    out.set(e.device_id, { id: e.device_id, name: (d && (d.name_by_user || d.name)) || e.device_id });
  }
  return [...out.values()];
}

function unitEntities(hass, deviceId) {
  const ents = Object.values((hass && hass.entities) || {}).filter((e) => isUnitEntity(hass, e) && (!deviceId || e.device_id === deviceId));
  return ents.map((e) => e.entity_id);
}

// Role -> entity id, matching domain and object_id suffix like the 0.2.x card did.
export function detectUnit(hass, deviceId) {
  const ids = unitEntities(hass, deviceId);
  const unit = {};
  const match = (domain, suffix) => ids.find((id) => id.startsWith(domain + ".") && (id.endsWith("_" + suffix) || id === `${domain}.${suffix}`));
  for (const [role, [domain, suffix]] of Object.entries(LEGACY_ROLES)) {
    const id = match(domain, suffix);
    if (id) unit[role] = id;
  }
  for (const f of LEGACY_FAULTS) {
    const id = match("binary_sensor", f);
    if (id) unit[`fault_${f.replace(/_fault$/, "")}`] = id;
  }
  return { unit, found: ids.length };
}

// A proposed config (merged over `base`) with every binding that resolves to a real entity.
export function proposeConfig(hass, base, deviceId) {
  const { unit, found } = detectUnit(hass, deviceId);
  if (!found) return { config: null, found: 0, bound: 0 };
  const migrated = normalizeConfig(migrateLegacy({ unit, show_coil: false }));
  const exists = (id) => !!(id && hass.states && hass.states[id]);
  let bound = 0;
  const bindings = { ...base.bindings };
  for (const [k, b] of Object.entries(migrated.bindings)) {
    if (!b) continue;
    if (k === "fault") {
      const all = [b.entity, ...(b.extra_entities || [])].filter(exists);
      if (!all.length) continue;
      bindings.fault = { ...b, entity: all[0], extra_entities: all.slice(1) };
      bound++;
      continue;
    }
    if (exists(b.entity)) { bindings[k] = b; bound++; }
  }
  const controls = { ...base.controls };
  for (const [k, c] of Object.entries(migrated.controls)) {
    if (c.adapter && exists(c.adapter.entity)) controls[k] = { ...base.controls[k], adapter: c.adapter };
  }
  const state_mapping = { ...base.state_mapping };
  for (const k of ["online", "fault", "bypass_position"]) state_mapping[k] = migrated.state_mapping[k];
  // The bridge has no air conditioning entities: without a coil already bound, hide that box.
  const features = { ...base.features };
  const names = {};
  if (!COIL_KEYS.some((k) => bindings[k])) {
    features.aircon = false;
    features.water_circuit = false;
    if (base.title === "MVHR & Air Conditioning") names.title = "MVHR";
    if (base.subtitle === "Live airflow & climate") names.subtitle = "Live airflow";
  }
  return {
    config: { ...base, ...names, device: deviceId || base.device, demo: false, features, bindings, controls, state_mapping },
    found,
    bound,
  };
}
