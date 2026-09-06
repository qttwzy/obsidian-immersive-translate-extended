"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const { test, before, afterEach } = require("node:test");
const path = require("node:path");
const { createDashboardPreloadRuntime } = require("./helpers/dashboard-preload-runtime");
const { createHostBrowserWindow } = require("./helpers/host-browser-window");
const { actual1328HostBridgeFixture } = require("./helpers/userscript-host-bridge");
const {
  setupRuntime,
  restoreRuntime,
  loadPluginClass,
  makePlugin,
  harness,
  makeElement,
  makeRequestUrlResponse,
  findElement,
  collectText,
} = require("./helpers/plugin-runtime");
const {
  DOCUMENT_RUNTIME_ACTION_CHANNEL,
  DOCUMENT_RUNTIME_INIT_CHANNEL,
  DOCUMENT_RUNTIME_STATUS_CHANNEL,
  DOCUMENT_RUNTIME_REQUEST_CHANNEL,
  DOCUMENT_RUNTIME_WORLD_ID,
} = require("../plugin/document-runtime");

const noticeMessages = harness.noticeMessages;
const openedModals = harness.openedModals;
const addedSettingTabs = harness.addedSettingTabs;

before(() => { loadPluginClass(); });
afterEach(() => { restoreRuntime(); });

function createInstalledRuntimeDirectory(t, content) {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-main-installed-runtime-"));
  t.after(() => fs.rmSync(pluginDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(pluginDir, "userscript.runtime.js"), content);
  return pluginDir;
}

function attachDashboardWindow(plugin, workspace) {
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._getPreloadPath = () => "/tmp/dashboard-preload.js";
  plugin._startSyncPolling = () => {};
  plugin._injectDashboardBridge = () => {};
}

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function examplePdfCandidate() {
  return {
    ok: true,
    absolutePath: "/vault/papers/example.pdf",
    fileName: "example.pdf",
    extension: "pdf",
  };
}

test("settings expose account, Dashboard, and safe recovery controls at one level", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("settings-token"));
  localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "reader@example.com", userType: "pro" }));
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };
  const openedDashboard = [];
  let syncCalls = 0;
  const imported = [];
  plugin._openDashboardWindow = function (url) { openedDashboard.push(String(url)); return true; };
  plugin._syncDashboardConfig = async function () { syncCalls++; return true; };
  plugin._exportConfig = function () { return "{}"; };
  plugin._importConfig = async function (value) { imported.push(value); return true; };

  await plugin.onload();
  assert.equal(addedSettingTabs.length, 1);
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);

  assert.doesNotMatch(text, /翻译引擎|完整版|精简版/);
  assert.match(text, /界面翻译范围/);
  assert.match(text, /正文翻译范围/);
  assert.match(text, /reader@example\.com/);
  assert.match(text, /Pro 会员/);
  assert.match(text, /打开 Dashboard/);
  assert.match(text, /从已打开的 Dashboard 同步/);
  assert.match(text, /译文样式、字体、鼠标悬停/);
  assert.match(text, /导出安全配置/);
  assert.match(text, /导入安全配置/);
  assert.doesNotMatch(text, /高级恢复工具|打开导入说明/);
  assert.doesNotMatch(text, /目标语言/);
  assert.doesNotMatch(text, /配置翻译服务/);
  assert.doesNotMatch(text, /打开设置面板/);

  const openDashboardButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "打开 Dashboard");
  const syncButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "从已打开的 Dashboard 同步");
  const importInput = findElement(settingTab.containerEl, (element) => element.tagName === "TEXTAREA");
  const importButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "导入安全配置");
  assert.ok(openDashboardButton);
  assert.ok(syncButton);
  assert.ok(importInput);
  assert.ok(importButton);
  openDashboardButton.dispatchEvent({ type: "click" });
  syncButton.dispatchEvent({ type: "click" });
  importInput.value = '{"translationMode":"dual"}';
  importButton.dispatchEvent({ type: "click" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(openedDashboard, ["https://dash.immersivetranslate.com/#general"]);
  assert.equal(syncCalls, 1);
  assert.deepEqual(imported, ['{"translationMode":"dual"}']);
  assert.equal(openedModals.length, 0);
  plugin.onunload();
});

test("production settings expose account and Dashboard controls", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);

  assert.ok(findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "打开 Dashboard"));
  assert.ok(findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "从已打开的 Dashboard 同步"));
  assert.match(text, /账户与高级设置/);
  assert.match(text, /未登录/);
  assert.match(text, /下方打开 Dashboard/);
  assert.match(text, /翻译运行时/);
  assert.match(text, /安装运行时/);
  assert.match(text, /翻译范围/);
  assert.match(text, /安全配置迁移/);
  plugin.onunload();
});

test("production settings keep the persisted account name and status visible with Dashboard enabled", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("settings-token"));
  localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "reader@example.com", nickname: "Reader", userType: "pro" }));
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);

  assert.match(text, /Reader/);
  assert.match(text, /Pro 会员/);
  assert.match(text, /打开 Dashboard/);
  plugin.onunload();
});

test("account status accepts a sanitized identity without an email address", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("settings-token"));
  localStorage.setItem("imt-gm-userInfo", JSON.stringify({ userId: 42, nickname: "Reader", userType: "max" }));
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);

  assert.match(text, /Reader/);
  assert.match(text, /Max 会员/);
  assert.doesNotMatch(text, /未登录/);
  plugin.onunload();
});

test("account status falls back to the legacy user_info alias", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("settings-token"));
  localStorage.setItem("imt-gm-user_info", JSON.stringify({ email: "legacy@example.com", userType: "pro" }));
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);

  assert.match(text, /legacy@example\.com/);
  assert.match(text, /Pro 会员/);
  assert.doesNotMatch(text, /未登录/);
  plugin.onunload();
});

test("account status accepts an id-only identity from either storage alias", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("settings-token"));
  localStorage.setItem("imt-gm-user_info", JSON.stringify({ id: 987654, userType: "pro" }));
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);

  assert.match(text, /987654/);
  assert.match(text, /Pro 会员/);
  assert.doesNotMatch(text, /未登录/);
  plugin.onunload();
});

test("settings treat a leftover account profile without a token as signed out", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "stale@example.com", userType: "pro" }));
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);

  assert.match(text, /未登录/);
  assert.doesNotMatch(text, /stale@example\.com/);
  assert.doesNotMatch(text, /Pro 会员/);
  plugin.onunload();
});

test("runtime setup is started only by the settings action", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-runtime-setup-"));
  t.after(() => fs.rmSync(pluginDir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended", version: "4.0.0" }));
  plugin._getPluginDir = () => pluginDir;
  plugin._activationGeneration = 1;
  plugin._activateIMT = async function () { return true; };
  plugin._startTranslationViewBridge = function () {};
  let requests = 0;
  harness.requestUrlImpl = async function (options) {
    requests++;
    assert.equal(options.url, "https://download.immersivetranslate.com/immersive-translate.user.js");
    return {
      status: 200,
      text: "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n",
      headers: {},
    };
  };

  assert.equal(await plugin._ensureUserscript(1), "");
  assert.equal(requests, 0);

  const result = await plugin._installRuntimeFromOfficialSource();
  assert.deepEqual(result, { ok: true, version: "9.7.3", restartRequired: false });
  assert.equal(requests, 1);
  assert.equal(plugin._getRuntimeStatus().version, "9.7.3");
});

test("runtime installation resolves the standard Obsidian plugin directory when manifest.dir is absent", async (t) => {
  setupRuntime();
  const vaultRoot = fs.mkdtempSync(path.join(os.tmpdir(), "imt-runtime-vault-"));
  t.after(() => fs.rmSync(vaultRoot, { recursive: true, force: true }));
  const pluginDir = path.join(vaultRoot, ".obsidian", "plugins", "immersive-translate-extended");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended", version: "4.0.0" }));
  const plugin = makePlugin();
  plugin.manifest = { id: "immersive-translate-extended", version: "4.0.0" };
  plugin.app.vault.configDir = ".obsidian";
  plugin.app.vault.adapter = { basePath: vaultRoot };
  plugin._activateIMT = async function () { return true; };
  plugin._startTranslationViewBridge = function () {};
  harness.requestUrlImpl = async function () {
    return {
      status: 200,
      text: "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n",
      headers: {},
    };
  };

  assert.deepEqual(await plugin._installRuntimeFromOfficialSource(), { ok: true, version: "9.7.3", restartRequired: false });
  assert.equal(plugin._getRuntimeStatus().version, "9.7.3");
  assert.equal(fs.existsSync(path.join(pluginDir, "userscript.runtime.js")), true);
});

test("settings action installs the runtime and refreshes its status", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };
  plugin._getRuntimeStatus = function () { return { installed: false, version: "" }; };
  let installs = 0;
  plugin._installRuntimeFromOfficialSource = async function () { installs++; return { ok: true, version: "9.7.3" }; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const installButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "安装运行时");

  assert.ok(installButton);
  installButton.dispatchEvent({ type: "click" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(installs, 1);
  plugin.onunload();
});

test("settings action offers an update for an installed runtime", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };
  plugin._getRuntimeStatus = function () { return { installed: true, version: "9.7.3" }; };
  let updates = 0;
  plugin._installRuntimeFromOfficialSource = async function () { updates++; return { ok: true, version: "9.8.0" }; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const updateButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "更新运行时");

  assert.ok(updateButton);
  updateButton.dispatchEvent({ type: "click" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(updates, 1);
  plugin.onunload();
});

test("settings automatically show the installed and official current runtime versions", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const pluginDir = createInstalledRuntimeDirectory(t, "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n");
  fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended", version: "4.0.0" }));
  plugin._getPluginDir = () => pluginDir;
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };
  let requests = 0;
  harness.requestUrlImpl = async function (options) {
    requests++;
    assert.equal(options.url, "https://download.immersivetranslate.com/immersive-translate.user.js");
    return {
      status: 200,
      text: "// ==UserScript==\n// @version 9.8.0\n// ==/UserScript==\nwindow.__imtRuntime = true;\n",
      headers: {},
    };
  };

  try {
    await plugin.onload();
    const settingTab = addedSettingTabs[0];
    settingTab.display();
    await new Promise((resolve) => setImmediate(resolve));
    const text = collectText(settingTab.containerEl);

    assert.equal(requests, 1);
    assert.match(text, /本机已安装 v9\.7\.3/);
    assert.match(text, /官方当前版本 v9\.8\.0/);
  } finally {
    if (!plugin._isUnloaded) plugin.onunload();
  }
});

test("settings show install phases and distinguish the loaded runtime from the disk runtime", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };
  plugin._shouldCheckLatestRuntimeVersion = () => false;
  plugin._isEngineLoaded = () => true;
  plugin._getRuntimeStatus = function () {
    return {
      installed: true,
      version: "9.8.0",
      loadedVersion: "9.7.3",
      latestVersion: "9.8.0",
      latestState: "available",
      installPhase: "writing",
      installError: "",
      restartRequired: true,
    };
  };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const text = collectText(settingTab.containerEl);
  assert.match(text, /本机已安装 v9\.8\.0/);
  assert.match(text, /当前已加载 v9\.7\.3/);
  assert.match(text, /重启后使用磁盘版本/);
  assert.match(text, /正在写入本机文件/);
  const busyButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "正在更新…");
  assert.ok(busyButton);
  assert.equal(busyButton.disabled, true);
  plugin.onunload();
});

test("settings preserve an in-progress safe-config draft while refreshing runtime status", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const pluginDir = createInstalledRuntimeDirectory(t, "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n");
  fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended", version: "4.0.0" }));
  plugin._getPluginDir = () => pluginDir;
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  let resolveVersionRequest;
  harness.requestUrlImpl = () => new Promise((resolve) => { resolveVersionRequest = resolve; });

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const input = findElement(settingTab.containerEl, (element) => element.tagName === "TEXTAREA");
  input.value = '{"translationMode":"dual"}';
  resolveVersionRequest({
    status: 200,
    text: "// ==UserScript==\n// @version 9.8.0\n// ==/UserScript==\nwindow.__imtRuntime = true;\n",
    headers: {},
  });
  await new Promise((resolve) => setImmediate(resolve));

  const refreshedInput = findElement(settingTab.containerEl, (element) => element.tagName === "TEXTAREA");
  assert.equal(refreshedInput.value, '{"translationMode":"dual"}');
  plugin.onunload();
});

test("runtime button is disabled and labeled as current when installed and official versions match", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const pluginDir = createInstalledRuntimeDirectory(t, "// ==UserScript==\n// @version 9.8.0\n// ==/UserScript==\nwindow.__imtRuntime = true;\n");
  plugin._getPluginDir = () => pluginDir;
  plugin._getRuntimeStatus = () => ({ installed: true, version: "9.8.0", latestVersion: "9.8.0", latestState: "available" });
  plugin._shouldCheckLatestRuntimeVersion = () => false;
  let installCalls = 0;
  plugin._installRuntimeFromOfficialSource = async function () { installCalls++; return { ok: true, version: "9.8.0" }; };
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const currentButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "已是最新版本");

  assert.ok(currentButton);
  assert.equal(currentButton.disabled, true);
  currentButton.dispatchEvent({ type: "click" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(installCalls, 0);
  plugin.onunload();
});

test("settings cache a failed official version check and leave runtime storage unchanged", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-runtime-version-error-"));
  t.after(() => fs.rmSync(pluginDir, { recursive: true, force: true }));
  plugin._getPluginDir = () => pluginDir;
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };
  let requests = 0;
  harness.requestUrlImpl = async function () {
    requests++;
    return { status: 503, text: "", headers: {} };
  };

  try {
    await plugin.onload();
    const settingTab = addedSettingTabs[0];
    settingTab.display();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(collectText(settingTab.containerEl), /暂时无法获取官方当前版本/);

    settingTab.display();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(requests, 1);
    assert.equal(fs.existsSync(path.join(pluginDir, "userscript.runtime.js")), false);
  } finally {
    if (!plugin._isUnloaded) plugin.onunload();
  }
});

test("settings do not label a stale version as current after an official refresh fails", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const pluginDir = createInstalledRuntimeDirectory(t, "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n");
  plugin._getPluginDir = () => pluginDir;
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return false; };
  let requests = 0;
  harness.requestUrlImpl = async function () {
    requests++;
    if (requests === 1) {
      return {
        status: 200,
        text: "// ==UserScript==\n// @version 9.8.0\n// ==/UserScript==\nwindow.__imtRuntime = true;\n",
        headers: {},
      };
    }
    return { status: 503, text: "", headers: {} };
  };

  try {
    await plugin.onload();
    const settingTab = addedSettingTabs[0];
    settingTab.display();
    await new Promise((resolve) => setImmediate(resolve));
    assert.match(collectText(settingTab.containerEl), /官方当前版本 v9\.8\.0/);

    assert.deepEqual(await plugin._checkLatestRuntimeVersion(true), { ok: false, version: "" });
    settingTab.display();
    await new Promise((resolve) => setImmediate(resolve));
    const text = collectText(settingTab.containerEl);
    assert.match(text, /暂时无法获取官方当前版本/);
    assert.doesNotMatch(text, /官方当前版本 v9\.8\.0/);
    assert.doesNotMatch(text, /本机已是当前版本/);
    assert.equal(requests, 2);
  } finally {
    if (!plugin._isUnloaded) plugin.onunload();
  }
});

test("settings version check and install reuse a fresh official runtime response", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-runtime-settings-flow-"));
  t.after(() => fs.rmSync(pluginDir, { recursive: true, force: true }));
  plugin._getPluginDir = () => pluginDir;
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._detectAndHandleConflicts = function () {};
  plugin._activateIMT = async function () { return true; };
  plugin._startTranslationViewBridge = function () {};
  const versions = ["9.7.3", "9.8.0"];
  let requests = 0;
  harness.requestUrlImpl = async function (options) {
    assert.equal(options.url, "https://download.immersivetranslate.com/immersive-translate.user.js");
    const version = versions[requests++];
    return {
      status: 200,
      text: "// ==UserScript==\n// @version " + version + "\n// ==/UserScript==\nwindow.__imtRuntime = true;\n",
      headers: {},
    };
  };

  await plugin.onload();
  const settingTab = addedSettingTabs[0];
  settingTab.display();
  const installButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "安装运行时");
  installButton.dispatchEvent({ type: "click" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "已是最新版本")?.disabled, true);
  assert.equal(requests, 1);
  assert.deepEqual(await plugin._checkLatestRuntimeVersion(true), { ok: true, version: "9.8.0" });
  settingTab.display();
  const updateButton = findElement(settingTab.containerEl, (element) => element.tagName === "BUTTON" && element.textContent === "更新运行时");
  assert.ok(updateButton);
  updateButton.dispatchEvent({ type: "click" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(requests, 2);
  assert.equal(plugin._getRuntimeStatus().version, "9.8.0");
  plugin.onunload();
});

test("a stale plugin instance cannot overwrite a replacement runtime", async (t) => {
  setupRuntime();
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-runtime-replacement-race-"));
  t.after(() => fs.rmSync(pluginDir, { recursive: true, force: true }));
  const oldPlugin = makePlugin();
  oldPlugin._getPluginDir = () => pluginDir;
  oldPlugin._activateIMT = async function () { return true; };
  oldPlugin._startTranslationViewBridge = function () {};
  let resolveOldRequest;
  harness.requestUrlImpl = function () {
    return new Promise((resolve) => { resolveOldRequest = resolve; });
  };

  const staleInstall = oldPlugin._installRuntimeFromOfficialSource();
  oldPlugin.onunload();

  const replacement = makePlugin();
  replacement._getPluginDir = () => pluginDir;
  replacement._activateIMT = async function () { return true; };
  replacement._startTranslationViewBridge = function () {};
  harness.requestUrlImpl = async function () {
    return {
      status: 200,
      text: "// ==UserScript==\n// @version 9.8.0\n// ==/UserScript==\nwindow.__imtRuntime = 'replacement';\n",
      headers: {},
    };
  };
  assert.deepEqual(await replacement._installRuntimeFromOfficialSource(), { ok: true, version: "9.8.0", restartRequired: false });

  resolveOldRequest({
    status: 200,
    text: "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = 'stale';\n",
    headers: {},
  });
  assert.deepEqual(await staleInstall, { ok: false, version: "" });
  assert.equal(replacement._getRuntimeStatus().version, "9.8.0");
  replacement.onunload();
});

test("legacy secondary-runtime preferences are discarded in favor of the floating-ball userscript config", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "fr", translationMode: "translation" }));
  const plugin = makePlugin();
  let migratedSettings = null;
  plugin.loadData = async function () { return { sdkMode: "lite", targetLanguage: "ja" }; };
  plugin.saveData = async function (settings) { migratedSettings = settings; };

  await plugin.loadSettings();
  plugin._applyRuntimeConfig();

  assert.equal(Object.hasOwn(plugin.settings, "sdkMode"), false);
  assert.equal(Object.hasOwn(plugin.settings, "targetLanguage"), false);
  assert.equal(Object.hasOwn(migratedSettings, "sdkMode"), false);
  assert.equal(Object.hasOwn(migratedSettings, "targetLanguage"), false);
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.targetLanguage, "fr");
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.translationMode, "translation");
});

test("loadSettings drops superseded userscript cache fields from plugin data", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let persistedSettings = null;
  plugin.loadData = async function () {
    return {
      userscriptCacheVersion: "1.28.5",
      userscriptCacheEtag: "etag-old",
      userscriptCacheTime: 1,
    };
  };
  plugin.saveData = async function (settings) { persistedSettings = settings; };

  await plugin.loadSettings();

  assert.equal(Object.hasOwn(plugin.settings, "userscriptCacheVersion"), false);
  assert.equal(Object.hasOwn(plugin.settings, "userscriptCacheEtag"), false);
  assert.equal(Object.hasOwn(plugin.settings, "userscriptCacheTime"), false);
  assert.equal(Object.hasOwn(persistedSettings, "userscriptCacheVersion"), false);
  assert.equal(Object.hasOwn(persistedSettings, "userscriptCacheEtag"), false);
  assert.equal(Object.hasOwn(persistedSettings, "userscriptCacheTime"), false);
});

