"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { test } = require("node:test");

const ROOT = path.join(__dirname, "..");
const RELEASE_SCRIPT = path.join(ROOT, "scripts", "release-plugin.js");
const OFFICIAL_RUNTIME_URL = "https://download.immersivetranslate.com/immersive-translate.user.js";
const { validateReleaseJsDependencies } = require(RELEASE_SCRIPT);

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function commitFixtureProject(projectRoot, message) {
  const add = spawnSync("git", ["add", "-A"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(add.status, 0, add.stderr);
  const commit = spawnSync("git", [
    "-c", "user.name=Release Fixture",
    "-c", "user.email=release-fixture@example.invalid",
    "commit", "-q", "-m", message,
  ], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(commit.status, 0, commit.stderr);
  const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(head.status, 0, head.stderr);
  return head.stdout.trim();
}

function createReleaseFixture(t) {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "imt-release-package-"));
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
  writeJson(path.join(projectRoot, "package-lock.json"), {
    name: "fixture",
    version: "4.0.0",
    lockfileVersion: 3,
    requires: true,
    packages: { "": { name: "fixture", version: "4.0.0" } },
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

  const init = spawnSync("git", ["init", "-q"], { cwd: projectRoot, encoding: "utf8" });
  assert.equal(init.status, 0, init.stderr);
  const releaseCommit = commitFixtureProject(projectRoot, "release fixture");
  const platformEvidencePath = path.join(fixtureRoot, "platform-evidence.json");
  writeJson(platformEvidencePath, {
    schemaVersion: 1,
    pluginVersion: "4.0.0",
    minimumObsidianVersion: "1.12.7",
    commit: releaseCommit,
    testedAt: "2026-09-01T00:00:00Z",
    platforms: {
      macos: { status: "passed", runtimeVersion: "9.7.3", evidence: "https://example.com/macos-rc" },
      windows: { status: "passed", runtimeVersion: "9.8.0", evidence: "https://example.com/windows-rc" },
    },
  });

  return { projectRoot, outputDir, platformEvidencePath, releaseCommit };
}

function runRelease(fixture) {
  return spawnSync(process.execPath, [
    RELEASE_SCRIPT,
    "--root", fixture.projectRoot,
    "--platform-evidence", fixture.platformEvidencePath,
    "--out", fixture.outputDir,
  ], { encoding: "utf8" });
}

test("active release JavaScript dependencies are complete", () => {
  assert.doesNotThrow(() => validateReleaseJsDependencies(ROOT));
});

test("release command builds the complete plugin ZIP", (t) => {
  const fixture = createReleaseFixture(t);
  const result = runRelease(fixture);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const zipName = "immersive-translate-extended-4.0.0.zip";
  const zipPath = path.join(fixture.outputDir, zipName);
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

  const sbomName = "immersive-translate-extended-4.0.0.spdx.json";
  const manifestName = "release-manifest.json";
  const sbom = JSON.parse(fs.readFileSync(path.join(fixture.outputDir, sbomName), "utf8"));
  const manifest = JSON.parse(fs.readFileSync(path.join(fixture.outputDir, manifestName), "utf8"));
  assert.equal(sbom.spdxVersion, "SPDX-2.3");
  assert.equal(sbom.packages.some((item) => item.name === "Immersive Translate userscript runtime"), false);
  assert.equal(manifest.commit, fixture.releaseCommit);
  assert.deepEqual(manifest.runtimeSetup, {
    source: OFFICIAL_RUNTIME_URL,
    testedVersions: { macos: "9.7.3", windows: "9.8.0" },
    method: "user-initiated",
  });
  assert.deepEqual(manifest.support, {
    minimumObsidianVersion: "1.12.7",
    verifiedPlatforms: ["macos", "windows"],
    testedAt: "2026-09-01T00:00:00Z",
    evidence: {
      macos: "https://example.com/macos-rc",
      windows: "https://example.com/windows-rc",
    },
  });

  const expectedZipHash = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
  assert.equal(manifest.assets[zipName].sha256, expectedZipHash);
  const expectedSums = [zipName, sbomName, manifestName].sort().map((name) => {
    const hash = crypto.createHash("sha256").update(fs.readFileSync(path.join(fixture.outputDir, name))).digest("hex");
    return hash + "  " + name;
  }).join("\n") + "\n";
  assert.equal(fs.readFileSync(path.join(fixture.outputDir, "SHA256SUMS"), "utf8"), expectedSums);
});

test("release command requires the standalone JavaScript dependency closure", (t) => {
  const fixture = createReleaseFixture(t);
  fs.writeFileSync(
    path.join(fixture.projectRoot, "plugin", "document-preload.js"),
    'require("./missing-document-runtime");\n',
  );
  commitFixtureProject(fixture.projectRoot, "missing release dependency");

  const result = runRelease(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /release dependency.*ZIP allowlist/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});

test("release command stops when the generated plugin is stale", (t) => {
  const fixture = createReleaseFixture(t);
  fs.writeFileSync(
    path.join(fixture.projectRoot, "scripts", "build-plugin.js"),
    'process.stderr.write("plugin/main.js is stale\\n"); process.exitCode = 1;\n',
  );
  commitFixtureProject(fixture.projectRoot, "stale generated plugin");

  const result = runRelease(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /generated plugin/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});

test("release command requires passed macOS and Windows evidence", (t) => {
  const fixture = createReleaseFixture(t);
  const evidence = JSON.parse(fs.readFileSync(fixture.platformEvidencePath, "utf8"));
  evidence.platforms.windows = { status: "pending", evidence: "" };
  writeJson(fixture.platformEvidencePath, evidence);

  const result = runRelease(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Windows platform evidence/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});

test("release command binds platform evidence to the exact commit", (t) => {
  const fixture = createReleaseFixture(t);
  const evidence = JSON.parse(fs.readFileSync(fixture.platformEvidencePath, "utf8"));
  evidence.commit = "0".repeat(40);
  writeJson(fixture.platformEvidencePath, evidence);

  const result = runRelease(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /platform evidence commit/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});

test("release command requires a tested runtime version for each platform", (t) => {
  const fixture = createReleaseFixture(t);
  const evidence = JSON.parse(fs.readFileSync(fixture.platformEvidencePath, "utf8"));
  evidence.platforms.windows.runtimeVersion = "";
  writeJson(fixture.platformEvidencePath, evidence);

  const result = runRelease(fixture);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /Windows platform runtime version/i);
  assert.equal(fs.existsSync(fixture.outputDir), false);
});
