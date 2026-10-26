"use strict";

const OFFICIAL_RUNTIME_URL = "https://download.immersivetranslate.com/immersive-translate.user.js";
const OFFICIAL_RUNTIME_RELEASE_BASE = "https://github.com/immersive-translate/immersive-translate/releases/download";
const OFFICIAL_RUNTIME_RELEASE_TAG_PREFIX = "v";
const RUNTIME_FILENAME = "userscript.runtime.js";
// The version the plugin installs when a user returns to a verified runtime.
// It stays an explicit value: a version that is partly compatible must not
// change what "install the verified version" restores.
const SUPPORTED_OFFICIAL_RUNTIME_VERSION = "1.34.1";

// Verified official-runtime compatibility declarations; see docs/RUNTIME.md.
// One entry per official runtime version the plugin has verified, naming the
// compatibility-patch profile that selects its anchor shape, the capabilities
// the plugin may enable there, and the strongest evidence behind the entry.
// An unregistered version resolves to `known: false` with no declared
// capability; the anchor probes still run against that source, and every
// capability that is enabled requires the declaration and the probe to agree.
// RUNTIME_COMPAT_FAMILIES covers a patch-release family whose anchor shape was
// verified on the listed versions: siblings inherit only the capabilities that
// were confirmed to hold across the family, and each one still has to pass its
// own anchor probe.
const RUNTIME_COMPAT_MATRIX = [
  {
    version: "1.34.4",
    profile: "1.34.4",
    evidence: "official-script",
    capabilities: { hostContentBridge: true, lifecycleGuard: true, regionBridge: true, sidePanelWidth: false },
  },
  {
    version: "1.34.1",
    profile: "1.34.x",
    evidence: "live-obsidian",
    capabilities: { hostContentBridge: true, lifecycleGuard: true, regionBridge: true, sidePanelWidth: false },
  },
  {
    version: "1.33.3",
    profile: "1.33.3",
    evidence: "live-obsidian",
    capabilities: { hostContentBridge: true, lifecycleGuard: true, regionBridge: true, sidePanelWidth: false },
  },
  {
    version: "1.33.2",
    profile: "1.33.2",
    evidence: "live-obsidian",
    capabilities: { hostContentBridge: true, lifecycleGuard: true, regionBridge: true, sidePanelWidth: false },
  },
  {
    version: "1.32.10",
    profile: "1.32.x",
    evidence: "official-script",
    capabilities: { hostContentBridge: true, lifecycleGuard: false, regionBridge: true, sidePanelWidth: true },
  },
  {
    version: "1.32.9",
    profile: "1.32.x",
    evidence: "official-script",
    capabilities: { hostContentBridge: true, lifecycleGuard: false, regionBridge: true, sidePanelWidth: true },
  },
  {
    version: "1.32.8",
    profile: "1.32.x",
    evidence: "official-script",
    capabilities: { hostContentBridge: true, lifecycleGuard: false, regionBridge: true, sidePanelWidth: true },
  },
];
// Sibling patch releases of a verified family resolve through this entry.
// Only the connection layer and the side-panel patch held across every 1.32.x
// build that was probed; the legacy region bridge needs the exact anchors of
// 1.32.8-1.32.10 and stays declared there.
const RUNTIME_COMPAT_FAMILIES = [
  {
    family: "1.32.x",
    profile: "1.32.x",
    evidence: "official-script",
    capabilities: { hostContentBridge: true, lifecycleGuard: false, regionBridge: false, sidePanelWidth: true },
  },
];
const RUNTIME_CAPABILITY_NAMES = ["hostContentBridge", "lifecycleGuard", "regionBridge", "sidePanelWidth"];
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

// Reads the declared version of a userscript. A complete metadata block is
// authoritative: when one is present but malformed (no usable `@version`),
// the source stays unreadable instead of falling back to a stray version line
// that the installer would reject. The bare `// @version` fallback only
// applies to sources that carry no metadata block at all (hand-written
// candidates and test fixtures).
function readRuntimeVersion(content) {
  const declared = extractRuntimeVersion(content);
  if (declared) return declared;
  if (typeof content !== "string") return "";
  // The delimiter patterns are line-anchored; scan the source line-wise and
  // strip the BOM first, matching what extractRuntimeVersion reads past.
  const hasDelimiters = content.replace(/^\uFEFF/, "").split(/\r?\n/).some((line) => METADATA_START_PATTERN.test(line) || METADATA_END_PATTERN.test(line));
  if (hasDelimiters) return "";
  const bareSource = content.replace(/^\uFEFF/, "");
  const match = /^[ \t]*\/\/[ \t]*@version[ \t]+([^\s]+)[ \t]*$/m.exec(bareSource);
  return match && isRuntimeVersion(match[1]) ? match[1] : "";
}

function runtimeVersionFamily(version) {
  const parsed = parseRuntimeVersion(version);
  if (!parsed || parsed.numbers.length < 2) return "";
  return parsed.numbers[0] + "." + parsed.numbers[1] + ".x";
}

function noRuntimeCapabilities() {
  const capabilities = {};
  for (const name of RUNTIME_CAPABILITY_NAMES) capabilities[name] = false;
  return capabilities;
}

// Resolves one official runtime version into its declared compatibility.
// Callers enable an enhancement only when the declaration and the anchor probe
// both allow it; an unregistered version never declares one.
function resolveRuntimeCompatibility(version) {
  const unresolved = { version: "", known: false, profile: "", evidence: "", capabilities: noRuntimeCapabilities() };
  if (!isRuntimeVersion(version)) return unresolved;
  const declared = RUNTIME_COMPAT_MATRIX.find((candidate) => candidate.version === version) ||
    RUNTIME_COMPAT_FAMILIES.find((candidate) => candidate.family === runtimeVersionFamily(version));
  if (!declared) return Object.assign({}, unresolved, { version });
  return {
    version,
    known: true,
    profile: declared.profile,
    evidence: declared.evidence,
    capabilities: Object.assign(noRuntimeCapabilities(), declared.capabilities),
  };
}

module.exports = {
  OFFICIAL_RUNTIME_RELEASE_BASE,
  OFFICIAL_RUNTIME_URL,
  RUNTIME_CAPABILITY_NAMES,
  RUNTIME_COMPAT_FAMILIES,
  RUNTIME_COMPAT_MATRIX,
  RUNTIME_FILENAME,
  SUPPORTED_OFFICIAL_RUNTIME_VERSION,
  compareRuntimeVersions,
  extractRuntimeVersion,
  isRuntimeVersion,
  officialRuntimeVersionUrl,
  readRuntimeVersion,
  resolveRuntimeCompatibility,
};
