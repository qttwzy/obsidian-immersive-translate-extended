"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  createHostWindowRuntimeManager,
  createWindowRuntimeLedger,
  isHostPopoutWindow,
  isHostSurfaceNode,
} = require("../plugin/host-window-runtime");

function createWindowHarness() {
  const observers = [];
  const listeners = Object.create(null);
  const body = {
    classList: {
      contains(name) { return name === "is-popout-modal" && body.popoutModal; },
    },
    popoutModal: false,
  };
  const document = {
    body,
    documentElement: {},
    querySelector() { return null; },
  };
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const win = {
    document,
    MutationObserver: FakeMutationObserver,
    closed: false,
    open() { return null; },
    addEventListener(name, callback) { listeners[name] = callback; },
    removeEventListener(name, callback) {
      if (listeners[name] === callback) delete listeners[name];
    },
  };
  return { body, listeners, observers, win };
}

test("a host popout is activated exactly once when its Obsidian modal document becomes ready", () => {
  const harness = createWindowHarness();
  const activated = [];
  const manager = createHostWindowRuntimeManager({
    isHostWindow(win) {
      return win.document.body.classList.contains("is-popout-modal");
    },
    activate(win) {
      activated.push(win);
      return true;
    },
  });

  assert.equal(manager.track(harness.win), true);
  assert.deepEqual(activated, []);

  harness.body.popoutModal = true;
  harness.observers[0].callback([]);
  manager.refresh();

  assert.deepEqual(activated, [harness.win]);
});

test("closing a host popout deactivates its runtime and removes it from synchronization", () => {
  const harness = createWindowHarness();
  harness.body.popoutModal = true;
  const deactivated = [];
  const activeWindows = [];
  const manager = createHostWindowRuntimeManager({
    isHostWindow(win) {
      return win.document.body.classList.contains("is-popout-modal");
    },
    activate() { return true; },
    deactivate(win) { deactivated.push(win); },
  });

  manager.track(harness.win);
  harness.listeners.unload();
  manager.forEachActive((win) => activeWindows.push(win));
  manager.stop();

  assert.deepEqual(deactivated, [harness.win]);
  assert.deepEqual(activeWindows, []);
  assert.ok(harness.observers.every((observer) => observer.disconnected));
});

test("a shared ledger owns polyfill and engine flags for each window", () => {
  const ledger = createWindowRuntimeLedger();
  const first = { id: "a" };
  const second = { id: "b" };

  const record = ledger.ensure(first);
  assert.equal(ledger.ensure(first), record);
  assert.equal(record.gmPolyfill, false);
  assert.equal(record.engineLoaded, false);
  assert.equal(record.userscriptVersion, "");

  record.gmPolyfill = true;
  record.engineLoaded = true;
  record.userscriptVersion = "9.7.3";
  ledger.resetPolyfills(first);
  assert.equal(record.gmPolyfill, false);
  assert.equal(record.engineLoaded, true);
  assert.equal(record.userscriptVersion, "9.7.3");
  assert.equal(ledger.recordFor(second), null);

  ledger.remove(first);
  assert.equal(ledger.recordFor(first), null);
});

test("the popout manager reuses the shared window record instead of creating a second one", () => {
  const harness = createWindowHarness();
  harness.body.popoutModal = true;
  const ledger = createWindowRuntimeLedger();
  const existing = ledger.ensure(harness.win);
  existing.gmPolyfill = true;
  const manager = createHostWindowRuntimeManager({
    ledger,
    isHostWindow() { return true; },
    activate() { return true; },
  });

  assert.equal(manager.track(harness.win), true);
  assert.equal(manager.recordFor(harness.win), existing);
  assert.equal(existing.gmPolyfill, true);
  assert.equal(existing.active, true);
});

function createClassList(names) {
  const set = new Set(names);
  return {
    contains(name) { return set.has(name); },
  };
}

function createElement(classNames, parentNode) {
  return {
    nodeType: 1,
    classList: createClassList(classNames),
    parentNode: parentNode || null,
  };
}

test("isHostPopoutWindow recognizes popout modals and settings or market documents", () => {
  assert.equal(isHostPopoutWindow(null), false);
  assert.equal(isHostPopoutWindow({ document: { body: { classList: createClassList([]) }, querySelector() { return null; } } }), false);

  assert.equal(isHostPopoutWindow({
    document: {
      body: { classList: createClassList(["is-popout-modal"]) },
      querySelector() { return null; },
    },
  }), true);

  assert.equal(isHostPopoutWindow({
    document: {
      body: { classList: createClassList([]) },
      querySelector(selector) {
        return selector === ".mod-settings, .mod-community-plugin, .mod-community-theme" ? { id: "settings" } : null;
      },
    },
  }), true);
});

