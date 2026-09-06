"use strict";

const DASHBOARD_ORIGIN_HOSTS = {
  "dash.immersivetranslate.com": true,
  "app.immersivetranslate.com": true,
  "immersivetranslate.com": true,
  "onboarding.immersivetranslate.com": true,
  "immersive-translate.owenyoung.com": true,
};

const DASHBOARD_APP_HOSTS = {
  "dash.immersivetranslate.com": true,
  "app.immersivetranslate.com": true,
};

function isDashboardOriginHost(hostname) {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_ORIGIN_HOSTS, String(hostname || "").toLowerCase());
}

function isDashboardAppHost(hostname) {
  return Object.prototype.hasOwnProperty.call(DASHBOARD_APP_HOSTS, String(hostname || "").toLowerCase());
}

module.exports = {
  DASHBOARD_ORIGIN_HOSTS: DASHBOARD_ORIGIN_HOSTS,
  DASHBOARD_APP_HOSTS: DASHBOARD_APP_HOSTS,
  isDashboardOriginHost: isDashboardOriginHost,
  isDashboardAppHost: isDashboardAppHost,
};
