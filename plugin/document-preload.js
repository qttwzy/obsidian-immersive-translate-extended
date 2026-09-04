"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  DOCUMENT_HANDOFF_OVERLAY_ID,
  DOCUMENT_RUNTIME_ACTION_CHANNEL,
  DOCUMENT_RUNTIME_BRIDGE_KEY,
  DOCUMENT_RUNTIME_INIT_CHANNEL,
  DOCUMENT_RUNTIME_OVERLAY_CHANNEL,
  DOCUMENT_RUNTIME_REQUEST_CHANNEL,
  DOCUMENT_RUNTIME_STATUS_CHANNEL,
  DOCUMENT_RUNTIME_WORLD_ID,
  collectDocumentHandoffEvidence,
  resolveDocumentHandoffOverlay,
} = require("./document-runtime");

const IMT_API_HOSTS = new Set([
  "api.immersivetranslate.com",
  "api2.immersivetranslate.com",
  "aigw1.immersivetranslate.com",
]);
const UNSAFE_STORE_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const DEFAULT_REQUEST_TIMEOUT_MS = 30 * 1000;
const MAX_REQUEST_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_REQUEST_BODY_BYTES = 8 * 1024 * 1024;
const ACTION_TIMEOUT_MS = 10 * 1000;
const MAX_TRANSLATED_PDF_BYTES = 512 * 1024 * 1024;
const DOCUMENT_WORKSPACE_ORIGIN = "https://app.immersivetranslate.com";

let memoryStore = Object.create(null);
let authToken = "";
let authCookies = "";
let trusted = false;
let initialized = false;
let initWaiters = [];
let nextRequestId = 1;
let nextActionId = 1;
const requestNonce = crypto.randomBytes(8).toString("hex");
const pendingRequests = Object.create(null);
const pendingActions = Object.create(null);
const downloadStatusListeners = [];
let pendingTranslatedPdfCapture = null;
let translatedPdfCaptureActive = false;
let handoffOverlayPending = false;
let handoffOverlayFileName = "";
let handoffOverlayDismissedName = "";
let handoffOverlayHideTimer = null;
let handoffOverlayPollTimer = null;
const HANDOFF_OVERLAY_TIMEOUT_MS = 8 * 1000;
const HANDOFF_OVERLAY_POLL_MS = 250;

function cloneValue(value) {
  if (value === undefined || value === null || typeof value !== "object") return value;
  if (typeof globalThis.structuredClone === "function") {
    try { return globalThis.structuredClone(value); } catch (error) {}
  }
  try { return JSON.parse(JSON.stringify(value)); } catch (error) { return null; }
}

function replaceStore(input) {
  const next = Object.create(null);
  if (input && typeof input === "object" && !Array.isArray(input)) {
    Object.keys(input).forEach(function (key) {
      if (!UNSAFE_STORE_KEYS.has(key)) next[key] = cloneValue(input[key]);
    });
  }
  memoryStore = next;
}

function publicInitState() {
  return { trusted: trusted === true };
}

function resolveInitWaiters() {
  const state = publicInitState();
  const waiters = initWaiters;
  initWaiters = [];
  waiters.forEach(function (resolve) { resolve(state); });
}

ipcRenderer.on(DOCUMENT_RUNTIME_INIT_CHANNEL, function (_event, payload) {
  const input = payload && typeof payload === "object" ? payload : {};
  replaceStore(input.store);
  authToken = typeof input.authToken === "string" ? input.authToken : "";
  authCookies = typeof input.authCookies === "string" ? input.authCookies : "";
  trusted = input.trusted === true;
  initialized = true;
  if (input.overlay && typeof input.overlay === "object") applyHandoffOverlay(input.overlay);
  resolveInitWaiters();
});

ipcRenderer.on(DOCUMENT_RUNTIME_REQUEST_CHANNEL + ":response", function (_event, message) {
  if (!message || typeof message !== "object") return;
  const id = typeof message.id === "string" ? message.id : "";
  const pending = pendingRequests[id];
  if (!pending) return;
  delete pendingRequests[id];
  clearTimeout(pending.timeoutId);
  pending.resolve(message.payload && typeof message.payload === "object"
    ? message.payload
    : { ok: false, code: "invalid_host_response" });
});

