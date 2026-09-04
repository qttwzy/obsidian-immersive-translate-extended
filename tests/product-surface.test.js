"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");

test("active plugin version is consistent across release surfaces", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "plugin", "manifest.json"), "utf8"));
  const main = fs.readFileSync(path.join(ROOT, "plugin", "main.js"), "utf8");
  const version = packageJson.version;
  assert.match(version, /^\d+\.\d+\.\d+$/);

  assert.equal(packageJson.version, version);
  assert.equal(manifest.version, version);
  assert.match(main, new RegExp("PLUGIN_VERSION = \\\"" + version.replace(/\\./g, "\\\\.") + "\\\""));
  assert.match(packageJson.scripts.test, /node --test/);
});

test("active bridges distinguish the plugin version from the loaded userscript version", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const entry = fs.readFileSync(path.join(ROOT, "plugin", "main.entry.js"), "utf8");
  const preload = fs.readFileSync(path.join(ROOT, "plugin", "dashboard-preload.js"), "utf8");

  assert.match(entry, /_extractUserscriptVersion/);
  assert.match(entry, /_imtUserscriptVersion/);
  assert.match(entry, /_imtBridgeVersion: PLUGIN_VERSION/);
  assert.match(preload, new RegExp("BRIDGE_VERSION = \\\"" + packageJson.version.replace(/\\./g, "\\\\.") + "\\\""));
});

test("Obsidian release entry embeds local runtime modules", () => {
  const main = fs.readFileSync(path.join(ROOT, "plugin", "main.js"), "utf8");

  assert.match(main, /__imtFactories/);
  assert.doesNotMatch(main, /require\(\"\.\/(?:auth-session-adapter|dashboard-pkce-host|document-runtime|document-workspace|runtime-contract|runtime-installer)\"\)/);
});

test("runtime installation is user initiated from the official source", () => {
  const entry = fs.readFileSync(path.join(ROOT, "plugin", "main.entry.js"), "utf8");
  const installer = fs.readFileSync(path.join(ROOT, "plugin", "runtime-installer.js"), "utf8");
  const contract = fs.readFileSync(path.join(ROOT, "plugin", "runtime-contract.js"), "utf8");

  assert.match(entry, /_installRuntimeFromOfficialSource/);
  assert.match(entry, /loadInstalledRuntime/);
  assert.match(contract, /https:\/\/download\.immersivetranslate\.com\/immersive-translate\.user\.js/);
  assert.match(contract, /@version/);
  assert.match(contract, /==UserScript==/);
  assert.doesNotMatch(installer + contract, /createHash|sha256|node:crypto/);
});

test("production logging does not interpolate account identity", () => {
  const entry = fs.readFileSync(path.join(ROOT, "plugin", "main.entry.js"), "utf8");
  const dashboardPreload = fs.readFileSync(path.join(ROOT, "plugin", "dashboard-preload.js"), "utf8");

  assert.doesNotMatch(entry, /console\.(?:log|info|warn|error)\([^\n]*(?:userInfo\.email|userInfo\.nickname)/);
  assert.doesNotMatch(dashboardPreload, /console\.log|imt-preload-diag|PRELOAD v/);
});

test("public release packaging is built from the checked-out product snapshot", () => {
  const packageScript = fs.readFileSync(path.join(ROOT, "scripts", "package-plugin.js"), "utf8");

  assert.match(packageScript, /validateVersions\(root\)/);
  assert.match(packageScript, /verifyGeneratedPlugin\(root\)/);
  assert.doesNotMatch(packageScript, /PLATFORM_EVIDENCE|release-manifest|generateSbom/);
});

test("public release workflow publishes only the public main snapshot", () => {
  const workflowPath = [
    path.join(ROOT, "public-site", ".github", "workflows", "release.yml"),
    path.join(ROOT, ".github", "workflows", "release.yml"),
  ].find((candidate) => fs.existsSync(candidate));
  assert.ok(workflowPath, "public release workflow is present");
  const workflow = fs.readFileSync(workflowPath, "utf8");

  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /--target "\$GITHUB_SHA"/);
});
