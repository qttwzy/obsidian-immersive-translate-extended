"use strict";

function createHostBrowserWindow(options) {
  const settings = options || {};
  const windows = settings.windows || [];
  const loadedUrls = settings.loadedUrls;
  const sent = settings.sent || settings.responses;

  function FakeBrowserWindow(windowOptions) {
    const handlers = {};
    this.options = windowOptions;
    this.destroyed = false;
    this.handlers = handlers;
    this.currentUrl = settings.currentUrl || "";
    const session = {
      cookies: { get: settings.getCookies || (async () => []) },
    };
    session.setPermissionRequestHandler = (handler) => { session.permissionRequestHandler = handler; };
    session.setPermissionCheckHandler = (handler) => { session.permissionCheckHandler = handler; };
    this.webContents = {
      mainFrame: {},
      getURL: () => this.currentUrl,
      send: (channel, message) => { if (sent) sent.push({ channel, message }); },
      setWindowOpenHandler: (handler) => { handlers.windowOpen = handler; },
      on: (name, handler) => { handlers[name] = handler; },
      session,
    };
    this.loadURL = (url) => {
      this.currentUrl = url;
      if (loadedUrls) loadedUrls.push(url);
    };
    this.focus = () => {};
    this.show = () => {};
    this.isDestroyed = () => this.destroyed;
    this.close = () => {
      this.destroyed = true;
      if (handlers.closed) handlers.closed();
    };
    this.on = (name, handler) => { handlers[name] = handler; };
    windows.push(this);
  }

  return { FakeBrowserWindow, windows };
}

module.exports = { createHostBrowserWindow };
