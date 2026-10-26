"use strict";

const { hostRegionForNode } = require("./host-ui-regions");

function createWindowRuntimeRecord(win) {
  return {
    win,
    active: false,
    observer: null,
    contentWatch: null,
    closed: false,
    onUnload: null,
    gmPolyfill: false,
    browserPolyfill: false,
    gmFetchPolyfill: false,
    engineLoaded: false,
    hostBridgeReady: null,
    nativeTitle: "",
    nativeTitleObserver: null,
    nativeTitleRestoreQueued: false,
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

function isTranslationOwnedNode(node, root) {
  for (let current = node; current && current !== root; current = current.parentNode) {
    const classes = typeof current.className === "string" ? current.className : "";
    if (/(?:^|\s)immersive-translate-/.test(classes) || current.id === "immersive-translate-popup") return true;
  }
  return false;
}

function changedHostRegions(mutations, root) {
  const regions = new Set();
  for (const mutation of mutations) {
    if (isTranslationOwnedNode(mutation.target, root)) continue;
    const nodes = mutation.type === "characterData" || mutation.type === "attributes"
      ? [mutation.target]
      : Array.from(mutation.addedNodes || []);
    for (const node of nodes) {
      if (isTranslationOwnedNode(node, root)) continue;
      if (node.nodeType === 3 && !String(node.nodeValue || "").trim()) continue;
      const region = hostRegionForNode(node, root);
      if (region) regions.add(region);
    }
  }
  return Array.from(regions);
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
    unwatchWindowContent(record.win);
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

  function cancelScheduledHostSurfacePoke() {
    if (!hostSurface) return false;
    if (hostSurface.pokeTimer && typeof hostSurface.clearTimeout === "function") {
      hostSurface.clearTimeout(hostSurface.pokeTimer);
    }
    hostSurface.pokeTimer = null;
    hostSurface.pokeToken = null;
    return true;
  }

  function unwatchHostSurfaces() {
    if (!disconnectWatch(hostSurface)) return false;
    hostSurface = null;
    return true;
  }

  function unwatchWindowContent(win) {
    const record = findRecord(win);
    if (!record || !record.contentWatch) return false;
    const watch = record.contentWatch;
    record.contentWatch = null;
    disconnectWatch(watch);
    return true;
  }

  function watchWindowContent(win, hooks = {}) {
    if (!win || win.closed || !win.document || !win.document.body) return false;
    const record = ledger.ensure(win);
    if (record.contentWatch) return false;
    const Observer = hooks.MutationObserver || win.MutationObserver;
    if (typeof Observer !== "function") return false;
    const schedule = hooks.setTimeout || setTimeout;
    const cancel = hooks.clearTimeout || clearTimeout;
    const root = win.document.body;
    const watch = { observer: null, pokeTimer: null, clearTimeout: cancel, token: null, regions: new Set() };
    const observer = new Observer((mutations) => {
      if (record.contentWatch !== watch || win.closed) return;
      if (hooks.onStateChange && mutations.some(m => m.type === "attributes" && m.target === win.document.documentElement && m.attributeName === "imt-state")) hooks.onStateChange();
      if (hooks.shouldPoke && !hooks.shouldPoke()) return;
      const regions = changedHostRegions(mutations, root);
      if (!regions.length) return;
      if (watch.pokeTimer) cancel(watch.pokeTimer);
      const intent = hooks.getIntent ? hooks.getIntent() : null;
      if (watch.intent !== intent) watch.regions.clear();
      watch.intent = intent;
      for (const region of regions) watch.regions.add(region);
      const token = {};
      watch.token = token;
      watch.pokeTimer = schedule(() => {
        if (record.contentWatch !== watch || watch.token !== token || win.closed) return;
        watch.pokeTimer = null;
        const changed = Array.from(watch.regions);
        watch.regions.clear();
        if (hooks.isIntentCurrent && !hooks.isIntentCurrent(intent)) return;
        if (hooks.shouldPoke && !hooks.shouldPoke()) return;
      if (hooks.poke) hooks.poke(changed);
      }, 160);
    });
    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "aria-selected", "aria-current", "data-active", "data-state"],
      });
      if (hooks.onStateChange && win.document.documentElement) observer.observe(win.document.documentElement, { attributes: true, attributeFilter: ["imt-state"] });
    }
    catch (error) { observer.disconnect(); return false; }
    watch.observer = observer;
    record.contentWatch = watch;
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
    const getIntent = typeof setup.input.getIntent === "function" ? setup.input.getIntent : null;
    const isIntentCurrent = typeof setup.input.isIntentCurrent === "function" ? setup.input.isIntentCurrent : null;
    const root = doc.body;
    const observer = new setup.Observer(function (mutations) {
      if (!hostSurface) return;
      if (typeof setup.input.shouldPoke === "function" && !setup.input.shouldPoke()) return;
      const regions = changedHostRegions(mutations, root);
      if (!regions.length) return;
      if (hostSurface.pokeTimer) clearTimeoutFn(hostSurface.pokeTimer);
      const scheduledIntent = getIntent ? getIntent() : null;
      if (hostSurface.intent !== scheduledIntent) hostSurface.regions.clear();
      hostSurface.intent = scheduledIntent;
      for (const region of regions) hostSurface.regions.add(region);
      const pokeToken = {};
      hostSurface.pokeToken = pokeToken;
      hostSurface.pokeTimer = setTimeoutFn(function () {
        if (!hostSurface || hostSurface.pokeToken !== pokeToken) return;
        hostSurface.pokeTimer = null;
        hostSurface.pokeToken = null;
        if (isIntentCurrent && !isIntentCurrent(scheduledIntent)) return;
        const changed = Array.from(hostSurface.regions);
        hostSurface.regions.clear();
        if (typeof setup.input.poke === "function") setup.input.poke(changed);
      }, pokeDelay);
    });
    try {
      observer.observe(doc.body, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["class", "aria-selected", "aria-current", "data-active", "data-state"],
      });
    } catch (error) {
      return false;
    }
    hostSurface = { observer, pokeTimer: null, pokeToken: null, clearTimeout: clearTimeoutFn, regions: new Set(), intent: null };
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
    watchWindowContent,
    unwatchWindowContent,
    unwatchHostSurfaces,
    cancelScheduledHostSurfacePoke,
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
