"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { createChallenge, createPkceAuthSession, PkceAuthError } = require("../plugin/pkce-auth");

const RFC_VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const RFC_CHALLENGE = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

test("creates the RFC 7636 S256 challenge without exposing the verifier", () => {
  assert.equal(createChallenge(RFC_VERIFIER), RFC_CHALLENGE);

  const session = createPkceAuthSession({
    now: () => 1_000,
    randomBytes: (size) => size === 32 ? Buffer.from(RFC_VERIFIER, "base64url") : Buffer.alloc(size, 7),
  });
  const challenge = session.beginSession({ requestId: "request-1" });

  assert.deepEqual(challenge, {
    requestId: "request-1",
    challenge: RFC_CHALLENGE,
    method: "S256",
    createdAt: 1_000,
    expiresAt: 601_000,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(challenge, "verifier"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(session.getSession(), "verifier"), false);
});

test("beginSession is idempotent while the current request is alive", () => {
  let now = 10_000;
  let randomCalls = 0;
  const session = createPkceAuthSession({
    now: () => now,
    randomBytes: (size) => { randomCalls++; return Buffer.alloc(size, randomCalls); },
  });

  const first = session.beginSession();
  const second = session.beginSession();

  assert.deepEqual(second, first);
  assert.equal(randomCalls, 2);
});

test("accepts one auth code only for the active request and builds the exchange payload", () => {
  const session = createPkceAuthSession({
    now: () => 20_000,
    randomBytes: (size) => Buffer.alloc(size, 3),
  });
  session.beginSession({ requestId: "request-2" });

  assert.throws(
    () => session.consumeAuthCode("wrong-request", "auth-code"),
    (error) => error instanceof PkceAuthError && error.code === "REQUEST_ID_MISMATCH",
  );

  const accepted = session.consumeAuthCode("request-2", "auth-code");
  assert.deepEqual(accepted, { requestId: "request-2", accepted: true });
  assert.deepEqual(session.buildExchangeRequest(), {
    code: "auth-code",
    verifier: Buffer.alloc(32, 3).toString("base64url"),
  });

  assert.throws(
    () => session.consumeAuthCode("request-2", "replayed-code"),
    (error) => error instanceof PkceAuthError && error.code === "AUTH_CODE_ALREADY_CONSUMED",
  );
});

test("expires and clears a session before accepting a late callback", () => {
  let now = 30_000;
  const session = createPkceAuthSession({
    now: () => now,
    ttlMs: 500,
    randomBytes: (size) => Buffer.alloc(size, 4),
  });
  session.beginSession({ requestId: "request-3" });
  now = 30_500;

  assert.equal(session.getSession(), null);
  assert.throws(
    () => session.consumeAuthCode("request-3", "late-code"),
    (error) => error instanceof PkceAuthError && error.code === "NO_ACTIVE_SESSION",
  );
  assert.throws(
    () => session.buildExchangeRequest(),
    (error) => error instanceof PkceAuthError && error.code === "NO_ACTIVE_SESSION",
  );
});

test("clearSession invalidates the verifier and any pending auth code", () => {
  const session = createPkceAuthSession({ randomBytes: (size) => Buffer.alloc(size, 5) });
  session.beginSession({ requestId: "request-4" });
  session.consumeAuthCode("request-4", "auth-code");
  session.clearSession();

  assert.equal(session.getSession(), null);
  assert.throws(
    () => session.buildExchangeRequest(),
    (error) => error instanceof PkceAuthError && error.code === "NO_ACTIVE_SESSION",
  );
});
