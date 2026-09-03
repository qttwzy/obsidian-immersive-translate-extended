"use strict";

const DEFAULT_MAX_TOKEN_LENGTH = 8192;

function cloneUserInfo(value) {
  if (!value || typeof value !== "object") return null;
  return Object.assign({}, value);
}

function sameValue(left, right) {
  return JSON.stringify(left || null) === JSON.stringify(right || null);
}

class AuthSessionAdapter {
  constructor({ sanitizeUserInfo, maxTokenLength = DEFAULT_MAX_TOKEN_LENGTH } = {}) {
    if (typeof sanitizeUserInfo !== "function") throw new TypeError("sanitizeUserInfo must be a function");
    if (!Number.isSafeInteger(maxTokenLength) || maxTokenLength <= 0) throw new TypeError("maxTokenLength must be positive");
    this._sanitizeUserInfo = sanitizeUserInfo;
    this._maxTokenLength = maxTokenLength;
    this._pkce = null;
    this._cookies = "";
  }

  applyPkceState(state) {
    if (!state || typeof state !== "object") return { changed: false };
    if (state.authenticated === false || state.token === "" || state.token === null) return this.clearPkce();
    if (typeof state.token !== "string" || state.token.length === 0 || state.token.length > this._maxTokenLength) return { changed: false };

    var userInfo = null;
    try { userInfo = cloneUserInfo(this._sanitizeUserInfo(state.userInfo)); } catch (e) { userInfo = null; }
    var changed = !this._pkce || this._pkce.token !== state.token || !sameValue(this._pkce.userInfo, userInfo);
    this._pkce = { token: state.token, userInfo: userInfo };
    return { changed: changed, source: "pkce" };
  }

  clearPkce() {
    var changed = !!this._pkce;
    this._pkce = null;
    return { changed: changed, source: "pkce" };
  }

  applyLegacyCookies(cookieHeader) {
    var next = typeof cookieHeader === "string" ? cookieHeader : "";
    var changed = next !== this._cookies;
    this._cookies = next;
    return { changed: changed };
  }

  clear() {
    var changed = !!this._pkce || !!this._cookies;
    this._pkce = null;
    this._cookies = "";
    return { changed: changed };
  }

  getToken() {
    return this._pkce ? this._pkce.token : "";
  }

  getCookies() {
    return this._cookies;
  }

  getUserInfo() {
    return this._pkce ? cloneUserInfo(this._pkce.userInfo) : null;
  }

  getPkceState() {
    if (!this._pkce) return null;
    return {
      version: 1,
      authenticated: true,
      token: this._pkce.token,
      userInfo: cloneUserInfo(this._pkce.userInfo),
    };
  }
}

module.exports = { AuthSessionAdapter };