test("the popout manager uses the shared popout recognition rule when none is supplied", () => {
  const harness = createWindowHarness();
  harness.body.popoutModal = true;
  const activated = [];
  const manager = createHostWindowRuntimeManager({
    activate(win) {
      activated.push(win);
      return true;
    },
  });

  assert.equal(manager.track(harness.win), true);
  assert.deepEqual(activated, [harness.win]);
});

test("isHostSurfaceNode walks ancestors for settings and market class names", () => {
  const root = createElement([]);
  const settings = createElement(["mod-settings"], root);
  const child = createElement(["vertical-tab-content"], settings);
  assert.equal(isHostSurfaceNode(child, root), true);
  assert.equal(isHostSurfaceNode(createElement(["markdown-preview-view"], root), root), false);
  assert.equal(isHostSurfaceNode(root, root), false);
});

function createMainSurfaceHarness() {
  const observations = [];
  const observers = [];
  class FakeMutationObserver {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      observers.push(this);
    }
    observe(target, options) {
      observations.push({ target, options });
    }
    disconnect() { this.disconnected = true; }
  }
  const body = createElement([]);
  const documentElement = {};
  return {
    FakeMutationObserver,
    observations,
    observers,
    document: { body, documentElement },
    body,
    documentElement,
  };
}

test("watchTranslationState notifies when the document imt-state attribute changes", () => {
  const harness = createMainSurfaceHarness();
  const stateChanges = [];
  const manager = createHostWindowRuntimeManager({ activate() { return true; } });

  assert.equal(manager.watchTranslationState({
    document: harness.document,
    MutationObserver: harness.FakeMutationObserver,
    onStateChange() { stateChanges.push("state"); },
  }), true);
  assert.equal(manager.watchTranslationState({
    document: harness.document,
    MutationObserver: harness.FakeMutationObserver,
  }), false);
  assert.equal(harness.observations.length, 1);
  assert.equal(harness.observations[0].target, harness.documentElement);
  assert.deepEqual(harness.observations[0].options, { attributes: true, attributeFilter: ["imt-state"] });

  harness.observers[0].callback([{
    type: "attributes",
    target: harness.documentElement,
    attributeName: "imt-state",
  }]);
  assert.deepEqual(stateChanges, ["state"]);
});

test("watchHostSurfaces pokes added settings and market nodes", () => {
  const harness = createMainSurfaceHarness();
  const pokes = [];
  const timers = [];
  let allowPoke = true;
  const manager = createHostWindowRuntimeManager({ activate() { return true; } });

  assert.equal(manager.watchHostSurfaces({
    document: harness.document,
    MutationObserver: harness.FakeMutationObserver,
    shouldPoke() { return allowPoke; },
    poke() { pokes.push("poke"); },
    pokeDelay: 160,
    setTimeout(fn) {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout() {},
  }), true);
  assert.equal(manager.watchHostSurfaces({
    document: harness.document,
    MutationObserver: harness.FakeMutationObserver,
  }), false);
  assert.equal(harness.observations.length, 1);
  assert.equal(harness.observations[0].target, harness.body);
  assert.deepEqual(harness.observations[0].options, { childList: true, subtree: true });

  harness.observers[0].callback([{
    addedNodes: [createElement(["mod-settings"], harness.body)],
  }]);
  assert.equal(timers.length, 1);
  timers[0]();
  assert.deepEqual(pokes, ["poke"]);

  allowPoke = false;
  timers.length = 0;
  harness.observers[0].callback([{
    addedNodes: [createElement(["menu"], harness.body)],
  }]);
  assert.equal(timers.length, 0);
});

test("host-surface watching can stop while translation-state watching continues", () => {
  const harness = createMainSurfaceHarness();
  const stateChanges = [];
  const manager = createHostWindowRuntimeManager({ activate() { return true; } });
  assert.equal(manager.watchTranslationState({
    document: harness.document,
    MutationObserver: harness.FakeMutationObserver,
    onStateChange() { stateChanges.push("state"); },
  }), true);
  assert.equal(manager.watchHostSurfaces({
    document: harness.document,
    MutationObserver: harness.FakeMutationObserver,
    poke() {},
  }), true);

  assert.equal(manager.unwatchHostSurfaces(), true);
  assert.equal(harness.observers[0].disconnected, false);
  assert.ok(harness.observers[1].disconnected);

  harness.observers[0].callback([{
    type: "attributes",
    target: harness.documentElement,
    attributeName: "imt-state",
  }]);
  assert.deepEqual(stateChanges, ["state"]);

  manager.stop();
  assert.ok(harness.observers[0].disconnected);
  assert.equal(manager.watchTranslationState({
    document: harness.document,
    MutationObserver: harness.FakeMutationObserver,
  }), true);
});
