"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PLUGIN_ID = "immersive-translate-extended";
const PACKAGE_FILES = [
  ["LICENSE", "LICENSE"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ["plugin/dashboard-preload.js", "dashboard-preload.js"],
  ["plugin/document-preload.js", "document-preload.js"],
  ["plugin/document-runtime.js", "document-runtime.js"],
  ["plugin/gm-element.js", "gm-element.js"],
  ["plugin/gm-headers.js", "gm-headers.js"],
  ["plugin/gm-request-body.js", "gm-request-body.js"],
  ["plugin/gm-response-value.js", "gm-response-value.js"],
  ["plugin/main.js", "main.js"],
  ["plugin/manifest.json", "manifest.json"],
  ["plugin/styles.css", "styles.css"],
];

function fail(message) {
  throw new Error(message);
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key || !key.startsWith("--") || value === undefined) fail("Expected --root and --out arguments");
    result[key.slice(2)] = value;
  }
  if (!result.root || !result.out) fail("Missing --root or --out");
  return {
    root: path.resolve(result.root),
    out: path.resolve(result.out),
  };
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { fail("Invalid " + label + ": " + error.message); }
}

function requireRegularFile(filePath, label) {
  let stat;
  try { stat = fs.lstatSync(filePath); }
  catch (error) { fail("Missing " + label); }
  if (!stat.isFile() || stat.isSymbolicLink()) fail(label + " must be a regular file");
}

function resolveLocalJsDependency(filePath, request) {
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(filePath), request));
  return path.posix.extname(resolved) ? resolved : resolved + ".js";
}

function validatePackageJsDependencies(root) {
  const packageDestinations = new Map(PACKAGE_FILES);
  for (const [source, destination] of PACKAGE_FILES) {
    if (!source.endsWith(".js")) continue;
    const code = fs.readFileSync(path.join(root, source), "utf8");
    const localRequire = /\brequire\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
    let match;
    while ((match = localRequire.exec(code)) !== null) {
      const dependencySource = resolveLocalJsDependency(source, match[1]);
      const dependencyDestination = resolveLocalJsDependency(destination, match[1]);
      if (packageDestinations.get(dependencySource) !== dependencyDestination) {
        fail("Package dependency " + dependencySource + " is missing from the ZIP allowlist");
      }
    }
  }
}

function validateVersions(root) {
  const packageJson = readJson(path.join(root, "package.json"), "package.json");
  const manifest = readJson(path.join(root, "plugin", "manifest.json"), "plugin manifest");
  const version = String(packageJson.version || "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail("Invalid package version");
  if (manifest.id !== PLUGIN_ID) fail("Unexpected plugin id");
  if (manifest.version !== version) fail("Package and manifest versions differ");
  const main = fs.readFileSync(path.join(root, "plugin", "main.js"), "utf8");
  const dashboardPreload = fs.readFileSync(path.join(root, "plugin", "dashboard-preload.js"), "utf8");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp('PLUGIN_VERSION\\s*=\\s*["\\\']' + escapedVersion + '["\\\']').test(main)) fail("main.js version differs");
  if (!new RegExp('BRIDGE_VERSION\\s*=\\s*["\\\']' + escapedVersion + '["\\\']').test(dashboardPreload)) fail("Dashboard bridge version differs");
  return { version };
}

function verifyGeneratedPlugin(root) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "check:build", "--silent"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "check:build failed").trim();
    fail("Generated plugin check failed: " + detail);
  }
}

function copyPackageFile(source, destination) {
  requireRegularFile(source, path.basename(source));
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, 0o644);
  const reproducibleTime = new Date("1980-01-01T00:00:00Z");
  fs.utimesSync(destination, reproducibleTime, reproducibleTime);
}

function buildPackage(options) {
  const root = path.resolve(options.root);
  const outputDir = path.resolve(options.out);
  if (fs.existsSync(outputDir)) fail("Package output directory already exists");

  verifyGeneratedPlugin(root);
  const { version } = validateVersions(root);
  for (const [source] of PACKAGE_FILES) requireRegularFile(path.join(root, source), source);
  validatePackageJsDependencies(root);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "imt-plugin-package-"));
  const outputParent = path.dirname(outputDir);
  fs.mkdirSync(outputParent, { recursive: true });
  const artifactDir = fs.mkdtempSync(path.join(outputParent, ".imt-plugin-artifact-"));
  try {
    const packageRoot = path.join(temporaryRoot, PLUGIN_ID);
    fs.mkdirSync(packageRoot);
    for (const [source, destination] of PACKAGE_FILES) {
      copyPackageFile(path.join(root, source), path.join(packageRoot, destination));
    }

    const zipName = PLUGIN_ID + "-" + version + ".zip";
    const zipPath = path.join(artifactDir, zipName);
    const entries = PACKAGE_FILES.map((item) => PLUGIN_ID + "/" + item[1]);
    const zip = spawnSync("zip", ["-X", "-q", zipPath].concat(entries), { cwd: temporaryRoot, encoding: "utf8" });
    if (zip.status !== 0) fail("zip failed: " + String(zip.stderr || zip.stdout || "unknown error").trim());
    fs.renameSync(artifactDir, outputDir);
    return { version, zipPath: path.join(outputDir, zipName) };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    if (fs.existsSync(artifactDir)) fs.rmSync(artifactDir, { recursive: true, force: true });
  }
}

function main() {
  try {
    const result = buildPackage(parseArgs(process.argv.slice(2)));
    process.stdout.write(JSON.stringify({ ok: true, version: result.version, zip: result.zipPath }) + "\n");
  } catch (error) {
    process.stderr.write("Package build failed: " + String(error && error.message || error) + "\n");
    process.exitCode = 1;
  }
}

module.exports = {
  PACKAGE_FILES,
  buildPackage,
  validatePackageJsDependencies,
  validateVersions,
  verifyGeneratedPlugin,
};

if (require.main === module) main();
