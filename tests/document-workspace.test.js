"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  createTranslatedPdfCapture,
  createTranslatedPdfSavePath,
  discardTranslatedPdfCapture,
  finalizeTranslatedPdfCapture,
  getDocumentWorkspaceSpec,
  handoffLocalFileWithCdp,
  isPathWithin,
  isTrustedDocumentWorkspaceUrl,
  resolveLocalVaultFile,
} = require("../plugin/document-workspace");

test("builds a non-overwriting translated PDF path beside the source file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imt-pdf-download-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "paper.pdf");
  fs.writeFileSync(sourcePath, "%PDF-source", "utf8");

  assert.deepEqual(createTranslatedPdfSavePath(sourcePath), {
    ok: true,
    absolutePath: path.join(root, "paper-译文.pdf"),
    fileName: "paper-译文.pdf",
  });

  fs.writeFileSync(path.join(root, "paper-译文.pdf"), "%PDF-first", "utf8");
  assert.deepEqual(createTranslatedPdfSavePath(sourcePath), {
    ok: true,
    absolutePath: path.join(root, "paper-译文 (2).pdf"),
    fileName: "paper-译文 (2).pdf",
  });
  assert.equal(createTranslatedPdfSavePath(path.join(root, "paper.txt")).code, "invalid_pdf_source");
  assert.equal(createTranslatedPdfSavePath("paper.pdf").code, "invalid_pdf_source");
});

test("classifies PDF for guarded handoff and other supported files for the unified workspace", () => {
  assert.deepEqual(getDocumentWorkspaceSpec({ path: "papers/example.pdf", extension: "pdf" }), {
    kind: "pdf",
    title: "PDF 翻译",
    url: "https://app.immersivetranslate.com/pdf/",
    autoHandoff: true,
    extensions: ["pdf"],
    maxBytes: 100 * 1024 * 1024,
  });

  const ebook = getDocumentWorkspaceSpec({ path: "books/example.epub", extension: "epub" });
  assert.equal(ebook.kind, "document");
  assert.equal(ebook.url, "https://app.immersivetranslate.com/file/");
  assert.equal(ebook.autoHandoff, false);
  assert.equal(ebook.extensions.includes("epub"), true);

  assert.equal(getDocumentWorkspaceSpec({ path: "images/example.png", extension: "png" }), null);
});

test("recognizes contained paths with POSIX and Windows semantics", () => {
  assert.equal(isPathWithin("/vault", "/vault/docs/example.pdf", path.posix), true);
  assert.equal(isPathWithin("/vault", "/vault-other/example.pdf", path.posix), false);
  assert.equal(isPathWithin("/vault", "/vault", path.posix), false);

  assert.equal(isPathWithin("C:\\Vault", "C:\\Vault\\docs\\example.pdf", path.win32), true);
  assert.equal(isPathWithin("C:\\Vault", "C:\\Vault-old\\example.pdf", path.win32), false);
  assert.equal(isPathWithin("C:\\Vault", "D:\\example.pdf", path.win32), false);
});

test("resolves an ordinary local PDF only after realpath containment and size checks", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imt-vault-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "papers"));
  fs.writeFileSync(path.join(root, "papers", "example.pdf"), "pdf-test", "utf8");

  assert.deepEqual(resolveLocalVaultFile({
    vaultBasePath: root,
    vaultRelativePath: "papers/example.pdf",
    declaredExtension: "PDF",
    allowedExtensions: ["pdf"],
    maxBytes: 1024,
  }), {
    ok: true,
    absolutePath: fs.realpathSync(path.join(root, "papers", "example.pdf")),
    extension: "pdf",
    fileName: "example.pdf",
    size: 8,
  });
});

test("rejects cross-platform traversal, symlinks, directories, unsupported extensions, and oversized files", (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "imt-vault-boundary-"));
  const root = path.join(parent, "vault");
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, "large.pdf"), "12345678", "utf8");
  fs.mkdirSync(path.join(root, "folder.pdf"));
  fs.writeFileSync(path.join(parent, "outside.pdf"), "outside", "utf8");
  fs.symlinkSync(path.join(parent, "outside.pdf"), path.join(root, "linked.pdf"));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));

  const validate = (vaultRelativePath, overrides = {}) => resolveLocalVaultFile(Object.assign({
    vaultBasePath: root,
    vaultRelativePath,
    declaredExtension: "pdf",
    allowedExtensions: ["pdf"],
    maxBytes: 1024,
  }, overrides));

  assert.equal(validate("../outside.pdf").code, "invalid_relative_path");
  assert.equal(validate("..\\outside.pdf").code, "invalid_relative_path");
  assert.equal(validate("linked.pdf").code, "symlink_not_allowed");
  assert.equal(validate("folder.pdf").code, "not_regular_file");
  assert.equal(validate("large.pdf", { maxBytes: 7 }).code, "file_too_large");
  assert.equal(validate("large.pdf", { declaredExtension: "txt" }).code, "extension_mismatch");
  assert.equal(validate("large.pdf", { allowedExtensions: ["txt"] }).code, "extension_not_allowed");
  assert.equal(validate("missing.pdf").code, "file_unavailable");
});

