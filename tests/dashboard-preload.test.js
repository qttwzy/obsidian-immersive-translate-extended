"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createDashboardPreloadRuntime: createRuntime } = require("./helpers/dashboard-preload-runtime");

test("preload refuses untrusted origins before installing bridges", () => {
  const originalFetch = function originalFetch() {};
  const runtime = createRuntime({ host: "evil.example" });
  runtime.fetch = originalFetch;
  assert.strictEqual(runtime.fetch, originalFetch);
  assert.equal(runtime.localStorage.getItem("imt-gm-userInfo"), null);
  const inheritedHostRuntime = createRuntime({ host: "constructor" });
  assert.equal(inheritedHostRuntime.immersiveTranslateBrowserAPI, undefined);
  assert.equal(inheritedHostRuntime.__imtDashboardHost, undefined);
});

test("runtime bridge creates a real PKCE challenge response", async () => {
  const runtime = createRuntime();
  const response = await new Promise((resolve) => {
    runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge", data: {} }, resolve);
  });

  assert.equal(response.ok, true);
  assert.match(response.requestId, /^[A-Za-z0-9_-]+$/);
  assert.match(response.challenge, /^[A-Za-z0-9_-]+$/);
  assert.equal(response.method, undefined);
  assert.equal(response.verifier, undefined);
});

