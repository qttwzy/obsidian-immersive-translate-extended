"use strict";

const { isActiveTranslationState, readActiveTranslationState } = require("./translation-state");

function createTranslationViewBridge(options = {}) {
  const document = options.document;
  const globalObject = options.globalObject || globalThis;
  const viewController = options.viewController;
  const MutationObserverClass = options.MutationObserver;
  const scheduleTimeout = options.setTimeout || setTimeout;
  const cancelTimeout = options.clearTimeout || clearTimeout;
  const retryDelayMs = options.retryDelayMs === undefined ? 100 : options.retryDelayMs;
  const maxReplayAttempts = options.maxReplayAttempts === undefined ? 30 : options.maxReplayAttempts;

  if (!document || !document.documentElement) throw new TypeError("document is required");
  for (const method of ["getActiveView", "getMode", "isConnected", "isReadingReady", "enterReading"]) {
    if (!viewController || typeof viewController[method] !== "function") {
      throw new TypeError("viewController." + method + " is required");
    }
  }

  let observer = null;
  let started = false;
  let reconcileTimer = null;
  let generation = 0;
  const replayTimers = new Set();
  const ownedViews = new Map();

  function translationState() {
    return readActiveTranslationState(document);
  }

  function activeMarkdownView() {
    try { return viewController.getActiveView(); } catch (error) { return null; }
  }

  function viewMode(view) {
    try { return String(viewController.getMode(view) || ""); } catch (error) { return ""; }
  }

  function isViewConnected(view) {
    try { return viewController.isConnected(view) !== false; } catch (error) { return false; }
  }

  function restoreView(view, record) {
    if (!record || !record.transition || typeof record.transition.restore !== "function") return;
    try {
      const result = record.transition.restore();
      if (result && typeof result.catch === "function") result.catch(function () {});
    } catch (error) {}
  }

  function scheduleReplay(view, state, record, attempt) {
    if (record.replayed || record.replayPending) return;
    record.replayPending = true;
    const expectedGeneration = generation;
    const timer = scheduleTimeout(function () {
      replayTimers.delete(timer);
      record.replayPending = false;
      if (!started || expectedGeneration !== generation || ownedViews.get(view) !== record) return;
      const currentState = translationState();
      if (!isActiveTranslationState(currentState)) return;
      if (currentState !== state) {
        record.state = currentState;
        record.replayed = false;
        scheduleReplay(view, currentState, record, 0);
        return;
      }

      let readingReady = false;
      try { readingReady = viewController.isReadingReady(view) === true; } catch (error) {}
      if (viewMode(view) !== "preview" || !readingReady) {
        if (attempt < maxReplayAttempts) scheduleReplay(view, state, record, attempt + 1);
        return;
      }

      if (record.replayed) return;
      const switchTranslationState = globalObject.immersiveTranslateSwitchTranslateState;
      if (typeof switchTranslationState !== "function") {
        if (attempt < maxReplayAttempts) scheduleReplay(view, state, record, attempt + 1);
        return;
      }
      try {
        const replay = switchTranslationState.call(globalObject, state);
        record.replayed = true;
        if (replay && typeof replay.catch === "function") replay.catch(function () {});
      } catch (error) {
        if (attempt < maxReplayAttempts) scheduleReplay(view, state, record, attempt + 1);
      }
    }, retryDelayMs);
    replayTimers.add(timer);
  }

  function restoreOwnedViews() {
    if (ownedViews.size === 0) return;
    generation++;
    const views = Array.from(ownedViews.entries());
    ownedViews.clear();
    for (const entry of views) {
      const view = entry[0]; const record = entry[1];
      if (!view || !isViewConnected(view) || viewMode(view) !== "preview") continue;
      restoreView(view, record);
    }
  }

  function reconcile() {
    if (!started) return false;
    const state = translationState();
    if (!isActiveTranslationState(state)) {
      restoreOwnedViews();
      return false;
    }

    const view = activeMarkdownView();
    if (!view || !isViewConnected(view)) return false;
    const existingRecord = ownedViews.get(view);
    if (existingRecord) {
      if (viewMode(view) === "preview" && !existingRecord.replayed) {
        existingRecord.state = state;
        scheduleReplay(view, state, existingRecord, 0);
      }
      return false;
    }
    if (viewMode(view) !== "source") return false;

    let transition = null;
    try { transition = viewController.enterReading(view); } catch (error) { return false; }
    if (!transition || typeof transition.restore !== "function") return false;
    const record = { state, replayed: false, replayPending: false, transition };
    ownedViews.set(view, record);
    scheduleReplay(view, state, record, 0);
    return true;
  }

  function queueReconcile() {
    if (!started || reconcileTimer !== null) return;
    reconcileTimer = scheduleTimeout(function () {
      reconcileTimer = null;
      reconcile();
    }, 0);
  }

  function start() {
    if (started) return true;
    started = true;
    if (typeof MutationObserverClass === "function") {
      observer = new MutationObserverClass(queueReconcile);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["imt-state"] });
      const workspace = document.querySelector(".workspace");
      if (workspace) observer.observe(workspace, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-mode"] });
    }
    reconcile();
    return true;
  }

  function stop() {
    if (!started) return;
    started = false;
    generation++;
    if (observer) observer.disconnect();
    observer = null;
    if (reconcileTimer !== null) cancelTimeout(reconcileTimer);
    reconcileTimer = null;
    for (const timer of replayTimers) cancelTimeout(timer);
    replayTimers.clear();

    // Restore after timers and observers are disabled so our own mode changes
    // cannot queue another translation transition during plugin unload.
    const views = Array.from(ownedViews.entries());
    ownedViews.clear();
    for (const entry of views) {
      const view = entry[0]; const record = entry[1];
      if (!view || !isViewConnected(view) || viewMode(view) !== "preview") continue;
      restoreView(view, record);
    }
  }

  return { start, stop, reconcile };
}

module.exports = { createTranslationViewBridge };
