"use strict";

function createWindowRuntimeRecord(win) {
  return {
    win,
    active: false,
    observer: null,
    closed: false,
    onUnload: null,
    gmPolyfill: false,
    browserPolyfill: false,
    gmFetchPolyfill: false,
    engineLoaded: false,
    userscriptVersion: "",
  };
}

function createWindowRuntimeLedger() {
  const records = [];

  function recordFor(win) {
    if (!win) return null;
    return records.find((record) => record.win === win) || null;
  }

  function ensure(win) {
    if (!win) return null;
    let record = recordFor(win);
    if (record) return record;
    record = createWindowRuntimeRecord(win);
    records.push(record);
    return record;
  }

  function remove(win) {
    const record = recordFor(win);
    if (!record) return false;
    records.splice(records.indexOf(record), 1);
    return true;
  }

  function resetPolyfills(win) {
    const record = recordFor(win);
    if (!record) return false;
    record.gmPolyfill = false;
    record.browserPolyfill = false;
    record.gmFetchPolyfill = false;
    return true;
  }

  function resetAllPolyfills() {
    records.forEach((record) => {
      record.gmPolyfill = false;
      record.browserPolyfill = false;
      record.gmFetchPolyfill = false;
    });
  }

  return { recordFor, ensure, remove, resetPolyfills, resetAllPolyfills };
}

const HOST_SURFACE_CLASS_NAMES = [
  "modal-container", "modal", "mod-settings", "mod-community-plugin", "mod-community-theme",
  "menu", "popover", "tooltip", "prompt", "community-item", "vertical-tab-header",
];

function isHostPopoutWindow(runtimeWindow) {
  try {
    const runtimeDocument = runtimeWindow && runtimeWindow.document;
    const body = runtimeDocument && runtimeDocument.body;
    if (!body) return false;
    if (body.classList && body.classList.contains("is-popout-modal")) return true;
    return !!(runtimeDocument.querySelector && runtimeDocument.querySelector(".mod-settings, .mod-community-plugin, .mod-community-theme"));
  } catch (error) {
    return false;
  }
}

function isHostSurfaceNode(node, root) {
  let current = node;
  while (current && current.nodeType === 1 && current !== root) {
    if (current.classList) {
      for (let i = 0; i < HOST_SURFACE_CLASS_NAMES.length; i++) {
        if (current.classList.contains(HOST_SURFACE_CLASS_NAMES[i])) return true;
      }
    }
    current = current.parentNode;
  }
  return false;
}

