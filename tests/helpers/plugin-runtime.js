"use strict";

const Module = require("node:module");
const path = require("node:path");
const { MemoryStorage } = require("./memory-storage");

const MAIN_PATH = path.join(__dirname, "..", "..", "plugin", "main.js");
const TRACKED_GLOBALS = [
  "window", "self", "document", "localStorage", "sessionStorage",
  "StorageEvent", "CustomEvent", "Event", "navigator", "XMLHttpRequest", "fetch",
  "open", "location", "dispatchEvent", "addEventListener", "require",
  "GM", "GM_fetch", "GM_info", "GM_getValue", "GM_setValue",
  "GM_deleteValue", "GM_listValues", "GM_addStyle", "GM_openInTab",
  "GM_addValueChangeListener", "GM_removeValueChangeListener", "GM_registerMenuCommand", "GM_addElement", "GM_xmlhttpRequest", "GM_xmlHttpRequest",
  "immersiveTranslateBrowserAPI", "immersiveTranslateConfig", "IMMERSIVE_TRANSLATE_CONFIG",
  "_getAuthCookies", "_imtGMPolyfillInstalled",
  "_imtBrowserAPIPolyfillInstalled", "__imt_extend_engine_state__",
  "__imt_extend_settings_save_chain__", "__imt_extend_standalone_coordinator__", "__imt_extend_init_guard__",
  "__imt_test_script_ran__",
];

const originalGlobals = new Map();

function makeRequestUrlResponse({ status = 200, body = "", headers = {} } = {}) {
  const arrayBuffer = body instanceof ArrayBuffer ? body : new TextEncoder().encode(String(body)).buffer;
  const stats = { jsonReads: 0 };
  return {
    status,
    headers,
    arrayBuffer,
    stats,
    get json() {
      stats.jsonReads += 1;
      return JSON.parse(new TextDecoder().decode(arrayBuffer));
    },
    get text() { return new TextDecoder().decode(arrayBuffer); },
  };
}

function defaultRequestUrl() {
  return Promise.resolve(makeRequestUrlResponse({ status: 503 }));
}

const harness = {
  requestUrlImpl: defaultRequestUrl,
  noticeMessages: [],
  openedModals: [],
  addedSettingTabs: [],
};

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
      if (options && options.type !== undefined) child.type = options.type;
      if (options && options.placeholder !== undefined) child.placeholder = options.placeholder;
      if (options && options.cls !== undefined) child.className = options.cls;
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
  harness.noticeMessages.length = 0;
  harness.openedModals.length = 0;
  harness.addedSettingTabs.length = 0;
  for (const key of TRACKED_GLOBALS) {
    if (!originalGlobals.has(key)) originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key) || null);
    try { delete globalThis[key]; } catch {}
  }

  const body = makeElement("body");
  const head = makeElement("head");
  const document = {
    body,
    head,
    createElement: makeElement,
    getElementById(id) {
      const visit = (node) => {
        if (node.id === id) return node;
        for (const child of node.children || []) { const match = visit(child); if (match) return match; }
        return null;
      };
      return visit(body) || visit(head);
    },
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
  globalThis.CustomEvent = function CustomEvent(type, init) { this.type = type; Object.assign(this, init || {}); };
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
  harness.requestUrlImpl = defaultRequestUrl;
  return { body, head, originalWindowOpen, originalFetch, originalXHROpen: XMLHttpRequest.prototype.open, originalXHRSend: XMLHttpRequest.prototype.send };
}

function restoreRuntime() {
  for (const key of TRACKED_GLOBALS) {
    try { delete globalThis[key]; } catch {}
    const descriptor = originalGlobals.get(key);
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
  }
}

let PluginClass;

function loadPluginClass() {
  function Plugin(app, manifest) { this.app = app; this.manifest = manifest; }
  Plugin.prototype.loadData = async function () { return null; };
  Plugin.prototype.saveData = async function () {};
  Plugin.prototype.addSettingTab = function (tab) { harness.addedSettingTabs.push(tab); };
  function Modal(app) {
    this.app = app;
    this.contentEl = makeElement("div");
    this.titleEl = makeElement("div");
    this.closed = false;
  }
  Modal.prototype.open = function () {
    harness.openedModals.push(this);
    if (typeof this.onOpen === "function") this.onOpen();
    return this;
  };
  Modal.prototype.close = function () {
    this.closed = true;
    if (typeof this.onClose === "function") this.onClose();
  };
  function PluginSettingTab(app, plugin) { this.app = app; this.plugin = plugin; this.containerEl = makeElement("div"); }
  function MarkdownView() {}
  function Setting(container) { this.settingEl = container.createDiv({ cls: "setting-item" }); }
  Setting.prototype.setName = function (name) { this.settingEl.createDiv({ cls: "setting-item-name", text: name }); return this; };
  Setting.prototype.setDesc = function (desc) { this.settingEl.createDiv({ cls: "setting-item-description", text: desc }); return this; };
  Setting.prototype.addDropdown = function (callback) {
    const select = this.settingEl.createEl("select");
    if (callback) callback({
      addOption(value, label) { select.createEl("option", { value, text: label }); return this; },
      setValue(value) { select.value = value; return this; },
      onChange(handler) { select.addEventListener("change", () => handler(select.value)); return this; },
    });
    return this;
  };
  Setting.prototype.addButton = function (callback) {
    const button = this.settingEl.createEl("button");
    if (callback) callback({
      setButtonText(text) { button.textContent = text; return this; },
      setDisabled(value) { button.disabled = !!value; return this; },
      onClick(handler) { button.addEventListener("click", handler); return this; },
    });
    return this;
  };
  Setting.prototype.addToggle = function (callback) {
    const toggle = this.settingEl.createEl("input", { type: "checkbox" });
    if (callback) callback({
      setValue(value) { toggle.checked = !!value; return this; },
      onChange(handler) { toggle.addEventListener("change", () => handler(!!toggle.checked)); return this; },
    });
    return this;
  };
  const obsidianMock = {
    Plugin, Modal, PluginSettingTab, Setting, MarkdownView,
    Notice: function Notice(message) { this.message = message; harness.noticeMessages.push(message); },
    requestUrl: function (options) { return harness.requestUrlImpl(options); },
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "obsidian") return obsidianMock;
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve(MAIN_PATH)];
    PluginClass = require(MAIN_PATH);
    return PluginClass;
  } finally {
    Module._load = originalLoad;
  }
}

function makePlugin(app) {
  const pluginApp = app || {
    plugins: { plugins: {} },
    vault: { adapter: {} },
  };
  const plugin = new PluginClass(pluginApp, { id: "immersive-translate-extended" });
  plugin._isUnloaded = false;
  plugin._getDocumentPreloadPath = () => "/plugin/document-preload.js";
  plugin._initializeDocumentRuntime = () => ({ ok: true, code: "runtime_ready" });
  return plugin;
}

function findElement(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.children || []) {
    const match = findElement(child, predicate);
    if (match) return match;
  }
  return null;
}

function collectText(root) {
  return [root.textContent || "", ...(root.children || []).map(collectText)].join(" ");
}

module.exports = {
  harness,
  setupRuntime,
  restoreRuntime,
  loadPluginClass,
  makePlugin,
  makeElement,
  makeRequestUrlResponse,
  findElement,
  collectText,
};
