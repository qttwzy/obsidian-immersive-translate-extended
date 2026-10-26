"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const syncProtocol = require("../plugin/sync-protocol");

const ALLOWED_TOP_KEYS = { fullLocalUserConfig: true, userInfo: true, user_info: true, subscriptionInfo: true };

test("redaction keeps hover keys and drops credential-shaped fields", () => {
  const safe = syncProtocol.redactSyncValue({
    mouseHoverHoldKey: "Alt",
    hotkey: "Mod+T",
    apiKey: "secret",
    translationTheme: "mask",
  }, 0);

  assert.equal(safe.mouseHoverHoldKey, "Alt");
  assert.equal(safe.hotkey, "Mod+T");
  assert.equal(safe.translationTheme, "mask");
  assert.equal(Object.prototype.hasOwnProperty.call(safe, "apiKey"), false);
});

test("hash is order-independent for the same values and deletions", () => {
  const first = syncProtocol.hashSyncPayload({ b: "2", a: "1" }, ["z", "y"]);
  const second = syncProtocol.hashSyncPayload({ a: "1", b: "2" }, ["y", "z"]);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}$/);
});

test("key normalization is scoped to the caller-provided top keys", () => {
  assert.equal(
    syncProtocol.normalizeSyncKey("imt-gm-user_info", ALLOWED_TOP_KEYS),
    "imt-gm-userInfo",
  );
  assert.equal(syncProtocol.normalizeSyncKey("authToken", ALLOWED_TOP_KEYS), null);
  assert.equal(syncProtocol.normalizeSyncKey("translateServices", ALLOWED_TOP_KEYS), null);
});

test("fullLocalUserConfig sanitizer rejects oversized objects", () => {
  const huge = {};
  for (let index = 0; index < syncProtocol.CONFIG_MAX_NODES + 2; index++) huge["k" + index] = index;
  assert.equal(syncProtocol.sanitizeFullLocalUserConfig(huge), null);
  assert.deepEqual(syncProtocol.sanitizeFullLocalUserConfig({ targetLanguage: "ja", apiKey: "x" }), {
    targetLanguage: "ja",
  });
});

test("safe sync serialization gates identity, sanitizes config, and bounds size", () => {
  const deps = {
    storePrefix: "imt-gm-",
    configKey: "fullLocalUserConfig",
    hasAuthToken: () => true,
    sanitizeUserInfo: (value) => value && { email: value.email },
  };

  assert.deepEqual(JSON.parse(syncProtocol.serializeSafeSyncValue("imt-gm-userInfo", JSON.stringify({ email: "a", token: "x" }), deps)), { email: "a" });
  assert.equal(syncProtocol.serializeSafeSyncValue("imt-gm-userInfo", "{}", { ...deps, hasAuthToken: () => false }), null);
  assert.deepEqual(JSON.parse(syncProtocol.serializeSafeSyncValue("imt-gm-subscriptionInfo", { plan: "pro", token: "x" }, deps)), { plan: "pro" });
  assert.equal(syncProtocol.serializeSafeSyncValue("imt-gm-subscriptionInfo", {}, { ...deps, hasAuthToken: () => false }), null);
  assert.deepEqual(JSON.parse(syncProtocol.serializeSafeSyncValue("imt-gm-fullLocalUserConfig", { targetLanguage: "ja", apiKey: "x" }, deps)), { targetLanguage: "ja" });
  assert.deepEqual(JSON.parse(syncProtocol.serializeSafeSyncValue("imt-gm-other", { token: "x", keep: 1 }, deps)), { keep: 1 });
  assert.equal(syncProtocol.serializeSafeSyncValue("imt-gm-other", "x".repeat(syncProtocol.SYNC_MAX_VALUE_BYTES + 1), deps), null);
});
