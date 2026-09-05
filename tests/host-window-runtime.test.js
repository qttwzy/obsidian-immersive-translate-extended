"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createHostWindowRuntimeManager } = require("../plugin/host-window-runtime");

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
