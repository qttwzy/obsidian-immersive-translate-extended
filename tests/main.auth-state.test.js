"use strict";

const assert = require("node:assert/strict");
const { test, before, afterEach } = require("node:test");
const Module = require("node:module");
const path = require("node:path");

const MAIN_PATH = path.join(__dirname, "..", "plugin", "main.js");
const trackedGlobals = [
  "window", "self", "document", "localStorage", "sessionStorage",
  "StorageEvent", "Event", "navigator", "XMLHttpRequest", "fetch",
  "open", "location", "dispatchEvent", "addEventListener", "require",
  "GM", "GM_fetch", "GM_info", "GM_getValue", "GM_setValue",
  "GM_deleteValue", "GM_listValues", "GM_addStyle", "GM_openInTab",
  "GM_registerMenuCommand", "GM_addElement", "GM_xmlhttpRequest", "GM_xmlHttpRequest",
  "immersiveTranslateBrowserAPI", "immersiveTranslateConfig", "IMMERSIVE_TRANSLATE_CONFIG",
  "_getAuthCookies", "_imtGMPolyfillInstalled",
  "_imtBrowserAPIPolyfillInstalled", "__imt_extend_engine_state__",
  "__imt_extend_settings_save_chain__", "__imt_extend_standalone_coordinator__", "__imt_test_script_ran__",
];
const originalGlobals = new Map();
let requestUrlImpl;

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] || null; }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
  clear() { this.values.clear(); }
}

function makeElement(tagName) {
  const element = {
    tagName: String(tagName).toUpperCase(),
    children: [],
    parentNode: null,
    id: "",
    textContent: "",
    value: "",
    listeners: {},
    style: {},
    className: "",
    classList: { toggle() {}, add() {}, remove() {} },
    append(child) { child.parentNode = this; this.children.push(child); },
    appendChild(child) { this.append(child); },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    dispatchEvent(event) { if (event && this.listeners[event.type]) this.listeners[event.type].call(this, event); },
    createEl(childTag, options) {
      const child = makeElement(childTag);
      if (options && options.text) child.textContent = options.text;
      if (options && options.value !== undefined) child.value = options.value;
      this.append(child);
      return child;
    },
    createDiv(options) { return this.createEl("div", options); },
    empty() { this.children = []; },
    select() {},
  };
  return element;
}

function setupRuntime() {
  for (const key of trackedGlobals) {
    if (!originalGlobals.has(key)) originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key) || null);
    try { delete globalThis[key]; } catch {}
  }

  const body = makeElement("body");
  const head = makeElement("head");
  const document = {
    body,
    head,
    createElement: makeElement,
    getElementById() { return null; },
    querySelectorAll() { return []; },
  };
  const originalWindowOpen = function originalWindowOpen() { return "opened"; };
  const originalFetch = function originalFetch() { return Promise.resolve({}); };
  function XMLHttpRequest() {}
  XMLHttpRequest.prototype.open = function originalXHROpen() {};
  XMLHttpRequest.prototype.send = function originalXHRSend() {};

  globalThis.window = globalThis;
  globalThis.self = globalThis;
  globalThis.document = document;
  globalThis.localStorage = new MemoryStorage();
  globalThis.sessionStorage = new MemoryStorage();
  globalThis.StorageEvent = function StorageEvent(type, init) { this.type = type; Object.assign(this, init || {}); };
  globalThis.Event = function Event(type) { this.type = type; };
  globalThis.navigator = { language: "en-US", languages: ["en-US"] };
  globalThis.XMLHttpRequest = XMLHttpRequest;
  globalThis.fetch = originalFetch;
  globalThis.window.open = originalWindowOpen;
  globalThis.window.location = { href: "app://obsidian" };
  globalThis.window.dispatchEvent = function dispatchEvent() {};
  globalThis.window.addEventListener = function addEventListener() {};
  globalThis.window.require = function requireModule(name) {
    if (name === "path") return require("node:path");
    if (name === "fs") return require("node:fs");
    throw new Error("unexpected module: " + name);
  };
  requestUrlImpl = async function () { return { status: 503, text: "", headers: {}, arrayBuffer: new ArrayBuffer(0) }; };
  return { body, head };
}

function restoreRuntime() {
  for (const key of trackedGlobals) {
    try { delete globalThis[key]; } catch {}
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  }
}

function loadPluginClass() {
  function Plugin(app, manifest) { this.app = app; this.manifest = manifest; }
  Plugin.prototype.loadData = async function () { return null; };
  Plugin.prototype.saveData = async function () {};
  Plugin.prototype.addSettingTab = function () {};
  function Modal(app) { this.app = app; this.contentEl = makeElement("div"); }
  Modal.prototype.open = function () { if (typeof this.onOpen === "function") this.onOpen(); return this; };
  function PluginSettingTab(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = makeElement("div"); }
  function Setting() {}
  Setting.prototype.setName = function () { return this; };
  Setting.prototype.setDesc = function () { return this; };
  Setting.prototype.addDropdown = function (callback) { if (callback) callback({ addOption() {}, setValue() { return this; }, onChange() { return this; } }); return this; };
  Setting.prototype.addButton = function (callback) { if (callback) callback({ setButtonText() { return this; }, onClick() { return this; } }); return this; };
  Setting.prototype.addToggle = function (callback) { if (callback) callback({ setValue() { return this; }, onChange() { return this; } }); return this; };
  const obsidianMock = {
    Plugin, Modal, PluginSettingTab, Setting,
    Notice: function Notice(message) { this.message = message; },
    requestUrl: function (options) { return requestUrlImpl(options); },
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "obsidian") return obsidianMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(MAIN_PATH)];
    return require(MAIN_PATH);
  } finally {
    Module._load = originalLoad;
  }
}

let PluginClass;
before(() => { PluginClass = loadPluginClass(); });
afterEach(() => { restoreRuntime(); });

function makePlugin() {
  const app = {
    plugins: { plugins: {} },
    vault: { adapter: {} },
  };
  const plugin = new PluginClass(app, { id: "immersive-translate-extended" });
  plugin._isUnloaded = false;
  return plugin;
}

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