test("upgraded installations require a fresh conflict choice before changing another plugin", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let persistedSettings = null;
  plugin.loadData = async function () {
    return {
      disableI18NImt: true,
      disableStandaloneImt: true,
      shownConflictWarning: true,
    };
  };
  plugin.saveData = async function (settings) { persistedSettings = settings; };

  await plugin.loadSettings();

  assert.equal(plugin.settings.disableI18NImt, false);
  assert.equal(plugin.settings.disableStandaloneImt, false);
  assert.equal(plugin.settings.shownConflictWarning, false);
  assert.equal(plugin.settings.conflictChoiceVersion, 1);
  assert.equal(persistedSettings.conflictChoiceVersion, 1);
});

function syncHash(values, deletedKeys) {
  const ordered = {};
  for (const key of Object.keys(values).sort()) ordered[key] = values[key];
  const input = JSON.stringify({ values: ordered, deletedKeys: [...deletedKeys].sort() });
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

test("restores plugin-owned globals and navigation hooks on unload", () => {
  const runtime = setupRuntime();
  const plugin = makePlugin();
  plugin._interceptNavigation();
  plugin._installGMPolyfill();
  plugin._installBrowserAPIPolyfill();
  plugin._installGMFetchPolyfill();

  assert.notStrictEqual(window.open, runtime.originalWindowOpen);
  assert.equal(typeof window.GM_getValue, "function");
  assert.equal(typeof globalThis.GM_fetch, "function");
  assert.strictEqual(globalThis.fetch, runtime.originalFetch);
  assert.strictEqual(XMLHttpRequest.prototype.open, runtime.originalXHROpen);
  assert.strictEqual(XMLHttpRequest.prototype.send, runtime.originalXHRSend);

  plugin.onunload();

  assert.strictEqual(window.open, runtime.originalWindowOpen);
  assert.equal(window.GM_getValue, undefined);
  assert.equal(globalThis.GM_fetch, undefined);
  assert.strictEqual(globalThis.fetch, runtime.originalFetch);
  assert.strictEqual(XMLHttpRequest.prototype.open, runtime.originalXHROpen);
  assert.strictEqual(XMLHttpRequest.prototype.send, runtime.originalXHRSend);
});

test("does not overwrite a later owner of a patched global", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._installGMPolyfill();
  const laterOwner = function laterOwner() {};
  window.GM_getValue = laterOwner;
  plugin.onunload();
  assert.strictEqual(window.GM_getValue, laterOwner);
});

test("GM and browser storage listeners observe floating-ball config writes and mirror them to Dashboard", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const pushed = [];
  plugin._pushConfigToDashboard = (config) => { pushed.push(config); return Promise.resolve(true); };
  plugin._installGMPolyfill();
  plugin._installBrowserAPIPolyfill();
  const gmChanges = [];
  const browserChanges = [];
  const listenerId = window.GM_addValueChangeListener("fullLocalUserConfig", (key, oldValue, newValue, remote) => {
    gmChanges.push({ key, oldValue, newValue, remote });
  });
  window.immersiveTranslateBrowserAPI.storage.onChanged.addListener((changes, area) => browserChanges.push({ changes, area }));

  window.GM_setValue("fullLocalUserConfig", {
    targetLanguage: "fr",
    generalRule: { selectors: [".workspace", ".custom"] },
  });

  const stored = JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig"));
  assert.equal(stored.generalRule.selectors.includes(".workspace"), false);
  assert.ok(stored.generalRule.selectors.includes(".workspace-ribbon"));
  assert.ok(stored.generalRule.selectors.includes(".custom"));
  assert.equal(gmChanges.length, 1);
  assert.equal(gmChanges[0].key, "fullLocalUserConfig");
  assert.equal(gmChanges[0].remote, false);
  assert.equal(browserChanges.length, 1);
  assert.equal(browserChanges[0].area, "local");
  assert.deepEqual(pushed, [stored]);

  window.GM_removeValueChangeListener(listenerId);
  window.GM_setValue("fullLocalUserConfig", stored);
  assert.equal(gmChanges.length, 1);
});

test("userscript background PDF requests stay inside the owned Obsidian BrowserWindow", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const opened = [];
  plugin._openDocumentWorkspace = (request) => { opened.push(request); return true; };
  plugin._installGMPolyfill();
  plugin._installBrowserAPIPolyfill();

  const result = await window.immersiveTranslateBrowserAPI.runtime.sendMessage({
    method: "openPdfViewerPage",
    data: { pdfUrl: "https://example.com/paper.pdf?x=1" },
  });

  assert.deepEqual(result, { success: true, embedded: true });
  assert.equal(opened.length, 1);
  assert.match(opened[0].url, /^https:\/\/app\.immersivetranslate\.com\/pdf\/\?file=/);
  assert.ok(opened[0].url.includes(encodeURIComponent("https://example.com/paper.pdf?x=1")));
  assert.equal(opened[0].spec.autoHandoff, false);
  assert.equal(plugin._dashboardWindow, null);
});

test("active Obsidian PDF gets a discoverable action plus PDF and document commands", () => {
  setupRuntime();
  const plugin = makePlugin();
  const actionEl = makeElement("button");
  const file = { path: "papers/example.pdf", name: "example.pdf", extension: "pdf" };
  let action = null;
  const view = {
    file,
    getViewType: () => "pdf",
    addAction(icon, title, callback) {
      action = { icon, title, callback };
      return actionEl;
    },
  };
  const leaf = { view };
  const workspaceCallbacks = {};
  plugin.app.workspace = {
    activeLeaf: leaf,
    getActiveFile: () => file,
    on(name, callback) { workspaceCallbacks[name] = callback; return { name }; },
    onLayoutReady(callback) { callback(); },
  };
  const commands = [];
  plugin.addCommand = (value) => { commands.push(value); return value; };
  plugin.registerEvent = () => {};
  const opened = [];
  plugin._openDocumentWorkspace = (request) => { opened.push(request); return true; };

  assert.equal(plugin._installDocumentTranslationEntry(), true);
  const pdfCommand = commands.find((command) => command.id === "translate-current-pdf");
  const documentCommand = commands.find((command) => command.id === "open-document-translation-workspace");
  assert.ok(pdfCommand);
  assert.ok(documentCommand);
  assert.equal(pdfCommand.checkCallback(true), true);
  assert.equal(action.icon, "languages");
  assert.match(action.title, /翻译当前 PDF/);
  assert.ok(actionEl.classList);

  action.callback();
  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, "https://app.immersivetranslate.com/pdf/");
  assert.equal(opened[0].file, file);
  assert.equal(opened[0].spec.autoHandoff, true);

  assert.equal(plugin._ensurePdfTranslationAction(leaf), false);
  assert.ok(workspaceCallbacks["active-leaf-change"]);
});

test("unloading before layout readiness prevents a late PDF toolbar action", () => {
  setupRuntime();
  const plugin = makePlugin();
  const actionEl = makeElement("button");
  const file = { path: "papers/example.pdf", name: "example.pdf", extension: "pdf" };
  let actionCalls = 0;
  let layoutReady;
  const leaf = {
    view: {
      file,
      getViewType: () => "pdf",
      addAction() { actionCalls++; return actionEl; },
    },
  };
  plugin.app.workspace = {
    activeLeaf: leaf,
    getActiveFile: () => file,
    on() { return {}; },
    onLayoutReady(callback) { layoutReady = callback; },
  };
  plugin.addCommand = () => {};
  plugin.registerEvent = () => {};

  assert.equal(plugin._installDocumentTranslationEntry(), true);
  assert.equal(actionCalls, 0);
  plugin.onunload();
  layoutReady();

  assert.equal(actionCalls, 0);
  assert.equal(plugin._ensurePdfTranslationAction(leaf), false);
  assert.equal(plugin._pdfActionElements.length, 0);
});

test("the document command opens the unified official workspace with manual selection for non-PDF files", () => {
  setupRuntime();
  const plugin = makePlugin();
  const file = { path: "books/example.epub", name: "example.epub", extension: "epub" };
  plugin.app.workspace = {
    activeLeaf: { view: { file, getViewType: () => "empty" } },
    getActiveFile: () => file,
    on() { return {}; },
    onLayoutReady(callback) { callback(); },
  };
  const commands = [];
  plugin.addCommand = (value) => { commands.push(value); return value; };
  plugin.registerEvent = () => {};
  const opened = [];
  plugin._openDocumentWorkspace = (request) => { opened.push(request); return true; };

  assert.equal(plugin._installDocumentTranslationEntry(), true);
  commands.find((command) => command.id === "open-document-translation-workspace").callback();

  assert.equal(opened.length, 1);
  assert.equal(opened[0].url, "https://app.immersivetranslate.com/file/");
  assert.equal(opened[0].spec.autoHandoff, false);
  assert.equal(opened[0].file, file);
  assert.match(noticeMessages.at(-1), /example\.epub/);
  assert.match(noticeMessages.at(-1), /手动选择/);
});

test("production defaults expose the PDF translation action", () => {
  setupRuntime();
  const plugin = makePlugin();
  const actionEl = makeElement("button");
  const file = { path: "papers/example.pdf", name: "example.pdf", extension: "pdf" };
  let action = null;
  const leaf = {
    view: {
      file,
      getViewType: () => "pdf",
      addAction(icon, title, callback) {
        action = { icon, title, callback };
        return actionEl;
      },
    },
  };
  plugin.app.workspace = {
    activeLeaf: leaf,
    getActiveFile: () => file,
    on() { return {}; },
    onLayoutReady(callback) { callback(); },
  };
  plugin.addCommand = () => {};
  plugin.registerEvent = () => {};

  assert.equal(plugin._installDocumentTranslationEntry(), true);
  assert.ok(action);
  assert.equal(action.icon, "languages");
  assert.match(action.title, /翻译当前 PDF/);
});

test("document BrowserWindow is hardened and isolated from Dashboard lifecycle", () => {
  setupRuntime();
  const plugin = makePlugin();
  const loadedUrls = [];
  const externalUrls = [];
  const workspace = createHostBrowserWindow({ loadedUrls });
  const dashboardSentinel = { id: "dashboard" };
  plugin._dashboardWindow = dashboardSentinel;
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._openExternalUrl = (url) => { externalUrls.push(url); };

  assert.equal(plugin._openDocumentWorkspace({
    url: "https://app.immersivetranslate.com/file/",
    title: "文档翻译",
    file: null,
    spec: { autoHandoff: false },
  }), true);
  const documentWindow = workspace.windows[0];
  const handlers = documentWindow.handlers;
  assert.equal(documentWindow.options.webPreferences.nodeIntegration, false);
  assert.equal(documentWindow.options.webPreferences.contextIsolation, true);
  assert.equal(documentWindow.options.webPreferences.sandbox, false);
  assert.equal(documentWindow.options.webPreferences.preload, "/plugin/document-preload.js");
  assert.equal(plugin._dashboardWindow, dashboardSentinel);
  assert.deepEqual(loadedUrls, ["https://app.immersivetranslate.com/file/"]);

  assert.deepEqual(handlers.windowOpen({ url: "https://evil.example/phish" }), { action: "deny" });
  assert.deepEqual(externalUrls, ["https://evil.example/phish"]);
  const navigationEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  handlers["will-navigate"](navigationEvent, "https://evil.example/redirect");
  assert.equal(navigationEvent.prevented, true);
  const trustedNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  handlers["will-redirect"](trustedNavigation, "https://app.immersivetranslate.com/pdf/");
  assert.equal(trustedNavigation.prevented, false);
  const trustedBabelNavigation = { prevented: false, preventDefault() { this.prevented = true; } };
  handlers["will-redirect"](trustedBabelNavigation, "https://app.immersivetranslate.com/babel-doc/job-123");
  assert.equal(trustedBabelNavigation.prevented, false);

  plugin._closeDocumentWorkspace();
  assert.equal(plugin._documentSession.isCurrent(documentWindow), false);
  assert.equal(plugin._dashboardWindow, dashboardSentinel);
});

test("document runtime network requests use the Obsidian host bridge", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const hostRequests = [];
  const responses = [];
  harness.requestUrlImpl = async function (request) {
    hostRequests.push(request);
    const bytes = Buffer.from("translated", "utf8");
    return {
      status: 201,
      text: "translated",
      headers: { "content-type": "text/plain" },
      arrayBuffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    };
  };
  const workspace = createHostBrowserWindow({ responses });
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  assert.equal(plugin._openDocumentWorkspace({
    url: "https://app.immersivetranslate.com/pdf/",
    title: "PDF 翻译",
    file: null,
    spec: { kind: "pdf", autoHandoff: false },
  }), true);

  workspace.windows[0].handlers["ipc-message"]({}, DOCUMENT_RUNTIME_REQUEST_CHANNEL, {
    id: "document-request-0123456789abcdef-7",
    request: {
      url: "https://api2.immersivetranslate.com/v1/translate",
      method: "POST",
      headers: { token: "in-memory-token", "Content-Type": "application/json" },
      body: { type: "text", data: JSON.stringify({ source: "hello" }) },
      timeout: 30000,
    },
  });
  await tick();

  assert.equal(hostRequests.length, 1);
  assert.equal(hostRequests[0].url, "https://api2.immersivetranslate.com/v1/translate");
  assert.equal(hostRequests[0].method, "POST");
  assert.equal(hostRequests[0].headers.token, "in-memory-token");
  assert.equal(hostRequests[0].body, JSON.stringify({ source: "hello" }));
  assert.equal(hostRequests[0].throw, false);
  assert.equal(responses.length, 1);
  assert.equal(responses[0].channel, DOCUMENT_RUNTIME_REQUEST_CHANNEL + ":response");
  assert.equal(responses[0].message.id, "document-request-0123456789abcdef-7");
  assert.equal(responses[0].message.payload.status, 201);
  assert.equal(responses[0].message.payload.text, "translated");
  assert.equal(responses[0].message.payload.base64, Buffer.from("translated").toString("base64"));
  plugin._closeDocumentWorkspace();
});

test("the PDF runtime is initialized through the preload isolated world", async () => {
  setupRuntime();
  const plugin = makePlugin();
  delete plugin._initializeDocumentRuntime;
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "zh-CN", translationService: "google" }));
  plugin._loadInstalledUserscript = () => "// @version 1.32.7\nglobalThis.__documentRuntimeLoaded = true;";
  plugin._getAuthToken = () => "runtime-token";
  plugin._getAuthCookies = () => "session=runtime-cookie";
  const sent = [];
  const executions = [];
  const documentWindow = {
    isDestroyed: () => false,
    webContents: {
      getURL: () => "https://app.immersivetranslate.com/pdf/",
      send: (channel, payload) => { sent.push({ channel, payload }); },
      executeJavaScriptInIsolatedWorld: (worldId, scripts) => {
        executions.push({ worldId, scripts });
        return Promise.resolve({ ok: true, code: "loaded", version: "1.32.7" });
      },
    },
  };
  const opened = plugin._documentSession.open({
    url: "https://app.immersivetranslate.com/pdf/",
    spec: { kind: "pdf" },
    preloadPath: "/plugin/document-preload.js",
    createWindow() { return documentWindow; },
  });
  assert.equal(opened.ok, true);

  assert.deepEqual(await plugin._initializeDocumentRuntime(documentWindow), { ok: true, code: "loaded", version: "1.32.7" });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].channel, DOCUMENT_RUNTIME_INIT_CHANNEL);
  assert.equal(sent[0].payload.trusted, true);
  assert.equal(sent[0].payload.store.fullLocalUserConfig.targetLanguage, "zh-CN");
  assert.equal(sent[0].payload.authToken, "runtime-token");
  assert.equal(sent[0].payload.authCookies, "session=runtime-cookie");
  assert.equal(sent[0].payload.overlay, undefined);
  assert.equal(executions.length, 1);
  assert.equal(executions[0].worldId, DOCUMENT_RUNTIME_WORLD_ID);
  assert.match(executions[0].scripts[0].code, /__documentRuntimeLoaded/);
});

test("a validated local PDF is handed off once after the official workspace finishes loading", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let handoffCalls = 0;
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._resolveDocumentHandoffFile = () => examplePdfCandidate();
  plugin._handoffDocumentFile = async () => { handoffCalls++; return { ok: true, code: "handed_off" }; };
  const file = { path: "papers/example.pdf", name: "example.pdf", extension: "pdf" };

  assert.equal(plugin._openDocumentTranslationWorkspace(file), true);
  workspace.windows[0].handlers["did-finish-load"]();
  workspace.windows[0].handlers["did-finish-load"]();
  await tick();

  assert.equal(handoffCalls, 1);
  assert.deepEqual(plugin._documentSession.pdfDownloadSource(), {
    generation: plugin._documentSession.generation(),
    absolutePath: "/vault/papers/example.pdf",
    fileName: "example.pdf",
  });
  assert.match(noticeMessages.at(-1), /已将.*example\.pdf.*PDF 翻译工作区/);
  plugin._closeDocumentWorkspace();
});

test("one approved PDF export reports Blob capture completion and cancellation through the document bridge", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const responses = [];
  const captures = [];
  const workspace = createHostBrowserWindow({ responses });
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._resolveDocumentHandoffFile = () => examplePdfCandidate();
  plugin._handoffDocumentFile = async () => ({ ok: true, code: "handed_off" });
  plugin._armDocumentPdfDownload = async (_window, source) => {
    let resolveCompletion;
    const capture = {
      source,
      token: "a".repeat(31) + String(captures.length),
      tempPath: "/vault/papers/.imt-pdf-export-test/capture.pdf",
      sourceFileName: "example.pdf",
      maxBytes: 1024 * 1024,
      cancelled: 0,
      completion: new Promise((resolve) => { resolveCompletion = resolve; }),
      finish(input) {
        capture.finished = input;
        const result = { ok: true, code: "saved", absolutePath: "/vault/papers/example-译文.pdf", fileName: "example-译文.pdf" };
        resolveCompletion(result);
        return result;
      },
      cancel() {
        capture.cancelled++;
        resolveCompletion({ ok: false, code: "cancelled" });
        return capture.completion;
      },
      ok: true,
      code: "armed",
    };
    captures.push(capture);
    return capture;
  };

  plugin._openDocumentTranslationWorkspace({ path: "papers/example.pdf", name: "example.pdf", extension: "pdf" });
  const handlers = workspace.windows[0].handlers;
  handlers["did-finish-load"]();
  await tick();
  await tick();

  handlers["ipc-message"]({}, DOCUMENT_RUNTIME_ACTION_CHANNEL, {
    id: "document-action-0123456789abcdef-0",
    action: "prepare_translated_pdf_download",
    context: { fileName: "another.pdf", title: "example.pdf" },
  });
  await tick();
  assert.equal(responses.at(-1).message.payload.code, "source_unavailable");
  assert.equal(plugin._documentSession.pendingDownload(), null);

  handlers["ipc-message"]({}, DOCUMENT_RUNTIME_ACTION_CHANNEL, {
    id: "document-action-0123456789abcdef-00",
    action: "prepare_translated_pdf_download",
    context: { fileName: "", title: "dataexample.pdf" },
  });
  await tick();
  assert.equal(responses.at(-1).message.payload.code, "source_unavailable");
  assert.equal(plugin._documentSession.pendingDownload(), null);

  handlers["ipc-message"]({}, DOCUMENT_RUNTIME_ACTION_CHANNEL, {
    id: "document-action-0123456789abcdef-1",
    action: "prepare_translated_pdf_download",
    context: { fileName: "example.pdf", title: "example.pdf" },
  });
  await tick();
  assert.equal(responses.at(-1).channel, DOCUMENT_RUNTIME_ACTION_CHANNEL + ":response");
  assert.equal(responses.at(-1).message.payload.ok, true);
  assert.equal(captures.length, 1);
  assert.equal(captures[0].source.absolutePath, "/vault/papers/example.pdf");
  assert.deepEqual(responses.at(-1).message.payload.captureTicket, {
    token: captures[0].token,
    tempPath: captures[0].tempPath,
    sourceFileName: "example.pdf",
    maxBytes: 1024 * 1024,
  });

  handlers["ipc-message"]({}, DOCUMENT_RUNTIME_ACTION_CHANNEL, {
    id: "document-action-0123456789abcdef-2",
    action: "finish_translated_pdf_download",
    context: { token: captures[0].token, ok: true, byteLength: 4096 },
  });
  await tick();
  assert.deepEqual(captures[0].finished, { ok: true, byteLength: 4096, code: "capture_failed" });
  assert.equal(responses.filter((entry) => entry.channel === DOCUMENT_RUNTIME_STATUS_CHANNEL).at(-1).message.state, "completed");
  assert.match(noticeMessages.at(-1), /example-译文\.pdf/);

  handlers["ipc-message"]({}, DOCUMENT_RUNTIME_ACTION_CHANNEL, {
    id: "document-action-0123456789abcdef-3",
    action: "prepare_translated_pdf_download",
    context: { fileName: "example.pdf", title: "example.pdf" },
  });
  await tick();
  assert.equal(captures.length, 2);

  handlers["ipc-message"]({}, DOCUMENT_RUNTIME_ACTION_CHANNEL, {
    id: "document-action-0123456789abcdef-4",
    action: "cancel_translated_pdf_download",
    context: { token: captures[1].token },
  });
  await tick();
  assert.equal(captures[1].cancelled, 1);
  assert.equal(responses.at(-1).message.payload.code, "download_cancelled");

  plugin._closeDocumentWorkspace();
});

