"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  RUNTIME_CAPABILITY_NAMES,
  RUNTIME_COMPAT_FAMILIES,
  RUNTIME_COMPAT_MATRIX,
  readRuntimeVersion,
  SUPPORTED_OFFICIAL_RUNTIME_VERSION,
  resolveRuntimeCompatibility,
} = require("../plugin/runtime-contract");

test("the compatibility matrix registers verified versions with complete capability sets", () => {
  assert.ok(RUNTIME_COMPAT_MATRIX.length > 0);
  for (const entry of RUNTIME_COMPAT_MATRIX) {
    assert.equal(typeof entry.version, "string");
    assert.equal(typeof entry.profile, "string");
    assert.ok(["live-obsidian", "official-script"].includes(entry.evidence), "unexpected evidence: " + entry.evidence);
    assert.deepEqual(Object.keys(entry.capabilities).sort(), [...RUNTIME_CAPABILITY_NAMES].sort());
    for (const name of RUNTIME_CAPABILITY_NAMES) {
      assert.equal(typeof entry.capabilities[name], "boolean", entry.version + " declares a non-boolean " + name);
    }
  }
  const versions = RUNTIME_COMPAT_MATRIX.map((entry) => entry.version);
  assert.equal(new Set(versions).size, versions.length, "duplicate matrix version");
  for (const entry of RUNTIME_COMPAT_FAMILIES) {
    assert.equal(typeof entry.family, "string");
    assert.equal(typeof entry.profile, "string");
    assert.deepEqual(Object.keys(entry.capabilities).sort(), [...RUNTIME_CAPABILITY_NAMES].sort());
  }
});

test("the pinned fallback version keeps an explicit live-observed declaration", () => {
  const entry = RUNTIME_COMPAT_MATRIX.find((candidate) => candidate.version === SUPPORTED_OFFICIAL_RUNTIME_VERSION);
  assert.ok(entry, "the pinned fallback version is not registered in the matrix");
  assert.equal(entry.evidence, "live-obsidian");
  assert.equal(entry.capabilities.hostContentBridge, true);
  assert.equal(entry.capabilities.lifecycleGuard, true);
  assert.equal(entry.capabilities.regionBridge, true);
});

test("a verified 1.33.x version resolves its full automatic capability set", () => {
  for (const version of ["1.33.2", "1.33.3"]) {
    const resolved = resolveRuntimeCompatibility(version);
    assert.equal(resolved.known, true);
    assert.equal(resolved.profile, version);
    assert.equal(resolved.evidence, "live-obsidian");
    assert.equal(resolved.capabilities.hostContentBridge, true);
    assert.equal(resolved.capabilities.lifecycleGuard, true);
    assert.equal(resolved.capabilities.regionBridge, true);
    // The anchored side-panel declaration is gone from the official 1.33.x
    // builds, so the declaration stays false instead of claiming the patch.
    assert.equal(resolved.capabilities.sidePanelWidth, false);
  }
});

test("the legacy 1.32.x profile resolves through its verified family", () => {
  for (const version of ["1.32.8", "1.32.9", "1.32.10"]) {
    const resolved = resolveRuntimeCompatibility(version);
    assert.equal(resolved.known, true);
    assert.equal(resolved.profile, "1.32.x");
    assert.equal(resolved.evidence, "official-script");
    assert.equal(resolved.capabilities.hostContentBridge, true);
    assert.equal(resolved.capabilities.lifecycleGuard, false);
    assert.equal(resolved.capabilities.regionBridge, true);
  }
});

test("an unverified sibling of a verified family inherits only the confirmed capabilities", () => {
  for (const version of ["1.32.7", "1.32.11"]) {
    const resolved = resolveRuntimeCompatibility(version);
    assert.equal(resolved.known, true);
    assert.equal(resolved.profile, "1.32.x");
    assert.equal(resolved.capabilities.hostContentBridge, true);
    assert.equal(resolved.capabilities.sidePanelWidth, true);
    // The legacy region bridge is declared only for the probed 1.32.8-1.32.10
    // builds, so an unprobed sibling cannot report drift against it.
    assert.equal(resolved.capabilities.regionBridge, false);
    assert.equal(resolved.capabilities.lifecycleGuard, false);
  }
});

test("the 1.34.x profile registers the verified official runtime", () => {
  const resolved = resolveRuntimeCompatibility("1.34.1");
  assert.equal(resolved.known, true);
  assert.equal(resolved.profile, "1.34.x");
  assert.equal(resolved.evidence, "live-obsidian");
  assert.equal(resolved.capabilities.hostContentBridge, true);
  assert.equal(resolved.capabilities.lifecycleGuard, true);
  assert.equal(resolved.capabilities.regionBridge, true);
  assert.equal(resolved.capabilities.sidePanelWidth, false);
});

test("a malformed metadata block is unreadable instead of falling back to a stray version line", () => {
  const malformed = "// ==UserScript==\n// @version 1.34.1\n// @version 9.9.9\n// ==/UserScript==\nwindow.x=1;";
  assert.equal(readRuntimeVersion(malformed), "");
  assert.equal(resolveRuntimeCompatibility(readRuntimeVersion(malformed)).known, false);
  // A bare version line without any metadata delimiters still resolves.
  assert.equal(readRuntimeVersion("// @version 1.34.1\nwindow.x=1;"), "1.34.1");
});

test("an unregistered version resolves to no declared capability", () => {
  for (const version of ["1.35.0", "1.33.1", "1.33.3-beta.1", "2.0.0"]) {
    const resolved = resolveRuntimeCompatibility(version);
    assert.equal(resolved.known, false, "unexpected declaration for " + version);
    assert.equal(resolved.version, version);
    assert.equal(resolved.profile, "");
    for (const name of RUNTIME_CAPABILITY_NAMES) {
      assert.equal(resolved.capabilities[name], false, version + " declared " + name);
    }
  }
});

test("an invalid version resolves to no declared capability", () => {
  for (const value of ["", "latest", "v1.33.3", "1", "1.2.3.4.5", null, undefined, 133]) {
    const resolved = resolveRuntimeCompatibility(value);
    assert.equal(resolved.known, false);
    assert.equal(resolved.version, "");
  }
});

test("each resolution returns an independent capability object", () => {
  const first = resolveRuntimeCompatibility("1.33.3");
  first.capabilities.regionBridge = false;
  assert.equal(resolveRuntimeCompatibility("1.33.3").capabilities.regionBridge, true);
  assert.equal(RUNTIME_COMPAT_MATRIX.find((entry) => entry.version === "1.33.3").capabilities.regionBridge, true);
});
