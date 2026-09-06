"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createGmHeaders } = require("../plugin/gm-headers");
const { createGmResponseValue } = require("../plugin/gm-response-value");

function api() {
  return createGmResponseValue(createGmHeaders().getResponseHeader);
}

test("host and document responses share json, arraybuffer, blob, and text classification", () => {
  const decode = api().decode;
  const bytes = new Uint8Array([97, 98, 99]).buffer;
  const jsonHeaders = { "Content-Type": "application/json" };

  assert.equal(decode({ responseType: "text", text: "plain" }), "plain");
  assert.deepEqual(decode({ responseType: "json", text: "{\"n\":1}", headers: jsonHeaders }), { n: 1 });
  assert.deepEqual(decode({ responseType: "json", text: "{}", json: { n: 2 } }), { n: 2 });
  assert.equal(decode({ responseType: "arraybuffer", bytes: bytes }), bytes);

  const blob = decode({
    responseType: "blob",
    bytes: bytes,
    headers: { "Content-Type": "image/png" },
  });
  assert.equal(blob.type, "image/png");
  assert.equal(blob.size, 3);
});

test("document type uses HTML mime when the content-type mentions html", () => {
  const decode = api().decode;
  if (typeof DOMParser !== "function") {
    assert.equal(decode({
      responseType: "document",
      text: "<p>hi</p>",
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }), "<p>hi</p>");
    return;
  }
  const parsed = decode({
    responseType: "document",
    text: "<p>hi</p>",
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
  assert.equal(parsed.constructor.name, "Document");
});