test("the PDF runtime initializes before the local file handoff starts", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const order = [];
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._initializeDocumentRuntime = async () => { order.push("runtime"); return { ok: true, code: "runtime_ready" }; };
  plugin._scheduleDocumentRuntimeRefresh = () => { order.push("refresh"); return true; };
  plugin._resolveDocumentHandoffFile = () => examplePdfCandidate();
  plugin._handoffDocumentFile = async () => { order.push("handoff"); return { ok: true, code: "handed_off" }; };
  const file = { path: "papers/example.pdf", name: "example.pdf", extension: "pdf" };

  assert.equal(plugin._openDocumentTranslationWorkspace(file), true);
  workspace.windows[0].handlers["did-finish-load"]();
  await tick();
  await tick();

  assert.deepEqual(order, ["runtime", "handoff", "refresh"]);
  plugin._closeDocumentWorkspace();
});

test("a main-frame PDF route change schedules one runtime recovery without repeating the file handoff", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const refreshes = [];
  let handoffCalls = 0;
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._initializeDocumentRuntime = async () => ({ ok: true, code: "runtime_ready" });
  plugin._scheduleDocumentRuntimeRefresh = (window, generation, delay) => {
    refreshes.push({ window, generation, delay });
    return true;
  };
  plugin._resolveDocumentHandoffFile = () => examplePdfCandidate();
  plugin._handoffDocumentFile = async () => { handoffCalls++; return { ok: true, code: "handed_off" }; };

  assert.equal(plugin._openDocumentTranslationWorkspace({ path: "papers/example.pdf", name: "example.pdf", extension: "pdf" }), true);
  const documentWindow = workspace.windows[0];
  documentWindow.handlers["did-finish-load"]();
  await tick();
  await tick();
  refreshes.length = 0;

  documentWindow.handlers["did-navigate-in-page"]({}, "https://app.immersivetranslate.com/pdf/#page=1", false);
  assert.equal(refreshes.length, 0);

  documentWindow.handlers["did-navigate-in-page"]({}, "https://app.immersivetranslate.com/pdf/#page=1", true);
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].window, documentWindow);
  assert.equal(refreshes[0].generation, plugin._documentSession.generation());
  assert.equal(plugin._documentSession.isCurrent(documentWindow, refreshes[0].generation), true);
  assert.equal(refreshes[0].delay, 100);
  assert.equal(handoffCalls, 1);

  plugin._closeDocumentWorkspace();
});

test("a reused document window schedules SPA recovery for the current generation", () => {
  setupRuntime();
  const plugin = makePlugin();
  const refreshes = [];
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._scheduleDocumentRuntimeRefresh = (window, generation, delay) => {
    refreshes.push({ window, generation, delay });
    return true;
  };

  assert.equal(plugin._openDocumentWorkspace({ url: "https://app.immersivetranslate.com/pdf/", spec: { autoHandoff: false } }), true);
  const documentWindow = workspace.windows[0];
  const createdGeneration = plugin._documentSession.generation();
  assert.equal(plugin._openDocumentWorkspace({ url: "https://app.immersivetranslate.com/file/", spec: { autoHandoff: false } }), true);
  assert.ok(plugin._documentSession.generation() > createdGeneration);

  documentWindow.handlers["did-navigate-in-page"]({}, "https://app.immersivetranslate.com/file/#upload", true);
  assert.equal(refreshes.length, 1);
  assert.equal(refreshes[0].window, documentWindow);
  assert.equal(refreshes[0].generation, plugin._documentSession.generation());
  assert.equal(plugin._documentSession.isCurrent(documentWindow, refreshes[0].generation), true);
  assert.equal(refreshes[0].delay, 100);

  plugin._closeDocumentWorkspace();
});

test("document runtime refresh initializes only a trusted current workspace URL", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const inits = [];
  plugin._initializeDocumentRuntime = (documentWindow) => {
    inits.push(documentWindow.webContents.getURL());
    return { ok: true, code: "runtime_ready" };
  };
  const documentWindow = {
    isDestroyed: () => false,
    webContents: { getURL: () => "https://example.com/" },
  };
  const opened = plugin._documentSession.open({
    url: "https://app.immersivetranslate.com/pdf/",
    title: "PDF 翻译",
    spec: { autoHandoff: false },
    preloadPath: "/plugin/document-preload.js",
    createWindow: () => documentWindow,
  });
  assert.equal(opened.ok, true);

  plugin._scheduleDocumentRuntimeRefresh(documentWindow, opened.generation, 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(inits, []);

  documentWindow.webContents.getURL = () => "https://app.immersivetranslate.com/pdf/";
  plugin._scheduleDocumentRuntimeRefresh(documentWindow, opened.generation, 0);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(inits, ["https://app.immersivetranslate.com/pdf/"]);
});

test("a transient official sample navigation retries the PDF handoff before falling back", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let scheduledRetry = null;
  let handoffCalls = 0;
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._scheduleTimeout = (callback) => { scheduledRetry = callback; };
  plugin._initializeDocumentRuntime = async () => ({ ok: true, code: "runtime_ready" });
  plugin._resolveDocumentHandoffFile = () => examplePdfCandidate();
  plugin._handoffDocumentFile = async () => {
    handoffCalls++;
    return handoffCalls < 4
      ? { ok: false, code: "handoff_state_unconfirmed" }
      : { ok: true, code: "handed_off" };
  };
  const file = { path: "papers/example.pdf", name: "example.pdf", extension: "pdf" };

  assert.equal(plugin._openDocumentTranslationWorkspace(file), true);
  workspace.windows[0].handlers["did-finish-load"]();
  await tick();
  await tick();
  assert.equal(handoffCalls, 1);
  assert.equal(typeof scheduledRetry, "function");
  assert.doesNotMatch(noticeMessages.join(" "), /手动选择.*example\.pdf/);

  for (let expectedCalls = 2; expectedCalls <= 4; expectedCalls++) {
    const retry = scheduledRetry;
    scheduledRetry = null;
    retry();
    await tick();
    await tick();
    assert.equal(handoffCalls, expectedCalls);
    if (expectedCalls < 4) assert.equal(typeof scheduledRetry, "function");
  }
  assert.match(noticeMessages.at(-1), /已将.*example\.pdf/);
  plugin._closeDocumentWorkspace();
});

test("a rejected reused-window load clears the pending PDF handoff and reports the failure", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  assert.equal(plugin._openDocumentWorkspace({
    url: "https://app.immersivetranslate.com/pdf/",
    spec: { autoHandoff: false },
  }), true);
  workspace.windows[0].loadURL = () => Promise.reject(new Error("navigation failed"));
  const file = { path: "papers/example.pdf", name: "example.pdf", extension: "pdf" };

  assert.equal(plugin._openDocumentTranslationWorkspace(file), true);
  assert.equal(plugin._documentSession.handoffOverlayState(true).pending, true);
  await tick();

  assert.equal(plugin._documentSession.handoffOverlayState(true).pending, false);
  assert.match(noticeMessages.at(-1), /文档翻译页面加载失败/);
  assert.doesNotMatch(noticeMessages.join(" "), /已打开.*example\.pdf/);
});

test("reusing the document window serializes PDF handoffs across navigation", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._resolveDocumentHandoffFile = (file) => ({
    ok: true,
    absolutePath: "/vault/" + file.name,
    fileName: file.name,
    extension: "pdf",
  });
  let finishFirst;
  const calls = [];
  plugin._handoffDocumentFile = async (_window, candidate) => {
    calls.push(candidate.fileName);
    if (calls.length === 1) return new Promise((resolve) => { finishFirst = resolve; });
    return { ok: true, code: "handed_off" };
  };
  const first = { path: "first.pdf", name: "first.pdf", extension: "pdf" };
  const second = { path: "second.pdf", name: "second.pdf", extension: "pdf" };

  plugin._openDocumentTranslationWorkspace(first);
  workspace.windows[0].handlers["did-finish-load"]();
  await tick();
  await tick();
  assert.deepEqual(calls, ["first.pdf"]);

  plugin._openDocumentTranslationWorkspace(second);
  workspace.windows[0].handlers["did-finish-load"]();
  await tick();
  await tick();
  assert.deepEqual(calls, ["first.pdf"]);

  finishFirst({ ok: false, code: "cdp_command_failed" });
  await tick();
  await tick();
  assert.deepEqual(calls, ["first.pdf", "second.pdf"]);
  assert.match(noticeMessages.at(-1), /second\.pdf/);
  plugin._closeDocumentWorkspace();
});

test("closing the document window lets the next PDF claim its own handoff", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const workspace = createHostBrowserWindow();
  plugin._getBrowserWindow = () => workspace.FakeBrowserWindow;
  plugin._resolveDocumentHandoffFile = (file) => ({
    ok: true,
    absolutePath: "/vault/" + file.name,
    fileName: file.name,
    extension: "pdf",
  });
  let finishFirst;
  const calls = [];
  plugin._handoffDocumentFile = async (_window, candidate) => {
    calls.push(candidate.fileName);
    if (calls.length === 1) return new Promise((resolve) => { finishFirst = resolve; });
    return { ok: true, code: "handed_off" };
  };
  const first = { path: "first.pdf", name: "first.pdf", extension: "pdf" };
  const second = { path: "second.pdf", name: "second.pdf", extension: "pdf" };
  const third = { path: "third.pdf", name: "third.pdf", extension: "pdf" };

  plugin._openDocumentTranslationWorkspace(first);
  workspace.windows[0].handlers["did-finish-load"]();
  await tick();
  await tick();
  assert.deepEqual(calls, ["first.pdf"]);

  plugin._openDocumentTranslationWorkspace(second);
  workspace.windows[0].handlers["did-finish-load"]();
  await tick();
  await tick();
  assert.deepEqual(calls, ["first.pdf"]);

  plugin._closeDocumentWorkspace();
  plugin._openDocumentTranslationWorkspace(third);
  assert.equal(workspace.windows.length, 2);
  assert.equal(plugin._documentSession.handoffOverlayState(true).expectedFileName, "third.pdf");

  finishFirst({ ok: true, code: "handed_off" });
  await tick();
  await tick();
  assert.deepEqual(calls, ["first.pdf"]);

  workspace.windows[1].handlers["did-finish-load"]();
  await tick();
  await tick();
  assert.deepEqual(calls, ["first.pdf", "third.pdf"]);
  assert.match(noticeMessages.at(-1), /third\.pdf/);
  plugin._closeDocumentWorkspace();
});

test("invalidates an in-flight activation before it can append a script", async () => {
  const runtime = setupRuntime();
  const plugin = makePlugin();
  let resolveScript;
  plugin._installGMPolyfill = function () {};
  plugin._installBrowserAPIPolyfill = function () {};
  plugin._installGMFetchPolyfill = function () {};
  plugin._ensureUserscript = function () { return new Promise((resolve) => { resolveScript = resolve; }); };

  plugin._activationGeneration = 1;
  const activation = plugin._activateIMT(1);
  plugin.onunload();
  resolveScript("window.__imt_test_script_ran__ = true;");
  assert.equal(await activation, false);
  assert.equal(runtime.body.children.length, 0);
  assert.equal(globalThis.__imt_test_script_ran__, undefined);
});

test("concurrent activation requests for one generation append the userscript only once", async () => {
  const runtime = setupRuntime();
  const plugin = makePlugin();
  let resolveScript;
  const scriptPromise = new Promise((resolve) => { resolveScript = resolve; });
  plugin._installGMPolyfill = function () {};
  plugin._installBrowserAPIPolyfill = function () {};
  plugin._installGMFetchPolyfill = function () {};
  plugin._ensureUserscript = function () { return scriptPromise; };

  plugin._activationGeneration = 1;
  const first = plugin._activateIMT(1);
  const second = plugin._activateIMT(1);
  resolveScript("window.__imt_test_script_ran__ = true;");

  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(runtime.body.children.length, 1);
});

test("userscript activation failure does not load a secondary runtime", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._installGMPolyfill = function () {};
  plugin._installBrowserAPIPolyfill = function () {};
  plugin._installGMFetchPolyfill = function () {};
  plugin._ensureUserscript = async function () { return ""; };

  assert.equal(await plugin._activateIMT(), false);
  assert.equal(window.__imt_extend_engine_state__, undefined);
  assert.match(noticeMessages.at(-1), /插件设置.*安装翻译运行时/);
});

test("a legacy secondary engine already running in memory requires a clean Obsidian restart", async () => {
  setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "lite" };

  assert.equal(await plugin._activateIMT(), false);
  assert.match(noticeMessages.at(-1), /重启 Obsidian/);
});

test("a reloaded plugin prepares the host-popout source without reinjecting the running main runtime", async () => {
  const { body } = setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "userscript" };
  plugin._ensureUserscript = async function () {
    return "// @version 1.32.8\nwindow.__imt_test_script_ran__ = true;";
  };
  let refreshes = 0;
  plugin._hostWindowRuntimeManager = {
    forEachActive() {},
    refresh() { refreshes++; },
  };

  assert.equal(await plugin._activateIMT(), true);
  assert.equal(body.children.length, 0);
  assert.match(plugin._hostWindowUserscriptSource, /__imt_test_script_ran__/);
  assert.equal(refreshes, 1);
});

test("re-enabling the plugin restores the surviving engine version in GM and browser adapters", async () => {
  setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "userscript", userscriptVersion: "9.7.3" };
  plugin._ensureUserscript = async function () {
    return "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imt_test_script_ran__ = true;";
  };

  assert.equal(await plugin._activateIMT(), true);
  assert.equal(plugin._loadedUserscriptVersion, "9.7.3");
  assert.equal(window.GM_info.script.version, "9.7.3");
  assert.equal(window.GM.info.script.version, "9.7.3");
  assert.equal(window.immersiveTranslateBrowserAPI.runtime.getManifest().version, "9.7.3");
  assert.equal(window.__imt_extend_engine_state__.userscriptVersion, "9.7.3");
});

test("userscript activation reads the locally installed runtime without a network request", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const runtimeSource = "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n";
  const pluginDir = createInstalledRuntimeDirectory(t, runtimeSource);
  let requestCount = 0;
  harness.requestUrlImpl = async () => { requestCount++; return { status: 500 }; };
  plugin._getPluginDir = () => pluginDir;
  plugin._activationGeneration = 1;

  assert.equal(await plugin._ensureUserscript(1), runtimeSource);
  assert.equal(plugin._loadedUserscriptVersion, "");
  assert.equal(plugin._installedRuntime.version, "9.7.3");
  assert.equal(requestCount, 0);
});

test("installed runtime resolves from the executing plugin manifest directory", (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-plugin-manifest-dir-"));
  t.after(() => fs.rmSync(vaultDir, { recursive: true, force: true }));
  const pluginsDir = path.join(vaultDir, ".obsidian", "plugins");
  const staleDir = path.join(pluginsDir, "immersive-translate-extended");
  const executingDir = path.join(pluginsDir, "custom-install-name");
  fs.mkdirSync(staleDir, { recursive: true });
  fs.mkdirSync(executingDir);
  fs.writeFileSync(path.join(staleDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended" }));
  fs.writeFileSync(path.join(executingDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended" }));
  const runtimeSource = "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n";
  fs.writeFileSync(path.join(executingDir, "userscript.runtime.js"), runtimeSource);
  plugin.app.vault.adapter.basePath = vaultDir;
  plugin.manifest.dir = ".obsidian/plugins/custom-install-name";

  assert.equal(plugin._loadInstalledUserscript(), runtimeSource);
  assert.equal(plugin._getPluginDir(), executingDir);
});

test("executable preloads require the loaded and installed plugin versions to match", (t) => {
  setupRuntime();
  const plugin = makePlugin();
  delete plugin._getDocumentPreloadPath;
  const vaultDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-preload-version-"));
  t.after(() => fs.rmSync(vaultDir, { recursive: true, force: true }));
  const pluginDir = path.join(vaultDir, ".obsidian", "plugins", "immersive-translate-extended");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended", version: "4.1.0" }));
  fs.writeFileSync(path.join(pluginDir, "dashboard-preload.js"), "\"use strict\";\n");
  fs.writeFileSync(path.join(pluginDir, "document-preload.js"), "\"use strict\";\n");
  plugin.manifest = { id: "immersive-translate-extended", version: "4.0.0" };
  plugin.app.vault.configDir = ".obsidian";
  plugin.app.vault.adapter = { basePath: vaultDir };

  assert.equal(plugin._getPluginDir(), pluginDir);
  assert.equal(plugin._getPreloadPath(), "");
  assert.equal(plugin._getDocumentPreloadPath(), "");

  fs.writeFileSync(path.join(pluginDir, "manifest.json"), JSON.stringify({ id: "immersive-translate-extended", version: "4.0.0" }));
  assert.equal(plugin._getPreloadPath(), path.join(pluginDir, "dashboard-preload.js"));
  assert.equal(plugin._getDocumentPreloadPath(), path.join(pluginDir, "document-preload.js"));
});

test("userscript activation accepts an installed script with valid version metadata", async (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const runtimeSource = "// ==UserScript==\n// @version 9.7.4\n// ==/UserScript==\nwindow.__imtRuntime = true;\n";
  const pluginDir = createInstalledRuntimeDirectory(t, runtimeSource);
  plugin._getPluginDir = () => pluginDir;
  plugin._activationGeneration = 1;

  assert.equal(await plugin._ensureUserscript(1), runtimeSource);
  assert.equal(plugin._loadedUserscriptVersion, "");
  assert.equal(plugin._installedRuntime.version, "9.7.4");
});

test("reading the installed userscript for a document window keeps the main engine version", (t) => {
  setupRuntime();
  const plugin = makePlugin();
  const oldSource = "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtOld = true;\n";
  const newSource = "// ==UserScript==\n// @version 9.8.0\n// ==/UserScript==\nwindow.__imtNew = true;\n";
  const pluginDir = createInstalledRuntimeDirectory(t, oldSource);
  plugin._getPluginDir = () => pluginDir;
  plugin._loadedUserscriptVersion = "9.7.3";
  plugin._markEngineLoaded();

  assert.equal(plugin._getRuntimeStatus().loadedVersion, "9.7.3");
  assert.equal(plugin._getRuntimeStatus().restartRequired, false);

  fs.writeFileSync(path.join(pluginDir, "userscript.runtime.js"), newSource);
  plugin._installedRuntime = null;

  assert.equal(plugin._getRuntimeStatus().version, "9.8.0");
  assert.equal(plugin._getRuntimeStatus().restartRequired, true);
  assert.equal(plugin._loadInstalledUserscript(), newSource);
  assert.equal(plugin._loadedUserscriptVersion, "9.7.3");
  assert.equal(plugin._getRuntimeStatus().loadedVersion, "9.7.3");
  assert.equal(plugin._getRuntimeStatus().version, "9.8.0");
  assert.equal(plugin._getRuntimeStatus().restartRequired, true);
});

test("an obsolete activation generation cannot read the installed runtime", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._activationGeneration = 2;
  plugin._getPluginDir = () => { throw new Error("must not read"); };

  assert.equal(await plugin._ensureUserscript(1), "");
});

test("replacement instances load settings after older writes finish", async () => {
  setupRuntime();
  const olderPlugin = makePlugin();
  const ReplacementPluginClass = loadPluginClass();
  const replacementPlugin = new ReplacementPluginClass({ plugins: { plugins: {} }, vault: { adapter: {} } }, { id: "immersive-translate-extended" });
  replacementPlugin._isUnloaded = false;
  let resolveOlderWrite;
  let replacementLoadCalls = 0;
  let persistedSettings = null;
  olderPlugin.settings.uiTranslateEnabled = false;
  olderPlugin.saveData = (snapshot) => new Promise((resolve) => {
    resolveOlderWrite = () => { persistedSettings = snapshot; resolve(); };
  });
  replacementPlugin.loadData = async () => { replacementLoadCalls++; return persistedSettings; };

  const olderWrite = olderPlugin.saveSettings();
  await Promise.resolve();
  olderPlugin.onunload();
  const replacementLoad = replacementPlugin.loadSettings();
  await Promise.resolve();

  assert.equal(replacementLoadCalls, 0);
  resolveOlderWrite();
  await olderWrite;
  await replacementLoad;
  assert.equal(replacementLoadCalls, 1);
  assert.equal(replacementPlugin.settings.uiTranslateEnabled, false);
});

test("userscript runtime preserves the floating-ball target language while applying Obsidian selectors", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._installGMPolyfill = function () {};
  plugin._installBrowserAPIPolyfill = function () {};
  plugin._installGMFetchPolyfill = function () {};
  plugin._ensureUserscript = async function () { return "window.__imt_test_script_ran__ = true;"; };
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "fr", translationMode: "translation", translationTheme: "border" }));

  assert.equal(await plugin._activateIMT(), true);
  assert.equal(document.body.children.length, 1);
  assert.equal(window.immersiveTranslateConfig.translationTargetLanguage, "fr");
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.targetLanguage, "fr");
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.translationMode, "translation");
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors.includes(".workspace"), false);
  assert.ok(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors.includes(".workspace-ribbon"));
  assert.ok(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors.includes(".setting-item-name"));
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors.includes(".mod-settings"), false);
  assert.ok(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.excludeSelectors.includes(".markdown-source-view"));
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { targetLanguage: "fr", translationMode: "translation", translationTheme: "border" });
});