test("preload hydrates persisted host PKCE state and reloads only on the first copy", async () => {
  const firstRuntime = createRuntime({
    hostAuthState: {
      token: "persisted-preload-token",
      userInfo: { userId: 18, email: "preload@example.com", token: "must-not-copy" },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(firstRuntime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("persisted-preload-token"));
  assert.equal(firstRuntime.localStorage.getItem("imt-gm-user_token"), JSON.stringify("persisted-preload-token"));
  assert.equal(firstRuntime.localStorage.getItem("immersiveTranslateIMT_COMMON_JWT_TOKEN"), "persisted-preload-token");
  assert.deepEqual(JSON.parse(firstRuntime.localStorage.getItem("imt-gm-userInfo")), {
    userId: 18,
    email: "preload@example.com",
  });
  assert.equal(firstRuntime.__getReloadCount(), 1);

  const secondRuntime = createRuntime({
    sharedLocalStorage: firstRuntime.localStorage,
    sharedPkceHost: firstRuntime.__pkceHostState,
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(secondRuntime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("persisted-preload-token"));
  assert.equal(secondRuntime.__getReloadCount(), 0);
});

test("preload keeps its storage bridge when the Dashboard installs its page API", async () => {
  const runtime = createRuntime({
    hostAuthState: {
      token: "persisted-page-api-token",
      userInfo: { userId: 19, email: "page-api@example.com" },
    },
  });
  const pageContextMenus = { update() {} };
  runtime.immersiveTranslateBrowserAPI = {
    storage: {
      local: { get: async () => ({}) },
      sync: { get: async () => ({}) },
    },
    runtime: { getManifest: () => ({}) },
    contextMenus: pageContextMenus,
  };
  await new Promise((resolve) => setImmediate(resolve));

  const auth = await runtime.immersiveTranslateBrowserAPI.storage.local.get(["user_token", "user_info"]);
  assert.equal(auth.user_token, "persisted-page-api-token");
  assert.deepEqual(JSON.parse(JSON.stringify(auth.user_info)), {
    userId: 19,
    email: "page-api@example.com",
  });
  assert.equal(runtime.immersiveTranslateBrowserAPI.runtime.getManifest()._isUserscript, true);
  assert.strictEqual(runtime.immersiveTranslateBrowserAPI.contextMenus, pageContextMenus);
  assert.strictEqual(runtime.chrome.storage, runtime.immersiveTranslateBrowserAPI.storage);
});

test("preload backfills current Dashboard aliases for a token stored by an older plugin", async () => {
  const legacyRuntime = createRuntime();
  legacyRuntime.localStorage.setItem("imt-gm-authToken", JSON.stringify("legacy-persisted-token"));
  legacyRuntime.localStorage.setItem("imt-gm-userInfo", JSON.stringify({
    userId: 20,
    email: "legacy@example.com",
  }));

  const upgradedRuntime = createRuntime({
    sharedLocalStorage: legacyRuntime.localStorage,
    hostAuthState: {
      token: "legacy-persisted-token",
      userInfo: { userId: 20, email: "legacy@example.com" },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(upgradedRuntime.localStorage.getItem("imt-gm-user_token"), JSON.stringify("legacy-persisted-token"));
  assert.deepEqual(JSON.parse(upgradedRuntime.localStorage.getItem("imt-gm-user_info")), {
    userId: 20,
    email: "legacy@example.com",
  });
  assert.equal(upgradedRuntime.__getReloadCount(), 1);
});

test("preload preserves an id-only account identity when hydrating Dashboard auth", async () => {
  const runtime = createRuntime({
    hostAuthState: {
      token: "id-only-token",
      userInfo: { id: 987654, userType: "pro" },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo")), {
    id: 987654,
    userType: "pro",
  });
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-user_info")), {
    id: 987654,
    userType: "pro",
  });
});

test("authenticated Accounts close asks its host to reuse the embedded window without opening a browser tab", () => {
  let nativeCloseCount = 0;
  const opened = [];
  const runtime = createRuntime({
    host: "immersivetranslate.com",
    closeWindow: () => { nativeCloseCount++; },
    openWindow: (url, target) => { opened.push({ url, target }); return null; },
  });
  runtime.location.href = "https://immersivetranslate.com/accounts/login?return_url=https%3A%2F%2Fdash.immersivetranslate.com%2F%23general";
  runtime.localStorage.setItem("imt-gm-authToken", JSON.stringify("authenticated-close-token"));

  runtime.close();

  assert.equal(nativeCloseCount, 0);
  assert.deepEqual(opened, []);
  assert.deepEqual(runtime.__getReplacedLocations(), []);
  assert.deepEqual(runtime.__getHostNavigations(), ["https://dash.immersivetranslate.com/#general"]);

  const anonymousRuntime = createRuntime({
    host: "immersivetranslate.com",
    closeWindow: () => { nativeCloseCount++; },
  });
  anonymousRuntime.location.href = "https://immersivetranslate.com/accounts/login";
  anonymousRuntime.close();
  assert.equal(nativeCloseCount, 1);
});

test("Dashboard sync controls recover after an SPA render removes them", async () => {
  const runtime = createRuntime({
    hostAuthState: {
      token: "persisted-sync-ui-token",
      userInfo: { email: "sync-ui@example.com" },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const initial = runtime.document.getElementById("imt-obsidian-bridge");
  assert.ok(initial);
  initial.remove();
  assert.equal(runtime.document.getElementById("imt-obsidian-bridge"), null);

  assert.equal(typeof runtime.__imt_ensure_sync_ui, "function");
  runtime.__runIntervals();

  assert.ok(runtime.document.getElementById("imt-obsidian-bridge"));
  assert.match(runtime.document.getElementById("imt-auth-status").textContent, /已登录.*自动同步/);
  assert.match(runtime.document.getElementById("imt-sync-btn").textContent, /同步配置到 Obsidian/);
  assert.equal(runtime.document.getElementById("imt-back-btn"), null);
});

test("preload does not overwrite a page login completed while host hydration is pending", async () => {
  let resolveHostAuthState;
  const hostAuthState = new Promise((resolve) => { resolveHostAuthState = resolve; });
  const runtime = createRuntime({ hostAuthState });

  runtime.localStorage.setItem("imt-gm-authToken", JSON.stringify("newer-page-token"));
  resolveHostAuthState({
    token: "older-persisted-token",
    userInfo: { email: "older@example.com" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("newer-page-token"));
  assert.equal(runtime.__getReloadCount(), 0);
});

test("concurrent PKCE challenge requests share one session", async () => {
  const runtime = createRuntime();
  const [first, second] = await Promise.all([
    runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" }),
    runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallengeAsync" }),
  ]);

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.requestId, second.requestId);
  assert.equal(first.challenge, second.challenge);
});

test("clearing storage invalidates a challenge even if its public response is already queued", async () => {
  const runtime = createRuntime();
  const pending = runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  await Promise.resolve();
  runtime.sessionStorage.clear();
  const result = await pending;

  assert.equal(result.ok, true);
  const staleExchange = await runtime.chrome.runtime.sendMessage({
    method: "exchangePkceToken",
    data: { requestId: result.requestId, authCode: "stale-code" },
  });
  assert.equal(staleExchange.code, "pkce_session_not_found");
  const retry = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  assert.equal(retry.ok, true);
  assert.notEqual(retry.requestId, result.requestId);
});

test("runtime bridge supports the extension message envelope used by the Accounts page", async () => {
  const runtime = createRuntime();
  const response = await runtime.chrome.runtime.sendMessage({
    from: "options:main",
    to: "background:main",
    payload: { method: "getOrCreatePkceChallenge", data: {} },
  });

  assert.equal(response.ok, true);
  assert.equal(response.data.ok, true);
  assert.match(response.data.requestId, /^[A-Za-z0-9_-]+$/);
  assert.equal(response.data.verifier, undefined);
});

test("preload implements the Accounts document PKCE bus and advertises its bridge metadata", async () => {
  const runtime = createRuntime();
  const responses = [];
  runtime.document.addEventListener("immersiveTranslateDocumentMessageTellThirdParty", (event) => {
    responses.push(JSON.parse(event.detail));
  });

  const meta = runtime.document.head.children.find((element) => element.name === "immersive-translate-meta");
  assert.ok(meta);
  assert.deepEqual(JSON.parse(Buffer.from(meta.content, "base64").toString("utf8")), { version: "4.0.0", _imtBridgeVersion: "4.0.0" });

  runtime.document.dispatchEvent(new runtime.CustomEvent("immersiveTranslateDocumentMessageThirdPartyTell", {
    detail: JSON.stringify({ id: "challenge-1", type: "getOrCreatePkceChallengeAsync", data: {} }),
  }));
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 25));

  assert.equal(responses.length, 1);
  assert.equal(responses[0].id, "challenge-1");
  assert.equal(responses[0].type, "getOrCreatePkceChallengeAsync");
  assert.equal(responses[0].payload.ok, true);
  assert.match(responses[0].payload.requestId, /^[A-Za-z0-9_-]+$/);
  assert.equal(responses[0].payload.verifier, undefined);
});

test("metadata injection retries after the document root becomes available", () => {
  const runtime = createRuntime({ deferBridgeMetadata: true });
  assert.equal(runtime.document.head, null);
  runtime.__releaseBridgeMetadata();

  const meta = runtime.document.head.children.find((element) => element.name === "immersive-translate-meta");
  assert.ok(meta);
});

test("Accounts document PKCE bus completes the exchange and keeps the verifier private", async () => {
  const requests = [];
  const runtime = createRuntime({
    fetchResponse: (url, options) => {
      requests.push({ url: String(url), options: options || {} });
      if (String(url).endsWith("/v1/user/pkce/exchange-token")) return { code: 0, data: { token: "document-token" } };
      if (String(url).endsWith("/v1/user")) return { code: 0, data: { userId: 11, email: "document@example.com", token: "must-not-cross" } };
      return {};
    },
  });
  const responses = new Map();
  runtime.document.addEventListener("immersiveTranslateDocumentMessageTellThirdParty", (event) => {
    const response = JSON.parse(event.detail);
    const pending = responses.get(response.id);
    if (pending && response.type === pending.type) { responses.delete(response.id); pending.resolve(response); }
  });
  const send = (id, type, data) => new Promise((resolve) => {
    responses.set(id, { type, resolve });
    runtime.document.dispatchEvent(new runtime.CustomEvent("immersiveTranslateDocumentMessageThirdPartyTell", {
      detail: JSON.stringify({ id, type, data }),
    }));
  });

  const challengeResponse = await send("document-challenge", "getOrCreatePkceChallengeAsync", {});
  assert.equal(challengeResponse.payload.ok, true);
  const exchangeResponse = await send("document-exchange", "submitPkceAuthCodeAsync", {
    requestId: challengeResponse.payload.requestId,
    authCode: "document-auth-code",
  });

  assert.deepEqual(exchangeResponse, { id: "document-exchange", type: "submitPkceAuthCodeAsync", payload: { ok: true } });
  assert.equal(requests.length, 2);
  const exchangeBody = JSON.parse(requests[0].options.body);
  assert.equal(exchangeBody.code, "document-auth-code");
  assert.match(exchangeBody.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(exchangeBody.verifier, challengeResponse.payload.challenge);
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("document-token"));
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo")), { userId: 11, email: "document@example.com" });
  assert.equal(JSON.stringify(runtime.__imt_msg_logs).includes("document-auth-code"), false);

  const replayResponse = await send("document-replay", "submitPkceAuthCodeAsync", {
    requestId: challengeResponse.payload.requestId,
    authCode: "document-auth-code",
  });
  assert.equal(replayResponse.payload.code, "pkce_session_not_found");
});

test("Accounts PKCE exchange survives a same-origin navigation that reloads the preload", async () => {
  const firstRuntime = createRuntime({ host: "immersivetranslate.com" });
  const firstResponses = new Map();
  firstRuntime.document.addEventListener("immersiveTranslateDocumentMessageTellThirdParty", (event) => {
    const response = JSON.parse(event.detail);
    const pending = firstResponses.get(response.id);
    if (pending && response.type === pending.type) { firstResponses.delete(response.id); pending.resolve(response); }
  });
  const challenge = await new Promise((resolve) => {
    firstResponses.set("navigation-challenge", { type: "getOrCreatePkceChallengeAsync", resolve });
    firstRuntime.document.dispatchEvent(new firstRuntime.CustomEvent("immersiveTranslateDocumentMessageThirdPartyTell", {
      detail: JSON.stringify({ id: "navigation-challenge", type: "getOrCreatePkceChallengeAsync", data: {} }),
    }));
  });

  const requests = [];
  const secondRuntime = createRuntime({
    host: "immersivetranslate.com",
    sharedLocalStorage: firstRuntime.localStorage,
    sharedSessionStorage: firstRuntime.sessionStorage,
    sharedPkceHost: firstRuntime.__pkceHostState,
    fetchResponse: (url, options) => {
      requests.push({ url: String(url), options: options || {} });
      if (String(url).endsWith("/v1/user/pkce/exchange-token")) return { code: 0, data: { token: "navigation-token" } };
      if (String(url).endsWith("/v1/user")) return { code: 0, data: { userId: 12, email: "navigation@example.com" } };
      return {};
    },
  });
  const secondResponses = new Map();
  secondRuntime.document.addEventListener("immersiveTranslateDocumentMessageTellThirdParty", (event) => {
    const response = JSON.parse(event.detail);
    const pending = secondResponses.get(response.id);
    if (pending && response.type === pending.type) { secondResponses.delete(response.id); pending.resolve(response); }
  });
  const exchange = await new Promise((resolve) => {
    secondResponses.set("navigation-exchange", { type: "submitPkceAuthCodeAsync", resolve });
    secondRuntime.document.dispatchEvent(new secondRuntime.CustomEvent("immersiveTranslateDocumentMessageThirdPartyTell", {
      detail: JSON.stringify({
        id: "navigation-exchange",
        type: "submitPkceAuthCodeAsync",
        data: { requestId: challenge.payload.requestId, authCode: "navigation-auth-code" },
      }),
    }));
  });

  assert.deepEqual(exchange, { id: "navigation-exchange", type: "submitPkceAuthCodeAsync", payload: { ok: true } });
  assert.equal(requests.length, 2);
  assert.equal(secondRuntime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("navigation-token"));
  assert.equal(secondRuntime.sessionStorage.getItem("__imt_pkce_session"), null);
});

test("clearing storage during a PKCE exchange cannot resurrect the old token", async () => {
  let releaseExchange;
  const runtime = createRuntime();
  runtime.fetch = (url) => {
    if (String(url).endsWith("/v1/user/pkce/exchange-token")) {
      return new Promise((resolve) => {
        releaseExchange = () => resolve({
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: { token: "stale-token" } }),
        });
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { email: "stale@example.com" } }),
    });
  };

  const challenge = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  const exchange = runtime.chrome.runtime.sendMessage({
    method: "exchangePkceToken",
    data: { requestId: challenge.requestId, authCode: "auth-code" },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(typeof releaseExchange, "function");

  runtime.sessionStorage.clear();
  releaseExchange();
  const result = await exchange;

  assert.equal(result.code, "pkce_session_cleared");
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), null);
  assert.equal(runtime.localStorage.getItem("imt-gm-userInfo"), null);
});

test("concurrent PKCE exchanges do not accept a second auth code", async () => {
  let releaseExchange;
  const runtime = createRuntime();
  runtime.fetch = (url) => {
    if (String(url).endsWith("/v1/user/pkce/exchange-token")) {
      return new Promise((resolve) => {
        releaseExchange = () => resolve({
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: { token: "first-token" } }),
        });
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: async () => ({ code: 0, data: { email: "first@example.com" } }),
    });
  };

  const challenge = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  const first = runtime.chrome.runtime.sendMessage({
    method: "exchangePkceToken",
    data: { requestId: challenge.requestId, authCode: "first-code" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  const second = await runtime.chrome.runtime.sendMessage({
    method: "exchangePkceToken",
    data: { requestId: challenge.requestId, authCode: "" },
  });
  assert.equal(second.ok, false);
  assert.equal(second.code, "pkce_exchange_in_progress");
  assert.equal(second.message, "Another PKCE exchange is already running");
  assert.equal(second.retryable, true);

  releaseExchange();
  assert.equal((await first).ok, true);
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("first-token"));
});

test("PKCE exchange reports network failures separately from auth rejection", async () => {
  const runtime = createRuntime();
  runtime.fetch = () => Promise.reject(new Error("connection closed"));

  const challenge = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  const result = await runtime.chrome.runtime.sendMessage({
    method: "exchangePkceToken",
    data: { requestId: challenge.requestId, authCode: "network-code" },
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "network_unavailable");
  assert.equal(result.retryable, true);
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), null);
});

test("document PKCE bus does not expose the general runtime storage or auth methods", async () => {
  const runtime = createRuntime();
  runtime.localStorage.setItem("imt-gm-authToken", JSON.stringify("must-stay-private"));
  const responses = new Map();
  runtime.document.addEventListener("immersiveTranslateDocumentMessageTellThirdParty", (event) => {
    const response = JSON.parse(event.detail);
    const pending = responses.get(response.id);
    if (pending && response.type === pending.type) { responses.delete(response.id); pending.resolve(response); }
  });
  const send = (id, type, data) => new Promise((resolve) => {
    responses.set(id, { type, resolve });
    runtime.document.dispatchEvent(new runtime.CustomEvent("immersiveTranslateDocumentMessageThirdPartyTell", {
      detail: JSON.stringify({ id, type, data: data || {} }),
    }));
  });

  const tokenResponse = await send("document-token-read", "getAuthToken", {});
  const storageResponse = await send("document-storage-read", "getStorage", {});
  const writeResponse = await send("document-storage-write", "setSecret", { secret: "must-not-persist" });

  assert.equal(tokenResponse.payload.ok, false);
  assert.equal(storageResponse.payload.ok, false);
  assert.equal(writeResponse.payload.ok, false);
  assert.equal(JSON.stringify(tokenResponse).includes("must-stay-private"), false);
  assert.equal(runtime.localStorage.getItem("imt-gm-secret"), null);
});

test("PKCE verifier stays in the host and is absent from page storage and public responses", async () => {
  const runtime = createRuntime();
  const challenge = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });

  assert.equal(challenge.verifier, undefined);
  assert.match(challenge.challenge, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(challenge.expiresAt > Date.now());
  assert.equal(runtime.sessionStorage.getItem("__imt_pkce_session"), null);
  assert.equal(runtime.localStorage.getItem("__imt_pkce_session"), null);
});

test("runtime bridge exchanges the code, stores safe identity data, and rejects a replay", async () => {
  const requests = [];
  const runtime = createRuntime({
    fetchResponse: (url, options) => {
      requests.push({ url: String(url), options: options || {} });
      if (String(url).endsWith("/v1/user/pkce/exchange-token")) return { code: 0, data: { token: "server-token" } };
      if (String(url).endsWith("/v1/user")) return { code: 0, data: { id: 7, email: "user@example.com", userType: "pro", token: "must-not-be-copied" } };
      return {};
    },
  });
  const challenge = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  const result = await runtime.chrome.runtime.sendMessage({
    from: "options:main",
    to: "background:main",
    payload: { method: "exchangePkceToken", data: { requestId: challenge.requestId, authCode: "auth-code" } },
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.ok, true);
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("server-token"));
  assert.equal(runtime.localStorage.getItem("imt-gm-user_token"), JSON.stringify("server-token"));
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo")), { id: 7, email: "user@example.com", userType: "pro" });
  assert.equal(JSON.stringify(runtime.__imt_msg_logs).includes("auth-code"), false);
  const exchangeBody = JSON.parse(requests[0].options.body);
  assert.equal(exchangeBody.code, "auth-code");
  assert.match(exchangeBody.verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.notEqual(exchangeBody.verifier, challenge.challenge);
  assert.equal(requests[1].options.headers.token, "server-token");

  const replay = await runtime.chrome.runtime.sendMessage({
    from: "options:main",
    to: "background:main",
    payload: { method: "exchangePkceToken", data: { requestId: challenge.requestId, authCode: "auth-code" } },
  });
  assert.equal(replay.data.code, "pkce_session_not_found");
});

test("Dashboard exposes authentication only through the sanitized host accessor", () => {
  const runtime = createRuntime();
  runtime.localStorage.setItem("imt-gm-authToken", JSON.stringify("server-token"));
  runtime.localStorage.setItem("imt-gm-userInfo", JSON.stringify({
    email: "user@example.com",
    userType: "pro",
    token: "must-not-cross",
    avatar: { token: "must-not-cross" },
  }));

  assert.deepEqual(JSON.parse(JSON.stringify(runtime.__imt_get_auth_state())), {
    version: 1,
    authenticated: true,
    token: "server-token",
    userInfo: { email: "user@example.com", userType: "pro" },
  });

  runtime.localStorage.removeItem("imt-gm-authToken");
  runtime.localStorage.removeItem("imt-gm-userInfo");
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.__imt_get_auth_state())), {
    version: 1,
    authenticated: false,
    token: "",
    userInfo: null,
  });
});

test("runtime bridge clears a rejected exchange without persisting credentials", async () => {
  const runtime = createRuntime({
    fetchResponse: (url) => String(url).endsWith("/exchange-token")
      ? { status: 401, body: { code: 401, message: "invalid code" } }
      : {},
  });
  const first = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  const result = await runtime.chrome.runtime.sendMessage({ method: "exchangePkceToken", data: { requestId: first.requestId, authCode: "rejected-code" } });

  assert.equal(result.ok, false);
  assert.equal(result.code, "auth_code_rejected");
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), null);
  const second = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });
  assert.notEqual(second.requestId, first.requestId);
});

