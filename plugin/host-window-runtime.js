"use strict";

function createHostWindowRuntimeManager(options = {}) {
  const isHostWindow = options.isHostWindow;
  const activate = options.activate;
  const deactivate = typeof options.deactivate === "function" ? options.deactivate : function () {};
  const records = [];

  if (typeof isHostWindow !== "function") throw new TypeError("isHostWindow is required");
  if (typeof activate !== "function") throw new TypeError("activate is required");

  function findRecord(win) {
    return records.find((record) => record.win === win) || null;
  }

  function cleanup(record) {
    if (!record || record.closed) return;
    record.closed = true;
    if (record.observer) record.observer.disconnect();
    record.observer = null;
    try { record.win.removeEventListener("unload", record.onUnload); } catch (error) {}
    if (record.active) {
      record.active = false;
      try { deactivate(record.win); } catch (error) {}
    }
    const index = records.indexOf(record);
    if (index >= 0) records.splice(index, 1);
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
    if (findRecord(win)) return true;
    const record = { win, active: false, observer: null, closed: false, onUnload: null };
    record.onUnload = () => cleanup(record);
    records.push(record);
    try { win.addEventListener("unload", record.onUnload, { once: true }); } catch (error) {}
    try {
      const Observer = win.MutationObserver;
      const doc = win.document;
      if (typeof Observer === "function" && doc && doc.documentElement) {
        record.observer = new Observer(() => inspect(record));
        record.observer.observe(doc.documentElement, { childList: true, subtree: true, attributes: true });
      }
    } catch (error) {}
    inspect(record);
    return true;
  }

  function refresh() {
    records.slice().forEach(inspect);
  }

  function forEachActive(callback) {
    if (typeof callback !== "function") return;
    records.slice().forEach((record) => {
      if (record.active) callback(record.win);
    });
  }

  function stop() {
    records.slice().forEach(cleanup);
  }

  return { track, refresh, forEachActive, stop };
}

module.exports = { createHostWindowRuntimeManager };