test("userscript activation reports the version parsed from the script it actually executes", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._ensureUserscript = async function () {
    return "// ==UserScript==\n// @name Immersive Translate\n// @version 1.32.7\n// ==/UserScript==\nwindow.__imt_test_script_ran__ = true;";
  };

  assert.equal(await plugin._activateIMT(), true);
  assert.equal(window.GM_info.script.version, "1.32.7");
  assert.equal(window.GM.info.script.version, "1.32.7");
  assert.equal(window.immersiveTranslateBrowserAPI.runtime.getManifest().version, "1.32.7");
  assert.equal(window.immersiveTranslateBrowserAPI.runtime.getManifest()._imtBridgeVersion, require("../package.json").version);
  assert.equal(window.__imt_extend_engine_state__.userscriptVersion, "1.32.7");
});

test("userscript activation installs the bounded host-content bridge before execution", async () => {
  const { body } = setupRuntime();
  const plugin = makePlugin();
  plugin._ensureUserscript = async function () {
    return '// @version 1.32.7\nelse if(i.type==="translatePage")await aKe(r,i.data);else if(i.type==="switchTranslationMode"){upstreamBranch()}else i.type==="fallback"?a={}:we("content",i.type);a!==void 0&&i.id&&vu(i.type,a,i.id)';
  };

  assert.equal(await plugin._activateIMT(), true);
  assert.equal(body.children.length, 1);
  assert.equal(body.children[0].textContent.includes('i.type==="obsidianHostUpdateTargetLanguage"'), true);
  assert.equal(body.children[0].textContent.includes('i.type==="obsidianHostTranslatePage"'), true);
  assert.equal(body.children[0].textContent.includes('else if(i.type==="switchTranslationMode"){'), true);
});

test("userscript activation patches the actual 1.32.8 dispatcher without a Dashboard compatibility warning", async () => {
  const { body } = setupRuntime();
  const plugin = makePlugin();
  plugin._ensureUserscript = async function () {
    return actual1328HostBridgeFixture();
  };

  assert.equal(await plugin._activateIMT(), true);
  assert.equal(body.children.length, 1);
  assert.match(body.children[0].textContent, /obsidianHostUpdateTargetLanguage/);
  assert.match(body.children[0].textContent, /obsidianHostTranslatePage/);
  assert.doesNotMatch(noticeMessages.join(" "), /Dashboard.*悬浮球/);
  assert.doesNotMatch(noticeMessages.join(" "), /暂不支持 Dashboard 热同步/);
});

test("userscript activation reports a clear Dashboard fallback when the host bridge contract is incompatible", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._ensureUserscript = async function () {
    return "// @version 1.33.0\nwindow.__imt_test_script_ran__ = true;";
  };

  assert.equal(await plugin._activateIMT(), true);
  assert.match(noticeMessages.at(-1), /Dashboard.*悬浮球/);
});

test("runtime config always excludes editable CodeMirror DOM even when persisted page rules omit it", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.imtPagerule = { selectors: [".custom-ui"], excludeSelectors: [] };

  plugin._applyRuntimeConfig();

  assert.ok(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.excludeSelectors.includes(".markdown-source-view"));
  assert.ok(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.excludeSelectors.includes(".cm-editor"));
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors.includes(".workspace"), false);
  assert.ok(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors.includes(".workspace-ribbon"));
});

test("host selector matrix keeps Obsidian chrome and reading content independently controllable", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.imtPagerule = {
    selectors: [".workspace", ".custom-surface", ".cm-editor"],
    excludeSelectors: [".mod-settings", ".modal", "[role=dialog]", ".custom-exclusion"],
  };

  plugin.settings.uiTranslateEnabled = false;
  plugin.settings.articleTranslateEnabled = true;
  const articleOnly = plugin._buildSelectors({ selectors: [".nav-files-container", ".runtime-custom"] });
  assert.deepEqual(articleOnly.selectors.filter((value) => value === ".custom-surface" || value === ".runtime-custom" || value === ".markdown-reading-view *"), [
    ".custom-surface", ".runtime-custom", ".markdown-reading-view *",
  ]);
  assert.equal(articleOnly.selectors.includes(".workspace"), false);
  assert.equal(articleOnly.selectors.includes(".cm-editor"), false);
  assert.ok(articleOnly.excludeSelectors.includes(".workspace-ribbon"));
  assert.ok(articleOnly.excludeSelectors.includes(".mod-settings"));
  assert.ok(articleOnly.excludeSelectors.includes(".cm-editor"));

  plugin.settings.uiTranslateEnabled = true;
  plugin.settings.articleTranslateEnabled = false;
  const uiOnly = plugin._buildSelectors();
  assert.ok(uiOnly.selectors.includes(".workspace-ribbon"));
  assert.equal(uiOnly.selectors.includes(".mod-settings"), false);
  assert.equal(uiOnly.selectors.includes(".modal-container"), false);
  assert.ok(uiOnly.selectors.includes(".tooltip"));
  assert.equal(uiOnly.selectors.includes(".mod-community-plugin"), false);
  assert.ok(uiOnly.selectors.includes(".setting-item-description"));
  assert.ok(uiOnly.selectors.includes(".community-item"));
  assert.ok(uiOnly.selectors.includes(".community-modal-info"));
  assert.equal(uiOnly.selectors.includes(".workspace"), false);
  assert.equal(uiOnly.selectors.includes(".markdown-reading-view *"), false);
  assert.ok(uiOnly.excludeSelectors.includes(".markdown-reading-view"));
  assert.equal(uiOnly.excludeSelectors.includes(".mod-settings"), false);
  assert.equal(uiOnly.excludeSelectors.includes(".modal-container"), false);
  assert.equal(uiOnly.excludeSelectors.includes(".modal"), false);
  assert.equal(uiOnly.excludeSelectors.includes("[role=dialog]"), false);
  assert.ok(uiOnly.excludeSelectors.includes(".custom-exclusion"));
});

test("host surface poke follows the floating-ball translation state", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin._isEngineLoaded = () => true;
  plugin._getActiveTranslationState = () => "dual";
  const types = [];
  const modes = [];
  plugin._dispatchUserscriptTranslationMode = (mode) => { modes.push(mode); return true; };
  plugin._requestUserscriptDocumentMessage = (type) => { types.push(type); };
  plugin._buildUserscriptPageTranslationData = () => ({});
  assert.equal(plugin._pokeHostSurfaceTranslation(), true);
  assert.deepEqual(modes, []);
  assert.deepEqual(types, ["obsidianHostTranslatePage"]);
});

test("host surface poke starts page translation when the host is still original", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin._isEngineLoaded = () => true;
  plugin._getActiveTranslationState = () => "";
  const types = [];
  const modes = [];
  plugin._dispatchUserscriptTranslationMode = (mode) => { modes.push(mode); return true; };
  plugin._scheduleTimeout = (callback) => { callback(); return 1; };
  plugin._requestUserscriptDocumentMessage = (type) => { types.push(type); };
  plugin._buildUserscriptPageTranslationData = () => ({});
  assert.equal(plugin._pokeHostSurfaceTranslation(), true);
  assert.deepEqual(modes, ["dual"]);
  assert.deepEqual(types, ["obsidianHostTranslatePage"]);
});

test("host surface poke targets the independent popout document and mirrors the main translation state", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  const childWindow = { immersiveTranslateSwitchTranslateState() {} };
  plugin._isEngineLoaded = (runtimeWindow) => runtimeWindow === childWindow;
  plugin._getActiveTranslationState = (runtimeWindow) => runtimeWindow === window ? "dual" : "";
  const modes = [];
  const messages = [];
  plugin._dispatchUserscriptTranslationMode = (mode, runtimeWindow) => { modes.push({ mode, runtimeWindow }); return true; };
  plugin._requestUserscriptDocumentMessage = (type, data, runtimeWindow) => { messages.push({ type, runtimeWindow }); };
  plugin._buildUserscriptPageTranslationData = () => ({});
  plugin._scheduleTimeout = (callback) => { callback(); return 1; };

  assert.equal(plugin._pokeHostSurfaceTranslation(childWindow), true);
  assert.deepEqual(modes, [{ mode: "dual", runtimeWindow: childWindow }]);
  assert.deepEqual(messages, [{ type: "obsidianHostTranslatePage", runtimeWindow: childWindow }]);
});

test("an independent popout stays original while the main window is not translated", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  const restored = [];
  const childWindow = {
    immersiveTranslateSwitchTranslateState(state) { restored.push(state); },
  };
  plugin._isEngineLoaded = (runtimeWindow) => runtimeWindow === childWindow;
  plugin._getActiveTranslationState = () => "";
  const modes = [];
  const messages = [];
  plugin._dispatchUserscriptTranslationMode = (mode, runtimeWindow) => { modes.push({ mode, runtimeWindow }); return true; };
  plugin._requestUserscriptDocumentMessage = (type, data, runtimeWindow) => { messages.push({ type, runtimeWindow }); };

  assert.equal(plugin._pokeHostSurfaceTranslation(childWindow), true);
  assert.deepEqual(restored, ["original"]);
  assert.deepEqual(modes, []);
  assert.deepEqual(messages, []);
});

test("activates an independent userscript runtime inside an Obsidian host popout", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin._hostWindowUserscriptSource = "window.__imt_test_script_ran__ = true;";
  const childBody = makeElement("body");
  const childHead = makeElement("head");
  const childDocument = {
    body: childBody,
    head: childHead,
    documentElement: makeElement("html"),
    createElement: makeElement,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    querySelector() { return null; },
  };
  const childWindow = {
    document: childDocument,
    localStorage,
    navigator,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    DOMException: globalThis.DOMException,
    CustomEvent,
    location: { href: "about:blank" },
  };
  childWindow.self = childWindow;
  childWindow.window = childWindow;
  const poked = [];
  plugin._pokeHostSurfaceTranslation = (runtimeWindow) => { poked.push(runtimeWindow); return true; };

  assert.equal(plugin._activateHostWindowRuntime(childWindow), true);
  assert.equal(typeof childWindow.GM_getValue, "function");
  assert.equal(typeof childWindow.GM_fetch, "function");
  assert.ok(childWindow.IMMERSIVE_TRANSLATE_CONFIG);
  assert.equal(childWindow.__imt_extend_engine_state__.loaded, true);
  assert.equal(childBody.children.at(-1).textContent, plugin._hostWindowUserscriptSource);

  const mainHeadSize = document.head.children.length;
  childWindow.GM_addStyle(".translated { color: green; }");
  const styleHost = makeElement("div");
  childWindow.GM.addElement(styleHost, "style", { textContent: ".via-element { color: red; }" });
  assert.equal(document.head.children.length, mainHeadSize);
  assert.equal(childHead.children.at(-1).textContent, ".translated { color: green; }");
  assert.equal(styleHost.children.at(-1).textContent, ".via-element { color: red; }");
  assert.deepEqual(poked, [childWindow]);

  let storageNotifications = 0;
  childWindow.GM_addValueChangeListener("listener-probe", () => { storageNotifications++; });
  childWindow.immersiveTranslateBrowserAPI.storage.onChanged.addListener(() => { storageNotifications++; });
  plugin._emitUserscriptStorageChange("listener-probe", 0, 1, false);
  assert.equal(storageNotifications, 2);

  plugin._deactivateHostWindowRuntime(childWindow);
  assert.equal(childWindow.GM_getValue, undefined);
  assert.equal(childWindow.IMMERSIVE_TRANSLATE_CONFIG, undefined);
  assert.equal(childBody.children.length, 0);
  assert.equal(childHead.children.length, 0);
  plugin._emitUserscriptStorageChange("listener-probe", 1, 2, false);
  assert.equal(storageNotifications, 2);
});

test("a window runtime record skips a second GM polyfill after the first install", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._installGMPolyfill();
  assert.equal(typeof window.GM_getValue, "function");
  const record = plugin._windowRuntimeLedger.recordFor(window);
  assert.equal(record.gmPolyfill, true);
  delete window.GM;
  delete window.GM_getValue;
  plugin._installGMPolyfill();
  assert.equal(window.GM, undefined);
  assert.equal(window.GM_getValue, undefined);
});

test("host popout engine load stays on the window record after the engine state key is cleared", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin._hostWindowUserscriptSource = "window.__imt_test_script_ran__ = true;";
  const childBody = makeElement("body");
  const childDocument = {
    body: childBody,
    head: makeElement("head"),
    documentElement: makeElement("html"),
    createElement: makeElement,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    querySelector() { return null; },
  };
  const childWindow = {
    document: childDocument,
    localStorage,
    navigator,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    DOMException: globalThis.DOMException,
    CustomEvent,
    location: { href: "about:blank" },
  };
  childWindow.self = childWindow;
  childWindow.window = childWindow;

  assert.equal(plugin._activateHostWindowRuntime(childWindow), true);
  const scriptsAfterFirst = childBody.children.length;
  delete childWindow.__imt_extend_engine_state__;
  assert.equal(plugin._isEngineLoaded(childWindow), true);
  assert.equal(plugin._activateHostWindowRuntime(childWindow), true);
  assert.equal(childBody.children.length, scriptsAfterFirst);
});

test("host popout activation rolls back globals when script injection fails", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin._hostWindowUserscriptSource = "window.__imt_test_script_ran__ = true;";
  const childBody = makeElement("body");
  childBody.append = function () { throw new Error("append failed"); };
  const childDocument = {
    body: childBody,
    head: makeElement("head"),
    documentElement: makeElement("html"),
    createElement: makeElement,
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {},
    querySelector() { return null; },
  };
  const childWindow = {
    document: childDocument,
    localStorage,
    navigator,
    Request: globalThis.Request,
    Response: globalThis.Response,
    Headers: globalThis.Headers,
    DOMException: globalThis.DOMException,
    CustomEvent,
    location: { href: "about:blank" },
  };
  childWindow.self = childWindow;
  childWindow.window = childWindow;

  assert.equal(plugin._activateHostWindowRuntime(childWindow), false);
  assert.equal(childWindow.GM_getValue, undefined);
  assert.equal(childWindow.GM_fetch, undefined);
  assert.equal(childWindow.IMMERSIVE_TRANSLATE_CONFIG, undefined);
  assert.equal(childWindow.__imt_extend_engine_state__, undefined);
  assert.equal(plugin._globalPatches.some((patch) => patch.target === childWindow), false);
});

test("host-window lifecycle manager adopts an already-open Settings popout", () => {
  setupRuntime();
  const plugin = makePlugin();
  const listeners = Object.create(null);
  const childWindow = {
    closed: false,
    document: {
      body: { classList: { contains(name) { return name === "is-popout-modal"; } } },
      documentElement: {},
      querySelector() { return null; },
    },
    MutationObserver: class MutationObserver {
      observe() {}
      disconnect() {}
    },
    addEventListener(name, callback) { listeners[name] = callback; },
    removeEventListener(name) { delete listeners[name]; },
  };
  plugin.app.setting = { win: childWindow };
  const activated = [];
  plugin._activateHostWindowRuntime = (win) => { activated.push(win); return true; };

  assert.equal(plugin._startHostWindowRuntimeManager(), true);
  assert.deepEqual(activated, [childWindow]);

  plugin._stopHostWindowRuntimeManager();
  assert.equal(listeners.unload, undefined);
});

test("host-window state synchronization restores a popout when page translation stops", () => {
  setupRuntime();
  const plugin = makePlugin();
  const states = [];
  const childWindow = {
    immersiveTranslateSwitchTranslateState(state) { states.push(state); },
  };
  plugin._hostWindowRuntimeManager = {
    forEachActive(callback) { callback(childWindow); },
  };
  plugin._getActiveTranslationState = (runtimeWindow) => runtimeWindow === window ? "" : "dual";

  assert.equal(plugin._syncHostWindowTranslationState(), true);
  assert.deepEqual(states, ["original"]);
});

test("runtime config drops dialog exclusions while interface translation is enabled", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "zh-CN",
    generalRule: {
      additionalExcludeSelectors: [".modal", ".keep-extra"],
      excludeSelectors: [".modal", "[role=dialog]"],
    },
  }));

  plugin._applyRuntimeConfig();

  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.excludeSelectors.includes(".modal"), false);
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.excludeSelectors.includes("[role=dialog]"), false);
  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.additionalExcludeSelectors.includes(".modal"), false);
  assert.ok(window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.additionalExcludeSelectors.includes(".keep-extra"));
});

test("runtime config is mirrored into every active host popout", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "ja",
    generalRule: {},
  }));
  const childWindow = {};
  plugin._hostWindowRuntimeManager = {
    forEachActive(callback) { callback(childWindow); },
  };

  plugin._applyRuntimeConfig();

  assert.equal(window.IMMERSIVE_TRANSLATE_CONFIG.targetLanguage, "ja");
  assert.equal(childWindow.IMMERSIVE_TRANSLATE_CONFIG.targetLanguage, "ja");
  assert.deepEqual(
    childWindow.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors,
    window.IMMERSIVE_TRANSLATE_CONFIG.generalRule.selectors,
  );
});