test("clearing Dashboard storage invalidates a pending PKCE session", async () => {
  let requestCount = 0;
  const runtime = createRuntime({ fetchResponse: () => { requestCount++; return {}; } });
  const challenge = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });

  runtime.localStorage.clear();
  const result = await runtime.chrome.runtime.sendMessage({ method: "exchangePkceToken", data: { requestId: challenge.requestId, authCode: "auth-code" } });

  assert.equal(result.code, "pkce_session_not_found");
  assert.equal(requestCount, 0);
});

test("clearing session storage invalidates a pending PKCE session", async () => {
  const runtime = createRuntime();
  const challenge = await runtime.chrome.runtime.sendMessage({ method: "getOrCreatePkceChallenge" });

  runtime.sessionStorage.clear();
  const result = await runtime.chrome.runtime.sendMessage({ method: "exchangePkceToken", data: { requestId: challenge.requestId, authCode: "auth-code" } });

  assert.equal(result.code, "pkce_session_not_found");
});

test("runtime bridge rejects unsupported messages and opens only HTTP login URLs", async () => {
  const opened = [];
  const runtime = createRuntime({ openWindow: (url, target) => { opened.push({ url, target }); return { url }; } });

  const unsupported = await runtime.chrome.runtime.sendMessage({ method: "notARealExtensionMethod" });
  assert.equal(unsupported.success, false);
  assert.equal(unsupported.error, "unsupported_message");

  runtime.GM.openInTab("https://immersivetranslate.com/accounts/login");
  assert.deepEqual(opened, [{ url: "https://immersivetranslate.com/accounts/login", target: "_blank" }]);
  assert.equal(runtime.GM_openInTab("javascript:alert(1)"), null);
  assert.equal(opened.length, 1);
});

