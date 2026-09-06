"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createDocumentSession } = require("../plugin/document-session");

const PDF_URL = "https://app.immersivetranslate.com/pdf/";
const FILE_URL = "https://app.immersivetranslate.com/file/";
const PRELOAD = "/plugin/document-preload.js";

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

function pdfHandoff(name) {
  return {
    spec: { kind: "pdf", autoHandoff: true },
    file: { name: name },
  };
}

function openWorkspace(session, request) {
  const input = request && typeof request === "object" ? request : {};
  const documentWindow = input.window || fakeWindow();
  return session.open({
    url: input.url || PDF_URL,
    title: input.title || "PDF 翻译",
    spec: input.spec || { kind: "pdf", autoHandoff: !!input.file },
    file: input.file,
    preloadPath: Object.prototype.hasOwnProperty.call(input, "preloadPath") ? input.preloadPath : PRELOAD,
    createWindow: input.createWindow || function createWindow(options) {
      if (typeof input.onCreate === "function") input.onCreate(options);
      return documentWindow;
    },
    onLoadError: input.onLoadError,
  });
}

function pendingOverlay(session) {
  return session.handoffOverlayState(true);
}

test("open owns a new generation, spec, and optional handoff", () => {
  const session = createDocumentSession();
  const file = { path: "papers/example.pdf", name: "example.pdf" };
  const spec = { kind: "pdf", autoHandoff: true };
  const opened = openWorkspace(session, { spec, file });

  assert.equal(opened.ok, true);
  assert.equal(opened.generation, 1);
  assert.equal(session.generation(), 1);
  assert.equal(session.spec(), spec);
  assert.deepEqual(pendingOverlay(session), {
    pending: true,
    expectedFileName: "example.pdf",
  });
});

test("isCurrent matches the opened live window and generation", () => {
  const session = createDocumentSession();
  const documentWindow = fakeWindow();
  const opened = openWorkspace(session, { window: documentWindow, spec: { autoHandoff: false } });

  assert.equal(opened.ok, true);
  assert.equal(session.isCurrent(documentWindow), true);
  assert.equal(session.isCurrent(documentWindow, session.generation()), true);
  assert.equal(session.isCurrent(documentWindow, session.generation() + 1), false);
  assert.equal(session.isCurrent(fakeWindow()), false);
  assert.equal(session.isCurrent(null), false);
});

test("close invalidates work and returns the window for the host to destroy", () => {
  const session = createDocumentSession();
  const documentWindow = fakeWindow();
  let cancelled = 0;
  openWorkspace(session, { window: documentWindow, ...pdfHandoff("example.pdf") });
  session.setPdfDownloadSource({ generation: 1, absolutePath: "/vault/a.pdf" });
  session.setPendingDownload({
    generation: 1,
    capture: { cancel() { cancelled += 1; } },
  });

  assert.equal(session.close(), documentWindow);
  assert.equal(session.isCurrent(documentWindow), false);
  assert.deepEqual(pendingOverlay(session), { pending: false, expectedFileName: "" });
  assert.equal(session.pdfDownloadSource(), null);
  assert.equal(session.pendingDownload(), null);
  assert.equal(cancelled, 1);
  assert.equal(session.isCurrent(documentWindow, 1), false);
  assert.ok(session.generation() > 1);
});

test("handleClosed only clears the session that still owns the window", () => {
  const session = createDocumentSession();
  const first = fakeWindow();
  const second = fakeWindow();
  openWorkspace(session, { window: first, spec: { autoHandoff: false } });
  const generationAfterFirst = session.generation();

  assert.equal(session.handleClosed(second), false);
  assert.equal(session.isCurrent(first), true);
  assert.equal(session.generation(), generationAfterFirst);

  assert.equal(session.handleClosed(first), true);
  assert.equal(session.isCurrent(first), false);
  assert.ok(session.generation() > generationAfterFirst);
});

test("open creates an isolated document window", () => {
  const session = createDocumentSession();
  const created = [];
  const opened = openWorkspace(session, {
    spec: { kind: "pdf", autoHandoff: false },
    onCreate(options) { created.push(options); },
  });

  assert.equal(opened.ok, true);
  assert.equal(opened.reused, false);
  assert.equal(created.length, 1);
  assert.equal(created[0].webPreferences.nodeIntegration, false);
  assert.equal(created[0].webPreferences.contextIsolation, true);
  assert.equal(created[0].webPreferences.sandbox, false);
  assert.equal(created[0].webPreferences.webSecurity, true);
  assert.equal(created[0].webPreferences.preload, PRELOAD);
  assert.equal(created[0].title, "沉浸式翻译 - PDF 翻译");
  assert.deepEqual(opened.window.loaded, []);
});

test("open reuses a live window and loads the next workspace URL", () => {
  const session = createDocumentSession();
  const first = fakeWindow();
  openWorkspace(session, {
    window: first,
    url: PDF_URL,
    spec: { autoHandoff: false },
  });
  let created = 0;
  const opened = openWorkspace(session, {
    url: FILE_URL,
    spec: { autoHandoff: false },
    createWindow() { created += 1; return fakeWindow(); },
  });

  assert.equal(opened.ok, true);
  assert.equal(opened.reused, true);
  assert.equal(opened.window, first);
  assert.equal(created, 0);
  assert.equal(first.shown, true);
  assert.equal(first.focused, true);
  assert.deepEqual(first.loaded, [FILE_URL]);
  assert.ok(session.generation() > 1);
});

