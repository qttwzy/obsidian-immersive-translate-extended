"use strict";

const fs = require("node:fs");
const path = require("node:path");
const runtimeContract = require("./runtime-contract");
const OFFICIAL_RUNTIME_URL = runtimeContract.OFFICIAL_RUNTIME_URL;
const RUNTIME_FILENAME = runtimeContract.RUNTIME_FILENAME;
const extractRuntimeVersion = runtimeContract.extractRuntimeVersion;

function runtimePath(pluginDir) {
  if (typeof pluginDir !== "string" || pluginDir.trim().length === 0) {
    throw new Error("Plugin directory is unavailable");
  }
  return path.join(path.resolve(pluginDir), RUNTIME_FILENAME);
}

function loadInstalledRuntime({ pluginDir }) {
  const filePath = runtimePath(pluginDir);
  let content;
  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") throw new Error("Runtime is not installed");
    throw error;
  }
  const version = extractRuntimeVersion(content);
  if (!version) throw new Error("Runtime version is missing or invalid");
  return { content, version, source: OFFICIAL_RUNTIME_URL };
}

function replaceRuntimeFile(filePath, temporaryPath) {
  try {
    fs.renameSync(temporaryPath, filePath);
    return;
  } catch (error) {
    if (!fs.existsSync(filePath)) throw error;
  }

  const backupPath = filePath + ".backup-" + process.pid + "-" + Date.now();
  fs.renameSync(filePath, backupPath);
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (!fs.existsSync(filePath) && fs.existsSync(backupPath)) fs.renameSync(backupPath, filePath);
    throw error;
  }
  try { fs.unlinkSync(backupPath); } catch (error) {}
}

function installRuntime({ pluginDir, content }) {
  const version = extractRuntimeVersion(content);
  if (!version) throw new Error("Runtime version is missing or invalid");
  const filePath = runtimePath(pluginDir);
  const temporaryPath = filePath + ".installing-" + process.pid + "-" + Date.now();
  try {
    fs.writeFileSync(temporaryPath, content, { encoding: "utf8", flag: "wx", mode: 0o600 });
    replaceRuntimeFile(filePath, temporaryPath);
  } finally {
    try { if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath); } catch (error) {}
  }
  return { content, version, source: OFFICIAL_RUNTIME_URL };
}

module.exports = {
  OFFICIAL_RUNTIME_URL,
  RUNTIME_FILENAME,
  extractRuntimeVersion,
  installRuntime,
  loadInstalledRuntime,
};