ipcRenderer.on(DOCUMENT_RUNTIME_ACTION_CHANNEL + ":response", function (_event, message) {
  if (!message || typeof message !== "object") return;
  const id = typeof message.id === "string" ? message.id : "";
  const pending = pendingActions[id];
  if (!pending) return;
  delete pendingActions[id];
  clearTimeout(pending.timeoutId);
  pending.resolve(message.payload && typeof message.payload === "object"
    ? message.payload
    : { ok: false, code: "invalid_host_response" });
});

ipcRenderer.on(DOCUMENT_RUNTIME_STATUS_CHANNEL, function (_event, payload) {
  if (!payload || typeof payload !== "object") return;
  const allowedStates = new Set(["started", "completed", "cancelled", "failed", "timed_out"]);
  const state = typeof payload.state === "string" && allowedStates.has(payload.state) ? payload.state : "";
  if (!state) return;
  const status = {
    state,
    fileName: typeof payload.fileName === "string" ? payload.fileName.slice(0, 1024) : "",
  };
  downloadStatusListeners.slice().forEach(function (listener) {
    try { listener(status); } catch (error) {}
  });
});

ipcRenderer.on(DOCUMENT_RUNTIME_OVERLAY_CHANNEL, function (_event, payload) {
  applyHandoffOverlay(payload);
});

function waitForInit() {
  if (initialized) return Promise.resolve(publicInitState());
  return new Promise(function (resolve) { initWaiters.push(resolve); });
}

function getValue(key, fallback) {
  const normalized = String(key);
  return Object.prototype.hasOwnProperty.call(memoryStore, normalized)
    ? cloneValue(memoryStore[normalized])
    : cloneValue(fallback);
}

function setValue(key, value) {
  const normalized = String(key);
  if (UNSAFE_STORE_KEYS.has(normalized)) return false;
  memoryStore[normalized] = cloneValue(value);
  return true;
}

function deleteValue(key) {
  const normalized = String(key);
  if (UNSAFE_STORE_KEYS.has(normalized)) return false;
  return delete memoryStore[normalized];
}

function listValues() {
  return Object.keys(memoryStore);
}

function normalizeHeaders(input) {
  const headers = Object.create(null);
  if (!input || typeof input !== "object" || Array.isArray(input)) return headers;
  Object.keys(input).forEach(function (key) {
    const value = input[key];
    if (value !== undefined && value !== null && !UNSAFE_STORE_KEYS.has(key)) headers[String(key)] = String(value);
  });
  return headers;
}

function hasHeader(headers, name) {
  const target = String(name).toLowerCase();
  return Object.keys(headers).some(function (key) { return key.toLowerCase() === target; });
}

function normalizeRequestBody(body) {
  if (!body) return null;
  if (body.type === "text" && typeof body.data === "string") {
    if (Buffer.byteLength(body.data, "utf8") > MAX_REQUEST_BODY_BYTES) throw new TypeError("Request body is too large");
    return { type: "text", data: body.data };
  }
  if (body.type === "base64" && typeof body.data === "string") {
    if (body.data.length > Math.ceil(MAX_REQUEST_BODY_BYTES * 4 / 3) + 4) throw new TypeError("Request body is too large");
    return { type: "base64", data: body.data };
  }
  throw new TypeError("Unsupported request body");
}

function requestTimeout(value) {
  const requested = Number(value);
  if (!Number.isFinite(requested) || requested <= 0) return DEFAULT_REQUEST_TIMEOUT_MS;
  return Math.min(Math.floor(requested), MAX_REQUEST_TIMEOUT_MS);
}

