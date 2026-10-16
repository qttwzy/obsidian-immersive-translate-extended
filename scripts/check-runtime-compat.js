#!/usr/bin/env node
"use strict";

// Official-runtime compatibility smoke check. It fetches (or reads) the
// official userscript, resolves its version against RUNTIME_COMPAT_MATRIX,
// and runs the static anchor probes the plugin uses at activation time. The
// script itself is never executed.
//
// Exit codes:
//   0  every declared capability probed successfully
//   1  usage or internal error
//   2  the official script could not be fetched or its version unreadable
//   3  drift: the version is unregistered or a declared capability moved

const fs = require("node:fs");

const {
  OFFICIAL_RUNTIME_URL,
  RUNTIME_CAPABILITY_NAMES,
  SUPPORTED_OFFICIAL_RUNTIME_VERSION,
  readRuntimeVersion,
  resolveRuntimeCompatibility,
} = require("../plugin/runtime-contract");
const {
  OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH,
  patchUserscriptHostContentBridge,
  patchUserscriptHostLifecycleGuard,
  patchUserscriptHostRegionBridge,
  patchUserscriptSidePanelMinWidth,
} = require("../plugin/userscript-compat");

const EXIT_CODES = { ok: 0, usage: 1, source: 2, drift: 3 };
const FETCH_TIMEOUT_MS = 30000;
const CAPABILITY_LABELS = {
  hostContentBridge: "宿主内容桥（Dashboard 设置同步）",
  lifecycleGuard: "生命周期保护（设置窗口的自动翻译）",
  regionBridge: "区域增量补译（设置窗口的局部重译）",
  sidePanelWidth: "侧栏宽度补丁",
};

function probeSource(source) {
  const compatibility = resolveRuntimeCompatibility(readRuntimeVersion(source));
  const probes = {};
  let patched = source;
  probes.sidePanelWidth = patchUserscriptSidePanelMinWidth(patched, OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH);
  if (compatibility.capabilities.sidePanelWidth) patched = probes.sidePanelWidth.source;
  probes.hostContentBridge = patchUserscriptHostContentBridge(patched);
  patched = probes.hostContentBridge.source;
  probes.lifecycleGuard = patchUserscriptHostLifecycleGuard(patched);
  patched = probes.lifecycleGuard.source;
  probes.regionBridge = patchUserscriptHostRegionBridge(patched);
  return { compatibility, probes };
}

function buildRuntimeCompatReport(source, options) {
  const meta = options && typeof options === "object" ? options : {};
  const version = typeof source === "string" ? readRuntimeVersion(source) : "";
  const { compatibility, probes } = typeof source === "string" && version
    ? probeSource(source)
    : { compatibility: resolveRuntimeCompatibility(version), probes: {} };
  const capabilities = {};
  const failedDeclared = [];
  for (const name of RUNTIME_CAPABILITY_NAMES) {
    const probe = probes[name] || { changed: false, reason: "source-unreadable" };
    const declared = compatibility.capabilities[name] === true;
    const probed = probe.changed === true || probe.reason === "already-patched";
    // The host content bridge is the connection layer: it stays available on
    // its probe result, while every automatic capability also needs a
    // declaration for the probed version.
    capabilities[name] = { declared, probed, enabled: probed && (name === "hostContentBridge" || declared), reason: probe.reason };
    if (declared && !probed) failedDeclared.push(name);
  }
  const status = !version ? "unreadable" : !compatibility.known ? "unregistered" : failedDeclared.length ? "drift" : "ok";
  const exitCode = status === "ok" ? EXIT_CODES.ok : status === "unreadable" ? EXIT_CODES.source : EXIT_CODES.drift;
  return {
    schemaVersion: 1,
    source: meta.source || "official-cdn",
    url: meta.url || OFFICIAL_RUNTIME_URL,
    checkedAt: new Date().toISOString(),
    version,
    known: compatibility.known,
    profile: compatibility.profile,
    evidence: compatibility.evidence,
    expectedVersion: SUPPORTED_OFFICIAL_RUNTIME_VERSION,
    status,
    exitCode,
    capabilities,
    failedDeclared,
  };
}

