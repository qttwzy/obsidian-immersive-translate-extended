"use strict";

const OFFICIAL_RUNTIME_URL = "https://download.immersivetranslate.com/immersive-translate.user.js";
const RUNTIME_FILENAME = "userscript.runtime.js";
const RUNTIME_VERSION_PATTERN = /^\d+(?:\.\d+){1,3}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const METADATA_START_PATTERN = /^[ \t]*\/\/[ \t]*==UserScript==[ \t]*$/;
const METADATA_END_PATTERN = /^[ \t]*\/\/[ \t]*==\/UserScript==[ \t]*$/;
const VERSION_LINE_PATTERN = /^[ \t]*\/\/[ \t]*@version[ \t]+([^\s]+)[ \t]*$/;

function isRuntimeVersion(value) {
  return typeof value === "string" && RUNTIME_VERSION_PATTERN.test(value);
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
  OFFICIAL_RUNTIME_URL,
  RUNTIME_FILENAME,
  extractRuntimeVersion,
  isRuntimeVersion,
};
