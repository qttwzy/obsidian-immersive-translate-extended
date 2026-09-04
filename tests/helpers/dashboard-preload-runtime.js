"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { webcrypto } = require("node:crypto");
const vm = require("node:vm");
const { createDashboardPkceHost } = require("../../plugin/dashboard-pkce-host");

const PRELOAD_SOURCE = fs.readFileSync(path.join(__dirname, "..", "..", "plugin", "dashboard-preload.js"), "utf8");

class MemoryStorage {
  constructor() { this.values = new Map(); }
  get length() { return this.values.size; }
  key(index) { return Array.from(this.values.keys())[index] || null; }
  getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
  setItem(key, value) { this.values.set(String(key), String(value)); }
  removeItem(key) { this.values.delete(String(key)); }
  clear() { this.values.clear(); }
}

function makeElement() {
  const element = {
    tagName: "DIV",
    id: "",
    name: "",
    content: "",
    value: "",
    children: [],
    parentNode: null,
    style: {},
    appendChild(child) { child.parentNode = this; this.children.push(child); },
    append(child) { this.appendChild(child); },
    setAttribute(name, value) { this[name] = String(value); },
    getAttribute(name) { return this[name] === undefined ? null : this[name]; },
    remove() {
      if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    },
    dispatchEvent() {},
    addEventListener() {},
    click() {},
  };
  return element;
}

