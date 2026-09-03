"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createTranslationViewBridge } = require("../plugin/translation-view-bridge");

function createHarness({ mode = "source", state = "", ballActive = false, switchAvailable = true } = {}) {
  const scheduled = [];
  const observers = [];
  const switchCalls = [];
  const sourceDocument = { text: "# Original\n\nNever mutate me." };
  let readClicks = 0;
  let editClicks = 0;

  const content = {
    mode,
    isConnected: true,
  };
  const workspace = {};
  const popup = {
    shadowRoot: {
      querySelector(selector) { return selector === ".imt-fb-btn.active" && ballActive ? {} : null; },
    },
  };
  const documentElement = {
    getAttribute(name) { return name === "imt-state" ? state : null; },
  };
  const document = {
    documentElement,
    querySelector(selector) {
      if (selector === ".workspace") return workspace;
      if (selector === "#immersive-translate-popup") return popup;
      return null;
    },
  };
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
    observe() {}
    disconnect() { this.disconnected = true; }
  }
  const switchTranslationState = function (nextState) {
      switchCalls.push(nextState);
      return Promise.resolve();
  };
  const globalObject = {};
  if (switchAvailable) globalObject.immersiveTranslateSwitchTranslateState = switchTranslationState;
  const viewController = {
    getActiveView() { return content; },
    getMode(view) { return view.mode; },
    isConnected(view) { return view.isConnected; },
    isReadingReady(view) { return view.mode === "preview"; },
    enterReading(view) {
      readClicks++;
      view.mode = "preview";
      return {
        restore() {
          editClicks++;
          view.mode = "source";
        },
      };
    },
  };
  const bridge = createTranslationViewBridge({
    document,
    globalObject,
    viewController,
    MutationObserver: FakeMutationObserver,
    setTimeout(callback) { scheduled.push(callback); return scheduled.length; },
    clearTimeout() {},
  });

  return {
    bridge,
    content,
    observers,
    sourceDocument,
    switchCalls,
    get readClicks() { return readClicks; },
    get editClicks() { return editClicks; },
    setState(next) { state = next; },
    setBallActive(next) { ballActive = next; },
    setSwitchAvailable(next) {
      if (next) globalObject.immersiveTranslateSwitchTranslateState = switchTranslationState;
      else delete globalObject.immersiveTranslateSwitchTranslateState;
    },
    async flush() {
      while (scheduled.length > 0) scheduled.shift()();
      await Promise.resolve();
    },
    async flushOne() {
      if (scheduled.length > 0) scheduled.shift()();
      await Promise.resolve();
    },
  };
}

test("active translation moves source mode to a safe reading view and replays the same state", async () => {
  const harness = createHarness();
  harness.bridge.start();
  harness.setState("dual");

  harness.bridge.reconcile();
  await harness.flush();

  assert.equal(harness.content.mode, "preview");
  assert.equal(harness.readClicks, 1);
  assert.deepEqual(harness.switchCalls, ["dual"]);
  assert.equal(harness.sourceDocument.text, "# Original\n\nNever mutate me.");
});

test("translation-only mode is preserved and an owned view returns to source when translation stops", async () => {
  const harness = createHarness({ state: "translation" });
  harness.bridge.start();
  await harness.flush();

  assert.deepEqual(harness.switchCalls, ["translation"]);
  harness.setState("original");
  harness.bridge.reconcile();

  assert.equal(harness.content.mode, "source");
  assert.equal(harness.editClicks, 1);
});

test("a view that was already in reading mode is never claimed or restored", async () => {
  const harness = createHarness({ mode: "preview", state: "dual" });
  harness.bridge.start();
  await harness.flush();
  harness.setState("original");
  harness.bridge.reconcile();

  assert.equal(harness.readClicks, 0);
  assert.equal(harness.editClicks, 0);
  assert.deepEqual(harness.switchCalls, []);
});

test("a stale replay is cancelled when translation stops before reading mode is ready", async () => {
  const harness = createHarness({ state: "dual" });
  harness.bridge.start();
  harness.setState("original");
  harness.bridge.reconcile();
  await harness.flush();

  assert.deepEqual(harness.switchCalls, []);
  assert.equal(harness.content.mode, "source");
});

test("stop disconnects observers and restores only bridge-owned views", async () => {
  const harness = createHarness({ state: "dual" });
  harness.bridge.start();
  await harness.flush();
  harness.bridge.stop();

  assert.equal(harness.content.mode, "source");
  assert.equal(harness.editClicks, 1);
  assert.ok(harness.observers.every((observer) => observer.disconnected));
});

test("a stale active floating ball falls back to bilingual replay after plugin reload", async () => {
  const harness = createHarness({ ballActive: true });
  harness.bridge.start();
  await harness.flush();

  assert.equal(harness.content.mode, "preview");
  assert.deepEqual(harness.switchCalls, ["dual"]);
});

test("reading-mode replay waits until the translation state API is available", async () => {
  const harness = createHarness({ state: "dual", switchAvailable: false });
  harness.bridge.start();
  await harness.flushOne();
  harness.setSwitchAvailable(true);

  harness.bridge.reconcile();
  await harness.flush();

  assert.deepEqual(harness.switchCalls, ["dual"]);
});

test("a state change during the view transition replays only the latest translation mode", async () => {
  const harness = createHarness({ state: "dual" });
  harness.bridge.start();
  harness.setState("translation");
  harness.bridge.reconcile();
  await harness.flush();

  assert.deepEqual(harness.switchCalls, ["translation"]);
});

test("unknown imt-state values never activate the bridge", async () => {
  const harness = createHarness({ state: "toString" });
  harness.bridge.start();
  await harness.flush();

  assert.equal(harness.content.mode, "source");
  assert.equal(harness.readClicks, 0);
  assert.deepEqual(harness.switchCalls, []);
});