test("scope toggles persist host selectors and refresh the active userscript immediately", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin.settings.articleTranslateEnabled = true;
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "ja",
    generalRule: { mouseHoverHoldKey: "Alt", selectors: [".workspace", ".custom"] },
  }));
  let refreshed = null;
  let pushed = null;
  plugin.saveSettings = async () => true;
  plugin._refreshUserscriptRuntime = (config, retranslate) => { refreshed = { config, retranslate }; return true; };
  plugin._pushConfigToDashboard = (config) => { pushed = config; return Promise.resolve(true); };

  assert.equal(await plugin._setTranslationScopeSetting("uiTranslateEnabled", false), true);

  const stored = JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig"));
  assert.equal(stored.generalRule.mouseHoverHoldKey, "Alt");
  assert.ok(stored.generalRule.selectors.includes(".custom"));
  assert.ok(stored.generalRule.selectors.includes(".markdown-reading-view *"));
  assert.equal(stored.generalRule.selectors.includes(".workspace"), false);
  assert.ok(stored.generalRule.excludeSelectors.includes(".workspace-ribbon"));
  assert.equal(refreshed.retranslate, true);
  assert.deepEqual(refreshed.config, stored);
  assert.deepEqual(pushed, stored);
});

test("interface translation toggle starts and stops host-surface watching", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const surfaces = [];
  plugin.settings.uiTranslateEnabled = true;
  plugin.saveSettings = async () => true;
  plugin._persistHostScopeConfig = () => ({ generalRule: {} });
  plugin._refreshUserscriptRuntime = () => true;
  plugin._pushConfigToDashboard = () => {};
  plugin._hostWindowRuntimeManager = {
    watchHostSurfaces() { surfaces.push("watch"); return true; },
    unwatchHostSurfaces() { surfaces.push("unwatch"); return true; },
  };

  assert.equal(await plugin._setTranslationScopeSetting("uiTranslateEnabled", false), true);
  assert.deepEqual(surfaces, ["unwatch"]);
  assert.equal(await plugin._setTranslationScopeSetting("uiTranslateEnabled", true), true);
  assert.deepEqual(surfaces, ["unwatch", "watch"]);
});

test("UI-only translation does not switch the note into reading mode", () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin.settings.articleTranslateEnabled = false;
  let mode = "source";
  const viewStates = [];
  const view = {
    getMode: () => mode,
    containerEl: { isConnected: true },
    previewMode: { containerEl: { isConnected: true } },
    leaf: {
      getViewState: () => ({ state: { mode, source: true } }),
      setViewState(next) {
        viewStates.push(next);
        if (next && next.state && next.state.mode) mode = next.state.mode;
        return Promise.resolve();
      },
    },
  };
  plugin.app.workspace = { getActiveViewOfType() { return view; } };
  document.documentElement = {
    getAttribute(name) { return name === "imt-state" ? "dual" : ""; },
  };
  document.querySelector = () => null;
  globalThis.MutationObserver = class MutationObserver {
    observe() {}
    disconnect() {}
  };

  assert.equal(plugin._startTranslationViewBridge(), false);
  assert.equal(plugin._translationViewBridge, null);
  assert.equal(mode, "source");
  assert.deepEqual(viewStates, []);
});

test("article translation starts the reading view bridge and disabling restores owned views", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  plugin.settings.articleTranslateEnabled = false;
  plugin.saveSettings = async () => true;
  plugin._refreshUserscriptRuntime = () => true;
  plugin._pushConfigToDashboard = () => Promise.resolve(true);
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "zh-CN" }));
  let mode = "source";
  const view = {
    getMode: () => mode,
    containerEl: { isConnected: true },
    previewMode: { containerEl: { isConnected: true } },
    leaf: {
      getViewState: () => ({ state: { mode, source: true } }),
      setViewState(next) {
        if (next && next.state && next.state.mode) mode = next.state.mode;
        return Promise.resolve();
      },
    },
  };
  plugin.app.workspace = { getActiveViewOfType() { return view; } };
  document.documentElement = {
    getAttribute(name) { return name === "imt-state" ? "dual" : ""; },
  };
  document.querySelector = () => null;
  globalThis.MutationObserver = class MutationObserver {
    observe() {}
    disconnect() {}
  };

  assert.equal(await plugin._setTranslationScopeSetting("articleTranslateEnabled", true), true);
  assert.ok(plugin._translationViewBridge);
  assert.equal(mode, "preview");

  assert.equal(await plugin._setTranslationScopeSetting("articleTranslateEnabled", false), true);
  assert.equal(plugin._translationViewBridge, null);
  assert.equal(mode, "source");
});

test("userscript mini-config payload carries live theme and hover-service changes", () => {
  setupRuntime();
  const plugin = makePlugin();
  const data = plugin._buildUserscriptMiniConfigData({
    targetLanguage: "zh-CN",
    translationTheme: "none",
    mouseHoverTranslationService: "microsoft",
  });
  assert.equal(data.translationTheme, "none");
  assert.equal(data.mouseHoverTranslationService, "microsoft");
  assert.equal(data.targetLanguage, "zh-CN");
  assert.equal(data.triggerSource, "obsidianHost");
});

test("userscript theme payload uses the upstream live DOM repaint fields", () => {
  setupRuntime();
  const plugin = makePlugin();
  const data = plugin._buildUserscriptThemeConfigData({
    translationTheme: "mask",
    translationThemePatterns: { underline: ["a"] },
    selectTranslationFont: "Noto Sans",
  });
  assert.equal(data.translationTheme, "mask");
  assert.deepEqual(data.translationThemePatterns, { underline: ["a"] });
  assert.equal(data.selectTranslationFont, "Noto Sans");
  assert.equal(data.triggerSource, "obsidianHost");
});

test("userscript translation-mode bridge uses the upstream current-page protocol", () => {
  setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "userscript" };
  let received = null;
  document.dispatchEvent = (event) => { received = JSON.parse(event.detail); return true; };

  assert.equal(plugin._dispatchUserscriptTranslationMode("translation"), true);
  assert.equal(received.type, "switchTranslationMode");
  assert.equal(received.data.translationMode, "translation");
  assert.equal(received.data.remember, false);
  assert.equal(received.data.triggerSource, "obsidianHost");
  assert.equal(plugin._dispatchUserscriptTranslationMode("invalid"), false);
});

test("userscript runtime config sync primes the old theme before applying the new one", async () => {
  setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "userscript" };
  const requests = [];
  let responseListener = null;
  document.addEventListener = (name, listener) => {
    if (name === "immersiveTranslateDocumentMessageTellThirdParty") responseListener = listener;
  };
  document.removeEventListener = (name, listener) => {
    if (name === "immersiveTranslateDocumentMessageTellThirdParty" && responseListener === listener) responseListener = null;
  };
  document.dispatchEvent = (event) => {
    const request = JSON.parse(event.detail);
    requests.push(request);
    queueMicrotask(() => responseListener?.({ detail: JSON.stringify({ id: request.id, type: request.type, payload: { success: true } }) }));
    return true;
  };

  assert.equal(await plugin._syncUserscriptRuntimeConfig(
    { translationTheme: "mask", translationThemePatterns: { mask: ["blur"] }, targetLanguage: "ja" },
    { translationTheme: "none", translationThemePatterns: {}, targetLanguage: "zh-CN" },
  ), true);
  assert.deepEqual(requests.map((request) => request.type), [
    "setMiniConfigAsync",
    "updateTranslationThemeConfig",
    "updateTranslationThemeConfig",
  ]);
  assert.equal(requests[0].data.targetLanguage, "ja");
  assert.equal(requests[1].data.translationTheme, "none");
  assert.equal(requests[2].data.translationTheme, "mask");
});

test("userscript document requests wait for the matching successful response", async () => {
  setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "userscript" };
  let responseListener = null;
  let matchingResponseSent = false;
  document.addEventListener = (name, listener) => {
    if (name === "immersiveTranslateDocumentMessageTellThirdParty") responseListener = listener;
  };
  document.removeEventListener = (name, listener) => {
    if (name === "immersiveTranslateDocumentMessageTellThirdParty" && responseListener === listener) responseListener = null;
  };
  document.dispatchEvent = (event) => {
    const request = JSON.parse(event.detail);
    queueMicrotask(() => responseListener?.({
      detail: JSON.stringify({ id: request.id, type: "unrelatedResponse", payload: { success: true } }),
    }));
    setTimeout(() => {
      matchingResponseSent = true;
      responseListener?.({
        detail: JSON.stringify({ id: request.id, type: request.type, payload: { success: true } }),
      });
    }, 5);
    return true;
  };

  assert.equal(await plugin._requestUserscriptDocumentMessage("setMiniConfigAsync", { targetLanguage: "ja" }), true);
  assert.equal(matchingResponseSent, true);
});

test("userscript document requests reject an explicit upstream failure", async () => {
  setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "userscript" };
  let responseListener = null;
  document.addEventListener = (name, listener) => {
    if (name === "immersiveTranslateDocumentMessageTellThirdParty") responseListener = listener;
  };
  document.removeEventListener = (name, listener) => {
    if (name === "immersiveTranslateDocumentMessageTellThirdParty" && responseListener === listener) responseListener = null;
  };
  document.dispatchEvent = (event) => {
    const request = JSON.parse(event.detail);
    queueMicrotask(() => responseListener?.({
      detail: JSON.stringify({ id: request.id, type: request.type, payload: { success: false, error: "rejected" } }),
    }));
    return true;
  };

  assert.equal(await plugin._requestUserscriptDocumentMessage("setMiniConfigAsync", { targetLanguage: "ja" }), false);
});

test("userscript document requests fail closed when Document cannot receive a receipt", async () => {
  setupRuntime();
  const plugin = makePlugin();
  window.__imt_extend_engine_state__ = { loaded: true, mode: "userscript" };
  let dispatched = 0;
  document.dispatchEvent = () => { dispatched++; return true; };

  assert.equal(await plugin._requestUserscriptDocumentMessage("setMiniConfigAsync", { targetLanguage: "ja" }), false);
  assert.equal(dispatched, 0);
});

test("runtime refresh sends the previous and next config through the ordered userscript sync", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  plugin._applyRuntimeConfig = () => true;
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._getActiveTranslationState = () => "";
  plugin._syncUserscriptRuntimeConfig = async (config, previousConfig) => { calls.push([config, previousConfig]); return true; };
  const previousConfig = { translationTheme: "none" };
  const config = { translationTheme: "mask" };

  assert.equal(plugin._refreshUserscriptRuntime(config, true, previousConfig), true);
  await plugin._configRuntimeChain;
  assert.deepEqual(calls, [[config, previousConfig]]);
});

test("runtime refresh applies a theme-only change without retranslating the page", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  plugin._applyRuntimeConfig = () => true;
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._getActiveTranslationState = () => "dual";
  plugin._syncUserscriptRuntimeConfig = async () => { calls.push("sync"); return true; };
  plugin._requestUserscriptDocumentMessage = async (type, data) => { calls.push(type + ":" + data.translationTheme); return true; };
  window.immersiveTranslateSwitchTranslateState = async (state) => { calls.push("switch:" + state); };

  assert.equal(plugin._refreshUserscriptRuntime({ translationTheme: "mask" }, true, { translationTheme: "none" }), true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(calls, ["sync"]);
});

test("runtime refresh applies a translation-mode change to the active translated DOM", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  plugin._applyRuntimeConfig = () => true;
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._getActiveTranslationState = () => "dual";
  plugin._syncUserscriptRuntimeConfig = async () => { calls.push("sync"); return true; };
  plugin._requestUserscriptDocumentMessage = async (type, data) => { calls.push(type + ":" + data.translationTheme); return true; };
  plugin._dispatchUserscriptTranslationMode = (mode) => { calls.push("mode:" + mode); return true; };
  plugin._waitForUserscriptTranslationState = async (mode) => { calls.push("state:" + mode); return true; };
  window.immersiveTranslateSwitchTranslateState = async (state) => { calls.push("switch:" + state); };

  assert.equal(plugin._refreshUserscriptRuntime(
    { translationMode: "translation", translationTheme: "none" },
    true,
    { translationMode: "dual", translationTheme: "none" },
  ), true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(calls, ["sync", "mode:translation", "state:translation", "updateTranslationThemeConfig:none"]);
});

test("runtime refresh updates target-language context before retranslating the active page", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  plugin._applyRuntimeConfig = () => true;
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._getActiveTranslationState = () => "dual";
  plugin._syncUserscriptRuntimeConfig = async () => { calls.push("sync"); return true; };
  plugin._requestUserscriptDocumentMessage = async (type, data) => { calls.push({ type, data }); return true; };
  window.immersiveTranslateSwitchTranslateState = async (state) => { calls.push("switch:" + state); };

  assert.equal(plugin._refreshUserscriptRuntime(
    { targetLanguage: "ja", translationService: "free-model", translationMode: "dual", translationTheme: "mask" },
    true,
    { targetLanguage: "zh-CN", translationService: "free-model", translationMode: "dual", translationTheme: "mask" },
  ), true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(calls, [
    "sync",
    {
      type: "obsidianHostUpdateTargetLanguage",
      data: { targetLanguage: "ja", hasPageTranslationStarted: true },
    },
    {
      type: "obsidianHostTranslatePage",
      data: {
        targetLanguage: "ja",
        translationService: "free-model",
        translationMode: "dual",
        trigger: "config_change",
        triggerSource: "obsidianHost",
      },
    },
    {
      type: "updateTranslationThemeConfig",
      data: { triggerSource: "obsidianHost", translationTheme: "mask" },
    },
  ]);
});

test("runtime refresh propagates language, service, and mode changes to an open host popout", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.uiTranslateEnabled = true;
  const childWindow = { document: {} };
  plugin._hostWindowRuntimeManager = {
    forEachActive(callback) { callback(childWindow); },
  };
  const appliedWindows = [];
  const requests = [];
  const modeChanges = [];
  plugin._applyRuntimeConfig = (runtimeWindow) => { appliedWindows.push(runtimeWindow); };
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._isEngineLoaded = () => true;
  plugin._getActiveTranslationState = () => "dual";
  plugin._requestUserscriptDocumentMessage = async (type, data, runtimeWindow) => {
    requests.push({ type, data, runtimeWindow });
    return true;
  };
  plugin._dispatchUserscriptTranslationMode = (mode, runtimeWindow) => {
    modeChanges.push({ mode, runtimeWindow });
    return true;
  };
  plugin._waitForUserscriptTranslationState = async () => true;

  assert.equal(plugin._refreshUserscriptRuntime(
    { targetLanguage: "ja", translationService: "microsoft", translationMode: "translation", translationTheme: "mask" },
    true,
    { targetLanguage: "zh-CN", translationService: "google", translationMode: "dual", translationTheme: "mask" },
  ), true);
  await plugin._configRuntimeChain;

  assert.deepEqual(appliedWindows, [undefined, childWindow]);
  assert.deepEqual(
    requests.filter((request) => request.runtimeWindow === childWindow).map((request) => request.type),
    [
      "setMiniConfigAsync",
      "updateTranslationThemeConfig",
      "updateTranslationThemeConfig",
      "obsidianHostUpdateTargetLanguage",
      "obsidianHostTranslatePage",
    ],
  );
  const translated = requests.find((request) => request.runtimeWindow === childWindow && request.type === "obsidianHostTranslatePage");
  assert.equal(translated.data.targetLanguage, "ja");
  assert.equal(translated.data.translationService, "microsoft");
  assert.equal(translated.data.translationMode, "translation");
  assert.ok(modeChanges.some((change) => change.mode === "translation" && change.runtimeWindow === childWindow));
});

test("rapid runtime refreshes serialize userscript writes and apply only the latest visible translation", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const syncTargets = [];
  const visibleCalls = [];
  let releaseFirstSync;
  const firstSync = new Promise((resolve) => { releaseFirstSync = resolve; });
  plugin._applyRuntimeConfig = () => true;
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._getActiveTranslationState = () => "dual";
  plugin._syncUserscriptRuntimeConfig = async (config) => {
    syncTargets.push(config.targetLanguage);
    if (config.targetLanguage === "ja") await firstSync;
    return true;
  };
  plugin._requestUserscriptDocumentMessage = async (type, data) => {
    visibleCalls.push({ type, targetLanguage: data.targetLanguage });
    return true;
  };

  plugin._refreshUserscriptRuntime(
    { targetLanguage: "ja", translationService: "free-model", translationMode: "dual", translationTheme: "mask" },
    true,
    { targetLanguage: "zh-CN", translationService: "free-model", translationMode: "dual", translationTheme: "mask" },
  );
  await Promise.resolve();
  await Promise.resolve();
  plugin._refreshUserscriptRuntime(
    { targetLanguage: "fr", translationService: "free-model", translationMode: "dual", translationTheme: "none" },
    true,
    { targetLanguage: "ja", translationService: "free-model", translationMode: "dual", translationTheme: "mask" },
  );
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(syncTargets, ["ja"]);
  releaseFirstSync();
  await plugin._configRuntimeChain;

  assert.deepEqual(syncTargets, ["ja", "fr"]);
  assert.deepEqual(visibleCalls, [
    { type: "obsidianHostUpdateTargetLanguage", targetLanguage: "fr" },
    { type: "obsidianHostTranslatePage", targetLanguage: "fr" },
    { type: "updateTranslationThemeConfig", targetLanguage: undefined },
  ]);
});

test("runtime refresh rebuilds hover context without retranslating the page", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  plugin._applyRuntimeConfig = () => true;
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._getActiveTranslationState = () => "dual";
  plugin._syncUserscriptRuntimeConfig = async () => { calls.push("sync"); return true; };
  window.immersiveTranslateSwitchTranslateState = async (state) => { calls.push("switch:" + state); };

  assert.equal(plugin._refreshUserscriptRuntime(
    { targetLanguage: "zh-CN", generalRule: { mouseHoverHoldKey: "Alt", mouseHoverEffect: "translateRestore" } },
    true,
    { targetLanguage: "zh-CN", generalRule: { mouseHoverHoldKey: "Shift", mouseHoverEffect: "translate" } },
  ), true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(calls, ["sync"]);
});

test("runtime refresh retranslates the active page when its translation service changes", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  plugin._applyRuntimeConfig = () => true;
  plugin._notifyUserscriptConfigChange = () => true;
  plugin._getActiveTranslationState = () => "dual";
  plugin._syncUserscriptRuntimeConfig = async () => { calls.push("sync"); return true; };
  plugin._requestUserscriptDocumentMessage = async (type, data) => { calls.push({ type, data }); return true; };
  window.immersiveTranslateSwitchTranslateState = async (state) => { calls.push("switch:" + state); };

  assert.equal(plugin._refreshUserscriptRuntime(
    { targetLanguage: "zh-CN", translationService: "microsoft", translationMode: "dual", translationTheme: "mask" },
    true,
    { targetLanguage: "zh-CN", translationService: "google", translationMode: "dual", translationTheme: "mask" },
  ), true);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.deepEqual(calls, [
    "sync",
    {
      type: "obsidianHostUpdateTargetLanguage",
      data: { targetLanguage: "zh-CN", hasPageTranslationStarted: true },
    },
    {
      type: "obsidianHostTranslatePage",
      data: {
        targetLanguage: "zh-CN",
        translationService: "microsoft",
        translationMode: "dual",
        trigger: "config_change",
        triggerSource: "obsidianHost",
      },
    },
    {
      type: "updateTranslationThemeConfig",
      data: { triggerSource: "obsidianHost", translationTheme: "mask" },
    },
  ]);
});

test("translation view controller uses Obsidian view state and restores editing mode without reopening an old file", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let leafState = { type: "markdown", state: { file: "first.md", mode: "source", source: false } };
  const transitions = [];
  const view = {
    containerEl: { isConnected: true },
    previewMode: { containerEl: { isConnected: true } },
    getMode() { return leafState.state.mode; },
    leaf: {
      getViewState() { return leafState; },
      async setViewState(next) { leafState = next; transitions.push(next); },
    },
  };
  plugin.app.workspace = { getActiveViewOfType() { return view; } };

  const controller = plugin._createTranslationViewController();
  assert.strictEqual(controller.getActiveView(), view);
  const transition = controller.enterReading(view);
  await Promise.resolve();
  assert.equal(transitions[0].state.mode, "preview");

  leafState = { type: "markdown", state: { file: "second.md", mode: "preview" } };
  await transition.restore();

  assert.equal(transitions[1].state.file, "second.md");
  assert.equal(transitions[1].state.mode, "source");
  assert.equal(transitions[1].state.source, false);
});