test("open without a preload path leaves a new session unattached", () => {
  const session = createDocumentSession();
  let created = 0;
  const opened = openWorkspace(session, {
    ...pdfHandoff("example.pdf"),
    preloadPath: undefined,
    createWindow() { created += 1; return fakeWindow(); },
  });

  assert.equal(opened.ok, false);
  assert.equal(opened.code, "preload_missing");
  assert.equal(created, 0);
  assert.deepEqual(pendingOverlay(session), { pending: false, expectedFileName: "" });
  assert.deepEqual(session.spec(), {});
});

test("open reports create_failed when the window factory throws", () => {
  const session = createDocumentSession();
  const opened = openWorkspace(session, {
    ...pdfHandoff("example.pdf"),
    createWindow() { throw new Error("no window"); },
  });

  assert.equal(opened.ok, false);
  assert.equal(opened.code, "create_failed");
  assert.deepEqual(pendingOverlay(session), { pending: false, expectedFileName: "" });
});

test("claimHandoffWhenIdle waits for an in-flight handoff before starting the next file", async () => {
  const session = createDocumentSession();
  let finishFirst;
  openWorkspace(session, pdfHandoff("first.pdf"));
  session.adoptHandoff(new Promise((resolve) => { finishFirst = resolve; }));
  openWorkspace(session, pdfHandoff("second.pdf"));

  let claimed = null;
  const pending = session.claimHandoffWhenIdle().then((value) => { claimed = value; return value; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(claimed, null);
  assert.deepEqual(pendingOverlay(session), {
    pending: true,
    expectedFileName: "second.pdf",
  });

  finishFirst(true);
  const result = await pending;
  assert.equal(result.file.name, "second.pdf");
  assert.equal(result.generation, session.generation());
});

test("a closed-window waiter does not claim the next document generation", async () => {
  const session = createDocumentSession();
  const firstWindow = fakeWindow();
  let finishFirst;
  openWorkspace(session, { window: firstWindow, ...pdfHandoff("first.pdf") });
  session.adoptHandoff(new Promise((resolve) => { finishFirst = resolve; }));
  openWorkspace(session, pdfHandoff("second.pdf"));

  const stale = session.claimHandoffWhenIdle(firstWindow);
  session.close();
  const thirdWindow = fakeWindow();
  openWorkspace(session, { window: thirdWindow, ...pdfHandoff("third.pdf") });

  finishFirst(true);
  assert.equal(await stale, null);

  const claimed = await session.claimHandoffWhenIdle(thirdWindow);
  assert.equal(claimed.file.name, "third.pdf");
  assert.equal(claimed.generation, session.generation());
  assert.equal(session.isCurrent(thirdWindow), true);
});

test("scheduleHandoffRetry repeats a transient failure until the attempt limit", async () => {
  const session = createDocumentSession();
  openWorkspace(session, pdfHandoff("example.pdf"));
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
  openWorkspace(session, pdfHandoff("example.pdf"));
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

test("scheduleRefresh keeps only the latest callback", () => {
  const pending = new Map();
  let nextId = 1;
  const session = createDocumentSession({
    setTimeout(fn) {
      const id = nextId++;
      pending.set(id, fn);
      return id;
    },
    clearTimeout(id) { pending.delete(id); },
  });
  const documentWindow = fakeWindow();
  const opened = openWorkspace(session, { window: documentWindow, spec: { autoHandoff: false } });
  const generation = opened.generation;
  const calls = [];

  assert.equal(session.scheduleRefresh(documentWindow, generation, 10, () => { calls.push("first"); }), true);
  assert.equal(session.scheduleRefresh(documentWindow, generation, 10, () => { calls.push("second"); }), true);
  assert.equal(pending.size, 1);
  for (const fn of pending.values()) fn();
  assert.deepEqual(calls, ["second"]);
});

test("scheduleRefresh drops callbacks after close or window reuse", () => {
  const queued = [];
  const session = createDocumentSession({
    setTimeout(fn) {
      queued.push(fn);
      return queued.length;
    },
    clearTimeout() {},
  });
  const first = fakeWindow();
  const opened = openWorkspace(session, { window: first, spec: { autoHandoff: false } });
  let ran = 0;
  session.scheduleRefresh(first, opened.generation, 0, () => { ran += 1; });
  session.close();
  queued.splice(0).forEach((fn) => fn());
  assert.equal(ran, 0);

  const reused = fakeWindow();
  const second = openWorkspace(session, { window: reused, spec: { autoHandoff: false } });
  session.scheduleRefresh(reused, second.generation, 0, () => { ran += 1; });
  openWorkspace(session, { window: reused, url: FILE_URL, spec: { autoHandoff: false } });
  queued.splice(0).forEach((fn) => fn());
  assert.equal(ran, 0);
});