test("runtime bridge stores and returns a bounded redacted full user config", async () => {
  const runtime = createRuntime();
  const requestedConfig = JSON.parse(JSON.stringify({
    targetLanguage: "de",
    translationMode: "translation",
    translationTheme: "border",
    translationThemePatterns: ["underline", "border"],
    selectTranslationFont: "Noto Sans",
    generalRule: {
      mouseHoverHoldKey: "Alt",
      mouseHoverTranslationService: "google",
      accessToken: "must-not-persist",
      constructor: { polluted: true },
    },
    translationServices: {
      microsoft: { enabled: false, customLabel: "Work", apiKey: "must-not-persist" },
    },
    password: "must-not-persist",
  }));
  Object.defineProperty(requestedConfig, "__proto__", {
    value: { polluted: true },
    enumerable: true,
  });

  const explicit = await runtime.chrome.runtime.sendMessage({
    method: "setUserConfig",
    data: requestedConfig,
  });
  const implicit = await runtime.chrome.runtime.sendMessage({
    data: { targetLanguage: "fr", translationService: "google" },
  });

  assert.deepEqual(JSON.parse(JSON.stringify(explicit)), { success: true });
  assert.deepEqual(JSON.parse(JSON.stringify(implicit)), {
    success: false,
    error: "unsupported_message",
    type: "unknown",
  });
  const expectedConfig = {
    targetLanguage: "de",
    translationMode: "translation",
    translationTheme: "border",
    translationThemePatterns: ["underline", "border"],
    selectTranslationFont: "Noto Sans",
    generalRule: {
      mouseHoverHoldKey: "Alt",
      mouseHoverTranslationService: "google",
    },
    translationServices: {
      microsoft: { enabled: false, customLabel: "Work" },
    },
  };
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), expectedConfig);
  assert.deepEqual(JSON.parse(JSON.stringify(await runtime.chrome.runtime.sendMessage({ method: "getUserConfig" }))), expectedConfig);
  assert.deepEqual(runtime.__getDashboardConfigCommits(), [expectedConfig]);
  assert.equal({}.polluted, undefined);
  assert.equal(runtime.localStorage.getItem("imt-gm-data"), null);

  await runtime.chrome.storage.local.set({
    fullLocalUserConfig: { targetLanguage: "fr", translationTheme: "underline", apiKey: "must-not-persist" },
  });
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "fr",
    translationTheme: "underline",
  });
  assert.deepEqual(runtime.__getDashboardConfigCommits(), [expectedConfig, { targetLanguage: "fr", translationTheme: "underline" }]);

  const oversized = await runtime.chrome.runtime.sendMessage({
    method: "setUserConfig",
    data: { targetLanguage: "fr", customRule: "x".repeat(512 * 1024) },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(oversized)), { success: false, error: "invalid_config" });
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), { targetLanguage: "fr", translationTheme: "underline" });
  assert.deepEqual(runtime.__getDashboardConfigCommits(), [expectedConfig, { targetLanguage: "fr", translationTheme: "underline" }]);

  const oversizedCollection = await runtime.chrome.runtime.sendMessage({
    method: "setUserConfig",
    data: { translationThemePatterns: Array(20_000).fill("x") },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(oversizedCollection)), { success: false, error: "invalid_config" });
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), { targetLanguage: "fr", translationTheme: "underline" });
  assert.deepEqual(runtime.__getDashboardConfigCommits(), [expectedConfig, { targetLanguage: "fr", translationTheme: "underline" }]);
});

