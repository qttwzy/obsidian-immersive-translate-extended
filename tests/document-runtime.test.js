"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const RUNTIME_PATH = path.join(__dirname, "..", "plugin", "document-runtime.js");
const PRELOAD_PATH = path.join(__dirname, "..", "plugin", "document-preload.js");

const {
  DOCUMENT_HANDOFF_OVERLAY_ID,
  DOCUMENT_RUNTIME_BRIDGE_KEY,
  DOCUMENT_RUNTIME_ACTION_CHANNEL,
  DOCUMENT_RUNTIME_ENGINE_STATE_KEY,
  DOCUMENT_RUNTIME_INIT_CHANNEL,
  DOCUMENT_RUNTIME_OVERLAY_CHANNEL,
  DOCUMENT_RUNTIME_REQUEST_CHANNEL,
  DOCUMENT_RUNTIME_WORLD_ID,
  collectDocumentHandoffEvidence,
  createDocumentHandoffConfirmationSource,
  createDocumentRuntimeBootstrap,
  resolveDocumentHandoffOverlay,
} = require(RUNTIME_PATH);

function runBootstrap(source, globals) {
  const context = vm.createContext(Object.assign({
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
  }, globals || {}));
  context.globalThis = context;
  return { context, result: vm.runInContext(source, context) };
}

function runPreload(hostResponder, actionResponder, globals) {
  const source = fs.readFileSync(PRELOAD_PATH, "utf8");
  const handlers = {};
  const sent = [];
  let exposed = null;
  const environment = globals && typeof globals === "object" ? globals : {};
  const context = vm.createContext({
    Buffer,
    Uint8Array,
    URL,
    clearInterval,
    clearTimeout,
    document: environment.document,
    fetch: environment.fetch,
    location: environment.location,
    MutationObserver: environment.MutationObserver,
    setInterval,
    setTimeout,
    require(request) {
      if (request === "electron") {
        return {
          contextBridge: {
            exposeInIsolatedWorld(worldId, key, api) { exposed = { worldId, key, api }; },
          },
          ipcRenderer: {
            on(channel, handler) { handlers[channel] = handler; },
            send(channel, message) {
              sent.push({ channel, message: JSON.parse(JSON.stringify(message)) });
              const responder = channel === DOCUMENT_RUNTIME_ACTION_CHANNEL ? actionResponder : hostResponder;
              const input = channel === DOCUMENT_RUNTIME_ACTION_CHANNEL ? message.action : message.request;
              Promise.resolve(typeof responder === "function" ? responder(input, message.context) : { ok: false, code: "not_used" }).then((payload) => {
                handlers[channel + ":response"]({}, { id: message.id, payload });
              });
            },
          },
        };
      }
      if (request === "node:crypto") return require("node:crypto");
      if (request === "node:fs") return fs;
      if (request === "node:path") return path;
      if (request === "./document-runtime") return require(RUNTIME_PATH);
      throw new Error("Unexpected preload require: " + request);
    },
  });
  context.globalThis = context;
  vm.runInContext(source, context, { filename: PRELOAD_PATH });
  return { exposed, handlers, sent };
}

test("document runtime bootstrap fails closed when the isolated bridge is missing", async () => {
  const source = createDocumentRuntimeBootstrap({
    userscriptSource: "globalThis.__probeRan = true;",
    userscriptVersion: "1.2.3",
    defaultTargetLanguage: "zh-CN",
  });

  const execution = runBootstrap(source);
  const result = await execution.result;

  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: false, code: "bridge_missing" });
});

