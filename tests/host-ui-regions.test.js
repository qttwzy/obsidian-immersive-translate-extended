"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { hostRegionForNode, normalizeHostRegions } = require("../plugin/host-ui-regions");

test("settings content changes select the nearest region rather than its whole dialog", () => {
  const body = { nodeType: 1 };
  const modal = { nodeType: 1, className: "modal mod-settings", parentNode: body };
  const content = { nodeType: 1, className: "vertical-tab-content", parentNode: modal };
  const nav = { nodeType: 1, className: "vertical-tab-header", parentNode: modal };
  assert.equal(hostRegionForNode({ nodeType: 3, parentNode: content }, body), "settings-content");
  assert.equal(hostRegionForNode({ nodeType: 1, parentNode: nav }, body), "settings-navigation");
  assert.equal(hostRegionForNode({ nodeType: 1, className: "titlebar", parentNode: body }, body), null);
});

test("region messages reject arbitrary selectors and prototype keys and coalesce duplicates", () => {
  assert.deepEqual(normalizeHostRegions(["settings-content", "body", "__proto__", "constructor", null, "settings-content", "settings-navigation"]), ["settings-content", "settings-navigation"]);
  assert.deepEqual(normalizeHostRegions("settings-content"), []);
});
