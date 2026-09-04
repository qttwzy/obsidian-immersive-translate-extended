"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const PACKAGE_SCRIPT = path.join(ROOT, "scripts", "package-plugin.js");

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function createPackageFixture(t) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "imt-plugin-package-"));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const projectRoot = path.join(fixtureRoot, "project");
  const pluginDir = path.join(projectRoot, "plugin");
  const scriptsDir = path.join(projectRoot, "scripts");
  const outputDir = path.join(fixtureRoot, "output");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.mkdirSync(scriptsDir);

  writeJson(path.join(projectRoot, "package.json"), {
    name: "fixture",
    version: "4.0.0",
    scripts: { "check:build": "node scripts/build-plugin.js --check" },
  });
  fs.writeFileSync(path.join(scriptsDir, "build-plugin.js"), '"use strict";\n');
  writeJson(path.join(pluginDir, "manifest.json"), {
    id: "immersive-translate-extended",
    name: "Immersive Translate Extended",
    version: "4.0.0",
    minAppVersion: "1.12.7",
  });
  fs.writeFileSync(path.join(pluginDir, "main.js"), 'var PLUGIN_VERSION = "4.0.0";\n');
  fs.writeFileSync(path.join(pluginDir, "styles.css"), ".imt { display: block; }\n");
  fs.writeFileSync(path.join(pluginDir, "dashboard-preload.js"), 'var BRIDGE_VERSION = "4.0.0";\n');
  fs.writeFileSync(path.join(pluginDir, "document-preload.js"), 'require("./document-runtime");\n');
  fs.writeFileSync(path.join(pluginDir, "document-runtime.js"), '"use strict";\n');
  fs.writeFileSync(path.join(projectRoot, "LICENSE"), "Fixture license\n");
  fs.writeFileSync(path.join(projectRoot, "THIRD_PARTY_NOTICES.md"), "# Third-party notices\n");

  return { projectRoot, outputDir };
}

function runPackage(fixture) {
  return spawnSync(process.execPath, [
    PACKAGE_SCRIPT,
    "--root", fixture.projectRoot,
    "--out", fixture.outputDir,
  ], { encoding: "utf8" });
}

test("package command builds exactly one complete plugin ZIP", (t) => {
  const fixture = createPackageFixture(t);
  const result = runPackage(fixture);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(fs.readdirSync(fixture.outputDir), ["immersive-translate-extended-4.0.0.zip"]);
  const zipPath = path.join(fixture.outputDir, "immersive-translate-extended-4.0.0.zip");
  const entries = spawnSync("unzip", ["-Z1", zipPath], { encoding: "utf8" });
  assert.equal(entries.status, 0, entries.stderr);
  assert.deepEqual(entries.stdout.trim().split("\n"), [
    "immersive-translate-extended/LICENSE",
    "immersive-translate-extended/THIRD_PARTY_NOTICES.md",
    "immersive-translate-extended/dashboard-preload.js",
    "immersive-translate-extended/document-preload.js",
    "immersive-translate-extended/document-runtime.js",
    "immersive-translate-extended/main.js",
    "immersive-translate-extended/manifest.json",
    "immersive-translate-extended/styles.css",
  ]);
});

test("package command requires the standalone JavaScript dependency closure", (t) => {
  const fixture = createPackageFixture(t);
  fs.writeFileSync(
    path.join(fixture.projectRoot, "plugin", "document-preload.js"),
    'require("./missing-document-runtime");\n',
  );

  const result = runPackage(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /dependency.*ZIP allowlist/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});

test("package command stops when the generated plugin is stale", (t) => {
  const fixture = createPackageFixture(t);
  fs.writeFileSync(
    path.join(fixture.projectRoot, "scripts", "build-plugin.js"),
    'process.stderr.write("plugin/main.js is stale\\n"); process.exitCode = 1;\n',
  );

  const result = runPackage(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /generated plugin/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});

test("package command requires synchronized versions", (t) => {
  const fixture = createPackageFixture(t);
  const manifestPath = path.join(fixture.projectRoot, "plugin", "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = "4.0.1";
  writeJson(manifestPath, manifest);

  const result = runPackage(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /versions differ/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});

test("package command rejects symlinked ZIP inputs", (t) => {
  const fixture = createPackageFixture(t);
  const stylesPath = path.join(fixture.projectRoot, "plugin", "styles.css");
  const outsidePath = path.join(path.dirname(fixture.projectRoot), "outside.css");
  fs.writeFileSync(outsidePath, ".outside {}\n");
  fs.unlinkSync(stylesPath);
  fs.symlinkSync(outsidePath, stylesPath);

  const result = runPackage(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /regular file/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});
