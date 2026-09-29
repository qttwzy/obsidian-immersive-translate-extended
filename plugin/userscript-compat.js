"use strict";

const { HOST_UI_REGIONS } = require("./host-ui-regions");

const UPSTREAM_MOCK_SIDE_PANEL_MIN_WIDTH = 435;
const OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH = 280;
const DEFAULT_MOCK_SIDE_PANEL_WIDTH = 340;
const MOCK_SIDE_PANEL_WIDTH_KEY = "mock-side-panel-width";
const MOCK_SIDE_PANEL_HOST_KEY = "cursor-mock-side-panel-host";
const OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE = "obsidianHostUpdateTargetLanguage";
const OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE = "obsidianHostTranslatePage";
const OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE = "obsidianHostTranslateRegions";
const MAX_HOST_CONTENT_BRIDGE_DISPATCHER_SPAN = 128 * 1024;
// Minified dispatcher locals change across userscript releases (i/a in 1.32.x,
// o/i in 1.33.x). Capture the names instead of hardcoding them.
const HOST_CONTENT_BRIDGE_ANCHOR_PATTERN = /else if\(([A-Za-z_$][A-Za-z0-9_$]*)\.type(?:===|==)["']switchTranslationMode["']\)\{/;
const HOST_CONTENT_BRIDGE_TRANSLATE_ANCHOR_PATTERN = /else if\(([A-Za-z_$][A-Za-z0-9_$]*)\.type(?:===|==)["']translatePage["']\)(await [A-Za-z_$][A-Za-z0-9_$]*\([A-Za-z_$][A-Za-z0-9_$]*,\1\.data\));/;
const HOST_CONTENT_BRIDGE_RESPONSE_ANCHOR_PATTERN = /([A-Za-z_$][A-Za-z0-9_$]*)\(["']content["'],([A-Za-z_$][A-Za-z0-9_$]*)\.type\);([A-Za-z_$][A-Za-z0-9_$]*)!==void 0&&\2\.id&&[A-Za-z_$][A-Za-z0-9_$]*\(\2\.type,\3,\2\.id\)/;

const MOCK_SIDE_PANEL_DECLARATION = /([A-Za-z_$][A-Za-z0-9_$]*\s*=\s*)(\d+)(\s*,\s*[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(["'])mock-side-panel-width\4\s*,\s*[A-Za-z_$][A-Za-z0-9_$]*\s*=\s*(["'])cursor-mock-side-panel-host\5)/;

function countOccurrences(source, value) {
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(value, offset)) !== -1) {
    count++;
    offset += value.length;
  }
  return count;
}

function findPatternMatches(source, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g";
  return Array.from(source.matchAll(new RegExp(pattern.source, flags)));
}

function containsCodeFunctionKeyword(source, start, end) {
  let state = "code";
  for (let index = start; index < end; index++) {
    const current = source[index];
    const next = source[index + 1];
    if (state === "single" || state === "double") {
      if (current === "\\") index++;
      else if ((state === "single" && current === "'") || (state === "double" && current === '"')) state = "code";
      continue;
    }
    if (state === "line-comment") {
      if (current === "\n" || current === "\r") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") { state = "code"; index++; }
      continue;
    }
    if (current === "'") { state = "single"; continue; }
    if (current === '"') { state = "double"; continue; }
    if (current === "/" && next === "/") { state = "line-comment"; index++; continue; }
    if (current === "/" && next === "*") { state = "block-comment"; index++; continue; }
    if (/[A-Za-z_$]/.test(current)) {
      let token = current;
      while (index + 1 < end && /[A-Za-z0-9_$]/.test(source[index + 1])) token += source[++index];
      if (token === "function") return true;
    }
  }
  return false;
}

function anchorsShareDispatcherScope(source, start, end) {
  let depth = 0;
  let state = "code";
  for (let index = start; index < end; index++) {
    const current = source[index];
    const next = source[index + 1];
    if (state === "single" || state === "double") {
      if (current === "\\") index++;
      else if ((state === "single" && current === "'") || (state === "double" && current === '"')) state = "code";
      continue;
    }
    if (state === "line-comment") {
      if (current === "\n" || current === "\r") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") { state = "code"; index++; }
      continue;
    }
    if (current === "'") { state = "single"; continue; }
    if (current === '"') { state = "double"; continue; }
    if (current === "`") return false;
    if (current === "/" && next === "/") { state = "line-comment"; index++; continue; }
    if (current === "/" && next === "*") { state = "block-comment"; index++; continue; }
    if (current === "/") return false;
    if (current === "{") depth++;
    else if (current === "}") {
      if (depth === 0) return false;
      depth--;
    }
  }
  return state === "code" && depth === 0 && !containsCodeFunctionKeyword(source, start, end);
}

function findEnclosingArrowFunctionBodyStart(source, target) {
  const braceStack = [];
  let state = "code";
  let pendingArrowBody = false;
  let previousSignificant = "";
  for (let index = 0; index < target; index++) {
    const current = source[index];
    const next = source[index + 1];
    if (state === "single" || state === "double" || state === "template") {
      if (current === "\\") index++;
      else if ((state === "single" && current === "'") || (state === "double" && current === '"') || (state === "template" && current === String.fromCharCode(96))) state = "code";
      continue;
    }
    if (state === "line-comment") {
      if (current === "\n" || current === "\r") state = "code";
      continue;
    }
    if (state === "block-comment") {
      if (current === "*" && next === "/") { state = "code"; index++; }
      continue;
    }
    if (state === "regex") {
      if (current === "\\") index++;
      else if (current === "[") state = "regex-class";
      else if (current === "/") state = "code";
      continue;
    }
    if (state === "regex-class") {
      if (current === "\\") index++;
      else if (current === "]") state = "regex";
      continue;
    }
    if (current === "'") { state = "single"; continue; }
    if (current === '"') { state = "double"; continue; }
    if (current === String.fromCharCode(96)) { state = "template"; continue; }
    if (current === "/" && next === "/") { state = "line-comment"; index++; continue; }
    if (current === "/" && next === "*") { state = "block-comment"; index++; continue; }
    if (current === "/" && (!previousSignificant || /[({[=,:;!&|?+\-*%^~<>]/.test(previousSignificant))) { state = "regex"; continue; }
    if (current === "=" && next === ">") {
      let bodyStart = index + 2;
      while (bodyStart < target && /\s/.test(source[bodyStart])) bodyStart++;
      if (bodyStart < target && source[bodyStart] === "{") {
        pendingArrowBody = true;
        index = bodyStart - 1;
      } else {
        index++;
      }
      continue;
    }
    if (current === "{") {
      braceStack.push({ start: index, arrow: pendingArrowBody });
      pendingArrowBody = false;
      previousSignificant = current;
      continue;
    }
    if (current === "}") {
      if (braceStack.length > 0) braceStack.pop();
      pendingArrowBody = false;
      previousSignificant = current;
      continue;
    }
    if (!/\s/.test(current)) previousSignificant = current;
  }
  for (let index = braceStack.length - 1; index >= 0; index--) {
    if (braceStack[index].arrow) return braceStack[index].start;
  }
  return -1;
}

function unchanged(source, reason) {
  return { source, changed: false, reason };
}

function patchUserscriptHostContentBridge(source) {
  if (typeof source !== "string") return unchanged(source, "invalid-source");

  const updateMarkerCount = countOccurrences(source, OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE);
  const translateMarkerCount = countOccurrences(source, OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE);
  if (updateMarkerCount === 1 && translateMarkerCount === 1) return unchanged(source, "already-patched");
  if (updateMarkerCount !== 0 || translateMarkerCount !== 0) return unchanged(source, "partial-patch");

  const switchAnchors = findPatternMatches(source, HOST_CONTENT_BRIDGE_ANCHOR_PATTERN);
  const translateAnchors = findPatternMatches(source, HOST_CONTENT_BRIDGE_TRANSLATE_ANCHOR_PATTERN);
  const responseAnchors = findPatternMatches(source, HOST_CONTENT_BRIDGE_RESPONSE_ANCHOR_PATTERN);
  const anchorCounts = [switchAnchors.length, translateAnchors.length, responseAnchors.length];
  if (anchorCounts.some((count) => count === 0)) return unchanged(source, "anchor-not-found");
  if (anchorCounts.some((count) => count !== 1)) return unchanged(source, "ambiguous-anchor");

  const dispatcherSpan = responseAnchors[0].index - translateAnchors[0].index;
  const translateArrowScope = findEnclosingArrowFunctionBodyStart(source, translateAnchors[0].index);
  const switchArrowScope = findEnclosingArrowFunctionBodyStart(source, switchAnchors[0].index);
  const responseArrowScope = findEnclosingArrowFunctionBodyStart(source, responseAnchors[0].index);
  const messageVar = translateAnchors[0][1];
  if (messageVar !== switchAnchors[0][1] || messageVar !== responseAnchors[0][2]) {
    return unchanged(source, "ambiguous-anchor");
  }
  if (translateAnchors[0].index >= switchAnchors[0].index || switchAnchors[0].index >= responseAnchors[0].index || dispatcherSpan > MAX_HOST_CONTENT_BRIDGE_DISPATCHER_SPAN || translateArrowScope !== switchArrowScope || switchArrowScope !== responseArrowScope || !anchorsShareDispatcherScope(source, translateAnchors[0].index, responseAnchors[0].index)) {
    return unchanged(source, "ambiguous-anchor");
  }

  const translateInvocation = translateAnchors[0][2];
  const contentTransport = responseAnchors[0][1];
  const resultVar = responseAnchors[0][3];
  const targetLanguageVar = "__imtTargetLanguage";
  const hostBridgeSource =
    'else if(' + messageVar + '.type==="' + OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE + '"){let ' + targetLanguageVar + '=' + messageVar + '.data?.targetLanguage;if(typeof ' + targetLanguageVar + '==="string"&&' + targetLanguageVar + '.trim().length>0&&' + targetLanguageVar + '.length<=64){await ' + contentTransport + '({type:"content",topFrame:!0,forwardToSubFrames:!0},{method:"updateTargetLanguage",data:{targetLanguage:' + targetLanguageVar + '.trim(),hasPageTranslationStarted:' + messageVar + '.data?.hasPageTranslationStarted===!0,trigger:"obsidianHost"}}),' + resultVar + '={success:!0}}else ' + resultVar + '={success:!1,error:"invalid-target-language"}}' +
    'else if(' + messageVar + '.type==="' + OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE + '")' + translateInvocation + ',' + resultVar + '={success:!0};';

  return {
    source: source.replace(switchAnchors[0][0], hostBridgeSource + switchAnchors[0][0]),
    changed: true,
    reason: "patched",
  };
}

// This bridge is installed after the host content bridge and lifecycle guard.
// Keep the upstream engine's paragraph callback by calling its own bounded
// traversal wrapper (w9 in 1.33.2, A9 in 1.33.3).
function patchUserscriptHostRegionBridge(source) {
  if (typeof source !== "string") return unchanged(source, "invalid-source");
  if (/^\/\/ @version\s+1\.32\./m.test(source)) return patchLegacyHostRegionBridge(source);
  const version = /^\/\/ @version\s+(1\.33\.[23])\s*$/m.exec(source)?.[1];
  if (!version) return unchanged(source, "unsupported-version");

  const marker = "__imtHostRegionBridgeV1";
  const markerCount = countOccurrences(source, marker);
  const messageCount = countOccurrences(source, OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE);
  if (markerCount > 1 || messageCount > 1 || markerCount !== messageCount) return unchanged(source, "partial-patch");
  if (countOccurrences(source, OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE) !== 1 ||
      countOccurrences(source, "__imtHostLifecycleGuardV1") !== 1) {
    return unchanged(source, "prerequisite-not-patched");
  }

  const identifier = "[A-Za-z_$][A-Za-z0-9_$]*";
  const branchPattern = new RegExp('else if\\((' + identifier + ')\\.type==="' + OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE + '"\\)await ' + identifier + '\\(' + identifier + ',\\1\\.data\\),(' + identifier + ')=\\{success:!0\\};');
  const branches = findPatternMatches(source, branchPattern);
  const responses = findPatternMatches(source, HOST_CONTENT_BRIDGE_RESPONSE_ANCHOR_PATTERN);
  const traverseAssignment = "Ve.traverseContent=" + (version === "1.33.2" ? "Ap" : "Mp") + ",Ve.walkContainer=" + (version === "1.33.2" ? "Ap" : "Mp");
  const wrapperPattern = /async function ([A-Za-z_$][A-Za-z0-9_$]*)\(e,t,n,r\)\{if\(Yr\(\)\)return;let i=Ci\(e\.ctx\);await (?:bp|Tp)\("initial_traverse_ms",\(\)=>e\.traverseContent\(/;
  const wrappers = findPatternMatches(source, wrapperPattern);
  const counts = [branches.length, responses.length, wrappers.length, countOccurrences(source, traverseAssignment)];
  if (counts.some(count => count === 0)) return unchanged(source, "anchor-not-found");
  if (counts.some(count => count !== 1)) return unchanged(source, "ambiguous-anchor");

  const branch = branches[0];
  const response = responses[0];
  const wrapper = wrappers[0];
  const expectedWrapper = version === "1.33.2" ? "w9" : "A9";
  if (wrapper[1] !== expectedWrapper || branch[1] !== response[2] || branch[2] !== response[3] ||
      branch.index >= response.index || response.index - branch.index > MAX_HOST_CONTENT_BRIDGE_DISPATCHER_SPAN ||
      findEnclosingArrowFunctionBodyStart(source, branch.index) !== findEnclosingArrowFunctionBodyStart(source, response.index) ||
      !anchorsShareDispatcherScope(source, branch.index, response.index)) {
    return unchanged(source, "ambiguous-anchor");
  }
  const wrapperBody = source.slice(wrapper.index, wrapper.index + 1300);
  if (!wrapperBody.includes("onParagraph:async") || !wrapperBody.includes("engineCtx:e")) return unchanged(source, "ambiguous-anchor");

  const helper = `async function __imtHostScanRegionsV1(data){/* __imtHostRegionBridgeV1 */
    const selectors=${JSON.stringify(HOST_UI_REGIONS)};
    const names=data?.regions;
    if(!data||typeof data!=="object"||Array.isArray(data)||Object.keys(data).some(key=>key!=="regions"&&key!=="__imtHostGeneration")||!Array.isArray(names)||names.length===0||names.length>16||names.some(name=>typeof name!=="string"||!Object.prototype.hasOwnProperty.call(selectors,name)))return{success:false,error:"invalid-region"};
    const policy=globalThis.__imtHostTranslationPolicy,engine=Ve,engineId=engine?.id,generation=data.__imtHostGeneration;
    if(!engine||!engineId||!engine.ctx||typeof engine.traverseContent!=="function"||typeof engine.walkContainer!=="function"||Yr())return{success:false,error:"engine-not-ready"};
    const current=()=>Number.isSafeInteger(generation)&&generation>=0&&globalThis.__imtHostTranslationPolicy===policy&&policy?.active===true&&policy.generation===generation&&(policy.mode==="dual"||policy.mode==="translation")&&Ve===engine&&engine.id===engineId&&!Yr()&&(engine.translateState==="dual"||engine.translateState==="translation");
    if(!current())return{success:false,error:"stale-host-policy"};
    let visited=0,scanned=0;
    const owned=node=>node.immersive||node.formatHtml||node.id==="immersive-translate-popup"||typeof node.className==="string"&&/(?:^|\\s)(?:immersive-translate-|notranslate(?:\\s|$))/.test(node.className);
    function collect(node){
      if(!node||node.nodeType!==1||node.ownerDocument!==document||!node.isConnected)return{protected:true,nodes:[]};
      if(++visited>4096)throw new Error("region-too-large");
      if(owned(node)||node.hasAttribute("data-imt-p")||node.paragraphs?.length)return{protected:true,nodes:[]};
      const marked=ur.hasMark(node),children=Array.from(node.children||[]).map(collect);
      if(!marked&&children.every(child=>!child.protected))return{protected:false,nodes:[node]};
      return{protected:true,nodes:children.flatMap(child=>child.nodes)};
    }
    try{
      for(const name of new Set(names)){
        if(!current())return{success:false,error:"stale-host-policy"};
        for(const root of document.querySelectorAll(selectors[name])){
          if(!current())return{success:false,error:"stale-host-policy"};
          if(root.ownerDocument!==document||!root.isConnected||root.closest?.('[data-imt-p]'))continue;
          const candidates=collect(root).nodes;
          if(candidates.length>64)return{success:false,error:"region-too-large"};
          for(const candidate of candidates){
            if(!current())return{success:false,error:"stale-host-policy"};
            if(root.ownerDocument!==document||!root.isConnected||candidate.ownerDocument!==document||!candidate.isConnected||!root.contains(candidate))return{success:false,error:"region-detached"};
            await ${expectedWrapper}(engine,candidate,{shouldParseParagraph:()=>({shouldParse:current()&&root.ownerDocument===document&&root.isConnected&&candidate.ownerDocument===document&&candidate.isConnected&&root.contains(candidate)})},"dynamic");
            if(!current())return{success:false,error:"stale-host-policy"};
            if(root.ownerDocument!==document||!root.isConnected||candidate.ownerDocument!==document||!candidate.isConnected||!root.contains(candidate))return{success:false,error:"region-detached"};
            scanned++;
          }
        }
      }
      return{success:true,scannedRoots:scanned};
    }catch(error){return{success:false,error:error?.message==="region-too-large"?"region-too-large":"region-scan-failed"}}
  }`;
  const messageBranch = 'else if(' + branch[1] + '.type==="' + OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE + '")' + branch[2] + '=await __imtHostScanRegionsV1(' + branch[1] + '.data);';
  if (markerCount === 1) {
    return unchanged(source, source.includes(helper) && source.includes(branch[0] + messageBranch) ? "already-patched" : "partial-patch");
  }
  const withHelper = source.replace(wrapper[0], helper + wrapper[0]);
  return { source: withHelper.replace(branch[0], branch[0] + messageBranch), changed: true, reason: "patched" };
}

// The 1.32 dispatcher exposes the engine as Oe and its bounded dynamic walk
// as IC. Require the exact anchors before enabling the regional protocol.
function patchLegacyHostRegionBridge(source) {
  const marker = "__imtHostRegionBridgeV1";
  const markerCount = countOccurrences(source, marker);
  const messageCount = countOccurrences(source, OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE);
  if (markerCount > 1 || messageCount > 1 || markerCount !== messageCount) return unchanged(source, "partial-patch");
  if (countOccurrences(source, OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE) !== 1 ||
      !source.includes("async function IC(") || !source.includes("Oe.traverseContent")) {
    return unchanged(source, "prerequisite-not-patched");
  }
  const dispatcher = /([A-Za-z_$][A-Za-z0-9_$]*)\.handleThirdPartyTell=async\(([A-Za-z_$][A-Za-z0-9_$]*),([A-Za-z_$][A-Za-z0-9_$]*)\)=>\{/;
  const dispatchers = findPatternMatches(source, dispatcher);
  const translate = findPatternMatches(source, /else if\(([A-Za-z_$][A-Za-z0-9_$]*)\.type===\"translatePage\"\)await [A-Za-z_$][A-Za-z0-9_$]*\([^;]+\);/);
  if (dispatchers.length !== 1 || translate.length !== 1) return unchanged(source, "ambiguous-anchor");
  const messageVar = translate[0][1];
  const helper = [
    "async function __imtHostScanRegionsV1(data){/* __imtHostRegionBridgeV1 */",
    "const selectors=" + JSON.stringify(HOST_UI_REGIONS) + ",names=data?.regions;",
    "if(!data||typeof data!==\"object\"||Array.isArray(data)||Object.keys(data).some(key=>key!==\"regions\"&&key!==\"__imtHostGeneration\")||!Array.isArray(names)||names.length===0||names.length>16||names.some(name=>typeof name!==\"string\"||!Object.prototype.hasOwnProperty.call(selectors,name)))return{success:false,error:\"invalid-region\"};",
    "const policy=globalThis.__imtHostTranslationPolicy,engine=Oe,engineId=engine?.id,generation=data.__imtHostGeneration;",
    "if(!engine||!engineId||!engine.ctx||typeof engine.traverseContent!==\"function\"||typeof IC!==\"function\"||Er())return{success:false,error:\"engine-not-ready\"};",
    "const current=()=>Number.isSafeInteger(generation)&&generation>=0&&globalThis.__imtHostTranslationPolicy===policy&&policy?.active===true&&policy.generation===generation&&!Er()&&(engine.translateState===\"dual\"||engine.translateState===\"translation\")&&Oe===engine;",
    "if(!current())return{success:false,error:\"stale-host-policy\"};",
    "let visited=0,scanned=0;",
    "const owned=node=>node?.immersive||node?.formatHtml||node?.id===\"immersive-translate-popup\"||typeof node?.className===\"string\"&&/(?:^|\\s)(?:immersive-translate-|notranslate(?:\\s|$))/.test(node.className);",
    "function collect(node){if(!node||node.nodeType!==1||node.ownerDocument!==document||!node.isConnected)return{protected:true,nodes:[]};if(++visited>4096)throw new Error(\"region-too-large\");if(owned(node)||node.hasAttribute?.(\"data-imt-p\")||Wn?.hasMark?.(node))return{protected:true,nodes:[]};const children=Array.from(node.children||[]).map(collect);if(!Wn?.hasMark?.(node)&&children.every(child=>!child.protected))return{protected:false,nodes:[node]};return{protected:true,nodes:children.flatMap(child=>child.nodes)}}",
    "try{for(const name of new Set(names)){if(!current())return{success:false,error:\"stale-host-policy\"};for(const root of document.querySelectorAll(selectors[name])){if(!current())return{success:false,error:\"stale-host-policy\"};if(root.ownerDocument!==document||!root.isConnected||root.closest?.('[data-imt-p]'))continue;const candidates=collect(root).nodes;if(candidates.length>64)return{success:false,error:\"region-too-large\"};for(const candidate of candidates){if(!current())return{success:false,error:\"stale-host-policy\"};if(!root.contains(candidate))return{success:false,error:\"region-detached\"};await IC(engine,candidate,void 0,\"dynamic\");if(!current())return{success:false,error:\"stale-host-policy\"};if(!root.contains(candidate))return{success:false,error:\"region-detached\"};scanned++}}}return{success:true,scannedRoots:scanned}}catch(error){return{success:false,error:error?.message===\"region-too-large\"?\"region-too-large\":\"region-scan-failed\"}}",
    "}"
  ].join("");
  const branch = "else if(" + messageVar + ".type===\"" + OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE + "\")a=await __imtHostScanRegionsV1(" + messageVar + ".data);";
  if (markerCount === 1) return unchanged(source, source.includes(helper) ? "already-patched" : "partial-patch");
  const withHelper = source.replace(dispatchers[0][0], helper + dispatchers[0][0]);
  return { source: withHelper.replace(translate[0][0], translate[0][0] + branch), changed: true, reason: "patched" };
}

// These lifecycle boundaries were inspected in the official 1.33.2 and 1.33.3
// runtimes. Capture minified names, but require every surrounding call shape.
function patchUserscriptHostLifecycleGuard(source) {
  if (typeof source !== "string") return unchanged(source, "invalid-source");
  if (!/^\/\/ @version\s+1\.33\.[23]\s*$/m.test(source)) return unchanged(source, "unsupported-version");

  const marker = "__imtHostLifecycleGuardV1";
  const alreadyPatched = source.includes(marker);
  if (alreadyPatched && countOccurrences(source, marker) !== 1) return unchanged(source, "partial-patch");
  if (alreadyPatched) {
    let original = source
      .replace("/* __imtHostLifecycleGuardV1 */let __imtHostPolicy=globalThis.__imtHostTranslationPolicy,__imtHostExpectedGeneration=t?.__imtHostGeneration??__imtHostPolicy?.generation;", "")
      .replace("if(!__imtHostPolicy&&t?.__imtHostGeneration!==undefined||__imtHostPolicy&&(globalThis.__imtHostTranslationPolicy!==__imtHostPolicy||!__imtHostPolicy.active||__imtHostPolicy.generation!==__imtHostExpectedGeneration))return;", "")
      .replace("let __imtHostRestorePolicy=globalThis.__imtHostTranslationPolicy,__imtHostRestoreGeneration=__imtHostRestorePolicy?.generation;", "")
      .replace("if(__imtHostRestorePolicy&&(globalThis.__imtHostTranslationPolicy!==__imtHostRestorePolicy||__imtHostRestorePolicy.generation!==__imtHostRestoreGeneration))return;", "")
      .replaceAll(",...__imtHostPolicy?{__imtHostGeneration:__imtHostExpectedGeneration}:{}", "")
      .replace(",__imtHostGeneration:__imtHostGeneration", "")
      .replace("let __imtHostPolicy=globalThis.__imtHostTranslationPolicy,__imtHostExpectedGeneration=t?.__imtHostGeneration??__imtHostPolicy?.generation,__imtHostCurrent=()=>!__imtHostPolicy?t?.__imtHostGeneration===undefined:globalThis.__imtHostTranslationPolicy===__imtHostPolicy&&__imtHostPolicy.active===!0&&__imtHostPolicy.generation===__imtHostExpectedGeneration;", "")
      .replaceAll("if(!__imtHostCurrent())return;", "")
      .replace("isCurrent:__imtHostCurrent,", "")
      .replace("if(!__imtHostCurrent()||!f)return;", "if(!f)return;")
      .replace(/onRetry:\(\)=>\(([A-Za-z_$][A-Za-z0-9_$]*)\(e,\{\.\.\.t\}\),!0\)/, "onRetry:()=>($1(e,t),!0)")
      .replace("({passGate:e,preparePreviousPage:t,prepareCurrentPage:n,startSession:r,isCurrent:i}){if(await e()){if(i&&!i())return;await t();if(i&&!i())return;n();if(i&&!i())return;return r()}}", "({passGate:e,preparePreviousPage:t,prepareCurrentPage:n,startSession:r}){if(await e())return await t(),n(),r()}");
    if (original.includes(marker)) return unchanged(source, "partial-patch");
    const reapplied = patchUserscriptHostLifecycleGuard(original);
    return unchanged(source, reapplied.changed && reapplied.source === source ? "already-patched" : "partial-patch");
  }

  const identifier = "[A-Za-z_$][A-Za-z0-9_$]*";
  const gateMatches = findPatternMatches(source, new RegExp("async function (" + identifier + ")\\(\\{passGate:e,preparePreviousPage:t,prepareCurrentPage:n,startSession:r(?:,isCurrent:i)?\\}\\)\\{"));
  const parserMatches = findPatternMatches(source, new RegExp("function (" + identifier + ")\\(e\\)\\{if\\(!e\\)return\\{state:void 0,trigger:void 0,startedAt:void 0,documentTerminologyInput:void 0\\}"));
  const pageMatches = findPatternMatches(source, new RegExp("async function (" + identifier + ")\\(e,t\\)\\{let n=globalThis\\.performance\\?\\.now\\?\\.\\(\\)\\?\\?Date\\.now\\(\\)"));
  const contextMatches = findPatternMatches(source, /let n=await ([A-Za-z_$][A-Za-z0-9_$]*)\(e,t\),r;/);
  if ([gateMatches, parserMatches, pageMatches, contextMatches].some((matches) => matches.length === 0)) return unchanged(source, "anchor-not-found");
  if ([gateMatches, parserMatches, pageMatches, contextMatches].some((matches) => matches.length !== 1)) return unchanged(source, "ambiguous-anchor");

  const handlerStarts = findPatternMatches(source, new RegExp("async function (" + identifier + ")\\(e,t\\)\\{"))
    .filter((match) => match.index < contextMatches[0].index);
  const handlerStart = handlerStarts.at(-1);
  if (!handlerStart || contextMatches[0].index - handlerStart.index > 4096) return unchanged(source, "ambiguous-anchor");
  const starts = [gateMatches[0], handlerStart, parserMatches[0], pageMatches[0]];
  const restoreCalls = findPatternMatches(source, /preparePreviousPage:async\(\)=>\{[A-Za-z_$][A-Za-z0-9_$]*\(\)!=="Original"&&await ([A-Za-z_$][A-Za-z0-9_$]*)\(\)\}/);
  if (restoreCalls.length !== 1) return unchanged(source, "ambiguous-anchor");
  const restoreName = restoreCalls[0][1];
  const restoreStarts = findPatternMatches(source, new RegExp("async function " + restoreName.replace(/\$/g, "\\$") + "\\(\\)\\{"));
  if (restoreStarts.length !== 1) return unchanged(source, "ambiguous-anchor");
  starts.push(restoreStarts[0]);
  const limits = [1024, 4096, 2048, 12000, 4096];
  const edits = [];
  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const next = /(?:async )?function ([A-Za-z_$][A-Za-z0-9_$]*)\(/g;
    next.lastIndex = start.index + start[0].length;
    const end = next.exec(source);
    if (!end || end.index <= start.index || end.index - start.index > limits[index]) return unchanged(source, "ambiguous-anchor");
    if (countOccurrences(source, "function " + end[1] + "(") !== 1) return unchanged(source, "ambiguous-anchor");
    const text = source.slice(start.index, end.index);
    if (!/\}\s*$/.test(text)) return unchanged(source, "ambiguous-anchor");
    edits.push({ from: start.index, to: end.index, text });
  }
  if (edits.some((section, index) => edits.some((other, otherIndex) => index !== otherIndex && section.from < other.to && other.from < section.to))) return unchanged(source, "ambiguous-anchor");

  const gate = gateMatches[0][1];
  const handler = handlerStart[1];
  const parser = parserMatches[0][1];
  const page = pageMatches[0][1];
  if (!edits[1].text.includes(contextMatches[0][0]) || !edits[3].text.includes("=" + parser + "(t)") || !edits[3].text.includes("await " + gate + "({")) return unchanged(source, "ambiguous-anchor");
  const contextCall = contextMatches[0][0];
  const invocation = findPatternMatches(edits[1].text, new RegExp("await " + identifier + "\\(\\\"translatePage\\\"\\)\\(n,\\{trigger:" + identifier + "\\(t\\),\\.\\.\\.r!==void 0\\?\\{documentTerminologyInput:r\\}:\\{\\}\\}\\)"));
  const initialCheck = findPatternMatches(edits[3].text, /finally\{d=\(globalThis\.performance\?\.now\?\.\(\)\?\?Date\.now\(\)\)-b\}\}if\(!([A-Za-z_$][A-Za-z0-9_$]*)/);
  const beforeGate = findPatternMatches(edits[3].text, new RegExp("if\\(" + identifier + "\\(o\\),await " + identifier + "\\(o,c,m\\)\\|\\|await " + identifier + "\\(o,m\\)\\)return;let p,f=await " + gate.replace(/\$/g, "\\$") + "\\(\\{"));
  const restoreContext = findPatternMatches(edits[4].text, /let e=await [A-Za-z_$][A-Za-z0-9_$]*\([A-Za-z_$][A-Za-z0-9_$]*\(\),\{\}\);/);
  if ([invocation, initialCheck, beforeGate, restoreContext].some((matches) => matches.length !== 1)) return unchanged(source, "anchor-not-found");

  function replaceInSection(index, oldText, newText) {
    const section = edits[index];
    const count = countOccurrences(section.text, oldText);
    if (count !== 1) return count === 0 ? "anchor-not-found" : "ambiguous-anchor";
    section.text = section.text.replace(oldText, newText);
    return null;
  }

  const gateOriginal = "async function " + gate + "({passGate:e,preparePreviousPage:t,prepareCurrentPage:n,startSession:r}){if(await e())return await t(),n(),r()}";
  const gatePatched = "async function " + gate + "({passGate:e,preparePreviousPage:t,prepareCurrentPage:n,startSession:r,isCurrent:i}){if(await e()){if(i&&!i())return;await t();if(i&&!i())return;n();if(i&&!i())return;return r()}}";
  const invocationPatched = invocation[0][0].replace(/\}\)$/, ",...__imtHostPolicy?{__imtHostGeneration:__imtHostExpectedGeneration}:{}})");
  const replacements = [
    [0, gateOriginal, gatePatched],
    [1, "async function " + handler + "(e,t){",
      "async function " + handler + "(e,t){/* __imtHostLifecycleGuardV1 */let __imtHostPolicy=globalThis.__imtHostTranslationPolicy,__imtHostExpectedGeneration=t?.__imtHostGeneration??__imtHostPolicy?.generation;"],
    [1, contextCall,
      contextCall + "if(!__imtHostPolicy&&t?.__imtHostGeneration!==undefined||__imtHostPolicy&&(globalThis.__imtHostTranslationPolicy!==__imtHostPolicy||!__imtHostPolicy.active||__imtHostPolicy.generation!==__imtHostExpectedGeneration))return;"],
    [1, invocation[0][0], invocationPatched],
    [2, "let{trigger:t,startedAt:n,documentTerminologyInput:r,...i}=e;return{state:Object.keys(i).length?i:void 0,trigger:t,startedAt:n,documentTerminologyInput:r}",
      "let{trigger:t,startedAt:n,documentTerminologyInput:r,__imtHostGeneration:__imtHostGeneration,...i}=e;return{state:Object.keys(i).length?i:void 0,trigger:t,startedAt:n,documentTerminologyInput:r}"],
    [3, 'let o=e,{state:a,trigger:s,startedAt:l,documentTerminologyInput:u}=' + parser + '(t),c=typeof s=="string"?s:"unknown";',
      'let o=e,{state:a,trigger:s,startedAt:l,documentTerminologyInput:u}=B3t(t),c=typeof s=="string"?s:"unknown";let __imtHostPolicy=globalThis.__imtHostTranslationPolicy,__imtHostExpectedGeneration=t?.__imtHostGeneration??__imtHostPolicy?.generation,__imtHostCurrent=()=>!__imtHostPolicy?t?.__imtHostGeneration===undefined:globalThis.__imtHostTranslationPolicy===__imtHostPolicy&&__imtHostPolicy.active===!0&&__imtHostPolicy.generation===__imtHostExpectedGeneration;if(!__imtHostCurrent())return;'],
    [3, initialCheck[0][0], initialCheck[0][0].replace("}}if(!", "}}if(!__imtHostCurrent())return;if(!")],
    [3, '...u!==void 0?{documentTerminologyInput:u}:{}})};',
      '...u!==void 0?{documentTerminologyInput:u}:{},...__imtHostPolicy?{__imtHostGeneration:__imtHostExpectedGeneration}:{}})};'],
    [3, 'onRetry:()=>(fo(e,t),!0)',
      'onRetry:()=>(' + page + '(e,{...t,...__imtHostPolicy?{__imtHostGeneration:__imtHostExpectedGeneration}:{}}),!0)'],
    [3, beforeGate[0][0], beforeGate[0][0].replace("return;let p,f=await", "return;if(!__imtHostCurrent())return;let p,f=await").replace("({", "({isCurrent:__imtHostCurrent,")],
    [3, "});if(!f)return;let h=f.session_id;",
      "});if(!__imtHostCurrent()||!f)return;let h=f.session_id;"],
    [4, "async function " + restoreName + "(){", "async function " + restoreName + "(){let __imtHostRestorePolicy=globalThis.__imtHostTranslationPolicy,__imtHostRestoreGeneration=__imtHostRestorePolicy?.generation;"],
    [4, restoreContext[0][0], restoreContext[0][0] + "if(__imtHostRestorePolicy&&(globalThis.__imtHostTranslationPolicy!==__imtHostRestorePolicy||__imtHostRestorePolicy.generation!==__imtHostRestoreGeneration))return;"],
  ];
  replacements[5][2] = replacements[5][2].replace("=B3t(t)", "=" + parser + "(t)");
  replacements[8][1] = 'onRetry:()=>(' + page + '(e,t),!0)';
  for (const [index, oldText, newText] of replacements) {
    const failure = replaceInSection(index, oldText, newText);
    if (failure) return unchanged(source, failure);
  }

  let patched = source;
  for (const section of edits.sort((a, b) => b.from - a.from)) {
    patched = patched.slice(0, section.from) + section.text + patched.slice(section.to);
  }
  return { source: patched, changed: true, reason: "patched" };
}

function patchUserscriptSidePanelMinWidth(source, minWidth = OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH) {
  if (typeof source !== "string") return unchanged(source, "invalid-source");
  if (!Number.isInteger(minWidth) || minWidth <= 0) return unchanged(source, "invalid-min-width");

  const widthAnchorCount = countOccurrences(source, MOCK_SIDE_PANEL_WIDTH_KEY);
  const hostAnchorCount = countOccurrences(source, MOCK_SIDE_PANEL_HOST_KEY);
  if (widthAnchorCount === 0 || hostAnchorCount === 0) return unchanged(source, "anchor-not-found");
  if (widthAnchorCount !== 1 || hostAnchorCount !== 1) return unchanged(source, "ambiguous-anchor");

  const match = MOCK_SIDE_PANEL_DECLARATION.exec(source);
  if (!match) return unchanged(source, "anchor-not-found");

  const currentWidth = Number(match[2]);
  if (currentWidth === minWidth) return unchanged(source, "already-patched");
  if (currentWidth !== UPSTREAM_MOCK_SIDE_PANEL_MIN_WIDTH) return unchanged(source, "unexpected-width");

  const widthOffset = match.index + match[1].length;
  return {
    source: source.slice(0, widthOffset) + String(minWidth) + source.slice(widthOffset + match[2].length),
    changed: true,
    reason: "patched",
  };
}

module.exports = {
  DEFAULT_MOCK_SIDE_PANEL_WIDTH,
  MOCK_SIDE_PANEL_HOST_KEY,
  MOCK_SIDE_PANEL_WIDTH_KEY,
  OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE,
  OBSIDIAN_HOST_TRANSLATE_REGIONS_MESSAGE,
  OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE,
  OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH,
  UPSTREAM_MOCK_SIDE_PANEL_MIN_WIDTH,
  patchUserscriptHostContentBridge,
  patchUserscriptHostRegionBridge,
  patchUserscriptHostLifecycleGuard,
  patchUserscriptSidePanelMinWidth,
};
