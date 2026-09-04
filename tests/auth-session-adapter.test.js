"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { AuthSessionAdapter } = require("../plugin/auth-session-adapter");

function makeAdapter() {
  return new AuthSessionAdapter({
    sanitizeUserInfo(value) {
      return value && typeof value.email === "string" ? { email: value.email } : null;
    },
  });
}

test("accepts PKCE state only when it contains a token and keeps a sanitized user", () => {
  const adapter = makeAdapter();
  const first = adapter.applyPkceState({ token: "token-1", userInfo: { email: "user@example.com", token: "secret" } });

  assert.equal(first.changed, true);
  assert.equal(first.source, "pkce");
  assert.equal(adapter.getToken(), "token-1");
  assert.deepEqual(adapter.getUserInfo(), { email: "user@example.com" });
  const snapshot = adapter.getPkceState();
  assert.deepEqual(snapshot, {
    version: 1,
    authenticated: true,
    token: "token-1",
    userInfo: { email: "user@example.com" },
  });
  snapshot.userInfo.email = "mutated@example.com";
  assert.deepEqual(adapter.getUserInfo(), { email: "user@example.com" });
  assert.deepEqual(adapter.applyPkceState({ token: "token-1", userInfo: { email: "user@example.com" } }), { changed: false, source: "pkce" });
});

test("PKCE logout clears PKCE state without discarding a legacy cookie fallback", () => {
  const adapter = makeAdapter();
  adapter.applyLegacyCookies("session=legacy");
  adapter.applyPkceState({ token: "token-1", userInfo: { email: "user@example.com" } });

  const result = adapter.applyPkceState({ authenticated: false });

  assert.equal(result.changed, true);
  assert.equal(adapter.getToken(), "");
  assert.equal(adapter.getCookies(), "session=legacy");
  assert.equal(adapter.getPkceState(), null);
});

test("legacy cookie updates are independent from PKCE token state", () => {
  const adapter = makeAdapter();
  adapter.applyPkceState({ token: "token-1", userInfo: { email: "user@example.com" } });

  assert.deepEqual(adapter.applyLegacyCookies("session=one"), { changed: true });
  assert.deepEqual(adapter.applyLegacyCookies("session=one"), { changed: false });
  assert.deepEqual(adapter.applyLegacyCookies(""), { changed: true });
  assert.equal(adapter.getToken(), "token-1");
  assert.equal(adapter.getCookies(), "");
});

test("clear removes both authentication sources", () => {
  const adapter = makeAdapter();
  adapter.applyLegacyCookies("session=legacy");
  adapter.applyPkceState({ token: "token-1", userInfo: { email: "user@example.com" } });

  adapter.clear();

  assert.equal(adapter.getToken(), "");
  assert.equal(adapter.getCookies(), "");
  assert.equal(adapter.getUserInfo(), null);
});
