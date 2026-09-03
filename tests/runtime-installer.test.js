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
