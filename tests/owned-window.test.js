"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { presentWindow } = require("../plugin/owned-window");

test("presentWindow restores a minimized window then shows and focuses it", () => {
  const calls = [];
  presentWindow({
    isMinimized: () => true,
    restore: () => { calls.push("restore"); },
    show: () => { calls.push("show"); },
    focus: () => { calls.push("focus"); },
  });
  assert.deepEqual(calls, ["restore", "show", "focus"]);
});

test("presentWindow skips restore when the window is visible", () => {
  const calls = [];
  presentWindow({
    isMinimized: () => false,
    restore: () => { calls.push("restore"); },
    show: () => { calls.push("show"); },
    focus: () => { calls.push("focus"); },
  });
  assert.deepEqual(calls, ["show", "focus"]);
});

test("presentWindow ignores missing presentation methods", () => {
  assert.doesNotThrow(() => presentWindow({}));
});