test("document runtime waits for trusted init, installs globals, and runs the userscript", async () => {
  const values = {
    fullLocalUserConfig: { targetLanguage: "fr", translationService: "openai" },
  };
  let initCalls = 0;
  const bridge = {
    async waitForInit() { initCalls++; return { trusted: true }; },
    getValue(key, fallback) { return Object.hasOwn(values, key) ? values[key] : fallback; },
    setValue(key, value) { values[key] = value; },
    deleteValue(key) { delete values[key]; },
    listValues() { return Object.keys(values); },
    async request() { throw new Error("not used"); },
  };
  const source = createDocumentRuntimeBootstrap({
    userscriptSource: [
      "// replacement tokens stay literal: $& $` $' $$",
      "globalThis.__documentRuntimeProbe = {",
      "  targetLanguage: globalThis.IMMERSIVE_TRANSLATE_CONFIG.targetLanguage,",
      "  legacyTargetLanguage: globalThis.immersiveTranslateConfig.translationTargetLanguage,",
      "  translationService: globalThis.IMMERSIVE_TRANSLATE_CONFIG.translationService,",
      "  manifestVersion: globalThis.immersiveTranslateBrowserAPI.runtime.getManifest().version,",
      "};",
    ].join("\n"),
    userscriptVersion: "1.2.3",
    defaultTargetLanguage: "zh-CN",
  });

  assert.doesNotMatch(source, /new Function/);
  assert.match(source, /globalThis\.__documentRuntimeProbe/);

  const execution = runBootstrap(source, {
    [DOCUMENT_RUNTIME_BRIDGE_KEY]: bridge,
    navigator: { language: "en-US", languages: ["en-US", "fr"] },
  });
  const result = await execution.result;

  assert.ok(DOCUMENT_RUNTIME_WORLD_ID >= 1000);
  assert.equal(initCalls, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, code: "loaded", version: "1.2.3" });
  assert.deepEqual(JSON.parse(JSON.stringify(execution.context.__documentRuntimeProbe)), {
    targetLanguage: "fr",
    legacyTargetLanguage: "fr",
    translationService: "openai",
    manifestVersion: "1.2.3",
  });
  assert.equal(execution.context[DOCUMENT_RUNTIME_ENGINE_STATE_KEY].loaded, true);
  assert.equal(execution.context[DOCUMENT_RUNTIME_ENGINE_STATE_KEY].userscriptVersion, "1.2.3");
});

