"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { createDocumentHandoffConfirmationSource } = require("./document-runtime");

const PDF_WORKSPACE_URL = "https://app.immersivetranslate.com/pdf/";
const FILE_WORKSPACE_URL = "https://app.immersivetranslate.com/file/";
const PDF_MAX_BYTES = 100 * 1024 * 1024;
const TRANSLATED_PDF_MAX_BYTES = 512 * 1024 * 1024;
const PDF_CAPTURE_DIRECTORY_PREFIX = ".imt-pdf-export-";
const DOCUMENT_WORKSPACE_ORIGIN = "https://app.immersivetranslate.com";
const DOCUMENT_ROUTE_PREFIXES = [
  "/file/", "/pdf/", "/pdf-pro/", "/babel-doc/",
  "/ebook/", "/subtitle/", "/html/", "/markdown/",
  "/docx/", "/word/", "/txt/", "/json/",
];
const DOCUMENT_EXTENSIONS = [
  "epub", "mobi", "fb2", "fbz",
  "docx",
  "html", "htm", "txt", "json",
  "md", "markdown",
  "srt", "ass", "vtt",
];

function createTranslatedPdfSavePath(sourcePath, dependencies) {
  const fsModule = dependencies && dependencies.fs ? dependencies.fs : fs;
  const pathModule = dependencies && dependencies.path ? dependencies.path : path;
  const normalized = typeof sourcePath === "string" ? sourcePath.trim() : "";
  if (!normalized || !pathModule.isAbsolute(normalized) || pathModule.extname(normalized).toLowerCase() !== ".pdf") {
    return { ok: false, code: "invalid_pdf_source" };
  }
  const directory = pathModule.dirname(normalized);
  const stem = pathModule.basename(normalized, pathModule.extname(normalized));
  for (let index = 1; index <= 9999; index++) {
    const suffix = index === 1 ? "-译文.pdf" : "-译文 (" + index + ").pdf";
    const absolutePath = pathModule.join(directory, stem + suffix);
    try {
      if (!fsModule.existsSync(absolutePath)) {
        return { ok: true, absolutePath, fileName: pathModule.basename(absolutePath) };
      }
    } catch (error) {
      return { ok: false, code: "download_destination_unavailable" };
    }
  }
  return { ok: false, code: "download_destination_unavailable" };
}

function normalizedPdfCapture(capture, pathModule) {
  const input = capture && typeof capture === "object" ? capture : {};
  const sourcePath = typeof input.sourcePath === "string" ? input.sourcePath : "";
  const tempDirectory = typeof input.tempDirectory === "string" ? input.tempDirectory : "";
  const tempPath = typeof input.tempPath === "string" ? input.tempPath : "";
  if (!sourcePath || !pathModule.isAbsolute(sourcePath) || pathModule.extname(sourcePath).toLowerCase() !== ".pdf" ||
      !tempDirectory || !pathModule.isAbsolute(tempDirectory) || !tempPath || !pathModule.isAbsolute(tempPath)) return null;
  const sourceDirectory = pathModule.dirname(sourcePath);
  const tempName = pathModule.basename(tempDirectory);
  if (pathModule.dirname(tempDirectory) !== sourceDirectory || !tempName.startsWith(PDF_CAPTURE_DIRECTORY_PREFIX) ||
      tempName.length <= PDF_CAPTURE_DIRECTORY_PREFIX.length || tempPath !== pathModule.join(tempDirectory, "capture.pdf")) return null;
  return { sourcePath, tempDirectory, tempPath };
}

function createTranslatedPdfCapture(sourcePath, dependencies) {
  const fsModule = dependencies && dependencies.fs ? dependencies.fs : fs;
  const pathModule = dependencies && dependencies.path ? dependencies.path : path;
  const cryptoModule = dependencies && dependencies.crypto ? dependencies.crypto : crypto;
  const destination = createTranslatedPdfSavePath(sourcePath, { fs: fsModule, path: pathModule });
  if (!destination.ok) return destination;
  try {
    const sourceStat = fsModule.lstatSync(sourcePath);
    if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) return { ok: false, code: "invalid_pdf_source" };
    const tempDirectory = fsModule.mkdtempSync(pathModule.join(pathModule.dirname(sourcePath), PDF_CAPTURE_DIRECTORY_PREFIX));
    return {
      ok: true,
      code: "capture_ready",
      token: cryptoModule.randomBytes(16).toString("hex"),
      sourcePath,
      sourceFileName: pathModule.basename(sourcePath),
      tempDirectory,
      tempPath: pathModule.join(tempDirectory, "capture.pdf"),
      maxBytes: TRANSLATED_PDF_MAX_BYTES,
    };
  } catch (error) {
    return { ok: false, code: "download_destination_unavailable" };
  }
}

