"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  EXIT_CODES,
  buildRuntimeCompatReport,
  formatRuntimeCompatReport,
  parseArgs,
  runRuntimeCompatCheck,
} = require("../scripts/check-runtime-compat");
const {
  actual1328HostBridgeFixture,
  legacyHostRegionBridgeFixture,
} = require("./helpers/userscript-host-bridge");
const { RUNTIME_CAPABILITY_NAMES } = require("../plugin/runtime-contract");

const SIDE_PANEL_DECLARATION = 'var gN=435,Jge="mock-side-panel-width",pN="cursor-mock-side-panel-host";';

function registeredLegacyFixture() {
  return legacyHostRegionBridgeFixture().replace("// @version 1.32.10", "// @version 1.32.10\n" + SIDE_PANEL_DECLARATION);
}

function tempSource(t, content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "imt-runtime-compat-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, "runtime.js");
  fs.writeFileSync(file, content, "utf8");
  return file;
}

test("a registered runtime with every declared capability probes clean", () => {
  const report = buildRuntimeCompatReport(registeredLegacyFixture(), { source: "fixture" });

  assert.equal(report.version, "1.32.10");
  assert.equal(report.known, true);
  assert.equal(report.status, "ok");
  assert.equal(report.exitCode, EXIT_CODES.ok);
  assert.deepEqual(report.failedDeclared, []);
  assert.equal(report.capabilities.hostContentBridge.enabled, true);
  assert.equal(report.capabilities.regionBridge.enabled, true);
  assert.equal(report.capabilities.sidePanelWidth.enabled, true);
  assert.equal(report.capabilities.lifecycleGuard.declared, false);
  for (const name of RUNTIME_CAPABILITY_NAMES) {
    assert.equal(typeof report.capabilities[name].reason, "string");
  }
});

test("an unregistered official version reports drift and keeps only the probed connection layer", () => {
  const source = actual1328HostBridgeFixture().replace("1.32.8", "1.35.0");
  const report = buildRuntimeCompatReport(source, { source: "fixture" });

  assert.equal(report.version, "1.35.0");
  assert.equal(report.known, false);
  assert.equal(report.status, "unregistered");
  assert.equal(report.exitCode, EXIT_CODES.drift);
  assert.equal(report.capabilities.hostContentBridge.probed, true);
  // The connection layer stays available on its probe result even for an
  // unregistered version; every automatic capability stays off.
  assert.equal(report.capabilities.hostContentBridge.enabled, true);
  assert.equal(report.capabilities.lifecycleGuard.probed, false);
  assert.equal(report.capabilities.lifecycleGuard.enabled, false);
  assert.equal(report.capabilities.regionBridge.enabled, false);
});

test("an unverified family sibling reports ok when its confirmed capabilities probe clean", () => {
  const source = actual1328HostBridgeFixture().replace("// @version 1.32.8", "// @version 1.32.7\n" + SIDE_PANEL_DECLARATION);
  const report = buildRuntimeCompatReport(source, { source: "fixture" });

  assert.equal(report.version, "1.32.7");
  assert.equal(report.known, true);
  assert.equal(report.status, "ok");
  assert.equal(report.exitCode, EXIT_CODES.ok);
  assert.deepEqual(report.failedDeclared, []);
  assert.equal(report.capabilities.regionBridge.declared, false);
  assert.equal(report.capabilities.regionBridge.enabled, false);
});

test("a registered version whose anchors moved reports the failed capabilities as drift", () => {
  const source = actual1328HostBridgeFixture().replace("1.32.8", "1.33.3");
  const report = buildRuntimeCompatReport(source, { source: "fixture" });

  assert.equal(report.known, true);
  assert.equal(report.status, "drift");
  assert.equal(report.exitCode, EXIT_CODES.drift);
  assert.deepEqual(report.failedDeclared, ["lifecycleGuard", "regionBridge"]);
});

test("a source without a readable version reports an unreadable result", () => {
  const report = buildRuntimeCompatReport("window.__imt = true;\n", { source: "fixture" });

  assert.equal(report.version, "");
  assert.equal(report.status, "unreadable");
  assert.equal(report.exitCode, EXIT_CODES.source);
});