test("document runtime adds one save control and delegates PDF export only after host approval", async () => {
  const order = [];
  let preparedIdentity = null;
  let capturedBlob = null;
  let pollDownloadControl = null;
  let documentClickListener = null;
  const elements = [];
  function makeElement(tagName) {
    const attributes = Object.create(null);
    const listeners = Object.create(null);
    const element = {
      tagName: String(tagName).toUpperCase(),
      id: "",
      textContent: "",
      disabled: false,
      style: {},
      children: [],
      parentNode: null,
      isConnected: true,
      appendChild(child) { child.parentNode = this; child.isConnected = true; this.children.push(child); },
      addEventListener(name, listener) { listeners[name] = listener; },
      dispatchEvent(event) { if (listeners[event.type]) return listeners[event.type].call(this, event); },
      setAttribute(name, value) { attributes[name] = String(value); },
      getAttribute(name) { return Object.hasOwn(attributes, name) ? attributes[name] : null; },
      getClientRects() { return [{}]; },
      querySelector(selector) {
        const descendants = this.children.flatMap(function visit(child) { return [child].concat(child.children.flatMap(visit)); });
        if (selector.includes("value='translation'")) return descendants.find((child) => child.tagName === "INPUT" && child.type === "radio" && child.value === "translation") || null;
        if (selector.includes("value='img'")) return descendants.find((child) => child.tagName === "INPUT" && child.type === "radio" && child.value === "img") || null;
        return null;
      },
      querySelectorAll() {
        const descendants = this.children.flatMap(function visit(child) { return [child].concat(child.children.flatMap(visit)); });
        return descendants.filter((child) => child.tagName === "BUTTON" || child.getAttribute("role") === "button");
      },
      click() {
        if (typeof this.onClick === "function") return this.onClick();
        order.push(this.id === "imt-obsidian-save-translated-pdf" ? "plugin-click" : "official-click");
      },
    };
    elements.push(element);
    return element;
  }
  const body = makeElement("body");
  const documentElement = makeElement("html");
  documentElement.appendChild(body);
  const official = makeElement("button");
  official.textContent = "翻译全部并下载";
  official.onClick = function () {
    order.push("official-click");
    const modal = makeElement("div");
    modal.id = "download-pdf-modal-content";
    const translationOption = makeElement("input");
    translationOption.type = "radio";
    translationOption.value = "translation";
    translationOption.checked = false;
    translationOption.onClick = function () { translationOption.checked = true; order.push("translation-click"); };
    const imageOption = makeElement("input");
    imageOption.type = "radio";
    imageOption.value = "img";
    imageOption.checked = false;
    imageOption.onClick = function () { imageOption.checked = true; order.push("image-click"); };
    const finalDownload = makeElement("button");
    finalDownload.textContent = "下载";
    finalDownload.onClick = function () {
      order.push("final-click");
      const anchor = makeElement("a");
      anchor.href = "blob:https://app.immersivetranslate.com/export-id";
      anchor.download = "example-ony-translated.pdf";
      anchor.parentNode = body;
      const event = {
        target: anchor,
        defaultPrevented: false,
        immediatePropagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopImmediatePropagation() { this.immediatePropagationStopped = true; },
      };
      if (documentClickListener) documentClickListener(event);
      if (!event.defaultPrevented) order.push("native-download");
    };
    modal.appendChild(translationOption);
    modal.appendChild(imageOption);
    modal.appendChild(finalDownload);
    body.appendChild(modal);
  };
  body.appendChild(official);
  const document = {
    body,
    documentElement,
    title: "example.pdf",
    createElement: makeElement,
    addEventListener(name, listener, capture) { if (name === "click" && capture === true) documentClickListener = listener; },
    getElementById(id) { return elements.find((element) => element.id === id && element.isConnected) || null; },
    querySelectorAll(selector) {
      if (String(selector).includes("input[type='file']")) return elements.filter((element) => element.tagName === "INPUT" && element.type === "file" && element.isConnected);
      return elements.filter((element) => element.tagName === "BUTTON" && element.isConnected);
    },
  };
  const bridge = {
    async waitForInit() { return { trusted: true }; },
    getValue(_key, fallback) { return fallback; },
    setValue() {},
    deleteValue() {},
    listValues() { return []; },
    async request() { throw new Error("not used"); },
    async prepareTranslatedPdfDownload(identity) { preparedIdentity = identity; order.push("prepare"); return { ok: true, sourceFileName: "example.pdf" }; },
    async cancelTranslatedPdfDownload() { order.push("cancel"); return { ok: true }; },
    async captureTranslatedPdfBlobUrl(url, fileName) { capturedBlob = { url, fileName }; order.push("capture-blob"); return { ok: true }; },
    onTranslatedPdfDownloadStatus() { return function () {}; },
  };
  const source = createDocumentRuntimeBootstrap({
    userscriptSource: "globalThis.__documentRuntimeProbe = true;",
    userscriptVersion: "1.2.3",
    defaultTargetLanguage: "zh-CN",
  });
  const execution = runBootstrap(source, {
    [DOCUMENT_RUNTIME_BRIDGE_KEY]: bridge,
    document,
    location: { origin: "https://app.immersivetranslate.com" },
    MutationObserver: class MutationObserver { observe() {} },
    setInterval(callback) { pollDownloadControl = callback; return 1; },
    getComputedStyle() { return { display: "block", visibility: "visible" }; },
    URL,
  });
  assert.equal((await execution.result).ok, true);
  const control = document.getElementById("imt-obsidian-save-translated-pdf");
  assert.ok(control);
  assert.equal(elements.filter((element) => element.id === control.id).length, 1);

  control.dispatchEvent({ type: "click", preventDefault() {} });
  await new Promise((resolve) => setTimeout(resolve, 180));
  assert.deepEqual(order, ["prepare", "official-click", "translation-click", "image-click", "final-click", "capture-blob"]);
  assert.deepEqual(JSON.parse(JSON.stringify(preparedIdentity)), { fileName: "", title: "example.pdf" });
  assert.deepEqual(capturedBlob, {
    url: "blob:https://app.immersivetranslate.com/export-id",
    fileName: "example-ony-translated.pdf",
  });

  control.isConnected = false;
  body.children = body.children.filter((element) => element !== control);
  assert.equal(document.getElementById("imt-obsidian-save-translated-pdf"), null);
  assert.equal(typeof pollDownloadControl, "function");
  pollDownloadControl();
  const restoredControl = document.getElementById("imt-obsidian-save-translated-pdf");
  assert.ok(restoredControl);
  assert.notEqual(restoredControl, control);
  pollDownloadControl();
  assert.equal(elements.filter((element) => element.id === control.id && element.isConnected).length, 1);
});