function discardTranslatedPdfCapture(capture, dependencies) {
  const fsModule = dependencies && dependencies.fs ? dependencies.fs : fs;
  const pathModule = dependencies && dependencies.path ? dependencies.path : path;
  const normalized = normalizedPdfCapture(capture, pathModule);
  if (!normalized) return false;
  try {
    fsModule.rmSync(normalized.tempDirectory, { recursive: true, force: true });
    return true;
  } catch (error) { return false; }
}

function finalizeTranslatedPdfCapture(capture, options, dependencies) {
  const fsModule = dependencies && dependencies.fs ? dependencies.fs : fs;
  const pathModule = dependencies && dependencies.path ? dependencies.path : path;
  const normalized = normalizedPdfCapture(capture, pathModule);
  const input = options && typeof options === "object" ? options : {};
  if (!normalized) return { ok: false, code: "invalid_pdf_capture" };
  let result = { ok: false, code: "invalid_pdf_download" };
  try {
    const stat = fsModule.lstatSync(normalized.tempPath);
    const maxBytes = Number.isSafeInteger(capture.maxBytes) && capture.maxBytes > 0
      ? Math.min(capture.maxBytes, TRANSLATED_PDF_MAX_BYTES)
      : TRANSLATED_PDF_MAX_BYTES;
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 5 || stat.size > maxBytes ||
        !Number.isSafeInteger(input.byteLength) || input.byteLength !== stat.size) throw new Error("invalid PDF capture size");
    const header = Buffer.alloc(5);
    const descriptor = fsModule.openSync(normalized.tempPath, "r");
    let bytesRead = 0;
    try { bytesRead = fsModule.readSync(descriptor, header, 0, header.length, 0); }
    finally { fsModule.closeSync(descriptor); }
    if (bytesRead !== 5 || header.toString("ascii") !== "%PDF-") throw new Error("invalid PDF capture header");

    for (let attempt = 0; attempt < 9999; attempt++) {
      const destination = createTranslatedPdfSavePath(normalized.sourcePath, { fs: fsModule, path: pathModule });
      if (!destination.ok) { result = destination; break; }
      try {
        fsModule.linkSync(normalized.tempPath, destination.absolutePath);
        fsModule.unlinkSync(normalized.tempPath);
        result = {
          ok: true,
          code: "saved",
          fileName: destination.fileName,
          absolutePath: destination.absolutePath,
        };
        break;
      } catch (error) {
        if (!error || error.code !== "EEXIST") {
          result = { ok: false, code: "save_failed" };
          break;
        }
      }
    }
  } catch (error) {
    result = { ok: false, code: "invalid_pdf_download" };
  } finally {
    discardTranslatedPdfCapture(capture, { fs: fsModule, path: pathModule });
  }
  return result;
}

function fileExtension(file) {
  const explicit = file && typeof file.extension === "string" ? file.extension : "";
  const source = explicit || (file && typeof file.path === "string" ? file.path.split(".").pop() : "");
  return String(source || "").trim().toLowerCase().replace(/^\./, "");
}

function getDocumentWorkspaceSpec(file) {
  const extension = fileExtension(file);
  if (extension === "pdf") {
    return {
      kind: "pdf",
      title: "PDF 翻译",
      url: PDF_WORKSPACE_URL,
      autoHandoff: true,
      extensions: ["pdf"],
      maxBytes: PDF_MAX_BYTES,
    };
  }
  if (!DOCUMENT_EXTENSIONS.includes(extension)) return null;
  return {
    kind: "document",
    title: "文档翻译",
    url: FILE_WORKSPACE_URL,
    autoHandoff: false,
    extensions: DOCUMENT_EXTENSIONS.slice(),
    maxBytes: PDF_MAX_BYTES,
  };
}