test("the markdown report names every capability and the verified fallback", () => {
  const report = buildRuntimeCompatReport(registeredLegacyFixture(), { source: "fixture" });
  const markdown = formatRuntimeCompatReport(report);

  assert.match(markdown, /## 官方运行时兼容冒烟/);
  assert.match(markdown, /宿主内容桥/);
  assert.match(markdown, /生命周期保护/);
  assert.match(markdown, /区域增量补译（设置窗口的局部重译）/);
  assert.match(markdown, /侧栏宽度补丁/);
  assert.match(markdown, /宿主内容桥（Dashboard 设置同步）/);
  assert.match(markdown, /宿主内容桥属连接层/);
  assert.match(markdown, new RegExp("已验证回退版本：v" + report.expectedVersion.replace(/\./g, "\\.")));
});

test("the CLI reads a local source, writes a JSON report, and returns the drift code", async (t) => {
  const sourcePath = tempSource(t, actual1328HostBridgeFixture().replace("1.32.8", "1.35.0"));
  const reportPath = path.join(path.dirname(sourcePath), "report.md");
  const output = [];
  const io = {
    stdout: { write(chunk) { output.push(String(chunk)); return true; } },
    stderr: { write() { return true; } },
    fetchRuntime: async () => { throw new Error("network must not be used with --source"); },
  };

  const code = await runRuntimeCompatCheck(["--source", sourcePath, "--json", "--report", reportPath], io);

  assert.equal(code, EXIT_CODES.drift);
  const report = JSON.parse(output.join(""));
  assert.equal(report.version, "1.35.0");
  assert.equal(report.source, sourcePath);
  assert.match(fs.readFileSync(reportPath, "utf8"), /官方运行时兼容冒烟/);
});

test("the CLI fetches the official source when no local file is given", async () => {
  const output = [];
  const io = {
    stdout: { write(chunk) { output.push(String(chunk)); return true; } },
    stderr: { write() { return true; } },
    fetchRuntime: async (url) => {
      assert.equal(url, "https://download.immersivetranslate.com/immersive-translate.user.js");
      return actual1328HostBridgeFixture().replace("1.32.8", "1.35.0");
    },
  };

  const code = await runRuntimeCompatCheck(["--json"], io);

  assert.equal(code, EXIT_CODES.drift);
  assert.equal(JSON.parse(output.join("")).source, "official-cdn");
});

test("the CLI separates an unreachable source from drift", async () => {
  const errors = [];
  const io = {
    stdout: { write() { return true; } },
    stderr: { write(chunk) { errors.push(String(chunk)); return true; } },
    fetchRuntime: async () => { throw new Error("HTTP 503"); },
  };

  assert.equal(await runRuntimeCompatCheck([], io), EXIT_CODES.source);
  assert.match(errors.join(""), /HTTP 503/);
  assert.match(errors.join(""), /cannot read the official runtime/);
});

test("the CLI rejects unknown arguments and reports usage", async () => {
  const errors = [];
  const io = {
    stdout: { write() { return true; } },
    stderr: { write(chunk) { errors.push(String(chunk)); return true; } },
  };

  assert.equal(await runRuntimeCompatCheck(["--nope"], io), EXIT_CODES.usage);
  assert.match(errors.join(""), /unknown argument: --nope/);
  assert.equal(await runRuntimeCompatCheck(["--source"], io), EXIT_CODES.usage);
});

test("the CLI reports an unreadable version instead of drift", async (t) => {
  const sourcePath = tempSource(t, "window.__imt = true;\n");
  const errors = [];
  const io = {
    stdout: { write() { return true; } },
    stderr: { write(chunk) { errors.push(String(chunk)); return true; } },
  };

  assert.equal(await runRuntimeCompatCheck(["--source", sourcePath, "--json"], io), EXIT_CODES.source);
  assert.match(errors.join(""), /no readable @version/);
});

test("parseArgs accepts the documented flags", () => {
  assert.deepEqual(parseArgs(["--source", "a.js", "--json", "--report", "r.md", "--url", "https://example.com/x.js"]), {
    options: { source: "a.js", url: "https://example.com/x.js", report: "r.md", json: true, help: false },
  });
  assert.equal(parseArgs(["--help"]).options.help, true);
  assert.match(parseArgs(["--report"]).error, /needs a value/);
});
