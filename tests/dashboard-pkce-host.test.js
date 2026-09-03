"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createDashboardPkceHost } = require("../plugin/dashboard-pkce-host");

function sanitizeUserInfo(value) {
  if (!value || typeof value !== "object") return null;
  return { userId: value.userId, email: value.email };
}

function response(json, status = 200) {
  return { status, json, text: JSON.stringify(json) };
}

test("host owns the verifier and returns only the public challenge", async () => {
  const requests = [];
  const applied = [];
  const host = createDashboardPkceHost({
    request: async (options) => {
      requests.push(options);
      if (options.url.endsWith("/pkce/exchange-token")) return response({ code: 0, data: { token: "host-token" } });
      return response({ code: 0, data: { userId: 7, email: "host@example.com", token: "must-not-copy" } });
    },
    sanitizeUserInfo,
    applyAuthState: async (state) => { applied.push(state); },
  });

  const challenge = await host.handle("getOrCreatePkceChallengeAsync", {});
  assert.equal(challenge.ok, true);
  assert.equal(challenge.verifier, undefined);
  assert.match(challenge.challenge, /^[A-Za-z0-9_-]{43}$/);

  const result = await host.handle("submitPkceAuthCodeAsync", {
    requestId: challenge.requestId,
    authCode: "host-auth-code",
  });

  assert.deepEqual(result, {
    ok: true,
    authState: { token: "host-token", userInfo: { userId: 7, email: "host@example.com" } },
  });
  assert.deepEqual(applied, [{ token: "host-token", userInfo: { userId: 7, email: "host@example.com" } }]);
  const exchangeBody = JSON.parse(requests[0].body);
  assert.equal(exchangeBody.code, "host-auth-code");
  assert.match(exchangeBody.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(exchangeBody.verifier, challenge.challenge);
});

test("host returns only sanitized persisted PKCE state for preload hydration", async () => {
  const host = createDashboardPkceHost({
    request: async () => response({ code: 0 }),
    sanitizeUserInfo,
    applyAuthState: async () => {},
    readAuthState: () => ({
      token: "persisted-host-token",
      userInfo: { userId: 17, email: "persisted@example.com", token: "must-not-copy" },
    }),
  });

  assert.deepEqual(await host.handle("getPersistedAuthState", {}), {
    ok: true,
    authState: {
      token: "persisted-host-token",
      userInfo: { userId: 17, email: "persisted@example.com" },
    },
  });
});

test("host deduplicates one exchange and does not issue its challenge while consuming it", async () => {
  let releaseToken;
  const tokenResponse = new Promise((resolve) => { releaseToken = resolve; });
  const host = createDashboardPkceHost({
    request: (options) => options.url.endsWith("/pkce/exchange-token")
      ? tokenResponse
      : Promise.resolve(response({ code: 0, data: { userId: 8 } })),
    sanitizeUserInfo,
    applyAuthState: async () => {},
  });
  const challenge = await host.handle("getOrCreatePkceChallengeAsync", {});
  const first = host.handle("submitPkceAuthCodeAsync", { requestId: challenge.requestId, authCode: "same-code" });
  const duplicate = host.handle("submitPkceAuthCodeAsync", { requestId: challenge.requestId, authCode: "same-code" });

  assert.strictEqual(duplicate, first);
  assert.equal((await host.handle("getOrCreatePkceChallengeAsync", {})).code, "pkce_exchange_in_progress");
  assert.equal((await host.handle("submitPkceAuthCodeAsync", { requestId: challenge.requestId, authCode: "other-code" })).code, "pkce_exchange_in_progress");

  releaseToken(response({ code: 0, data: { token: "deduplicated-token" } }));
  assert.equal((await first).ok, true);
});

test("a cleared late exchange cannot erase or authenticate a newer session", async () => {
  let releaseOldToken;
  let requestCount = 0;
  const oldTokenResponse = new Promise((resolve) => { releaseOldToken = resolve; });
  const applied = [];
  const host = createDashboardPkceHost({
    request: (options) => {
      requestCount++;
      if (requestCount === 1) return oldTokenResponse;
      if (options.url.endsWith("/pkce/exchange-token")) return Promise.resolve(response({ code: 0, data: { token: "new-token" } }));
      return Promise.resolve(response({ code: 0, data: { userId: 9 } }));
    },
    sanitizeUserInfo,
    applyAuthState: async (state) => { applied.push(state); },
  });

  const oldChallenge = await host.handle("getOrCreatePkceChallengeAsync", {});
  const oldExchange = host.handle("submitPkceAuthCodeAsync", { requestId: oldChallenge.requestId, authCode: "old-code" });
  await host.handle("clearPkceSession", {});
  const newChallenge = await host.handle("getOrCreatePkceChallengeAsync", {});
  assert.notEqual(newChallenge.requestId, oldChallenge.requestId);

  releaseOldToken(response({ code: 0, data: { token: "old-token" } }));
  assert.equal((await oldExchange).code, "pkce_session_cleared");
  assert.deepEqual(applied, []);

  const newExchange = await host.handle("submitPkceAuthCodeAsync", { requestId: newChallenge.requestId, authCode: "new-code" });
  assert.equal(newExchange.ok, true);
  assert.equal(applied[0].token, "new-token");
});
