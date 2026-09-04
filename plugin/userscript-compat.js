"use strict";

const UPSTREAM_MOCK_SIDE_PANEL_MIN_WIDTH = 435;
const OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH = 280;
const DEFAULT_MOCK_SIDE_PANEL_WIDTH = 340;
const MOCK_SIDE_PANEL_WIDTH_KEY = "mock-side-panel-width";
const MOCK_SIDE_PANEL_HOST_KEY = "cursor-mock-side-panel-host";
const OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE = "obsidianHostUpdateTargetLanguage";
const OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE = "obsidianHostTranslatePage";
const MAX_HOST_CONTENT_BRIDGE_DISPATCHER_SPAN = 128 * 1024;
const HOST_CONTENT_BRIDGE_ANCHOR_PATTERN = /else if\(i\.type(?:===|==)["']switchTranslationMode["']\)\{/;
const HOST_CONTENT_BRIDGE_TRANSLATE_ANCHOR_PATTERN = /else if\(i\.type(?:===|==)["']translatePage["']\)(await [A-Za-z_$][A-Za-z0-9_$]*\(r,i\.data\));/;
const HOST_CONTENT_BRIDGE_RESPONSE_ANCHOR_PATTERN = /([A-Za-z_$][A-Za-z0-9_$]*)\(["']content["'],i\.type\);a!==void 0&&i\.id&&[A-Za-z_$][A-Za-z0-9_$]*\(i\.type,a,i\.id\)/;

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
  if (translateAnchors[0].index >= switchAnchors[0].index || switchAnchors[0].index >= responseAnchors[0].index || dispatcherSpan > MAX_HOST_CONTENT_BRIDGE_DISPATCHER_SPAN || translateArrowScope !== switchArrowScope || switchArrowScope !== responseArrowScope || !anchorsShareDispatcherScope(source, translateAnchors[0].index, responseAnchors[0].index)) {
    return unchanged(source, "ambiguous-anchor");
  }

  const translateInvocation = translateAnchors[0][1];
  const contentTransport = responseAnchors[0][1];
  const hostBridgeSource =
    'else if(i.type==="' + OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE + '"){let o=i.data?.targetLanguage;if(typeof o==="string"&&o.trim().length>0&&o.length<=64){await ' + contentTransport + '({type:"content",topFrame:!0,forwardToSubFrames:!0},{method:"updateTargetLanguage",data:{targetLanguage:o.trim(),hasPageTranslationStarted:i.data?.hasPageTranslationStarted===!0,trigger:"obsidianHost"}}),a={success:!0}}else a={success:!1,error:"invalid-target-language"}}' +
    'else if(i.type==="' + OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE + '")' + translateInvocation + ',a={success:!0};';

  return {
    source: source.replace(switchAnchors[0][0], hostBridgeSource + switchAnchors[0][0]),
    changed: true,
    reason: "patched",
  };
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
  OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE,
  OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH,
  UPSTREAM_MOCK_SIDE_PANEL_MIN_WIDTH,
  patchUserscriptHostContentBridge,
  patchUserscriptSidePanelMinWidth,
};