test("document runtime routes GM and browser storage through the isolated bridge", async () => {
  const values = { retained: "yes", removed: "old" };
  const bridge = {
    async waitForInit() { return { trusted: true }; },
    getValue(key, fallback) { return Object.hasOwn(values, key) ? values[key] : fallback; },
    setValue(key, value) { values[key] = value; },
    deleteValue(key) { delete values[key]; },
    listValues() { return Object.keys(values); },
    async request() { throw new Error("not used"); },
  };
  const source = createDocumentRuntimeBootstrap({
    userscriptSource: [
      "GM_setValue('created', { count: 2 });",
      "var listenerEvents = [];",
      "var listenerId = GM_addValueChangeListener('created', function (key, oldValue, newValue) { listenerEvents.push([key, oldValue.count, newValue.count]); });",
      "GM_setValue('created', { count: 3 });",
      "GM_removeValueChangeListener(listenerId);",
      "GM.deleteValue('removed');",
      "globalThis.__storageProbe = (async function () {",
      "  await immersiveTranslateBrowserAPI.storage.local.set({ browserValue: 7 });",
      "  var selected = await immersiveTranslateBrowserAPI.storage.local.get(['retained', 'created', 'browserValue']);",
      "  await immersiveTranslateBrowserAPI.storage.local.remove('browserValue');",
      "  return { selected: selected, keys: GM_listValues().sort(), missing: GM_getValue('missing', 'fallback'), listenerEvents: listenerEvents, hasStyleApi: typeof GM_addStyle === 'function', hasOpenApi: typeof GM_openInTab === 'function' };",
      "})();",
    ].join("\n"),
    userscriptVersion: "1.2.3",
    defaultTargetLanguage: "zh-CN",
  });

  const execution = runBootstrap(source, { [DOCUMENT_RUNTIME_BRIDGE_KEY]: bridge });
  const result = await execution.result;
  const probe = await execution.context.__storageProbe;

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(values)), { retained: "yes", created: { count: 3 } });
  assert.deepEqual(JSON.parse(JSON.stringify(probe)), {
    selected: { retained: "yes", created: { count: 3 }, browserValue: 7 },
    keys: ["created", "retained"],
    missing: "fallback",
    listenerEvents: [["created", 2, 3]],
    hasStyleApi: true,
    hasOpenApi: true,
  });
});

