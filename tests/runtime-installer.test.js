"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  OFFICIAL_RUNTIME_URL,
  RUNTIME_FILENAME,
  installRuntime,
  loadInstalledRuntime,
} = require("../plugin/runtime-installer");
const {
  SUPPORTED_OFFICIAL_RUNTIME_VERSION,
  compareRuntimeVersions,
  isRuntimeVersion,
  officialRuntimeVersionUrl,
} = require("../plugin/runtime-contract");

const RUNTIME_SOURCE = "// ==UserScript==\n// @version 9.7.3\n// ==/UserScript==\nwindow.__imtRuntime = true;\n";
const UPDATED_RUNTIME_SOURCE = "// ==UserScript==\n// @version 9.8.0\n// ==/UserScript==\nwindow.__imtRuntime = 'updated';\n";

function createPluginDir(t) {
  const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "imt-runtime-installer-"));
  t.after(() => fs.rmSync(pluginDir, { recursive: true, force: true }));
  return pluginDir;
}

test("installs an official userscript with readable version metadata", (t) => {
  const pluginDir = createPluginDir(t);

  const installed = installRuntime({ pluginDir, content: RUNTIME_SOURCE });
  const loaded = loadInstalledRuntime({ pluginDir });

  assert.equal(OFFICIAL_RUNTIME_URL, "https://download.immersivetranslate.com/immersive-translate.user.js");
  assert.equal(RUNTIME_FILENAME, "userscript.runtime.js");
  assert.equal(installed.version, "9.7.3");
  assert.deepEqual(loaded, {
    content: RUNTIME_SOURCE,
    version: "9.7.3",
    source: OFFICIAL_RUNTIME_URL,
  });
});

test("keeps the installed userscript when a download has no version metadata", (t) => {
  const pluginDir = createPluginDir(t);
  installRuntime({ pluginDir, content: RUNTIME_SOURCE });

  assert.throws(
    () => installRuntime({ pluginDir, content: "// @version 9.9.0\nwindow.__invalidRuntime = true;\n" }),
    /version/i,
  );
  assert.equal(fs.readFileSync(path.join(pluginDir, RUNTIME_FILENAME), "utf8"), RUNTIME_SOURCE);
});

test("requires one version inside one complete userscript metadata block", (t) => {
  const pluginDir = createPluginDir(t);
  const ambiguous = "// ==UserScript==\n// @version 9.7.3\n// @version 9.8.0\n// ==/UserScript==\n";

  assert.throws(() => installRuntime({ pluginDir, content: ambiguous }), /version/i);
  assert.equal(fs.existsSync(path.join(pluginDir, RUNTIME_FILENAME)), false);
});

test("replaces an installed userscript with the next official version", (t) => {
  const pluginDir = createPluginDir(t);
  installRuntime({ pluginDir, content: RUNTIME_SOURCE });

  const updated = installRuntime({ pluginDir, content: UPDATED_RUNTIME_SOURCE });

  assert.equal(updated.version, "9.8.0");
  assert.deepEqual(loadInstalledRuntime({ pluginDir }), {
    content: UPDATED_RUNTIME_SOURCE,
    version: "9.8.0",
    source: OFFICIAL_RUNTIME_URL,
  });
});

test("reports a missing local runtime before installation", (t) => {
  const pluginDir = createPluginDir(t);

  assert.throws(() => loadInstalledRuntime({ pluginDir }), /not installed/i);
});

test("the verified runtime version is a valid version with a reproducible release URL", () => {
  assert.equal(isRuntimeVersion(SUPPORTED_OFFICIAL_RUNTIME_VERSION), true);
  assert.equal(
    officialRuntimeVersionUrl(SUPPORTED_OFFICIAL_RUNTIME_VERSION),
    "https://github.com/immersive-translate/immersive-translate/releases/download/v" + SUPPORTED_OFFICIAL_RUNTIME_VERSION + "/immersive-translate.user.js",
  );
  assert.equal(officialRuntimeVersionUrl("1.33.3"), "https://github.com/immersive-translate/immersive-translate/releases/download/v1.33.3/immersive-translate.user.js");
});