test("host-pushed config is sanitized locally and invalidates a pending sync snapshot", () => {
  const runtime = createRuntime();
  const changes = [];
  runtime.chrome.storage.onChanged.addListener((changeSet, area) => changes.push({ changeSet, area }));
  runtime.localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "en" }));
  const pending = runtime.__imt_build_sync_snapshot();
  runtime.__imt_sync_data = JSON.stringify(pending);

  const applied = runtime.__imt_apply_host_config({
    targetLanguage: "ja",
    translationThemePatterns: ["underline"],
    generalRule: { mouseHoverHoldKey: "Alt", clientSecret: "must-not-persist" },
  });

  assert.equal(applied, true);
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "ja",
    translationThemePatterns: ["underline"],
    generalRule: { mouseHoverHoldKey: "Alt" },
  });
  assert.equal(runtime.__imt_sync_pending_snapshot, null);
  assert.equal(runtime.__imt_sync_data, null);
  assert.notEqual(runtime.__imt_build_sync_snapshot().hash, pending.hash);
  assert.deepEqual(runtime.__getDashboardConfigCommits(), []);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].area, "local");
  assert.equal(changes[0].changeSet.fullLocalUserConfig.oldValue.targetLanguage, "en");
  assert.equal(changes[0].changeSet.fullLocalUserConfig.newValue.targetLanguage, "ja");
});

