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