function createHostWindowRuntimeManager(options = {}) {
  const isHostWindow = typeof options.isHostWindow === "function" ? options.isHostWindow : isHostPopoutWindow;
  const activate = options.activate;
  const deactivate = typeof options.deactivate === "function" ? options.deactivate : function () {};
  const ledger = options.ledger || createWindowRuntimeLedger();
  const tracked = [];
  let translationState = null;
  let hostSurface = null;

  if (typeof activate !== "function") throw new TypeError("activate is required");

  function findRecord(win) {
    return ledger.recordFor(win);
  }

  function cleanup(record) {
    if (!record || record.closed) return;
    record.closed = true;
    if (record.observer) record.observer.disconnect();
    record.observer = null;
    try { record.win.removeEventListener("unload", record.onUnload); } catch (error) {}
    record.onUnload = null;
    if (record.active) {
      record.active = false;
      try { deactivate(record.win); } catch (error) {}
    }
    const index = tracked.indexOf(record);
    if (index >= 0) tracked.splice(index, 1);
    ledger.resetPolyfills(record.win);
    ledger.remove(record.win);
  }

  function inspect(record) {
    if (!record || record.active) return !!(record && record.active);
    try {
      if (record.win.closed || !isHostWindow(record.win)) return false;
      if (activate(record.win) !== true) return false;
      record.active = true;
      if (record.observer) record.observer.disconnect();
      record.observer = null;
      return true;
    } catch (error) {
      return false;
    }
  }

  function track(win) {
    if (!win || typeof win !== "object") return false;
    let record = findRecord(win);
    if (record && tracked.indexOf(record) >= 0) return true;
    record = ledger.ensure(win);
    if (tracked.indexOf(record) < 0) tracked.push(record);
    record.closed = false;
    if (!record.onUnload) {
      record.onUnload = () => cleanup(record);
      try { win.addEventListener("unload", record.onUnload, { once: true }); } catch (error) {}
      try {
        const Observer = win.MutationObserver;
        const doc = win.document;
        if (typeof Observer === "function" && doc && doc.documentElement) {
          record.observer = new Observer(() => inspect(record));
          record.observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
        }
      } catch (error) {}
    }
    inspect(record);
    return true;
  }

  function refresh() {
    tracked.slice().forEach(inspect);
  }

  function forEachActive(callback) {
    if (typeof callback !== "function") return;
    tracked.slice().forEach((record) => {
      if (record.active) callback(record.win);
    });
  }

  function mutationObserver(hooks, doc) {
    const input = hooks && typeof hooks === "object" ? hooks : {};
    const Observer = input.MutationObserver || (typeof MutationObserver === "function" ? MutationObserver : null);
    if (!doc || typeof Observer !== "function") return null;
    return { input, Observer };
  }

  function disconnectWatch(watch) {
    if (!watch) return false;
    if (watch.pokeTimer && typeof watch.clearTimeout === "function") {
      watch.clearTimeout(watch.pokeTimer);
    }
    if (watch.observer) {
      try { watch.observer.disconnect(); } catch (error) {}
    }
    return true;
  }

  function unwatchTranslationState() {
    if (!disconnectWatch(translationState)) return false;
    translationState = null;
    return true;
  }

  function watchTranslationState(hooks) {
    if (translationState) return false;
    const setup = mutationObserver(hooks, hooks && hooks.document);
    const doc = setup && setup.input.document;
    if (!setup || !doc || !doc.documentElement) return false;
    const observer = new setup.Observer(function (mutations) {
      if (!translationState) return;
      for (let i = 0; i < mutations.length; i++) {
        if (mutations[i].type === "attributes" && mutations[i].target === doc.documentElement && mutations[i].attributeName === "imt-state") {
          if (typeof setup.input.onStateChange === "function") setup.input.onStateChange();
          return;
        }
      }
    });
    try {
      observer.observe(doc.documentElement, { attributes: true, attributeFilter: ["imt-state"] });
    } catch (error) {
      return false;
    }
    translationState = { observer };
    return true;
  }

  function unwatchHostSurfaces() {
    if (!disconnectWatch(hostSurface)) return false;
    hostSurface = null;
    return true;
  }

  function watchHostSurfaces(hooks) {
    if (hostSurface) return false;
    const setup = mutationObserver(hooks, hooks && hooks.document);
    const doc = setup && setup.input.document;
    if (!setup || !doc || !doc.body) return false;
    const setTimeoutFn = typeof setup.input.setTimeout === "function" ? setup.input.setTimeout : setTimeout;
    const clearTimeoutFn = typeof setup.input.clearTimeout === "function" ? setup.input.clearTimeout : clearTimeout;
    const pokeDelay = Number.isFinite(setup.input.pokeDelay) ? setup.input.pokeDelay : 160;
    const root = doc.body;
    const observer = new setup.Observer(function (mutations) {
      if (!hostSurface) return;
      if (typeof setup.input.shouldPoke === "function" && !setup.input.shouldPoke()) return;
      let shouldPoke = false;
      for (let i = 0; i < mutations.length && !shouldPoke; i++) {
        const added = mutations[i].addedNodes || [];
        for (let n = 0; n < added.length; n++) {
          if (isHostSurfaceNode(added[n], root)) { shouldPoke = true; break; }
        }
      }
      if (!shouldPoke) return;
      if (hostSurface.pokeTimer) clearTimeoutFn(hostSurface.pokeTimer);
      hostSurface.pokeTimer = setTimeoutFn(function () {
        if (!hostSurface) return;
        hostSurface.pokeTimer = null;
        if (typeof setup.input.poke === "function") setup.input.poke();
      }, pokeDelay);
    });
    try {
      observer.observe(doc.body, { childList: true, subtree: true });
    } catch (error) {
      return false;
    }
    hostSurface = { observer, pokeTimer: null, clearTimeout: clearTimeoutFn };
    return true;
  }

  function stop() {
    unwatchHostSurfaces();
    unwatchTranslationState();
    tracked.slice().forEach(cleanup);
  }

  return {
    track,
    refresh,
    forEachActive,
    watchTranslationState,
    unwatchTranslationState,
    watchHostSurfaces,
    unwatchHostSurfaces,
    stop,
    ledger,
    recordFor: findRecord,
  };
}

module.exports = {
  createHostWindowRuntimeManager,
  createWindowRuntimeLedger,
  createWindowRuntimeRecord,
  isHostPopoutWindow,
  isHostSurfaceNode,
};
