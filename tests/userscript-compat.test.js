"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  DEFAULT_MOCK_SIDE_PANEL_WIDTH,
  OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE,
  OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE,
  OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE,
  OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH,
  patchUserscriptHostContentBridge,
  patchUserscriptHostRegionBridge,
  patchUserscriptHostLifecycleGuard,
  patchUserscriptSidePanelMinWidth,
} = require("../plugin/userscript-compat");
const {
  actual1328HostBridgeFixture,
  actual1332HostBridgeFixture,
  actual1332HostLifecycleFixture,
  hostBridgeFixture,
  hostRegionBridgeFixture,
  legacyHostRegionBridgeFixture,
  renamedTransportHostBridgeFixture,
} = require("./helpers/userscript-host-bridge");

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function lifecycleHarness(overrides = {}, source = actual1332HostLifecycleFixture()) {
  const events = [];
  const controls = {
    events,
    R9e: async (context) => context,
    ao: async () => ({ allowed: true }),
    Nu: async () => {},
    Yt: async (_url, state) => ({ translationService: "test", targetLanguage: "en", config: {}, state }),
    ...overrides,
  };
  const result = patchUserscriptHostLifecycleGuard(source);
  assert.equal(result.changed, true);
  const { k1t, fo } = new Function("controls", result.source + "\nreturn {k1t,fo};")(controls);
  return { events, k1t, fo, result };
}

function regionHarness(version = "1.33.2", overrides = {}) {
  const document = { roots: new Map(), querySelectorAll(selector) { return this.roots.get(selector) || []; } };
  function element(parent = null, options = {}) {
    const node = {
      nodeType: 1, ownerDocument: document, isConnected: true, parentElement: parent,
      children: [], className: options.className || "", id: options.id || "",
      marked: !!options.marked, attributes: new Set(options.attributes || []),
      hasAttribute(name) { return this.attributes.has(name); },
      closest(selector) {
        if (selector !== "[data-imt-p]") return null;
        for (let current = this; current; current = current.parentElement) {
          if (current.hasAttribute("data-imt-p")) return current;
        }
        return null;
      },
      contains(other) { for (let current = other; current; current = current.parentElement) if (current === this) return true; return false; },
    };
    if (parent) parent.children.push(node);
    return node;
  }
  const policy = { active: true, generation: 7, mode: "dual" };
  const globalObject = { __imtHostTranslationPolicy: policy };
  const engine = overrides.engine === undefined ? { id: "engine-1", ctx: {}, translateState: "dual" } : overrides.engine;
  const scans = [];
  const controls = {
    document, globalObject, engine, ur: { hasMark: node => node.marked }, Yr: () => false,
    scan: request => { scans.push(request); request.container.marked = true; return overrides.scan?.(request); },
    onParagraph: overrides.onParagraph,
  };
  const base = hostRegionBridgeFixture(version);
  const withContent = patchUserscriptHostContentBridge(base);
  assert.equal(withContent.reason, "patched");
  const patched = patchUserscriptHostRegionBridge(withContent.source);
  assert.equal(patched.reason, "patched");
  const runtime = new Function("controls", patched.source + "\nreturn {hostHandler,setEngine(value){Ve=value}};")(controls);
  const send = data => runtime.hostHandler({}, JSON.stringify({ id: "region-request", type: OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE, data }));
  return { document, element, policy, globalObject, engine, scans, patched, runtime, send };
}