function isPathWithin(rootPath, targetPath, pathModule) {
  const module = pathModule || path;
  const relative = module.relative(rootPath, targetPath);
  if (!relative || module.isAbsolute(relative)) return false;
  return relative !== ".." && !relative.startsWith(".." + module.sep);
}

function isAbsoluteOnAnyDesktopPlatform(value) {
  return path.isAbsolute(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value);
}

function resolveLocalVaultFile(options, dependencies) {
  const input = options || {};
  const fsModule = dependencies && dependencies.fs ? dependencies.fs : fs;
  const pathModule = dependencies && dependencies.path ? dependencies.path : path;
  const root = typeof input.vaultBasePath === "string" ? input.vaultBasePath.trim() : "";
  const relativePath = typeof input.vaultRelativePath === "string" ? input.vaultRelativePath.trim() : "";
  const allowed = Array.isArray(input.allowedExtensions)
    ? input.allowedExtensions.map(function (value) { return String(value || "").toLowerCase().replace(/^\./, ""); }).filter(Boolean)
    : [];
  const declared = String(input.declaredExtension || "").toLowerCase().replace(/^\./, "");
  const maxBytes = Number(input.maxBytes);

  if (!root) return { ok: false, code: "base_path_unavailable" };
  const hasParentTraversal = relativePath.split(/[\\/]+/).includes("..");
  const hasWindowsDrivePrefix = /^[A-Za-z]:/.test(relativePath);
  if (!relativePath || relativePath.indexOf("\0") !== -1 || hasParentTraversal || hasWindowsDrivePrefix || isAbsoluteOnAnyDesktopPlatform(relativePath)) {
    return { ok: false, code: "invalid_relative_path" };
  }

  const actualExtension = pathModule.extname(relativePath).slice(1).toLowerCase();
  if (!actualExtension || (declared && declared !== actualExtension)) return { ok: false, code: "extension_mismatch" };
  if (allowed.length === 0 || !allowed.includes(actualExtension)) return { ok: false, code: "extension_not_allowed" };

  try {
    const readRealpath = function (value) {
      return typeof fsModule.realpathSync.native === "function"
        ? fsModule.realpathSync.native(value)
        : fsModule.realpathSync(value);
    };
    const rootReal = readRealpath(root);
    const candidatePath = pathModule.resolve(rootReal, relativePath);
    if (!isPathWithin(rootReal, candidatePath, pathModule)) return { ok: false, code: "outside_vault" };
    const candidateLstat = fsModule.lstatSync(candidatePath);
    if (candidateLstat.isSymbolicLink()) return { ok: false, code: "symlink_not_allowed" };
    const fileReal = readRealpath(candidatePath);
    if (!isPathWithin(rootReal, fileReal, pathModule)) return { ok: false, code: "outside_vault" };
    const stat = fsModule.statSync(fileReal);
    if (!stat.isFile()) return { ok: false, code: "not_regular_file" };
    if (!Number.isFinite(maxBytes) || maxBytes <= 0 || stat.size > maxBytes) return { ok: false, code: "file_too_large" };
    return {
      ok: true,
      absolutePath: fileReal,
      extension: actualExtension,
      fileName: pathModule.basename(fileReal),
      size: stat.size,
    };
  } catch (error) {
    return { ok: false, code: "file_unavailable" };
  }
}

function isTrustedDocumentWorkspaceUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.origin !== DOCUMENT_WORKSPACE_ORIGIN) return false;
    return DOCUMENT_ROUTE_PREFIXES.some(function (prefix) { return url.pathname.startsWith(prefix); });
  } catch (error) {
    return false;
  }
}

