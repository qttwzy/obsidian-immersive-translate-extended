"use strict";

const { createGmElementApi } = require("./gm-element");
const { createGmHeaders } = require("./gm-headers");

const DOCUMENT_RUNTIME_WORLD_ID = 1001;
const DOCUMENT_RUNTIME_BRIDGE_KEY = "__imtDocumentRuntimeBridge";
const DOCUMENT_RUNTIME_INIT_CHANNEL = "imt-document-runtime:init";
const DOCUMENT_RUNTIME_REQUEST_CHANNEL = "imt-document-runtime:request";
const DOCUMENT_RUNTIME_ACTION_CHANNEL = "imt-document-runtime:action";
const DOCUMENT_RUNTIME_STATUS_CHANNEL = "imt-document-runtime:download-status";
const DOCUMENT_RUNTIME_OVERLAY_CHANNEL = "imt-document-runtime:handoff-overlay";
const DOCUMENT_RUNTIME_ENGINE_STATE_KEY = "__imtDocumentRuntimeEngineState";
const DOCUMENT_HANDOFF_OVERLAY_ID = "imt-document-handoff-overlay";

function collectDocumentHandoffEvidence(doc, overlayId) {
  const id = typeof overlayId === "string" && overlayId ? overlayId : DOCUMENT_HANDOFF_OVERLAY_ID;
  const title = doc && typeof doc.title === "string" ? doc.title : "";
  let bodyText = "";
  const children = doc && doc.body && doc.body.children;
  if (children && children.length) {
    for (let index = 0; index < children.length; index++) {
      const node = children[index];
      if (!node || node.id === id || node.id === id + "-style") continue;
      if (typeof node.innerText === "string") bodyText += node.innerText;
    }
  }
  return { title: title, bodyText: bodyText };
}

function createDocumentHandoffConfirmationSource(initialUrl) {
  return "function(expectedName) { var overlayId = " + JSON.stringify(DOCUMENT_HANDOFF_OVERLAY_ID) + "; var input = this; var assigned = input.files && input.files.length === 1 ? input.files[0].name : ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); return new Promise(function(resolve) { var deadline = Date.now() + 1600; function pageText() { var body = document.body; var text = ''; if (body && body.children) { for (var i = 0; i < body.children.length; i++) { var node = body.children[i]; if (!node || node.id === overlayId || node.id === overlayId + '-style') continue; if (typeof node.innerText === 'string') text += node.innerText; } } return text; } function inspect() { var text = pageText(); var state = { name: assigned, visibleFileName: !!expectedName && text.indexOf(expectedName) !== -1, titleFileName: !!expectedName && document.title.indexOf(expectedName) !== -1, navigated: location.href !== " + JSON.stringify(initialUrl) + " }; if (state.visibleFileName || state.titleFileName || state.navigated || Date.now() >= deadline) resolve(state); else setTimeout(inspect, 100); } inspect(); }); }";
}

function resolveDocumentHandoffOverlay(input) {
  const source = input && typeof input === "object" ? input : {};
  const pending = source.pending === true;
  const expectedFileName = typeof source.expectedFileName === "string" ? source.expectedFileName : "";
  const title = typeof source.title === "string" ? source.title : "";
  const bodyText = typeof source.bodyText === "string" ? source.bodyText : "";
  const fileName = expectedFileName.trim();
  if (!pending || !fileName) return { visible: false, code: "idle", expectedFileName: "" };
  if (title.indexOf(fileName) !== -1 || bodyText.indexOf(fileName) !== -1) {
    return { visible: false, code: "confirmed", expectedFileName: fileName };
  }
  return { visible: true, code: "pending", expectedFileName: fileName };
}