test("preload persists only the explicit auth/session allowlists", () => {
  const runtime = createRuntime();
  runtime.localStorage.setItem("unrelated-dashboard-data", "secret");
  runtime.localStorage.setItem("user_info", JSON.stringify({ email: "user@example.com", id: 7, userType: "pro", avatar: { token: "nested-secret" }, token: "must-not-be-mirrored" }));
  assert.equal(runtime.localStorage.getItem("imt-gm-unrelated-dashboard-data"), null);
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo")), { id: 7, email: "user@example.com", userType: "pro" });

  runtime.localStorage.setItem("immersiveTranslateIMT_COMMON_JWT_TOKEN", "1234567890123456");
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), JSON.stringify("1234567890123456"));
  runtime.localStorage.removeItem("user_info");
  runtime.localStorage.removeItem("immersiveTranslateIMT_COMMON_JWT_TOKEN");
  assert.equal(runtime.localStorage.getItem("imt-gm-userInfo"), null);
  assert.equal(runtime.localStorage.getItem("imt-gm-user_info"), null);
  assert.equal(runtime.localStorage.getItem("imt-gm-authToken"), null);

  runtime.sessionStorage.setItem("immersiveTranslateAuthState", "allowed");
  runtime.sessionStorage.setItem("random-session-secret", "blocked");
  runtime.sessionStorage.setItem("toString", "blocked");
  const backup = JSON.parse(runtime.localStorage.getItem("__imt_session_backup"));
  assert.deepEqual(backup, { immersiveTranslateAuthState: "allowed" });
  assert.equal(runtime.sessionStorage.getItem("random-session-secret"), "blocked");

  runtime.sessionStorage.clear();
  assert.equal(runtime.sessionStorage.getItem("immersiveTranslateAuthState"), null);
  assert.equal(runtime.localStorage.getItem("__imt_session_backup"), null);
});

