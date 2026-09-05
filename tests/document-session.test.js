"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createDocumentSession } = require("../plugin/document-session");

function liveWindow() {
  return { isDestroyed() { return false; } };
}

test("begin owns a new generation, spec, and optional handoff", () => {
  const session = createDocumentSession();
  const file = { path: "papers/example.pdf", name: "example.pdf" };
  const spec = { kind: "pdf", autoHandoff: true };
  const generation = session.begin(spec, file);

  assert.equal(generation, 1);
  assert.equal(session.generation(), 1);
  assert.equal(session.spec(), spec);
  assert.deepEqual(session.pendingHandoff(), {
    generation: 1,
    file,
    spec,
  });
});

test("isCurrent matches the attached live window and generation", () => {
  const session = createDocumentSession();
  const documentWindow = liveWindow();
  session.begin({ autoHandoff: false });
  session.attach(documentWindow);

  assert.equal(session.isCurrent(documentWindow), true);
  assert.equal(session.isCurrent(documentWindow, session.generation()), true);
  assert.equal(session.isCurrent(documentWindow, session.generation() + 1), false);
  assert.equal(session.isCurrent(liveWindow()), false);
  assert.equal(session.isCurrent(null), false);
});

test("close invalidates work and returns the window for the host to destroy", () => {
  const session = createDocumentSession();
  const documentWindow = liveWindow();
  let cancelled = 0;
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "example.pdf" });
  session.attach(documentWindow);
  session.setPdfDownloadSource({ generation: 1, absolutePath: "/vault/a.pdf" });
  session.setPendingDownload({
    generation: 1,
    capture: { cancel() { cancelled += 1; } },
  });

  assert.equal(session.close(), documentWindow);
  assert.equal(session.window(), null);
  assert.equal(session.pendingHandoff(), null);
  assert.equal(session.pdfDownloadSource(), null);
  assert.equal(session.pendingDownload(), null);
  assert.equal(cancelled, 1);
  assert.equal(session.isCurrent(documentWindow, 1), false);
  assert.ok(session.generation() > 1);
});

test("handleClosed only clears the session that still owns the window", () => {
  const session = createDocumentSession();
  const first = liveWindow();
  const second = liveWindow();
  session.begin({ autoHandoff: false });
  session.attach(first);
  const generationAfterFirst = session.generation();

  assert.equal(session.handleClosed(second), false);
  assert.equal(session.window(), first);
  assert.equal(session.generation(), generationAfterFirst);

  assert.equal(session.handleClosed(first), true);
  assert.equal(session.window(), null);
  assert.ok(session.generation() > generationAfterFirst);
});

test("begin keeps an in-flight handoff until it settles", async () => {
  const session = createDocumentSession();
  let finishFirst;
  const firstOperation = new Promise((resolve) => { finishFirst = resolve; });
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "first.pdf" });
  session.adoptHandoff(firstOperation);

  const secondGeneration = session.begin({ kind: "pdf", autoHandoff: true }, { name: "second.pdf" });
  assert.equal(session.generation(), secondGeneration);
  assert.equal(session.pendingHandoff().file.name, "second.pdf");

  let idle = false;
  const waiting = session.waitForHandoff().then(function () { idle = true; });
  await Promise.resolve();
  assert.equal(idle, false);

  finishFirst(true);
  await waiting;
  assert.equal(idle, true);
});

function fakeWindow() {
  const loaded = [];
  return {
    loaded,
    shown: false,
    focused: false,
    destroyed: false,
    isDestroyed() { return this.destroyed; },
    show() { this.shown = true; },
    focus() { this.focused = true; },
    loadURL(url) { loaded.push(url); },
  };
}

test("open creates an isolated document window and attaches it", () => {
  const session = createDocumentSession();
  const created = [];
  const opened = session.open({
    url: "https://app.immersivetranslate.com/pdf/",
    title: "PDF 翻译",
    spec: { kind: "pdf", autoHandoff: false },
    preloadPath: "/plugin/document-preload.js",
    createWindow(options) {
      created.push(options);
      return fakeWindow();
    },
  });

  assert.equal(opened.ok, true);
  assert.equal(opened.reused, false);
  assert.equal(session.window(), opened.window);
  assert.equal(created.length, 1);
  assert.equal(created[0].webPreferences.nodeIntegration, false);
  assert.equal(created[0].webPreferences.contextIsolation, true);
  assert.equal(created[0].webPreferences.sandbox, false);
  assert.equal(created[0].webPreferences.webSecurity, true);
  assert.equal(created[0].webPreferences.preload, "/plugin/document-preload.js");
  assert.equal(created[0].title, "沉浸式翻译 - PDF 翻译");
  assert.deepEqual(opened.window.loaded, []);
});