function createDashboardPreloadRuntime({
  host = "dash.immersivetranslate.com",
  fetchResponse,
  xhrResponse,
  deferXhr,
  openWindow,
  closeWindow,
  deferBridgeMetadata = false,
  sharedLocalStorage,
  sharedSessionStorage,
  sharedPkceHost,
  hostAuthState,
} = {}) {
  const body = makeElement();
  const head = makeElement();
  const elements = [body, head];
  const documentListeners = new Map();
  const document = {
    body,
    head,
    documentElement: body,
    createElement(tagName) { const element = makeElement(); element.tagName = String(tagName || "div").toUpperCase(); elements.push(element); return element; },
    getElementById(id) {
      const visit = (node) => {
        if (node.id === id) return node;
        for (const child of node.children) { const found = visit(child); if (found) return found; }
        return null;
      };
      return visit(body) || visit(head);
    },
    querySelector(selector) {
      const match = /^meta\[name=["']([^"']+)["']\]$/.exec(String(selector));
      if (!match) return null;
      return elements.find((element) => element.tagName === "META" && element.name === match[1]) || null;
    },
    addEventListener(name, callback) {
      const callbacks = documentListeners.get(name) || [];
      callbacks.push(callback);
      documentListeners.set(name, callbacks);
    },
    removeEventListener(name, callback) {
      const callbacks = documentListeners.get(name) || [];
      documentListeners.set(name, callbacks.filter((candidate) => candidate !== callback));
    },
    dispatchEvent(event) {
      for (const callback of documentListeners.get(event.type) || []) callback.call(document, event);
      return true;
    },
  };
  if (deferBridgeMetadata) {
    document.head = null;
    document.documentElement = null;
  }
  const localStorage = sharedLocalStorage || new MemoryStorage();
  const sessionStorage = sharedSessionStorage || new MemoryStorage();
  const listeners = new Map();
  const responseFor = fetchResponse || (() => ({}));
  const xhrResponseFor = xhrResponse || (() => ({ status: 200, body: "{}" }));
  const intervalCallbacks = [];
  const replacedLocations = [];
  const hostNavigations = [];
  const dashboardConfigCommits = [];
  let context;
  const pkceHostState = sharedPkceHost || {};
  if (!pkceHostState.host) {
    pkceHostState.host = createDashboardPkceHost({
      request: (options) => pkceHostState.request(options),
      sanitizeUserInfo(value) {
        if (!value || typeof value !== "object") return null;
        const safe = {};
        for (const key of ["id", "userId", "email", "nickname", "avatar", "userType"]) {
          if (value[key] !== undefined) safe[key] = value[key];
        }
        return Object.keys(safe).length > 0 ? safe : null;
      },
      applyAuthState: async () => {},
      readAuthState: () => hostAuthState || null,
    });
  }
  const ipcListeners = new Map();
  const pkceChannel = "imt-pkce-0123456789abcdef0123456789abcdef";
  const ipcRenderer = {
    on(channel, callback) {
      const callbacks = ipcListeners.get(channel) || [];
      callbacks.push(callback);
      ipcListeners.set(channel, callbacks);
    },
    send(channel, message) {
      if (channel !== pkceChannel) return;
      if (message.type === "navigateTrustedDashboard") {
        hostNavigations.push(message.data && message.data.url);
        for (const callback of ipcListeners.get(pkceChannel + ":response") || []) {
          callback({}, { id: message.id, type: message.type, payload: { ok: true } });
        }
        return;
      }
      if (message.type === "commitDashboardConfig") {
        dashboardConfigCommits.push(JSON.parse(JSON.stringify(message.data && message.data.config)));
        for (const callback of ipcListeners.get(pkceChannel + ":response") || []) {
          callback({}, { id: message.id, type: message.type, payload: { ok: true } });
        }
        return;
      }
      const result = pkceHostState.host.handle(message.type, message.data || {});
      Promise.resolve(result).then((payload) => {
        for (const callback of ipcListeners.get(pkceChannel + ":response") || []) {
          callback({}, { id: message.id, type: message.type, payload });
        }
      });
    },
  };
  function XMLHttpRequest() { this.listeners = {}; this.responseText = ""; }
  XMLHttpRequest.prototype.addEventListener = function (name, callback) { (this.listeners[name] ||= []).push(callback); };
  XMLHttpRequest.prototype.open = function (method, url) { this.method = method; this.url = url; };
  XMLHttpRequest.prototype.send = function () {
    const result = xhrResponseFor(this.url);
    const complete = (response) => {
      this.status = response.status;
      this.responseText = response.body;
      for (const callback of this.listeners.load || []) callback.call(this);
      if (typeof this.onload === "function") this.onload();
    };
    if (typeof deferXhr === "function") {
      deferXhr(this.url, complete);
      return;
    }
    complete(result);
  };

  let reloadCount = 0;
  context = {
    console: { log() {}, warn() {}, error() {} },
    document,
    localStorage,
    sessionStorage,
    location: {
      protocol: "https:",
      hostname: host,
      href: "https://" + host + "/#general",
      hash: "#general",
      reload() { reloadCount++; },
      replace(url) {
        const next = new URL(String(url), this.href);
        this.protocol = next.protocol;
        this.hostname = next.hostname;
        this.href = next.href;
        this.hash = next.hash;
        replacedLocations.push(next.href);
      },
    },
    navigator: { languages: ["en-US"], language: "en-US" },
    URL,
    URLSearchParams,
    Buffer,
    Promise,
    JSON,
    Date,
    Math,
    TextEncoder,
    TextDecoder,
    crypto: webcrypto,
    btoa(value) { return Buffer.from(value, "binary").toString("base64"); },
    atob(value) { return Buffer.from(value, "base64").toString("binary"); },
    Event: function Event(type) { this.type = type; },
    CustomEvent: function CustomEvent(type, init) { this.type = type; Object.assign(this, init || {}); },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    setInterval(callback) { intervalCallbacks.push(callback); return intervalCallbacks.length; },
    clearInterval() {},
    XMLHttpRequest,
    process: { argv: ["electron", "--imt-pkce-channel=" + pkceChannel] },
    require(name) {
      if (name === "buffer") return { Buffer };
      if (name === "electron") return {
        ipcRenderer,
        contextBridge: {
          exposeInMainWorld(key, value) { context[key] = value; },
        },
        webFrame: {
          executeJavaScript(source) { return Promise.resolve(vm.runInContext(source, context)); },
        },
      };
      throw new Error("module unavailable: " + name);
    },
    fetch: function (url, options) {
      const result = responseFor(url, options);
      const hasEnvelope = result && typeof result === "object" && Object.prototype.hasOwnProperty.call(result, "body");
      const body = hasEnvelope ? result.body : result;
      const status = hasEnvelope && result.status !== undefined ? result.status : 200;
      const response = {
        status,
        ok: hasEnvelope && result.ok !== undefined ? result.ok : status >= 200 && status < 300,
        json() { return Promise.resolve(body); },
        text() { return Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)); },
      };
      response.clone = function () { return response; };
      return Promise.resolve(response);
    },
    open(url, target) { return typeof openWindow === "function" ? openWindow(url, target) : null; },
    close() { return typeof closeWindow === "function" ? closeWindow() : undefined; },
  };
  pkceHostState.request = async (options) => {
    const response = await context.fetch(options.url, options);
    let json = null;
    try { json = await response.json(); } catch {}
    return { status: response.status, json, text: JSON.stringify(json) };
  };
  context.window = context;
  context.self = context;
  context.window.addEventListener = function (name, callback) { listeners.set(name, callback); };
  context.window.removeEventListener = function () {};
  vm.createContext(context);
  vm.runInContext(PRELOAD_SOURCE, context, { filename: "dashboard-preload.js" });
  context.__releaseBridgeMetadata = function () {
    document.head = head;
    document.documentElement = body;
    document.dispatchEvent(new context.Event("DOMContentLoaded"));
  };
  context.__run = function (script) { return vm.runInContext(script, context); };
  context.__getReloadCount = function () { return reloadCount; };
  context.__getReplacedLocations = function () { return replacedLocations.slice(); };
  context.__getHostNavigations = function () { return hostNavigations.slice(); };
  context.__getDashboardConfigCommits = function () { return dashboardConfigCommits.slice(); };
  context.__runIntervals = function () { for (const callback of intervalCallbacks.slice()) callback(); };
  context.__pkceHostState = pkceHostState;
  return context;
}

module.exports = { createDashboardPreloadRuntime };
