"use strict";

const { PkceAuthError, createPkceAuthSession } = require("./pkce-auth");

const PKCE_API_BASE = "https://api2.immersivetranslate.com/";
const PKCE_SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_PERSISTED_TOKEN_LENGTH = 8192;

function extractApiData(body) {
  return body && typeof body === "object" && body.data !== undefined ? body.data : body;
}

async function readResponseBody(response) {
  if (!response || typeof response !== "object") return null;
  if (response.json && typeof response.json === "object") return response.json;
  if (typeof response.json === "function") {
    try { return await response.json(); } catch (e) {}
  }
  if (typeof response.text === "string" && response.text) {
    try { return JSON.parse(response.text); } catch (e) { return response.text; }
  }
  if (typeof response.text === "function") {
    try {
      const text = await response.text();
      try { return JSON.parse(text); } catch (e) { return text; }
    } catch (e) {}
  }
  return null;
}

async function requestPkceJson(request, path, options) {
  const response = await request(Object.assign({
    url: PKCE_API_BASE + path,
    method: "GET",
    throw: false,
  }, options || {}));
  const body = await readResponseBody(response);
  const status = Number(response && response.status);
  if ((Number.isFinite(status) && (status < 200 || status >= 300))
      || (body && typeof body === "object" && body.code !== undefined && body.code !== 0)) {
    const error = new Error("PKCE request failed");
    error.status = status;
    if (body && typeof body === "object") error.apiMessage = String(body.message || body.error || "");
    throw error;
  }
  return body;
}

function pkceFailure(error) {
  const status = Number(error && error.status);
  const message = String(error && error.apiMessage || "").toLowerCase();
  let code = "temporary_unavailable";
  if (message.includes("expired")) code = "auth_code_expired";
  else if (message.includes("used")) code = "auth_code_used";
  else if (message.includes("mismatch") || message.includes("verifier")) code = "verifier_mismatch";
  else if (status === 401 || status === 403) code = "auth_code_rejected";
  else if (status >= 400 && status < 500) code = "pkce_exchange_failed";
  else if (!Number.isFinite(status) || status <= 0) code = "network_unavailable";
  return {
    ok: false,
    code,
    message: "PKCE login could not be completed",
    retryable: code === "network_unavailable" || code === "temporary_unavailable",
  };
}

function sessionFailure(error) {
  if (!(error instanceof PkceAuthError)) return pkceFailure(error);
  if (error.code === "INVALID_AUTH_CODE") {
    return { ok: false, code: "invalid_auth_code", message: "PKCE login could not be completed", retryable: false };
  }
  if (error.code === "AUTH_CODE_ALREADY_CONSUMED") {
    return { ok: false, code: "pkce_exchange_in_progress", message: "Another PKCE exchange is already running", retryable: true };
  }
  return { ok: false, code: "pkce_session_not_found", message: "PKCE session not found or expired", retryable: false };
}

