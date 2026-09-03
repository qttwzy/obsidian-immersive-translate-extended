"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { OFFICIAL_RUNTIME_URL, isRuntimeVersion } = require("../plugin/runtime-contract");

const PLUGIN_ID = "immersive-translate-extended";
const RELEASE_FILES = [
  ["LICENSE", "LICENSE"],
  ["THIRD_PARTY_NOTICES.md", "THIRD_PARTY_NOTICES.md"],
  ["plugin/dashboard-preload.js", "dashboard-preload.js"],
  ["plugin/document-preload.js", "document-preload.js"],
  ["plugin/document-runtime.js", "document-runtime.js"],
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
    if (!key || !key.startsWith("--") || value === undefined) fail("Expected --key value arguments");
    result[key.slice(2)] = value;
  }
  for (const key of ["root", "platform-evidence", "out"]) {
    if (!result[key]) fail("Missing --" + key);
    result[key] = path.resolve(result[key]);
  }
  return result;
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); }
  catch (error) { fail("Invalid " + label + ": " + error.message); }
}

function readJsonFromText(value, label) {
  try { return JSON.parse(value); }
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

function validateReleaseJsDependencies(root) {
  const releaseDestinations = new Map(RELEASE_FILES);
  for (const [source, destination] of RELEASE_FILES) {
    if (!source.endsWith(".js")) continue;
    const code = fs.readFileSync(path.join(root, source), "utf8");
    const localRequire = /\brequire\(\s*["'](\.{1,2}\/[^"']+)["']\s*\)/g;
    let match;
    while ((match = localRequire.exec(code)) !== null) {
      const dependencySource = resolveLocalJsDependency(source, match[1]);
      const dependencyDestination = resolveLocalJsDependency(destination, match[1]);
      if (releaseDestinations.get(dependencySource) !== dependencyDestination) {
        fail("Release dependency " + dependencySource + " is missing from the ZIP allowlist");
      }
    }
  }
}

function validateVersions(root) {
  const packageJson = readJson(path.join(root, "package.json"), "package.json");
  const manifest = readJson(path.join(root, "plugin", "manifest.json"), "plugin manifest");
  const version = String(packageJson.version || "");
  if (!/^\d+\.\d+\.\d+$/.test(version)) fail("Invalid release version");
  if (manifest.id !== PLUGIN_ID) fail("Unexpected plugin id");
  if (manifest.version !== version) fail("Package and manifest versions differ");
  const minimumObsidianVersion = String(manifest.minAppVersion || "");
  if (!/^\d+\.\d+\.\d+$/.test(minimumObsidianVersion)) fail("Invalid minimum Obsidian version");
  const main = fs.readFileSync(path.join(root, "plugin", "main.js"), "utf8");
  const dashboardPreload = fs.readFileSync(path.join(root, "plugin", "dashboard-preload.js"), "utf8");
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp('PLUGIN_VERSION\\s*=\\s*["\\\']' + escapedVersion + '["\\\']').test(main)) fail("main.js version differs");
  if (!new RegExp('BRIDGE_VERSION\\s*=\\s*["\\\']' + escapedVersion + '["\\\']').test(dashboardPreload)) fail("Dashboard bridge version differs");
  return { version, minimumObsidianVersion };
}

function verifyGeneratedPlugin(root) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, ["run", "check:build", "--silent"], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || "check:build failed").trim();
    fail("Generated plugin check failed: " + detail);
  }
}

function resolveReleaseCommit(root) {
  const head = spawnSync("git", ["rev-parse", "--verify", "HEAD"], { cwd: root, encoding: "utf8" });
  if (head.status !== 0) fail("Release source is not a Git commit");
  const commit = String(head.stdout || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(commit)) fail("Release commit is invalid");
  const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8" });
  if (status.status !== 0) fail("Release source status could not be read");
  if (String(status.stdout || "").trim()) fail("Release source must be a clean commit");
  return commit;
}

function addCommitWorktree(root, commit, destination) {
  const result = spawnSync("git", ["worktree", "add", "--detach", "--force", destination, commit], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) fail("Release commit snapshot failed: " + String(result.stderr || result.stdout || "unknown error").trim());
}

function removeCommitWorktree(root, destination) {
  const result = spawnSync("git", ["worktree", "remove", "--force", destination], { cwd: root, encoding: "utf8" });
  if (result.status === 0) return;
  fs.rmSync(destination, { recursive: true, force: true });
  spawnSync("git", ["worktree", "prune"], { cwd: root, encoding: "utf8" });
}