test("allows only the official document origin and known workspace routes", () => {
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com/pdf/"), true);
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com/pdf/viewer/123"), true);
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com/file/"), true);
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com/ebook/"), true);
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com/word/"), true);
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com/babel-doc/job-123"), true);
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com/accounts/login"), false);
  assert.equal(isTrustedDocumentWorkspaceUrl("http://app.immersivetranslate.com/pdf/"), false);
  assert.equal(isTrustedDocumentWorkspaceUrl("https://app.immersivetranslate.com.evil.example/pdf/"), false);
});

test("hands one local file to one official file input and always detaches the debugger", async () => {
  const calls = [];
  let attached = false;
  const debuggerApi = {
    isAttached: () => attached,
    attach(protocol) { attached = true; calls.push(["attach", protocol]); },
    async sendCommand(method, params) {
      calls.push([method, params]);
      if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
      if (method === "DOM.querySelectorAll") {
        assert.match(params.selector, /accept.*\.pdf/);
        return { nodeIds: [2] };
      }
      if (method === "DOM.resolveNode") return { object: { objectId: "input-2" } };
      if (method === "DOM.setFileInputFiles") return {};
      if (method === "Runtime.callFunctionOn") {
        return { result: { value: { name: "example.pdf", visibleFileName: false, titleFileName: true, navigated: false } } };
      }
      throw new Error("unexpected command " + method);
    },
    detach() { attached = false; calls.push(["detach"]); },
  };
  const webContents = {
    debugger: debuggerApi,
    getURL: () => "https://app.immersivetranslate.com/pdf/",
  };

  assert.deepEqual(await handoffLocalFileWithCdp({
    webContents,
    absolutePath: "/vault/papers/example.pdf",
    fileName: "example.pdf",
    expectedExtension: "pdf",
  }), { ok: true, code: "handed_off" });

  assert.deepEqual(calls[0], ["attach", "1.3"]);
  assert.deepEqual(calls.at(-1), ["detach"]);
  assert.deepEqual(calls.find(([method]) => method === "DOM.setFileInputFiles")[1], {
    files: ["/vault/papers/example.pdf"],
    nodeId: 2,
  });
});

test("does not treat a page's pre-existing loading indicator as handoff confirmation", async () => {
  let detached = 0;
  const webContents = {
    getURL: () => "https://app.immersivetranslate.com/pdf/",
    debugger: {
      isAttached: () => false,
      attach() {},
      async sendCommand(method) {
        if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
        if (method === "DOM.querySelectorAll") return { nodeIds: [2] };
        if (method === "DOM.resolveNode") return { object: { objectId: "input-2" } };
        if (method === "DOM.setFileInputFiles") return {};
        if (method === "Runtime.callFunctionOn") {
          return { result: { value: { name: "example.pdf", visibleFileName: false, titleFileName: false, navigated: false, uploading: true } } };
        }
        throw new Error("unexpected command " + method);
      },
      detach() { detached++; },
    },
  };

  assert.deepEqual(await handoffLocalFileWithCdp({
    webContents,
    absolutePath: "/vault/papers/example.pdf",
    fileName: "example.pdf",
    expectedExtension: "pdf",
  }), { ok: false, code: "handoff_state_unconfirmed" });
  assert.equal(detached, 1);
});

test("does not treat a trusted in-app navigation as file handoff confirmation", async () => {
  let currentUrl = "https://app.immersivetranslate.com/pdf/";
  let detached = 0;
  const webContents = {
    getURL: () => currentUrl,
    debugger: {
      isAttached: () => false,
      attach() {},
      async sendCommand(method) {
        if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
        if (method === "DOM.querySelectorAll") return { nodeIds: [2] };
        if (method === "DOM.resolveNode") return { object: { objectId: "input-2" } };
        if (method === "DOM.setFileInputFiles") return {};
        if (method === "Runtime.callFunctionOn") {
          currentUrl = "https://app.immersivetranslate.com/pdf/job-123";
          return {
            result: {
              value: {
                name: "example.pdf",
                visibleFileName: false,
                titleFileName: false,
                navigated: true,
              },
            },
          };
        }
        throw new Error("unexpected command " + method);
      },
      detach() { detached++; },
    },
  };

  assert.deepEqual(await handoffLocalFileWithCdp({
    webContents,
    absolutePath: "/vault/papers/example.pdf",
    fileName: "example.pdf",
    expectedExtension: "pdf",
  }), { ok: false, code: "handoff_state_unconfirmed" });
  assert.equal(detached, 1);
});