function createDashboardPkceHost(options = {}) {
  if (typeof options.request !== "function") throw new TypeError("request is required");
  if (typeof options.applyAuthState !== "function") throw new TypeError("applyAuthState is required");
  if (typeof options.sanitizeUserInfo !== "function") throw new TypeError("sanitizeUserInfo is required");

  const authSession = createPkceAuthSession({
    now: options.now,
    randomBytes: options.randomBytes,
    ttlMs: options.ttlMs === undefined ? PKCE_SESSION_TTL_MS : options.ttlMs,
  });
  // generation is the ownership lease for the one-shot exchange. Clearing or
  // replacing a session makes every late network continuation harmless.
  let generation = 0;
  let exchange = null;

  function clear() {
    generation++;
    exchange = null;
    authSession.clearSession();
  }

  function isCurrent(record) {
    if (!record || exchange !== record || generation !== record.generation) return false;
    const active = authSession.getSession();
    return !!(active && active.requestId === record.requestId);
  }

  function getOrCreateChallenge() {
    if (exchange) {
      return { ok: false, code: "pkce_exchange_in_progress", message: "Another PKCE exchange is already running", retryable: true };
    }
    try {
      const publicSession = authSession.beginSession();
      return {
        ok: true,
        requestId: publicSession.requestId,
        challenge: publicSession.challenge,
        expiresAt: publicSession.expiresAt,
      };
    } catch (error) {
      return sessionFailure(error);
    }
  }

  async function getPersistedAuthState() {
    if (typeof options.readAuthState !== "function") return { ok: true, authState: null };
    try {
      const state = await options.readAuthState();
      const token = state && state.token;
      if (typeof token !== "string" || !token || token.length > MAX_PERSISTED_TOKEN_LENGTH) {
        return { ok: true, authState: null };
      }
      const sanitizedUser = options.sanitizeUserInfo(state.userInfo);
      const userInfo = sanitizedUser && typeof sanitizedUser === "object"
        ? Object.assign({}, sanitizedUser)
        : null;
      return { ok: true, authState: { token, userInfo } };
    } catch (error) {
      return { ok: false, code: "auth_state_unavailable", message: "Persisted authentication state is unavailable", retryable: true };
    }
  }

  function submitAuthCode(data) {
    const requestId = data && data.requestId;
    const authCode = data && data.authCode;
    const active = authSession.getSession();
    if (!active || requestId !== active.requestId) {
      return Promise.resolve({ ok: false, code: "pkce_session_not_found", message: "PKCE session not found or expired", retryable: false });
    }
    if (exchange) {
      if (exchange.requestId === requestId && exchange.authCode === authCode) return exchange.promise;
      return Promise.resolve({ ok: false, code: "pkce_exchange_in_progress", message: "Another PKCE exchange is already running", retryable: true });
    }

    let exchangeRequest;
    try {
      authSession.consumeAuthCode(requestId, authCode);
      exchangeRequest = authSession.buildExchangeRequest();
    } catch (error) {
      if (error instanceof PkceAuthError && error.code === "INVALID_AUTH_CODE") clear();
      return Promise.resolve(sessionFailure(error));
    }

    const record = {
      requestId,
      authCode,
      generation,
      promise: null,
    };
    record.promise = (async () => {
      try {
        const tokenBody = await requestPkceJson(options.request, "v1/user/pkce/exchange-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: exchangeRequest.code, verifier: exchangeRequest.verifier }),
        });
        if (!isCurrent(record)) return { ok: false, code: "pkce_session_cleared", message: "PKCE session was cleared", retryable: true };
        const tokenData = extractApiData(tokenBody);
        const token = tokenData && typeof tokenData === "object" ? tokenData.token : tokenData;
        if (typeof token !== "string" || !token) throw new Error("PKCE token missing");

        const userBody = await requestPkceJson(options.request, "v1/user", {
          headers: { "Content-Type": "application/json", token },
        });
        if (!isCurrent(record)) return { ok: false, code: "pkce_session_cleared", message: "PKCE session was cleared", retryable: true };
        const userInfo = options.sanitizeUserInfo(extractApiData(userBody));
        await options.applyAuthState({ token, userInfo });
        if (!isCurrent(record)) return { ok: false, code: "pkce_session_cleared", message: "PKCE session was cleared", retryable: true };
        return { ok: true, authState: { token, userInfo } };
      } catch (error) {
        if (!isCurrent(record)) return { ok: false, code: "pkce_session_cleared", message: "PKCE session was cleared", retryable: true };
        return pkceFailure(error);
      } finally {
        if (exchange === record) clear();
      }
    })();
    exchange = record;
    return record.promise;
  }

  function handle(type, data) {
    if (type === "getPersistedAuthState") return getPersistedAuthState();
    if (type === "getOrCreatePkceChallenge" || type === "getOrCreatePkceChallengeAsync") {
      return Promise.resolve(getOrCreateChallenge());
    }
    if (type === "exchangePkceToken" || type === "submitPkceAuthCodeAsync") return submitAuthCode(data || {});
    if (type === "clearPkceSession") { clear(); return Promise.resolve({ ok: true }); }
    return Promise.resolve({ ok: false, code: "unsupported_message", message: "PKCE host method is not supported", retryable: false });
  }

  return { handle, clear };
}

module.exports = {
  PKCE_API_BASE,
  PKCE_SESSION_TTL_MS,
  createDashboardPkceHost,
};
