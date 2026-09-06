"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { isDashboardOriginHost, isDashboardAppHost } = require("../plugin/dashboard-origins");

test("Dashboard origin hosts include official account and Dashboard sites", () => {
  assert.equal(isDashboardOriginHost("dash.immersivetranslate.com"), true);
  assert.equal(isDashboardOriginHost("APP.immersivetranslate.com"), true);
  assert.equal(isDashboardOriginHost("immersivetranslate.com"), true);
  assert.equal(isDashboardOriginHost("onboarding.immersivetranslate.com"), true);
  assert.equal(isDashboardOriginHost("immersive-translate.owenyoung.com"), true);
  assert.equal(isDashboardOriginHost("api2.immersivetranslate.com"), false);
  assert.equal(isDashboardOriginHost("evil.example"), false);
});

test("Dashboard app hosts are dash and app for return navigation", () => {
  assert.equal(isDashboardAppHost("dash.immersivetranslate.com"), true);
  assert.equal(isDashboardAppHost("APP.immersivetranslate.com"), true);
  assert.equal(isDashboardAppHost("immersivetranslate.com"), false);
  assert.equal(isDashboardAppHost("onboarding.immersivetranslate.com"), false);
  assert.equal(isDashboardAppHost("api2.immersivetranslate.com"), false);
});