test("aborts a handoff if the workspace navigates away during the CDP operation", async () => {
  let attached = false;
  let detached = 0;
  let urlReads = 0;
  const webContents = {
    getURL() {
      urlReads++;
      return urlReads >= 4 ? "https://evil.example/upload" : "https://app.immersivetranslate.com/pdf/";
    },
    debugger: {
      isAttached: () => attached,
      attach() { attached = true; },
      async sendCommand(method) {
        if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
        if (method === "DOM.querySelectorAll") return { nodeIds: [2] };
        if (method === "DOM.resolveNode") return { object: { objectId: "input-2" } };
        if (method === "DOM.setFileInputFiles") return {};
        throw new Error("the untrusted page must not receive a runtime call");
      },
      detach() { attached = false; detached++; },
    },
  };

  assert.deepEqual(await handoffLocalFileWithCdp({
    webContents,
    absolutePath: "/vault/papers/example.pdf",
    fileName: "example.pdf",
  }), { ok: false, code: "untrusted_document_url" });
  assert.equal(detached, 1);
});

test("captures and atomically publishes a translated PDF beside its source", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imt-pdf-capture-success-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "paper.pdf");
  fs.writeFileSync(sourcePath, "%PDF-source", "utf8");

  const capture = createTranslatedPdfCapture(sourcePath);
  assert.equal(capture.ok, true);
  assert.match(capture.token, /^[0-9a-f]{32}$/);
  assert.equal(path.dirname(capture.tempDirectory), root);
  assert.equal(path.basename(capture.tempPath), "capture.pdf");

  const translated = Buffer.from("%PDF-translated", "utf8");
  fs.writeFileSync(capture.tempPath, translated);
  assert.deepEqual(finalizeTranslatedPdfCapture(capture, { byteLength: translated.length }), {
    ok: true,
    code: "saved",
    absolutePath: path.join(root, "paper-译文.pdf"),
    fileName: "paper-译文.pdf",
  });
  assert.equal(fs.readFileSync(path.join(root, "paper-译文.pdf"), "utf8"), "%PDF-translated");
  assert.equal(fs.existsSync(capture.tempDirectory), false);
});

test("translated PDF capture preserves an existing export and selects the next file name", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imt-pdf-capture-collision-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "paper.pdf");
  fs.writeFileSync(sourcePath, "%PDF-source", "utf8");
  fs.writeFileSync(path.join(root, "paper-译文.pdf"), "%PDF-existing", "utf8");
  const capture = createTranslatedPdfCapture(sourcePath);
  const translated = Buffer.from("%PDF-next", "utf8");
  fs.writeFileSync(capture.tempPath, translated);

  const result = finalizeTranslatedPdfCapture(capture, { byteLength: translated.length });

  assert.equal(result.fileName, "paper-译文 (2).pdf");
  assert.equal(fs.readFileSync(path.join(root, "paper-译文.pdf"), "utf8"), "%PDF-existing");
  assert.equal(fs.readFileSync(result.absolutePath, "utf8"), "%PDF-next");
});

test("translated PDF capture rejects invalid content and mismatched byte counts", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imt-pdf-capture-invalid-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "paper.pdf");
  fs.writeFileSync(sourcePath, "%PDF-source", "utf8");

  const invalidHeader = createTranslatedPdfCapture(sourcePath);
  fs.writeFileSync(invalidHeader.tempPath, "not a PDF", "utf8");
  assert.deepEqual(finalizeTranslatedPdfCapture(invalidHeader, { byteLength: 9 }), {
    ok: false,
    code: "invalid_pdf_download",
  });
  assert.equal(fs.existsSync(invalidHeader.tempDirectory), false);

  const invalidLength = createTranslatedPdfCapture(sourcePath);
  fs.writeFileSync(invalidLength.tempPath, "%PDF-translated", "utf8");
  assert.deepEqual(finalizeTranslatedPdfCapture(invalidLength, { byteLength: 1 }), {
    ok: false,
    code: "invalid_pdf_download",
  });
  assert.equal(fs.existsSync(invalidLength.tempDirectory), false);
  assert.equal(fs.existsSync(path.join(root, "paper-译文.pdf")), false);
});

test("capture cleanup is restricted to its private source-directory child", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "imt-pdf-capture-cleanup-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "paper.pdf");
  fs.writeFileSync(sourcePath, "%PDF-source", "utf8");
  const capture = createTranslatedPdfCapture(sourcePath);
  fs.writeFileSync(capture.tempPath, "partial", "utf8");
  assert.equal(discardTranslatedPdfCapture(capture), true);
  assert.equal(fs.existsSync(capture.tempDirectory), false);

  const protectedDirectory = path.join(root, "keep-me");
  fs.mkdirSync(protectedDirectory);
  fs.writeFileSync(path.join(protectedDirectory, "capture.pdf"), "protected", "utf8");
  assert.equal(discardTranslatedPdfCapture({
    sourcePath,
    tempDirectory: protectedDirectory,
    tempPath: path.join(protectedDirectory, "capture.pdf"),
  }), false);
  assert.equal(fs.existsSync(protectedDirectory), true);
});
