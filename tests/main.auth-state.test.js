"use strict";

const assert = require("node:assert/strict");
const { test, before, afterEach } = require("node:test");
const {
  setupRuntime,
  restoreRuntime,
  loadPluginClass,
  makePlugin,
} = require("./helpers/plugin-runtime");

before(() => { loadPluginClass(); });
afterEach(() => { restoreRuntime(); });

function makeAuthStateWindow(authStateRef) {
  return {
    isDestroyed: () => false,
    webContents: {
      executeJavaScript: (script) => (script.includes("__imt_get_auth_state") ? Promise.resolve(authStateRef.value) : Promise.resolve(null)),
    },
  };
}

test("PKCE token without user info deletes the stale userInfo key instead of throwing", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "stale@example.com" }));
  const plugin = makePlugin();
  const authStateRef = { value: { version: 1, authenticated: true, token: "token-only" } };
  plugin._dashboardWindow = makeAuthStateWindow(authStateRef);

  assert.equal(await plugin._syncDashboardAuthState(), true);
  assert.equal(localStorage.getItem("imt-gm-authToken"), JSON.stringify("token-only"));
  assert.equal(localStorage.getItem("imt-gm-user_token"), JSON.stringify("token-only"));
  assert.equal(localStorage.getItem("imt-gm-immersiveTranslateIMT_COMMON_JWT_TOKEN"), JSON.stringify("token-only"));
  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
  assert.equal(localStorage.getItem("imt-gm-user_info"), null);

  assert.doesNotThrow(() => plugin._applyDashboardAuthState({ version: 1, authenticated: true, token: "token-only-refreshed" }));
  assert.equal(localStorage.getItem("imt-gm-authToken"), JSON.stringify("token-only-refreshed"));
  assert.equal(localStorage.getItem("imt-gm-user_token"), JSON.stringify("token-only-refreshed"));
  assert.equal(localStorage.getItem("imt-gm-immersiveTranslateIMT_COMMON_JWT_TOKEN"), JSON.stringify("token-only-refreshed"));
  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
  assert.equal(localStorage.getItem("imt-gm-user_info"), null);
});

test("an unchanged PKCE session backfills aliases required by current userscripts", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const authStateRef = {
    value: {
      version: 1,
      authenticated: true,
      token: "stable-token",
      userInfo: { email: "stable@example.com", token: "must-not-copy" },
    },
  };
  plugin._dashboardWindow = makeAuthStateWindow(authStateRef);

  assert.equal(await plugin._syncDashboardAuthState(), true);
  localStorage.removeItem("imt-gm-user_token");
  localStorage.removeItem("imt-gm-immersiveTranslateIMT_COMMON_JWT_TOKEN");
  localStorage.removeItem("imt-gm-user_info");

  assert.equal(await plugin._syncDashboardAuthState(), true);
  assert.equal(localStorage.getItem("imt-gm-user_token"), JSON.stringify("stable-token"));
  assert.equal(localStorage.getItem("imt-gm-immersiveTranslateIMT_COMMON_JWT_TOKEN"), JSON.stringify("stable-token"));
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-user_info")), { email: "stable@example.com" });
});

test("PKCE state keeps an id-only identity across the host sync boundary", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const authStateRef = { value: { version: 1, authenticated: true, token: "id-only-token", userInfo: { id: 987654, userType: "pro" } } };
  plugin._dashboardWindow = makeAuthStateWindow(authStateRef);

  assert.equal(await plugin._syncDashboardAuthState(), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-userInfo")), { id: 987654, userType: "pro" });
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-user_info")), { id: 987654, userType: "pro" });
  assert.equal(plugin._getAuthToken(), "id-only-token");
});

test("PKCE logout with legacy cookies clears every token alias instead of throwing", async () => {
  setupRuntime();
  const tokenAliasKeys = [
    "authToken",
    "user_token",
    "auth",
    "GoogleAccessToken",
    "immersiveTranslateIMT_COMMON_JWT_TOKEN",
    "immersiveTranslateGoogleAccessToken",
  ];
  for (const key of tokenAliasKeys) localStorage.setItem("imt-gm-" + key, JSON.stringify("legacy-" + key));
  const plugin = makePlugin();
  const authStateRef = { value: { version: 1, authenticated: true, token: "pkce-token", userInfo: { email: "pkce@example.com" } } };
  plugin._dashboardWindow = makeAuthStateWindow(authStateRef);

  assert.equal(await plugin._syncDashboardAuthState(), true);
  assert.equal(localStorage.getItem("imt-gm-authToken"), JSON.stringify("pkce-token"));

  // The legacy Dashboard cookie session survives the PKCE login, as after _syncCookiesToMain.
  plugin._authAdapter.applyLegacyCookies("session=legacy");
  authStateRef.value = { version: 1, authenticated: false };
  assert.equal(await plugin._syncDashboardAuthState(), true);

  assert.equal(plugin._getAuthToken(), "");
  assert.equal(plugin._getAuthCookies(), "session=legacy");
  for (const key of tokenAliasKeys) assert.equal(localStorage.getItem("imt-gm-" + key), null, key + " must be cleared");
  assert.equal(localStorage.getItem("imt-gm-userInfo"), JSON.stringify({ email: "pkce@example.com" }));
});

test("host auth token and cookies are read from the session adapter", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._authToken = "stale-token";
  plugin._authCookies = "stale=cookie";
  assert.equal(plugin._getAuthToken(), "");
  assert.equal(plugin._getAuthCookies(), "");

  plugin._authAdapter.applyPkceState({ token: "pkce-token", userInfo: { email: "adapter@example.com" } });
  plugin._authAdapter.applyLegacyCookies("session=live");
  assert.equal(plugin._getAuthToken(), "pkce-token");
  assert.equal(plugin._getAuthCookies(), "session=live");
});
