"use strict";

const crypto = require("node:crypto");

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const VERIFIER_BYTES = 32;
const REQUEST_ID_BYTES = 16;
const MAX_REQUEST_ID_LENGTH = 256;
const MAX_AUTH_CODE_LENGTH = 4096;

class PkceAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PkceAuthError";
    this.code = code;
  }
}

function toBase64Url(value) {
  return Buffer.from(value).toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createChallenge(verifier) {
  if (typeof verifier !== "string" || verifier.length < 43 || verifier.length > 128) {
    throw new PkceAuthError("INVALID_VERIFIER", "PKCE verifier must be 43-128 characters");
  }
  return toBase64Url(crypto.createHash("sha256").update(verifier, "ascii").digest());
}

function randomBase64Url(randomBytes, byteLength) {
  return toBase64Url(randomBytes(byteLength));
}

function copyPublicSession(session) {
  return {
    requestId: session.requestId,
    challenge: session.challenge,
    method: session.method,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
  };
}

function createPkceAuthSession(options = {}) {
  const now = typeof options.now === "function" ? options.now : () => Date.now();
  const randomBytes = typeof options.randomBytes === "function" ? options.randomBytes : crypto.randomBytes;
  const ttlMs = options.ttlMs === undefined ? DEFAULT_TTL_MS : Number(options.ttlMs);
  if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
    throw new TypeError("ttlMs must be a positive safe integer");
  }

  let current = null;

  function clearSession() {
    // Drop both secrets together; no caller receives a reference to this object.
    current = null;
  }

  function isExpired() {
    return current !== null && now() >= current.expiresAt;
  }

  function requireActiveSession() {
    if (isExpired()) clearSession();
    if (!current) throw new PkceAuthError("NO_ACTIVE_SESSION", "No active PKCE login session");
    return current;
  }

  function beginSession({ requestId } = {}) {
    if (current && !isExpired()) return copyPublicSession(current);
    clearSession();

    const createdAt = now();
    const verifier = randomBase64Url(randomBytes, VERIFIER_BYTES);
    const challenge = createChallenge(verifier);
    const normalizedRequestId = requestId === undefined
      ? randomBase64Url(randomBytes, REQUEST_ID_BYTES)
      : String(requestId);
    if (!normalizedRequestId || normalizedRequestId.length > MAX_REQUEST_ID_LENGTH) {
      throw new TypeError("requestId must be 1-256 characters");
    }

    current = {
      requestId: normalizedRequestId,
      verifier,
      challenge,
      method: "S256",
      createdAt,
      expiresAt: createdAt + ttlMs,
      authCode: null,
    };
    return copyPublicSession(current);
  }

  function getSession() {
    if (!current || isExpired()) {
      if (current) clearSession();
      return null;
    }
    return copyPublicSession(current);
  }

  function consumeAuthCode(requestId, authCode) {
    const session = requireActiveSession();
    if (String(requestId) !== session.requestId) {
      throw new PkceAuthError("REQUEST_ID_MISMATCH", "PKCE callback does not match the active request");
    }
    if (session.authCode !== null) {
      throw new PkceAuthError("AUTH_CODE_ALREADY_CONSUMED", "PKCE auth code was already accepted");
    }
    if (typeof authCode !== "string" || !authCode || authCode.length > MAX_AUTH_CODE_LENGTH) {
      throw new PkceAuthError("INVALID_AUTH_CODE", "PKCE auth code is invalid");
    }
    session.authCode = authCode;
    return { requestId: session.requestId, accepted: true };
  }

  function buildExchangeRequest() {
    const session = requireActiveSession();
    if (session.authCode === null) {
      throw new PkceAuthError("AUTH_CODE_REQUIRED", "PKCE auth code has not been accepted");
    }
    return { code: session.authCode, verifier: session.verifier };
  }

  return {
    beginSession,
    getSession,
    consumeAuthCode,
    buildExchangeRequest,
    clearSession,
  };
}

module.exports = {
  DEFAULT_TTL_MS,
  PkceAuthError,
  createChallenge,
  createPkceAuthSession,
};