function runDocumentRuntimeBootstrap(options) {
  return (async function () {
    const bridge = globalThis[options.bridgeKey];
    if (!bridge || typeof bridge.waitForInit !== "function") {
      return { ok: false, code: "bridge_missing" };
    }
    const requiredBridgeMethods = ["getValue", "setValue", "deleteValue", "listValues", "request"];
    if (requiredBridgeMethods.some(function (name) { return typeof bridge[name] !== "function"; })) {
      return { ok: false, code: "bridge_incomplete" };
    }

    let initState;
    try {
      initState = await bridge.waitForInit();
    } catch (error) {
      return { ok: false, code: "init_failed" };
    }
    if (!initState || initState.trusted !== true) return { ok: false, code: "untrusted_document" };

    let downloadControlObserver = null;
    let downloadStatusSubscribed = false;
    let downloadControlRefreshPending = false;
    let downloadControlResetTimer = null;
    let translatedPdfCaptureArmed = false;
    let translatedPdfCaptureSourceFileName = "";
    let translatedPdfCaptureListenerInstalled = false;
    const downloadControlId = "imt-obsidian-save-translated-pdf";
    const defaultDownloadControlText = "保存译文 PDF 到源目录";
    const setDownloadControlState = function (text, disabled, resetDelay) {
      const documentObject = globalThis.document;
      const control = documentObject && typeof documentObject.getElementById === "function"
        ? documentObject.getElementById(downloadControlId)
        : null;
      if (!control) return;
      control.textContent = String(text || defaultDownloadControlText);
      control.disabled = disabled === true;
      control.style.opacity = control.disabled ? "0.72" : "1";
      control.style.cursor = control.disabled ? "progress" : "pointer";
      if (downloadControlResetTimer) {
        globalThis.clearTimeout(downloadControlResetTimer);
        downloadControlResetTimer = null;
      }
      if (Number(resetDelay) > 0) {
        downloadControlResetTimer = globalThis.setTimeout(function () {
          downloadControlResetTimer = null;
          setDownloadControlState(defaultDownloadControlText, false, 0);
        }, Number(resetDelay));
      }
    };
    const officialPdfDownloadControl = function () {
      const documentObject = globalThis.document;
      if (!documentObject || typeof documentObject.querySelectorAll !== "function") return null;
      const candidates = Array.from(documentObject.querySelectorAll("button,[role='button'],input[type='button'],input[type='submit']"));
      let hiddenFallback = null;
      for (let index = 0; index < candidates.length; index++) {
        const element = candidates[index];
        if (!element || element.id === downloadControlId || element.disabled === true || element.getAttribute && element.getAttribute("aria-disabled") === "true") continue;
        const label = String(
          element.getAttribute && (element.getAttribute("aria-label") || element.getAttribute("title")) ||
          element.value || element.textContent || ""
        ).replace(/\s+/g, "");
        if (!/翻译全部.*下载|translate.*all.*download/i.test(label)) continue;
        let visible = typeof element.getClientRects !== "function" || element.getClientRects().length > 0;
        if (typeof globalThis.getComputedStyle === "function") {
          const computed = globalThis.getComputedStyle(element);
          if (computed && (computed.display === "none" || computed.visibility === "hidden")) visible = false;
        }
        if (visible) return element;
        if (!hiddenFallback) hiddenFallback = element;
      }
      return hiddenFallback;
    };
    const currentPdfIdentity = function () {
      const documentObject = globalThis.document;
      let fileName = "";
      if (documentObject && typeof documentObject.querySelectorAll === "function") {
        const inputs = Array.from(documentObject.querySelectorAll("input[type='file']"));
        const input = inputs.find(function (candidate) {
          return candidate && candidate.files && candidate.files.length === 1 && /\.pdf$/i.test(String(candidate.files[0].name || ""));
        });
        if (input) fileName = String(input.files[0].name || "").slice(0, 1024);
      }
      return {
        fileName: fileName,
        title: documentObject && typeof documentObject.title === "string" ? documentObject.title.slice(0, 2048) : "",
      };
    };
    const translatedPdfExportAnchor = function (event) {
      let element = event && event.target;
      while (element && element !== globalThis.document) {
        if (String(element.tagName || "").toLowerCase() === "a") return element;
        element = element.parentNode;
      }
      return null;
    };
    const matchesTranslatedPdfExport = function (anchor) {
      if (!anchor) return false;
      const href = String(anchor.href || anchor.getAttribute && anchor.getAttribute("href") || "");
      const fileName = String(anchor.download || anchor.getAttribute && anchor.getAttribute("download") || "");
      if (!href.startsWith("blob:") || !fileName || fileName.length > 1024 || /[\\/]/.test(fileName) || !/translated\.pdf$/i.test(fileName)) return false;
      try {
        const blobOrigin = new URL(href.slice(5)).origin;
        if (blobOrigin !== globalThis.location.origin) return false;
      } catch (error) { return false; }
      const sourceName = String(translatedPdfCaptureSourceFileName || "");
      const sourceStem = sourceName.replace(/\.pdf$/i, "");
      return !!sourceStem && fileName.toLowerCase().startsWith(sourceStem.toLowerCase() + "-");
    };
    const installTranslatedPdfCaptureListener = function () {
      const documentObject = globalThis.document;
      if (translatedPdfCaptureListenerInstalled || !documentObject || typeof documentObject.addEventListener !== "function" ||
          typeof bridge.captureTranslatedPdfBlobUrl !== "function") return false;
      documentObject.addEventListener("click", function (event) {
        if (!translatedPdfCaptureArmed) return;
        const anchor = translatedPdfExportAnchor(event);
        if (!matchesTranslatedPdfExport(anchor)) return;
        translatedPdfCaptureArmed = false;
        const href = String(anchor.href || anchor.getAttribute && anchor.getAttribute("href") || "");
        const fileName = String(anchor.download || anchor.getAttribute && anchor.getAttribute("download") || "");
        if (event && typeof event.preventDefault === "function") event.preventDefault();
        if (event && typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
        setDownloadControlState("正在保存译文 PDF…", true, 0);
        try {
          Promise.resolve(bridge.captureTranslatedPdfBlobUrl(href, fileName)).then(function (result) {
            if (!result || result.ok !== true) setDownloadControlState("保存失败，请重试", false, 5000);
          }).catch(function () {
            setDownloadControlState("保存失败，请重试", false, 5000);
          });
        } catch (error) {
          setDownloadControlState("保存失败，请重试", false, 5000);
        }
      }, true);
      translatedPdfCaptureListenerInstalled = true;
      return true;
    };
    const confirmOfficialPdfTranslationImageDownload = function () {
      return new Promise(function (resolve) {
        const deadline = Date.now() + 8000;
        const inspect = function () {
          const documentObject = globalThis.document;
          if (!documentObject) { resolve(false); return; }
          const modal = typeof documentObject.getElementById === "function"
            ? documentObject.getElementById("download-pdf-modal-content")
            : null;
          if (!modal) {
            if (Date.now() >= deadline) { resolve(false); return; }
            globalThis.setTimeout(inspect, 80);
            return;
          }
          const translationOption = typeof modal.querySelector === "function"
            ? modal.querySelector("input[type='radio'][value='translation']")
            : null;
          const imageOption = typeof modal.querySelector === "function"
            ? modal.querySelector("input[type='radio'][value='img']")
            : null;
          if (!translationOption || translationOption.disabled || !imageOption || imageOption.disabled) { resolve(false); return; }
          if (!translationOption.checked) {
            try { translationOption.click(); } catch (error) { resolve(false); return; }
            if (Date.now() >= deadline) { resolve(false); return; }
            globalThis.setTimeout(inspect, 50);
            return;
          }
          if (!imageOption.checked) {
            try { imageOption.click(); } catch (error) { resolve(false); return; }
            if (Date.now() >= deadline) { resolve(false); return; }
            globalThis.setTimeout(inspect, 50);
            return;
          }
          const modalControls = typeof modal.querySelectorAll === "function"
            ? Array.from(modal.querySelectorAll("button,[role='button'],input[type='button'],input[type='submit']"))
            : [];
          const downloadButton = modalControls.find(function (element) {
            if (!element || element.disabled === true || element.getAttribute && element.getAttribute("aria-disabled") === "true") return false;
            const label = String(
              element.getAttribute && (element.getAttribute("aria-label") || element.getAttribute("title")) ||
              element.value || element.textContent || ""
            ).replace(/\s+/g, "");
            return /^(下载|download)$/i.test(label);
          });
          if (!downloadButton || typeof downloadButton.click !== "function") {
            if (Date.now() >= deadline) { resolve(false); return; }
            globalThis.setTimeout(inspect, 80);
            return;
          }
          try { downloadButton.click(); resolve(true); }
          catch (error) { resolve(false); }
        };
        inspect();
      });
    };
    const ensurePdfDownloadControl = function () {
      const documentObject = globalThis.document;
      if (!documentObject || !documentObject.body || typeof documentObject.createElement !== "function" ||
          typeof bridge.prepareTranslatedPdfDownload !== "function") return null;
      let control = typeof documentObject.getElementById === "function" ? documentObject.getElementById(downloadControlId) : null;
      if (!control) {
        control = documentObject.createElement("button");
        control.id = downloadControlId;
        control.type = "button";
        control.textContent = defaultDownloadControlText;
        control.setAttribute("aria-label", "保存翻译后的 PDF 到源文件夹");
        control.setAttribute("title", "调用官方仅译文图片版 PDF 导出，并保存到当前 Obsidian PDF 所在文件夹");
        control.style.position = "fixed";
        control.style.right = "24px";
        control.style.bottom = "24px";
        control.style.zIndex = "2147483000";
        control.style.padding = "10px 14px";
        control.style.border = "0";
        control.style.borderRadius = "8px";
        control.style.background = "#e83e8c";
        control.style.color = "#fff";
        control.style.fontSize = "14px";
        control.style.fontWeight = "600";
        control.style.boxShadow = "0 4px 14px rgba(0,0,0,.18)";
        control.style.cursor = "pointer";
        control.addEventListener("click", async function (event) {
          if (event && typeof event.preventDefault === "function") event.preventDefault();
          if (control.disabled) return;
          let officialControl = officialPdfDownloadControl();
          if (!officialControl) {
            setDownloadControlState("官方下载按钮尚未就绪", false, 3000);
            return;
          }
          setDownloadControlState("正在准备保存…", true, 0);
          let prepared;
          try { prepared = await bridge.prepareTranslatedPdfDownload(currentPdfIdentity()); }
          catch (error) { prepared = { ok: false, code: "download_bridge_failed" }; }
          if (!prepared || prepared.ok !== true) {
            const unavailable = prepared && prepared.code === "source_unavailable";
            setDownloadControlState(unavailable ? "请从 Obsidian 当前 PDF 打开" : "保存准备失败，请重试", false, 4000);
            return;
          }
          translatedPdfCaptureArmed = true;
          translatedPdfCaptureSourceFileName = typeof prepared.sourceFileName === "string" ? prepared.sourceFileName : "";
          officialControl = officialPdfDownloadControl();
          if (!officialControl || typeof officialControl.click !== "function") {
            translatedPdfCaptureArmed = false;
            if (typeof bridge.cancelTranslatedPdfDownload === "function") {
              try { await bridge.cancelTranslatedPdfDownload(); } catch (error) {}
            }
            setDownloadControlState("官方下载按钮已变化，请重试", false, 4000);
            return;
          }
          try {
            officialControl.click();
            const confirmed = await confirmOfficialPdfTranslationImageDownload();
            if (!confirmed) {
              translatedPdfCaptureArmed = false;
              if (typeof bridge.cancelTranslatedPdfDownload === "function") {
                try { await bridge.cancelTranslatedPdfDownload(); } catch (cancelError) {}
              }
              setDownloadControlState("导出选项未就绪，请重试", false, 5000);
              return;
            }
            setDownloadControlState("正在生成译文 PDF…", true, 0);
          } catch (error) {
            translatedPdfCaptureArmed = false;
            if (typeof bridge.cancelTranslatedPdfDownload === "function") {
              try { await bridge.cancelTranslatedPdfDownload(); } catch (cancelError) {}
            }
            setDownloadControlState("导出未启动，请重试", false, 4000);
          }
        });
        documentObject.body.appendChild(control);
      }
      return control;
    };
    const installPdfDownloadControl = function () {
      const documentObject = globalThis.document;
      if (!documentObject || typeof bridge.prepareTranslatedPdfDownload !== "function") return null;
      const control = ensurePdfDownloadControl();
      installTranslatedPdfCaptureListener();
      if (!downloadStatusSubscribed && typeof bridge.onTranslatedPdfDownloadStatus === "function") {
        downloadStatusSubscribed = true;
        bridge.onTranslatedPdfDownloadStatus(function (status) {
          const state = status && status.state;
          if (state === "started") setDownloadControlState("正在保存译文 PDF…", true, 0);
          else if (state === "completed") { translatedPdfCaptureArmed = false; setDownloadControlState("已保存到源文件夹", false, 5000); }
          else if (state === "cancelled") { translatedPdfCaptureArmed = false; setDownloadControlState("保存已取消", false, 4000); }
          else if (state === "timed_out") { translatedPdfCaptureArmed = false; setDownloadControlState("等待下载超时，请重试", false, 5000); }
          else if (state === "failed") { translatedPdfCaptureArmed = false; setDownloadControlState("保存失败，请重试", false, 5000); }
        });
      }
      if (!downloadControlObserver && typeof globalThis.MutationObserver === "function" && documentObject.documentElement) {
        downloadControlObserver = new globalThis.MutationObserver(function () {
          if (downloadControlRefreshPending) return;
          downloadControlRefreshPending = true;
          globalThis.setTimeout(function () {
            downloadControlRefreshPending = false;
            ensurePdfDownloadControl();
          }, 0);
        });
        downloadControlObserver.observe(documentObject.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "aria-disabled", "class", "hidden"] });
      }
      return control;
    };

    const existingEngine = globalThis[options.engineStateKey];
    if (existingEngine && existingEngine.loaded) {
      try {
        if (typeof existingEngine.ensurePdfDownloadControl === "function") existingEngine.ensurePdfDownloadControl();
        else installPdfDownloadControl();
      } catch (error) {}
      return {
        ok: true,
        code: "already_loaded",
        version: typeof existingEngine.userscriptVersion === "string" ? existingEngine.userscriptVersion : "",
      };
    }

    let nextValueListenerId = 1;
    const valueListeners = Object.create(null);
    const storageListeners = [];
    const emitStorageChange = function (key, oldValue, newValue) {
      let unchanged = false;
      try { unchanged = JSON.stringify(oldValue) === JSON.stringify(newValue); } catch (error) { unchanged = oldValue === newValue; }
      if (unchanged) return;
      Object.keys(valueListeners).forEach(function (id) {
        const listener = valueListeners[id];
        if (!listener || listener.key !== key) return;
        try { listener.callback(key, oldValue, newValue, false); } catch (error) {}
      });
      const changes = {}; changes[key] = { oldValue: oldValue, newValue: newValue };
      storageListeners.slice().forEach(function (listener) {
        try { listener(changes, "local"); } catch (error) {}
      });
    };
    const gmGetValue = function (key, fallback) { return bridge.getValue(String(key), fallback); };
    const gmSetValue = function (key, value) {
      const normalized = String(key);
      const previous = gmGetValue(normalized);
      bridge.setValue(normalized, value);
      emitStorageChange(normalized, previous, value);
    };
    const gmDeleteValue = function (key) {
      const normalized = String(key);
      const previous = gmGetValue(normalized);
      bridge.deleteValue(normalized);
      emitStorageChange(normalized, previous, undefined);
    };
    const gmListValues = function () { return bridge.listValues(); };
    const gmAddValueChangeListener = function (key, callback) {
      if (typeof callback !== "function") return 0;
      const id = nextValueListenerId++;
      valueListeners[id] = { key: String(key), callback: callback };
      return id;
    };
    const gmRemoveValueChangeListener = function (id) { return delete valueListeners[id]; };
    const gmHeaders = createGmHeaders();
    const headersToObject = gmHeaders.headersToObject;
    const hasHeader = gmHeaders.hasHeader;
    const getResponseHeader = gmHeaders.getResponseHeader;
    const responseHeadersToString = gmHeaders.responseHeadersToString;
    const bytesToBase64 = function (bytes) {
      let binary = "";
      const chunkSize = 0x8000;
      for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
        binary += String.fromCharCode.apply(null, bytes.subarray(offset, Math.min(offset + chunkSize, bytes.byteLength)));
      }
      return globalThis.btoa(binary);
    };
    const base64ToBytes = function (value) {
      const binary = globalThis.atob(String(value || ""));
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      return bytes;
    };
    const serializeRequestBody = async function (value, method, headers) {
      if (value === undefined || value === null || method === "GET" || method === "HEAD") return null;
      if (typeof value === "string") return { type: "text", data: value };
      if (typeof URLSearchParams !== "undefined" && value instanceof URLSearchParams) {
        if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
        return { type: "text", data: value.toString() };
      }
      if (typeof Blob !== "undefined" && value instanceof Blob) {
        return { type: "base64", data: bytesToBase64(new Uint8Array(await value.arrayBuffer())) };
      }
      if (value instanceof ArrayBuffer) return { type: "base64", data: bytesToBase64(new Uint8Array(value)) };
      if (ArrayBuffer.isView(value)) {
        return { type: "base64", data: bytesToBase64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
      }
      if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";
      return { type: "text", data: JSON.stringify(value) };
    };
    const bridgeResponseBytes = function (response) {
      if (response && typeof response.base64 === "string" && response.base64) return base64ToBytes(response.base64);
      return new TextEncoder().encode(response && typeof response.text === "string" ? response.text : "");
    };
    const bridgeResponseValue = function (response, responseType) {
      const type = String(responseType || "text").toLowerCase();
      const text = response && typeof response.text === "string" ? response.text : "";
      if (type === "json") return JSON.parse(text || "null");
      if (type === "arraybuffer") {
        const bytes = bridgeResponseBytes(response);
        return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
      if (type === "blob") {
        const bytes = bridgeResponseBytes(response);
        const contentType = getResponseHeader(response.headers, "content-type") || "application/octet-stream";
        return typeof Blob === "function"
          ? new Blob([bytes], { type: contentType })
          : bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      }
      if (type === "document" && typeof DOMParser === "function") {
        const mime = String(getResponseHeader(response.headers, "content-type")).toLowerCase().indexOf("html") >= 0
          ? "text/html"
          : "application/xml";
        return new DOMParser().parseFromString(text, mime);
      }
      return text;
    };
    const gmXmlHttpRequest = function (requestOptions) {
      const request = requestOptions || {};
      const method = String(request.method || "GET").toUpperCase();
      const headers = headersToObject(request.headers);
      let settled = false;
      const baseResponse = {
        status: 0,
        statusText: "",
        responseText: "",
        response: null,
        responseHeaders: "",
        finalUrl: String(request.url || ""),
        readyState: 1,
        context: request.context,
      };
      const invoke = function (name, payload) {
        try { if (typeof request[name] === "function") request[name](payload); } catch (error) {}
      };
      const finish = function (name, payload) {
        if (settled) return;
        settled = true;
        payload.readyState = 4;
        invoke("onreadystatechange", payload);
        invoke(name, payload);
      };
      const fail = function (name, code) {
        finish(name, Object.assign({}, baseResponse, { statusText: String(code || "request_failed") }));
      };

      invoke("onloadstart", baseResponse);
      invoke("onreadystatechange", baseResponse);
      Promise.resolve()
        .then(function () { return serializeRequestBody(request.data, method, headers); })
        .then(function (body) {
          if (settled) return null;
          return bridge.request({
            url: String(request.url || ""),
            method: method,
            headers: headers,
            body: body,
            timeout: request.timeout,
          });
        })
        .then(function (response) {
          if (settled || !response) return;
          if (response.ok !== true) {
            fail(response.code === "request_timeout" ? "ontimeout" : "onerror", response.code);
            return;
          }
          const responseType = String(request.responseType || "text").toLowerCase();
          const responseValue = bridgeResponseValue(response, responseType);
          const payload = {
            status: Number(response.status) || 0,
            statusText: String(response.statusText || ""),
            responseText: responseType === "text" || responseType === "" ? String(response.text || "") : "",
            response: Number(response.status) === 204 ? undefined : responseValue,
            responseHeaders: responseHeadersToString(response.headers || {}),
            finalUrl: String(response.finalUrl || request.url || ""),
            readyState: 4,
            context: request.context,
          };
          finish("onload", payload);
        })
        .catch(function () { fail("onerror", "request_failed"); });
      return { abort: function () { fail("onabort", "request_aborted"); } };
    };
    const makeFetchHeaders = function (headers) {
      const source = headers || {};
      return {
        get: function (name) {
          const target = String(name).toLowerCase();
          const key = Object.keys(source).find(function (candidate) { return candidate.toLowerCase() === target; });
          return key ? source[key] : null;
        },
        has: function (name) { return this.get(name) !== null; },
        forEach: function (callback) { Object.keys(source).forEach(function (key) { callback(source[key], key); }); },
        entries: function () { return Object.entries(source)[Symbol.iterator](); },
      };
    };
    const makeFetchResponse = function (response) {
      const bytes = bridgeResponseBytes(response);
      const text = typeof response.text === "string" ? response.text : new TextDecoder().decode(bytes);
      return {
        ok: Number(response.status) >= 200 && Number(response.status) < 300,
        status: Number(response.status) || 0,
        statusText: String(response.statusText || ""),
        url: String(response.finalUrl || ""),
        headers: makeFetchHeaders(response.headers || {}),
        text: async function () { return text; },
        json: async function () { return JSON.parse(text || "null"); },
        arrayBuffer: async function () { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); },
        blob: async function () {
          const type = this.headers.get("content-type") || "application/octet-stream";
          return typeof Blob === "function" ? new Blob([bytes], { type: type }) : bytes;
        },
      };
    };
    const gmFetch = async function (input, init) {
      const request = init && typeof init === "object" ? init : {};
      const inputIsRequest = typeof Request === "function" && input instanceof Request;
      const url = typeof input === "string" || (typeof URL !== "undefined" && input instanceof URL)
        ? String(input)
        : String(input && input.url || "");
      const method = String(request.method || input && input.method || "GET").toUpperCase();
      const headers = headersToObject(request.headers || input && input.headers);
      let requestBody = Object.prototype.hasOwnProperty.call(request, "body") ? request.body : undefined;
      if (requestBody === undefined && inputIsRequest && method !== "GET" && method !== "HEAD") {
        requestBody = await input.clone().arrayBuffer();
      }
      const body = await serializeRequestBody(requestBody, method, headers);
      const response = await bridge.request({ url: url, method: method, headers: headers, body: body, timeout: request.timeout });
      if (!response || response.ok !== true) throw new TypeError(response && response.code || "request_failed");
      return makeFetchResponse(response);
    };
    const manifest = {
      _isUserscript: true,
      _imtUserscriptVersion: options.userscriptVersion,
      name: "Immersive Translate",
      version: options.userscriptVersion,
    };
    const gmInfo = {
      platform: "electron-isolated-world",
      script: {
        _isUserscript: true,
        name: "Immersive Translate",
        namespace: "https://immersivetranslate.com",
        version: options.userscriptVersion,
      },
    };

    globalThis.GM_getValue = gmGetValue;
    globalThis.GM_setValue = gmSetValue;
    globalThis.GM_deleteValue = gmDeleteValue;
    globalThis.GM_listValues = gmListValues;
    globalThis.GM_addValueChangeListener = gmAddValueChangeListener;
    globalThis.GM_removeValueChangeListener = gmRemoveValueChangeListener;
    globalThis.GM_xmlhttpRequest = gmXmlHttpRequest;
    globalThis.GM_xmlHttpRequest = gmXmlHttpRequest;
    globalThis.GM_fetch = gmFetch;
    globalThis.GM_info = gmInfo;
    const gmElementApi = createGmElementApi(function () { return globalThis.document; });
    const gmAddElement = gmElementApi.addElement;
    const gmAddStyle = gmElementApi.addStyle;
    globalThis.GM_addStyle = gmAddStyle;
    globalThis.GM_openInTab = function (url) {
      if (typeof globalThis.open === "function") return globalThis.open(String(url || ""), "_blank");
      return null;
    };
    globalThis.GM_registerMenuCommand = function () { return 0; };
    globalThis.GM_addElement = gmAddElement;
    globalThis.GM = {
      info: gmInfo,
      getValue: gmGetValue,
      setValue: gmSetValue,
      deleteValue: gmDeleteValue,
      listValues: gmListValues,
      addValueChangeListener: gmAddValueChangeListener,
      removeValueChangeListener: gmRemoveValueChangeListener,
      xmlHttpRequest: gmXmlHttpRequest,
      xmlhttpRequest: gmXmlHttpRequest,
      fetch: gmFetch,
      addStyle: globalThis.GM_addStyle,
      openInTab: globalThis.GM_openInTab,
      registerMenuCommand: globalThis.GM_registerMenuCommand,
      addElement: globalThis.GM_addElement,
    };

    const storageArea = {
      get: async function (keys) {
        if (keys === null || keys === undefined) {
          const all = {};
          gmListValues().forEach(function (key) { all[key] = gmGetValue(key); });
          return all;
        }
        const list = typeof keys === "string" ? [keys] : (Array.isArray(keys) ? keys : Object.keys(keys));
        const result = {};
        list.forEach(function (key) {
          const fallback = keys && typeof keys === "object" && !Array.isArray(keys) ? keys[key] : undefined;
          result[key] = gmGetValue(key, fallback);
        });
        return result;
      },
      set: async function (values) {
        Object.keys(values || {}).forEach(function (key) { gmSetValue(key, values[key]); });
      },
      remove: async function (keys) {
        (Array.isArray(keys) ? keys : [keys]).forEach(function (key) { gmDeleteValue(key); });
      },
      clear: async function () { gmListValues().forEach(gmDeleteValue); },
    };
    globalThis.immersiveTranslateBrowserAPI = {
      storage: {
        local: storageArea,
        sync: storageArea,
        onChanged: {
          addListener: function (listener) { if (typeof listener === "function" && storageListeners.indexOf(listener) < 0) storageListeners.push(listener); },
          removeListener: function (listener) {
            const index = storageListeners.indexOf(listener);
            if (index >= 0) storageListeners.splice(index, 1);
          },
          hasListener: function (listener) { return storageListeners.indexOf(listener) >= 0; },
        },
      },
      runtime: {
        getManifest: function () { return manifest; },
        getURL: function (value) { return String(value || ""); },
        sendMessage: async function () { return { success: false, error: "unsupported_message" }; },
      },
      i18n: {
        getAcceptLanguages: async function () {
          return globalThis.navigator && Array.isArray(globalThis.navigator.languages)
            ? globalThis.navigator.languages.slice()
            : [globalThis.navigator && globalThis.navigator.language || ""];
        },
        detectLanguage: async function () { return "auto"; },
      },
    };

    let storedConfig = gmGetValue("fullLocalUserConfig", {});
    if (!storedConfig || typeof storedConfig !== "object" || Array.isArray(storedConfig)) storedConfig = {};
    const targetLanguage = typeof storedConfig.targetLanguage === "string" && storedConfig.targetLanguage
      ? storedConfig.targetLanguage
      : (typeof storedConfig.translationTargetLanguage === "string" && storedConfig.translationTargetLanguage
        ? storedConfig.translationTargetLanguage
        : options.defaultTargetLanguage);
    globalThis.IMMERSIVE_TRANSLATE_CONFIG = Object.assign({}, storedConfig, { targetLanguage: targetLanguage });
    globalThis.immersiveTranslateConfig = {
      partnerId: "immersive-translate-sdk",
      translationTargetLanguage: targetLanguage,
    };

    if (!options.userscriptPresent) return { ok: false, code: "userscript_missing" };
    try {
      /*__IMT_DOCUMENT_USERSCRIPT__*/
    } catch (error) {
      return { ok: false, code: "userscript_execution_failed" };
    }
    globalThis[options.engineStateKey] = {
      loaded: true,
      mode: "userscript",
      loadedAt: Date.now(),
      userscriptVersion: options.userscriptVersion,
      ensurePdfDownloadControl: installPdfDownloadControl,
    };
    installPdfDownloadControl();
    return { ok: true, code: "loaded", version: options.userscriptVersion };
  })();
}