test("first userscript launch enables both upstream float-ball side-panel entries once", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "zh-CN" }));
  let saves = 0;
  let notifications = 0;
  plugin.saveSettings = async () => { saves++; };
  plugin._notifyUserscriptConfigChange = () => { notifications++; return true; };

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "zh-CN",
    "monkeyH5FloatBall.add": { enableSidePanel: true, enablePinSidePanel: false, sidePanelEntry: "hover", hoverSidePanelDelay: 500 },
    "pcFloatBall.add": { enableSidePanel: true, enablePinSidePanel: false, sidePanelEntry: "hover", hoverSidePanelDelay: 500 },
  });
  assert.equal(JSON.parse(localStorage.getItem("imt-gm-mock-side-panel-width")), 340);
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 3);
  assert.equal(saves, 1);
  assert.equal(notifications, 1);
});

test("version-one plugin pin migrates to the native hover menu and narrower side panel", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.userscriptSidePanelConfigVersion = 1;
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "zh-CN",
    "monkeyH5FloatBall.add": { enableSidePanel: true, enablePinSidePanel: true, sidePanelEntry: "pin" },
  }));
  localStorage.setItem("imt-gm-mock-side-panel-width", JSON.stringify(435));
  plugin.saveSettings = async () => true;
  plugin._notifyUserscriptConfigChange = () => true;

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), true);
  const stored = JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig"));
  assert.deepEqual(stored["monkeyH5FloatBall.add"], {
    enableSidePanel: true,
    enablePinSidePanel: false,
    sidePanelEntry: "hover",
    hoverSidePanelDelay: 500,
  });
  assert.deepEqual(stored["pcFloatBall.add"], {
    enableSidePanel: true,
    enablePinSidePanel: false,
    sidePanelEntry: "hover",
    hoverSidePanelDelay: 500,
  });
  assert.equal(JSON.parse(localStorage.getItem("imt-gm-mock-side-panel-width")), 340);
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 3);
});

test("version-two hover preference is mirrored to the Electron float-ball branch", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings.userscriptSidePanelConfigVersion = 2;
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    "monkeyH5FloatBall.add": { enableSidePanel: true, enablePinSidePanel: false, sidePanelEntry: "hover", hoverSidePanelDelay: 650 },
  }));
  plugin.saveSettings = async () => true;
  plugin._notifyUserscriptConfigChange = () => true;

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), true);
  const stored = JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig"));
  assert.deepEqual(stored["pcFloatBall.add"], {
    enableSidePanel: true,
    enablePinSidePanel: false,
    sidePanelEntry: "hover",
    hoverSidePanelDelay: 650,
  });
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 3);
});

test("side-panel initialization preserves an explicit native base preference", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const nativeConfig = {
    targetLanguage: "zh-CN",
    monkeyH5FloatBall: { enableSidePanel: true, enablePinSidePanel: true, sidePanelEntry: "pin" },
  };
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify(nativeConfig));
  localStorage.setItem("imt-gm-mock-side-panel-width", JSON.stringify(520));
  plugin.saveSettings = async () => {};

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    ...nativeConfig,
    "pcFloatBall.add": { enableSidePanel: true, enablePinSidePanel: true, sidePanelEntry: "pin", hoverSidePanelDelay: 500 },
  });
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 3);
  assert.equal(JSON.parse(localStorage.getItem("imt-gm-mock-side-panel-width")), 520);
});

test("side-panel initialization respects an explicit native hidden choice", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ "monkeyH5FloatBall.add": { enableSidePanel: false, sidePanelEntry: "hidden" } }));
  localStorage.setItem("imt-gm-mock-side-panel-width", JSON.stringify(520));
  plugin.saveSettings = async () => {};

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    "monkeyH5FloatBall.add": { enableSidePanel: false, sidePanelEntry: "hidden" },
    "pcFloatBall.add": { enableSidePanel: false, enablePinSidePanel: false, sidePanelEntry: "hidden", hoverSidePanelDelay: 500 },
  });
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 3);
});

test("side-panel initialization preserves a sparse native pin preference", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const nativeConfig = { "monkeyH5FloatBall.add": { enablePinSidePanel: false } };
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify(nativeConfig));
  localStorage.setItem("imt-gm-mock-side-panel-width", JSON.stringify(520));
  plugin.saveSettings = async () => {};

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    ...nativeConfig,
    "pcFloatBall.add": { enableSidePanel: true, enablePinSidePanel: false, sidePanelEntry: "hover", hoverSidePanelDelay: 500 },
  });
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 3);
});

test("side-panel initialization rolls back its config patch when plugin persistence fails", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const originalConfig = { targetLanguage: "ja", keep: { nested: true } };
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify(originalConfig));
  plugin.saveSettings = async () => { throw new Error("disk full"); };

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), false);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), originalConfig);
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 0);
});

test("side-panel initialization leaves malformed userscript configuration untouched", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", "{broken");
  let saves = 0;
  plugin.saveSettings = async () => { saves++; };

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), false);
  assert.equal(localStorage.getItem("imt-gm-fullLocalUserConfig"), "{broken");
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 0);
  assert.equal(saves, 0);
  assert.match(noticeMessages.at(-1), /配置无法读取/);
});

test("side-panel rollback does not overwrite a concurrent native floating-ball change", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const concurrentConfig = {
    targetLanguage: "fr",
    "monkeyH5FloatBall.add": { enableSidePanel: false, sidePanelEntry: "hidden" },
  };
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "ja" }));
  plugin.saveSettings = async () => {
    localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify(concurrentConfig));
    throw new Error("disk full");
  };

  assert.equal(await plugin._initializeUserscriptSidePanelDefaults(), false);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), concurrentConfig);
  assert.equal(plugin.settings.userscriptSidePanelConfigVersion, 0);
});

test("restores both runtime configuration globals on unload", () => {
  setupRuntime();
  const previousSdkConfig = { owner: "sdk" };
  const previousUserscriptConfig = { owner: "userscript" };
  window.immersiveTranslateConfig = previousSdkConfig;
  window.IMMERSIVE_TRANSLATE_CONFIG = previousUserscriptConfig;
  const plugin = makePlugin();

  plugin._applyRuntimeConfig();
  assert.notStrictEqual(window.immersiveTranslateConfig, previousSdkConfig);
  assert.notStrictEqual(window.IMMERSIVE_TRANSLATE_CONFIG, previousUserscriptConfig);

  plugin.onunload();

  assert.strictEqual(window.immersiveTranslateConfig, previousSdkConfig);
  assert.strictEqual(window.IMMERSIVE_TRANSLATE_CONFIG, previousUserscriptConfig);
});

test("unload cancels delayed startup callbacks", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.loadSettings = async function () {};
  plugin._interceptNavigation = function () {};
  plugin._activateIMT = async function () { throw new Error("activation should not run"); };
  await plugin.onload();
  plugin.onunload();
  await new Promise((resolve) => setTimeout(resolve, 550));
  assert.equal(plugin._initialized, false);
});

function gmRequest(options) {
  return new Promise((resolve, reject) => {
    window.GM_xmlhttpRequest(Object.assign({}, options, {
      onload: resolve,
      onerror: (result) => reject(result.error || new Error(result.statusText)),
    }));
  });
}

test("intercepts only exact HTTPS Dashboard destinations", () => {
  setupRuntime();
  const plugin = makePlugin();
  const openedDashboard = [];
  plugin._openDashboardWindow = (url) => { openedDashboard.push(String(url)); };
  plugin._interceptNavigation();

  assert.equal(window.open("https://dash.immersivetranslate.com/#general"), null);
  assert.deepEqual(openedDashboard, ["https://dash.immersivetranslate.com/#general"]);
  assert.equal(window.open("https://evil.example/?next=https://dash.immersivetranslate.com"), "opened");
  assert.equal(window.open("http://dash.immersivetranslate.com/#general"), "opened");
  assert.equal(openedDashboard.length, 1);
});

test("tracks the Window returned for an Obsidian about:blank popout", () => {
  setupRuntime();
  const popoutWindow = { document: {} };
  window.open = function originalPopoutOpen() { return popoutWindow; };
  const plugin = makePlugin();
  const tracked = [];
  plugin._hostWindowRuntimeManager = {
    track(win) { tracked.push(win); return true; },
  };
  plugin._interceptNavigation();

  assert.strictEqual(window.open("about:blank", "_blank", "popup,width=900,height=700"), popoutWindow);
  assert.deepEqual(tracked, [popoutWindow]);
});

test("Dashboard window denies untrusted navigations and opens them externally", () => {
  setupRuntime();
  const plugin = makePlugin();
  const externalUrls = [];
  const dashboardUrls = [];
  const workspace = createHostBrowserWindow({ loadedUrls: dashboardUrls });
  attachDashboardWindow(plugin, workspace);
  plugin._getElectronShell = () => ({ openExternal: (url) => { externalUrls.push(url); return Promise.resolve(); } });
  let authSyncs = 0;
  plugin._syncDashboardAuthState = () => { authSyncs++; return Promise.resolve(true); };
  plugin._openDashboardWindow("https://dash.immersivetranslate.com/#general");

  const dashboardWindow = workspace.windows[0];
  const handlers = dashboardWindow.handlers;
  const session = dashboardWindow.webContents.session;
  const browserOptions = dashboardWindow.options;
  assert.equal(dashboardUrls[0], "https://dash.immersivetranslate.com/#general");
  assert.equal(browserOptions.webPreferences.nodeIntegration, false);
  assert.equal(browserOptions.webPreferences.contextIsolation, true);
  assert.equal(browserOptions.webPreferences.sandbox, true);
  assert.equal(browserOptions.webPreferences.webSecurity, true);
  assert.match(browserOptions.webPreferences.partition, /^persist:/);
  let permissionGranted = true;
  session.permissionRequestHandler(null, "media", (allowed) => { permissionGranted = allowed; });
  assert.equal(permissionGranted, false);
  assert.equal(session.permissionCheckHandler(), false);
  const webviewEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  handlers["will-attach-webview"](webviewEvent);
  assert.equal(webviewEvent.prevented, true);
  handlers["did-finish-load"]();
  assert.equal(authSyncs, 1);
  const popupResult = handlers.windowOpen({ url: "https://evil.example/phish" });
  assert.deepEqual(popupResult, { action: "deny" });
  assert.deepEqual(externalUrls, ["https://evil.example/phish"]);
  const navigationEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  handlers["will-navigate"](navigationEvent, "https://evil.example/redirect");
  assert.equal(navigationEvent.prevented, true);
  assert.deepEqual(externalUrls, ["https://evil.example/phish", "https://evil.example/redirect"]);
  handlers.windowOpen({ url: "https://app.immersivetranslate.com/#general" });
  assert.equal(dashboardUrls[1], "https://app.immersivetranslate.com/#general");
  handlers.windowOpen({ url: "https://constructor/phish" });
  assert.deepEqual(externalUrls, ["https://evil.example/phish", "https://evil.example/redirect", "https://constructor/phish"]);
  const staleWindowOpen = handlers.windowOpen;
  plugin._closeDashboardWindow();
  const replacementLoads = [];
  plugin._dashboardWindow = { isDestroyed: () => false, loadURL: (nextUrl) => { replacementLoads.push(nextUrl); } };
  assert.deepEqual(staleWindowOpen({ url: "https://app.immersivetranslate.com/#general" }), { action: "deny" });
  assert.deepEqual(replacementLoads, []);
});

test("provider OAuth navigation opens one actionable account handoff instead of duplicate browser tabs", () => {
  setupRuntime();
  const plugin = makePlugin();
  const externalUrls = [];
  const dashboardUrls = [];
  const currentUrl = "https://immersivetranslate.com/accounts/login?from=plugin";
  const workspace = createHostBrowserWindow({ loadedUrls: dashboardUrls, currentUrl });
  attachDashboardWindow(plugin, workspace);
  plugin._getElectronShell = () => ({ openExternal: (url) => { externalUrls.push(url); return Promise.resolve(); } });
  plugin._openDashboardWindow(currentUrl);
  const handlers = workspace.windows[0].handlers;

  const googleResult = handlers.windowOpen({
    url: "https://accounts.google.com/o/oauth2/auth?client_id=one",
    // Electron may reduce the referrer to the origin, so the live window URL
    // must remain the authoritative account-flow source.
    referrer: { url: "https://immersivetranslate.com/" },
  });
  const wechatResult = handlers.windowOpen({
    url: "https://open.weixin.qq.com/connect/qrconnect?appid=one",
    referrer: { url: currentUrl },
  });

  assert.deepEqual(googleResult, { action: "deny" });
  assert.deepEqual(wechatResult, { action: "deny" });
  assert.deepEqual(externalUrls, []);
  assert.equal(openedModals.length, 1);
  assert.match(collectText(openedModals[0].contentEl), /只会登录浏览器/);

  const profileButton = findElement(openedModals[0].contentEl, (element) => element.textContent === "打开官方个人中心");
  const emailButton = findElement(openedModals[0].contentEl, (element) => element.textContent === "返回邮箱登录");
  assert.ok(profileButton);
  assert.ok(emailButton);

  profileButton.dispatchEvent({ type: "click" });
  assert.deepEqual(externalUrls, ["https://immersivetranslate.com/profile"]);

  emailButton.dispatchEvent({ type: "click" });
  assert.match(dashboardUrls.at(-1), /^https:\/\/immersivetranslate\.com\/accounts\/login\?from=plugin/);
  assert.equal(openedModals[0].closed, true);
});

test("same-window provider redirects are denied and routed to the account handoff", () => {
  setupRuntime();
  const plugin = makePlugin();
  const externalUrls = [];
  const guides = [];
  const currentUrl = "https://immersivetranslate.com/accounts/login?from=plugin";
  const workspace = createHostBrowserWindow({ currentUrl });
  attachDashboardWindow(plugin, workspace);
  plugin._getElectronShell = () => ({ openExternal: (url) => { externalUrls.push(url); return Promise.resolve(); } });
  plugin._showProviderLoginGuide = (guide) => { guides.push(guide); };
  plugin._openDashboardWindow(currentUrl);

  const navigationEvent = { prevented: false, preventDefault() { this.prevented = true; } };
  workspace.windows[0].handlers["will-navigate"](navigationEvent, "https://open.weixin.qq.com/connect/qrconnect?appid=one");

  assert.equal(navigationEvent.prevented, true);
  assert.deepEqual(externalUrls, []);
  assert.equal(guides.length, 1);
  assert.equal(guides[0].id, "wechat");
});

test("reused Dashboard windows are restored and shown before navigation", () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  const dashboardWindow = {
    isDestroyed: () => false,
    isMinimized: () => true,
    restore: () => { calls.push("restore"); },
    show: () => { calls.push("show"); },
    focus: () => { calls.push("focus"); },
    loadURL: (url) => { calls.push(["loadURL", url]); },
  };
  plugin._dashboardWindow = dashboardWindow;
  plugin._getBrowserWindow = () => function FakeBrowserWindow() { throw new Error("should reuse the existing window"); };

  plugin._openDashboardWindow("https://immersivetranslate.com/accounts/login");

  assert.deepEqual(calls, [
    "restore",
    "show",
    "focus",
    ["loadURL", "https://immersivetranslate.com/accounts/login"],
  ]);
});

test("Dashboard PKCE IPC keeps the verifier in the host across the exchange", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const sent = [];
  const requests = [];
  const loadedUrls = [];
  harness.requestUrlImpl = async (options) => {
    requests.push(options);
    if (options.url.endsWith("/pkce/exchange-token")) {
      return { status: 200, json: { code: 0, data: { token: "ipc-token" } }, text: "" };
    }
    return { status: 200, json: { code: 0, data: { userId: 21, email: "ipc@example.com", token: "must-not-copy" } }, text: "" };
  };
  const workspace = createHostBrowserWindow({ loadedUrls, sent });
  attachDashboardWindow(plugin, workspace);
  plugin._openDashboardWindow("https://dash.immersivetranslate.com/#general");

  const dashboardWindow = workspace.windows[0];
  const handlers = dashboardWindow.handlers;
  const argument = dashboardWindow.options.webPreferences.additionalArguments[0];
  const channel = argument.slice("--imt-pkce-channel=".length);
  handlers["ipc-message"]({ sender: {}, senderFrame: plugin._dashboardWindow.webContents.mainFrame }, channel, { id: "forged-sender", type: "getOrCreatePkceChallengeAsync", data: {} });
  handlers["ipc-message"]({ sender: plugin._dashboardWindow.webContents, senderFrame: {} }, channel, { id: "forged-frame", type: "getOrCreatePkceChallengeAsync", data: {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(sent.length, 0);

  handlers["ipc-message"]({ sender: plugin._dashboardWindow.webContents, senderFrame: plugin._dashboardWindow.webContents.mainFrame }, channel, { id: "ipc-challenge", type: "getOrCreatePkceChallengeAsync", data: {} });
  await new Promise((resolve) => setImmediate(resolve));
  const challenge = sent[0].message.payload;
  assert.equal(challenge.ok, true);
  assert.equal(challenge.verifier, undefined);

  handlers["ipc-message"]({}, channel, {
    id: "ipc-exchange",
    type: "submitPkceAuthCodeAsync",
    data: { requestId: challenge.requestId, authCode: "ipc-auth-code" },
  });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sent[1].message.payload.ok, true);
  assert.equal(sent[1].message.payload.authState.token, "ipc-token");
  assert.equal(localStorage.getItem("imt-gm-authToken"), JSON.stringify("ipc-token"));
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-userInfo")), { userId: 21, email: "ipc@example.com" });
  const exchangeBody = JSON.parse(requests[0].body);
  assert.equal(exchangeBody.code, "ipc-auth-code");
  assert.match(exchangeBody.verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(sessionStorage.getItem("__imt_pkce_session"), null);

  handlers["ipc-message"]({}, channel, {
    id: "ipc-navigate",
    type: "navigateTrustedDashboard",
    data: { url: "https://dash.immersivetranslate.com/#general" },
  });
  assert.equal(sent[2].message.payload.ok, true);
  assert.equal(loadedUrls.at(-1), "https://dash.immersivetranslate.com/#general");

  handlers["ipc-message"]({}, channel, {
    id: "ipc-navigation-denied",
    type: "navigateTrustedDashboard",
    data: { url: "https://immersivetranslate.com/accounts/login" },
  });
  assert.equal(sent[3].message.payload.code, "navigation_denied");
  assert.equal(loadedUrls.at(-1), "https://dash.immersivetranslate.com/#general");
});

test("resolves Obsidian's bundled @electron/remote BrowserWindow fallback", () => {
  setupRuntime();
  const plugin = makePlugin();
  const FakeBrowserWindow = function FakeBrowserWindow() {};
  const originalRequire = window.require;
  window.require = (name) => {
    if (name === "electron") throw new Error("renderer electron.remote unavailable");
    if (name === "@electron/remote") return { BrowserWindow: FakeBrowserWindow, shell: { openExternal() {} } };
    return originalRequire(name);
  };

  assert.strictEqual(plugin._getBrowserWindow(), FakeBrowserWindow);
  assert.equal(typeof plugin._getElectronShell().openExternal, "function");
});

test("Dashboard login fails closed when an embedded window is unavailable", () => {
  setupRuntime();
  const plugin = makePlugin();
  const external = [];
  plugin._getBrowserWindow = () => null;
  plugin._originalWindowOpen = (url, target) => { external.push({ url, target }); };

  assert.equal(plugin._openDashboardWindow("https://dash.immersivetranslate.com/#general"), false);
  assert.deepEqual(external, []);
  assert.match(noticeMessages.at(-1), /不会跳转到系统浏览器/);
});

test("Dashboard login fails closed when its preload bridge is missing", () => {
  setupRuntime();
  const plugin = makePlugin();
  let constructed = false;
  plugin._getBrowserWindow = () => function FakeBrowserWindow() { constructed = true; };
  plugin._getPreloadPath = () => "";

  assert.equal(plugin._openDashboardWindow("https://dash.immersivetranslate.com/#general"), false);
  assert.equal(constructed, false);
  assert.match(noticeMessages.at(-1), /登录桥文件缺失/);
});

test("external navigation tolerates legacy shell implementations without a Promise", () => {
  setupRuntime();
  const plugin = makePlugin();
  const opened = [];
  plugin._getElectronShell = () => ({ openExternal: (url) => { opened.push(url); } });

  assert.doesNotThrow(() => plugin._openExternalUrl("https://evil.example/path"));
  assert.deepEqual(opened, ["https://evil.example/path"]);
});

test("external navigation falls back when the shell throws synchronously", () => {
  setupRuntime();
  const plugin = makePlugin();
  const opened = [];
  plugin._getElectronShell = () => ({ openExternal: () => { throw new Error("shell unavailable"); } });
  plugin._originalWindowOpen = (url, target) => { opened.push({ url, target }); };

  plugin._openExternalUrl("https://evil.example/path");

  assert.deepEqual(opened, [{ url: "https://evil.example/path", target: "_blank" }]);
});

test("Dashboard host delegates idempotent sync UI ownership to the preload", () => {
  setupRuntime();
  const plugin = makePlugin();
  let injected = "";
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: { executeJavaScript: (script) => { injected = script; return Promise.resolve(); } },
  };

  plugin._injectDashboardBridge();
  assert.match(injected, /__imt_ensure_sync_ui/);
  assert.doesNotMatch(injected, /localStorage\.length|createElement|同步不可用/);
});

test("main pushes complete safe advanced settings into an open Dashboard", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let injected = "";
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: { executeJavaScript: (script) => { injected = script; return Promise.resolve(true); } },
  };

  assert.equal(await plugin._pushConfigToDashboard({
    targetLanguage: "ja",
    translationTheme: "none",
    translationThemePatterns: ["underline"],
    selectTranslationFont: "Noto Sans",
    generalRule: { mouseHoverHoldKey: "Alt" },
    apiKey: "local-secret",
  }), true);
  assert.match(injected, /__imt_apply_host_config/);
  assert.match(injected, /translationTheme/);
  assert.match(injected, /mouseHoverHoldKey/);
  assert.doesNotMatch(injected, /local-secret|apiKey/);
});

