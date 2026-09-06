"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { sanitizeUserInfo, sanitizeTrustedUserInfo } = require("../plugin/user-info");

test("sanitizeUserInfo keeps allowlisted identity fields and unwraps data envelopes", () => {
  assert.deepEqual(sanitizeUserInfo({
    email: "user@example.com",
    userType: "pro",
    token: "must-not-copy",
    avatar: { token: "nested" },
  }), { email: "user@example.com", userType: "pro" });

  assert.deepEqual(sanitizeUserInfo({
    data: { userId: "u-1", nickname: "reader", token: "secret" },
  }), { userId: "u-1", nickname: "reader" });

  assert.equal(sanitizeUserInfo({ id: 7, userType: "pro" }), null);
  assert.deepEqual(sanitizeTrustedUserInfo({ id: 7, userType: "pro" }), { id: 7, userType: "pro" });
  assert.equal(sanitizeUserInfo({ nickname: "x".repeat(1025) }), null);
});
