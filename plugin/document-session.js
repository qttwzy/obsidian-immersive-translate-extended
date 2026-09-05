"use strict";

function windowDestroyed(documentWindow) {
  if (!documentWindow) return true;
  try { return documentWindow.isDestroyed(); } catch (error) { return true; }
}

function presentWindow(documentWindow) {
  try {
    if (typeof documentWindow.isMinimized === "function" && documentWindow.isMinimized() && typeof documentWindow.restore === "function") {
      documentWindow.restore();
    }
  } catch (error) {}
  try { if (typeof documentWindow.show === "function") documentWindow.show(); } catch (error) {}
  try { if (typeof documentWindow.focus === "function") documentWindow.focus(); } catch (error) {}
}

function createDocumentWindowOptions(title, preloadPath) {
  return {
    width: 1040,
    height: 800,
    title: "沉浸式翻译 - " + String(title || "文档翻译"),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: preloadPath,
    },
  };
}

const RETRYABLE_HANDOFF_CODES = {
  handoff_state_unconfirmed: true,
  cdp_command_failed: true,
  document_unavailable: true,
  file_input_unavailable: true,
};

function createDocumentSession(options) {
  const clearTimeoutFn = options && options.clearTimeout ? options.clearTimeout : clearTimeout;
  let windowRef = null;
  let generation = 0;
  let spec = null;
  let handoffRequest = null;
  let handoffPromise = null;
  let runtimeFailureNoticeGeneration = 0;
  let pdfDownloadSource = null;
  let pendingPdfDownload = null;
  let runtimeRefreshTimer = null;

  function clearRefresh() {
    const timer = runtimeRefreshTimer;
    runtimeRefreshTimer = null;
    if (timer) clearTimeoutFn(timer);
    return !!timer;
  }

  function cancelPendingDownload() {
    const pending = pendingPdfDownload;
    pendingPdfDownload = null;
    if (pending && pending.capture && typeof pending.capture.cancel === "function") {
      try { Promise.resolve(pending.capture.cancel()).catch(function () {}); } catch (error) {}
    }
    return pending;
  }

  function resetWork(keepHandoffOperation) {
    handoffRequest = null;
    if (!keepHandoffOperation) handoffPromise = null;
    pdfDownloadSource = null;
    clearRefresh();
    cancelPendingDownload();
  }

  function pendingHandoff() {
    if (!handoffRequest) return null;
    return {
      generation: handoffRequest.generation,
      file: handoffRequest.file,
      spec: handoffRequest.spec,
    };
  }

  function expectedHandoffFileName() {
    if (!handoffRequest || !handoffRequest.file) return "";
    return String(handoffRequest.file.name || "").trim() || String(handoffRequest.file.path || "").split(/[\\/]/).pop() || "";
  }

  function handoffOverlayState(pending) {
    let isPending;
    if (pending === true) isPending = !!(handoffRequest && handoffRequest.file);
    else if (pending === false) isPending = false;
    else isPending = !!(handoffRequest && handoffRequest.file && handoffRequest.overlayActive !== false);
    return { pending: isPending, expectedFileName: isPending ? expectedHandoffFileName() : "" };
  }

  function setHandoffOverlay(pending) {
    if (!handoffRequest) return;
    if (pending === false) handoffRequest.overlayActive = false;
    else if (pending === true) handoffRequest.overlayActive = true;
  }

  function waitForHandoff() {
    const current = handoffPromise;
    if (!current) return Promise.resolve();
    return Promise.resolve(current).then(function () {}, function () {}).then(function () {
      if (handoffPromise && handoffPromise !== current) return waitForHandoff();
    });
  }

  function adoptHandoff(operation) {
    handoffPromise = operation;
    Promise.resolve(operation).then(function () {}, function () {}).then(function () {
      if (handoffPromise === operation) handoffPromise = null;
    });
    return operation;
  }

  function claimHandoffAttempt() {
    if (!handoffRequest || handoffRequest.started) return null;
    if (handoffPromise) return { wait: true };
    handoffRequest.started = true;
    handoffRequest.attempts = Number(handoffRequest.attempts || 0) + 1;
    return pendingHandoff();
  }

  function claimHandoffWhenIdle(documentWindow) {
    const expectedWindow = documentWindow === undefined ? windowRef : documentWindow;
    const expectedGeneration = generation;
    function belongsToWaiter() {
      if (generation !== expectedGeneration) return false;
      if (expectedWindow) return isCurrent(expectedWindow, expectedGeneration);
      return windowRef === null;
    }
    function next() {
      if (!belongsToWaiter()) return Promise.resolve(null);
      const claimed = claimHandoffAttempt();
      if (!claimed) return Promise.resolve(null);
      if (claimed.wait) return waitForHandoff().then(next);
      return Promise.resolve(claimed);
    }
    return next();
  }

  function scheduleHandoffRetry(code, expectedGeneration, scheduleTimeout, retry) {
    if (!RETRYABLE_HANDOFF_CODES[code]) return false;
    if (!handoffRequest || handoffRequest.generation !== expectedGeneration || handoffRequest.attempts >= 5) return false;
    if (typeof scheduleTimeout !== "function" || typeof retry !== "function") return false;
    handoffRequest.started = false;
    scheduleTimeout(function () {
      if (handoffRequest && handoffRequest.generation === expectedGeneration) retry();
    }, 300);
    return true;
  }

  function isCurrent(documentWindow, expectedGeneration) {
    if (!documentWindow || windowRef !== documentWindow || windowDestroyed(documentWindow)) return false;
    if (Number.isFinite(expectedGeneration) && expectedGeneration !== generation) return false;
    return true;
  }

  function begin(nextSpec, handoffFile) {
    generation += 1;
    spec = nextSpec || { autoHandoff: false };
    resetWork(true);
    if (spec.autoHandoff && handoffFile) {
      handoffRequest = { generation: generation, file: handoffFile, spec: spec, started: false, attempts: 0 };
    }
    return generation;
  }

  function attach(documentWindow) { windowRef = documentWindow; }

  function clearHandoff() { handoffRequest = null; }

  function abandonOpen() {
    handoffRequest = null;
    spec = null;
  }

  function open(request) {
    const input = request && typeof request === "object" ? request : {};
    const nextSpec = input.spec || { autoHandoff: false };
    const documentUrl = String(input.url || "");
    const expectedGeneration = begin(nextSpec, nextSpec.autoHandoff ? input.file : null);
    const existingWindow = windowRef;
    if (existingWindow && !windowDestroyed(existingWindow)) {
      presentWindow(existingWindow);
      try {
        const reusedLoad = existingWindow.loadURL(documentUrl);
        if (reusedLoad && typeof reusedLoad.catch === "function") {
          reusedLoad.catch(function () {
            if (!isCurrent(existingWindow, expectedGeneration)) return;
            clearHandoff();
            if (typeof input.onLoadError === "function") input.onLoadError();
          });
        }
      } catch (error) {
        if (generation === expectedGeneration) clearHandoff();
        if (typeof input.onLoadError === "function") input.onLoadError();
        return { ok: false, code: "load_failed", reused: true, window: existingWindow, generation: expectedGeneration };
      }
      return { ok: true, reused: true, window: existingWindow, generation: expectedGeneration };
    }
    if (!input.preloadPath) {
      abandonOpen();
      return { ok: false, code: "preload_missing", generation: expectedGeneration };
    }
    if (typeof input.createWindow !== "function") {
      abandonOpen();
      return { ok: false, code: "create_failed", generation: expectedGeneration };
    }
    let documentWindow;
    try {
      documentWindow = input.createWindow(createDocumentWindowOptions(input.title, input.preloadPath));
    } catch (error) {
      clearHandoff();
      return { ok: false, code: "create_failed", generation: expectedGeneration };
    }
    attach(documentWindow);
    return { ok: true, reused: false, window: documentWindow, generation: expectedGeneration };
  }

  return {
    window() { return windowRef; },
    generation() { return generation; },
    spec() { return spec || {}; },
    pendingHandoff,
    pdfDownloadSource() { return pdfDownloadSource; },
    pendingDownload() { return pendingPdfDownload; },
    isCurrent,
    begin,
    attach,
    open,
    clearHandoff,
    handoffOverlayState,
    setHandoffOverlay,
    waitForHandoff,
    adoptHandoff,
    claimHandoffWhenIdle,
    scheduleHandoffRetry,
    noteRuntimeFailure(expectedGeneration) {
      if (runtimeFailureNoticeGeneration === expectedGeneration) return false;
      runtimeFailureNoticeGeneration = expectedGeneration;
      return true;
    },
    setPdfDownloadSource(source) { pdfDownloadSource = source; },
    setRefreshTimer(timer) { runtimeRefreshTimer = timer; },
    isRefreshTimer(timer) { return runtimeRefreshTimer === timer; },
    clearRefresh,
    cancelPendingDownload,
    setPendingDownload(pending) { pendingPdfDownload = pending; },
    isPendingDownload(pending) { return pendingPdfDownload === pending; },
    abandonOpen,
    handleClosed(documentWindow) {
      if (windowRef !== documentWindow) return false;
      generation += 1;
      windowRef = null;
      spec = null;
      resetWork();
      return true;
    },
    close() {
      generation += 1;
      spec = null;
      resetWork();
      const documentWindow = windowRef;
      windowRef = null;
      return documentWindow;
    },
  };
}

module.exports = { createDocumentSession };