test("only well formed versions produce a release URL", () => {
  for (const invalid of ["", "latest", "v1.33.3", "1.33.3/../other", "1", "1.2.3.4.5", null, undefined, 133]) {
    assert.equal(officialRuntimeVersionUrl(invalid), "", "unexpected URL for " + String(invalid));
  }
});

test("runtime version comparison follows the version contract", () => {
  const cases = [
    ["1.33.3", "1.33.3", 0],
    ["1.34.1", "1.33.3", 1],
    ["1.33.3", "1.34.1", -1],
    ["1.33.10", "1.33.9", 1],
    ["1.9.0", "1.10.0", -1],
    ["1.33", "1.33.0", 0],
    ["1.33", "1.33.0.1", -1],
    ["1.33.3.1", "1.33.3", 1],
    ["1.33.3-beta.1", "1.33.3", -1],
    ["1.33.3", "1.33.3-rc.1", 1],
    ["1.33.3-alpha", "1.33.3-beta", -1],
    ["1.33.3-alpha.2", "1.33.3-alpha.10", -1],
    ["1.33.3-alpha", "1.33.3-alpha.1", -1],
    ["1.33.3-alpha.1", "1.33.3-alpha.beta", -1],
    ["1.33.3-1", "1.33.3-alpha", -1],
    ["1.33.3+build.7", "1.33.3", 0],
    ["1.33.3+build.7", "1.33.3+build.9", 0],
    ["1.33.3-rc.1+build.7", "1.33.3-rc.1", 0],
  ];
  for (const [left, right, expected] of cases) {
    assert.equal(compareRuntimeVersions(left, right), expected, left + " vs " + right);
    const reversed = expected === 0 ? 0 : -expected;
    assert.equal(compareRuntimeVersions(right, left), reversed, right + " vs " + left);
  }
});

test("comparison rejects values outside the version contract", () => {
  for (const invalid of ["", "latest", "v1.33.3", "1", "1.2.3.4.5", "1.33.3 ", null, undefined, 133]) {
    assert.equal(compareRuntimeVersions(invalid, "1.33.3"), null, "accepted " + String(invalid));
    assert.equal(compareRuntimeVersions("1.33.3", invalid), null, "accepted " + String(invalid));
  }
});

test("installs a verified version and records the source it was fetched from", (t) => {
  const pluginDir = createPluginDir(t);
  const source = "https://github.com/immersive-translate/immersive-translate/releases/download/v9.7.3/immersive-translate.user.js";

  const installed = installRuntime({ pluginDir, content: RUNTIME_SOURCE, expectedVersion: "9.7.3", source });

  assert.equal(installed.version, "9.7.3");
  assert.equal(installed.source, source);
  assert.equal(loadInstalledRuntime({ pluginDir }).content, RUNTIME_SOURCE);
});

test("a download for another version is rejected before the local file changes", (t) => {
  const pluginDir = createPluginDir(t);
  installRuntime({ pluginDir, content: RUNTIME_SOURCE });

  assert.throws(
    () => installRuntime({ pluginDir, content: UPDATED_RUNTIME_SOURCE, expectedVersion: "9.7.3" }),
    /expected/i,
  );
  assert.equal(fs.readFileSync(path.join(pluginDir, RUNTIME_FILENAME), "utf8"), RUNTIME_SOURCE);
});

test("a mismatched download does not create a local runtime file", (t) => {
  const pluginDir = createPluginDir(t);

  assert.throws(
    () => installRuntime({ pluginDir, content: UPDATED_RUNTIME_SOURCE, expectedVersion: "9.7.3" }),
    /expected/i,
  );
  assert.equal(fs.existsSync(path.join(pluginDir, RUNTIME_FILENAME)), false);
});