function validatePlatformEvidence(evidencePath, releaseInfo) {
  requireRegularFile(evidencePath, "platform evidence");
  const record = readJson(evidencePath, "platform evidence");
  if (record.schemaVersion !== 1) fail("Unsupported platform evidence schema");
  if (record.pluginVersion !== releaseInfo.version) fail("Platform evidence version differs");
  if (record.minimumObsidianVersion !== releaseInfo.minimumObsidianVersion) fail("Platform evidence Obsidian version differs");
  if (record.commit !== releaseInfo.commit) fail("Platform evidence commit differs");
  if (!Number.isFinite(Date.parse(record.testedAt))) fail("Platform evidence date is invalid");
  const evidence = {};
  const runtimeVersions = {};
  for (const platform of ["macos", "windows"]) {
    const result = record.platforms && record.platforms[platform];
    const label = platform === "macos" ? "macOS" : "Windows";
    if (!result || result.status !== "passed") fail(label + " platform evidence has not passed");
    if (!isRuntimeVersion(result.runtimeVersion)) fail(label + " platform runtime version is invalid");
    try {
      if (new URL(result.evidence).protocol !== "https:") fail(label + " platform evidence must use HTTPS");
    } catch (error) {
      fail(label + " platform evidence is invalid");
    }
    evidence[platform] = result.evidence;
    runtimeVersions[platform] = result.runtimeVersion;
  }
  return {
    runtimeVersions,
    support: {
      minimumObsidianVersion: releaseInfo.minimumObsidianVersion,
      verifiedPlatforms: ["macos", "windows"],
      testedAt: record.testedAt,
      evidence,
    },
  };
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function generateSbom(root) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npmCommand, [
    "sbom",
    "--omit=dev",
    "--package-lock-only",
    "--sbom-format", "spdx",
    "--sbom-type", "application",
  ], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) fail("SBOM generation failed: " + String(result.stderr || result.stdout || "unknown error").trim());
  const sbom = readJsonFromText(result.stdout, "generated SBOM");
  if (sbom.spdxVersion !== "SPDX-2.3") fail("Generated SBOM is not SPDX 2.3");
  return sbom;
}

function copyReleaseFile(source, destination) {
  requireRegularFile(source, path.basename(source));
  fs.copyFileSync(source, destination);
  fs.chmodSync(destination, 0o644);
  const reproducibleTime = new Date("1980-01-01T00:00:00Z");
  fs.utimesSync(destination, reproducibleTime, reproducibleTime);
}

function buildRelease(options) {
  const root = path.resolve(options.root);
  const platformEvidencePath = path.resolve(options["platform-evidence"]);
  const outputDir = path.resolve(options.out);
  if (fs.existsSync(outputDir)) fail("Release output directory already exists");
  const releaseCommit = resolveReleaseCommit(root);

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "imt-release-build-"));
  const sourceRoot = path.join(temporaryRoot, "source");
  const outputParent = path.dirname(outputDir);
  fs.mkdirSync(outputParent, { recursive: true });
  const artifactDir = fs.mkdtempSync(path.join(outputParent, ".imt-release-artifacts-"));
  let worktreeAdded = false;
  try {
    addCommitWorktree(root, releaseCommit, sourceRoot);
    worktreeAdded = true;
    verifyGeneratedPlugin(sourceRoot);
    const releaseInfo = validateVersions(sourceRoot);
    releaseInfo.commit = releaseCommit;
    const version = releaseInfo.version;
    for (const [source] of RELEASE_FILES) requireRegularFile(path.join(sourceRoot, source), source);
    validateReleaseJsDependencies(sourceRoot);
    const evidence = validatePlatformEvidence(platformEvidencePath, releaseInfo);

    const packageRoot = path.join(temporaryRoot, PLUGIN_ID);
    fs.mkdirSync(packageRoot);
    for (const [source, destination] of RELEASE_FILES) {
      copyReleaseFile(path.join(sourceRoot, source), path.join(packageRoot, destination));
    }

    const zipName = PLUGIN_ID + "-" + version + ".zip";
    const sbomName = PLUGIN_ID + "-" + version + ".spdx.json";
    const manifestName = "release-manifest.json";
    const zipPath = path.join(artifactDir, zipName);
    const sbomPath = path.join(artifactDir, sbomName);
    const manifestPath = path.join(artifactDir, manifestName);
    const sumsPath = path.join(artifactDir, "SHA256SUMS");

    const entries = RELEASE_FILES.map((item) => PLUGIN_ID + "/" + item[1]).sort();
    const zip = spawnSync("zip", ["-X", "-q", zipPath].concat(entries), { cwd: temporaryRoot, encoding: "utf8" });
    if (zip.status !== 0) fail("zip failed: " + String(zip.stderr || zip.stdout || "unknown error").trim());
    fs.writeFileSync(sbomPath, JSON.stringify(generateSbom(sourceRoot), null, 2) + "\n", { flag: "wx" });
    const zipHash = sha256File(zipPath);
    const sbomHash = sha256File(sbomPath);
    const manifest = {
      schemaVersion: 1,
      pluginId: PLUGIN_ID,
      version,
      commit: releaseInfo.commit,
      runtimeSetup: {
        source: OFFICIAL_RUNTIME_URL,
        testedVersions: evidence.runtimeVersions,
        method: "user-initiated",
      },
      support: evidence.support,
      assets: {
        [zipName]: { sha256: zipHash, bytes: fs.statSync(zipPath).size },
        [sbomName]: { sha256: sbomHash, bytes: fs.statSync(sbomPath).size },
      },
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    const sumNames = [zipName, sbomName, manifestName].sort();
    const sums = sumNames.map((name) => sha256File(path.join(artifactDir, name)) + "  " + name).join("\n") + "\n";
    fs.writeFileSync(sumsPath, sums, { flag: "wx" });
    fs.renameSync(artifactDir, outputDir);
    return {
      version,
      zipPath: path.join(outputDir, zipName),
      sumsPath: path.join(outputDir, "SHA256SUMS"),
    };
  } finally {
    if (worktreeAdded) removeCommitWorktree(root, sourceRoot);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
    if (fs.existsSync(artifactDir)) fs.rmSync(artifactDir, { recursive: true, force: true });
  }
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = buildRelease(options);
    process.stdout.write(JSON.stringify({ ok: true, version: result.version, zip: result.zipPath, sums: result.sumsPath }) + "\n");
  } catch (error) {
    process.stderr.write("Release build failed: " + String(error && error.message || error) + "\n");
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { buildRelease, validateReleaseJsDependencies };
