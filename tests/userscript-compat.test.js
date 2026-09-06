"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DEFAULT_MOCK_SIDE_PANEL_WIDTH,
  OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE,
  OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE,
  OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH,
  patchUserscriptHostContentBridge,
  patchUserscriptSidePanelMinWidth,
} = require("../plugin/userscript-compat");
const {
  actual1328HostBridgeFixture,
  hostBridgeFixture,
  renamedTransportHostBridgeFixture,
} = require("./helpers/userscript-host-bridge");

test("adds an executable bounded Obsidian host bridge to a compatible document protocol", async () => {
  const anchor = 'else if(i.type==="switchTranslationMode"){';
  const source = hostBridgeFixture();

  const result = patchUserscriptHostContentBridge(source);

  assert.equal(result.changed, true);
  assert.equal(result.reason, "patched");
  assert.equal(result.source.includes(anchor), true);
  assert.equal(result.source.includes('i.type==="' + OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE + '"'), true);
  assert.equal(result.source.includes('method:"updateTargetLanguage"'), true);
  assert.equal(result.source.includes("hasPageTranslationStarted:i.data?.hasPageTranslationStarted===!0"), true);
  assert.equal(result.source.includes('i.type==="' + OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE + '"'), true);
  assert.equal(result.source.includes("await aKe(r,i.data),a={success:!0}"), true);

  const handler = new Function(result.source + "\nreturn hostHandler;")();
  const targetResult = await handler({ id: "target-1", type: OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE, data: { targetLanguage: " ja ", hasPageTranslationStarted: true } });
  const translateResult = await handler({ id: "translate-1", type: OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE, data: { targetLanguage: "ja" } });
  assert.deepEqual(targetResult.a, { success: true });
  assert.deepEqual(targetResult.calls, [[
    "we",
    { type: "content", topFrame: true, forwardToSubFrames: true },
    { method: "updateTargetLanguage", data: { targetLanguage: "ja", hasPageTranslationStarted: true, trigger: "obsidianHost" } },
  ]]);
  assert.deepEqual(translateResult.a, { success: true });
  assert.deepEqual(translateResult.calls, [["translate", {}, { targetLanguage: "ja" }]]);
});

test("host bridge patch follows a compatible structure across versions and fails closed for ambiguous userscripts", () => {
  const anchor = 'else if(i.type==="switchTranslationMode"){';
  const source = hostBridgeFixture();
  const first = patchUserscriptHostContentBridge(source);
  const compatibleUpgrade = hostBridgeFixture("1.32.8");
  const ambiguous = source.replace(anchor, anchor + anchor);

  assert.deepEqual(patchUserscriptHostContentBridge(first.source), {
    source: first.source,
    changed: false,
    reason: "already-patched",
  });
  assert.equal(patchUserscriptHostContentBridge(compatibleUpgrade).changed, true);
  assert.deepEqual(patchUserscriptHostContentBridge(ambiguous), {
    source: ambiguous,
    changed: false,
    reason: "ambiguous-anchor",
  });
});

test("host bridge patch supports the actual 1.32.8 dispatcher shape", async () => {
  const result = patchUserscriptHostContentBridge(actual1328HostBridgeFixture());

  assert.equal(result.changed, true);
  assert.equal(result.reason, "patched");

  const handler = new Function(result.source + "\nreturn hostHandler;")();
  const targetResult = await handler({ id: "target-1328", type: OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE, data: { targetLanguage: " ja ", hasPageTranslationStarted: true } });
  const translateResult = await handler({ id: "translate-1328", type: OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE, data: { targetLanguage: "ja" } });

  assert.deepEqual(targetResult.a, { success: true });
  assert.deepEqual(targetResult.calls, [[
    "we",
    { type: "content", topFrame: true, forwardToSubFrames: true },
    { method: "updateTargetLanguage", data: { targetLanguage: "ja", hasPageTranslationStarted: true, trigger: "obsidianHost" } },
  ], ["response", OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE, { success: true }, "target-1328"]]);
  assert.deepEqual(translateResult.a, { success: true });
  assert.deepEqual(translateResult.calls, [
    ["translate", {}, { targetLanguage: "ja" }],
    ["response", OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE, { success: true }, "translate-1328"],
  ]);
});

test("host bridge patch reuses a renamed content transport from the dispatcher", async () => {
  const result = patchUserscriptHostContentBridge(renamedTransportHostBridgeFixture());

  assert.equal(result.changed, true);
  assert.equal(result.reason, "patched");

  const handler = new Function(result.source + "\nreturn hostHandler;")();
  const targetResult = await handler({
    id: "target-renamed-transport",
    type: OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE,
    data: { targetLanguage: "fr", hasPageTranslationStarted: false },
  });

  assert.deepEqual(targetResult.a, { success: true });
  assert.deepEqual(targetResult.calls, [[
    "we",
    { type: "content", topFrame: true, forwardToSubFrames: true },
    { method: "updateTargetLanguage", data: { targetLanguage: "fr", hasPageTranslationStarted: false, trigger: "obsidianHost" } },
  ], ["response", OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE, { success: true }, "target-renamed-transport"]]);
});