test("Dashboard IPC updates advanced settings while retaining local secrets and host scope", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "zh-CN",
    translationTheme: "mask",
    apiKey: "local-secret",
    futureField: { keep: true },
    generalRule: { selectors: [".workspace"], mouseHoverHoldKey: "Shift" },
  }));
  plugin._refreshUserscriptRuntime = () => true;
  plugin._pushConfigToDashboard = () => Promise.resolve(true);

  const result = await plugin._commitDashboardConfig({
    targetLanguage: "ja",
    translationTheme: "none",
    apiKey: "dashboard-secret",
    generalRule: { mouseHoverHoldKey: "Alt", mouseHoverEffect: "translateRestore" },
  });

  assert.deepEqual(result, { ok: true, changed: true });
  const stored = JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig"));
  assert.equal(stored.targetLanguage, "ja");
  assert.equal(stored.translationTheme, "none");
  assert.equal(stored.apiKey, "local-secret");
  assert.deepEqual(stored.futureField, { keep: true });
  assert.equal(stored.generalRule.mouseHoverHoldKey, "Alt");
  assert.equal(stored.generalRule.mouseHoverEffect, "translateRestore");
  assert.equal(stored.generalRule.selectors.includes(".workspace"), false);
  assert.ok(stored.generalRule.selectors.includes(".workspace-ribbon"));
  assert.ok(stored.generalRule.selectors.includes(".markdown-reading-view *"));
});

test("Dashboard cookie changes clear stale auth state on logout", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let cookies = [{ name: "session", value: "one" }];
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: { session: { cookies: { get: async () => cookies } } },
  };
  plugin._fetchUserInfoViaAPI = () => {};
  localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "user@example.com" }));
  localStorage.setItem("imt-gm-authToken", JSON.stringify("token"));
  plugin._syncCookiesToMain();
  await Promise.resolve();
  assert.equal(plugin._getAuthCookies(), "session=one");
  cookies = [];
  plugin._syncCookiesToMain();
  await Promise.resolve();
  assert.equal(plugin._getAuthCookies(), "");
  assert.equal(plugin._lastCookieHeader, "");
  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
  assert.equal(localStorage.getItem("imt-gm-authToken"), null);
});

test("stale user-info responses cannot clear newer dashboard auth", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let cookies = [{ name: "session", value: "one" }];
  const pendingResponses = [];
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: { session: { cookies: { get: async () => cookies } } },
  };
  harness.requestUrlImpl = () => new Promise((resolve) => pendingResponses.push(resolve));

  plugin._syncCookiesToMain();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plugin._getAuthCookies(), "session=one");
  cookies = [{ name: "session", value: "two" }];
  plugin._syncCookiesToMain();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plugin._getAuthCookies(), "session=two");
  assert.equal(pendingResponses.length, 2);

  pendingResponses[0]({ status: 401, text: "", headers: {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plugin._getAuthCookies(), "session=two");
  assert.equal(plugin._lastCookieHeader, "session=two");

  pendingResponses[1]({ status: 200, text: JSON.stringify({ email: "new@example.com", userType: "pro", avatar: { token: "nested-secret" }, token: "must-not-be-stored" }), headers: {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
});

test("auth cleanup invalidates pending cookie reads and API responses", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let resolveCookies;
  let resolveUserInfo;
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: { session: { cookies: { get: () => new Promise((resolve) => { resolveCookies = resolve; }) } } },
  };
  harness.requestUrlImpl = () => new Promise((resolve) => { resolveUserInfo = resolve; });
  plugin._authAdapter.applyLegacyCookies("session=old");
  plugin._authGeneration = 1;
  plugin._syncCookiesToMain();
  plugin._clearDashboardAuthState();
  resolveCookies([{ name: "session", value: "old" }]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(plugin._getAuthCookies(), "");

  plugin._isUnloaded = false;
  plugin._authAdapter.applyLegacyCookies("session=current");
  plugin._authGeneration++;
  plugin._fetchUserInfoViaAPI();
  await new Promise((resolve) => setImmediate(resolve));
  plugin._isUnloaded = true;
  resolveUserInfo({ status: 200, text: JSON.stringify({ email: "stale@example.com" }), headers: {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
});

test("dashboard polling refreshes auth even while config sync is busy", () => {
  setupRuntime();
  const plugin = makePlugin();
  let cookieSyncs = 0;
  let authSyncs = 0;
  plugin._syncCookiesToMain = () => { cookieSyncs++; };
  plugin._syncDashboardAuthState = () => { authSyncs++; };
  plugin._syncReadInFlight = true;
  plugin._dashboardWindow = { isDestroyed: () => false };

  plugin._autoSyncDashboardStorage();
  assert.equal(cookieSyncs, 1);
  assert.equal(authSyncs, 1);
});

test("dashboard polling omits configuration already committed over IPC", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "zh-CN" }));
  const applied = [];
  plugin._applySyncData = async (dataStr) => {
    applied.push(JSON.parse(dataStr));
    return true;
  };
  plugin._syncDashboardAuthState = () => {};
  plugin._syncCookiesToMain = () => {};
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: {
      executeJavaScript: () => Promise.resolve(JSON.stringify({
        version: 1,
        values: {
          "imt-gm-fullLocalUserConfig": JSON.stringify({ targetLanguage: "ja" }),
          "imt-gm-userInfo": JSON.stringify({ email: "poll@example.com" }),
        },
        deletedKeys: ["imt-gm-fullLocalUserConfig"],
        hash: "stale",
      })),
    },
  };

  plugin._autoSyncDashboardStorage();
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(applied.length, 1);
  assert.equal(applied[0].values["imt-gm-fullLocalUserConfig"], undefined);
  assert.deepEqual(applied[0].deletedKeys, []);
  assert.deepEqual(JSON.parse(applied[0].values["imt-gm-userInfo"]), { email: "poll@example.com" });
  assert.equal(applied[0].ackHash, "stale");
  assert.notEqual(applied[0].hash, "stale");
});

test("dashboard polling acknowledges the original snapshot hash so the next account snapshot can load", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("sync-token"));
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "zh-CN" }));
  const plugin = makePlugin();
  const dashboard = createDashboardPreloadRuntime();
  plugin._syncDashboardAuthState = () => {};
  plugin._syncCookiesToMain = () => {};
  plugin._notifyUserscriptConfigChange = () => {};
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: {
      executeJavaScript(script) { return Promise.resolve(dashboard.__run(script)); },
    },
  };
  dashboard.localStorage.setItem("imt-gm-authToken", JSON.stringify("sync-token"));
  dashboard.localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "member@example.com" }));
  dashboard.localStorage.setItem("imt-gm-subscriptionInfo", JSON.stringify({ plan: "basic" }));
  dashboard.localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ targetLanguage: "ja" }));

  async function pollDashboard() {
    plugin._autoSyncDashboardStorage();
    await new Promise((resolve) => setImmediate(resolve));
    await plugin._syncApplyChain.catch(() => {});
    await new Promise((resolve) => setImmediate(resolve));
  }

  await pollDashboard();
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-subscriptionInfo")), { plan: "basic" });
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { targetLanguage: "zh-CN" });
  assert.equal(dashboard.__imt_sync_ack_hash, dashboard.__imt_sync_pending_snapshot.snapshot.hash);

  dashboard.localStorage.setItem("imt-gm-subscriptionInfo", JSON.stringify({ plan: "pro" }));
  await pollDashboard();
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-subscriptionInfo")), { plan: "pro" });
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { targetLanguage: "zh-CN" });
});

test("normalizes GM request headers and limits cookie forwarding to trusted hosts", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const calls = [];
  plugin._authAdapter.applyLegacyCookies("session=secret");
  harness.requestUrlImpl = async (options) => {
    calls.push(options);
    return { status: 200, text: "ok", headers: { "content-type": "text/plain" }, arrayBuffer: new TextEncoder().encode("ok").buffer };
  };
  plugin._installGMPolyfill();

  await gmRequest({ method: "POST", url: "https://api.immersivetranslate.com/v1/test", headers: new Headers({ "X-Test": "yes" }), data: { value: 1 } });
  await gmRequest({ method: "GET", url: "https://api.immersivetranslate.com@evil.example/path" });
  await gmRequest({ method: "GET", url: "https://constructor/path" });
  const formData = new FormData(); formData.append("field", "value");
  await gmRequest({ method: "POST", url: "https://api2.immersivetranslate.com/form", headers: { "Content-Type": "multipart/form-data; boundary=wrong" }, data: formData });

  assert.equal(calls[0].headers["x-test"], "yes");
  assert.equal(calls[0].headers.Cookie, "session=secret");
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.equal(calls[0].body, JSON.stringify({ value: 1 }));
  assert.equal(Object.keys(calls[1].headers).some((key) => key.toLowerCase() === "cookie"), false);
  assert.equal(Object.keys(calls[2].headers).some((key) => key.toLowerCase() === "cookie"), false);
  const boundary = calls[3].headers["Content-Type"].split("boundary=")[1];
  assert.ok(boundary && boundary !== "wrong");
  assert.match(new TextDecoder().decode(calls[3].body), new RegExp("^--" + boundary));
});

test("mirrors PKCE Dashboard auth state and attaches its token to trusted requests", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let authState = { version: 1, authenticated: true, token: "pkce-token", userInfo: { email: "pkce@example.com", token: "must-not-copy" } };
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: {
      executeJavaScript: (script) => script.includes("__imt_get_auth_state") ? Promise.resolve(authState) : Promise.resolve(null),
    },
  };

  assert.equal(await plugin._syncDashboardAuthState(), true);
  assert.equal(plugin._getAuthToken(), "pkce-token");
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-userInfo")), { email: "pkce@example.com" });
  plugin._authAdapter.applyLegacyCookies("session=legacy");

  let captured;
  harness.requestUrlImpl = async (options) => {
    captured = options;
    return { status: 200, text: "ok", headers: {}, arrayBuffer: new ArrayBuffer(0) };
  };
  plugin._installGMPolyfill();
  await new Promise((resolve, reject) => {
    window.GM_xmlhttpRequest({ url: "https://api2.immersivetranslate.com/v1/user", onload: resolve, onerror: reject });
  });
  assert.equal(captured.headers.token, "pkce-token");
  assert.equal(captured.headers.Cookie, undefined);

  await new Promise((resolve, reject) => {
    window.GM_xmlhttpRequest({ url: "https://dash.immersivetranslate.com/#general", onload: resolve, onerror: reject });
  });
  assert.equal(captured.headers.token, undefined);

  authState = { version: 1, authenticated: false };
  assert.equal(await plugin._syncDashboardAuthState(), true);
  assert.equal(plugin._getAuthToken(), "");
  assert.equal(plugin._getAuthCookies(), "session=legacy");
  assert.equal(localStorage.getItem("imt-gm-authToken"), null);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-userInfo")), { email: "pkce@example.com" });
});

test("restores a persisted PKCE token before the Dashboard is reopened", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("persisted-token"));
  localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "persisted@example.com", token: "must-not-copy" }));

  const plugin = makePlugin();

  assert.equal(plugin._getAuthToken(), "persisted-token");
  assert.deepEqual(plugin._authAdapter.getUserInfo(), { email: "persisted@example.com" });
  assert.deepEqual(await plugin._dashboardPkceHost.handle("getPersistedAuthState", {}), {
    ok: true,
    authState: { token: "persisted-token", userInfo: { email: "persisted@example.com" } },
  });
});

test("supports blob responses, logical timeout, and abort callbacks", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._installGMPolyfill();
  harness.requestUrlImpl = async () => makeRequestUrlResponse({
    status: 200,
    body: "abc",
    headers: { "Content-Type": "image/png" },
  });

  const blobResponse = await gmRequest({ method: "GET", url: "https://assets.example/image", responseType: "blob" });
  assert.equal(blobResponse.response.type, "image/png");
  assert.equal(blobResponse.response.size, 3);

  harness.requestUrlImpl = () => new Promise(() => {});
  await new Promise((resolve, reject) => {
    window.GM_xmlhttpRequest({
      method: "GET",
      url: "https://slow.example/request",
      timeout: 10,
      onload: () => reject(new Error("timed out request should not load")),
      ontimeout: resolve,
      onerror: reject,
    });
  });

  await new Promise((resolve, reject) => {
    const handle = window.GM_xmlhttpRequest({
      method: "GET",
      url: "https://slow.example/abort",
      onload: () => reject(new Error("aborted request should not load")),
      onabort: resolve,
      onerror: reject,
    });
    handle.abort();
  });
});

test("GM_xmlhttpRequest reads requestUrl json only for json responses", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._installGMPolyfill();

  const cases = [
    { body: "plain text", headers: { "Content-Type": "text/plain" }, responseType: "text", status: 200 },
    { body: "abc", headers: { "Content-Type": "image/png" }, responseType: "blob", status: 200 },
    { body: "abc", headers: { "Content-Type": "application/octet-stream" }, responseType: "arraybuffer", status: 200 },
    { body: "", headers: {}, responseType: "text", status: 204 },
    { body: "{\"ok\":true}", headers: { "Content-Type": "application/json" }, responseType: "json", status: 200 },
  ];

  for (const item of cases) {
    const response = makeRequestUrlResponse({
      status: item.status,
      body: item.body,
      headers: item.headers,
    });
    harness.requestUrlImpl = async () => response;
    const payload = await gmRequest({ url: "https://example.com/resource", responseType: item.responseType });
    assert.equal(payload.status, item.status);
    assert.equal(response.stats.jsonReads, item.responseType === "json" ? 1 : 0);
    if (item.status === 204) assert.equal(payload.response, undefined);
    else if (item.responseType === "text") assert.equal(payload.response, item.body);
    else if (item.responseType === "blob") assert.equal(payload.response.size, 3);
    else if (item.responseType === "arraybuffer") assert.ok(payload.response instanceof ArrayBuffer);
    else assert.deepEqual(payload.response, { ok: true });
  }
});

test("GM_fetch accepts Request objects without replacing native fetch or XHR", async () => {
  const runtime = setupRuntime();
  const plugin = makePlugin();
  let captured;
  plugin._authAdapter.applyLegacyCookies("session=secret");
  harness.requestUrlImpl = async (options) => {
    captured = options;
    return makeRequestUrlResponse({
      status: 201,
      body: "created",
      headers: { "Content-Type": "text/plain", "X-Result": "yes" },
    });
  };
  plugin._installGMPolyfill();
  plugin._installGMFetchPolyfill();

  const response = await globalThis.GM_fetch(new Request("https://api2.immersivetranslate.com/items", { method: "POST", headers: { "X-Test": "request" }, body: "hello" }));
  assert.equal(response.status, 201);
  assert.equal(await response.text(), "created");
  assert.equal(captured.method, "POST");
  assert.equal(new TextDecoder().decode(captured.body), "hello");
  assert.equal(captured.headers.Cookie, "session=secret");
  assert.strictEqual(globalThis.fetch, runtime.originalFetch);
  assert.strictEqual(XMLHttpRequest.prototype.open, runtime.originalXHROpen);
  assert.strictEqual(XMLHttpRequest.prototype.send, runtime.originalXHRSend);
});

test("sync applies safe values and explicit deletions", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-translateServices", JSON.stringify({ old: true }));
  const values = {
    "imt-gm-fullLocalUserConfig": JSON.stringify({ provider: "openai", targetLanguage: "de", apiKey: "do-not-copy", nested: { password: "hidden", keep: true } }),
    "imt-gm-user_info": JSON.stringify({ id: 7, email: "user@example.com", userType: "max", nickname: "x".repeat(2048), avatar: { token: "nested-secret" }, token: "do-not-copy" }),
  };
  const deletedKeys = ["imt-gm-translateServices"];
  const snapshot = { version: 1, revision: "r1", values, deletedKeys, hash: syncHash(values, deletedKeys) };

  assert.equal(await plugin._applySyncData(JSON.stringify(snapshot)), true);
  assert.equal(localStorage.getItem("imt-gm-translateServices"), null);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { provider: "openai", targetLanguage: "de", nested: { keep: true } });
  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
  assert.equal(localStorage.getItem("imt-gm-user_info"), null);
  assert.equal(Object.hasOwn(plugin.settings, "targetLanguage"), false);
});

test("sync stores a profile record only when a session token is already present", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("sync-token"));
  const plugin = makePlugin();
  const values = {
    "imt-gm-user_info": JSON.stringify({ id: 7, email: "user@example.com", userType: "max", token: "do-not-copy" }),
  };
  const snapshot = { version: 1, revision: "r-profile", values, deletedKeys: [], hash: syncHash(values, []) };

  assert.equal(await plugin._applySyncData(JSON.stringify(snapshot)), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-userInfo")), { id: 7, email: "user@example.com", userType: "max" });
});

test("Dashboard sync applies advanced settings while preserving local-only fields", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "zh-CN",
    translationMode: "dual",
    localRule: { keep: true },
    translationServices: { "bing-free": { enabled: true, localOnly: true } },
  }));
  const values = {
    "imt-gm-fullLocalUserConfig": JSON.stringify({
      targetLanguage: "de",
      translationMode: "translation",
      translationService: "google-free",
      translationServices: { "hymt-free": { enabled: true, apiKey: "must-not-copy" } },
    }),
  };
  const snapshot = { version: 1, scope: "dashboard-account-services", values, deletedKeys: [], hash: syncHash(values, []) };

  assert.equal(await plugin._applySyncData(JSON.stringify(snapshot)), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "de",
    translationMode: "translation",
    translationService: "google-free",
    localRule: { keep: true },
    translationServices: {
      "bing-free": { enabled: true, localOnly: true },
      "hymt-free": { enabled: true },
    },
  });
  assert.equal(Object.hasOwn(plugin.settings, "targetLanguage"), false);
});

test("Dashboard advanced patch preserves local credentials and merges ordinary service fields", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "zh-CN",
    translationServices: {
      microsoft: { visible: false, apiKey: "local-secret", custom: { keep: true } },
    },
  }));
  const values = {
    "imt-gm-fullLocalUserConfig": JSON.stringify({
      translationServices: {
        microsoft: { visible: true, apiKey: "dashboard-secret", customLabel: "drop-me" },
      },
    }),
  };
  const snapshot = { version: 1, scope: "dashboard-account-services", values, deletedKeys: [], hash: syncHash(values, []) };

  assert.equal(await plugin._applySyncData(JSON.stringify(snapshot)), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "zh-CN",
    translationServices: {
      microsoft: { visible: true, apiKey: "local-secret", custom: { keep: true }, customLabel: "drop-me" },
    },
  });
});