async function handoffLocalFileWithCdp(options) {
  const input = options || {};
  const webContents = input.webContents;
  const debuggerApi = webContents && webContents.debugger;
  const absolutePath = typeof input.absolutePath === "string" ? input.absolutePath : "";
  const fileName = typeof input.fileName === "string" ? input.fileName : "";
  const expectedExtension = typeof input.expectedExtension === "string" && /^[a-z0-9]+$/i.test(input.expectedExtension)
    ? input.expectedExtension.toLowerCase()
    : "";
  const trustUrl = typeof input.isTrustedUrl === "function" ? input.isTrustedUrl : isTrustedDocumentWorkspaceUrl;
  if (!webContents || !debuggerApi || typeof debuggerApi.attach !== "function" || typeof debuggerApi.sendCommand !== "function" || typeof debuggerApi.detach !== "function") {
    return { ok: false, code: "cdp_unavailable" };
  }
  if (!absolutePath || !fileName) return { ok: false, code: "file_unavailable" };
  if (typeof webContents.getURL !== "function" || !trustUrl(webContents.getURL())) return { ok: false, code: "untrusted_document_url" };
  if (typeof debuggerApi.isAttached === "function" && debuggerApi.isAttached()) return { ok: false, code: "debugger_busy" };

  let attachedByOperation = false;
  try {
    try {
      debuggerApi.attach("1.3");
      attachedByOperation = true;
    } catch (error) {
      return { ok: false, code: "debugger_attach_failed" };
    }
    if (!trustUrl(webContents.getURL())) return { ok: false, code: "untrusted_document_url" };

    const documentResult = await debuggerApi.sendCommand("DOM.getDocument", { depth: -1, pierce: true });
    const rootNodeId = documentResult && documentResult.root && documentResult.root.nodeId;
    if (!rootNodeId) return { ok: false, code: "document_unavailable" };
    const compatibleSelector = expectedExtension
      ? 'input[type="file"][accept*=".' + expectedExtension + '"], input[type="file"][accept*="application/' + expectedExtension + '"]'
      : 'input[type="file"]';
    const inputResult = await debuggerApi.sendCommand("DOM.querySelectorAll", {
      nodeId: rootNodeId,
      selector: compatibleSelector,
    });
    const nodeIds = inputResult && Array.isArray(inputResult.nodeIds) ? inputResult.nodeIds : [];
    if (nodeIds.length === 0) return { ok: false, code: "file_input_unavailable" };
    if (nodeIds.length !== 1) return { ok: false, code: "ambiguous_file_input" };
    if (!trustUrl(webContents.getURL())) return { ok: false, code: "untrusted_document_url" };

    const nodeId = nodeIds[0];
    const objectResult = await debuggerApi.sendCommand("DOM.resolveNode", { nodeId: nodeId });
    const objectId = objectResult && objectResult.object && objectResult.object.objectId;
    if (!objectId) return { ok: false, code: "file_input_unavailable" };
    await debuggerApi.sendCommand("DOM.setFileInputFiles", { files: [absolutePath], nodeId: nodeId });
    const initialUrl = webContents.getURL();
    if (!trustUrl(initialUrl)) return { ok: false, code: "untrusted_document_url" };
    const confirmation = await debuggerApi.sendCommand("Runtime.callFunctionOn", {
      objectId: objectId,
      functionDeclaration: createDocumentHandoffConfirmationSource(initialUrl),
      arguments: [{ value: fileName }],
      awaitPromise: true,
      returnByValue: true,
    });
    const state = confirmation && confirmation.result && confirmation.result.value;
    if (!trustUrl(webContents.getURL())) return { ok: false, code: "untrusted_document_url" };
    if (!state || state.name !== fileName) return { ok: false, code: "file_assignment_unconfirmed" };
    // The official shell can navigate to its bundled sample before React has
    // attached the local-file handler. A same-origin navigation proves only
    // that the app moved, not that it accepted the requested Vault file.
    if (!state.visibleFileName && !state.titleFileName) return { ok: false, code: "handoff_state_unconfirmed" };
    return { ok: true, code: "handed_off" };
  } catch (error) {
    return { ok: false, code: "cdp_command_failed" };
  } finally {
    if (attachedByOperation) {
      try { debuggerApi.detach(); } catch (error) {}
    }
  }
}

module.exports = {
  createTranslatedPdfCapture,
  createTranslatedPdfSavePath,
  discardTranslatedPdfCapture,
  DOCUMENT_EXTENSIONS,
  DOCUMENT_ROUTE_PREFIXES,
  DOCUMENT_WORKSPACE_ORIGIN,
  FILE_WORKSPACE_URL,
  finalizeTranslatedPdfCapture,
  PDF_MAX_BYTES,
  PDF_WORKSPACE_URL,
  TRANSLATED_PDF_MAX_BYTES,
  getDocumentWorkspaceSpec,
  handoffLocalFileWithCdp,
  isPathWithin,
  isTrustedDocumentWorkspaceUrl,
  resolveLocalVaultFile,
};