function createDocumentRuntimeBootstrap(options) {
  const input = options || {};
  const userscriptSource = typeof input.userscriptSource === "string" ? input.userscriptSource : "";
  const payload = {
    bridgeKey: DOCUMENT_RUNTIME_BRIDGE_KEY,
    engineStateKey: DOCUMENT_RUNTIME_ENGINE_STATE_KEY,
    userscriptPresent: !!userscriptSource,
    userscriptVersion: typeof input.userscriptVersion === "string" ? input.userscriptVersion : "",
    defaultTargetLanguage: typeof input.defaultTargetLanguage === "string" && input.defaultTargetLanguage
      ? input.defaultTargetLanguage
      : "zh-CN",
  };
  const marker = "/*__IMT_DOCUMENT_USERSCRIPT__*/";
  const bootstrapSource = runDocumentRuntimeBootstrap.toString();
  if (bootstrapSource.split(marker).length !== 2) throw new Error("Document userscript marker is ambiguous");
  const executableBootstrap = bootstrapSource.replace(marker, function () {
    return "\n" + userscriptSource + "\n";
  });
  return "(function(createGmElementApi, createGmHeaders){return(" + executableBootstrap + ")(" + JSON.stringify(payload) + ");})(" + createGmElementApi.toString() + "," + createGmHeaders.toString() + ")";
}

module.exports = {
  DOCUMENT_HANDOFF_OVERLAY_ID,
  DOCUMENT_RUNTIME_ACTION_CHANNEL,
  DOCUMENT_RUNTIME_BRIDGE_KEY,
  DOCUMENT_RUNTIME_ENGINE_STATE_KEY,
  DOCUMENT_RUNTIME_INIT_CHANNEL,
  DOCUMENT_RUNTIME_OVERLAY_CHANNEL,
  DOCUMENT_RUNTIME_REQUEST_CHANNEL,
  DOCUMENT_RUNTIME_STATUS_CHANNEL,
  DOCUMENT_RUNTIME_WORLD_ID,
  collectDocumentHandoffEvidence,
  createDocumentHandoffConfirmationSource,
  createDocumentRuntimeBootstrap,
  resolveDocumentHandoffOverlay,
};