test("Dashboard service sync leaves malformed local runtime configuration untouched", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", "{broken");
  const values = {
    "imt-gm-fullLocalUserConfig": JSON.stringify({
      translationServices: { microsoft: { visible: true } },
    }),
  };
  const snapshot = { version: 1, scope: "dashboard-account-services", values, deletedKeys: [], hash: syncHash(values, []) };

  assert.equal(await plugin._applySyncData(JSON.stringify(snapshot)), false);
  assert.equal(localStorage.getItem("imt-gm-fullLocalUserConfig"), "{broken");
});

test("Dashboard sync cannot delete the floating-ball config", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const before = { targetLanguage: "ja", translationMode: "dual", keep: true };
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify(before));
  const values = {};
  const deletedKeys = ["imt-gm-fullLocalUserConfig"];
  const snapshot = { version: 1, scope: "dashboard-account-services", values, deletedKeys, hash: syncHash(values, deletedKeys) };

  assert.equal(await plugin._applySyncData(JSON.stringify(snapshot)), false);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), before);
});

test("Dashboard host accepts full safe config but still rejects unrelated forged storage keys", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    targetLanguage: "zh-CN",
    translationMode: "dual",
    translationServices: { microsoft: { visible: false, apiKey: "local-secret" } },
  }));
  const values = {
    "imt-gm-fullLocalUserConfig": JSON.stringify({
      targetLanguage: "de",
      translationMode: "translation",
      translationServices: { microsoft: { visible: true, apiKey: "page-secret" } },
    }),
    "imt-gm-usage_limit_stats": JSON.stringify({ forged: true }),
    "imt-gm-translateServices": JSON.stringify({ forged: true }),
  };
  const snapshot = { version: 1, scope: "portable-config", values, deletedKeys: [], hash: syncHash(values, []) };
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: { executeJavaScript: () => Promise.resolve(JSON.stringify(snapshot)) },
  };

  assert.equal(await plugin._syncDashboardConfig(), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    targetLanguage: "de",
    translationMode: "translation",
    translationServices: { microsoft: { visible: true, apiKey: "local-secret" } },
  });
  assert.equal(localStorage.getItem("imt-gm-usage_limit_stats"), null);
  assert.equal(localStorage.getItem("imt-gm-translateServices"), null);
});

test("sync rejects a bad hash without mutating local storage", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ before: true }));
  const values = { "imt-gm-fullLocalUserConfig": JSON.stringify({ after: true }) };
  const result = await plugin._applySyncData(JSON.stringify({ version: 1, values, deletedKeys: [], hash: "00000000" }));
  assert.equal(result, false);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { before: true });
  assert.equal(plugin._lastSyncHash, "");
});

test("sync rejects an unknown scope without mutating local storage", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ before: true }));
  const values = { "imt-gm-fullLocalUserConfig": JSON.stringify({ after: true }) };
  const snapshot = { version: 1, scope: "forged-scope", values, deletedKeys: [], hash: syncHash(values, []) };

  assert.equal(await plugin._applySyncData(JSON.stringify(snapshot)), false);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { before: true });
});

test("sync accepts legacy objects and skips credential-shaped keys", async () => {
  setupRuntime();
  const plugin = makePlugin();
  assert.equal(await plugin._applySyncData(JSON.stringify({
    fullLocalUserConfig: { language: "ja", secret: "no", nested: Object.assign(JSON.parse('{"__proto__":{"polluted":true},"keep":true}'), { subscriptionKey: "no", auth: "no", bearerToken: "no", oauthState: "no", sessionId: "no", key: "no", hotkey: "Alt+T" }) },
    authToken: "must-not-import",
    apiKey: "must-not-import",
    appKey: "must-not-import",
    accessKey: "must-not-import",
    credential: "must-not-import",
    unknownOption: "must-not-import",
    toString: "must-not-import",
    constructor: "must-not-import",
  })), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { language: "ja", nested: { keep: true, hotkey: "Alt+T" } });
  assert.equal(localStorage.getItem("imt-gm-authToken"), null);
  assert.equal(localStorage.getItem("imt-gm-apiKey"), null);
  assert.equal(localStorage.getItem("imt-gm-appKey"), null);
  assert.equal(localStorage.getItem("imt-gm-accessKey"), null);
  assert.equal(localStorage.getItem("imt-gm-credential"), null);
  assert.equal(localStorage.getItem("imt-gm-unknownOption"), null);
  assert.equal(localStorage.getItem("imt-gm-toString"), null);
  assert.equal(localStorage.getItem("imt-gm-constructor"), null);
});

test("sync rolls back failed writes and retries the same snapshot", async () => {
  setupRuntime();
  const plugin = makePlugin();
  localStorage.setItem("imt-gm-translateServices", JSON.stringify({ old: 1 }));
  localStorage.setItem("imt-gm-translateServiceConfig", JSON.stringify({ old: 2 }));
  const originalSetItem = localStorage.setItem.bind(localStorage);
  let fail = true;
  localStorage.setItem = function (key, value) {
    if (fail && key === "imt-gm-translateServiceConfig") throw new Error("quota");
    return originalSetItem(key, value);
  };
  const values = { "imt-gm-translateServices": JSON.stringify({ next: 1 }), "imt-gm-translateServiceConfig": JSON.stringify({ next: 2 }) };
  const snapshot = JSON.stringify({ version: 1, values, deletedKeys: [], hash: syncHash(values, []) });
  assert.equal(await plugin._applySyncData(snapshot), false);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-translateServices")), { old: 1 });
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-translateServiceConfig")), { old: 2 });
  assert.equal(plugin._lastSyncHash, "");
  fail = false;
  assert.equal(await plugin._applySyncData(snapshot), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-translateServices")), { next: 1 });
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-translateServiceConfig")), { next: 2 });
});

test("sync queues concurrent snapshots and skips the same hash", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let notificationCount = 0;
  plugin._notifyUserscriptConfigChange = () => { notificationCount++; };
  const firstValues = { "imt-gm-fullLocalUserConfig": JSON.stringify({ revision: 1 }) };
  const secondValues = { "imt-gm-fullLocalUserConfig": JSON.stringify({ revision: 2 }) };
  const first = { version: 1, values: firstValues, deletedKeys: [], hash: syncHash(firstValues, []) };
  const second = { version: 1, values: secondValues, deletedKeys: [], hash: syncHash(secondValues, []) };
  const results = await Promise.all([plugin._applySyncData(JSON.stringify(first)), plugin._applySyncData(JSON.stringify(second)), plugin._applySyncData(JSON.stringify(second))]);
  assert.deepEqual(results, [true, true, false]);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { revision: 2 });
  assert.equal(notificationCount, 2);
});

test("sync reapplies the same hash after a lifecycle generation change", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let notificationCount = 0;
  plugin._notifyUserscriptConfigChange = () => { notificationCount++; };
  const values = { "imt-gm-fullLocalUserConfig": JSON.stringify({ revision: "dashboard" }) };
  const snapshot = JSON.stringify({ version: 1, values, deletedKeys: [], hash: syncHash(values, []) });

  assert.equal(await plugin._applySyncData(snapshot), true);
  localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({ revision: "local-divergence" }));
  plugin._advanceSyncGeneration();

  assert.equal(plugin._lastSyncHash, "");
  assert.equal(await plugin._applySyncData(snapshot), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), { revision: "dashboard" });
  assert.equal(notificationCount, 2);
});

test("queued sync cannot commit or acknowledge after unload", async () => {
  setupRuntime();
  const plugin = makePlugin();
  let releaseQueue;
  let ackCount = 0;
  plugin._syncApplyChain = new Promise((resolve) => { releaseQueue = resolve; });
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    close() {},
    webContents: { executeJavaScript: () => { ackCount++; return Promise.resolve(); } },
  };
  const values = { "imt-gm-fullLocalUserConfig": JSON.stringify({ revision: "stale" }) };
  const snapshot = { version: 1, values, deletedKeys: [], hash: syncHash(values, []) };

  const applyResult = plugin._applySyncData(JSON.stringify(snapshot));
  plugin.onunload();
  releaseQueue();

  assert.equal(await applyResult, false);
  assert.equal(localStorage.getItem("imt-gm-fullLocalUserConfig"), null);
  assert.equal(plugin._lastSyncHash, "");
  assert.equal(ackCount, 0);
  assert.deepEqual(noticeMessages, []);
});

test("main accepts preload snapshots and ack advances the deletion shadow", async () => {
  setupRuntime();
  localStorage.setItem("imt-gm-authToken", JSON.stringify("sync-token"));
  const plugin = makePlugin();
  const dashboard = createDashboardPreloadRuntime();
  let ackScript = "";
  plugin._dashboardWindow = {
    isDestroyed: () => false,
    webContents: { executeJavaScript: (script) => { ackScript = script; return Promise.resolve(); } },
  };
  dashboard.localStorage.setItem("imt-gm-authToken", JSON.stringify("sync-token"));
  dashboard.localStorage.setItem("imt-gm-userInfo", JSON.stringify({ email: "user@example.com", userType: "pro" }));
  dashboard.localStorage.setItem("imt-gm-fullLocalUserConfig", JSON.stringify({
    translationServices: { microsoft: { enabled: true, apiKey: "dashboard-secret" } },
  }));

  const first = dashboard.__imt_build_sync_snapshot();
  assert.equal(await plugin._applySyncData(JSON.stringify(first)), true);
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-userInfo")), { email: "user@example.com", userType: "pro" });
  assert.deepEqual(JSON.parse(localStorage.getItem("imt-gm-fullLocalUserConfig")), {
    translationServices: { microsoft: { enabled: true } },
  });
  assert.match(ackScript, new RegExp(first.hash));

  dashboard.__run(ackScript);
  dashboard.localStorage.removeItem("imt-gm-userInfo");
  const second = dashboard.__imt_build_sync_snapshot();
  assert.deepEqual(Array.from(second.deletedKeys), ["imt-gm-userInfo"]);
  assert.equal(await plugin._applySyncData(JSON.stringify(second)), true);
  assert.equal(localStorage.getItem("imt-gm-userInfo"), null);
});

test("conflict choices are respected when detection runs", () => {
  setupRuntime();
  const plugin = makePlugin();
  const i18n = { settings: { modeImt: true } };
  const standalone = {};
  let disableCalls = 0;
  plugin.app.plugins.plugins = { i18n, "immersive-translate": standalone };
  plugin.app.plugins.enabledPlugins = new Set(["immersive-translate"]);
  plugin.app.plugins.disablePlugin = () => { disableCalls++; return Promise.resolve(); };
  plugin._showConflictNotice = () => {};
  plugin.saveSettings = async () => {};
  plugin.settings.disableI18NImt = false;
  plugin.settings.disableStandaloneImt = false;

  plugin._detectAndHandleConflicts();
  assert.equal(i18n.settings.modeImt, true);
  assert.equal(disableCalls, 0);
  assert.equal(plugin.app.plugins.enabledPlugins.has("immersive-translate"), true);
});

test("conflict notice renders dynamic content as text nodes", () => {
  setupRuntime();
  const plugin = makePlugin();
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    plugin._showConflictNotice(["<img src=x onerror=alert(1)>"], ["<script>alert(2)</script>"]);
    const notice = document.getElementById("imt-conflict-notice");
    assert.ok(notice);
    assert.deepEqual(notice.children.map((child) => child.tagName), ["H4", "P", "P", "P", "DIV"]);
    assert.equal(notice.children[1].textContent, "检测到：<img src=x onerror=alert(1)>");
    assert.equal(notice.children[2].textContent, "<script>alert(2)</script>");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
  }
});

test("conflict notice offers a current-session pause and an explanation", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin.settings = { disableI18NImt: false, disableStandaloneImt: false };
  let i18nPauses = 0;
  let standalonePauses = 0;
  plugin._disableI18NImtModule = () => { i18nPauses++; return true; };
  plugin._disableStandaloneImt = async () => { standalonePauses++; return true; };

  plugin._showConflictNotice(["I18N", "Immersive Translate"], ["已保留当前状态。"]);
  const notice = document.getElementById("imt-conflict-notice");
  const explanationButton = findElement(notice, (element) => element.textContent === "查看说明");
  explanationButton.dispatchEvent(new Event("click"));
  assert.match(collectText(notice), /本次暂停.*持续选择/);

  const sessionButton = findElement(notice, (element) => element.textContent === "本次暂停冲突项");
  sessionButton.dispatchEvent(new Event("click"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(i18nPauses, 1);
  assert.equal(standalonePauses, 1);
  assert.equal(plugin.settings.disableI18NImt, false);
  assert.equal(plugin.settings.disableStandaloneImt, false);
});

test("conflict notice reports a current-session pause that could not be applied", async () => {
  setupRuntime();
  const plugin = makePlugin();
  plugin._disableI18NImtModule = () => false;
  plugin._disableStandaloneImt = async () => false;

  plugin._showConflictNotice(["I18N", "Immersive Translate"], ["已保留当前状态。"]);
  const notice = document.getElementById("imt-conflict-notice");
  const sessionButton = findElement(notice, (element) => element.textContent === "本次暂停冲突项");
  sessionButton.dispatchEvent(new Event("click"));
  await new Promise((resolve) => setImmediate(resolve));

  assert.match(notice.children[2].textContent, /未能暂停.*I18N.*Immersive Translate/);
  assert.equal(sessionButton.disabled, false);
});

test("conflict changes are restored on unload", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const i18n = { settings: { modeImt: true }, saveSettings() { this.saved = true; } };
  const standalone = {};
  const enabledPlugins = new Set(["immersive-translate"]);
  plugin.app.plugins.plugins = { i18n, "immersive-translate": standalone };
  plugin.app.plugins.enabledPlugins = enabledPlugins;
  plugin.app.plugins.disablePlugin = async (id) => { enabledPlugins.delete(id); delete plugin.app.plugins.plugins[id]; };
  plugin.app.plugins.enablePlugin = async (id) => { enabledPlugins.add(id); plugin.app.plugins.plugins[id] = standalone; };
  plugin._showConflictNotice = () => {};
  plugin.saveSettings = async () => {};
  plugin.settings.disableI18NImt = true;
  plugin.settings.disableStandaloneImt = true;

  plugin._detectAndHandleConflicts();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(i18n.settings.modeImt, false);
  assert.equal(enabledPlugins.has("immersive-translate"), false);

  plugin.onunload();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(i18n.settings.modeImt, true);
  assert.equal(enabledPlugins.has("immersive-translate"), true);
});

test("I18N conflict saves converge on the latest mode", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const pending = [];
  const saveCalls = [];
  const i18n = {
    settings: { modeImt: true },
    saveSettings() {
      const snapshot = this.settings.modeImt;
      saveCalls.push(snapshot);
      return new Promise((resolve) => { pending.push({ snapshot, resolve }); });
    },
  };
  plugin.app.plugins.plugins = { i18n };

  plugin._disableI18NImtModule();
  plugin._restoreI18NImtModule();
  assert.deepEqual(saveCalls, [false, true]);

  pending[1].resolve();
  await Promise.resolve();
  pending[0].resolve();
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(saveCalls, [false, true, true]);
  pending[2].resolve();
  await Promise.resolve();
  assert.equal(saveCalls.at(-1), true);
});

test("replacement instances supersede an older standalone restore", async () => {
  setupRuntime();
  const standalone = {};
  const enabledPlugins = new Set(["immersive-translate"]);
  const calls = [];
  let resolveEnable;
  const app = {
    plugins: {
      plugins: { "immersive-translate": standalone },
      enabledPlugins,
      disablePlugin: async (id) => { calls.push("disable"); enabledPlugins.delete(id); delete app.plugins.plugins[id]; },
      enablePlugin: (id) => {
        calls.push("enable");
        return new Promise((resolve) => { resolveEnable = () => { enabledPlugins.add(id); app.plugins.plugins[id] = standalone; resolve(); }; });
      },
    },
    vault: { adapter: {} },
  };
  const olderPlugin = makePlugin(app);
  const ReplacementPluginClass = loadPluginClass();
  const replacementPlugin = new ReplacementPluginClass(app, { id: "immersive-translate-extended" });
  olderPlugin._isUnloaded = false; replacementPlugin._isUnloaded = false;
  olderPlugin._showConflictNotice = () => {}; replacementPlugin._showConflictNotice = () => {};
  olderPlugin.saveSettings = async () => {}; replacementPlugin.saveSettings = async () => {};
  olderPlugin.settings.disableStandaloneImt = true; replacementPlugin.settings.disableStandaloneImt = true;

  olderPlugin._detectAndHandleConflicts();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["disable"]);
  assert.equal(enabledPlugins.has("immersive-translate"), false);

  olderPlugin.onunload();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["disable", "enable"]);
  replacementPlugin._detectAndHandleConflicts();
  resolveEnable();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(calls, ["disable", "enable", "disable"]);
  assert.equal(enabledPlugins.has("immersive-translate"), false);

  app.plugins.enablePlugin = async (id) => { calls.push("enable"); enabledPlugins.add(id); app.plugins.plugins[id] = standalone; };
  replacementPlugin.onunload();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(enabledPlugins.has("immersive-translate"), true);
});

test("conflict restore does not overwrite a later user choice", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const i18n = { settings: { modeImt: true } };
  const standalone = {};
  const enabledPlugins = new Set(["immersive-translate"]);
  let enableCalls = 0;
  plugin.app.plugins.plugins = { i18n, "immersive-translate": standalone };
  plugin.app.plugins.enabledPlugins = enabledPlugins;
  plugin.app.plugins.disablePlugin = async (id) => { enabledPlugins.delete(id); delete plugin.app.plugins.plugins[id]; };
  plugin.app.plugins.enablePlugin = async (id) => { enableCalls++; enabledPlugins.add(id); plugin.app.plugins.plugins[id] = standalone; };
  plugin._showConflictNotice = () => {};
  plugin.saveSettings = async () => {};
  plugin.settings.disableI18NImt = true;
  plugin.settings.disableStandaloneImt = true;

  plugin._detectAndHandleConflicts();
  await new Promise((resolve) => setImmediate(resolve));
  i18n.settings.modeImt = true;
  enabledPlugins.add("immersive-translate");
  plugin.app.plugins.plugins["immersive-translate"] = standalone;

  plugin.onunload();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(i18n.settings.modeImt, true);
  assert.equal(enableCalls, 0);
});

test("rapid standalone conflict toggles converge on the final desired state", async () => {
  setupRuntime();
  const plugin = makePlugin();
  const standalone = {};
  const enabledPlugins = new Set(["immersive-translate"]);
  const disableResolvers = [];
  const enableResolvers = [];
  const calls = [];
  plugin.app.plugins.plugins = { "immersive-translate": standalone };
  plugin.app.plugins.enabledPlugins = enabledPlugins;
  plugin.app.plugins.disablePlugin = () => {
    calls.push("disable");
    return new Promise((resolve) => disableResolvers.push(() => { enabledPlugins.delete("immersive-translate"); delete plugin.app.plugins.plugins["immersive-translate"]; resolve(); }));
  };
  plugin.app.plugins.enablePlugin = async () => {
    calls.push("enable");
    return new Promise((resolve) => enableResolvers.push(() => { enabledPlugins.add("immersive-translate"); plugin.app.plugins.plugins["immersive-translate"] = standalone; resolve(); }));
  };
  plugin._showConflictNotice = () => {};
  plugin.settings.disableStandaloneImt = true;

  plugin._disableStandaloneImt();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["disable"]);

  plugin.settings.disableStandaloneImt = false;
  plugin._restoreStandaloneImt(false);
  disableResolvers[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["disable", "enable"]);

  plugin.settings.disableStandaloneImt = true;
  plugin._disableStandaloneImt();
  enableResolvers[0]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, ["disable", "enable", "disable"]);

  disableResolvers[1]();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(enabledPlugins.has("immersive-translate"), false);
});