test("document runtime adapts bridge requests for GM_xmlhttpRequest and GM_fetch", async () => {
  const requests = [];
  const bridge = {
    async waitForInit() { return { trusted: true }; },
    getValue(key, fallback) { return fallback; },
    setValue() {},
    deleteValue() {},
    listValues() { return []; },
    async request(request) {
      requests.push(JSON.parse(JSON.stringify(request)));
      if (request.url.endsWith("/xhr")) {
        const text = JSON.stringify({ answer: 42 });
        return {
          ok: true,
          status: 201,
          statusText: "Created",
          finalUrl: request.url,
          headers: { "content-type": "application/json", "x-runtime": "xhr" },
          text,
          base64: Buffer.from(text, "utf8").toString("base64"),
        };
      }
      const text = "fetch-ok";
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        finalUrl: request.url,
        headers: { "content-type": "text/plain;charset=utf-8" },
        text,
        base64: Buffer.from(text, "utf8").toString("base64"),
      };
    },
  };
  const source = createDocumentRuntimeBootstrap({
    userscriptSource: [
      "globalThis.__xhrProbe = new Promise(function (resolve, reject) {",
      "  var events = [];",
      "  GM_xmlhttpRequest({",
      "    url: 'https://api2.immersivetranslate.com/xhr',",
      "    method: 'POST',",
      "    data: { question: 'life' },",
      "    responseType: 'json',",
      "    onloadstart: function () { events.push('loadstart'); },",
      "    onreadystatechange: function (response) { events.push('state:' + response.readyState); },",
      "    onload: function (response) { resolve({ events: events, status: response.status, response: response.response, responseHeaders: response.responseHeaders }); },",
      "    onerror: reject,",
      "  });",
      "});",
      "globalThis.__fetchProbe = GM_fetch('https://example.com/fetch', {",
      "  method: 'POST',",
      "  body: new Uint8Array([0, 1, 255]),",
      "}).then(async function (response) {",
      "  return { status: response.status, ok: response.ok, contentType: response.headers.get('Content-Type'), text: await response.text() };",
      "});",
      "globalThis.__requestObjectProbe = GM_fetch(new Request('https://example.com/request-object', { method: 'POST', body: 'request-body' })).then(function (response) { return response.text(); });",
    ].join("\n"),
    userscriptVersion: "1.2.3",
    defaultTargetLanguage: "zh-CN",
  });

  const execution = runBootstrap(source, {
    [DOCUMENT_RUNTIME_BRIDGE_KEY]: bridge,
    ArrayBuffer,
    Blob,
    Request,
    TextDecoder,
    TextEncoder,
    URL,
    URLSearchParams,
    atob(value) { return Buffer.from(value, "base64").toString("binary"); },
    btoa(value) { return Buffer.from(value, "binary").toString("base64"); },
  });
  const result = await execution.result;
  const xhrProbe = await execution.context.__xhrProbe;
  const fetchProbe = await execution.context.__fetchProbe;
  const requestObjectProbe = await execution.context.__requestObjectProbe;

  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(xhrProbe)), {
    events: ["loadstart", "state:1", "state:4"],
    status: 201,
    response: { answer: 42 },
    responseHeaders: "content-type: application/json\r\nx-runtime: xhr",
  });
  assert.deepEqual(JSON.parse(JSON.stringify(fetchProbe)), {
    status: 200,
    ok: true,
    contentType: "text/plain;charset=utf-8",
    text: "fetch-ok",
  });
  assert.equal(requestObjectProbe, "fetch-ok");
  const xhrRequest = requests.find((request) => request.url.endsWith("/xhr"));
  const fetchRequest = requests.find((request) => request.url.endsWith("/fetch"));
  const requestObject = requests.find((request) => request.url.endsWith("/request-object"));
  assert.deepEqual(xhrRequest.body, { type: "text", data: JSON.stringify({ question: "life" }) });
  assert.equal(xhrRequest.headers["Content-Type"], "application/json");
  assert.deepEqual(fetchRequest.body, { type: "base64", data: "AAH/" });
  assert.deepEqual(requestObject.body, { type: "base64", data: Buffer.from("request-body").toString("base64") });
});

