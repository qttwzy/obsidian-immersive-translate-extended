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
});

test("active bridges distinguish the plugin version from the loaded userscript version", () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const entry = fs.readFileSync(path.join(ROOT, "plugin", "main.entry.js"), "utf8");
  const preload = fs.readFileSync(path.join(ROOT, "plugin", "dashboard-preload.js"), "utf8");

  assert.match(entry, /extractRuntimeVersion/);
  assert.match(entry, /_imtUserscriptVersion/);
  assert.match(entry, /_imtBridgeVersion: PLUGIN_VERSION/);
  assert.match(preload, new RegExp("BRIDGE_VERSION = \\\"" + packageJson.version.replace(/\\./g, "\\\\.") + "\\\""));
  const { createDashboardPreload } = require("../scripts/build-plugin");
  assert.doesNotMatch(createDashboardPreload(), /\brequire\(\s*["']\.\//);
});

test("Obsidian release entry embeds every required local runtime module", () => {
  const { createBundle } = require("../scripts/build-plugin");
  const bundle = createBundle();
  const factories = new Set([...bundle.matchAll(/__imtFactories\["([^"]+)"\]/g)].map((match) => match[1]));

  assert.match(bundle, /__imtFactories/);
  assert.doesNotMatch(bundle, /\brequire\(\s*["']\.\//);
  for (const match of bundle.matchAll(/__imtRequire\("([^"]+)"\)/g)) {
    assert.ok(factories.has(match[1]), "missing factory for " + match[1]);
  }
});

test("build rejects a local require without a registered module", () => {
  const { assertLocalModulesRegistered } = require("../scripts/build-plugin");

  assert.throws(
    () => assertLocalModulesRegistered(["var x = require(\"./not-registered\");"], ["sync-protocol"]),
    /not-registered/,
  );
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

test("the verified runtime version is pinned in the contract and installed from its own release", () => {
  const entry = fs.readFileSync(path.join(ROOT, "plugin", "main.entry.js"), "utf8");
  const installer = fs.readFileSync(path.join(ROOT, "plugin", "runtime-installer.js"), "utf8");
  const contractSource = fs.readFileSync(path.join(ROOT, "plugin", "runtime-contract.js"), "utf8");
  const contract = require("../plugin/runtime-contract");

  assert.match(contractSource, /SUPPORTED_OFFICIAL_RUNTIME_VERSION\s*=\s*"\d/);
  assert.equal(contract.isRuntimeVersion(contract.SUPPORTED_OFFICIAL_RUNTIME_VERSION), true);
  assert.equal(
    contract.officialRuntimeVersionUrl(contract.SUPPORTED_OFFICIAL_RUNTIME_VERSION),
    "https://github.com/immersive-translate/immersive-translate/releases/download/v" + contract.SUPPORTED_OFFICIAL_RUNTIME_VERSION + "/immersive-translate.user.js",
  );
  assert.match(entry, /_installSupportedRuntime/);
  assert.match(entry, /officialRuntimeVersionUrl/);
  assert.match(entry, /compareRuntimeVersions/);
  assert.match(installer, /expectedVersion/);
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
