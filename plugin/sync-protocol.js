"use strict";

const GM_STORE_PREFIX = "imt-gm-";
const SYNC_MAX_KEYS = 512;
const SYNC_MAX_VALUE_BYTES = 512 * 1024;
const SYNC_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
const CONFIG_MAX_NODES = 16 * 1024;
const CONFIG_MAX_ARRAY_ITEMS = 4 * 1024;
const SYNC_SCOPE_PORTABLE = "portable-config";
const SYNC_SCOPE_DASHBOARD = "dashboard-account-services";

function isSensitiveSyncKey(key) {
  const normalized = String(key).replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
  const mouseHoverControlKey = /^mouse_hover(?:_[a-z0-9]+)*_key$/.test(normalized)
    && !/(?:api|app|access|client|private|encryption|signing|storage|subscription|license|service|account|project|provider)[_-]?key/.test(normalized);
  if (mouseHoverControlKey || normalized === "hotkey") return false;
  return /(?:^|_)(?:auth|bearer|oauth|session)(?:_|$)/.test(normalized) || /(?:token|secret|password|passwd|authorization|cookie|jwt|credential|(?:api|app|access|client|private|encryption|signing|storage|subscription|license|service|account|project|provider)[_-]?key|(?:^|[_-])key$|refresh[_-]?token)/.test(normalized);
}

function isUnsafeSyncProperty(key) {
  return key === "__proto__" || key === "constructor" || key === "prototype";
}

function isAllowedTopKey(key, allowedTopKeys) {
  return !!(allowedTopKeys && Object.prototype.hasOwnProperty.call(allowedTopKeys, key));
}

function redactSyncValue(value, depth, budget) {
  if (budget) {
    if (budget.remaining <= 0) { budget.exceeded = true; return null; }
    budget.remaining--;
  }
  if (depth > 8) return null;
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    if (budget && value.length > CONFIG_MAX_ARRAY_ITEMS) { budget.exceeded = true; return null; }
    const items = [];
    for (let itemIndex = 0; itemIndex < value.length; itemIndex++) {
      items.push(redactSyncValue(value[itemIndex], depth + 1, budget));
      if (budget && budget.exceeded) break;
    }
    return items;
  }
  if (typeof value !== "object") return value;
  const result = {};
  for (const key in value) {
    if (!Object.prototype.hasOwnProperty.call(value, key) || isUnsafeSyncProperty(key) || isSensitiveSyncKey(key)) continue;
    result[key] = redactSyncValue(value[key], depth + 1, budget);
    if (budget && budget.exceeded) break;
  }
  return result;
}

function sanitizeFullLocalUserConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const budget = { remaining: CONFIG_MAX_NODES, exceeded: false };
  const safeConfig = redactSyncValue(value, 0, budget);
  if (budget.exceeded) return null;
  let serialized;
  try { serialized = JSON.stringify(safeConfig); } catch (error) { return null; }
  if (typeof serialized !== "string" || serialized.length > SYNC_MAX_VALUE_BYTES) return null;
  return safeConfig;
}

function canonicalSyncSuffix(suffix) {
  if (suffix === "user_info") return "userInfo";
  if (suffix === "memberConfig") return "fullLocalUserConfig";
  if (suffix === "serviceConfig" || suffix === "translatorConfig") return "translateServiceConfig";
  return suffix;
}

function orderedSyncValues(values) {
  const ordered = {};
  Object.keys(values || {}).sort().forEach(function (key) { ordered[key] = values[key]; });
  return ordered;
}

function hashSyncPayload(values, deletedKeys) {
  const input = JSON.stringify({ values: orderedSyncValues(values), deletedKeys: (deletedKeys || []).slice().sort() });
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) { hash ^= input.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeSyncKey(key, allowedTopKeys, storePrefix) {
  const prefix = typeof storePrefix === "string" && storePrefix ? storePrefix : GM_STORE_PREFIX;
  if (typeof key !== "string" || key.length > 256) return null;
  if (key.indexOf(prefix) === 0) {
    const suffix = canonicalSyncSuffix(key.slice(prefix.length));
    if (!suffix || suffix.indexOf("__") === 0 || isSensitiveSyncKey(suffix) || !isAllowedTopKey(suffix, allowedTopKeys)) return null;
    return prefix + suffix;
  }
  if (!isAllowedTopKey(key, allowedTopKeys) || isSensitiveSyncKey(key)) return null;
  return prefix + canonicalSyncSuffix(key);
}

module.exports = {
  CONFIG_MAX_ARRAY_ITEMS,
  CONFIG_MAX_NODES,
  GM_STORE_PREFIX,
  SYNC_MAX_KEYS,
  SYNC_MAX_TOTAL_BYTES,
  SYNC_MAX_VALUE_BYTES,
  SYNC_SCOPE_DASHBOARD,
  SYNC_SCOPE_PORTABLE,
  canonicalSyncSuffix,
  hashSyncPayload,
  isSensitiveSyncKey,
  isUnsafeSyncProperty,
  normalizeSyncKey,
  orderedSyncValues,
  redactSyncValue,
  sanitizeFullLocalUserConfig,
};