test("lifecycle guard rejects a stopped child after passGate resumes", async () => {
  const gate = deferred();
  const policy = { active: true, generation: 3 };
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({ ao: () => gate.promise });
    const task = h.fo({ translationService: "test", targetLanguage: "en", config: {} }, { trigger: "host" });
    await Promise.resolve();
    policy.active = false;
    policy.generation++;
    gate.resolve({ allowed: true });
    await task;
    assert.deepEqual(h.events, []);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

test("lifecycle guard rejects an old policy object even when generation matches", async () => {
  const gate = deferred();
  globalThis.__imtHostTranslationPolicy = { active: true, generation: 3 };
  try {
    const h = lifecycleHarness({ ao: () => gate.promise });
    const task = h.fo({ translationService: "test", targetLanguage: "en", config: {} }, {});
    await Promise.resolve();
    globalThis.__imtHostTranslationPolicy = { active: true, generation: 3 };
    gate.resolve({ allowed: true });
    await task;
    assert.deepEqual(h.events, []);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

test("lifecycle guard rejects a stopped child after preparePreviousPage resumes", async () => {
  const previous = deferred();
  const policy = { active: true, generation: 3 };
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({ Nu: () => previous.promise });
    const task = h.fo({ translationService: "test", targetLanguage: "en", config: {} }, { trigger: "host" });
    await new Promise((resolve) => setImmediate(resolve));
    policy.active = false;
    policy.generation++;
    previous.resolve();
    await task;
    assert.deepEqual(h.events, []);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

test("lifecycle guard rejects a stopped child after fo initial async work", async () => {
  const initialized = deferred();
  const policy = { active: true, generation: 8 };
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({ Yt: () => initialized.promise });
    const task = h.fo({ translationService: "test", targetLanguage: "en", config: {} }, { translationMode: "dual" });
    policy.active = false;
    policy.generation++;
    initialized.resolve({ translationService: "test", targetLanguage: "en", config: {} });
    await task;
    assert.deepEqual(h.events, []);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

test("lifecycle guard avoids G3t when stop happens as Yue returns its session", async () => {
  const policy = { active: true, generation: 8 };
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({ onStartSession: () => { policy.active = false; policy.generation++; } });
    await h.fo({ translationService: "test", targetLanguage: "en", config: {} }, {});
    assert.deepEqual(h.events, ["prepareCurrentPage", "startSession"]);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

test("lifecycle guard rejects stopped initial context work and old host requests after reopening", async () => {
  const context = deferred();
  const policy = { active: true, generation: 4 };
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({
      R9e: () => context.promise,
      Yt: () => { throw new Error("host generation must not become translation state"); },
    });
    const old = h.k1t({ translationService: "test", targetLanguage: "en", config: {} }, { __imtHostGeneration: 4 });
    policy.active = false;
    policy.generation = 5;
    policy.active = true;
    context.resolve({ translationService: "test", targetLanguage: "en", config: {} });
    await old;
    assert.deepEqual(h.events, []);
    await h.fo({ translationService: "test", targetLanguage: "en", config: {} }, { state: "change", __imtHostGeneration: 4 });
    assert.deepEqual(h.events, []);
    await h.k1t({ translationService: "test", targetLanguage: "en", config: {} }, { __imtHostGeneration: 5 });
    assert.deepEqual(h.events, ["prepareCurrentPage", "startSession", "G3t"]);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

test("lifecycle guard captures generation for an official child call without host data", async () => {
  const context = deferred();
  const policy = { active: true, generation: 6 };
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({ R9e: () => context.promise });
    const old = h.k1t({ translationService: "test", targetLanguage: "en", config: {} }, {});
    policy.active = false;
    policy.generation = 7;
    policy.active = true;
    context.resolve({ translationService: "test", targetLanguage: "en", config: {} });
    await old;
    assert.deepEqual(h.events, []);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

test("lifecycle guard keeps official calls without policy working", async () => {
  delete globalThis.__imtHostTranslationPolicy;
  const h = lifecycleHarness();
  await h.k1t({ translationService: "test", targetLanguage: "en", config: {} }, {});
  assert.deepEqual(h.events, ["prepareCurrentPage", "startSession", "G3t"]);
  assert.deepEqual(patchUserscriptHostLifecycleGuard(h.result.source), { source: h.result.source, changed: false, reason: "already-patched" });
});

test("lifecycle guard fails closed on unsupported and ambiguous source", () => {
  const source = actual1332HostLifecycleFixture();
  const older = source.replace("// @version 1.33.2", "// @version 1.32.8");
  const ambiguous = source.replace("function I0(){}", "function I0(){}function I0(){}");
  assert.deepEqual(patchUserscriptHostLifecycleGuard(older), { source: older, changed: false, reason: "unsupported-version" });
  assert.deepEqual(patchUserscriptHostLifecycleGuard(ambiguous), { source: ambiguous, changed: false, reason: "ambiguous-anchor" });
});

test("lifecycle guard supports the renamed 1.33.3 gate and validates the whole patched shape", async () => {
  const source = actual1332HostLifecycleFixture().replace("1.33.2", "1.33.3").replaceAll("Yue", "$ue").replaceAll("B3t", "Y3t");
  const gate = deferred();
  const policy = { active: true, generation: 1 };
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({ ao: () => gate.promise }, source);
    const pending = h.k1t({ translationService: "test", targetLanguage: "en", config: {} }, {});
    await new Promise(resolve => setImmediate(resolve));
    policy.active = false; policy.generation++;
    gate.resolve({ allowed: true });
    await pending;
    assert.deepEqual(h.events, []);
    assert.equal(patchUserscriptHostLifecycleGuard(h.result.source).reason, "already-patched");
    const broken = h.result.source.replace("isCurrent:__imtHostCurrent,", "");
    assert.equal(patchUserscriptHostLifecycleGuard(broken).changed, false);
    assert.equal(patchUserscriptHostLifecycleGuard(broken).reason, "partial-patch");
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

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

test("host bridge patch supports the actual 1.33.2 dispatcher shape", async () => {
  const source = actual1332HostBridgeFixture();
  const result = patchUserscriptHostContentBridge(source);

  assert.equal(result.changed, true);
  assert.equal(result.reason, "patched");
  assert.equal(result.source.includes('o.type==="' + OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE + '"'), true);
  assert.equal(result.source.includes('o.type==="' + OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE + '"'), true);
  assert.equal(result.source.includes("hasPageTranslationStarted:o.data?.hasPageTranslationStarted===!0"), true);
  assert.equal(result.source.includes("await E1t(r,o.data),i={success:!0}"), true);

  const handler = new Function(result.source + "\nreturn hostHandler;")();
  const targetResult = await handler({}, JSON.stringify({
    id: "target-1332",
    type: OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE,
    data: { targetLanguage: " ja ", hasPageTranslationStarted: true },
  }));
  const translateResult = await handler({}, JSON.stringify({
    id: "translate-1332",
    type: OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE,
    data: { targetLanguage: "ja" },
  }));

  assert.deepEqual(targetResult.i, { success: true });
  assert.deepEqual(targetResult.calls, [[
    "Ae",
    { type: "content", topFrame: true, forwardToSubFrames: true },
    { method: "updateTargetLanguage", data: { targetLanguage: "ja", hasPageTranslationStarted: true, trigger: "obsidianHost" } },
  ], ["response", OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE, { success: true }, "target-1332"]]);
  assert.deepEqual(translateResult.i, { success: true });
  assert.deepEqual(translateResult.calls, [
    ["translate", {}, { targetLanguage: "ja" }],
    ["response", OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE, { success: true }, "translate-1332"],
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

test("an old asynchronous previous-page restore cannot clear a reopened child session", async () => {
  const previous = deferred();
  const policy = { active: true, generation: 1 };
  const restored = [];
  globalThis.__imtHostTranslationPolicy = policy;
  try {
    const h = lifecycleHarness({ Nu: () => previous.promise, onRestore: () => restored.push("restore") });
    const old = h.fo({ translationService: "test", targetLanguage: "en", config: {} }, { __imtHostGeneration: 1 });
    await new Promise(resolve => setImmediate(resolve));
    policy.active = false; policy.generation++;
    policy.active = true; policy.generation++;
    previous.resolve();
    await old;
    assert.deepEqual(restored, []);
    assert.deepEqual(h.events, []);
    await h.fo({ translationService: "test", targetLanguage: "en", config: {} }, { __imtHostGeneration: 3 });
    assert.deepEqual(restored, ["restore"]);
    assert.deepEqual(h.events, ["prepareCurrentPage", "startSession", "G3t"]);
  } finally { delete globalThis.__imtHostTranslationPolicy; }
});

for (const version of ["1.33.2", "1.33.3"]) {
  test(`region bridge ${version} scans only a new subtree and leaves old translation in place`, async () => {
    const h = regionHarness(version);
    const root = h.element(null, { marked: true });
    const oldParagraph = h.element(root, { marked: true, attributes: ["data-imt-p"] });
    const oldTranslation = h.element(oldParagraph, { className: "immersive-translate-target-wrapper" });
    const newPage = h.element(root);
    h.document.roots.set(".vertical-tab-content", [root]);

    assert.deepEqual(await h.send({ regions: ["settings-content"], __imtHostGeneration: 7 }), { success: true, scannedRoots: 1 });
    assert.equal(h.scans.length, 1);
    assert.equal(h.scans[0].container, newPage);
    assert.equal(h.scans[0].performancePhase, "dynamic");
    assert.equal(oldParagraph.children[0], oldTranslation);
    assert.equal(oldTranslation.parentElement, oldParagraph);
    assert.equal(oldParagraph.marked, true);
    assert.deepEqual(await h.send({ regions: ["settings-content"], __imtHostGeneration: 7 }), { success: true, scannedRoots: 0 });
    assert.equal(h.scans.length, 1);
    assert.deepEqual(patchUserscriptHostRegionBridge(h.patched.source), { source: h.patched.source, changed: false, reason: "already-patched" });
  });
}

test("legacy 1.32.10 host runtime accepts the regional bridge patch", () => {
  const source = legacyHostRegionBridgeFixture();
  const withContent = patchUserscriptHostContentBridge(source);
  assert.equal(withContent.reason, "patched");
  const patched = patchUserscriptHostRegionBridge(withContent.source);
  assert.equal(patched.reason, "patched");
  assert.equal(patched.changed, true);
  assert.equal((patched.source.match(/__imtHostRegionBridgeV1/g) || []).length, 1);
  assert.doesNotThrow(() => new Function(patched.source));
  assert.deepEqual(patchUserscriptHostRegionBridge(patched.source), { source: patched.source, changed: false, reason: "already-patched" });
});

test("region bridge rejects unknown IDs, selectors, and an unavailable engine", async () => {
  const h = regionHarness();
  assert.deepEqual(await h.send({ regions: [".vertical-tab-content"], __imtHostGeneration: 7 }), { success: false, error: "invalid-region" });
  assert.deepEqual(await h.send({ regions: ["settings-content"], selector: "body", __imtHostGeneration: 7 }), { success: false, error: "invalid-region" });
  assert.deepEqual(await h.send({ regions: [], __imtHostGeneration: 7 }), { success: false, error: "invalid-region" });
  h.runtime.setEngine(null);
  assert.deepEqual(await h.send({ regions: ["settings-content"], __imtHostGeneration: 7 }), { success: false, error: "engine-not-ready" });
  assert.equal(h.scans.length, 0);
});

test("region bridge suppresses a paragraph yielded after host translation stops", async () => {
  const pending = deferred();
  let paragraphCallback;
  let translated = 0;
  const h = regionHarness("1.33.3", {
    scan: request => { paragraphCallback = request.onParagraph; return pending.promise; },
    onParagraph: () => { translated++; },
  });
  const root = h.element();
  h.document.roots.set(".vertical-tab-content", [root]);
  const task = h.send({ regions: ["settings-content"], __imtHostGeneration: 7 });
  h.policy.active = false;
  h.policy.generation++;
  await paragraphCallback({ commonAncestorContainer: root });
  pending.resolve();
  assert.deepEqual(await task, { success: false, error: "stale-host-policy" });
  assert.equal(translated, 0);
});

for (const change of ["stop", "reopen", "replace-engine", "detach-root"]) {
  test(`region bridge stops after an awaited scan when ${change} occurs`, async () => {
    const pending = deferred();
    const h = regionHarness("1.33.3", { scan: () => pending.promise });
    const root = h.element(null, { marked: true });
    h.element(root);
    h.element(root);
    h.document.roots.set(".vertical-tab-content", [root]);

    const task = h.send({ regions: ["settings-content"], __imtHostGeneration: 7 });
    assert.equal(h.scans.length, 1);
    if (change === "stop") { h.policy.active = false; h.policy.generation++; }
    if (change === "reopen") h.globalObject.__imtHostTranslationPolicy = { active: true, generation: 7, mode: "dual" };
    if (change === "replace-engine") h.runtime.setEngine({ id: "engine-2", ctx: {}, translateState: "dual" });
    if (change === "detach-root") root.isConnected = false;
    pending.resolve();

    assert.deepEqual(await task, { success: false, error: change === "detach-root" ? "region-detached" : "stale-host-policy" });
    assert.equal(h.scans.length, 1);
  });
}

test("region bridge leaves unsupported and partially patched sources unchanged", () => {
  const base = patchUserscriptHostContentBridge(hostRegionBridgeFixture()).source;
  const older = base.replace("1.33.2", "1.33.1");
  assert.deepEqual(patchUserscriptHostRegionBridge(older), { source: older, changed: false, reason: "unsupported-version" });
  const missingGuard = base.replace("/* __imtHostLifecycleGuardV1 */", "");
  assert.deepEqual(patchUserscriptHostRegionBridge(missingGuard), { source: missingGuard, changed: false, reason: "prerequisite-not-patched" });
  const patched = patchUserscriptHostRegionBridge(base);
  const partial = patched.source.replace('o.type==="obsidianHostTranslateRegions"', 'o.type==="differentMessage"');
  assert.deepEqual(patchUserscriptHostRegionBridge(partial), { source: partial, changed: false, reason: "partial-patch" });
});

test("a tagged host retry cannot start after its child policy is removed", async () => {
  delete globalThis.__imtHostTranslationPolicy;
  const h = lifecycleHarness();
  await h.k1t({ translationService: "test", targetLanguage: "en", config: {} }, { __imtHostGeneration: 2 });
  await h.fo({ translationService: "test", targetLanguage: "en", config: {} }, { __imtHostGeneration: 2 });
  assert.deepEqual(h.events, []);
});
