"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createGmHeaders } = require("../plugin/gm-headers");

test("createGmHeaders normalizes Headers, arrays, and plain objects", () => {
  const api = createGmHeaders();
  assert.deepEqual(api.headersToObject({
    forEach(callback) {
      callback("text/plain", "Content-Type");
      callback("abc", "X-Token");
    },
  }), { "Content-Type": "text/plain", "X-Token": "abc" });

  assert.deepEqual(api.headersToObject([["Accept", "application/json"], ["X-Id", 7]]), {
    Accept: "application/json",
    "X-Id": "7",
  });
  assert.deepEqual(api.headersToObject({ Accept: "text/html", skip: null, empty: undefined, keep: 0 }), {
    Accept: "text/html",
    keep: "0",
  });
  assert.deepEqual(api.headersToObject(null), {});
});

test("createGmHeaders looks up header names without regard to case", () => {
  const api = createGmHeaders();
  const headers = { "Content-Type": "application/json", "X-Count": "2" };
  assert.equal(api.hasHeader(headers, "content-type"), true);
  assert.equal(api.hasHeader(headers, "authorization"), false);
  assert.equal(api.getResponseHeader(headers, "CONTENT-TYPE"), "application/json");
  assert.equal(api.getResponseHeader(headers, "missing"), "");
  assert.equal(api.responseHeadersToString(headers), "Content-Type: application/json\r\nX-Count: 2");
});
