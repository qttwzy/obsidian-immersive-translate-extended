"use strict";

const PROFILE_URL = "https://immersivetranslate.com/profile";
const EMAIL_LOGIN_URL = "https://immersivetranslate.com/accounts/login?from=plugin&return_url=https%3A%2F%2Fdash.immersivetranslate.com%2F%23general";
const WECHAT_FAQ_URL = "https://immersivetranslate.com/zh-Hans/docs/faq/#微信登录问题";

const PROVIDER_BY_HOST = Object.freeze({
  "accounts.google.com": Object.freeze({ id: "google", label: "Google" }),
  "open.weixin.qq.com": Object.freeze({ id: "wechat", label: "微信" }),
  "appleid.apple.com": Object.freeze({ id: "apple", label: "Apple" }),
  "facebook.com": Object.freeze({ id: "facebook", label: "Facebook" }),
  "www.facebook.com": Object.freeze({ id: "facebook", label: "Facebook" }),
});

function parseHttpsUrl(value) {
  try {
    const url = value instanceof URL ? value : new URL(String(value));
    return url.protocol === "https:" ? url : null;
  } catch (error) {
    return null;
  }
}

function isImmersiveAccountFlowUrl(value) {
  const url = parseHttpsUrl(value);
  if (!url || url.hostname.toLowerCase() !== "immersivetranslate.com") return false;
  return url.pathname === "/accounts"
    || url.pathname.startsWith("/accounts/")
    || url.pathname === "/profile"
    || url.pathname.startsWith("/profile/");
}

function classifyProviderAuthNavigation(targetValue, sourceValue) {
  if (!isImmersiveAccountFlowUrl(sourceValue)) return null;
  const target = parseHttpsUrl(targetValue);
  if (!target) return null;
  const provider = PROVIDER_BY_HOST[target.hostname.toLowerCase()];
  return provider ? { id: provider.id, label: provider.label } : null;
}

module.exports = {
  EMAIL_LOGIN_URL,
  PROFILE_URL,
  WECHAT_FAQ_URL,
  classifyProviderAuthNavigation,
  isImmersiveAccountFlowUrl,
};
