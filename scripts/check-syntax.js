"use strict";

const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const FILES = [
  "plugin/dashboard-preload.js",
  "plugin/document-preload.js",
  "plugin/document-runtime.js",
  "plugin/main.entry.js",
  "plugin/main.js",
  "plugin/runtime-contract.js",
  "plugin/runtime-installer.js",
  "scripts/build-plugin.js",
  "scripts/check-syntax.js",
  "scripts/release-plugin.js",
];

for (const file of FILES) {
  const result = spawnSync(process.execPath, ["--check", path.join(ROOT, file)], { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || ("Syntax check failed: " + file + "\n"));
    process.exit(result.status || 1);
  }
}

process.stdout.write("Syntax checked " + FILES.length + " JavaScript files\n");
