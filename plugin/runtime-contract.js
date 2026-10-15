"use strict";

const OFFICIAL_RUNTIME_URL = "https://download.immersivetranslate.com/immersive-translate.user.js";
const OFFICIAL_RUNTIME_RELEASE_BASE = "https://github.com/immersive-translate/immersive-translate/releases/download";
const OFFICIAL_RUNTIME_RELEASE_TAG_PREFIX = "v";
const RUNTIME_FILENAME = "userscript.runtime.js";
const SUPPORTED_OFFICIAL_RUNTIME_VERSION = "1.33.3";
const RUNTIME_VERSION_PATTERN = /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const NUMERIC_IDENTIFIER_PATTERN = /^\d+$/;
const METADATA_START_PATTERN = /^[ \t]*\/\/[ \t]*==UserScript==[ \t]*$/;
const METADATA_END_PATTERN = /^[ \t]*\/\/[ \t]*==\/UserScript==[ \t]*$/;
const VERSION_LINE_PATTERN = /^[ \t]*\/\/[ \t]*@version[ \t]+([^\s]+)[ \t]*$/;

function isRuntimeVersion(value) {
  return typeof value === "string" && RUNTIME_VERSION_PATTERN.test(value);
}

function officialRuntimeVersionUrl(version) {
  if (!isRuntimeVersion(version)) return "";
  return OFFICIAL_RUNTIME_RELEASE_BASE + "/" + OFFICIAL_RUNTIME_RELEASE_TAG_PREFIX + version + "/immersive-translate.user.js";
}

function parseRuntimeVersion(value) {
  if (!isRuntimeVersion(value)) return null;
  const withoutBuildMetadata = value.split("+")[0];
  const prereleaseSeparator = withoutBuildMetadata.indexOf("-");
  const core = prereleaseSeparator === -1 ? withoutBuildMetadata : withoutBuildMetadata.slice(0, prereleaseSeparator);
  const prerelease = prereleaseSeparator === -1 ? "" : withoutBuildMetadata.slice(prereleaseSeparator + 1);
  return { numbers: core.split(".").map(Number), prerelease };
}

function comparePrereleaseIdentifiers(left, right) {
  const leftIdentifiers = left.split(".");
  const rightIdentifiers = right.split(".");
  const length = Math.max(leftIdentifiers.length, rightIdentifiers.length);
  for (let index = 0; index < length; index++) {
    const leftIdentifier = leftIdentifiers[index];
    const rightIdentifier = rightIdentifiers[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;
    const leftIsNumeric = NUMERIC_IDENTIFIER_PATTERN.test(leftIdentifier);
    const rightIsNumeric = NUMERIC_IDENTIFIER_PATTERN.test(rightIdentifier);
    if (leftIsNumeric && rightIsNumeric) return Number(leftIdentifier) < Number(rightIdentifier) ? -1 : 1;
    if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1;
    return leftIdentifier < rightIdentifier ? -1 : 1;
  }
  return 0;
}

function compareRuntimeVersions(left, right) {
  const leftVersion = parseRuntimeVersion(left);
  const rightVersion = parseRuntimeVersion(right);
  if (!leftVersion || !rightVersion) return null;
  const length = Math.max(leftVersion.numbers.length, rightVersion.numbers.length);
  for (let index = 0; index < length; index++) {
    const leftNumber = leftVersion.numbers[index] || 0;
    const rightNumber = rightVersion.numbers[index] || 0;
    if (leftNumber !== rightNumber) return leftNumber < rightNumber ? -1 : 1;
  }
  if (leftVersion.prerelease === rightVersion.prerelease) return 0;
  if (!leftVersion.prerelease) return 1;
  if (!rightVersion.prerelease) return -1;
  return comparePrereleaseIdentifiers(leftVersion.prerelease, rightVersion.prerelease);
}

function extractRuntimeVersion(content) {
  if (typeof content !== "string") return "";
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const starts = [];
  const ends = [];
  for (let index = 0; index < lines.length; index++) {
    if (METADATA_START_PATTERN.test(lines[index])) starts.push(index);
    if (METADATA_END_PATTERN.test(lines[index])) ends.push(index);
  }
  if (starts.length !== 1 || ends.length !== 1 || starts[0] >= ends[0]) return "";

  const versions = [];
  for (let index = starts[0] + 1; index < ends[0]; index++) {
    const match = lines[index].match(VERSION_LINE_PATTERN);
    if (match) versions.push(match[1]);
  }
  return versions.length === 1 && isRuntimeVersion(versions[0]) ? versions[0] : "";
}

module.exports = {
  OFFICIAL_RUNTIME_RELEASE_BASE,
  OFFICIAL_RUNTIME_URL,
  RUNTIME_FILENAME,
  SUPPORTED_OFFICIAL_RUNTIME_VERSION,
  compareRuntimeVersions,
  extractRuntimeVersion,
  isRuntimeVersion,
  officialRuntimeVersionUrl,
};