test("response capture requires a trusted endpoint and an actual user identity", async () => {
  const runtime = createRuntime({
    fetchResponse: (url) => {
      if (String(url).includes("/api/translate/user")) return { id: 7 };
      if (String(url).includes("/user/profile")) return { data: { email: "user@example.com", id: 7, userType: "max", avatar: { token: "nested-secret" }, token: "should-not-be-stored" } };
      if (String(url).includes("evil.example")) return { email: "attacker@example.com" };
      if (String(url).includes("constructor")) return { email: "prototype@example.com" };
      return {};
    },
  });

  await runtime.fetch("https://dash.immersivetranslate.com/api/translate/user");
  await Promise.resolve();
  assert.equal(runtime.localStorage.getItem("imt-gm-userInfo"), null);

  await runtime.fetch("https://dash.immersivetranslate.com/user/profile");
  await Promise.resolve();
  const userInfo = JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo"));
  assert.deepEqual(userInfo, { id: 7, email: "user@example.com", userType: "max" });

  await runtime.fetch("https://evil.example/user/profile");
  await Promise.resolve();
  assert.equal(JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo")).email, "user@example.com");

  await runtime.fetch("https://constructor/user/profile");
  await Promise.resolve();
  assert.equal(JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo")).email, "user@example.com");
});

test("XHR response capture preserves the existing onload handler", () => {
  const runtime = createRuntime({
    xhrResponse: () => ({ status: 200, body: JSON.stringify({ data: { userId: "u-1", nickname: "reader" } }) }),
  });
  const xhr = new runtime.XMLHttpRequest();
  let existingOnLoadCalled = false;
  xhr.onload = function () { existingOnLoadCalled = true; };
  xhr.open("GET", "https://dash.immersivetranslate.com/user/info");
  xhr.send();
  assert.equal(existingOnLoadCalled, true);
  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-userInfo")), { userId: "u-1", nickname: "reader" });
});

test("in-flight fetch capture cannot resurrect identity after logout", async () => {
  let resolveResponse;
  const response = new Promise((resolve) => { resolveResponse = resolve; });
  const runtime = createRuntime({ fetchResponse: () => response });

  const request = runtime.fetch("https://dash.immersivetranslate.com/user/profile");
  runtime.localStorage.removeItem("user_info");
  resolveResponse({ data: { email: "stale@example.com", userId: "stale" } });
  await request;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(runtime.localStorage.getItem("imt-gm-userInfo"), null);
});

test("in-flight XHR capture cannot resurrect identity after logout", () => {
  let completeResponse;
  const runtime = createRuntime({
    deferXhr: (_url, complete) => { completeResponse = complete; },
  });
  const xhr = new runtime.XMLHttpRequest();
  xhr.open("GET", "https://dash.immersivetranslate.com/user/info");
  xhr.send();
  runtime.localStorage.removeItem("user_info");
  completeResponse({ status: 200, body: JSON.stringify({ data: { userId: "stale", nickname: "reader" } }) });

  assert.equal(runtime.localStorage.getItem("imt-gm-userInfo"), null);
});

test("clear invalidates in-flight captures", async () => {
  let resolveResponse;
  const response = new Promise((resolve) => { resolveResponse = resolve; });
  const runtime = createRuntime({ fetchResponse: () => response });

  const request = runtime.fetch("https://dash.immersivetranslate.com/user/profile");
  runtime.localStorage.clear();
  resolveResponse({ data: { email: "stale@example.com", userId: "stale" } });
  await request;
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(runtime.localStorage.getItem("imt-gm-userInfo"), null);
});

test("config response capture stores the complete redacted advanced config", async () => {
  const runtime = createRuntime({
    fetchResponse: (url) => String(url).endsWith("/config") ? {
      targetLanguage: "zh-TW",
      translationMode: "translation",
      translationService: "google",
      generalRule: { mouseHoverHoldKey: "Alt", mouseHoverTranslationService: "microsoft", accessToken: "must-not-leave-dashboard" },
      translationTheme: "border",
      translationThemePatterns: ["underline", "border"],
      selectTranslationFont: "Noto Sans",
      translationServices: {
        microsoft: {
          enabled: true,
          visible: false,
          configured: true,
          apiKey: "must-not-leave-dashboard",
          customLabel: "Work",
        },
      },
    } : {},
  });

  await runtime.fetch("https://dash.immersivetranslate.com/config");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "zh-TW",
    translationMode: "translation",
    translationService: "google",
    generalRule: { mouseHoverHoldKey: "Alt", mouseHoverTranslationService: "microsoft" },
    translationTheme: "border",
    translationThemePatterns: ["underline", "border"],
    selectTranslationFont: "Noto Sans",
    translationServices: {
      microsoft: { visible: false, enabled: true, configured: true, customLabel: "Work" },
    },
  });
});

test("partial config capture recursively merges ordinary nested settings", async () => {
  const runtime = createRuntime({
    fetchResponse: () => ({ generalRule: { mouseHoverTranslationService: "microsoft" } }),
  });
  runtime.localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "ja",
    generalRule: { mouseHoverHoldKey: "Alt", mouseHoverTranslationDelay: 250 },
  }));

  await runtime.fetch("https://dash.immersivetranslate.com/config");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "ja",
    generalRule: {
      mouseHoverHoldKey: "Alt",
      mouseHoverTranslationDelay: 250,
      mouseHoverTranslationService: "microsoft",
    },
  });
});

test("config capture ignores non-success fetch and XHR responses", async () => {
  const runtime = createRuntime({
    fetchResponse: () => ({ status: 500, body: { targetLanguage: "fetch-error", error: "temporary" } }),
    xhrResponse: () => ({ status: 503, body: JSON.stringify({ targetLanguage: "xhr-error", error: "temporary" }) }),
  });
  const originalConfig = { targetLanguage: "ja", translationTheme: "border" };
  runtime.localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify(originalConfig));

  await runtime.fetch("https://dash.immersivetranslate.com/config");
  await Promise.resolve();
  await Promise.resolve();
  const xhr = new runtime.XMLHttpRequest();
  xhr.open("GET", "https://dash.immersivetranslate.com/config");
  xhr.send();

  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), originalConfig);
});

test("an in-flight config capture cannot overwrite newer host config", async () => {
  let resolveConfig;
  const response = new Promise((resolve) => { resolveConfig = resolve; });
  const runtime = createRuntime({ fetchResponse: () => response });

  const request = runtime.fetch("https://dash.immersivetranslate.com/config");
  assert.equal(runtime.__imt_apply_host_config({
    targetLanguage: "ja",
    generalRule: { mouseHoverHoldKey: "Alt" },
  }), true);
  resolveConfig({ targetLanguage: "stale", generalRule: { mouseHoverHoldKey: "Shift" } });
  await request;
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "ja",
    generalRule: { mouseHoverHoldKey: "Alt" },
  });
});

