"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  classifyProviderAuthNavigation,
  isImmersiveAccountFlowUrl,
} = require("../plugin/provider-auth-navigation");

test("classifies supported provider OAuth only from Immersive account flows", () => {
  const accountsUrl = "https://immersivetranslate.com/accounts/login?from=plugin";
  const profileUrl = "https://immersivetranslate.com/profile";

  assert.equal(
    classifyProviderAuthNavigation("https://accounts.google.com/o/oauth2/auth?client_id=one", accountsUrl).id,
    "google"
  );
  assert.equal(
    classifyProviderAuthNavigation("https://open.weixin.qq.com/connect/qrconnect?appid=one", profileUrl).id,
    "wechat"
  );
  assert.equal(
    classifyProviderAuthNavigation("https://appleid.apple.com/auth/authorize", accountsUrl).id,
    "apple"
  );
  assert.equal(
    classifyProviderAuthNavigation("https://www.facebook.com/v13.0/dialog/oauth", accountsUrl).id,
    "facebook"
  );
  assert.equal(classifyProviderAuthNavigation("https://accounts.google.com/o/oauth2/auth", "https://dash.immersivetranslate.com/#general"), null);
});

test("provider classification fails closed for deceptive URLs", () => {
  const source = "https://immersivetranslate.com/accounts/login";

  assert.equal(classifyProviderAuthNavigation("http://accounts.google.com/o/oauth2/auth", source), null);
  assert.equal(classifyProviderAuthNavigation("https://accounts.google.com.evil.example/o/oauth2/auth", source), null);
  assert.equal(classifyProviderAuthNavigation("https://evil.example/?next=https://open.weixin.qq.com", source), null);
  assert.equal(classifyProviderAuthNavigation("javascript:location.href='https://accounts.google.com'", source), null);
  assert.equal(classifyProviderAuthNavigation("https://accounts.google.com/o/oauth2/auth", "https://immersivetranslate.com.evil.example/accounts/login"), null);
});

test("recognizes only HTTPS account and profile pages as account-flow sources", () => {
  assert.equal(isImmersiveAccountFlowUrl("https://immersivetranslate.com/accounts/login"), true);
  assert.equal(isImmersiveAccountFlowUrl("https://immersivetranslate.com/profile/"), true);
  assert.equal(isImmersiveAccountFlowUrl("https://immersivetranslate.com/profile/orders"), true);
  assert.equal(isImmersiveAccountFlowUrl("https://immersivetranslate.com/options"), false);
  assert.equal(isImmersiveAccountFlowUrl("http://immersivetranslate.com/profile"), false);
});