test("open reuses a live window and loads the next workspace URL", () => {
  const session = createDocumentSession();
  const first = fakeWindow();
  session.open({
    url: "https://app.immersivetranslate.com/pdf/",
    spec: { autoHandoff: false },
    preloadPath: "/plugin/document-preload.js",
    createWindow() { return first; },
  });
  let created = 0;
  const opened = session.open({
    url: "https://app.immersivetranslate.com/file/",
    spec: { autoHandoff: false },
    preloadPath: "/plugin/document-preload.js",
    createWindow() { created += 1; return fakeWindow(); },
  });

  assert.equal(opened.ok, true);
  assert.equal(opened.reused, true);
  assert.equal(opened.window, first);
  assert.equal(created, 0);
  assert.equal(first.shown, true);
  assert.equal(first.focused, true);
  assert.deepEqual(first.loaded, ["https://app.immersivetranslate.com/file/"]);
  assert.ok(session.generation() > 1);
});

test("open without a preload path leaves a new session unattached", () => {
  const session = createDocumentSession();
  const opened = session.open({
    url: "https://app.immersivetranslate.com/pdf/",
    spec: { kind: "pdf", autoHandoff: true },
    file: { name: "example.pdf" },
    createWindow() { return fakeWindow(); },
  });

  assert.equal(opened.ok, false);
  assert.equal(opened.code, "preload_missing");
  assert.equal(session.window(), null);
  assert.equal(session.pendingHandoff(), null);
  assert.deepEqual(session.spec(), {});
});

test("open reports create_failed when the window factory throws", () => {
  const session = createDocumentSession();
  const opened = session.open({
    url: "https://app.immersivetranslate.com/pdf/",
    spec: { kind: "pdf", autoHandoff: true },
    file: { name: "example.pdf" },
    preloadPath: "/plugin/document-preload.js",
    createWindow() { throw new Error("no window"); },
  });

  assert.equal(opened.ok, false);
  assert.equal(opened.code, "create_failed");
  assert.equal(session.window(), null);
  assert.equal(session.pendingHandoff(), null);
});

test("claimHandoffWhenIdle waits for an in-flight handoff before starting the next file", async () => {
  const session = createDocumentSession();
  let finishFirst;
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "first.pdf" });
  session.adoptHandoff(new Promise((resolve) => { finishFirst = resolve; }));
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "second.pdf" });

  let claimed = null;
  const pending = session.claimHandoffWhenIdle().then((value) => { claimed = value; return value; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(claimed, null);

  finishFirst(true);
  const result = await pending;
  assert.equal(result.file.name, "second.pdf");
  assert.equal(result.generation, session.generation());
});

test("a closed-window waiter does not claim the next document generation", async () => {
  const session = createDocumentSession();
  const firstWindow = fakeWindow();
  let finishFirst;
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "first.pdf" });
  session.attach(firstWindow);
  session.adoptHandoff(new Promise((resolve) => { finishFirst = resolve; }));
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "second.pdf" });

  const stale = session.claimHandoffWhenIdle(firstWindow);
  session.close();
  const thirdWindow = fakeWindow();
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "third.pdf" });
  session.attach(thirdWindow);

  finishFirst(true);
  assert.equal(await stale, null);

  const claimed = await session.claimHandoffWhenIdle(thirdWindow);
  assert.equal(claimed.file.name, "third.pdf");
  assert.equal(claimed.generation, session.generation());
  assert.equal(session.window(), thirdWindow);
});

test("scheduleHandoffRetry repeats a transient failure until the attempt limit", async () => {
  const session = createDocumentSession();
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "example.pdf" });
  const generation = session.generation();
  let scheduled = 0;
  const scheduleTimeout = () => { scheduled += 1; };

  assert.equal(
    session.scheduleHandoffRetry("debugger_busy", generation, scheduleTimeout, () => {}),
    false
  );

  for (let attempt = 1; attempt <= 5; attempt++) {
    const claimed = await session.claimHandoffWhenIdle();
    assert.equal(claimed.file.name, "example.pdf");
    const retried = session.scheduleHandoffRetry("handoff_state_unconfirmed", generation, scheduleTimeout, () => {});
    assert.equal(retried, attempt < 5);
  }
  assert.equal(scheduled, 4);
  assert.equal(await session.claimHandoffWhenIdle(), null);
});

test("handoff overlay follows the pending file until it is cleared", () => {
  const session = createDocumentSession();
  session.begin({ kind: "pdf", autoHandoff: true }, { name: "example.pdf" });
  assert.deepEqual(session.handoffOverlayState(), {
    pending: true,
    expectedFileName: "example.pdf",
  });
  session.setHandoffOverlay(false);
  assert.deepEqual(session.handoffOverlayState(), {
    pending: false,
    expectedFileName: "",
  });
  session.setHandoffOverlay(true);
  assert.deepEqual(session.handoffOverlayState(true), {
    pending: true,
    expectedFileName: "example.pdf",
  });
  session.clearHandoff();
  assert.deepEqual(session.handoffOverlayState(true), {
    pending: false,
    expectedFileName: "",
  });
});