test("host bridge patch rejects anchors split across different function scopes", () => {
  const source = [
    'function first(i,r){if(i.type==="noop"){}else if(i.type==="translatePage")await unt(r,i.data);}',
    'function second(i){if(i.type==="noop"){}else if(i.type==="switchTranslationMode"){switchMode()}}',
    'function third(i,a){Qe("content",i.type);a!==void 0&&i.id&&Xu(i.type,a,i.id)}',
  ].join(";");

  assert.deepEqual(patchUserscriptHostContentBridge(source), {
    source,
    changed: false,
    reason: "ambiguous-anchor",
  });
});

test("host bridge patch rejects a switch anchor from a different dispatcher", () => {
  const source = [
    'async function outer(i){let a;const r={},unt=async()=>{},Qe=()=>{};if(i.type==="noop"){}else if(i.type==="translatePage")await unt(r,i.data);function nested(i){if(i.type==="noop"){}else if(i.type==="switchTranslationMode"){switchMode()}}Qe("content",i.type);a!==void 0&&i.id&&Qe(i.type,a,i.id)}',
  ].join(";");

  assert.deepEqual(patchUserscriptHostContentBridge(source), {
    source,
    changed: false,
    reason: "ambiguous-anchor",
  });
});

test("host bridge patch rejects a switch anchor nested in another function scope", () => {
  const source = [
    'async function hostHandler(i){let a;const r={},unt=async()=>{},Qe=()=>{};if(i.type==="noop"){}else if(i.type==="translatePage")await unt(r,i.data);const nested=()=>{if(i.type==="noop"){}else if(i.type==="switchTranslationMode"){switchMode()}};Qe("content",i.type);a!==void 0&&i.id&&Xu(i.type,a,i.id)}',
  ].join("");

  assert.deepEqual(patchUserscriptHostContentBridge(source), {
    source,
    changed: false,
    reason: "ambiguous-anchor",
  });
});

test("host bridge patch rejects a translate anchor that leaves an arrow function before the switch anchor", () => {
  const source = [
    'const nested=()=>{if(i.type==="noop"){}else if(i.type==="translatePage")await unt(r,i.data);};if(i.type==="noop"){}else if(i.type==="switchTranslationMode"){switchMode()}else Qe("content",i.type);a!==void 0&&i.id&&Xu(i.type,a,i.id)',
  ].join("");

  assert.deepEqual(patchUserscriptHostContentBridge(source), {
    source,
    changed: false,
    reason: "ambiguous-anchor",
  });
});

test("patches only the upstream minimum width in the anchored minified declaration", () => {
  const source = 'before=435;gN=435,Jge="mock-side-panel-width",pN="cursor-mock-side-panel-host",after=435';

  const result = patchUserscriptSidePanelMinWidth(source);

  assert.deepEqual(result, {
    source: 'before=435;gN=280,Jge="mock-side-panel-width",pN="cursor-mock-side-panel-host",after=435',
    changed: true,
    reason: "patched",
  });
  assert.equal(OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH, 280);
  assert.equal(DEFAULT_MOCK_SIDE_PANEL_WIDTH, 340);
});

test("supports a supplied minimum width and preserves minified identifier and quote variants", () => {
  const source = "x9=435,_key='mock-side-panel-width',$host='cursor-mock-side-panel-host'";

  const result = patchUserscriptSidePanelMinWidth(source, 360);

  assert.deepEqual(result, {
    source: "x9=360,_key='mock-side-panel-width',$host='cursor-mock-side-panel-host'",
    changed: true,
    reason: "patched",
  });
});

test("returns an already-patched source unchanged and remains idempotent", () => {
  const source = 'gN=435,Jge="mock-side-panel-width",pN="cursor-mock-side-panel-host"';
  const first = patchUserscriptSidePanelMinWidth(source);

  assert.deepEqual(patchUserscriptSidePanelMinWidth(first.source), {
    source: first.source,
    changed: false,
    reason: "already-patched",
  });
});

test("leaves source unchanged when either anchor is missing or the declaration shape is unrelated", () => {
  const missingHost = 'gN=435,Jge="mock-side-panel-width"';
  const unrelated = 'Jge="mock-side-panel-width",gN=435,pN="cursor-mock-side-panel-host"';

  assert.deepEqual(patchUserscriptSidePanelMinWidth(missingHost), {
    source: missingHost,
    changed: false,
    reason: "anchor-not-found",
  });
  assert.deepEqual(patchUserscriptSidePanelMinWidth(unrelated), {
    source: unrelated,
    changed: false,
    reason: "anchor-not-found",
  });
});

test("leaves duplicate anchored declarations untouched as ambiguous", () => {
  const declaration = 'gN=435,Jge="mock-side-panel-width",pN="cursor-mock-side-panel-host"';
  const source = declaration + ";" + declaration;

  assert.deepEqual(patchUserscriptSidePanelMinWidth(source), {
    source,
    changed: false,
    reason: "ambiguous-anchor",
  });
});

test("does not rewrite an anchored value that is neither upstream nor requested", () => {
  const source = 'gN=436,Jge="mock-side-panel-width",pN="cursor-mock-side-panel-host"';

  assert.deepEqual(patchUserscriptSidePanelMinWidth(source), {
    source,
    changed: false,
    reason: "unexpected-width",
  });
});