test("service endpoint capture merges availability without erasing advanced config", async () => {
  const runtime = createRuntime({
    fetchResponse: (url) => String(url).endsWith("/services") ? {
      services: {
        microsoft: { available: true, disabled: false, apiKey: "must-not-leave-dashboard", label: "drop-me" },
      },
      serviceConfig: { microsoft: { apiKey: "must-not-leave-dashboard" } },
    } : {},
  });
  runtime.localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "ja",
    translationTheme: "border",
    generalRule: { mouseHoverHoldKey: "Alt" },
    translationServices: {
      microsoft: { enabled: false, customLabel: "Work" },
      google: { enabled: true },
    },
  }));

  await runtime.fetch("https://dash.immersivetranslate.com/services");
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(JSON.parse(runtime.localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "ja",
    translationTheme: "border",
    generalRule: { mouseHoverHoldKey: "Alt" },
    translationServices: {
      microsoft: { enabled: false, customLabel: "Work", available: true, disabled: false },
      google: { enabled: true },
    },
  });
  assert.equal(runtime.localStorage.getItem("imt-gm-translateServices"), null);
  assert.equal(runtime.localStorage.getItem("imt-gm-translateServiceConfig"), null);
});

test("sync snapshot is scoped to account and service data, redacted, and reports deletions", () => {
  const runtime = createRuntime();
  runtime.localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "ja",
    translationMode: "translation",
    translationService: "google",
    translationTheme: "border",
    translationThemePatterns: ["underline", "border"],
    selectTranslationFont: "Noto Sans",
    generalRule: { mouseHoverHoldKey: "Alt" },
    arbitraryRuntimeRule: { enabled: true },
    translationServices: {
      microsoft: { enabled: true, visible: false, customLabel: "drop-me", apiKey: "must-not-leave-dashboard" },
    },
    apiKey: "must-not-leave-dashboard",
  }));
  runtime.localStorage.setItem("imt-gm-authToken", JSON.stringify("must-not-leave-dashboard"));
  runtime.localStorage.setItem("imt-gm-appKey", JSON.stringify("must-not-leave-dashboard"));
  runtime.localStorage.setItem("imt-gm-unknownOption", JSON.stringify("must-not-leave-dashboard"));
  runtime.localStorage.setItem("imt-gm-toString", JSON.stringify("must-not-leave-dashboard"));
  runtime.localStorage.setItem("imt-gm-constructor", JSON.stringify("must-not-leave-dashboard"));
  runtime.localStorage.setItem("imt-gm-translateServices", JSON.stringify({ enabled: true }));
  runtime.localStorage.setItem("imt-gm-translateServiceConfig", JSON.stringify({ microsoft: { enabled: true, apiKey: "must-not-leave-dashboard" } }));
  runtime.localStorage.setItem("imt-gm-usage_limit_stats", JSON.stringify({ remaining: 10 }));
  runtime.localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "user@example.com", userType: "pro", avatar: { token: "must-not-leave-dashboard" } }));
  runtime.localStorage.setItem("imt-gm-subscriptionInfo", JSON.stringify({ plan: "pro", expiresAt: "2030-01-01", token: "must-not-leave-dashboard" }));

  const first = runtime.__imt_build_sync_snapshot();
  assert.ok(first);
  assert.equal(first.scope, "dashboard-account-services");
  assert.equal(first.values["imt-gm-authToken"], undefined);
  assert.equal(first.values["imt-gm-appKey"], undefined);
  assert.equal(first.values["imt-gm-unknownOption"], undefined);
  assert.equal(first.values["imt-gm-toString"], undefined);
  assert.equal(first.values["imt-gm-constructor"], undefined);
  assert.deepEqual(JSON.parse(first.values["imt-gm-fullLocalUserConfig"]), {
    targetLanguage: "ja",
    translationMode: "translation",
    translationService: "google",
    translationTheme: "border",
    translationThemePatterns: ["underline", "border"],
    selectTranslationFont: "Noto Sans",
    generalRule: { mouseHoverHoldKey: "Alt" },
    arbitraryRuntimeRule: { enabled: true },
    translationServices: { microsoft: { visible: false, enabled: true, customLabel: "drop-me" } },
  });
  assert.equal(first.values["imt-gm-translateServices"], undefined);
  assert.equal(first.values["imt-gm-translateServiceConfig"], undefined);
  assert.equal(first.values["imt-gm-usage_limit_stats"], undefined);
  assert.deepEqual(JSON.parse(first.values["imt-gm-userInfo"]), { email: "user@example.com", userType: "pro" });
  assert.deepEqual(JSON.parse(first.values["imt-gm-subscriptionInfo"]), { plan: "pro", expiresAt: "2030-01-01" });
  assert.deepEqual(Array.from(first.deletedKeys), []);
  assert.match(first.hash, /^[0-9a-f]{8}$/);

  runtime.localStorage.removeItem("imt-gm-userInfo");
  const pending = runtime.__imt_build_sync_snapshot();
  assert.equal(pending.hash, first.hash);
  runtime.__imt_sync_ack_hash = first.hash;
  const second = runtime.__imt_build_sync_snapshot();
  assert.deepEqual(Array.from(second.deletedKeys), ["imt-gm-userInfo"]);
  assert.notEqual(second.revision, first.revision);
});