test("document preload exposes only the isolated-world bridge", () => {
  const source = fs.readFileSync(PRELOAD_PATH, "utf8");

  assert.match(source, /contextBridge\.exposeInIsolatedWorld\s*\(/);
  assert.doesNotMatch(source, /exposeInMainWorld/);
  assert.match(source, /require\(["']electron["']\)/);
  assert.match(source, /DOCUMENT_RUNTIME_WORLD_ID/);
  assert.match(source, /DOCUMENT_RUNTIME_BRIDGE_KEY/);
  assert.match(source, /DOCUMENT_RUNTIME_INIT_CHANNEL/);
  assert.match(source, /DOCUMENT_RUNTIME_REQUEST_CHANNEL/);
  assert.match(source, /DOCUMENT_RUNTIME_ACTION_CHANNEL/);
});

test("document preload uses a dedicated action channel for translated PDF downloads", async () => {
  const actions = [];
  const contexts = [];
  const runtime = runPreload(
    async function () { return { ok: false, code: "not_used" }; },
    async function (action, context) {
      actions.push(action);
      contexts.push(context);
      return {
        ok: true,
        code: "download_armed",
        captureTicket: {
          token: "0".repeat(32),
          tempPath: path.join(path.parse(process.cwd()).root, ".imt-pdf-export-test", "capture.pdf"),
          sourceFileName: "paper.pdf",
          maxBytes: 1024 * 1024,
        },
      };
    },
  );
  runtime.handlers[DOCUMENT_RUNTIME_INIT_CHANNEL]({}, { trusted: true, store: {} });

  assert.deepEqual(
    JSON.parse(JSON.stringify(await runtime.exposed.api.prepareTranslatedPdfDownload({ fileName: "paper.pdf", title: "paper.pdf — 沉浸式翻译" }))),
    { ok: true, code: "download_armed", sourceFileName: "paper.pdf" },
  );
  assert.equal(runtime.sent[0].channel, DOCUMENT_RUNTIME_ACTION_CHANNEL);
  assert.equal(runtime.sent[0].message.action, "prepare_translated_pdf_download");
  assert.deepEqual(runtime.sent[0].message.context, { fileName: "paper.pdf", title: "paper.pdf — 沉浸式翻译" });
  assert.deepEqual(actions, ["prepare_translated_pdf_download"]);
  assert.deepEqual(JSON.parse(JSON.stringify(contexts)), [{ fileName: "paper.pdf", title: "paper.pdf — 沉浸式翻译" }]);
});

test("document preload streams one approved translated PDF Blob into its private capture file", async (t) => {
  const root = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "imt-preload-pdf-capture-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tempDirectory = path.join(root, ".imt-pdf-export-test");
  const tempPath = path.join(tempDirectory, "capture.pdf");
  fs.mkdirSync(tempDirectory);
  const token = "a".repeat(32);
  const actions = [];
  const runtime = runPreload(
    async function () { return { ok: false, code: "not_used" }; },
    async function (action, context) {
      actions.push({ action, context: JSON.parse(JSON.stringify(context)) });
      if (action === "prepare_translated_pdf_download") {
        return {
          ok: true,
          code: "download_armed",
          captureTicket: { token, tempPath, sourceFileName: "paper.pdf", maxBytes: 1024 * 1024 },
        };
      }
      if (action === "finish_translated_pdf_download") {
        assert.equal(fs.readFileSync(tempPath, "utf8"), "%PDF-translated");
        return { ok: true, code: "saved", fileName: "paper-译文.pdf" };
      }
      return { ok: false, code: "unexpected_action" };
    },
    {
      async fetch(url) {
        assert.equal(url, "blob:https://app.immersivetranslate.com/export-id");
        const chunks = [Buffer.from("%PD", "utf8"), Buffer.from("F-translated", "utf8")];
        return {
          ok: true,
          body: {
            getReader() {
              return {
                async read() {
                  if (chunks.length === 0) return { done: true };
                  return { done: false, value: new Uint8Array(chunks.shift()) };
                },
              };
            },
          },
        };
      },
    },
  );
  runtime.handlers[DOCUMENT_RUNTIME_INIT_CHANNEL]({}, { trusted: true, store: {} });

  const prepared = await runtime.exposed.api.prepareTranslatedPdfDownload({ fileName: "paper.pdf", title: "paper.pdf" });
  assert.deepEqual(JSON.parse(JSON.stringify(prepared)), {
    ok: true,
    code: "download_armed",
    sourceFileName: "paper.pdf",
  });
  assert.equal("captureTicket" in prepared, false);
  assert.deepEqual(
    JSON.parse(JSON.stringify(await runtime.exposed.api.captureTranslatedPdfBlobUrl(
      "blob:https://evil.example/export-id",
      "paper-dual-translated.pdf",
    ))),
    { ok: false, code: "invalid_pdf_export" },
  );

  const result = await runtime.exposed.api.captureTranslatedPdfBlobUrl(
    "blob:https://app.immersivetranslate.com/export-id",
    "paper-dual-translated.pdf",
  );
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { ok: true, code: "saved", fileName: "paper-译文.pdf" });
  assert.equal(actions.length, 2);
  assert.equal(actions[1].action, "finish_translated_pdf_download");
  assert.deepEqual(actions[1].context, {
    token,
    ok: true,
    fileName: "paper-dual-translated.pdf",
    byteLength: Buffer.byteLength("%PDF-translated"),
    code: "",
  });
  assert.deepEqual(
    JSON.parse(JSON.stringify(await runtime.exposed.api.captureTranslatedPdfBlobUrl(
      "blob:https://app.immersivetranslate.com/export-id",
      "paper-dual-translated.pdf",
    ))),
    { ok: false, code: "capture_not_armed" },
  );
});

test("document preload keeps init state in memory and scopes host-routed auth to IMT API hosts", async () => {
  const hostRequests = [];
  const responseBytes = Buffer.from("request-ok", "utf8");
  const runtime = runPreload(async function (request) {
    hostRequests.push(JSON.parse(JSON.stringify(request)));
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      finalUrl: request.url,
      headers: { "content-type": "text/plain" },
      text: "request-ok",
      base64: responseBytes.toString("base64"),
    };
  });

  assert.equal(runtime.exposed.worldId, DOCUMENT_RUNTIME_WORLD_ID);
  assert.equal(runtime.exposed.key, DOCUMENT_RUNTIME_BRIDGE_KEY);
  const initPromise = runtime.exposed.api.waitForInit();
  runtime.handlers[DOCUMENT_RUNTIME_INIT_CHANNEL]({}, {
    store: { fullLocalUserConfig: { targetLanguage: "de" } },
    authToken: "private-token",
    authCookies: "session=private-cookie",
    trusted: true,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(await initPromise)), { trusted: true });
  assert.deepEqual(JSON.parse(JSON.stringify(runtime.exposed.api.getValue("fullLocalUserConfig"))), { targetLanguage: "de" });

  const apiResponse = await runtime.exposed.api.request({
    url: "https://api2.immersivetranslate.com/v1/translate",
    method: "POST",
    body: { type: "base64", data: "AAH/" },
  });
  await runtime.exposed.api.request({ url: "https://example.com/public", method: "GET" });
  await runtime.exposed.api.request({
    url: "https://api2.immersivetranslate.com/v1/user",
    method: "GET",
    headers: { Authorization: "Bearer explicit" },
  });

  assert.equal(apiResponse.text, "request-ok");
  assert.equal(apiResponse.base64, responseBytes.toString("base64"));
  assert.equal(runtime.sent[0].channel, DOCUMENT_RUNTIME_REQUEST_CHANNEL);
  assert.equal(hostRequests[0].headers.token, "private-token");
  assert.deepEqual(hostRequests[0].body, { type: "base64", data: "AAH/" });
  assert.equal(hostRequests[1].headers.token, undefined);
  assert.equal(hostRequests[1].headers.Cookie, undefined);
  assert.equal(hostRequests[2].headers.Authorization, "Bearer explicit");
  assert.equal(hostRequests[2].headers.token, undefined);
  assert.equal(hostRequests[2].headers.Cookie, undefined);
});

test("PDF handoff overlay stays until the expected local file name is visible", () => {
  assert.deepEqual(resolveDocumentHandoffOverlay({ pending: false, expectedFileName: "paper.pdf" }), {
    visible: false,
    code: "idle",
    expectedFileName: "",
  });
  assert.deepEqual(resolveDocumentHandoffOverlay({
    pending: true,
    expectedFileName: "",
    title: "Sample PDF",
    bodyText: "Drag the local PDF file",
  }), {
    visible: false,
    code: "idle",
    expectedFileName: "",
  });
  assert.deepEqual(resolveDocumentHandoffOverlay({
    pending: true,
    expectedFileName: "paper.pdf",
    title: "Sample PDF",
    bodyText: "Drag the local PDF file",
  }), {
    visible: true,
    code: "pending",
    expectedFileName: "paper.pdf",
  });
  assert.deepEqual(resolveDocumentHandoffOverlay({
    pending: true,
    expectedFileName: "paper.pdf",
    title: "paper.pdf - Immersive Translate",
    bodyText: "Sample PDF",
  }), {
    visible: false,
    code: "confirmed",
    expectedFileName: "paper.pdf",
  });
});

test("document preload covers the official PDF shell until the local file is confirmed", () => {
  const nodes = new Map();
  const appendChild = function (child) {
    this.children.push(child);
    child.parentNode = this;
    if (child.id) nodes.set(child.id, child);
  };
  const removeChild = function (child) {
    this.children = this.children.filter((item) => item !== child);
    if (child && child.id) nodes.delete(child.id);
    if (child) child.parentNode = null;
  };
  const body = { children: [], appendChild, removeChild };
  const head = { children: [], appendChild, removeChild };
  const document = {
    title: "Sample PDF",
    body: Object.assign(body, { innerText: "Drag the local PDF file" }),
    documentElement: body,
    head,
    createElement(tagName) {
      return {
        tagName,
        id: "",
        className: "",
        textContent: "",
        innerText: "",
        children: [],
        querySelector(selector) {
          return this.children.find((child) => child.className && selector.includes(child.className)) || null;
        },
        setAttribute() {},
        addEventListener() {},
        appendChild(child) { this.children.push(child); },
      };
    },
    getElementById(id) { return nodes.get(id) || null; },
  };
  const runtime = runPreload(null, null, {
    document,
    location: { href: "https://app.immersivetranslate.com/pdf/" },
  });

  assert.equal(nodes.get(DOCUMENT_HANDOFF_OVERLAY_ID), undefined);

  runtime.handlers[DOCUMENT_RUNTIME_OVERLAY_CHANNEL]({}, {
    pending: true,
    expectedFileName: "",
  });
  assert.equal(nodes.get(DOCUMENT_HANDOFF_OVERLAY_ID), undefined);

  runtime.handlers[DOCUMENT_RUNTIME_OVERLAY_CHANNEL]({}, {
    pending: true,
    expectedFileName: "notes.pdf",
  });
  const overlay = nodes.get(DOCUMENT_HANDOFF_OVERLAY_ID);
  assert.match(overlay.children[1].textContent, /notes\.pdf/);
  overlay.innerText = overlay.children[1].textContent;
  runtime.handlers[DOCUMENT_RUNTIME_OVERLAY_CHANNEL]({}, {
    pending: true,
    expectedFileName: "notes.pdf",
  });
  assert.equal(nodes.get(DOCUMENT_HANDOFF_OVERLAY_ID), overlay);

  document.title = "notes.pdf";
  runtime.handlers[DOCUMENT_RUNTIME_OVERLAY_CHANNEL]({}, {
    pending: true,
    expectedFileName: "notes.pdf",
  });
  assert.equal(nodes.get(DOCUMENT_HANDOFF_OVERLAY_ID), undefined);
});

test("PDF handoff overlay chrome does not count as official page confirmation", () => {
  assert.deepEqual(collectDocumentHandoffEvidence({
    title: "sample-pdf - compressed.tracemonkey-pldi-09.pdf",
    body: {
      children: [
        { id: DOCUMENT_HANDOFF_OVERLAY_ID, innerText: "正在交接「IMT Translation QA-译文 (3).pdf」" },
        { id: DOCUMENT_HANDOFF_OVERLAY_ID + "-style", innerText: "" },
        { id: "viewer", innerText: "Sample PDF" },
      ],
    },
  }), {
    title: "sample-pdf - compressed.tracemonkey-pldi-09.pdf",
    bodyText: "Sample PDF",
  });

  const overlay = { id: DOCUMENT_HANDOFF_OVERLAY_ID, innerText: "正在交接「paper.pdf」" };
  const page = { id: "viewer", innerText: "Sample PDF" };
  let now = 0;
  const context = vm.createContext({
    Date: { now: () => now },
    setTimeout(fn) { now += 2000; fn(); },
    document: {
      title: "sample-pdf - compressed.tracemonkey-pldi-09.pdf",
      body: { children: [overlay, page] },
    },
    location: { href: "https://app.immersivetranslate.com/pdf/" },
    Event: function Event() {},
  });
  const inspect = vm.runInContext("(" + createDocumentHandoffConfirmationSource("https://app.immersivetranslate.com/pdf/") + ")", context);
  const input = { files: [{ name: "paper.pdf" }], dispatchEvent() {} };
  return inspect.call(input, "paper.pdf").then((state) => {
    assert.equal(state.visibleFileName, false);
    assert.equal(state.titleFileName, false);
    assert.equal(state.navigated, false);
    page.innerText = "paper.pdf";
    return inspect.call(input, "paper.pdf").then((confirmed) => {
      assert.equal(confirmed.visibleFileName, true);
    });
  });
});
