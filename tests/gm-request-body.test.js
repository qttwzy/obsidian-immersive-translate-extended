"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createGmHeaders } = require("../plugin/gm-headers");
const { createGmRequestBody } = require("../plugin/gm-request-body");

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

test("host and IPC bodies share GET omission, JSON, and URLSearchParams classification", async () => {
  const hasHeader = createGmHeaders().hasHeader;
  const api = createGmRequestBody(hasHeader);
  const jsonHeaders = {};
  const formHeaders = {};

  assert.equal(await api.serializeHostBody({ n: 1 }, "GET", {}), undefined);
  assert.equal(await api.serializeIpcBody({ n: 1 }, "HEAD", {}), null);
  assert.equal(await api.serializeHostBody("raw", "POST", {}), "raw");
  assert.deepEqual(await api.serializeIpcBody("raw", "POST", {}), { type: "text", data: "raw" });

  assert.equal(await api.serializeHostBody({ n: 1 }, "POST", jsonHeaders), JSON.stringify({ n: 1 }));
  assert.equal(jsonHeaders["Content-Type"], "application/json");
  assert.deepEqual(await api.serializeIpcBody({ n: 1 }, "POST", {}), {
    type: "text",
    data: JSON.stringify({ n: 1 }),
  });

  const params = new URLSearchParams({ q: "one" });
  assert.equal(await api.serializeHostBody(params, "POST", formHeaders), "q=one");
  assert.equal(formHeaders["Content-Type"], "application/x-www-form-urlencoded;charset=UTF-8");
  assert.deepEqual(await api.serializeIpcBody(params, "POST", {}), {
    type: "text",
    data: "q=one",
  });
});

test("binary bodies become a requestUrl ArrayBuffer or an IPC base64 payload", async () => {
  const api = createGmRequestBody(createGmHeaders().hasHeader);
  const bytes = new Uint8Array([0, 1, 255]);
  const hostBody = await api.serializeHostBody(bytes, "POST", {});
  assert.ok(hostBody instanceof ArrayBuffer);
  assert.deepEqual(new Uint8Array(hostBody), bytes);
  assert.deepEqual(await api.serializeIpcBody(bytes, "POST", {}, bytesToBase64), {
    type: "base64",
    data: Buffer.from(bytes).toString("base64"),
  });
});

test("host FormData uses a generated multipart boundary", async () => {
  const api = createGmRequestBody(createGmHeaders().hasHeader);
  const headers = { "Content-Type": "multipart/form-data; boundary=wrong" };
  const formData = new FormData();
  formData.append("field", "value");
  const body = await api.serializeHostBody(formData, "POST", headers);
  const contentType = headers["Content-Type"];
  const boundary = contentType.split("boundary=")[1];
  assert.ok(boundary && boundary !== "wrong");
  assert.match(new TextDecoder().decode(body), new RegExp("^--" + boundary));
});