async function request(options) {
  if (!initialized) return { ok: false, code: "init_required" };
  if (!trusted) return { ok: false, code: "untrusted_document" };

  const input = options && typeof options === "object" ? options : {};
  let url;
  try { url = new URL(String(input.url || "")); } catch (error) { return { ok: false, code: "invalid_url" }; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { ok: false, code: "invalid_url" };

  const headers = normalizeHeaders(input.headers);
  const hasExplicitAuth = hasHeader(headers, "authorization") || hasHeader(headers, "token") || hasHeader(headers, "cookie");
  if (!hasExplicitAuth && IMT_API_HOSTS.has(url.hostname.toLowerCase())) {
    if (authToken) headers.token = authToken;
    else if (authCookies) headers.Cookie = authCookies;
  }

  const method = String(input.method || "GET").toUpperCase();
  let body;
  try { body = method === "GET" || method === "HEAD" ? null : normalizeRequestBody(input.body); }
  catch (error) { return { ok: false, code: "invalid_body" }; }
  const timeout = requestTimeout(input.timeout);
  const id = "document-request-" + requestNonce + "-" + nextRequestId++;
  return new Promise(function (resolve) {
    const timeoutId = setTimeout(function () {
      if (!pendingRequests[id]) return;
      delete pendingRequests[id];
      resolve({ ok: false, code: "request_timeout" });
    }, timeout + 1000);
    pendingRequests[id] = { resolve, timeoutId };
    try {
      ipcRenderer.send(DOCUMENT_RUNTIME_REQUEST_CHANNEL, {
        id,
        request: { url: url.href, method, headers, body, timeout },
      });
    } catch (error) {
      delete pendingRequests[id];
      clearTimeout(timeoutId);
      resolve({ ok: false, code: "request_unavailable" });
    }
  });
}

function normalizeActionContext(action, input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  if (action === "prepare_translated_pdf_download") {
    return {
      fileName: typeof source.fileName === "string" ? source.fileName.slice(0, 1024) : "",
      title: typeof source.title === "string" ? source.title.slice(0, 2048) : "",
    };
  }
  const token = typeof source.token === "string" && /^[0-9a-f]{32}$/.test(source.token) ? source.token : "";
  if (action === "cancel_translated_pdf_download") return { token };
  return {
    token,
    ok: source.ok === true,
    fileName: typeof source.fileName === "string" ? source.fileName.slice(0, 1024) : "",
    byteLength: Number.isSafeInteger(source.byteLength) && source.byteLength >= 0 ? source.byteLength : 0,
    code: typeof source.code === "string" ? source.code.slice(0, 64) : "",
  };
}

function requestAction(action, context) {
  if (!initialized) return Promise.resolve({ ok: false, code: "init_required" });
  if (!trusted) return Promise.resolve({ ok: false, code: "untrusted_document" });
  const normalized = String(action || "");
  if (normalized !== "prepare_translated_pdf_download" && normalized !== "finish_translated_pdf_download" &&
      normalized !== "cancel_translated_pdf_download") {
    return Promise.resolve({ ok: false, code: "invalid_action" });
  }
  const id = "document-action-" + requestNonce + "-" + nextActionId++;
  return new Promise(function (resolve) {
    const timeoutId = setTimeout(function () {
      if (!pendingActions[id]) return;
      delete pendingActions[id];
      resolve({ ok: false, code: "action_timeout" });
    }, ACTION_TIMEOUT_MS);
    pendingActions[id] = { resolve, timeoutId };
    try {
      ipcRenderer.send(DOCUMENT_RUNTIME_ACTION_CHANNEL, { id, action: normalized, context: normalizeActionContext(normalized, context) });
    } catch (error) {
      delete pendingActions[id];
      clearTimeout(timeoutId);
      resolve({ ok: false, code: "action_unavailable" });
    }
  });
}

function privateCaptureTicket(input) {
  const ticket = input && input.captureTicket && typeof input.captureTicket === "object" ? input.captureTicket : null;
  if (!ticket || typeof ticket.token !== "string" || !/^[0-9a-f]{32}$/.test(ticket.token) ||
      typeof ticket.tempPath !== "string" || !path.isAbsolute(ticket.tempPath) || path.basename(ticket.tempPath) !== "capture.pdf" ||
      typeof ticket.sourceFileName !== "string" || !/\.pdf$/i.test(ticket.sourceFileName) || /[\\/]/.test(ticket.sourceFileName) ||
      !Number.isSafeInteger(ticket.maxBytes) || ticket.maxBytes <= 0 || ticket.maxBytes > MAX_TRANSLATED_PDF_BYTES) return null;
  return {
    token: ticket.token,
    tempPath: ticket.tempPath,
    sourceFileName: ticket.sourceFileName,
    maxBytes: ticket.maxBytes,
  };
}

async function prepareTranslatedPdfDownload(context) {
  const result = await requestAction("prepare_translated_pdf_download", context);
  const ticket = result && result.ok === true ? privateCaptureTicket(result) : null;
  if (!ticket) {
    pendingTranslatedPdfCapture = null;
    return result && result.ok !== true ? result : { ok: false, code: "invalid_capture_ticket" };
  }
  pendingTranslatedPdfCapture = ticket;
  return {
    ok: true,
    code: typeof result.code === "string" ? result.code : "download_armed",
    sourceFileName: ticket.sourceFileName,
  };
}

function cancelTranslatedPdfDownload() {
  const ticket = pendingTranslatedPdfCapture;
  pendingTranslatedPdfCapture = null;
  return requestAction("cancel_translated_pdf_download", { token: ticket && ticket.token || "" });
}

function officialTranslatedPdfBlobUrl(value) {
  const url = String(value || "");
  if (!url.startsWith("blob:")) return false;
  try { return new URL(url.slice(5)).origin === DOCUMENT_WORKSPACE_ORIGIN; }
  catch (error) { return false; }
}

function officialTranslatedPdfFileName(value, sourceFileName) {
  const fileName = String(value || "");
  const sourceStem = String(sourceFileName || "").replace(/\.pdf$/i, "");
  return !!fileName && fileName.length <= 1024 && path.basename(fileName) === fileName && /translated\.pdf$/i.test(fileName) &&
    !!sourceStem && fileName.toLowerCase().startsWith(sourceStem.toLowerCase() + "-");
}

async function captureTranslatedPdfBlobUrl(blobUrl, fileName) {
  if (!initialized) return { ok: false, code: "init_required" };
  if (!trusted) return { ok: false, code: "untrusted_document" };
  if (translatedPdfCaptureActive) return { ok: false, code: "capture_busy" };
  const ticket = pendingTranslatedPdfCapture;
  if (!ticket) return { ok: false, code: "capture_not_armed" };
  if (!officialTranslatedPdfBlobUrl(blobUrl) || !officialTranslatedPdfFileName(fileName, ticket.sourceFileName)) {
    return { ok: false, code: "invalid_pdf_export" };
  }

  translatedPdfCaptureActive = true;
  pendingTranslatedPdfCapture = null;
  let fileDescriptor = null;
  let byteLength = 0;
  let prefix = Buffer.alloc(0);
  let failureCode = "capture_failed";
  try {
    const response = await globalThis.fetch(String(blobUrl));
    if (!response || response.ok !== true) throw new Error("PDF Blob is unavailable");
    fileDescriptor = fs.openSync(ticket.tempPath, "wx", 0o600);
    const writeChunk = function (value) {
      const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || 0);
      if (bytes.byteLength === 0) return;
      byteLength += bytes.byteLength;
      if (byteLength > ticket.maxBytes) {
        failureCode = "pdf_too_large";
        throw new Error("Translated PDF exceeds the capture limit");
      }
      if (prefix.length < 5) {
        const needed = Math.min(5 - prefix.length, bytes.byteLength);
        prefix = Buffer.concat([prefix, Buffer.from(bytes.buffer, bytes.byteOffset, needed)]);
        if (prefix.length === 5 && prefix.toString("ascii") !== "%PDF-") {
          failureCode = "invalid_pdf_download";
          throw new Error("Captured file is not a PDF");
        }
      }
      fs.writeSync(fileDescriptor, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    };
    if (response.body && typeof response.body.getReader === "function") {
      const reader = response.body.getReader();
      while (true) {
        const part = await reader.read();
        if (!part || part.done) break;
        writeChunk(part.value);
      }
    } else if (typeof response.arrayBuffer === "function") {
      writeChunk(new Uint8Array(await response.arrayBuffer()));
    } else throw new Error("PDF Blob stream is unavailable");
    if (prefix.length !== 5 || prefix.toString("ascii") !== "%PDF-") {
      failureCode = "invalid_pdf_download";
      throw new Error("Captured file is not a PDF");
    }
    fs.fsyncSync(fileDescriptor);
    fs.closeSync(fileDescriptor);
    fileDescriptor = null;
    return await requestAction("finish_translated_pdf_download", {
      token: ticket.token,
      ok: true,
      fileName: String(fileName),
      byteLength,
    });
  } catch (error) {
    if (fileDescriptor !== null) {
      try { fs.closeSync(fileDescriptor); } catch (closeError) {}
      fileDescriptor = null;
    }
    try { fs.unlinkSync(ticket.tempPath); } catch (unlinkError) {}
    await requestAction("finish_translated_pdf_download", {
      token: ticket.token,
      ok: false,
      fileName: String(fileName || ""),
      byteLength,
      code: failureCode,
    });
    return { ok: false, code: failureCode };
  } finally {
    translatedPdfCaptureActive = false;
  }
}

function onTranslatedPdfDownloadStatus(listener) {
  if (typeof listener !== "function") return function () {};
  if (downloadStatusListeners.indexOf(listener) < 0) downloadStatusListeners.push(listener);
  return function () {
    const index = downloadStatusListeners.indexOf(listener);
    if (index >= 0) downloadStatusListeners.splice(index, 1);
  };
}

function currentHandoffOverlayEvidence() {
  return collectDocumentHandoffEvidence(globalThis.document, DOCUMENT_HANDOFF_OVERLAY_ID);
}

function stopHandoffOverlayPoll() {
  if (handoffOverlayPollTimer) {
    clearInterval(handoffOverlayPollTimer);
    handoffOverlayPollTimer = null;
  }
}

function hideHandoffOverlay() {
  if (handoffOverlayHideTimer) {
    clearTimeout(handoffOverlayHideTimer);
    handoffOverlayHideTimer = null;
  }
  stopHandoffOverlayPoll();
  const doc = globalThis.document;
  if (!doc || typeof doc.getElementById !== "function") return;
  const overlay = doc.getElementById(DOCUMENT_HANDOFF_OVERLAY_ID);
  if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
  const style = doc.getElementById(DOCUMENT_HANDOFF_OVERLAY_ID + "-style");
  if (style && style.parentNode) style.parentNode.removeChild(style);
}

function showHandoffOverlay(fileName) {
  const doc = globalThis.document;
  if (!doc || !doc.body || typeof doc.createElement !== "function") return false;
  let style = typeof doc.getElementById === "function" ? doc.getElementById(DOCUMENT_HANDOFF_OVERLAY_ID + "-style") : null;
  if (!style) {
    style = doc.createElement("style");
    style.id = DOCUMENT_HANDOFF_OVERLAY_ID + "-style";
    style.textContent =
      "#" + DOCUMENT_HANDOFF_OVERLAY_ID + "{" +
      "position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;" +
      "gap:10px;background:#16161a;color:#f4f4f5;font:15px/1.5 system-ui,sans-serif;letter-spacing:.01em}" +
      "#" + DOCUMENT_HANDOFF_OVERLAY_ID + " .imt-handoff-kicker{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#a1a1aa}" +
      "#" + DOCUMENT_HANDOFF_OVERLAY_ID + " .imt-handoff-message{max-width:28em;text-align:center;color:#e4e4e7}" +
      "#" + DOCUMENT_HANDOFF_OVERLAY_ID + " .imt-handoff-dismiss{margin-top:8px;padding:6px 12px;border:1px solid #52525b;border-radius:8px;" +
      "background:transparent;color:#e4e4e7;font:13px/1.4 system-ui,sans-serif;cursor:pointer}";
    (doc.head || doc.body).appendChild(style);
  }
  let overlay = typeof doc.getElementById === "function" ? doc.getElementById(DOCUMENT_HANDOFF_OVERLAY_ID) : null;
  if (!overlay) {
    overlay = doc.createElement("div");
    overlay.id = DOCUMENT_HANDOFF_OVERLAY_ID;
    overlay.setAttribute("role", "status");
    const kicker = doc.createElement("div");
    kicker.className = "imt-handoff-kicker";
    kicker.textContent = "PDF 翻译";
    const message = doc.createElement("div");
    message.className = "imt-handoff-message";
    overlay.appendChild(kicker);
    overlay.appendChild(message);
    const dismiss = doc.createElement("button");
    dismiss.type = "button";
    dismiss.className = "imt-handoff-dismiss";
    dismiss.textContent = "显示页面";
    if (typeof dismiss.addEventListener === "function") {
      dismiss.addEventListener("click", function () {
        handoffOverlayDismissedName = handoffOverlayFileName;
        handoffOverlayPending = false;
        hideHandoffOverlay();
      });
    }
    overlay.appendChild(dismiss);
    doc.body.appendChild(overlay);
  }
  const messageEl = overlay.querySelector ? overlay.querySelector(".imt-handoff-message") : overlay.lastChild;
  if (messageEl) {
    messageEl.textContent = "正在交接「" + fileName + "」";
  }
  return true;
}

function applyHandoffOverlay(input) {
  if (!input || typeof input !== "object") return null;
  const previousName = handoffOverlayFileName;
  handoffOverlayPending = input.pending === true;
  handoffOverlayFileName = typeof input.expectedFileName === "string" ? input.expectedFileName : "";
  if (!handoffOverlayPending) handoffOverlayDismissedName = "";
  const evidence = currentHandoffOverlayEvidence();
  const resolved = resolveDocumentHandoffOverlay({
    pending: handoffOverlayPending,
    expectedFileName: handoffOverlayFileName,
    title: evidence.title,
    bodyText: evidence.bodyText,
  });
  if (!resolved.visible) {
    handoffOverlayPending = false;
    hideHandoffOverlay();
    return resolved;
  }
  if (handoffOverlayDismissedName && handoffOverlayDismissedName === resolved.expectedFileName) {
    handoffOverlayPending = false;
    hideHandoffOverlay();
    return resolved;
  }
  if (handoffOverlayHideTimer && previousName !== resolved.expectedFileName) {
    clearTimeout(handoffOverlayHideTimer);
    handoffOverlayHideTimer = null;
  }
  if (!showHandoffOverlay(resolved.expectedFileName)) return resolved;
  if (!handoffOverlayPollTimer) {
    handoffOverlayPollTimer = setInterval(function () {
      if (!handoffOverlayPending) {
        stopHandoffOverlayPoll();
        return;
      }
      inspectHandoffOverlay();
    }, HANDOFF_OVERLAY_POLL_MS);
  }
  if (!handoffOverlayHideTimer) {
    handoffOverlayHideTimer = setTimeout(function () {
      handoffOverlayHideTimer = null;
      handoffOverlayDismissedName = resolved.expectedFileName;
      handoffOverlayPending = false;
      hideHandoffOverlay();
    }, HANDOFF_OVERLAY_TIMEOUT_MS);
  }
  return resolved;
}

function inspectHandoffOverlay() {
  if (!handoffOverlayPending) return;
  const evidence = currentHandoffOverlayEvidence();
  const resolved = resolveDocumentHandoffOverlay({
    pending: true,
    expectedFileName: handoffOverlayFileName,
    title: evidence.title,
    bodyText: evidence.bodyText,
  });
  if (!resolved.visible) {
    handoffOverlayPending = false;
    hideHandoffOverlay();
  }
}

contextBridge.exposeInIsolatedWorld(DOCUMENT_RUNTIME_WORLD_ID, DOCUMENT_RUNTIME_BRIDGE_KEY, {
  waitForInit,
  getValue,
  setValue,
  deleteValue,
  listValues,
  request,
  prepareTranslatedPdfDownload,
  cancelTranslatedPdfDownload,
  captureTranslatedPdfBlobUrl,
  onTranslatedPdfDownloadStatus,
});