function formatRuntimeCompatReport(report) {
  const lines = [
    "## 官方运行时兼容冒烟",
    "",
    "- 来源：" + report.source,
    "- 官方版本：" + (report.version || "未读取到 @version"),
    "- 矩阵状态：" + (report.known ? "已登记（" + report.profile + "，证据 " + report.evidence + "）" : "未登记"),
    "- 结果：" + report.status + "（退出码 " + report.exitCode + "）",
    "",
    "| 能力 | 矩阵声明 | 锚点探测 | 结论 | 探测结果 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const name of RUNTIME_CAPABILITY_NAMES) {
    const capability = report.capabilities[name] || {};
    lines.push("| " + (CAPABILITY_LABELS[name] || name) + " | " +
      (capability.declared ? "允许" : "未声明") + " | " +
      (capability.probed ? "通过" : "未通过") + " | " +
      (capability.enabled ? "启用" : "未启用") + " | " +
      (capability.reason || "未探测") + " |");
  }
  if (report.failedDeclared.length > 0) {
    lines.push("", "已登记但探测失败：" + report.failedDeclared.map((name) => CAPABILITY_LABELS[name] || name).join("、"));
  }
  lines.push("", "宿主内容桥属连接层，按锚点探测保留；其余能力要求版本已登记且探测通过。");
  lines.push("", "已验证回退版本：v" + report.expectedVersion + "；核对与处理步骤见 `docs/RELEASE_READINESS.md`。");
  return lines.join("\n");
}

function parseArgs(argv) {
  const options = { source: "", url: "", report: "", json: false, help: false };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--json") options.json = true;
    else if (argument === "--help") options.help = true;
    else if (argument === "--source" || argument === "--url" || argument === "--report") {
      const value = argv[++index];
      if (typeof value !== "string" || !value) return { error: argument + " needs a value" };
      if (argument === "--source") options.source = value;
      else if (argument === "--url") options.url = value;
      else options.report = value;
    } else return { error: "unknown argument: " + argument };
  }
  return { options };
}

async function fetchOfficialRuntime(url) {
  const response = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error("HTTP " + response.status);
  return await response.text();
}

async function runRuntimeCompatCheck(argv, io) {
  const output = io && io.stdout && typeof io.stdout.write === "function" ? io.stdout : process.stdout;
  const errorOutput = io && io.stderr && typeof io.stderr.write === "function" ? io.stderr : process.stderr;
  const loadRemote = io && typeof io.fetchRuntime === "function" ? io.fetchRuntime : fetchOfficialRuntime;
  const parsed = parseArgs(argv);
  if (parsed.error) {
    errorOutput.write("check-runtime-compat: " + parsed.error + "\n");
    return EXIT_CODES.usage;
  }
  const { options } = parsed;
  if (options.help) {
    output.write("Usage: node scripts/check-runtime-compat.js [--source <file>] [--url <url>] [--json] [--report <file>]\n");
    return EXIT_CODES.ok;
  }
  const url = options.url || OFFICIAL_RUNTIME_URL;
  let source = "";
  let sourceLabel = "official-cdn";
  try {
    if (options.source) {
      source = fs.readFileSync(options.source, "utf8");
      sourceLabel = options.source;
    } else {
      source = await loadRemote(url);
    }
  } catch (error) {
    errorOutput.write("check-runtime-compat: cannot read the official runtime (" + (error && error.message ? error.message : "unknown error") + ")\n");
    return EXIT_CODES.source;
  }
  const report = buildRuntimeCompatReport(source, { source: sourceLabel, url });
  if (!report.version) {
    errorOutput.write("check-runtime-compat: the source has no readable @version\n");
    return EXIT_CODES.source;
  }
  const markdown = formatRuntimeCompatReport(report);
  if (options.report) fs.writeFileSync(options.report, markdown + "\n", "utf8");
  if (options.json) output.write(JSON.stringify(report, null, 2) + "\n");
  else output.write(markdown + "\n");
  return report.exitCode;
}

if (require.main === module) {
  runRuntimeCompatCheck(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
    if (code === EXIT_CODES.drift) process.stderr.write("check-runtime-compat: official runtime drifted from the compatibility matrix\n");
  }).catch((error) => {
    process.stderr.write("check-runtime-compat: " + (error && error.stack ? error.stack : String(error)) + "\n");
    process.exitCode = EXIT_CODES.usage;
  });
}

module.exports = {
  EXIT_CODES,
  buildRuntimeCompatReport,
  formatRuntimeCompatReport,
  parseArgs,
  runRuntimeCompatCheck,
};
