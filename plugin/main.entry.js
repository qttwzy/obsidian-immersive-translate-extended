var IMTExtendedPlugin = (function () {
  "use strict";

  var obsidian = require("obsidian");
  var AuthSessionAdapter = require("./auth-session-adapter").AuthSessionAdapter;
  var createDashboardPkceHost = require("./dashboard-pkce-host").createDashboardPkceHost;
  var providerAuthNavigation = require("./provider-auth-navigation");
  var classifyProviderAuthNavigation = providerAuthNavigation.classifyProviderAuthNavigation;
  var PROVIDER_EMAIL_LOGIN_URL = providerAuthNavigation.EMAIL_LOGIN_URL;
  var PROVIDER_PROFILE_URL = providerAuthNavigation.PROFILE_URL;
  var PROVIDER_WECHAT_FAQ_URL = providerAuthNavigation.WECHAT_FAQ_URL;
  var createTranslationViewBridge = require("./translation-view-bridge").createTranslationViewBridge;
  var documentWorkspace = require("./document-workspace");
  var FILE_WORKSPACE_URL = documentWorkspace.FILE_WORKSPACE_URL;
  var PDF_WORKSPACE_URL = documentWorkspace.PDF_WORKSPACE_URL;
  var createTranslatedPdfCapture = documentWorkspace.createTranslatedPdfCapture;
  var discardTranslatedPdfCapture = documentWorkspace.discardTranslatedPdfCapture;
  var finalizeTranslatedPdfCapture = documentWorkspace.finalizeTranslatedPdfCapture;
  var getDocumentWorkspaceSpec = documentWorkspace.getDocumentWorkspaceSpec;
  var handoffLocalFileWithCdp = documentWorkspace.handoffLocalFileWithCdp;
  var isTrustedDocumentWorkspaceUrl = documentWorkspace.isTrustedDocumentWorkspaceUrl;
  var resolveLocalVaultFile = documentWorkspace.resolveLocalVaultFile;
  var documentRuntime = require("./document-runtime");
  var DOCUMENT_RUNTIME_ACTION_CHANNEL = documentRuntime.DOCUMENT_RUNTIME_ACTION_CHANNEL;
  var DOCUMENT_RUNTIME_INIT_CHANNEL = documentRuntime.DOCUMENT_RUNTIME_INIT_CHANNEL;
  var DOCUMENT_RUNTIME_REQUEST_CHANNEL = documentRuntime.DOCUMENT_RUNTIME_REQUEST_CHANNEL;
  var DOCUMENT_RUNTIME_STATUS_CHANNEL = documentRuntime.DOCUMENT_RUNTIME_STATUS_CHANNEL;
  var DOCUMENT_RUNTIME_WORLD_ID = documentRuntime.DOCUMENT_RUNTIME_WORLD_ID;
  var createDocumentRuntimeBootstrap = documentRuntime.createDocumentRuntimeBootstrap;
  var userscriptCompat = require("./userscript-compat");
  var OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE = userscriptCompat.OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE;
  var OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE = userscriptCompat.OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE;
  var patchUserscriptHostContentBridge = userscriptCompat.patchUserscriptHostContentBridge;
  var patchUserscriptSidePanelMinWidth = userscriptCompat.patchUserscriptSidePanelMinWidth;
  var DEFAULT_MOCK_SIDE_PANEL_WIDTH = userscriptCompat.DEFAULT_MOCK_SIDE_PANEL_WIDTH;
  var OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH = userscriptCompat.OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH;
  var runtimeInstaller = require("./runtime-installer");
  var OFFICIAL_RUNTIME_URL = runtimeInstaller.OFFICIAL_RUNTIME_URL;
  var extractRuntimeVersion = runtimeInstaller.extractRuntimeVersion;
  var installRuntime = runtimeInstaller.installRuntime;
  var loadInstalledRuntime = runtimeInstaller.loadInstalledRuntime;

  var PLUGIN_ID = "immersive-translate-extended";
  var PLUGIN_VERSION = "4.0.0";
  var DASHBOARD_EMBEDDED_ENABLED = true;
  var DOCUMENT_WORKSPACE_ENABLED = true;
  var RUNTIME_VERSION_CHECK_TTL_MS = 5 * 60 * 1000;
  var DOCUMENT_RUNTIME_MAX_BODY_BYTES = 8 * 1024 * 1024;
  var DOCUMENT_RUNTIME_MAX_RESPONSE_BYTES = 16 * 1024 * 1024;
  var DOCUMENT_RUNTIME_MAX_HEADER_BYTES = 64 * 1024;
  var DOCUMENT_PDF_CAPTURE_TIMEOUT_MS = 30 * 60 * 1000;

  var I18N_PLUGIN_ID = "i18n";
  var IMT_STANDALONE_ID = "immersive-translate";

  var GM_STORE_PREFIX = "imt-gm-";
  var IMT_CONFIG_KEY = "fullLocalUserConfig";
  var IMT_DASH_HOSTS = {
    "dash.immersivetranslate.com": true,
    "app.immersivetranslate.com": true,
    "immersivetranslate.com": true,
    "onboarding.immersivetranslate.com": true,
    "immersive-translate.owenyoung.com": true,
  };
  var IMT_COOKIE_HOSTS = {
    "immersivetranslate.com": true,
    "app.immersivetranslate.com": true,
    "dash.immersivetranslate.com": true,
    "api.immersivetranslate.com": true,
    "api2.immersivetranslate.com": true,
    "aigw1.immersivetranslate.com": true,
  };
  var IMT_AUTH_HOSTS = {
    "api.immersivetranslate.com": true,
    "api2.immersivetranslate.com": true,
    "aigw1.immersivetranslate.com": true,
  };
  var SYNC_MAX_KEYS = 512;
  var SYNC_MAX_VALUE_BYTES = 512 * 1024;
  var SYNC_MAX_TOTAL_BYTES = 2 * 1024 * 1024;
  var CONFIG_MAX_NODES = 16 * 1024;
  var CONFIG_MAX_ARRAY_ITEMS = 4 * 1024;
  var SYNC_SCOPE_PORTABLE = "portable-config";
  // Keep the wire value stable for older preload snapshots. The scope now
  // carries the complete credential-redacted advanced configuration.
  var SYNC_SCOPE_DASHBOARD = "dashboard-account-services";
  var SYNC_TOP_KEYS = { fullLocalUserConfig: true, userInfo: true, user_info: true, subscriptionInfo: true, translateServices: true, translateServiceConfig: true, memberConfig: true, serviceConfig: true, translatorConfig: true, usage_limit_stats: true };
  var DASHBOARD_SYNC_KEYS = { fullLocalUserConfig: true, userInfo: true, subscriptionInfo: true };
  var SERVICE_AVAILABILITY_FIELDS = { visible: true, enabled: true, enable: true, available: true, isAvailable: true, configured: true, isConfigured: true, hidden: true, disabled: true };
  var USER_INFO_FIELD_LIMITS = { id: 256, userId: 256, email: 512, nickname: 1024, avatar: 8192, userType: 64 };
  var DASHBOARD_PKCE_ARGUMENT_PREFIX = "--imt-pkce-channel=";
  var DOCUMENT_REQUEST_EVENT = "immersiveTranslateDocumentMessageThirdPartyTell";
  var DOCUMENT_RESPONSE_EVENT = "immersiveTranslateDocumentMessageTellThirdParty";
  var UI_TRANSLATE_SELECTORS = [
    ".titlebar", ".status-bar", ".workspace-ribbon", ".workspace-tab-header-container",
    ".workspace-sidedock-vault-profile", ".nav-header", ".nav-files-container",
    ".search-results-container", ".backlink-pane", ".outgoing-link-pane", ".tag-container",
    ".bookmarks-container", ".mod-settings", ".modal-container", ".menu",
    ".notice-container", ".suggestion-container", ".prompt", ".popover",
  ];
  var PROTECTED_EDITOR_SELECTORS = [".markdown-source-view", ".cm-editor"];
  var ARTICLE_TRANSLATE_SELECTOR = ".markdown-reading-view *";
  var LEGACY_HOST_SELECTORS = [".workspace", ".markdown-reading-view"].concat(UI_TRANSLATE_SELECTORS, PROTECTED_EDITOR_SELECTORS, [ARTICLE_TRANSLATE_SELECTOR]);
  var MINI_CONFIG_KEYS = ["interfaceLanguage", "targetLanguage", "translationService", "aiAssistantIds", "subtitleTranslateService", "inputTranslationService", "mouseHoverTranslationService", "protocolAgreeVersion", "isEnableGuideTips", "isEnableNotification", "forceAutoTranslate", "translationTheme", "translationMode", "translationThemePatterns", "selectTranslationFont", "enableWebViewInputTranslationDot"];
  var THEME_CONFIG_PATHS = { translationTheme: true, translationThemePatterns: true, selectTranslationFont: true };
  var CONTEXT_CONFIG_PATHS = {
    interfaceLanguage: true,
    subtitleTranslateService: true,
    inputTranslationService: true,
    mouseHoverTranslationService: true,
    protocolAgreeVersion: true,
    isEnableGuideTips: true,
    isEnableNotification: true,
    forceAutoTranslate: true,
    enableWebViewInputTranslationDot: true,
  };
  var DEFAULT_TARGET_LANGUAGE = "zh-CN";

  var DEFAULT_SETTINGS = {
    uiTranslateEnabled: true,
    articleTranslateEnabled: true,
    disableI18NImt: false,
    disableStandaloneImt: false,
    shownConflictWarning: false,
    conflictChoiceVersion: 1,
    imtPagerule: {
      selectors: [],
      excludeSelectors: PROTECTED_EDITOR_SELECTORS.slice(),
    },
    userscriptSidePanelConfigVersion: 0,
  };

  var CSS_STYLES =
    "#imt-conflict-notice{position:fixed;top:20px;right:20px;z-index:10000;background-color:var(--background-secondary);border:1px solid var(--text-error);border-radius:8px;padding:12px 16px;max-width:360px;box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:13px;color:var(--text-normal)}" +
    "#imt-conflict-notice h4{margin:0 0 6px;color:var(--text-error)}" +
    "#imt-conflict-notice p{margin:4px 0;line-height:1.5}" +
    "#imt-conflict-notice button{margin-top:8px;padding:4px 12px;border-radius:4px;border:1px solid var(--background-modifier-border);background-color:var(--interactive-accent);color:var(--text-on-accent);cursor:pointer;font-size:12px}" +
    ".imt-provider-login-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}" +
    ".imt-settings-import{display:flex;flex-direction:column;gap:8px;margin:8px 0 18px}" +
    ".imt-settings-import textarea{width:100%;min-height:112px;padding:8px;border:1px solid var(--background-modifier-border);border-radius:4px;background-color:var(--background-modifier-form-field);color:var(--text-normal);font:12px var(--font-monospace);resize:vertical}" +
    ".imt-settings-import-actions{display:flex;justify-content:flex-end;gap:8px}" +
    ".imt-account-bar{display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--background-modifier-border);border-radius:8px;margin-bottom:12px;background-color:var(--background-primary)}" +
    ".imt-account-avatar{width:32px;height:32px;border-radius:50%;background-color:var(--background-modifier-border);display:flex;align-items:center;justify-content:center;font-size:14px;color:var(--text-muted)}" +
    ".imt-account-info{flex:1}" +
    ".imt-account-name{font-size:13px;font-weight:500;color:var(--text-normal)}" +
    ".imt-account-status{font-size:11px;color:var(--text-muted)}" +
    ".imt-account-check{color:#22c55e;font-size:16px;font-weight:bold}";

  var _initGuardKey = "__imt_extend_init_guard__";
  var _reloadCountKey = "__imt_extend_reload_count__";
  // Removing a <script> node cannot undo an executed userscript, so boot it only once per page.
  var _engineStateKey = "__imt_extend_engine_state__";
  // This transient tail survives module reloads and removes itself after the last settings write settles.
  var _settingsSaveChainKey = "__imt_extend_settings_save_chain__";
  var _standaloneCoordinatorKey = "__imt_extend_standalone_coordinator__";
  var _runtimeInstallOwnerKey = "__imt_extend_runtime_install_owner__";

  function _getReloadCount() {
    try { var c = parseInt(sessionStorage.getItem(_reloadCountKey) || "0", 10); return isNaN(c) ? 0 : c; } catch (e) { return 0; }
  }
  function _incrementReloadCount() { try { sessionStorage.setItem(_reloadCountKey, String(_getReloadCount() + 1)); } catch (e) {} }
  function _resetReloadCount() { try { sessionStorage.removeItem(_reloadCountKey); } catch (e) {} }
  function _getSettingsSaveChain() {
    try { var chain = window[_settingsSaveChainKey]; if (chain && typeof chain.then === "function") return chain; } catch (e) {}
    return Promise.resolve();
  }
  function _trackSettingsSaveChain(chain) {
    try {
      window[_settingsSaveChainKey] = chain;
      chain.then(function () { try { if (window[_settingsSaveChainKey] === chain) delete window[_settingsSaveChainKey]; } catch (e) {} });
    } catch (e) {}
    return chain;
  }

  // Third-party I18N saves may overlap; if modeImt changes while a save is pending, persist the latest state once more.
  function _persistConflictPluginSettings(plugin, attempt) {
    if (!plugin || typeof plugin.saveSettings !== "function") return Promise.resolve(false);
    var retry = Number(attempt || 0);
    var expectedMode = plugin.settings && plugin.settings.modeImt;
    var saveResult;
    try { saveResult = plugin.saveSettings(); } catch (e) { console.warn("[IMT-Extended] Failed to save I18N conflict state:", e); return Promise.resolve(false); }
    return Promise.resolve(saveResult).then(function () {
      if (plugin.settings && plugin.settings.modeImt !== expectedMode && retry < 4) return _persistConflictPluginSettings(plugin, retry + 1);
      return true;
    }).catch(function (e) {
      console.warn("[IMT-Extended] Failed to save I18N conflict state:", e);
      if (plugin.settings && plugin.settings.modeImt !== expectedMode && retry < 4) return _persistConflictPluginSettings(plugin, retry + 1);
      return false;
    });
  }
  function _peekStandaloneCoordinator() {
    try {
      var coordinator = window[_standaloneCoordinatorKey];
      return coordinator && coordinator.version === 1 && coordinator.chain && typeof coordinator.chain.then === "function" ? coordinator : null;
    } catch (e) { return null; }
  }
  function _getStandaloneCoordinator() {
    var existing = _peekStandaloneCoordinator();
    if (existing) return existing;
    var coordinator = { version: 1, state: null, desiredDisabled: null, actor: null, chain: Promise.resolve() };
    try { window[_standaloneCoordinatorKey] = coordinator; } catch (e) {}
    return coordinator;
  }
  function _clearStandaloneCoordinator(coordinator, state) {
    if (coordinator.state !== state) return;
    coordinator.state = null; coordinator.desiredDisabled = null; coordinator.actor = null;
    var chain = coordinator.chain;
    Promise.resolve(chain).then(function () {
      try {
        if (window[_standaloneCoordinatorKey] === coordinator && coordinator.chain === chain && !coordinator.state && coordinator.desiredDisabled === null) delete window[_standaloneCoordinatorKey];
      } catch (e) {}
    });
  }

  function _readGMConfigState() {
    try {
      var raw = localStorage.getItem(GM_STORE_PREFIX + IMT_CONFIG_KEY);
      if (raw === null) return { valid: true, raw: null, value: {} };
      var value = JSON.parse(raw);
      if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, raw: raw, value: null };
      return { valid: true, raw: raw, value: value };
    } catch (e) { return { valid: false, raw: null, value: null }; }
  }
  function _gmGetConfig() { var state = _readGMConfigState(); return state.valid ? state.value : {}; }
  function _gmSetConfig(c) { try { localStorage.setItem(GM_STORE_PREFIX + IMT_CONFIG_KEY, JSON.stringify(c)); return true; } catch (e) { return false; } }
  function _gmGetValue(k) { try { var s = localStorage.getItem(GM_STORE_PREFIX + k); return s !== null ? JSON.parse(s) : undefined; } catch (e) { return undefined; } }
  function _gmSetValue(k, v) { try { localStorage.setItem(GM_STORE_PREFIX + k, JSON.stringify(v)); } catch (e) {} }
  function _gmDeleteValue(k) { try { localStorage.removeItem(GM_STORE_PREFIX + k); } catch (e) {} }

  function _gmSetValueIfChanged(k, v) {
    try {
      var serialized = JSON.stringify(v); var storageKey = GM_STORE_PREFIX + k;
      if (localStorage.getItem(storageKey) === serialized) return false;
      localStorage.setItem(storageKey, serialized); return true;
    } catch (e) { return false; }
  }

  function _gmDeleteValueIfPresent(k) {
    try {
      var storageKey = GM_STORE_PREFIX + k;
      if (localStorage.getItem(storageKey) === null) return false;
      localStorage.removeItem(storageKey); return true;
    } catch (e) { return false; }
  }

  function _mirrorCurrentAuthAliases(token, userInfo) {
    if (typeof token !== "string" || !token) return false;
    var changed = false;
    var tokenKeys = ["authToken", "user_token", "immersiveTranslateIMT_COMMON_JWT_TOKEN"];
    for (var i = 0; i < tokenKeys.length; i++) changed = _gmSetValueIfChanged(tokenKeys[i], token) || changed;
    if (userInfo) {
      changed = _gmSetValueIfChanged("userInfo", userInfo) || changed;
      changed = _gmSetValueIfChanged("user_info", userInfo) || changed;
    } else {
      changed = _gmDeleteValueIfPresent("userInfo") || changed;
      changed = _gmDeleteValueIfPresent("user_info") || changed;
    }
    return changed;
  }

  // The current userscript stores this field as targetLanguage; migrate the old SDK key at every write boundary.
  function _normalizeTargetLanguage(value) {
    if (typeof value !== "string") return "";
    var normalized = value.trim();
    return normalized || "";
  }

  function _sameConfigValue(left, right) {
    if (left === right) return true;
    try { return JSON.stringify(left) === JSON.stringify(right); } catch (e) { return false; }
  }

  function _collectChangedConfigPaths(previous, next, prefix, result, depth) {
    if (_sameConfigValue(previous, next)) return result;
    if (depth === undefined) depth = 0;
    if (depth >= 8 || !previous || !next || typeof previous !== "object" || typeof next !== "object" || Array.isArray(previous) || Array.isArray(next)) {
      result.push(prefix); return result;
    }
    var keys = {}; var key;
    for (key in previous) if (Object.prototype.hasOwnProperty.call(previous, key)) keys[key] = true;
    for (key in next) if (Object.prototype.hasOwnProperty.call(next, key)) keys[key] = true;
    for (key in keys) {
      var path = prefix ? prefix + "." + key : key;
      _collectChangedConfigPaths(previous[key], next[key], path, result, depth + 1);
    }
    return result;
  }

  function _configPathMatches(path, roots) {
    for (var root in roots) if (path === root || path.indexOf(root + ".") === 0) return true;
    return false;
  }

  function _isContextConfigPath(path) {
    return _configPathMatches(path, CONTEXT_CONFIG_PATHS) ||
      path === "generalRule.mouseHoverHoldKey" || path === "generalRule.mouseHoverEffect" ||
      path.indexOf("generalRule.mouseHover") === 0 || path.indexOf("generalRule.mousePressHold") === 0;
  }

  function _classifyUserscriptConfigChange(config, previousConfig) {
    var next = config && typeof config === "object" ? config : {};
    var previous = previousConfig && typeof previousConfig === "object" ? previousConfig : null;
    var nextMode = next.translationMode === "dual" || next.translationMode === "translation" ? next.translationMode : "";
    var previousMode = previous && (previous.translationMode === "dual" || previous.translationMode === "translation") ? previous.translationMode : "";
    if (!previous) return { effect: "retranslate", modeChanged: false, nextMode: nextMode, targetLanguageChanged: false, translationServiceChanged: false };
    var changedPaths = _collectChangedConfigPaths(previous, next, "", [], 0).filter(function (path) { return !!path; });
    var modeChanged = !!nextMode && nextMode !== previousMode;
    var targetLanguageChanged = typeof next.targetLanguage === "string" && next.targetLanguage.length > 0 && !_sameConfigValue(previous.targetLanguage, next.targetLanguage);
    var translationServiceChanged = typeof next.translationService === "string" && next.translationService.length > 0 && !_sameConfigValue(previous.translationService, next.translationService);
    var effect = "paint";
    for (var i = 0; i < changedPaths.length; i++) {
      var path = changedPaths[i];
      if (path === "translationMode" || _configPathMatches(path, THEME_CONFIG_PATHS)) continue;
      if (_isContextConfigPath(path)) { if (effect === "paint") effect = "context"; continue; }
      effect = "retranslate"; break;
    }
    if (modeChanged && effect === "paint") effect = "context";
    return {
      effect: effect,
      modeChanged: modeChanged,
      nextMode: nextMode,
      targetLanguageChanged: targetLanguageChanged,
      translationServiceChanged: translationServiceChanged,
    };
  }

  function _extractUserscriptVersion(content) {
    if (typeof content !== "string") return "";
    var match = content.match(/^[ \t]*\/\/[ \t]*@version[ \t]+([^\s]+)[ \t]*$/m);
    return match && /^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/.test(match[1]) ? match[1] : "";
  }

  function _extractServiceAvailabilityPatch(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    var services = value.translationServices;
    if (!services || typeof services !== "object" || Array.isArray(services)) return null;
    var safeServices = {};
    for (var serviceId in services) {
      if (!Object.prototype.hasOwnProperty.call(services, serviceId) || _isUnsafeSyncProperty(serviceId) || serviceId.length > 256) continue;
      var service = services[serviceId];
      if (!service || typeof service !== "object" || Array.isArray(service)) continue;
      var availability = {};
      for (var field in SERVICE_AVAILABILITY_FIELDS) {
        if (typeof service[field] === "boolean") availability[field] = service[field];
      }
      if (Object.keys(availability).length > 0) safeServices[serviceId] = availability;
    }
    return Object.keys(safeServices).length > 0 ? { translationServices: safeServices } : null;
  }

  function _mergeServiceAvailabilityPatch(current, patch) {
    var next = {};
    if (current && typeof current === "object" && !Array.isArray(current)) {
      for (var rootField in current) {
        if (Object.prototype.hasOwnProperty.call(current, rootField) && !_isUnsafeSyncProperty(rootField)) next[rootField] = current[rootField];
      }
    }
    var safePatch = _extractServiceAvailabilityPatch(patch);
    if (!safePatch) return next;
    var currentServices = next.translationServices && typeof next.translationServices === "object" && !Array.isArray(next.translationServices) ? next.translationServices : {};
    var mergedServices = {};
    for (var existingId in currentServices) {
      if (Object.prototype.hasOwnProperty.call(currentServices, existingId) && !_isUnsafeSyncProperty(existingId)) mergedServices[existingId] = currentServices[existingId];
    }
    for (var serviceId in safePatch.translationServices) {
      if (!Object.prototype.hasOwnProperty.call(safePatch.translationServices, serviceId)) continue;
      var existing = mergedServices[serviceId];
      var merged = {};
      if (existing && typeof existing === "object" && !Array.isArray(existing)) {
        for (var field in existing) {
          if (Object.prototype.hasOwnProperty.call(existing, field) && !_isUnsafeSyncProperty(field)) merged[field] = existing[field];
        }
      }
      var availability = safePatch.translationServices[serviceId];
      for (var availabilityField in availability) merged[availabilityField] = availability[availabilityField];
      mergedServices[serviceId] = merged;
    }
    next.translationServices = mergedServices;
    return next;
  }

  // Dashboard sends a complete safe settings object, but it never receives
  // credential-shaped fields. Merge its patch over the local object so API
  // keys, future userscript fields, and other local-only values survive.
  function _mergeDashboardConfigPatch(current, patch, depth) {
    if (depth === undefined) depth = 0;
    if (depth > 8) return current;
    if (patch === null || patch === undefined || typeof patch !== "object") return patch;
    if (Array.isArray(patch)) return patch.map(function (item) { return _redactSyncValue(item, depth + 1); });
    var result = {};
    if (current && typeof current === "object" && !Array.isArray(current)) {
      for (var existingKey in current) {
        if (Object.prototype.hasOwnProperty.call(current, existingKey) && !_isUnsafeSyncProperty(existingKey)) result[existingKey] = current[existingKey];
      }
    }
    for (var key in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, key) || _isUnsafeSyncProperty(key) || _isSensitiveSyncKey(key)) continue;
      var incoming = patch[key];
      var existing = result[key];
      if (incoming && typeof incoming === "object" && !Array.isArray(incoming)) result[key] = _mergeDashboardConfigPatch(existing, incoming, depth + 1);
      else result[key] = _redactSyncValue(incoming, depth + 1);
    }
    return result;
  }

  function _copySafeUserInfoFields(source) {
    var result = {};
    Object.keys(USER_INFO_FIELD_LIMITS).forEach(function (key) {
      var value = source[key]; var limit = USER_INFO_FIELD_LIMITS[key];
      if ((key === "id" || key === "userId") && typeof value === "number" && isFinite(value)) result[key] = value;
      else if (typeof value === "string" && value.length <= limit) result[key] = value;
    });
    return result;
  }

  function _sanitizeUserInfo(value, allowIdOnly) {
    if (!value || typeof value !== "object") return null;
    var candidates = [value];
    if (value.data && typeof value.data === "object") candidates.push(value.data);
    if (value.result && typeof value.result === "object") candidates.push(value.result);
    for (var i = 0; i < candidates.length; i++) {
      var result = _copySafeUserInfoFields(candidates[i]);
      if (result.email || result.userId || result.nickname || (allowIdOnly && result.id !== undefined)) return result;
    }
    return null;
  }

  function _sanitizeTrustedUserInfo(value) {
    return _sanitizeUserInfo(value, true);
  }

  function _getStoredUserInfo() {
    var userInfo = _sanitizeTrustedUserInfo(_gmGetValue("userInfo"));
    return userInfo || _sanitizeTrustedUserInfo(_gmGetValue("user_info"));
  }

  function _storeUserInfoAliases(userInfo) {
    if (!userInfo) return false;
    var changed = _gmSetValueIfChanged("userInfo", userInfo);
    changed = _gmSetValueIfChanged("user_info", userInfo) || changed;
    return changed;
  }

  function _isSensitiveSyncKey(key) {
    var normalized = String(key).replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();
    var mouseHoverControlKey = /^mouse_hover(?:_[a-z0-9]+)*_key$/.test(normalized)
      && !/(?:api|app|access|client|private|encryption|signing|storage|subscription|license|service|account|project|provider)[_-]?key/.test(normalized);
    if (mouseHoverControlKey || normalized === "hotkey") return false;
    return /(?:^|_)(?:auth|bearer|oauth|session)(?:_|$)/.test(normalized) || /(?:token|secret|password|passwd|authorization|cookie|jwt|credential|(?:api|app|access|client|private|encryption|signing|storage|subscription|license|service|account|project|provider)[_-]?key|(?:^|[_-])key$|refresh[_-]?token)/.test(normalized);
  }

  function _isUnsafeSyncProperty(key) {
    return key === "__proto__" || key === "constructor" || key === "prototype";
  }

  function _isAllowedSyncTopKey(key) {
    return Object.prototype.hasOwnProperty.call(SYNC_TOP_KEYS, key);
  }

  function _redactSyncValue(value, depth, budget) {
    if (budget) {
      if (budget.remaining <= 0) { budget.exceeded = true; return null; }
      budget.remaining--;
    }
    if (depth > 8) return null;
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      if (budget && value.length > CONFIG_MAX_ARRAY_ITEMS) { budget.exceeded = true; return null; }
      var items = [];
      for (var itemIndex = 0; itemIndex < value.length; itemIndex++) {
        items.push(_redactSyncValue(value[itemIndex], depth + 1, budget));
        if (budget && budget.exceeded) break;
      }
      return items;
    }
    if (typeof value !== "object") return value;
    var result = {};
    for (var key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key) || _isUnsafeSyncProperty(key) || _isSensitiveSyncKey(key)) continue;
      result[key] = _redactSyncValue(value[key], depth + 1, budget);
      if (budget && budget.exceeded) break;
    }
    return result;
  }

  function _sanitizeFullLocalUserConfig(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    var budget = { remaining: CONFIG_MAX_NODES, exceeded: false };
    var safeConfig = _redactSyncValue(value, 0, budget);
    if (budget.exceeded) return null;
    var serialized;
    try { serialized = JSON.stringify(safeConfig); } catch (e) { return null; }
    if (typeof serialized !== "string" || serialized.length > SYNC_MAX_VALUE_BYTES) return null;
    return safeConfig;
  }

  function _canonicalSyncSuffix(suffix) {
    if (suffix === "user_info") return "userInfo";
    if (suffix === "memberConfig") return "fullLocalUserConfig";
    if (suffix === "serviceConfig" || suffix === "translatorConfig") return "translateServiceConfig";
    return suffix;
  }

  function _orderedSyncValues(values) {
    var ordered = {};
    Object.keys(values || {}).sort().forEach(function (key) { ordered[key] = values[key]; });
    return ordered;
  }

  function _hashSyncPayload(values, deletedKeys) {
    var input = JSON.stringify({ values: _orderedSyncValues(values), deletedKeys: (deletedKeys || []).slice().sort() });
    var hash = 2166136261;
    for (var i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return (hash >>> 0).toString(16).padStart(8, "0");
  }

  function _normalizeSyncKey(key) {
    if (typeof key !== "string" || key.length > 256) return null;
    if (key.indexOf(GM_STORE_PREFIX) === 0) {
      var suffix = _canonicalSyncSuffix(key.slice(GM_STORE_PREFIX.length));
      if (!suffix || suffix.indexOf("__") === 0 || _isSensitiveSyncKey(suffix) || !_isAllowedSyncTopKey(suffix)) return null;
      return GM_STORE_PREFIX + suffix;
    }
    if (!_isAllowedSyncTopKey(key) || _isSensitiveSyncKey(key)) return null;
    return GM_STORE_PREFIX + _canonicalSyncSuffix(key);
  }

  function _serializeSafeSyncValue(key, rawValue) {
    var value = rawValue;
    if (typeof value === "string") {
      try { value = JSON.parse(value); } catch (e) {}
    }
    if (key === GM_STORE_PREFIX + "userInfo") {
      value = _sanitizeTrustedUserInfo(value);
      if (!value) return null;
    } else if (key === GM_STORE_PREFIX + IMT_CONFIG_KEY) {
      value = _sanitizeFullLocalUserConfig(value);
      if (!value) return null;
    } else {
      value = _redactSyncValue(value, 0);
    }
    var serialized;
    try { serialized = JSON.stringify(value); } catch (e) { return null; }
    if (typeof serialized !== "string" || serialized.length > SYNC_MAX_VALUE_BYTES) return null;
    return serialized;
  }

  function _parseHttpUrl(value) {
    try {
      var url = value instanceof URL ? value : new URL(String(value));
      return url.protocol === "https:" || url.protocol === "http:" ? url : null;
    } catch (e) { return null; }
  }

  function _isImtUrl(value) {
    var url = _parseHttpUrl(value);
    if (!url || url.protocol !== "https:") return false;
    var host = url.hostname.toLowerCase();
    if (host === "dash.immersivetranslate.com" || host === "app.immersivetranslate.com") return true;
    return host === "immersivetranslate.com" && (url.pathname === "/options" || url.pathname.indexOf("/options/") === 0);
  }

  function _isTrustedDashboardNavigation(value) {
    var url = _parseHttpUrl(value);
    return !!(url && url.protocol === "https:" && Object.prototype.hasOwnProperty.call(IMT_DASH_HOSTS, url.hostname.toLowerCase()));
  }

  function _isTrustedDashboardReturnNavigation(value) {
    var url = _parseHttpUrl(value);
    if (!url || url.protocol !== "https:") return false;
    var host = url.hostname.toLowerCase();
    return host === "dash.immersivetranslate.com" || host === "app.immersivetranslate.com";
  }

  function _shouldAttachImtCookies(value) {
    var url = _parseHttpUrl(value);
    return !!(url && url.protocol === "https:" && Object.prototype.hasOwnProperty.call(IMT_COOKIE_HOSTS, url.hostname.toLowerCase()));
  }

  function _shouldAttachImtAuthToken(value) {
    var url = _parseHttpUrl(value);
    return !!(url && url.protocol === "https:" && Object.prototype.hasOwnProperty.call(IMT_AUTH_HOSTS, url.hostname.toLowerCase()));
  }

  function _headersToObject(headers) {
    var result = {};
    if (!headers) return result;
    if (typeof headers.forEach === "function") {
      headers.forEach(function (value, key) { result[String(key)] = String(value); });
    } else if (Array.isArray(headers)) {
      for (var i = 0; i < headers.length; i++) if (headers[i] && headers[i].length >= 2) result[String(headers[i][0])] = String(headers[i][1]);
    } else if (typeof headers === "object") {
      for (var key in headers) if (Object.prototype.hasOwnProperty.call(headers, key) && headers[key] !== undefined) result[key] = String(headers[key]);
    }
    return result;
  }

  function _hasHeader(headers, name) {
    var lowerName = name.toLowerCase();
    return Object.keys(headers || {}).some(function (key) { return key.toLowerCase() === lowerName; });
  }

  function _getResponseHeader(headers, name) {
    var lowerName = name.toLowerCase();
    var key = Object.keys(headers || {}).find(function (candidate) { return candidate.toLowerCase() === lowerName; });
    return key ? headers[key] : "";
  }

  function _responseHeadersToString(headers) {
    return Object.keys(headers || {}).map(function (key) { return key + ": " + headers[key]; }).join("\r\n");
  }

  function _encodeUtf8(value) { return new TextEncoder().encode(String(value)); }

  function _joinByteArrays(parts) {
    var length = parts.reduce(function (total, part) { return total + part.byteLength; }, 0);
    var joined = new Uint8Array(length); var offset = 0;
    for (var i = 0; i < parts.length; i++) { joined.set(parts[i], offset); offset += parts[i].byteLength; }
    return joined.buffer;
  }

  async function _serializeFormData(formData, headers) {
    var boundary = "----IMTObsidian" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    var parts = [];
    for (var headerName in headers) if (headerName.toLowerCase() === "content-type") delete headers[headerName];
    for (var entry of formData.entries()) {
      var name = String(entry[0]).replace(/"/g, "%22"); var value = entry[1];
      if (typeof value === "string") {
        parts.push(_encodeUtf8("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n"));
      } else {
        var filename = String(value.name || "blob").replace(/"/g, "%22");
        var contentType = value.type || "application/octet-stream";
        parts.push(_encodeUtf8("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\nContent-Type: " + contentType + "\r\n\r\n"));
        parts.push(new Uint8Array(await value.arrayBuffer()));
        parts.push(_encodeUtf8("\r\n"));
      }
    }
    parts.push(_encodeUtf8("--" + boundary + "--\r\n"));
    headers["Content-Type"] = "multipart/form-data; boundary=" + boundary;
    return _joinByteArrays(parts);
  }

  async function _serializeRequestBody(data, method, headers) {
    if (data === undefined || data === null || method === "GET" || method === "HEAD") return undefined;
    if (typeof data === "string") return data;
    if (typeof URLSearchParams !== "undefined" && data instanceof URLSearchParams) {
      if (!_hasHeader(headers, "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      return data.toString();
    }
    if (typeof FormData !== "undefined" && data instanceof FormData) return _serializeFormData(data, headers);
    if (typeof Blob !== "undefined" && data instanceof Blob) return data.arrayBuffer();
    if (data instanceof ArrayBuffer) return data;
    if (ArrayBuffer.isView(data)) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    if (!_hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";
    return JSON.stringify(data);
  }

  function IMTExtendedPluginClass(app, manifest) {
    obsidian.Plugin.call(this, app, manifest);
    this.settings = Object.assign({}, DEFAULT_SETTINGS);
    this._styleInjected = false;
    this._i18nDisabled = false;
    this._i18nConflictState = null;
    this._initialized = false;
    this._isUnloaded = true; this._activationGeneration = 0;
    this._startupTimers = []; this._globalPatches = []; this._gmStyleElements = [];
    this._gmPolyfillsInstalled = false; this._browserAPIPolyfillInstalled = false; this._gmFetchPolyfillInstalled = false;
    this._externalScripts = []; this._originalWindowOpen = null;
    this._loadedUserscriptVersion = ""; this._installedRuntime = null; this._runtimeInstallPromise = null; this._runtimeInstallGeneration = 0;
    this._latestRuntimeVersion = ""; this._runtimeVersionCheckState = "idle"; this._runtimeVersionCheckedAt = 0; this._runtimeVersionCheckPromise = null; this._runtimeVersionCheckGeneration = 0;
    this._patchedWindowOpen = null;
    this._dashboardWindow = null; this._syncPollTimer = null; this._providerLoginGuideModal = null;
    this._documentWorkspaceWindow = null; this._documentWorkspaceGeneration = 0; this._documentWorkspaceSpec = null;
    this._documentHandoffRequest = null; this._documentHandoffPromise = null; this._documentRuntimeFailureNoticeGeneration = 0;
    this._documentPdfDownloadSource = null; this._pendingDocumentPdfDownload = null; this._documentRuntimeRefreshTimer = null;
    this._translationViewBridge = null;
    this._pdfActionViews = new WeakSet(); this._pdfActionElements = [];
    this._dashboardPkceChannel = ""; this._dashboardPkceIpcHandler = null;
    this._syncGeneration = 0; this._syncApplyChain = Promise.resolve(); this._lastSyncHash = ""; this._syncReadInFlight = false; this._authReadInFlight = false;
    this._gmValueChangeListeners = Object.create(null); this._nextGmValueChangeListenerId = 1; this._browserStorageChangeListeners = [];
    this._configReplayTimer = null; this._configRuntimeSequence = 0; this._configRuntimeChain = Promise.resolve(); this._dashboardConfigPushSequence = 0;
    this._userscriptRequestSequence = 0;
    this._authCookies = ""; this._lastCookieHeader = ""; this._authGeneration = 0; this._cookieReadSequence = 0;
    this._authToken = "";
    this._authAdapter = new AuthSessionAdapter({ sanitizeUserInfo: _sanitizeTrustedUserInfo });
    var pluginInstance = this;
    this._dashboardPkceHost = createDashboardPkceHost({
      request: function (options) { return obsidian.requestUrl(options); },
      sanitizeUserInfo: _sanitizeTrustedUserInfo,
      applyAuthState: function (state) { return pluginInstance._applyDashboardAuthState(state); },
      readAuthState: function () { return pluginInstance._authAdapter.getPkceState(); },
    });
    // Restore only the plugin's persisted PKCE identity. Legacy Dashboard
    // cookies remain a runtime fallback and are never promoted to this token.
    try {
      var persistedToken = _gmGetValue("authToken", "");
      if (typeof persistedToken === "string" && persistedToken) {
        var persistedUser = _getStoredUserInfo();
        this._authAdapter.applyPkceState({ token: persistedToken, userInfo: persistedUser });
        this._authToken = this._authAdapter.getToken();
        _mirrorCurrentAuthAliases(this._authToken, persistedUser);
      }
    } catch (e) {}
  }

  IMTExtendedPluginClass.prototype = Object.create(obsidian.Plugin.prototype);
  IMTExtendedPluginClass.prototype.constructor = IMTExtendedPluginClass;

  IMTExtendedPluginClass.prototype._advanceSyncGeneration = function () {
    this._syncGeneration++;
    this._syncReadInFlight = false;
    this._authReadInFlight = false;
    this._syncApplyChain = Promise.resolve();
    this._lastSyncHash = "";
    return this._syncGeneration;
  };

  IMTExtendedPluginClass.prototype.onload = async function () {
    if (window[_initGuardKey]) { console.warn("[IMT-Extended] Duplicate onload, skipping"); return; }
    window[_initGuardKey] = true;
    this._isUnloaded = false; this._advanceSyncGeneration();
    var reloadCount = _getReloadCount();
    if (reloadCount >= 3) {
      _resetReloadCount(); new obsidian.Notice("沉浸式翻译延伸版：检测到连续重载，本次加载已中止。请检查控制台后手动重启插件。"); window[_initGuardKey] = false;
      this._isUnloaded = true;
      return;
    }
    try { window[_runtimeInstallOwnerKey] = this; } catch (e) {}
    _incrementReloadCount();
    try {
      await this.loadSettings();
      if (this._isUnloaded) return;
      await this._initializeUserscriptSidePanelDefaults();
      if (this._isUnloaded) return;
      this._persistHostScopeConfig();
      this._injectStyles(); this._interceptNavigation();
      this.addSettingTab(new IMTSettingTab(this.app, this));
      this._installDocumentTranslationEntry();
      var pluginInstance = this;
      this._scheduleTimeout(async function () {
        pluginInstance._detectAndHandleConflicts();
        var activated = await pluginInstance._activateIMT();
        if (!pluginInstance._isUnloaded && activated) {
          pluginInstance._startTranslationViewBridge();
          pluginInstance._initialized = true; _resetReloadCount();
          console.log("[IMT-Extended] Plugin loaded v" + PLUGIN_VERSION);
        }
      }, 500);
      this._scheduleTimeout(function () { window[_initGuardKey] = false; }, 5000);
    } catch (e) {
      console.error("[IMT-Extended] Plugin load failed:", e);
      this.onunload();
      throw e;
    }
  };

  IMTExtendedPluginClass.prototype.onunload = function () {
    this._isUnloaded = true; this._activationGeneration++; this._runtimeInstallGeneration++; this._runtimeVersionCheckGeneration++; this._initialized = false;
    try { if (window[_runtimeInstallOwnerKey] === this) delete window[_runtimeInstallOwnerKey]; } catch (e) {}
    this._clearStartupTimers();
    if (this._translationViewBridge) { this._translationViewBridge.stop(); this._translationViewBridge = null; }
    for (var pdfActionIndex = 0; pdfActionIndex < this._pdfActionElements.length; pdfActionIndex++) {
      try { this._pdfActionElements[pdfActionIndex].remove(); } catch (e) {}
    }
    this._pdfActionElements = []; this._pdfActionViews = new WeakSet();
    this._deactivateIMT(); this._restoreConflictState(); this._removeExternalScripts(); this._restoreNavigation(); this._closeDocumentWorkspace(); this._closeDashboardWindow();
    if (this._configReplayTimer) { clearTimeout(this._configReplayTimer); this._configReplayTimer = null; }
    if (this._syncPollTimer) { clearInterval(this._syncPollTimer); this._syncPollTimer = null; }
    this._restoreGlobalPatches();
    this._gmValueChangeListeners = Object.create(null); this._browserStorageChangeListeners = [];
    var styleEl = document.getElementById("imt-enhance-styles"); if (styleEl) styleEl.remove();
    this._styleInjected = false;
    var conflictNotice = document.getElementById("imt-conflict-notice"); if (conflictNotice) conflictNotice.remove();
    window[_initGuardKey] = false; _resetReloadCount(); console.log("[IMT-Extended] Plugin unloaded");
  };

  IMTExtendedPluginClass.prototype.loadSettings = async function () {
    await _getSettingsSaveChain();
    var data = await this.loadData();
    var stored = data && typeof data === "object" && !Array.isArray(data) ? Object.assign({}, data) : {};
    var needsConflictChoice = stored.conflictChoiceVersion !== 1;
    var migrated = Object.prototype.hasOwnProperty.call(stored, "sdkMode") || Object.prototype.hasOwnProperty.call(stored, "targetLanguage") ||
      Object.prototype.hasOwnProperty.call(stored, "userscriptCacheVersion") || Object.prototype.hasOwnProperty.call(stored, "userscriptCacheEtag") ||
      Object.prototype.hasOwnProperty.call(stored, "userscriptCacheTime") || needsConflictChoice;
    delete stored.sdkMode;
    delete stored.targetLanguage;
    delete stored.userscriptCacheVersion;
    delete stored.userscriptCacheEtag;
    delete stored.userscriptCacheTime;
    if (needsConflictChoice) {
      stored.disableI18NImt = false;
      stored.disableStandaloneImt = false;
      stored.shownConflictWarning = false;
      stored.conflictChoiceVersion = 1;
    }
    this.settings = Object.assign({}, DEFAULT_SETTINGS, stored);
    if (migrated) {
      try { await this.saveSettings(); }
      catch (e) { console.warn("[IMT-Extended] Legacy runtime preference cleanup will be retried:", e); }
    }
  };

  IMTExtendedPluginClass.prototype._getPdfTranslationContext = function (leaf) {
    var workspace = this.app && this.app.workspace;
    var currentLeaf = leaf || (workspace && workspace.activeLeaf);
    var view = currentLeaf && currentLeaf.view;
    if (!view || typeof view.getViewType !== "function" || view.getViewType() !== "pdf") return null;
    var file = view.file || (workspace && typeof workspace.getActiveFile === "function" ? workspace.getActiveFile() : null);
    var filePath = file && typeof file.path === "string" ? file.path : "";
    var extension = file && typeof file.extension === "string" ? file.extension.toLowerCase() : filePath.split(".").pop().toLowerCase();
    if (!file || extension !== "pdf") return null;
    return { leaf: currentLeaf, view: view, file: file };
  };

  IMTExtendedPluginClass.prototype._openCurrentPdfTranslationWorkspace = function (leaf) {
    var context = this._getPdfTranslationContext(leaf);
    if (!context) { new obsidian.Notice("请先在 Obsidian 中打开一个 PDF"); return false; }
    return this._openDocumentTranslationWorkspace(context.file);
  };

  IMTExtendedPluginClass.prototype._getActiveDocumentFile = function (file) {
    if (file) return file;
    var workspace = this.app && this.app.workspace;
    return workspace && typeof workspace.getActiveFile === "function" ? workspace.getActiveFile() : null;
  };

  IMTExtendedPluginClass.prototype._openDocumentTranslationWorkspace = function (file) {
    if (!this._isDocumentWorkspaceEnabled()) {
      new obsidian.Notice("文档翻译工作区正在完成平台验证，当前版本暂不开放。");
      return false;
    }
    var activeFile = this._getActiveDocumentFile(file);
    var spec = getDocumentWorkspaceSpec(activeFile);
    if (!spec) spec = { kind: "document", title: "文档翻译", url: FILE_WORKSPACE_URL, autoHandoff: false, extensions: [], maxBytes: 0 };
    var opened = this._openDocumentWorkspace({ url: spec.url, title: spec.title, file: activeFile, spec: spec });
    if (opened === false) return false;
    if (!spec.autoHandoff) {
      var fileName = activeFile && (activeFile.name || activeFile.path);
      new obsidian.Notice(fileName
        ? "正在加载文档翻译工作区；加载后请手动选择「" + fileName + "」"
        : "正在加载文档翻译工作区；加载后请手动选择要翻译的文件");
    }
    return true;
  };

  IMTExtendedPluginClass.prototype._resolveDocumentHandoffFile = function (file, spec) {
    var adapter = this.app && this.app.vault && this.app.vault.adapter;
    var basePath = adapter && typeof adapter.basePath === "string" ? adapter.basePath : "";
    if (!basePath && adapter && typeof adapter.getBasePath === "function") {
      try { basePath = adapter.getBasePath(); } catch (e) {}
    }
    return resolveLocalVaultFile({
      vaultBasePath: basePath,
      vaultRelativePath: file && file.path,
      declaredExtension: file && file.extension,
      allowedExtensions: spec && spec.extensions,
      maxBytes: spec && spec.maxBytes,
    });
  };

  IMTExtendedPluginClass.prototype._collectDocumentRuntimeStore = function () {
    var store = Object.create(null); var totalBytes = 0; var count = 0;
    try {
      for (var index = 0; index < localStorage.length && count < SYNC_MAX_KEYS; index++) {
        var storageKey = localStorage.key(index);
        if (!storageKey || storageKey.indexOf(GM_STORE_PREFIX) !== 0) continue;
        var key = storageKey.slice(GM_STORE_PREFIX.length);
        if (!key || key.length > 256 || _isUnsafeSyncProperty(key)) continue;
        var raw = localStorage.getItem(storageKey);
        if (typeof raw !== "string" || raw.length > SYNC_MAX_VALUE_BYTES || totalBytes + raw.length > SYNC_MAX_TOTAL_BYTES) continue;
        try {
          store[key] = JSON.parse(raw);
          totalBytes += raw.length; count++;
        } catch (e) {}
      }
    } catch (e) {}
    if (!store[IMT_CONFIG_KEY]) store[IMT_CONFIG_KEY] = _gmGetConfig();
    return store;
  };

  IMTExtendedPluginClass.prototype._requestDocumentRuntimeNetwork = function (options) {
    var input = options && typeof options === "object" && !Array.isArray(options) ? options : {};
    var url;
    try { url = new URL(String(input.url || "")); } catch (e) { return Promise.resolve({ ok: false, code: "invalid_url" }); }
    if (url.protocol !== "http:" && url.protocol !== "https:") return Promise.resolve({ ok: false, code: "invalid_url" });

    var method = String(input.method || "GET").toUpperCase();
    if (!/^[A-Z]{1,16}$/.test(method)) return Promise.resolve({ ok: false, code: "invalid_method" });
    var sourceHeaders = input.headers && typeof input.headers === "object" && !Array.isArray(input.headers) ? input.headers : {};
    var headers = {}; var headerBytes = 0; var headerCount = 0;
    for (var headerName in sourceHeaders) {
      if (!Object.prototype.hasOwnProperty.call(sourceHeaders, headerName) || _isUnsafeSyncProperty(headerName)) continue;
      var normalizedName = String(headerName); var normalizedValue = String(sourceHeaders[headerName]);
      if (!normalizedName || normalizedName.length > 256 || normalizedValue.length > 16 * 1024) return Promise.resolve({ ok: false, code: "invalid_headers" });
      headerBytes += normalizedName.length + normalizedValue.length; headerCount++;
      if (headerCount > 128 || headerBytes > DOCUMENT_RUNTIME_MAX_HEADER_BYTES) return Promise.resolve({ ok: false, code: "invalid_headers" });
      headers[normalizedName] = normalizedValue;
    }

    var body;
    if (method !== "GET" && method !== "HEAD" && input.body) {
      if (input.body.type === "text" && typeof input.body.data === "string") {
        if (Buffer.byteLength(input.body.data, "utf8") > DOCUMENT_RUNTIME_MAX_BODY_BYTES) return Promise.resolve({ ok: false, code: "invalid_body" });
        body = input.body.data;
      } else if (input.body.type === "base64" && typeof input.body.data === "string") {
        if (input.body.data.length > Math.ceil(DOCUMENT_RUNTIME_MAX_BODY_BYTES * 4 / 3) + 4) return Promise.resolve({ ok: false, code: "invalid_body" });
        try {
          var binaryBody = Buffer.from(input.body.data, "base64");
          if (binaryBody.byteLength > DOCUMENT_RUNTIME_MAX_BODY_BYTES) return Promise.resolve({ ok: false, code: "invalid_body" });
          body = binaryBody.buffer.slice(binaryBody.byteOffset, binaryBody.byteOffset + binaryBody.byteLength);
        } catch (e) { return Promise.resolve({ ok: false, code: "invalid_body" }); }
      } else return Promise.resolve({ ok: false, code: "invalid_body" });
    }

    var timeout = Number(input.timeout);
    if (!Number.isFinite(timeout) || timeout <= 0) timeout = 30 * 1000;
    timeout = Math.min(Math.floor(timeout), 2 * 60 * 1000);
    return new Promise(function (resolve) {
      var settled = false;
      var finish = function (payload) {
        if (settled) return;
        settled = true; clearTimeout(timeoutId); resolve(payload);
      };
      var timeoutId = setTimeout(function () { finish({ ok: false, code: "request_timeout" }); }, timeout);
      var requestOptions = { url: url.href, method: method, headers: headers, throw: false };
      if (body !== undefined) requestOptions.body = body;
      Promise.resolve(obsidian.requestUrl(requestOptions)).then(function (response) {
        if (!response || typeof response !== "object") { finish({ ok: false, code: "request_failed" }); return; }
        var responseBuffer;
        if (response.arrayBuffer instanceof ArrayBuffer) responseBuffer = Buffer.from(response.arrayBuffer);
        else if (ArrayBuffer.isView(response.arrayBuffer)) responseBuffer = Buffer.from(response.arrayBuffer.buffer, response.arrayBuffer.byteOffset, response.arrayBuffer.byteLength);
        else responseBuffer = Buffer.from(typeof response.text === "string" ? response.text : "", "utf8");
        if (responseBuffer.byteLength > DOCUMENT_RUNTIME_MAX_RESPONSE_BYTES) { finish({ ok: false, code: "response_too_large" }); return; }
        var responseHeaders = {};
        var rawResponseHeaders = response.headers && typeof response.headers === "object" ? response.headers : {};
        for (var responseHeader in rawResponseHeaders) {
          if (!Object.prototype.hasOwnProperty.call(rawResponseHeaders, responseHeader) || _isUnsafeSyncProperty(responseHeader)) continue;
          var responseHeaderValue = rawResponseHeaders[responseHeader];
          responseHeaders[String(responseHeader)] = Array.isArray(responseHeaderValue)
            ? responseHeaderValue.join(", ")
            : String(responseHeaderValue);
        }
        var status = Number(response.status) || 0;
        finish({
          ok: true,
          status: status,
          statusText: typeof response.statusText === "string" ? response.statusText : (status >= 200 && status < 300 ? "OK" : ""),
          finalUrl: typeof response.url === "string" && response.url ? response.url : url.href,
          headers: responseHeaders,
          text: typeof response.text === "string" ? response.text : responseBuffer.toString("utf8"),
          base64: responseBuffer.toString("base64"),
        });
      }).catch(function () { finish({ ok: false, code: "request_failed" }); });
    });
  };

  IMTExtendedPluginClass.prototype._initializeDocumentRuntime = function (documentWindow) {
    var generation = this._documentWorkspaceGeneration;
    if (!documentWindow || this._documentWorkspaceWindow !== documentWindow || documentWindow.isDestroyed()) {
      return Promise.resolve({ ok: false, code: "window_unavailable" });
    }
    var webContents = documentWindow.webContents;
    var currentUrl = "";
    try { currentUrl = webContents && typeof webContents.getURL === "function" ? webContents.getURL() : ""; } catch (e) {}
    if (!isTrustedDocumentWorkspaceUrl(currentUrl)) return Promise.resolve({ ok: false, code: "untrusted_document_url" });
    if (!webContents || typeof webContents.send !== "function" || typeof webContents.executeJavaScriptInIsolatedWorld !== "function") {
      return Promise.resolve({ ok: false, code: "isolated_world_unavailable" });
    }
    var userscriptSource = "";
    try { userscriptSource = this._loadInstalledUserscript(); } catch (e) {}
    if (!userscriptSource) return Promise.resolve({ ok: false, code: "userscript_unavailable" });
    var userscriptVersion = _extractUserscriptVersion(userscriptSource) || this._loadedUserscriptVersion || "0.0.0";
    var initPayload = {
      trusted: true,
      store: this._collectDocumentRuntimeStore(),
      authToken: this._getAuthToken(),
      authCookies: this._getAuthCookies(),
    };
    try { webContents.send(DOCUMENT_RUNTIME_INIT_CHANNEL, initPayload); }
    catch (e) { return Promise.resolve({ ok: false, code: "runtime_init_failed" }); }
    var bootstrap = createDocumentRuntimeBootstrap({
      userscriptSource: userscriptSource,
      userscriptVersion: userscriptVersion,
      defaultTargetLanguage: DEFAULT_TARGET_LANGUAGE,
    });
    var execution;
    try {
      execution = webContents.executeJavaScriptInIsolatedWorld(DOCUMENT_RUNTIME_WORLD_ID, [{
        code: bootstrap,
        url: "imt-document-runtime.js",
      }]);
    } catch (e) { return Promise.resolve({ ok: false, code: "runtime_execution_failed" }); }
    var pluginInstance = this;
    return Promise.resolve(execution).then(function (result) {
      if (pluginInstance._documentWorkspaceWindow !== documentWindow || pluginInstance._documentWorkspaceGeneration !== generation || documentWindow.isDestroyed()) {
        return { ok: false, code: "runtime_superseded" };
      }
      if (!result || result.ok !== true) return result && typeof result === "object" ? result : { ok: false, code: "runtime_unconfirmed" };
      return result;
    }).catch(function () { return { ok: false, code: "runtime_execution_failed" }; });
  };

  IMTExtendedPluginClass.prototype._documentRuntimeFailureMessage = function (code) {
    var reasons = {
      userscript_unavailable: "沉浸式翻译运行时未安装或不可用",
      isolated_world_unavailable: "当前 Obsidian 不支持 PDF 隔离翻译环境",
      bridge_missing: "PDF 翻译桥未加载",
      bridge_incomplete: "PDF 翻译桥接口不完整",
      init_failed: "PDF 翻译桥初始化失败",
      untrusted_document: "PDF 页面未通过运行时校验",
      untrusted_document_url: "PDF 页面已离开受信任地址",
      userscript_missing: "PDF 翻译脚本不可用",
      userscript_execution_failed: "PDF 翻译脚本执行失败",
      runtime_init_failed: "PDF 翻译运行时初始化失败",
      runtime_execution_failed: "PDF 翻译运行时执行失败",
      runtime_unconfirmed: "PDF 翻译运行时未确认加载",
    };
    return reasons[code] || "PDF 翻译运行时未加载";
  };

  IMTExtendedPluginClass.prototype._handleDocumentWorkspaceReady = function (documentWindow) {
    var spec = this._documentWorkspaceSpec || {};
    if (spec.kind !== "pdf") return this._startPendingDocumentHandoff(documentWindow);
    var pluginInstance = this; var generation = this._documentWorkspaceGeneration;
    return Promise.resolve(this._initializeDocumentRuntime(documentWindow)).then(function (result) {
      if (pluginInstance._documentWorkspaceWindow !== documentWindow || pluginInstance._documentWorkspaceGeneration !== generation || documentWindow.isDestroyed()) return false;
      if (!result || result.ok !== true) {
        if (pluginInstance._documentRuntimeFailureNoticeGeneration !== generation) {
          pluginInstance._documentRuntimeFailureNoticeGeneration = generation;
          new obsidian.Notice(pluginInstance._documentRuntimeFailureMessage(result && result.code) + "；本次未交接 PDF 文件");
        }
        return false;
      }
      return pluginInstance._startPendingDocumentHandoff(documentWindow);
    }).catch(function () {
      if (pluginInstance._documentWorkspaceWindow === documentWindow && pluginInstance._documentWorkspaceGeneration === generation && pluginInstance._documentRuntimeFailureNoticeGeneration !== generation) {
        pluginInstance._documentRuntimeFailureNoticeGeneration = generation;
        new obsidian.Notice("PDF 翻译运行时未加载；本次未交接 PDF 文件");
      }
      return false;
    });
  };

  IMTExtendedPluginClass.prototype._handoffDocumentFile = function (documentWindow, candidate) {
    return handoffLocalFileWithCdp({
      webContents: documentWindow && documentWindow.webContents,
      absolutePath: candidate && candidate.absolutePath,
      fileName: candidate && candidate.fileName,
      expectedExtension: candidate && candidate.extension,
      isTrustedUrl: isTrustedDocumentWorkspaceUrl,
    });
  };

  IMTExtendedPluginClass.prototype._documentHandoffFailureMessage = function (code) {
    var reasons = {
      base_path_unavailable: "当前 Vault 不是可直接读取的本地目录",
      invalid_relative_path: "文件路径未通过安全校验",
      outside_vault: "文件不在当前 Vault 内",
      symlink_not_allowed: "文件是符号链接",
      extension_mismatch: "文件类型与扩展名不一致",
      extension_not_allowed: "文件类型不受自动交接支持",
      not_regular_file: "目标不是普通文件",
      file_too_large: "文件超过自动交接大小限制",
      file_unavailable: "文件已移动或当前不可读取",
      cdp_unavailable: "当前 Obsidian 运行时不提供安全交接接口",
      debugger_busy: "页面调试接口正被占用",
      debugger_attach_failed: "无法连接页面交接接口",
      untrusted_document_url: "页面已离开受信任的翻译地址",
      ambiguous_file_input: "官方页面的文件选择器结构已变化",
      document_unavailable: "官方页面尚未准备好",
      file_input_unavailable: "官方页面的文件选择器不可用",
      incompatible_file_input: "官方页面当前不接受此文件类型",
      file_assignment_unconfirmed: "官方页面未确认文件选择",
      handoff_state_unconfirmed: "官方页面未确认上传状态",
      cdp_command_failed: "页面交接过程中发生错误",
    };
    return reasons[code] || "自动交接未完成";
  };

  IMTExtendedPluginClass.prototype._startPendingDocumentHandoff = function (documentWindow) {
    var request = this._documentHandoffRequest;
    if (!request || request.started || request.generation !== this._documentWorkspaceGeneration || this._documentWorkspaceWindow !== documentWindow) return Promise.resolve(false);
    if (this._documentHandoffPromise) {
      var pluginAfterCurrentHandoff = this;
      var currentHandoff = this._documentHandoffPromise;
      return Promise.resolve(currentHandoff).catch(function () { return false; }).then(function () {
        if (pluginAfterCurrentHandoff._documentHandoffRequest !== request) return false;
        return pluginAfterCurrentHandoff._startPendingDocumentHandoff(documentWindow);
      });
    }
    request.started = true;
    request.attempts = Number(request.attempts || 0) + 1;
    var candidate = this._resolveDocumentHandoffFile(request.file, request.spec);
    var fileName = request.file && (request.file.name || request.file.path) || "当前 PDF";
    if (!candidate.ok) {
      new obsidian.Notice(this._documentHandoffFailureMessage(candidate.code) + "；请在已打开的页面中手动选择「" + fileName + "」");
      return Promise.resolve(false);
    }
    var pluginInstance = this;
    var generation = request.generation;
    var scheduleRetry = function (code) {
      var retryable = code === "handoff_state_unconfirmed" || code === "cdp_command_failed" ||
        code === "document_unavailable" || code === "file_input_unavailable";
      if (!retryable || request.attempts >= 5 || pluginInstance._documentHandoffRequest !== request) return false;
      request.started = false;
      pluginInstance._scheduleTimeout(function () {
        if (pluginInstance._documentHandoffRequest === request && pluginInstance._documentWorkspaceWindow === documentWindow && pluginInstance._documentWorkspaceGeneration === generation) {
          pluginInstance._startPendingDocumentHandoff(documentWindow);
        }
      }, 300);
      return true;
    };
    var operation = Promise.resolve(this._handoffDocumentFile(documentWindow, candidate)).then(function (result) {
      if (pluginInstance._documentWorkspaceWindow !== documentWindow || pluginInstance._documentWorkspaceGeneration !== generation) return false;
      if (result && result.ok) {
        pluginInstance._documentPdfDownloadSource = {
          generation: generation,
          absolutePath: candidate.absolutePath,
          fileName: candidate.fileName,
        };
        pluginInstance._scheduleDocumentRuntimeRefresh(documentWindow, generation);
        new obsidian.Notice("已将「" + candidate.fileName + "」交给 PDF 翻译工作区");
        return true;
      }
      if (scheduleRetry(result && result.code)) return false;
      new obsidian.Notice(pluginInstance._documentHandoffFailureMessage(result && result.code) + "；请在已打开的页面中手动选择「" + candidate.fileName + "」");
      return false;
    }).catch(function () {
      if (pluginInstance._documentWorkspaceWindow === documentWindow && pluginInstance._documentWorkspaceGeneration === generation) {
        if (scheduleRetry("cdp_command_failed")) return false;
        new obsidian.Notice("自动交接未完成；请在已打开的页面中手动选择「" + candidate.fileName + "」");
      }
      return false;
    }).then(function (result) {
      if (pluginInstance._documentHandoffPromise === operation) pluginInstance._documentHandoffPromise = null;
      return result;
    });
    this._documentHandoffPromise = operation;
    return operation;
  };

  IMTExtendedPluginClass.prototype._clearDocumentRuntimeRefresh = function () {
    var timer = this._documentRuntimeRefreshTimer;
    this._documentRuntimeRefreshTimer = null;
    if (timer) clearTimeout(timer);
    return !!timer;
  };

  IMTExtendedPluginClass.prototype._scheduleDocumentRuntimeRefresh = function (documentWindow, generation, delayMs) {
    this._clearDocumentRuntimeRefresh();
    var pluginInstance = this;
    var delay = Number.isFinite(delayMs) ? Math.max(0, Math.min(5000, delayMs)) : 750;
    var timer = setTimeout(function () {
      if (pluginInstance._documentRuntimeRefreshTimer === timer) pluginInstance._documentRuntimeRefreshTimer = null;
      if (pluginInstance._documentWorkspaceWindow !== documentWindow || pluginInstance._documentWorkspaceGeneration !== generation ||
          !documentWindow || documentWindow.isDestroyed()) return;
      var currentUrl = "";
      try { currentUrl = documentWindow.webContents.getURL(); } catch (e) {}
      if (!isTrustedDocumentWorkspaceUrl(currentUrl)) return;
      Promise.resolve(pluginInstance._initializeDocumentRuntime(documentWindow)).catch(function () {});
    }, delay);
    if (timer && typeof timer.unref === "function") timer.unref();
    this._documentRuntimeRefreshTimer = timer;
    return true;
  };

  IMTExtendedPluginClass.prototype._sendDocumentPdfDownloadStatus = function (documentWindow, state, fileName, generation) {
    if (!documentWindow || this._documentWorkspaceWindow !== documentWindow || documentWindow.isDestroyed() ||
        (Number.isFinite(generation) && generation !== this._documentWorkspaceGeneration)) return false;
    try {
      documentWindow.webContents.send(DOCUMENT_RUNTIME_STATUS_CHANNEL, {
        state: String(state || "failed"),
        fileName: typeof fileName === "string" ? fileName : "",
      });
      return true;
    } catch (e) { return false; }
  };

  IMTExtendedPluginClass.prototype._clearPendingDocumentPdfDownload = function () {
    var pending = this._pendingDocumentPdfDownload;
    this._pendingDocumentPdfDownload = null;
    if (pending && pending.capture && typeof pending.capture.cancel === "function") {
      try { Promise.resolve(pending.capture.cancel()).catch(function () {}); } catch (e) {}
    }
    return pending;
  };

  IMTExtendedPluginClass.prototype._armDocumentPdfDownload = function (documentWindow, source) {
    var ticket = createTranslatedPdfCapture(source && source.absolutePath);
    if (!ticket || ticket.ok !== true) return ticket && typeof ticket === "object" ? ticket : { ok: false, code: "download_prepare_failed" };
    var settled = false;
    var timeoutId = null;
    var resolveCompletion;
    var completion = new Promise(function (resolve) { resolveCompletion = resolve; });
    var settle = function (result) {
      if (settled) return { ok: false, code: "capture_already_finished" };
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = null;
      resolveCompletion(result);
      return result;
    };
    var capture = {
      ok: true,
      code: "armed",
      token: ticket.token,
      tempPath: ticket.tempPath,
      sourceFileName: ticket.sourceFileName,
      maxBytes: ticket.maxBytes,
      completion: completion,
      finish: function (result) {
        var input = result && typeof result === "object" ? result : {};
        if (input.ok === true) return settle(finalizeTranslatedPdfCapture(ticket, { byteLength: input.byteLength }));
        discardTranslatedPdfCapture(ticket);
        var code = typeof input.code === "string" && input.code ? input.code : "capture_failed";
        return settle({ ok: false, code: code });
      },
      cancel: function () {
        discardTranslatedPdfCapture(ticket);
        return settle({ ok: false, code: "cancelled" });
      },
    };
    timeoutId = setTimeout(function () {
      if (settled) return;
      discardTranslatedPdfCapture(ticket);
      settle({ ok: false, code: "timed_out" });
    }, DOCUMENT_PDF_CAPTURE_TIMEOUT_MS);
    if (timeoutId && typeof timeoutId.unref === "function") timeoutId.unref();
    return capture;
  };

  IMTExtendedPluginClass.prototype._handleDocumentRuntimeAction = function (documentWindow, action, context) {
    if (!documentWindow || this._documentWorkspaceWindow !== documentWindow || documentWindow.isDestroyed()) {
      return { ok: false, code: "window_unavailable" };
    }
    var currentUrl = "";
    try { currentUrl = documentWindow.webContents.getURL(); } catch (e) {}
    if (!isTrustedDocumentWorkspaceUrl(currentUrl)) return { ok: false, code: "untrusted_document_url" };
    var actionContext = context && typeof context === "object" && !Array.isArray(context) ? context : {};
    if (action === "cancel_translated_pdf_download") {
      var pendingForCancel = this._pendingDocumentPdfDownload;
      var cancelToken = typeof actionContext.token === "string" ? actionContext.token : "";
      if (pendingForCancel && cancelToken && pendingForCancel.capture && cancelToken !== pendingForCancel.capture.token) {
        return { ok: false, code: "invalid_capture_ticket" };
      }
      var cancelled = this._clearPendingDocumentPdfDownload();
      if (cancelled) this._sendDocumentPdfDownloadStatus(documentWindow, "cancelled", "");
      return { ok: true, code: "download_cancelled" };
    }
    if (action === "finish_translated_pdf_download") {
      var pendingForFinish = this._pendingDocumentPdfDownload;
      var finishToken = typeof actionContext.token === "string" ? actionContext.token : "";
      if (!pendingForFinish || !pendingForFinish.capture || !finishToken || finishToken !== pendingForFinish.capture.token ||
          pendingForFinish.generation !== this._documentWorkspaceGeneration || typeof pendingForFinish.capture.finish !== "function") {
        return { ok: false, code: "invalid_capture_ticket" };
      }
      return pendingForFinish.capture.finish({
        ok: actionContext.ok === true,
        byteLength: Number.isSafeInteger(actionContext.byteLength) ? actionContext.byteLength : 0,
        code: typeof actionContext.code === "string" ? actionContext.code : "capture_failed",
      });
    }
    if (action !== "prepare_translated_pdf_download") return { ok: false, code: "invalid_action" };
    var spec = this._documentWorkspaceSpec || {};
    var source = this._documentPdfDownloadSource;
    if (spec.kind !== "pdf" || !source || source.generation !== this._documentWorkspaceGeneration ||
        typeof source.absolutePath !== "string" || !source.absolutePath) {
      return { ok: false, code: "source_unavailable" };
    }
    var identity = actionContext;
    var currentFileName = typeof identity.fileName === "string" ? identity.fileName : "";
    var currentTitle = typeof identity.title === "string" ? identity.title : "";
    var titleMatchesSource = false;
    var titleOffset = currentTitle.indexOf(source.fileName);
    while (titleOffset >= 0 && !titleMatchesSource) {
      var before = titleOffset > 0 ? currentTitle.charAt(titleOffset - 1) : "";
      var afterOffset = titleOffset + source.fileName.length;
      var after = afterOffset < currentTitle.length ? currentTitle.charAt(afterOffset) : "";
      titleMatchesSource = (!before || /[\s\-—|:：·•()]/.test(before)) && (!after || /[\s\-—|:：·•()]/.test(after));
      titleOffset = currentTitle.indexOf(source.fileName, titleOffset + 1);
    }
    if ((currentFileName && currentFileName !== source.fileName) || (!currentFileName && !titleMatchesSource)) {
      return { ok: false, code: "source_unavailable" };
    }
    this._clearPendingDocumentPdfDownload();
    var pluginInstance = this;
    var generation = this._documentWorkspaceGeneration;
    return Promise.resolve(this._armDocumentPdfDownload(documentWindow, source)).then(function (capture) {
      if (!capture || capture.ok !== true) return capture && typeof capture === "object" ? capture : { ok: false, code: "download_prepare_failed" };
      if (pluginInstance._documentWorkspaceWindow !== documentWindow || pluginInstance._documentWorkspaceGeneration !== generation || documentWindow.isDestroyed()) {
        try { Promise.resolve(capture.cancel()).catch(function () {}); } catch (e) {}
        return { ok: false, code: "window_unavailable" };
      }
      var pending = { generation: generation, capture: capture };
      pluginInstance._pendingDocumentPdfDownload = pending;
      Promise.resolve(capture.completion).then(function (result) {
        if (pluginInstance._pendingDocumentPdfDownload !== pending) return;
        pluginInstance._pendingDocumentPdfDownload = null;
        if (result && result.ok === true) {
          pluginInstance._sendDocumentPdfDownloadStatus(documentWindow, "completed", result.fileName || "", generation);
          new obsidian.Notice("译文 PDF 已保存到源文件夹：「" + result.fileName + "」");
          return;
        }
        var code = result && result.code || "download_failed";
        var state = code === "cancelled" ? "cancelled" : code === "timed_out" ? "timed_out" : "failed";
        pluginInstance._sendDocumentPdfDownloadStatus(documentWindow, state, "", generation);
        if (state === "failed") new obsidian.Notice("译文 PDF 保存失败，请重试");
      }).catch(function () {
        if (pluginInstance._pendingDocumentPdfDownload !== pending) return;
        pluginInstance._pendingDocumentPdfDownload = null;
        pluginInstance._sendDocumentPdfDownloadStatus(documentWindow, "failed", "", generation);
        new obsidian.Notice("译文 PDF 保存失败，请重试");
      });
      return {
        ok: true,
        code: "download_armed",
        captureTicket: {
          token: capture.token,
          tempPath: capture.tempPath,
          sourceFileName: capture.sourceFileName,
          maxBytes: capture.maxBytes,
        },
      };
    }).catch(function () { return { ok: false, code: "download_prepare_failed" }; });
  };

  IMTExtendedPluginClass.prototype._openDocumentWorkspace = function (options) {
    if (!this._isDocumentWorkspaceEnabled()) return false;
    var request = options || {};
    var documentUrl = String(request.url || FILE_WORKSPACE_URL);
    if (!isTrustedDocumentWorkspaceUrl(documentUrl)) { new obsidian.Notice("文档翻译地址未通过安全校验"); return false; }
    var BrowserWindow = this._getBrowserWindow();
    if (!BrowserWindow) { new obsidian.Notice("当前 Obsidian 无法创建内嵌文档翻译窗口；不会跳转到系统浏览器。"); return false; }
    var spec = request.spec || { autoHandoff: false };
    var generation = ++this._documentWorkspaceGeneration;
    var pluginInstance = this;
    this._documentWorkspaceSpec = spec;
    this._clearDocumentRuntimeRefresh();
    this._documentPdfDownloadSource = null;
    this._clearPendingDocumentPdfDownload();
    this._documentHandoffRequest = spec.autoHandoff && request.file
      ? { generation: generation, file: request.file, spec: spec, started: false, attempts: 0 }
      : null;
    if (this._documentWorkspaceWindow && !this._documentWorkspaceWindow.isDestroyed()) {
      var reusedWindow = this._documentWorkspaceWindow;
      try { if (typeof reusedWindow.isMinimized === "function" && reusedWindow.isMinimized() && typeof reusedWindow.restore === "function") reusedWindow.restore(); } catch (e) {}
      try { if (typeof reusedWindow.show === "function") reusedWindow.show(); } catch (e) {}
      try { if (typeof reusedWindow.focus === "function") reusedWindow.focus(); } catch (e) {}
      try {
        var reusedLoad = reusedWindow.loadURL(documentUrl);
        if (reusedLoad && typeof reusedLoad.catch === "function") reusedLoad.catch(function () {
          if (pluginInstance._documentWorkspaceWindow !== reusedWindow || pluginInstance._documentWorkspaceGeneration !== generation) return;
          pluginInstance._documentHandoffRequest = null;
          new obsidian.Notice("文档翻译页面加载失败，请重试");
        });
      } catch (e) {
        if (this._documentWorkspaceGeneration === generation) this._documentHandoffRequest = null;
        new obsidian.Notice("文档翻译页面加载失败，请重试");
        return false;
      }
      return true;
    }
    var documentPreloadPath = this._getDocumentPreloadPath();
    if (!documentPreloadPath) {
      this._documentHandoffRequest = null; this._documentWorkspaceSpec = null;
      new obsidian.Notice("PDF 翻译桥文件缺失，请重新安装插件");
      return false;
    }
    var documentWindow;
    try {
      documentWindow = new BrowserWindow({
        width: 1040,
        height: 800,
        title: "沉浸式翻译 - " + String(request.title || "文档翻译"),
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          preload: documentPreloadPath,
        },
      });
    } catch (e) {
      this._documentHandoffRequest = null;
      new obsidian.Notice("Obsidian 内嵌文档翻译窗口创建失败；不会跳转到系统浏览器。");
      return false;
    }
    this._documentWorkspaceWindow = documentWindow;
    var isCurrentDocumentWindow = function () { return pluginInstance._documentWorkspaceWindow === documentWindow && !documentWindow.isDestroyed(); };
    documentWindow.webContents.setWindowOpenHandler(function (details) {
      var targetUrl = details && details.url || "";
      if (!isCurrentDocumentWindow()) return { action: "deny" };
      if (isTrustedDocumentWorkspaceUrl(targetUrl)) {
        try {
          var navigation = documentWindow.loadURL(targetUrl);
          if (navigation && typeof navigation.catch === "function") navigation.catch(function () {});
        } catch (e) {}
      } else pluginInstance._openExternalUrl(targetUrl);
      return { action: "deny" };
    });
    var guardNavigation = function (event, targetUrl) {
      if (isCurrentDocumentWindow() && isTrustedDocumentWorkspaceUrl(targetUrl)) return;
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      if (isCurrentDocumentWindow()) pluginInstance._openExternalUrl(targetUrl);
    };
    documentWindow.webContents.on("will-navigate", guardNavigation);
    documentWindow.webContents.on("will-redirect", guardNavigation);
    documentWindow.webContents.on("ipc-message", function (_event, channel, message) {
      if (!isCurrentDocumentWindow() || !message || typeof message !== "object") return;
      if (channel === DOCUMENT_RUNTIME_ACTION_CHANNEL) {
        var actionId = typeof message.id === "string" && /^document-action-[0-9a-f]{16}-\d+$/.test(message.id) ? message.id : "";
        if (!actionId) return;
        Promise.resolve(pluginInstance._handleDocumentRuntimeAction(documentWindow, message.action, message.context)).then(function (actionPayload) {
          if (!isCurrentDocumentWindow()) return;
          try { documentWindow.webContents.send(DOCUMENT_RUNTIME_ACTION_CHANNEL + ":response", { id: actionId, payload: actionPayload }); } catch (e) {}
        }).catch(function () {
          if (!isCurrentDocumentWindow()) return;
          try { documentWindow.webContents.send(DOCUMENT_RUNTIME_ACTION_CHANNEL + ":response", { id: actionId, payload: { ok: false, code: "download_prepare_failed" } }); } catch (e) {}
        });
        return;
      }
      if (channel !== DOCUMENT_RUNTIME_REQUEST_CHANNEL) return;
      var id = typeof message.id === "string" && /^document-request-[0-9a-f]{16}-\d+$/.test(message.id) ? message.id : "";
      if (!id) return;
      var currentUrl = "";
      try { currentUrl = documentWindow.webContents.getURL(); } catch (e) {}
      if (!isTrustedDocumentWorkspaceUrl(currentUrl)) {
        try { documentWindow.webContents.send(DOCUMENT_RUNTIME_REQUEST_CHANNEL + ":response", { id: id, payload: { ok: false, code: "untrusted_document_url" } }); } catch (e) {}
        return;
      }
      Promise.resolve(pluginInstance._requestDocumentRuntimeNetwork(message.request)).then(function (payload) {
        if (!isCurrentDocumentWindow()) return;
        try { documentWindow.webContents.send(DOCUMENT_RUNTIME_REQUEST_CHANNEL + ":response", { id: id, payload: payload }); } catch (e) {}
      }).catch(function () {
        if (!isCurrentDocumentWindow()) return;
        try { documentWindow.webContents.send(DOCUMENT_RUNTIME_REQUEST_CHANNEL + ":response", { id: id, payload: { ok: false, code: "request_failed" } }); } catch (e) {}
      });
    });
    documentWindow.webContents.on("did-finish-load", function () {
      if (isCurrentDocumentWindow()) pluginInstance._handleDocumentWorkspaceReady(documentWindow);
    });
    documentWindow.webContents.on("did-navigate-in-page", function (_event, _targetUrl, isMainFrame) {
      if (isMainFrame === false || !isCurrentDocumentWindow()) return;
      pluginInstance._scheduleDocumentRuntimeRefresh(documentWindow, pluginInstance._documentWorkspaceGeneration, 100);
    });
    documentWindow.on("closed", function () {
      if (pluginInstance._documentWorkspaceWindow !== documentWindow) return;
      pluginInstance._clearDocumentRuntimeRefresh();
      pluginInstance._documentWorkspaceGeneration++;
      pluginInstance._documentWorkspaceWindow = null;
      pluginInstance._documentWorkspaceSpec = null;
      pluginInstance._documentHandoffRequest = null;
      pluginInstance._documentHandoffPromise = null;
      pluginInstance._documentPdfDownloadSource = null;
      pluginInstance._clearPendingDocumentPdfDownload();
    });
    try {
      var load = documentWindow.loadURL(documentUrl);
      if (load && typeof load.catch === "function") load.catch(function () {
        if (!isCurrentDocumentWindow() || pluginInstance._documentWorkspaceGeneration !== generation) return;
        pluginInstance._documentHandoffRequest = null;
        new obsidian.Notice("文档翻译页面加载失败，请重试");
      });
    } catch (e) {
      this._closeDocumentWorkspace();
      new obsidian.Notice("文档翻译页面加载失败");
      return false;
    }
    return true;
  };

  IMTExtendedPluginClass.prototype._closeDocumentWorkspace = function () {
    this._documentWorkspaceGeneration++;
    this._documentHandoffRequest = null;
    this._documentHandoffPromise = null;
    this._documentWorkspaceSpec = null;
    this._documentPdfDownloadSource = null;
    this._clearDocumentRuntimeRefresh();
    this._clearPendingDocumentPdfDownload();
    var documentWindow = this._documentWorkspaceWindow;
    this._documentWorkspaceWindow = null;
    if (documentWindow && !documentWindow.isDestroyed()) try { documentWindow.close(); } catch (e) {}
  };

  IMTExtendedPluginClass.prototype._ensurePdfTranslationAction = function (leaf) {
    if (this._isUnloaded) return false;
    var context = this._getPdfTranslationContext(leaf);
    if (!context || typeof context.view.addAction !== "function") return false;
    if (this._pdfActionViews.has(context.view)) return false;
    var pluginInstance = this;
    var actionEl = context.view.addAction("languages", "翻译当前 PDF（打开沉浸式翻译 PDF 工作区）", function () {
      if (!pluginInstance._isUnloaded) pluginInstance._openCurrentPdfTranslationWorkspace(context.leaf);
    });
    this._pdfActionViews.add(context.view);
    if (actionEl) {
      try { actionEl.classList.add("imt-pdf-translate-action"); } catch (e) {}
      this._pdfActionElements.push(actionEl);
    }
    return true;
  };

  IMTExtendedPluginClass.prototype._installDocumentTranslationEntry = function () {
    if (this._isUnloaded || !this._isDocumentWorkspaceEnabled()) return false;
    var workspace = this.app && this.app.workspace;
    if (!workspace) return false;
    var pluginInstance = this; var installed = false;
    if (typeof this.addCommand === "function") {
      this.addCommand({
        id: "translate-current-pdf",
        name: "翻译当前 PDF",
        checkCallback: function (checking) {
          if (!pluginInstance._getPdfTranslationContext()) return false;
          if (!checking) pluginInstance._openCurrentPdfTranslationWorkspace();
          return true;
        },
      });
      this.addCommand({
        id: "open-document-translation-workspace",
        name: "打开文档翻译工作区",
        callback: function () { pluginInstance._openDocumentTranslationWorkspace(); },
      });
      installed = true;
    }
    var refresh = function (leaf) {
      if (pluginInstance._isUnloaded) return false;
      return pluginInstance._ensurePdfTranslationAction(leaf || workspace.activeLeaf);
    };
    if (typeof workspace.on === "function" && typeof this.registerEvent === "function") {
      ["active-leaf-change", "file-open", "layout-change"].forEach(function (eventName) {
        pluginInstance.registerEvent(workspace.on(eventName, function () { refresh(); }));
      });
    }
    if (typeof workspace.onLayoutReady === "function") workspace.onLayoutReady(function () { refresh(); });
    else refresh();
    return installed || !!this._getPdfTranslationContext();
  };

  IMTExtendedPluginClass.prototype._initializeUserscriptSidePanelDefaults = async function () {
    if (this.settings.userscriptSidePanelConfigVersion >= 3) return false;
    var previousSidePanelConfigVersion = Number(this.settings.userscriptSidePanelConfigVersion || 0);
    var configState = _readGMConfigState();
    if (!configState.valid) {
      new obsidian.Notice("侧边栏入口未初始化：沉浸式翻译配置无法读取，请先修复配置或重新导入");
      return false;
    }
    var config = configState.value;
    var isObject = function (value) { return !!(value && typeof value === "object" && !Array.isArray(value)); };
    var hasChoice = function (value) { return isObject(value)
      && (typeof value.enableSidePanel === "boolean" || typeof value.enablePinSidePanel === "boolean" || typeof value.sidePanelEntry === "string"); };
    // Upstream selects the userscript or Electron/desktop float-ball branch at runtime.
    // Keep both branches aligned so a vault reload preserves the same native hover behavior.
    var branchNames = ["monkeyH5FloatBall", "pcFloatBall"];
    var getBranchChoice = function (branchName) {
      var base = config && config[branchName];
      var overrides = config && config[branchName + ".add"];
      if (hasChoice(overrides)) return overrides;
      if (hasChoice(base)) return base;
      return null;
    };
    var getEntry = function (choice) {
      if (choice && (choice.sidePanelEntry === "hidden" || choice.sidePanelEntry === "hover" || choice.sidePanelEntry === "pin")) return choice.sidePanelEntry;
      if (choice && choice.enableSidePanel === false) return "hidden";
      if (choice && choice.enablePinSidePanel === true) return "pin";
      return "hover";
    };
    var isLegacyPluginPin = function (branchName) {
      var overrides = config && config[branchName + ".add"];
      return isObject(overrides)
        && overrides.enableSidePanel === true
        && overrides.enablePinSidePanel === true
        && overrides.sidePanelEntry === "pin";
    };
    var changed = false;
    var writtenRaw = null;
    var nextConfig = Object.assign({}, config);
    var explicitChoices = branchNames.map(getBranchChoice);
    var sharedChoice = explicitChoices.find(function (choice, index) {
      return choice && !(previousSidePanelConfigVersion === 1 && isLegacyPluginPin(branchNames[index]));
    }) || null;
    var configChanged = false;
    branchNames.forEach(function (branchName, index) {
      var existingChoice = explicitChoices[index];
      var migrateLegacyPin = previousSidePanelConfigVersion === 1 && isLegacyPluginPin(branchName);
      if (existingChoice && !migrateLegacyPin) return;
      var choice = sharedChoice;
      var entry = getEntry(choice);
      var overrideKey = branchName + ".add";
      var currentOverrides = nextConfig[overrideKey];
      nextConfig[overrideKey] = Object.assign({}, isObject(currentOverrides) ? currentOverrides : {}, {
        enableSidePanel: entry !== "hidden",
        enablePinSidePanel: entry === "pin",
        sidePanelEntry: entry,
        hoverSidePanelDelay: choice && typeof choice.hoverSidePanelDelay === "number" ? choice.hoverSidePanelDelay : 500,
      });
      configChanged = true;
    });
    if (configChanged) {
      try { writtenRaw = JSON.stringify(nextConfig); } catch (e) { return false; }
      changed = _gmSetConfig(nextConfig);
      if (!changed) {
        new obsidian.Notice("侧边栏入口初始化失败：无法写入沉浸式翻译配置");
        return false;
      }
    }
    var widthKey = GM_STORE_PREFIX + "mock-side-panel-width";
    var previousWidth = null; var widthChanged = false;
    try {
      previousWidth = localStorage.getItem(widthKey);
      var parsedWidth = previousWidth === null ? null : JSON.parse(previousWidth);
      if (parsedWidth === null || parsedWidth === 435) {
        localStorage.setItem(widthKey, JSON.stringify(DEFAULT_MOCK_SIDE_PANEL_WIDTH));
        widthChanged = true;
      }
    } catch (e) {}
    this.settings.userscriptSidePanelConfigVersion = 3;
    try {
      var persisted = await this.saveSettings();
      if (persisted === false) throw new Error("saveSettings returned false");
    } catch (e) {
      this.settings.userscriptSidePanelConfigVersion = previousSidePanelConfigVersion;
      if (changed) {
        try {
          var storageKey = GM_STORE_PREFIX + IMT_CONFIG_KEY;
          if (localStorage.getItem(storageKey) === writtenRaw) {
            if (configState.raw === null) localStorage.removeItem(storageKey);
            else localStorage.setItem(storageKey, configState.raw);
          }
        } catch (rollbackError) {}
      }
      if (widthChanged) {
        try { if (previousWidth === null) localStorage.removeItem(widthKey); else localStorage.setItem(widthKey, previousWidth); } catch (rollbackWidthError) {}
      }
      console.error("[IMT-Extended] Failed to persist side-panel initialization:", e);
      return false;
    }
    if ((changed || widthChanged) && !this._notifyUserscriptConfigChange() && this._isEngineLoaded()) new obsidian.Notice("悬浮球交互已更新，重启 Obsidian 后显示");
    return changed || widthChanged;
  };

  IMTExtendedPluginClass.prototype.saveSettings = function () {
    var pluginInstance = this; var snapshot;
    try { snapshot = JSON.parse(JSON.stringify(this.settings)); } catch (e) { snapshot = Object.assign({}, this.settings); }
    var write = _getSettingsSaveChain().then(function () { return pluginInstance.saveData(snapshot); });
    _trackSettingsSaveChain(write.catch(function (e) { console.error("[IMT-Extended] Failed to save settings:", e); }));
    return write;
  };

  IMTExtendedPluginClass.prototype._scheduleTimeout = function (callback, delay) {
    var pluginInstance = this;
    var timer = setTimeout(function () {
      var index = pluginInstance._startupTimers.indexOf(timer);
      if (index >= 0) pluginInstance._startupTimers.splice(index, 1);
      if (!pluginInstance._isUnloaded) {
        try {
          var result = callback();
          if (result && typeof result.catch === "function") result.catch(function (e) { console.error("[IMT-Extended] Delayed task failed:", e); });
        } catch (e) { console.error("[IMT-Extended] Delayed task failed:", e); }
      }
    }, delay);
    this._startupTimers.push(timer);
    return timer;
  };

  IMTExtendedPluginClass.prototype._clearStartupTimers = function () {
    for (var i = 0; i < this._startupTimers.length; i++) clearTimeout(this._startupTimers[i]);
    this._startupTimers = [];
  };

  IMTExtendedPluginClass.prototype._patchGlobal = function (target, key, value) {
    if (!target) return value;
    var existing = null;
    for (var i = 0; i < this._globalPatches.length; i++) {
      if (this._globalPatches[i].target === target && this._globalPatches[i].key === key) { existing = this._globalPatches[i]; break; }
    }
    if (!existing) {
      existing = { target: target, key: key, descriptor: Object.getOwnPropertyDescriptor(target, key), value: value };
      this._globalPatches.push(existing);
    } else {
      existing.value = value;
    }
    try { target[key] = value; } catch (e) { try { Object.defineProperty(target, key, { configurable: true, writable: true, value: value }); } catch (e2) {} }
    return value;
  };

  IMTExtendedPluginClass.prototype._restoreGlobalPatches = function () {
    for (var i = this._globalPatches.length - 1; i >= 0; i--) {
      var patch = this._globalPatches[i];
      try {
        // Preserve a value installed later by another plugin instead of clobbering its ownership.
        if (patch.target[patch.key] !== patch.value) continue;
        if (patch.descriptor) Object.defineProperty(patch.target, patch.key, patch.descriptor);
        else delete patch.target[patch.key];
      } catch (e) {}
    }
    this._globalPatches = [];
    this._gmPolyfillsInstalled = false; this._browserAPIPolyfillInstalled = false; this._gmFetchPolyfillInstalled = false;
  };

  IMTExtendedPluginClass.prototype._injectStyles = function () {
    if (this._styleInjected) return; this._styleInjected = true;
    var style = document.createElement("style"); style.id = "imt-enhance-styles"; style.textContent = CSS_STYLES; document.head.appendChild(style);
  };

  IMTExtendedPluginClass.prototype._interceptNavigation = function () {
    if (this._patchedWindowOpen) return;
    var pluginInstance = this;
    this._originalWindowOpen = window.open;
    this._patchedWindowOpen = function (url, target, features) {
      if (_isImtUrl(url)) { pluginInstance._openDashboardWindow(url); return null; }
      return pluginInstance._originalWindowOpen ? pluginInstance._originalWindowOpen.call(window, url, target, features) : null;
    };
    window.open = this._patchedWindowOpen;
  };

  IMTExtendedPluginClass.prototype._restoreNavigation = function () {
    if (this._patchedWindowOpen && window.open === this._patchedWindowOpen) window.open = this._originalWindowOpen;
    this._patchedWindowOpen = null; this._originalWindowOpen = null;
  };

  IMTExtendedPluginClass.prototype._getBrowserWindow = function () {
    try { if (window.electron && window.electron.remote && window.electron.remote.BrowserWindow) return window.electron.remote.BrowserWindow; } catch (e) {}
    try { var el = window.require("electron"); if (el && el.remote && el.remote.BrowserWindow) return el.remote.BrowserWindow; } catch (e) {}
    // Obsidian bundles @electron/remote, while some releases do not expose it
    // through electron.remote in the renderer. Keep both resolution paths so
    // the Dashboard stays inside Obsidian across platform/runtime variants.
    try { var remote = window.require("@electron/remote"); if (remote && remote.BrowserWindow) return remote.BrowserWindow; } catch (e) {}
    return null;
  };

  IMTExtendedPluginClass.prototype._getElectronShell = function () {
    try { var electron = window.require("electron"); if (electron && electron.shell) return electron.shell; } catch (e) {}
    try { var remote = window.require("@electron/remote"); if (remote && remote.shell) return remote.shell; } catch (e) {}
    return null;
  };

  IMTExtendedPluginClass.prototype._openExternalUrl = function (value) {
    var url = _parseHttpUrl(value); if (!url) return;
    var pluginInstance = this;
    var fallback = function () {
      if (pluginInstance._originalWindowOpen) {
        try { pluginInstance._originalWindowOpen.call(window, url.href, "_blank"); } catch (e) {}
      }
    };
    var shell = this._getElectronShell();
    if (shell && typeof shell.openExternal === "function") {
      try {
        var result = shell.openExternal(url.href);
        if (result && typeof result.catch === "function") result.catch(fallback);
        return;
      } catch (e) {}
    }
    fallback();
  };

  IMTExtendedPluginClass.prototype._closeProviderLoginGuide = function () {
    var modal = this._providerLoginGuideModal;
    this._providerLoginGuideModal = null;
    if (modal && typeof modal.close === "function") {
      try { modal.close(); } catch (e) {}
    }
  };

  IMTExtendedPluginClass.prototype._showProviderLoginGuide = function (guide) {
    if (!guide || !guide.id) return null;
    // OAuth providers must finish in a system browser, but the public Accounts
    // flow has no return channel to this BrowserWindow. Keep one guide open so
    // duplicate popup/navigation events cannot create duplicate browser tabs.
    if (this._providerLoginGuideModal) return this._providerLoginGuideModal;
    var pluginInstance = this;
    var modal = new obsidian.Modal(this.app);
    this._providerLoginGuideModal = modal;
    if (modal.titleEl) modal.titleEl.textContent = guide.label + " 账号登录";
    var content = modal.contentEl;
    if (content && typeof content.empty === "function") content.empty();
    if (content) {
      content.createEl("p", { text: guide.label + " 授权将在系统浏览器中结束，结果不能回到当前 Obsidian 登录窗口；继续授权只会登录浏览器账号。" });
      if (guide.id === "wechat") {
        content.createEl("p", { text: "官方支持的迁移方式：在浏览器使用新邮箱账号登录，进入“个人中心 → 集成 → 绑定微信”；权益同步后，再回到这里使用邮箱登录。" });
      } else {
        content.createEl("p", { text: "请先在浏览器进入原账号的个人中心，绑定邮箱并设置密码；Google 账号也可以使用原 Google 邮箱执行密码重置。完成后，再回到这里使用邮箱登录。" });
      }
      var actions = content.createDiv({ cls: "imt-provider-login-actions" });
      var profileButton = actions.createEl("button", { text: "打开官方个人中心", cls: "mod-cta" });
      profileButton.addEventListener("click", function () { pluginInstance._openExternalUrl(PROVIDER_PROFILE_URL); });
      if (guide.id === "wechat") {
        var faqButton = actions.createEl("button", { text: "查看官方微信迁移说明" });
        faqButton.addEventListener("click", function () { pluginInstance._openExternalUrl(PROVIDER_WECHAT_FAQ_URL); });
      }
      var emailButton = actions.createEl("button", { text: "返回邮箱登录" });
      emailButton.addEventListener("click", function () {
        pluginInstance._openDashboardWindow(PROVIDER_EMAIL_LOGIN_URL);
        if (typeof modal.close === "function") modal.close();
      });
    }
    modal.onClose = function () {
      if (pluginInstance._providerLoginGuideModal === modal) pluginInstance._providerLoginGuideModal = null;
      if (content && typeof content.empty === "function") content.empty();
    };
    modal.open();
    return modal;
  };

  IMTExtendedPluginClass.prototype._routeDashboardExternalNavigation = function (value, sourceUrl) {
    var guide = classifyProviderAuthNavigation(value, sourceUrl);
    if (guide) {
      this._showProviderLoginGuide(guide);
      return "provider-guide";
    }
    this._openExternalUrl(value);
    return "external";
  };

  IMTExtendedPluginClass.prototype._getPluginDir = function () {
    try {
      var path = window.require("path"); var fs = window.require("fs");
      if (!this.manifest || this.manifest.id !== PLUGIN_ID) return "";
      var adapter = this.app && this.app.vault && this.app.vault.adapter;
      var basePath = adapter && typeof adapter.basePath === "string" ? adapter.basePath : "";
      if (!basePath && adapter && typeof adapter.getBasePath === "function") basePath = adapter.getBasePath();
      if (!basePath) return "";
      var manifestDir = typeof this.manifest.dir === "string" ? this.manifest.dir.trim() : "";
      var registeredManifest = this.app && this.app.plugins && this.app.plugins.manifests && this.app.plugins.manifests[PLUGIN_ID];
      if (!manifestDir && registeredManifest && typeof registeredManifest.dir === "string") manifestDir = registeredManifest.dir.trim();
      var pluginDir;
      if (manifestDir) {
        pluginDir = path.isAbsolute(manifestDir) ? path.resolve(manifestDir) : path.resolve(basePath, manifestDir);
      } else {
        var configDir = this.app && this.app.vault && typeof this.app.vault.configDir === "string" ? this.app.vault.configDir.trim() : "";
        pluginDir = path.resolve(basePath, configDir || ".obsidian", "plugins", PLUGIN_ID);
      }
      var diskManifest = JSON.parse(fs.readFileSync(path.join(pluginDir, "manifest.json"), "utf-8"));
      if (!diskManifest || diskManifest.id !== PLUGIN_ID) return "";
      return pluginDir;
    } catch (e) {}
    return "";
  };

  IMTExtendedPluginClass.prototype._loadInstalledUserscript = function () {
    if (this._installedRuntime && this._installedRuntime.content) {
      this._loadedUserscriptVersion = this._installedRuntime.version;
      return this._installedRuntime.content;
    }
    var dir = this._getPluginDir();
    if (!dir) throw new Error("Plugin directory is unavailable");
    var runtime = loadInstalledRuntime({ pluginDir: dir });
    this._installedRuntime = runtime;
    this._loadedUserscriptVersion = runtime.version;
    return runtime.content;
  };

  IMTExtendedPluginClass.prototype._getRuntimeStatus = function () {
    var status = {
      installed: false,
      version: "",
      latestVersion: this._latestRuntimeVersion,
      latestState: this._runtimeVersionCheckState,
    };
    try {
      var dir = this._getPluginDir();
      if (!dir) return status;
      var runtime = loadInstalledRuntime({ pluginDir: dir });
      status.installed = true;
      status.version = runtime.version;
    } catch (e) {}
    return status;
  };

  IMTExtendedPluginClass.prototype._shouldCheckLatestRuntimeVersion = function () {
    if (this._isUnloaded || this._runtimeVersionCheckState === "checking") return false;
    return !this._runtimeVersionCheckedAt || Date.now() - this._runtimeVersionCheckedAt >= RUNTIME_VERSION_CHECK_TTL_MS;
  };

  IMTExtendedPluginClass.prototype._checkLatestRuntimeVersion = async function (force) {
    if (this._runtimeVersionCheckPromise) return this._runtimeVersionCheckPromise;
    if (this._isUnloaded) return { ok: false, version: "" };
    if (!force && !this._shouldCheckLatestRuntimeVersion()) {
      return { ok: this._runtimeVersionCheckState === "available", version: this._latestRuntimeVersion };
    }
    var pluginInstance = this;
    var checkGeneration = ++this._runtimeVersionCheckGeneration;
    this._runtimeVersionCheckState = "checking";
    var operation = (async function () {
      try {
        var response = await obsidian.requestUrl({ url: OFFICIAL_RUNTIME_URL, method: "GET", throw: false });
        if (pluginInstance._isUnloaded || pluginInstance._runtimeVersionCheckGeneration !== checkGeneration) {
          return { ok: false, version: "" };
        }
        var version = response && response.status === 200 && typeof response.text === "string"
          ? extractRuntimeVersion(response.text)
          : "";
        pluginInstance._runtimeVersionCheckedAt = Date.now();
        if (!version) {
          pluginInstance._latestRuntimeVersion = "";
          pluginInstance._runtimeVersionCheckState = "error";
          return { ok: false, version: "" };
        }
        pluginInstance._latestRuntimeVersion = version;
        pluginInstance._runtimeVersionCheckState = "available";
        return { ok: true, version: version };
      } catch (e) {
        if (!pluginInstance._isUnloaded && pluginInstance._runtimeVersionCheckGeneration === checkGeneration) {
          pluginInstance._runtimeVersionCheckedAt = Date.now();
          pluginInstance._latestRuntimeVersion = "";
          pluginInstance._runtimeVersionCheckState = "error";
        }
        return { ok: false, version: "" };
      }
    })();
    this._runtimeVersionCheckPromise = operation;
    try {
      return await operation;
    } finally {
      if (this._runtimeVersionCheckPromise === operation) this._runtimeVersionCheckPromise = null;
    }
  };

  IMTExtendedPluginClass.prototype._installRuntimeFromOfficialSource = async function () {
    if (this._runtimeInstallPromise) return this._runtimeInstallPromise;
    if (this._isUnloaded) return { ok: false, version: "" };
    var pluginInstance = this;
    var installGeneration = ++this._runtimeInstallGeneration;
    try { window[_runtimeInstallOwnerKey] = this; } catch (e) {}
    var operation = (async function () {
      try {
        var response = await obsidian.requestUrl({ url: OFFICIAL_RUNTIME_URL, method: "GET", throw: false });
        if (pluginInstance._isUnloaded || pluginInstance._runtimeInstallGeneration !== installGeneration || window[_runtimeInstallOwnerKey] !== pluginInstance) {
          return { ok: false, version: "" };
        }
        if (!response || response.status !== 200 || typeof response.text !== "string") {
          new obsidian.Notice("翻译运行时安装失败：官方地址未返回可用脚本");
          return { ok: false, version: "" };
        }
        var dir = pluginInstance._getPluginDir();
        if (!dir) {
          new obsidian.Notice("翻译运行时安装失败：插件目录不可用");
          return { ok: false, version: "" };
        }
        var engineAlreadyLoaded = pluginInstance._isEngineLoaded();
        var runtime = installRuntime({ pluginDir: dir, content: response.text });
        pluginInstance._installedRuntime = runtime;
        pluginInstance._runtimeVersionCheckGeneration++;
        pluginInstance._latestRuntimeVersion = runtime.version;
        pluginInstance._runtimeVersionCheckState = "available";
        pluginInstance._runtimeVersionCheckedAt = Date.now();
        if (engineAlreadyLoaded) {
          new obsidian.Notice("翻译运行时 v" + runtime.version + " 已安装；重启 Obsidian 后生效");
          return { ok: true, version: runtime.version };
        }
        pluginInstance._loadedUserscriptVersion = runtime.version;
        var activated = await pluginInstance._activateIMT();
        if (activated && !pluginInstance._isUnloaded) {
          pluginInstance._startTranslationViewBridge();
          pluginInstance._initialized = true;
          new obsidian.Notice("翻译运行时 v" + runtime.version + " 已安装并启用");
        } else {
          new obsidian.Notice("翻译运行时 v" + runtime.version + " 已安装；重启 Obsidian 后启用");
        }
        return { ok: true, version: runtime.version };
      } catch (e) {
        console.error("[IMT-Extended] Runtime installation failed: " + String(e && e.message || "unknown error"));
        new obsidian.Notice("翻译运行时安装失败；请稍后重试");
        return { ok: false, version: "" };
      }
    })();
    this._runtimeInstallPromise = operation;
    try {
      return await operation;
    } finally {
      if (this._runtimeInstallPromise === operation) this._runtimeInstallPromise = null;
    }
  };

  IMTExtendedPluginClass.prototype._ensureUserscript = async function (generation) {
    if (generation === undefined) generation = this._activationGeneration;
    if (!this._isActiveGeneration(generation)) return "";
    try {
      var content = this._loadInstalledUserscript();
      return this._isActiveGeneration(generation) ? content : "";
    } catch (e) {
      return "";
    }
  };

  IMTExtendedPluginClass.prototype._getCompatiblePreloadPath = function (fileName) {
    try {
      var dir = this._getPluginDir();
      if (!dir) return "";
      var path = window.require("path"); var fs = window.require("fs");
      var loadedVersion = this.manifest && typeof this.manifest.version === "string" ? this.manifest.version.trim() : "";
      if (!loadedVersion) return "";
      var diskManifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"));
      if (!diskManifest || diskManifest.id !== PLUGIN_ID || diskManifest.version !== loadedVersion) return "";
      var preloadPath = path.join(dir, fileName);
      return fs.existsSync(preloadPath) ? preloadPath : "";
    } catch (e) { return ""; }
  };

  IMTExtendedPluginClass.prototype._getPreloadPath = function () {
    return this._getCompatiblePreloadPath("dashboard-preload.js");
  };

  IMTExtendedPluginClass.prototype._getDocumentPreloadPath = function () {
    return this._getCompatiblePreloadPath("document-preload.js");
  };

  IMTExtendedPluginClass.prototype._isDashboardEmbeddedEnabled = function () {
    return DASHBOARD_EMBEDDED_ENABLED;
  };

  IMTExtendedPluginClass.prototype._isDocumentWorkspaceEnabled = function () {
    return DOCUMENT_WORKSPACE_ENABLED;
  };

  IMTExtendedPluginClass.prototype._openDashboardWindow = function (url) {
    if (!this._isDashboardEmbeddedEnabled()) {
      new obsidian.Notice("Dashboard 正在进行隔离桥安全升级，当前版本暂不开放内嵌窗口。");
      return false;
    }
    var dashboardUrl = _isTrustedDashboardNavigation(url) ? String(url) : "https://dash.immersivetranslate.com/#general";
    var BrowserWindow = this._getBrowserWindow();
    if (!BrowserWindow) { new obsidian.Notice("无法创建 Obsidian 内嵌登录窗口，已取消打开；不会跳转到系统浏览器。"); return false; }
    if (this._dashboardWindow && !this._dashboardWindow.isDestroyed()) {
      // A reused BrowserWindow may be minimized or hidden after another native
      // window took focus. Restore it before navigating so login never appears
      // to be blank while its document is merely not presented to the user.
      try { if (typeof this._dashboardWindow.isMinimized === "function" && this._dashboardWindow.isMinimized() && typeof this._dashboardWindow.restore === "function") this._dashboardWindow.restore(); } catch (e) {}
      try { if (typeof this._dashboardWindow.show === "function") this._dashboardWindow.show(); } catch (e) {}
      try { if (typeof this._dashboardWindow.focus === "function") this._dashboardWindow.focus(); } catch (e) {}
      try { this._dashboardWindow.loadURL(dashboardUrl); } catch (e) {}
      return;
    }
    var pluginInstance = this; var preloadPath = this._getPreloadPath();
    if (!preloadPath) { new obsidian.Notice("登录桥文件缺失，已取消打开；请重新安装插件。"); return false; }
    var pkceChannel = "imt-pkce-" + require("node:crypto").randomBytes(16).toString("hex");
    var webPrefs = {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      navigateOnDragDrop: false,
      safeDialogs: true,
      spellcheck: false,
      partition: "persist:immersive-translate-extended-dashboard",
    };
    webPrefs.preload = preloadPath;
    webPrefs.additionalArguments = [DASHBOARD_PKCE_ARGUMENT_PREFIX + pkceChannel];
    var dashboardWindow;
    try {
      dashboardWindow = new BrowserWindow({ width: 1200, height: 800, title: "沉浸式翻译 - 登录与设置", webPreferences: webPrefs });
    } catch (e) {
      new obsidian.Notice("Obsidian 内嵌登录窗口创建失败；不会跳转到系统浏览器。");
      return false;
    }
    this._dashboardWindow = dashboardWindow; this._dashboardPkceChannel = pkceChannel; this._advanceSyncGeneration();
    var isCurrentDashboard = function () { return pluginInstance._dashboardWindow === dashboardWindow && !dashboardWindow.isDestroyed(); };
    var dashboardSession = dashboardWindow.webContents && dashboardWindow.webContents.session;
    try {
      if (dashboardSession && typeof dashboardSession.setPermissionRequestHandler === "function") {
        dashboardSession.setPermissionRequestHandler(function (_webContents, _permission, callback) { callback(false); });
      }
      if (dashboardSession && typeof dashboardSession.setPermissionCheckHandler === "function") {
        dashboardSession.setPermissionCheckHandler(function () { return false; });
      }
    } catch (e) {}
    var pkceIpcHandler = function (event, channel, message) {
      if (channel !== pkceChannel || !isCurrentDashboard() || !message || typeof message !== "object") return;
      if (event && event.sender && event.sender !== dashboardWindow.webContents) return;
      if (event && event.senderFrame && event.senderFrame !== dashboardWindow.webContents.mainFrame) return;
      var id = typeof message.id === "string" && message.id.length <= 256 ? message.id : "";
      var type = typeof message.type === "string" && message.type.length <= 64 ? message.type : "";
      if (!id || !type) return;
      if (type === "navigateTrustedDashboard") {
        var targetUrl = message.data && message.data.url;
        var navigationPayload;
        if (!_isTrustedDashboardReturnNavigation(targetUrl)) {
          navigationPayload = { ok: false, code: "navigation_denied", message: "Dashboard return navigation denied", retryable: false };
        } else {
          try {
            var navigation = dashboardWindow.loadURL(String(targetUrl));
            if (navigation && typeof navigation.catch === "function") navigation.catch(function () {});
            navigationPayload = { ok: true };
          } catch (e) {
            navigationPayload = { ok: false, code: "navigation_failed", message: "Dashboard return navigation failed", retryable: true };
          }
        }
        try { dashboardWindow.webContents.send(pkceChannel + ":response", { id: id, type: type, payload: navigationPayload }); } catch (e) {}
        return;
      }
      if (type === "commitDashboardConfig") {
        Promise.resolve(pluginInstance._commitDashboardConfig(message.data && message.data.config)).then(function (payload) {
          if (!isCurrentDashboard()) return;
          try { dashboardWindow.webContents.send(pkceChannel + ":response", { id: id, type: type, payload: payload }); } catch (e) {}
        });
        return;
      }
      Promise.resolve(pluginInstance._dashboardPkceHost.handle(type, message.data || {})).catch(function () {
        return { ok: false, code: "pkce_host_failed", message: "PKCE host request failed", retryable: true };
      }).then(function (payload) {
        if (!isCurrentDashboard()) return;
        try { dashboardWindow.webContents.send(pkceChannel + ":response", { id: id, type: type, payload: payload }); } catch (e) {}
      });
    };
    this._dashboardPkceIpcHandler = pkceIpcHandler;
    dashboardWindow.webContents.on("ipc-message", pkceIpcHandler);
    dashboardWindow.webContents.on("will-attach-webview", function (event) { if (event && typeof event.preventDefault === "function") event.preventDefault(); });
    dashboardWindow.webContents.setWindowOpenHandler(function (details) {
      var u = details.url || "";
      if (!isCurrentDashboard()) return { action: "deny" };
      if (_isTrustedDashboardNavigation(u)) {
        try { dashboardWindow.loadURL(u); } catch (e) {}
      } else {
        // Electron often reduces referrer.url to the origin. The top-level
        // BrowserWindow URL retains the account/profile path needed to decide
        // whether this is an OAuth handoff rather than an ordinary external link.
        var sourceUrl = "";
        try { sourceUrl = dashboardWindow.webContents.getURL(); } catch (e) {}
        if (!sourceUrl) sourceUrl = details && details.referrer && details.referrer.url;
        pluginInstance._routeDashboardExternalNavigation(u, sourceUrl || "");
      }
      return { action: "deny" };
    });
    var guardNavigation = function (event, targetUrl) {
      if (!isCurrentDashboard()) { if (event && typeof event.preventDefault === "function") event.preventDefault(); return; }
      if (_isTrustedDashboardNavigation(targetUrl)) return;
      if (event && typeof event.preventDefault === "function") event.preventDefault();
      var sourceUrl = "";
      try { sourceUrl = dashboardWindow.webContents.getURL(); } catch (e) {}
      pluginInstance._routeDashboardExternalNavigation(targetUrl, sourceUrl);
    };
    dashboardWindow.webContents.on("will-navigate", guardNavigation);
    dashboardWindow.webContents.on("will-redirect", guardNavigation);
    dashboardWindow.webContents.on("dom-ready", function () { if (isCurrentDashboard()) pluginInstance._injectDashboardBridge(); });
    dashboardWindow.webContents.on("did-navigate", function () { setTimeout(function () { if (isCurrentDashboard()) pluginInstance._injectDashboardBridge(); }, 100); });
    dashboardWindow.webContents.on("did-navigate-in-page", function () { setTimeout(function () { if (isCurrentDashboard()) pluginInstance._injectDashboardBridge(); }, 100); });
    dashboardWindow.webContents.on("did-finish-load", function () { if (isCurrentDashboard()) { pluginInstance._injectDashboardBridge(); pluginInstance._syncDashboardAuthState(); pluginInstance._syncCookiesToMain(); pluginInstance._pushConfigToDashboard(); } });
    dashboardWindow.loadURL(dashboardUrl);
    dashboardWindow.on("closed", function () {
      if (pluginInstance._dashboardWindow !== dashboardWindow) return;
      pluginInstance._cookieReadSequence++; pluginInstance._advanceSyncGeneration(); pluginInstance._dashboardWindow = null;
      pluginInstance._dashboardPkceHost.clear(); pluginInstance._dashboardPkceChannel = ""; pluginInstance._dashboardPkceIpcHandler = null;
      pluginInstance._closeProviderLoginGuide();
      if (pluginInstance._syncPollTimer) { clearInterval(pluginInstance._syncPollTimer); pluginInstance._syncPollTimer = null; }
    });
    this._startSyncPolling();
    new obsidian.Notice("已打开 Dashboard。登录状态与高级翻译设置会和 Obsidian 双向同步。");
  };

  IMTExtendedPluginClass.prototype._closeDashboardWindow = function () {
    // Window closure owns sync invalidation, including the close performed during plugin unload.
    this._cookieReadSequence++; this._advanceSyncGeneration();
    var dashboardWindow = this._dashboardWindow; this._dashboardWindow = null;
    this._dashboardPkceHost.clear(); this._dashboardPkceChannel = ""; this._dashboardPkceIpcHandler = null;
    this._closeProviderLoginGuide();
    if (dashboardWindow && !dashboardWindow.isDestroyed()) try { dashboardWindow.close(); } catch (e) {}
    if (this._syncPollTimer) { clearInterval(this._syncPollTimer); this._syncPollTimer = null; }
  };

  IMTExtendedPluginClass.prototype._syncDashboardAuthState = function () {
    if (!this._dashboardWindow || this._dashboardWindow.isDestroyed() || this._authReadInFlight) return Promise.resolve(false);
    var pluginInstance = this;
    var dashboardWindow = this._dashboardWindow;
    var generation = this._syncGeneration;
    this._authReadInFlight = true;
    var read;
    try {
      read = dashboardWindow.webContents.executeJavaScript(
        "(function(){try{return window.__imt_get_auth_state?window.__imt_get_auth_state():null}catch(e){return null}})()"
      );
    } catch (e) {
      this._authReadInFlight = false;
      return Promise.resolve(false);
    }
    return Promise.resolve(read).then(function (state) {
      if (!pluginInstance._isActiveSyncGeneration(generation) || pluginInstance._dashboardWindow !== dashboardWindow) return false;
      if (!state || typeof state !== "object") return false;
      return pluginInstance._applyDashboardAuthState(state);
    }).catch(function () { return false; }).then(function (result) {
      if (pluginInstance._syncGeneration === generation) pluginInstance._authReadInFlight = false;
      return result;
    });
  };

  IMTExtendedPluginClass.prototype._applyDashboardAuthState = function (state) {
    var result;
    try { result = this._authAdapter.applyPkceState(state); } catch (e) { return false; }
    this._authToken = this._authAdapter.getToken();
    this._authCookies = this._authAdapter.getCookies();
    if (this._authToken) {
      var userInfo = this._authAdapter.getUserInfo();
      var aliasesChanged = _mirrorCurrentAuthAliases(this._authToken, userInfo);
      if (result.changed) this._authGeneration++;
      return !!(result.changed || aliasesChanged);
    }

    if (!result.changed) return false;
    this._authGeneration++;

    // A PKCE logout must not erase a still-valid legacy cookie session.
    if (this._authCookies) {
      _gmDeleteValue("authToken"); _gmDeleteValue("user_token"); _gmDeleteValue("auth"); _gmDeleteValue("GoogleAccessToken");
      _gmDeleteValue("immersiveTranslateIMT_COMMON_JWT_TOKEN"); _gmDeleteValue("immersiveTranslateGoogleAccessToken");
      return true;
    }
    this._clearDashboardAuthState();
    return true;
  };

  IMTExtendedPluginClass.prototype._clearDashboardAuthState = function () {
    // Invalidate every in-flight user-info request before removing the session aliases.
    this._authGeneration++;
    this._cookieReadSequence++;
    this._authAdapter.clear();
    this._authToken = "";
    this._authCookies = "";
    this._lastCookieHeader = "";
    var keys = ["userInfo", "user_info", "authToken", "user_token", "auth", "GoogleAccessToken", "subscriptionInfo", "immersiveTranslateIMT_COMMON_JWT_TOKEN", "immersiveTranslateGoogleAccessToken", "immersiveTranslateAuthFlow", "immersiveTranslateAuthState"];
    for (var i = 0; i < keys.length; i++) {
      try { localStorage.removeItem(GM_STORE_PREFIX + keys[i]); } catch (e) {}
    }
  };

  IMTExtendedPluginClass.prototype._syncCookiesToMain = function () {
    if (!this._dashboardWindow || this._dashboardWindow.isDestroyed()) return;
    var pluginInstance = this;
    var readSequence = ++this._cookieReadSequence;
    try {
      var session = this._dashboardWindow.webContents.session;
      if (session && session.cookies && session.cookies.get) {
        session.cookies.get({ domain: ".immersivetranslate.com" }).then(function (cookies) {
          if (pluginInstance._isUnloaded || readSequence !== pluginInstance._cookieReadSequence) return;
          var cookieHeader = (cookies || []).filter(function (cookie) { return cookie && cookie.name && cookie.value; }).map(function (cookie) { return cookie.name + "=" + cookie.value; }).sort().join("; ");
          if (cookieHeader === pluginInstance._lastCookieHeader) return;
          pluginInstance._lastCookieHeader = cookieHeader;
          pluginInstance._authAdapter.applyLegacyCookies(cookieHeader);
          pluginInstance._authCookies = pluginInstance._authAdapter.getCookies();
          if (!cookieHeader) {
            if (!pluginInstance._authToken) pluginInstance._clearDashboardAuthState();
            return;
          }
          pluginInstance._authGeneration++;
          console.log("[IMT-Extended] Dashboard session cookies changed");
          pluginInstance._fetchUserInfoViaAPI(pluginInstance._authGeneration, cookieHeader);
        }).catch(function () {});
      }
    } catch (e) {}
  };

  IMTExtendedPluginClass.prototype._getAuthCookies = function () { return this._authAdapter.getCookies() || this._authCookies || ""; };
  IMTExtendedPluginClass.prototype._getAuthToken = function () { return this._authAdapter.getToken() || this._authToken || ""; };

  IMTExtendedPluginClass.prototype._fetchUserInfoViaAPI = function () {
    var authGeneration = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : this._authGeneration;
    var ac = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : this._getAuthCookies();
    if (!ac || this._isUnloaded) return;
    var pluginInstance = this;
    try {
      obsidian.requestUrl({
        url: "https://api.immersivetranslate.com/user/info",
        method: "GET",
        headers: { "Cookie": ac, "Content-Type": "application/json" },
        throw: false
      }).then(function (resp) {
        if (pluginInstance._isUnloaded || pluginInstance._authGeneration !== authGeneration || pluginInstance._getAuthCookies() !== ac) return;
        if (resp.status === 200) {
          var data = typeof resp.json === "object" ? resp.json : JSON.parse(resp.text || "{}");
          var userInfo = _sanitizeUserInfo(data);
          // PKCE is the primary identity source; a legacy-cookie response must not
          // overwrite the newer Dashboard session's sanitized identity.
          if (userInfo && !pluginInstance._getAuthToken()) {
            _storeUserInfoAliases(userInfo);
            console.log("[IMT-Extended] Dashboard account state refreshed");
          }
        } else if (resp.status === 401 || resp.status === 403) {
          // Authentication may still be arriving from the independent Dashboard
          // accessor. Keep the possible PKCE session while dropping only cookies.
          if (pluginInstance._getAuthToken() || pluginInstance._authReadInFlight) {
            pluginInstance._authAdapter.applyLegacyCookies("");
            pluginInstance._authCookies = "";
          } else pluginInstance._clearDashboardAuthState();
        }
      }).catch(function () {});
    } catch (e) {}
  };

  IMTExtendedPluginClass.prototype._injectDashboardBridge = function () {
    if (!this._dashboardWindow || this._dashboardWindow.isDestroyed()) return;
    var bridgeCode =
      "(function(){" +
      "try{" +
      "if(typeof window.__imt_ensure_sync_ui!=='function') return false;" +
      "window.__imt_ensure_sync_ui();window.__imt_bridge_ready=true;return true;" +
      "}catch(e){console.error('[IMT-Bridge] ensure UI failed:',e.message);return false;}" +
      "})();";
    this._dashboardWindow.webContents.executeJavaScript(bridgeCode).catch(function (e) { console.warn("[IMT-Extended] Bridge injection failed:", e); });
  };

  IMTExtendedPluginClass.prototype._pushConfigToDashboard = function (config) {
    if (!this._dashboardWindow || this._dashboardWindow.isDestroyed() || !this._dashboardWindow.webContents || typeof this._dashboardWindow.webContents.executeJavaScript !== "function") return Promise.resolve(false);
    var source = config;
    if (!source || typeof source !== "object" || Array.isArray(source)) {
      var state = _readGMConfigState();
      if (!state.valid) return Promise.resolve(false);
      source = state.value;
    }
    var safeConfig = _sanitizeFullLocalUserConfig(source);
    if (!safeConfig) return Promise.resolve(false);
    var serialized;
    try { serialized = JSON.stringify(safeConfig); } catch (e) { return Promise.resolve(false); }
    if (serialized.length > SYNC_MAX_VALUE_BYTES) return Promise.resolve(false);
    var dashboardWindow = this._dashboardWindow;
    var sequence = ++this._dashboardConfigPushSequence;
    var script = "(function(){try{return typeof window.__imt_apply_host_config==='function'?window.__imt_apply_host_config(" + serialized + "):false}catch(e){return false}})()";
    return Promise.resolve(dashboardWindow.webContents.executeJavaScript(script)).then(function (result) {
      return sequence > 0 && result === true;
    }).catch(function () { return false; });
  };

  IMTExtendedPluginClass.prototype._commitDashboardConfig = function (config) {
    if (!config || typeof config !== "object" || Array.isArray(config)) return Promise.resolve({ ok: false, code: "invalid_config" });
    if (!_readGMConfigState().valid) return Promise.resolve({ ok: false, code: "local_config_invalid" });
    var serialized = _serializeSafeSyncValue(GM_STORE_PREFIX + IMT_CONFIG_KEY, config);
    if (serialized === null) return Promise.resolve({ ok: false, code: "invalid_config" });
    var values = {}; values[GM_STORE_PREFIX + IMT_CONFIG_KEY] = serialized;
    var snapshot = { version: 1, scope: SYNC_SCOPE_DASHBOARD, revision: "dashboard-ipc-" + Date.now(), values: values, deletedKeys: [] };
    snapshot.hash = _hashSyncPayload(values, []);
    var pluginInstance = this; var generation = this._syncGeneration;
    return this._applySyncData(JSON.stringify(snapshot), generation, SYNC_SCOPE_DASHBOARD).then(function (changed) {
      if (!pluginInstance._isActiveSyncGeneration(generation)) return { ok: false, code: "stale_dashboard" };
      return { ok: true, changed: changed === true };
    }).catch(function () { return { ok: false, code: "config_commit_failed" }; });
  };

  IMTExtendedPluginClass.prototype._startSyncPolling = function () {
    if (this._syncPollTimer) clearInterval(this._syncPollTimer);
    var pluginInstance = this;
    this._syncPollTimer = setInterval(function () {
      if (!pluginInstance._dashboardWindow || pluginInstance._dashboardWindow.isDestroyed()) { clearInterval(pluginInstance._syncPollTimer); pluginInstance._syncPollTimer = null; return; }
      pluginInstance._autoSyncDashboardStorage();
    }, 3000);
  };

  IMTExtendedPluginClass.prototype._autoSyncDashboardStorage = function () {
    if (!this._dashboardWindow || this._dashboardWindow.isDestroyed()) return;
    // Authentication has its own single-flight read and must not wait for the
    // larger configuration snapshot to finish.
    this._syncDashboardAuthState();
    this._syncCookiesToMain();
    if (this._syncReadInFlight) return;
    var pluginInstance = this; var dashboardWindow = this._dashboardWindow; var generation = this._syncGeneration;
    this._syncReadInFlight = true;
    try {
      dashboardWindow.webContents.executeJavaScript(
        "(function(){try{return window.__imt_sync_data||(window.__imt_build_sync_snapshot?JSON.stringify(window.__imt_build_sync_snapshot()):null)}catch(e){return null}})()"
      ).then(function (dataStr) {
        if (!pluginInstance._isActiveSyncGeneration(generation) || pluginInstance._dashboardWindow !== dashboardWindow) return false;
        if (dataStr) return pluginInstance._applySyncData(dataStr, generation, SYNC_SCOPE_DASHBOARD);
        return false;
      }).catch(function () {}).then(function () {
        if (pluginInstance._syncGeneration === generation) pluginInstance._syncReadInFlight = false;
      });
    } catch (e) {
      this._syncReadInFlight = false;
    }
  };

  IMTExtendedPluginClass.prototype._prepareSyncSnapshot = function (dataStr, scopeOverride) {
    var parsed = typeof dataStr === "string" ? JSON.parse(dataStr) : dataStr;
    var isEnvelope = parsed && (parsed.version === 1 || parsed.revision !== undefined || parsed.hash !== undefined || Array.isArray(parsed.deletedKeys));
    var envelope = isEnvelope && parsed.values && typeof parsed.values === "object" && !Array.isArray(parsed.values) ? parsed : { version: 0, revision: "legacy", values: parsed, deletedKeys: [] };
    if (!envelope.values || typeof envelope.values !== "object" || Array.isArray(envelope.values)) throw new Error("同步数据必须是对象");
    var scope = String(scopeOverride || envelope.scope || SYNC_SCOPE_PORTABLE).slice(0, 64);
    if (scope !== SYNC_SCOPE_PORTABLE && scope !== SYNC_SCOPE_DASHBOARD) throw new Error("同步数据范围无效");
    var rawDeleted = Array.isArray(envelope.deletedKeys) ? envelope.deletedKeys : [];
    if (Object.keys(envelope.values).length + rawDeleted.length > SYNC_MAX_KEYS) throw new Error("同步数据项过多");
    if (envelope.hash && envelope.hash !== _hashSyncPayload(envelope.values, rawDeleted)) throw new Error("同步数据校验失败");

    var values = {}; var deletedKeys = {}; var totalBytes = 0; var skipped = 0;
    for (var rawKey in envelope.values) {
      var normalizedKey = _normalizeSyncKey(rawKey);
      if (!normalizedKey) { skipped++; continue; }
      if (scope === SYNC_SCOPE_DASHBOARD && !DASHBOARD_SYNC_KEYS[normalizedKey.slice(GM_STORE_PREFIX.length)]) { skipped++; continue; }
      var serialized = _serializeSafeSyncValue(normalizedKey, envelope.values[rawKey]);
      if (serialized === null) { skipped++; continue; }
      totalBytes += serialized.length;
      if (totalBytes > SYNC_MAX_TOTAL_BYTES) throw new Error("同步数据过大");
      values[normalizedKey] = serialized;
    }
    for (var i = 0; i < rawDeleted.length; i++) {
      var deletedKey = _normalizeSyncKey(rawDeleted[i]);
      if (deletedKey && scope === SYNC_SCOPE_DASHBOARD && !DASHBOARD_SYNC_KEYS[deletedKey.slice(GM_STORE_PREFIX.length)]) { skipped++; continue; }
      if (deletedKey && !values[deletedKey]) deletedKeys[deletedKey] = true; else if (!deletedKey) skipped++;
    }
    return {
      revision: String(envelope.revision || "legacy").slice(0, 128),
      hash: envelope.hash || _hashSyncPayload(envelope.values, rawDeleted),
      scope: scope,
      values: values,
      deletedKeys: Object.keys(deletedKeys),
      skipped: skipped,
    };
  };

  IMTExtendedPluginClass.prototype._isActiveSyncGeneration = function (generation) { return !this._isUnloaded && generation === this._syncGeneration; };

  IMTExtendedPluginClass.prototype._ackSyncSnapshot = function (hash, generation) {
    if (generation === undefined) generation = this._syncGeneration;
    if (!this._isActiveSyncGeneration(generation)) return;
    try {
      if (this._dashboardWindow && !this._dashboardWindow.isDestroyed()) {
        var script = "window.__imt_sync_ack_hash=" + JSON.stringify(String(hash)) + ";window.__imt_sync_data=null";
        var result = this._dashboardWindow.webContents.executeJavaScript(script);
        if (result && typeof result.catch === "function") result.catch(function () {});
      }
    } catch (e) {}
  };

  IMTExtendedPluginClass.prototype._commitSyncSnapshot = async function (snapshot, generation) {
    if (generation === undefined) generation = this._syncGeneration;
    if (!this._isActiveSyncGeneration(generation)) return null;
    var changed = 0; var before = {}; var touched = {}; var configChanged = false; var committedConfig = null;
    var isDashboardScope = snapshot.scope === SYNC_SCOPE_DASHBOARD;
    var dashboardConfigState = null; var dashboardConfigPatch = null;
    if (isDashboardScope && snapshot.values[GM_STORE_PREFIX + IMT_CONFIG_KEY]) {
      try { dashboardConfigPatch = JSON.parse(snapshot.values[GM_STORE_PREFIX + IMT_CONFIG_KEY]); } catch (e) {}
      if (dashboardConfigPatch && typeof dashboardConfigPatch === "object" && !Array.isArray(dashboardConfigPatch)) {
        dashboardConfigState = _readGMConfigState();
        if (!dashboardConfigState.valid) {
          new obsidian.Notice("高级设置未同步：本地沉浸式翻译配置无法读取");
          return null;
        }
      }
    }
    var allKeys = Object.keys(snapshot.values).concat(snapshot.deletedKeys);
    for (var i = 0; i < allKeys.length; i++) {
      var key = allKeys[i];
      if (touched[key]) continue;
      touched[key] = true; before[key] = localStorage.getItem(key);
    }
    try {
      for (var d = 0; d < snapshot.deletedKeys.length; d++) {
        var deletedKey = snapshot.deletedKeys[d];
        if (isDashboardScope && deletedKey === GM_STORE_PREFIX + IMT_CONFIG_KEY) continue;
        if (localStorage.getItem(deletedKey) !== null) { localStorage.removeItem(deletedKey); changed++; }
      }
      for (var key in snapshot.values) {
        var nextValue = snapshot.values[key];
        if (isDashboardScope && key === GM_STORE_PREFIX + IMT_CONFIG_KEY) {
          if (!dashboardConfigPatch) continue;
          committedConfig = _mergeDashboardConfigPatch(dashboardConfigState.value, dashboardConfigPatch, 0);
          if (dashboardConfigState.value.generalRule || dashboardConfigPatch.generalRule) committedConfig = this._withHostScopeConfig(committedConfig);
          nextValue = JSON.stringify(committedConfig);
        }
        if (localStorage.getItem(key) !== nextValue) {
          localStorage.setItem(key, nextValue); changed++;
          if (key === GM_STORE_PREFIX + IMT_CONFIG_KEY) configChanged = true;
        }
      }
    } catch (e) {
      for (var rollbackKey in before) {
        try { if (before[rollbackKey] === null) localStorage.removeItem(rollbackKey); else localStorage.setItem(rollbackKey, before[rollbackKey]); } catch (e2) {}
      }
      new obsidian.Notice("同步失败：本地存储未完成写入");
      return null;
    }
    if (configChanged) {
      this._refreshUserscriptRuntime(committedConfig || _gmGetConfig(), true, dashboardConfigState && dashboardConfigState.value);
      this._pushConfigToDashboard(committedConfig || _gmGetConfig());
    } else if (changed > 0) this._notifyUserscriptConfigChange();
    if (!this._isActiveSyncGeneration(generation)) return null;
    if (snapshot.skipped > 0) console.warn("[IMT-Extended] Skipped " + snapshot.skipped + " unsafe or oversized sync entries");
    if (changed > 0) new obsidian.Notice(isDashboardScope ? "已同步 " + changed + " 项账户或高级设置" : "已导入 " + changed + " 项安全配置");
    else if (snapshot.skipped === 0) new obsidian.Notice(isDashboardScope ? "账户与高级设置已是最新" : "配置已是最新");
    this._ackSyncSnapshot(snapshot.hash, generation);
    return changed > 0;
  };

  IMTExtendedPluginClass.prototype._queueSyncSnapshot = function (snapshot, generation) {
    if (generation === undefined) generation = this._syncGeneration;
    if (!this._isActiveSyncGeneration(generation)) return Promise.resolve(false);
    if (snapshot.hash === this._lastSyncHash) { this._ackSyncSnapshot(snapshot.hash, generation); return Promise.resolve(false); }
    var pluginInstance = this;
    this._syncApplyChain = this._syncApplyChain.catch(function () {}).then(function () {
      if (!pluginInstance._isActiveSyncGeneration(generation)) return false;
      if (snapshot.hash === pluginInstance._lastSyncHash) { pluginInstance._ackSyncSnapshot(snapshot.hash, generation); return false; }
      return Promise.resolve(pluginInstance._commitSyncSnapshot(snapshot, generation)).then(function (result) {
        if (result !== null) pluginInstance._lastSyncHash = snapshot.hash;
        return result === true;
      });
    });
    return this._syncApplyChain;
  };

  IMTExtendedPluginClass.prototype._applySyncData = function (dataStr, generation, scopeOverride) {
    if (generation === undefined) generation = this._syncGeneration;
    if (!this._isActiveSyncGeneration(generation)) return Promise.resolve(false);
    var snapshot;
    try { snapshot = this._prepareSyncSnapshot(dataStr, scopeOverride); } catch (e) { console.warn("[IMT-Extended] Sync rejected:", e); new obsidian.Notice("同步失败：配置格式或校验无效"); return Promise.resolve(false); }
    return this._queueSyncSnapshot(snapshot, generation);
  };

  IMTExtendedPluginClass.prototype._syncDashboardConfig = async function () {
    if (!this._dashboardWindow || this._dashboardWindow.isDestroyed()) { new obsidian.Notice("请先打开 Dashboard"); return false; }
    var dashboardWindow = this._dashboardWindow; var generation = this._syncGeneration;
    try {
      var d = await dashboardWindow.webContents.executeJavaScript("(function(){try{return window.__imt_sync_data||(window.__imt_build_sync_snapshot?JSON.stringify(window.__imt_build_sync_snapshot()):null)}catch(e){return null}})()");
      if (!this._isActiveSyncGeneration(generation) || this._dashboardWindow !== dashboardWindow) return false;
      if (!d) { new obsidian.Notice("请先在 Dashboard 中点击「同步到 Obsidian」"); return false; }
      return await this._applySyncData(d, generation, SYNC_SCOPE_DASHBOARD);
    } catch (e) { new obsidian.Notice("同步失败"); return false; }
  };

  // Export uses the same bounded, redacted envelope as Dashboard sync so a copied file cannot become an unbounded credential dump.
  IMTExtendedPluginClass.prototype._exportConfig = function () {
    var candidates = [];
    for (var i = 0; i < localStorage.length; i++) {
      var key = localStorage.key(i); var normalizedKey = _normalizeSyncKey(key);
      if (!normalizedKey) continue;
      var serialized = _serializeSafeSyncValue(normalizedKey, localStorage.getItem(key));
      if (serialized === null) continue;
      candidates.push({ normalizedKey: normalizedKey, sourceKey: String(key), serialized: serialized, priority: String(key) === normalizedKey ? 0 : 1 });
    }
    candidates.sort(function (a, b) {
      return a.normalizedKey < b.normalizedKey ? -1 : a.normalizedKey > b.normalizedKey ? 1 : a.priority - b.priority || (a.sourceKey < b.sourceKey ? -1 : a.sourceKey > b.sourceKey ? 1 : 0);
    });
    var values = {}; var totalBytes = 0;
    for (var c = 0; c < candidates.length; c++) {
      var candidate = candidates[c];
      if (values[candidate.normalizedKey] !== undefined) continue;
      if (Object.keys(values).length >= SYNC_MAX_KEYS || totalBytes + candidate.serialized.length > SYNC_MAX_TOTAL_BYTES) continue;
      values[candidate.normalizedKey] = candidate.serialized;
      totalBytes += candidate.serialized.length;
    }
    var envelope = { version: 1, scope: SYNC_SCOPE_PORTABLE, revision: "export-" + Date.now(), values: values, deletedKeys: [], hash: _hashSyncPayload(values, []) };
    return JSON.stringify(envelope, null, 2);
  };

  IMTExtendedPluginClass.prototype._importConfig = async function (jsonStr) {
    try {
      var snapshot = this._prepareSyncSnapshot(jsonStr);
      if (Object.keys(snapshot.values).length === 0 && snapshot.deletedKeys.length === 0) { new obsidian.Notice("未找到有效配置"); return false; }
      return await this._queueSyncSnapshot(snapshot);
    } catch (e) { new obsidian.Notice("导入失败：JSON 格式、大小或校验无效"); return false; }
  };

  IMTExtendedPluginClass.prototype._detectAndHandleConflicts = function () {
    try {
      var plugins = this.app.plugins;
      var hasI18N = !!(plugins && plugins.plugins && plugins.plugins[I18N_PLUGIN_ID]);
      var hasStandalone = this._hasStandaloneConflict();
      var conflicts = []; var actions = [];
      if (hasI18N) {
        conflicts.push("I18N");
        if (this.settings.disableI18NImt) { this._disableI18NImtModule(); actions.push("已按设置屏蔽 I18N 模块。"); }
        else actions.push("已保留 I18N 模块。");
      }
      if (hasStandalone) {
        conflicts.push("Immersive Translate");
        if (this.settings.disableStandaloneImt) { this._disableStandaloneImt(); actions.push("已按设置屏蔽独立插件。"); }
        else { this._restoreStandaloneImt(false); actions.push("已保留独立插件。"); }
      }
      if (conflicts.length > 0 && !this.settings.shownConflictWarning) { this._showConflictNotice(conflicts, actions); this.settings.shownConflictWarning = true; this.saveSettings(); }
    } catch (e) { console.warn("[IMT-Extended] Conflict detection error:", e); }
  };

  IMTExtendedPluginClass.prototype._disableI18NImtModule = function () {
    try {
      var p = this.app.plugins && this.app.plugins.plugins ? this.app.plugins.plugins[I18N_PLUGIN_ID] : null;
      if (!p || !p.settings || typeof p.settings.modeImt !== "boolean") return false;
      if (!this._i18nConflictState) this._i18nConflictState = { plugin: p, originalMode: p.settings.modeImt, expectedMode: p.settings.modeImt, changed: false };
      var state = this._i18nConflictState;
      if (state.changed && p.settings.modeImt !== state.expectedMode) { this._i18nConflictState = null; this._i18nDisabled = false; return false; }
      if (p.settings.modeImt === true) {
        p.settings.modeImt = false; state.expectedMode = false; state.changed = true; this._i18nDisabled = true;
        _persistConflictPluginSettings(p);
        this._removeConflictingBalls();
      }
      return state.changed;
    } catch (e) { console.warn("[IMT-Extended] Failed to disable I18N module:", e); return false; }
  };

  IMTExtendedPluginClass.prototype._isStandaloneEnabled = function () {
    var plugins = this.app.plugins || {};
    if (plugins.enabledPlugins && typeof plugins.enabledPlugins.has === "function") return plugins.enabledPlugins.has(IMT_STANDALONE_ID);
    return !!(plugins.plugins && plugins.plugins[IMT_STANDALONE_ID]);
  };

  IMTExtendedPluginClass.prototype._hasStandaloneConflict = function () {
    var coordinator = _peekStandaloneCoordinator();
    return this._isStandaloneEnabled() || !!(coordinator && coordinator.state);
  };

  // One shared coordinator keeps rapid toggles and overlapping plugin instances on the same transition chain.
  IMTExtendedPluginClass.prototype._reconcileStandaloneTransition = async function (coordinator, state) {
    if (coordinator.state !== state) return false;
    var changed = false;
    while (coordinator.state === state) {
      var pluginInstance = coordinator.actor || this;
      var plugins = pluginInstance.app.plugins || {};
      var desiredDisabled = coordinator.desiredDisabled;
      var enabled = pluginInstance._isStandaloneEnabled();
      if (state.changed && enabled !== state.expectedEnabled) {
        _clearStandaloneCoordinator(coordinator, state);
        return changed;
      }

      if (desiredDisabled) {
        if (!enabled) {
          if (state.changed) return changed;
          _clearStandaloneCoordinator(coordinator, state);
          return changed;
        }
        if (typeof plugins.disablePlugin !== "function") return changed;
        try {
          await Promise.resolve(plugins.disablePlugin(IMT_STANDALONE_ID));
          state.changed = true; state.expectedEnabled = false;
          pluginInstance._removeConflictingBalls(); changed = true;
        } catch (e) {
          console.warn("[IMT-Extended] Failed to disable standalone Immersive Translate:", e);
          return changed;
        }
      } else {
        if (!state.changed || !state.originallyEnabled) {
          _clearStandaloneCoordinator(coordinator, state);
          return changed;
        }
        if (enabled) {
          _clearStandaloneCoordinator(coordinator, state);
          return changed;
        }
        if (typeof plugins.enablePlugin !== "function") return changed;
        try {
          await Promise.resolve(plugins.enablePlugin(IMT_STANDALONE_ID));
          state.expectedEnabled = true; changed = true;
        } catch (e) {
          console.warn("[IMT-Extended] Failed to restore standalone Immersive Translate:", e);
          return changed;
        }
      }

      if (desiredDisabled === coordinator.desiredDisabled) {
        if (!desiredDisabled) {
          _clearStandaloneCoordinator(coordinator, state);
          return changed;
        }
        return changed;
      }
    }
    return changed;
  };

  IMTExtendedPluginClass.prototype._queueStandaloneTransition = function (desiredDisabled) {
    var coordinator = _getStandaloneCoordinator();
    var plugins = this.app.plugins || {};
    coordinator.actor = this; coordinator.desiredDisabled = desiredDisabled;
    if (desiredDisabled && !coordinator.state) {
      if (typeof plugins.disablePlugin !== "function" || !this._isStandaloneEnabled()) {
        _clearStandaloneCoordinator(coordinator, null);
        return Promise.resolve(false);
      }
      coordinator.state = { originallyEnabled: true, expectedEnabled: true, changed: false };
    }
    var state = coordinator.state;
    if (!state) {
      _clearStandaloneCoordinator(coordinator, null);
      return Promise.resolve(false);
    }
    var pluginInstance = this;
    var transition = Promise.resolve(coordinator.chain).catch(function () {}).then(function () {
      return pluginInstance._reconcileStandaloneTransition(coordinator, state);
    });
    coordinator.chain = transition.catch(function () {});
    return transition;
  };

  IMTExtendedPluginClass.prototype._disableStandaloneImt = function () {
    return this._queueStandaloneTransition(true);
  };

  IMTExtendedPluginClass.prototype._restoreI18NImtModule = function () {
    var state = this._i18nConflictState;
    if (!state) return false;
    this._i18nConflictState = null; this._i18nDisabled = false;
    var p = this.app.plugins && this.app.plugins.plugins ? this.app.plugins.plugins[I18N_PLUGIN_ID] : null;
    if (!state.changed || !p || !p.settings || p.settings.modeImt !== state.expectedMode) return false;
    if (state.originalMode === undefined) delete p.settings.modeImt; else p.settings.modeImt = state.originalMode;
    _persistConflictPluginSettings(p);
    return true;
  };

  IMTExtendedPluginClass.prototype._restoreStandaloneImt = function (force) {
    if (!force && this.settings.disableStandaloneImt) return Promise.resolve(false);
    return this._queueStandaloneTransition(false);
  };

  IMTExtendedPluginClass.prototype._restoreConflictState = function () {
    try { this._restoreI18NImtModule(); } catch (e) { console.warn("[IMT-Extended] Failed to restore I18N state:", e); }
    try { this._restoreStandaloneImt(true).catch(function () {}); } catch (e) { console.warn("[IMT-Extended] Failed to restore standalone state:", e); }
  };

  IMTExtendedPluginClass.prototype._removeConflictingBalls = function () {
    try {
      var i18nMenuItems = document.querySelectorAll("#immersive-translate-menu .imt-menu-item");
      if (i18nMenuItems.length > 0) {
        var menu = document.getElementById("immersive-translate-menu");
        if (menu) {
          var ball = menu.closest("#immersive-translate-ball");
          if (ball && ball.parentNode) ball.parentNode.removeChild(ball);
        }
      }
    } catch (e) {}
  };

  IMTExtendedPluginClass.prototype._showConflictNotice = function (conflicts, actions) {
    var pluginInstance = this;
    var detectedConflicts = Array.isArray(conflicts) ? conflicts.slice() : [];
    var n = document.createElement("div");
    n.id = "imt-conflict-notice";
    var title = document.createElement("h4");
    title.textContent = "沉浸式翻译延伸版 - 冲突检测";
    var detected = document.createElement("p");
    detected.textContent = "检测到：" + (conflicts || []).join("、");
    var action = document.createElement("p");
    action.textContent = (actions || []).join(" ");
    n.appendChild(title);
    n.appendChild(detected);
    n.appendChild(action);
    var explanation = document.createElement("p");
    explanation.textContent = "";
    n.appendChild(explanation);
    var buttons = document.createElement("div");
    var sessionButton = document.createElement("button");
    sessionButton.textContent = "本次暂停冲突项";
    sessionButton.addEventListener("click", function () {
      sessionButton.disabled = true;
      var pending = [];
      var queuePause = function (label, callback) {
        pending.push(Promise.resolve().then(callback).then(function (applied) {
          return { label: label, applied: applied !== false };
        }).catch(function () { return { label: label, applied: false }; }));
      };
      if (detectedConflicts.indexOf("I18N") >= 0) queuePause("I18N", function () { return pluginInstance._disableI18NImtModule(); });
      if (detectedConflicts.indexOf("Immersive Translate") >= 0) queuePause("Immersive Translate", function () { return pluginInstance._disableStandaloneImt(); });
      Promise.all(pending).then(function (results) {
        var failed = results.filter(function (result) { return !result.applied; }).map(function (result) { return result.label; });
        if (failed.length === 0 && results.length > 0) {
          action.textContent = "本次会话已暂停所选冲突能力；卸载或重启本插件时会恢复本插件实际修改的状态。";
          return;
        }
        action.textContent = "未能暂停：" + (failed.length > 0 ? failed.join("、") : "未识别的冲突项") + "。请在插件设置中检查状态。";
        sessionButton.disabled = false;
      });
    });
    buttons.appendChild(sessionButton);
    var helpButton = document.createElement("button");
    helpButton.textContent = "查看说明";
    helpButton.addEventListener("click", function () {
      explanation.textContent = "本次暂停只作用于当前插件会话；持续选择可在“设置 → 沉浸式翻译延伸版 → 冲突处理”中调整。";
    });
    buttons.appendChild(helpButton);
    var keepButton = document.createElement("button");
    keepButton.textContent = "保持现状";
    keepButton.addEventListener("click", function () { n.remove(); });
    buttons.appendChild(keepButton);
    n.appendChild(buttons);
    document.body.appendChild(n); setTimeout(function () { if (n.parentNode) n.remove(); }, 15000);
  };

  IMTExtendedPluginClass.prototype._emitUserscriptStorageChange = function (key, oldValue, newValue, remote) {
    var same = false;
    try { same = JSON.stringify(oldValue) === JSON.stringify(newValue); } catch (e) { same = oldValue === newValue; }
    if (same) return false;
    for (var id in this._gmValueChangeListeners) {
      var listener = this._gmValueChangeListeners[id];
      if (!listener || listener.key !== key) continue;
      try { listener.callback(key, oldValue, newValue, !!remote); } catch (e) {}
    }
    var changes = {}; changes[key] = { oldValue: oldValue, newValue: newValue };
    var storageListeners = this._browserStorageChangeListeners.slice();
    for (var i = 0; i < storageListeners.length; i++) {
      try { storageListeners[i](changes, "local"); } catch (e) {}
    }
    if (key === IMT_CONFIG_KEY && newValue && typeof newValue === "object") this._pushConfigToDashboard(newValue);
    return true;
  };

  IMTExtendedPluginClass.prototype._installGMPolyfill = function () {
    if (this._gmPolyfillsInstalled) return;
    this._gmPolyfillsInstalled = true;
    var pluginInstance = this; var _requestUrl = obsidian.requestUrl;
    var _gmXmlHttpRequest = function (opts) {
      opts = opts || {};
      var parsedUrl = _parseHttpUrl(opts.url); var settled = false; var timeoutId = null;
      var method = String(opts.method || "GET").toUpperCase(); var headers = _headersToObject(opts.headers);
      var baseResponse = { status: 0, statusText: "", responseText: "", response: null, responseHeaders: "", finalUrl: parsedUrl ? parsedUrl.href : String(opts.url || ""), readyState: 1, context: opts.context };

      var invoke = function (name, payload) { try { if (typeof opts[name] === "function") opts[name](payload); } catch (e) { console.error("[IMT-Extended] GM callback failed:", e); } };
      var finish = function (name, payload) {
        if (settled) return; settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        payload.readyState = 4;
        invoke("onreadystatechange", payload);
        invoke(name, payload);
      };
      var fail = function (name, error) {
        var payload = Object.assign({}, baseResponse, { error: error, statusText: error && error.message ? error.message : String(error || "Request failed") });
        finish(name, payload);
      };

      if (!parsedUrl) {
        Promise.resolve().then(function () { fail("onerror", new TypeError("GM_xmlhttpRequest only supports absolute HTTP(S) URLs")); });
        return { abort: function () {} };
      }

      var authToken = pluginInstance._getAuthToken();
      var hasExplicitAuth = _hasHeader(headers, "token") || _hasHeader(headers, "authorization") || _hasHeader(headers, "cookie");
      if (!hasExplicitAuth && authToken && _shouldAttachImtAuthToken(parsedUrl)) {
        headers.token = authToken;
      } else if (!hasExplicitAuth) {
        var authCookies = pluginInstance._getAuthCookies();
        if (authCookies && _shouldAttachImtCookies(parsedUrl)) headers.Cookie = authCookies;
      }
      invoke("onloadstart", baseResponse); invoke("onreadystatechange", baseResponse);

      var timeout = Number(opts.timeout);
      if (Number.isFinite(timeout) && timeout > 0) {
        timeoutId = setTimeout(function () { fail("ontimeout", new Error("Network request timeout")); }, timeout);
      }

      Promise.resolve()
        .then(function () { return _serializeRequestBody(opts.data, method, headers); })
        .then(function (body) {
          if (settled) return null;
          return _requestUrl({ url: parsedUrl.href, method: method, headers: headers, body: body, throw: false });
        })
        .then(function (resp) {
          if (settled || !resp) return;
          var responseHeaders = resp.headers || {};
          var text = typeof resp.text === "string" ? resp.text : (typeof resp.json === "object" && resp.json !== null ? JSON.stringify(resp.json) : "");
          var arrayBuffer = resp.arrayBuffer instanceof ArrayBuffer ? resp.arrayBuffer : _encodeUtf8(text).buffer;
          var responseType = String(opts.responseType || "text").toLowerCase(); var response = text;
          if (responseType === "arraybuffer") response = arrayBuffer;
          else if (responseType === "blob") response = new Blob([arrayBuffer], { type: _getResponseHeader(responseHeaders, "content-type") || "application/octet-stream" });
          else if (responseType === "json") response = typeof resp.json === "object" && resp.json !== null ? resp.json : JSON.parse(text || "null");
          else if (responseType === "document") {
            var mime = _getResponseHeader(responseHeaders, "content-type").toLowerCase().indexOf("html") >= 0 ? "text/html" : "application/xml";
            response = typeof DOMParser !== "undefined" ? new DOMParser().parseFromString(text, mime) : text;
          }
          var payload = {
            status: resp.status || 0,
            statusText: resp.status >= 200 && resp.status < 300 ? "OK" : "",
            responseText: responseType === "text" || responseType === "" ? text : "",
            response: resp.status === 204 ? undefined : response,
            responseHeaders: _responseHeadersToString(responseHeaders),
            finalUrl: parsedUrl.href,
            readyState: 4,
            context: opts.context,
          };
          finish("onload", payload);
        })
        .catch(function (error) { fail("onerror", error); });

      return { abort: function () { fail("onabort", new Error("Network request aborted")); } };
    };
    var _gmOpenInTab = function (url) { if (_isImtUrl(url)) { pluginInstance._openDashboardWindow(url); return; } if (pluginInstance._originalWindowOpen) pluginInstance._originalWindowOpen.call(window, url, "_blank"); };
    var gmVersion = this._loadedUserscriptVersion || "0.0.0";
    var gmInfo = { script: { version: gmVersion, name: "Immersive Translate", namespace: "https://immersivetranslate.com", _isUserscript: true }, platform: "obsidian" };
    var gmGetValue = function (k, d) { try { var s = localStorage.getItem(GM_STORE_PREFIX + k); return s !== null ? JSON.parse(s) : d; } catch (e) { return d; } };
    var gmSetValue = function (k, v) { try { var key = String(k); var oldValue = gmGetValue(key); var nextValue = key === IMT_CONFIG_KEY ? pluginInstance._withHostScopeConfig(v) : v; localStorage.setItem(GM_STORE_PREFIX + key, JSON.stringify(nextValue)); pluginInstance._emitUserscriptStorageChange(key, oldValue, nextValue, false); } catch (e) {} };
    var gmDeleteValue = function (k) { try { var oldValue = gmGetValue(k); localStorage.removeItem(GM_STORE_PREFIX + k); pluginInstance._emitUserscriptStorageChange(String(k), oldValue, undefined, false); } catch (e) {} };
    var gmListValues = function () { var ks = []; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.startsWith(GM_STORE_PREFIX)) ks.push(k.slice(GM_STORE_PREFIX.length)); } return ks; };
    var gmAddValueChangeListener = function (k, callback) {
      if (typeof callback !== "function") return 0;
      var id = pluginInstance._nextGmValueChangeListenerId++;
      pluginInstance._gmValueChangeListeners[id] = { key: String(k), callback: callback };
      return id;
    };
    var gmRemoveValueChangeListener = function (id) { delete pluginInstance._gmValueChangeListeners[id]; };
    var gmAddStyle = function (c) { var s = document.createElement("style"); s.textContent = c; document.head.appendChild(s); pluginInstance._gmStyleElements.push(s); return s; };
    var gmRegisterMenuCommand = function () { return 0; };
    var gmAddElement = function () { return null; };
    var gmObject = { info: gmInfo, getValue: gmGetValue, setValue: gmSetValue, deleteValue: gmDeleteValue, listValues: gmListValues, addValueChangeListener: gmAddValueChangeListener, removeValueChangeListener: gmRemoveValueChangeListener, xmlHttpRequest: _gmXmlHttpRequest, addStyle: gmAddStyle, openInTab: _gmOpenInTab, registerMenuCommand: gmRegisterMenuCommand, addElement: gmAddElement };
    this._patchGlobal(window, "_imtGMPolyfillInstalled", true);
    this._patchGlobal(window, "GM_xmlhttpRequest", _gmXmlHttpRequest);
    this._patchGlobal(window, "GM_info", gmInfo);
    this._patchGlobal(window, "GM_getValue", gmGetValue);
    this._patchGlobal(window, "GM_setValue", gmSetValue);
    this._patchGlobal(window, "GM_deleteValue", gmDeleteValue);
    this._patchGlobal(window, "GM_listValues", gmListValues);
    this._patchGlobal(window, "GM_addValueChangeListener", gmAddValueChangeListener);
    this._patchGlobal(window, "GM_removeValueChangeListener", gmRemoveValueChangeListener);
    this._patchGlobal(window, "GM_addStyle", gmAddStyle);
    this._patchGlobal(window, "GM_openInTab", _gmOpenInTab);
    this._patchGlobal(window, "GM_registerMenuCommand", gmRegisterMenuCommand);
    this._patchGlobal(window, "GM_addElement", gmAddElement);
    this._patchGlobal(window, "GM", gmObject);
    var getAuthCookies = function () { return pluginInstance._getAuthCookies(); };
    this._patchGlobal(self, "_getAuthCookies", getAuthCookies);
    if (typeof self !== "undefined" && self !== window) {
      this._patchGlobal(self, "GM", gmObject); this._patchGlobal(self, "GM_getValue", gmGetValue); this._patchGlobal(self, "GM_setValue", gmSetValue); this._patchGlobal(self, "GM_xmlhttpRequest", _gmXmlHttpRequest);
    }
  };

  IMTExtendedPluginClass.prototype._installBrowserAPIPolyfill = function () {
    if (this._browserAPIPolyfillInstalled || (window.immersiveTranslateBrowserAPI && !window._imtBrowserAPIPolyfillInstalled)) return;
    this._browserAPIPolyfillInstalled = true;
    var pluginInstance = this;
    var Q8 = { get: async function (e) { if (e === null) { var r = await GM.listValues(); if (!Array.isArray(r)) r = Object.keys(r); var i = {}; for (var a of r) i[a] = await GM.getValue(a); return i; } var t = []; if (typeof e == "string") t = [e]; else if (Array.isArray(e)) t = e; else t = Object.keys(e); var n = {}; for (var r of t) n[r] = await GM.getValue(r); return n; }, set: async function (e) { for (var t in e) await GM.setValue(t, e[t]); }, remove: async function (e) { if (typeof e == "string") await GM.deleteValue(e); else if (Array.isArray(e)) for (var t of e) await GM.deleteValue(t); } };
    var storageOnChanged = {
      addListener: function (listener) { if (typeof listener === "function" && pluginInstance._browserStorageChangeListeners.indexOf(listener) < 0) pluginInstance._browserStorageChangeListeners.push(listener); },
      removeListener: function (listener) { pluginInstance._browserStorageChangeListeners = pluginInstance._browserStorageChangeListeners.filter(function (item) { return item !== listener; }); },
      hasListener: function (listener) { return pluginInstance._browserStorageChangeListeners.indexOf(listener) >= 0; },
    };
    var runtimeSendMessage = function () {
      var args = Array.prototype.slice.call(arguments); var message = null;
      for (var i = 0; i < args.length; i++) if (args[i] && typeof args[i] === "object") { message = args[i]; break; }
      message = message || {}; var method = message.method || message.type || message.action || ""; var data = message.data || {};
      if (method === "openPdfViewerPage") {
        var pdfUrl = data.pdfUrl || data.url || "";
        var opened = pluginInstance._openDocumentWorkspace({
          url: PDF_WORKSPACE_URL + "?file=" + encodeURIComponent(String(pdfUrl)),
          title: "PDF 翻译",
          file: null,
          spec: { kind: "pdf", title: "PDF 翻译", url: PDF_WORKSPACE_URL, autoHandoff: false, extensions: ["pdf"], maxBytes: 0 },
        });
        return Promise.resolve({ success: opened !== false, embedded: opened !== false });
      }
      if (method === "openOptionsPage") {
        var optionsOpened = pluginInstance._openDashboardWindow("https://dash.immersivetranslate.com/#general");
        return Promise.resolve({ success: optionsOpened !== false, embedded: optionsOpened !== false });
      }
      if (method === "openInTab" && _isImtUrl(data.url || data)) {
        var tabOpened = pluginInstance._openDashboardWindow(data.url || data);
        return Promise.resolve({ success: tabOpened !== false, embedded: tabOpened !== false });
      }
      return Promise.resolve({ success: false, error: "unsupported_message", type: method || "unknown" });
    };
    var browserAPI = { storage: { local: Q8, sync: Q8, onChanged: storageOnChanged }, runtime: { getManifest: function () { var userscriptVersion = pluginInstance._loadedUserscriptVersion || "0.0.0"; return { _isUserscript: true, version: userscriptVersion, _imtUserscriptVersion: userscriptVersion, _imtBridgeVersion: PLUGIN_VERSION }; }, lastError: null, ContextType: { TAB: "TAB", BACKGROUND: "BACKGROUND", POPUP: "POPUP", SIDE_PANEL: "SIDE_PANEL", OFFSCREEN_DOCUMENT: "OFFSCREEN_DOCUMENT" }, getContexts: function () { return [{ contextType: "TAB", documentId: "imt-main", documentOrigin: "https://dash.immersivetranslate.com", windowId: 1, tabId: 1 }]; }, openOptionsPage: function () { return pluginInstance._openDashboardWindow("https://dash.immersivetranslate.com/#general"); }, sendMessage: runtimeSendMessage, getURL: function (e) { return e; } }, i18n: { getAcceptLanguages: function () { return globalThis.navigator.languages || [globalThis.navigator.language || ""]; }, detectLanguage: async function () { return "auto"; } } };
    this._patchGlobal(window, "_imtBrowserAPIPolyfillInstalled", true);
    this._patchGlobal(window, "immersiveTranslateBrowserAPI", browserAPI);
  };

  IMTExtendedPluginClass.prototype._installGMFetchPolyfill = function () {
    if (this._gmFetchPolyfillInstalled) return;
    this._gmFetchPolyfillInstalled = true;
    var gmFetch = function (input, init) {
      return new Promise(async function (resolve, reject) {
        var request; var body; var requestHandle = null; var abortListener = null; var completed = false;
        var finish = function (callback, value) {
          if (completed) return; completed = true;
          if (abortListener && request && request.signal) request.signal.removeEventListener("abort", abortListener);
          callback(value);
        };
        try {
          request = input instanceof Request && init === undefined ? input : new Request(input, init || {});
          var method = request.method.toUpperCase(); var headers = _headersToObject(request.headers);
          if (method !== "GET" && method !== "HEAD") {
            if (init && Object.prototype.hasOwnProperty.call(init, "body")) {
              body = init.body;
              if (typeof FormData !== "undefined" && body instanceof FormData) {
                for (var key in headers) if (key.toLowerCase() === "content-type") delete headers[key];
              }
            } else if (input instanceof Request) {
              body = await input.clone().arrayBuffer();
            }
          }
          requestHandle = window.GM_xmlhttpRequest({
            method: method,
            url: request.url,
            headers: headers,
            data: body,
            responseType: "arraybuffer",
            timeout: Number((init && init.timeout) || input.timeout || 60000),
            onload: function (resp) {
              try {
                var responseHeaders = new Headers();
                String(resp.responseHeaders || "").split(/\r?\n/).forEach(function (line) {
                  var separator = line.indexOf(":");
                  if (separator > 0) responseHeaders.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
                });
                var responseBody = resp.status === 204 || resp.status === 205 || method === "HEAD" ? null : resp.response;
                finish(resolve, new Response(responseBody, { status: resp.status, statusText: resp.statusText || "", headers: responseHeaders }));
              } catch (e) { finish(reject, e); }
            },
            onerror: function () { finish(reject, new TypeError("Network request failed")); },
            ontimeout: function () { finish(reject, new TypeError("Network request timeout")); },
            onabort: function () { finish(reject, new DOMException("Network request aborted", "AbortError")); },
          });
          if (request.signal) {
            abortListener = function () { if (requestHandle && requestHandle.abort) requestHandle.abort(); };
            if (request.signal.aborted) abortListener();
            else request.signal.addEventListener("abort", abortListener, { once: true });
          }
        } catch (e) { finish(reject, e); }
      });
    };
    gmFetch._imtPolyfill = true;
    this._patchGlobal(globalThis, "GM_fetch", gmFetch);
    if (typeof self !== "undefined" && self !== globalThis) this._patchGlobal(self, "GM_fetch", gmFetch);
  };

  IMTExtendedPluginClass.prototype._buildSelectors = function (runtimeRule) {
    var rule = runtimeRule && typeof runtimeRule === "object" && !Array.isArray(runtimeRule) ? runtimeRule : {};
    var owned = Object.create(null);
    for (var h = 0; h < LEGACY_HOST_SELECTORS.length; h++) owned[LEGACY_HOST_SELECTORS[h]] = true;
    var cleanCustom = function (values, removeProtected) {
      var result = [];
      for (var i = 0; i < (values || []).length; i++) {
        var value = typeof values[i] === "string" ? values[i].trim() : "";
        if (!value || owned[value] || (removeProtected && PROTECTED_EDITOR_SELECTORS.indexOf(value) >= 0)) continue;
        result.push(value);
      }
      return result;
    };
    var sel = cleanCustom([].concat(this.settings.imtPagerule.selectors || [], rule.selectors || []), true);
    var exc = cleanCustom([].concat(this.settings.imtPagerule.excludeSelectors || [], rule.excludeSelectors || []), false);
    if (this.settings.uiTranslateEnabled) sel.push.apply(sel, UI_TRANSLATE_SELECTORS); else exc.push.apply(exc, UI_TRANSLATE_SELECTORS);
    // Translating CodeMirror DOM writes generated text back into the Markdown
    // document. This exclusion is a safety invariant, not a user preference.
    exc.push.apply(exc, PROTECTED_EDITOR_SELECTORS);
    if (this.settings.articleTranslateEnabled) sel.push(ARTICLE_TRANSLATE_SELECTOR); else exc.push(".markdown-reading-view", ".markdown-source-view");
    var unique = function (values) {
      var result = []; var seen = Object.create(null);
      for (var i = 0; i < values.length; i++) {
        var value = typeof values[i] === "string" ? values[i].trim() : "";
        if (!value || seen[value]) continue;
        seen[value] = true; result.push(value);
      }
      return result;
    };
    var excludeSelectors = unique(exc); var excluded = Object.create(null);
    for (var e = 0; e < excludeSelectors.length; e++) excluded[excludeSelectors[e]] = true;
    return { selectors: unique(sel).filter(function (value) { return !excluded[value]; }), excludeSelectors: excludeSelectors };
  };

  IMTExtendedPluginClass.prototype._withHostScopeConfig = function (current) {
    if (!current || typeof current !== "object" || Array.isArray(current)) current = {};
    var currentRule = current.generalRule && typeof current.generalRule === "object" && !Array.isArray(current.generalRule) ? current.generalRule : {};
    var selectors = this._buildSelectors(currentRule);
    return Object.assign({}, current, {
      generalRule: Object.assign({}, currentRule, { selectors: selectors.selectors, excludeSelectors: selectors.excludeSelectors }),
    });
  };

  IMTExtendedPluginClass.prototype._persistHostScopeConfig = function () {
    var state = _readGMConfigState();
    if (!state.valid) return null;
    var next = this._withHostScopeConfig(state.value);
    try {
      var nextRaw = JSON.stringify(next);
      if (state.raw !== nextRaw) localStorage.setItem(GM_STORE_PREFIX + IMT_CONFIG_KEY, nextRaw);
      return next;
    } catch (e) { return null; }
  };

  IMTExtendedPluginClass.prototype._getActiveTranslationState = function () {
    try {
      var state = document.documentElement && String(document.documentElement.getAttribute("imt-state") || "").trim();
      if (state === "dual" || state === "translation") return state;
      var popup = document.querySelector && document.querySelector("#immersive-translate-popup");
      if (popup && popup.shadowRoot && popup.shadowRoot.querySelector(".imt-fb-btn.active")) return "dual";
    } catch (e) {}
    return "";
  };

  IMTExtendedPluginClass.prototype._dispatchUserscriptMiniConfig = function (config) {
    if (!this._isEngineLoaded()) return false;
    var data = this._buildUserscriptMiniConfigData(config);
    try {
      document.dispatchEvent(new CustomEvent(DOCUMENT_REQUEST_EVENT, { detail: JSON.stringify({ id: "obsidian-config-" + Date.now(), type: "setMiniConfigAsync", data: data }) }));
      return true;
    } catch (e) { return false; }
  };

  IMTExtendedPluginClass.prototype._buildUserscriptMiniConfigData = function (config) {
    var source = config && typeof config === "object" ? config : _gmGetConfig();
    var data = { triggerSource: "obsidianHost" };
    for (var i = 0; i < MINI_CONFIG_KEYS.length; i++) {
      var key = MINI_CONFIG_KEYS[i];
      if (source[key] !== undefined && source[key] !== null) data[key] = source[key];
    }
    if (Object.keys(data).length === 1) data.targetLanguage = _normalizeTargetLanguage(source.translationTargetLanguage) || DEFAULT_TARGET_LANGUAGE;
    return data;
  };

  IMTExtendedPluginClass.prototype._dispatchUserscriptThemeConfig = function (config) {
    if (!this._isEngineLoaded()) return false;
    var data = this._buildUserscriptThemeConfigData(config);
    try {
      document.dispatchEvent(new CustomEvent(DOCUMENT_REQUEST_EVENT, { detail: JSON.stringify({ id: "obsidian-theme-" + Date.now(), type: "updateTranslationThemeConfig", data: data }) }));
      return true;
    } catch (e) { return false; }
  };

  IMTExtendedPluginClass.prototype._dispatchUserscriptTranslationMode = function (mode) {
    if (!this._isEngineLoaded() || (mode !== "dual" && mode !== "translation")) return false;
    var data = { translationMode: mode, remember: false, triggerSource: "obsidianHost" };
    try {
      document.dispatchEvent(new CustomEvent(DOCUMENT_REQUEST_EVENT, {
        detail: JSON.stringify({ id: "obsidian-mode-" + Date.now() + "-" + (++this._userscriptRequestSequence), type: "switchTranslationMode", data: data }),
      }));
      return true;
    } catch (e) { return false; }
  };

  IMTExtendedPluginClass.prototype._waitForUserscriptTranslationState = function (state, runtimeSequence) {
    var pluginInstance = this; var deadline = Date.now() + 750;
    return new Promise(function (resolve) {
      var check = function () {
        if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) { resolve(false); return; }
        var current = "";
        try { current = String(document.documentElement && document.documentElement.getAttribute("imt-state") || "").trim(); } catch (e) {}
        if (current === state) { resolve(true); return; }
        if (Date.now() >= deadline) { resolve(false); return; }
        pluginInstance._scheduleTimeout(check, 25);
      };
      check();
    });
  };

  IMTExtendedPluginClass.prototype._buildUserscriptThemeConfigData = function (config) {
    var source = config && typeof config === "object" ? config : _gmGetConfig();
    var data = { triggerSource: "obsidianHost" };
    var themeKeys = ["translationTheme", "translationThemePatterns", "selectTranslationFont"];
    for (var i = 0; i < themeKeys.length; i++) {
      var key = themeKeys[i];
      if (source[key] !== undefined && source[key] !== null) data[key] = source[key];
    }
    return data;
  };

  IMTExtendedPluginClass.prototype._buildUserscriptPageTranslationData = function (config) {
    var source = config && typeof config === "object" ? config : _gmGetConfig();
    var data = { trigger: "config_change", triggerSource: "obsidianHost" };
    if (typeof source.targetLanguage === "string" && source.targetLanguage) data.targetLanguage = source.targetLanguage;
    if (typeof source.translationService === "string" && source.translationService) data.translationService = source.translationService;
    if (source.translationMode === "dual" || source.translationMode === "translation") data.translationMode = source.translationMode;
    return data;
  };

  IMTExtendedPluginClass.prototype._requestUserscriptDocumentMessage = function (type, data) {
    if (!this._isEngineLoaded()) return Promise.resolve(false);
    var requestId = "obsidian-runtime-" + Date.now() + "-" + (++this._userscriptRequestSequence);
    if (typeof document.addEventListener !== "function" || typeof document.removeEventListener !== "function") {
      try {
        document.dispatchEvent(new CustomEvent(DOCUMENT_REQUEST_EVENT, { detail: JSON.stringify({ id: requestId, type: type, data: data }) }));
        return Promise.resolve(true);
      } catch (e) { return Promise.resolve(false); }
    }
    return new Promise(function (resolve) {
      var settled = false; var timeoutId = null;
      var finish = function (result) {
        if (settled) return; settled = true;
        if (timeoutId) clearTimeout(timeoutId);
        try { document.removeEventListener(DOCUMENT_RESPONSE_EVENT, onResponse); } catch (e) {}
        resolve(result);
      };
      var onResponse = function (event) {
        try {
          var response = typeof event.detail === "string" ? JSON.parse(event.detail) : event.detail;
          if (!response || response.id !== requestId || response.type !== type) return;
          var payload = response.payload;
          var rejected = payload && typeof payload === "object" &&
            (payload.success === false || payload.ok === false || payload.error);
          finish(!rejected);
        } catch (e) {}
      };
      try {
        document.addEventListener(DOCUMENT_RESPONSE_EVENT, onResponse);
        timeoutId = setTimeout(function () { finish(false); }, 750);
        document.dispatchEvent(new CustomEvent(DOCUMENT_REQUEST_EVENT, { detail: JSON.stringify({ id: requestId, type: type, data: data }) }));
      } catch (e) { finish(false); }
    });
  };

  IMTExtendedPluginClass.prototype._syncUserscriptRuntimeConfig = function (config, previousConfig) {
    if (!this._isEngineLoaded()) return Promise.resolve(false);
    var pluginInstance = this; var miniConfigApplied = false;
    var baseline = previousConfig && typeof previousConfig === "object" ? previousConfig : config;
    return this._requestUserscriptDocumentMessage("setMiniConfigAsync", this._buildUserscriptMiniConfigData(config)).then(function (applied) {
      miniConfigApplied = applied !== false;
      return pluginInstance._requestUserscriptDocumentMessage("updateTranslationThemeConfig", pluginInstance._buildUserscriptThemeConfigData(baseline));
    }).then(function (themeProtocolAvailable) {
      if (!themeProtocolAvailable) return false;
      return pluginInstance._requestUserscriptDocumentMessage("updateTranslationThemeConfig", pluginInstance._buildUserscriptThemeConfigData(config));
    }).then(function (themeApplied) { return miniConfigApplied || themeApplied === true; }).catch(function () { return miniConfigApplied; });
  };

  IMTExtendedPluginClass.prototype._applyUserscriptTranslationInputChange = function (config, change, activeState, runtimeSequence) {
    if (!change || (!change.targetLanguageChanged && !change.translationServiceChanged)) return Promise.resolve(false);
    var pluginInstance = this; var contextReady = Promise.resolve(true);
    if (this._isUnloaded || runtimeSequence !== this._configRuntimeSequence) return Promise.resolve(false);
    var targetLanguage = _normalizeTargetLanguage(config && config.targetLanguage);
    if (targetLanguage) {
      contextReady = this._requestUserscriptDocumentMessage(OBSIDIAN_HOST_UPDATE_TARGET_LANGUAGE_MESSAGE, {
        targetLanguage: targetLanguage,
        hasPageTranslationStarted: !!activeState,
      });
    } else if (change.targetLanguageChanged) return Promise.resolve(false);
    return Promise.resolve(contextReady).then(function (applied) {
      if (applied === false) return false;
      if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return false;
      if (!activeState) return true;
      return pluginInstance._requestUserscriptDocumentMessage(
        OBSIDIAN_HOST_TRANSLATE_PAGE_MESSAGE,
        pluginInstance._buildUserscriptPageTranslationData(config)
      );
    }).catch(function () { return false; });
  };

  IMTExtendedPluginClass.prototype._refreshUserscriptRuntime = function (config, retranslate, previousConfig) {
    this._applyRuntimeConfig();
    this._notifyUserscriptConfigChange();
    var pluginInstance = this; var runtimeSequence = ++this._configRuntimeSequence;
    if (this._configReplayTimer) { clearTimeout(this._configReplayTimer); this._configReplayTimer = null; }
    var change = _classifyUserscriptConfigChange(config, previousConfig);
    var activeState = retranslate || change.modeChanged ? this._getActiveTranslationState() : "";
    var replayState = change.modeChanged && change.nextMode ? change.nextMode : activeState;
    var translationInputsChanged = change.targetLanguageChanged || change.translationServiceChanged;
    var shouldRetranslate = !!retranslate && change.effect === "retranslate" && !translationInputsChanged;
    var repaintTheme = function () {
      if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return Promise.resolve(false);
      var themeData = pluginInstance._buildUserscriptThemeConfigData(config);
      if (Object.keys(themeData).length <= 1) return Promise.resolve(false);
      return Promise.resolve(pluginInstance._requestUserscriptDocumentMessage("updateTranslationThemeConfig", themeData)).catch(function () { return false; });
    };
    var replay = function () {
      if (!replayState || typeof window.immersiveTranslateSwitchTranslateState !== "function") return;
      if (pluginInstance._configReplayTimer) clearTimeout(pluginInstance._configReplayTimer);
      pluginInstance._configReplayTimer = setTimeout(function () {
        pluginInstance._configReplayTimer = null;
        if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return;
        try {
          var replayResult = window.immersiveTranslateSwitchTranslateState(replayState);
          Promise.resolve(replayResult).catch(function () { return false; }).then(repaintTheme);
        } catch (e) { repaintTheme(); }
      }, 50);
    };
    var restoreAndReplay = function () {
      if (!activeState || typeof window.immersiveTranslateSwitchTranslateState !== "function") return;
      try { Promise.resolve(window.immersiveTranslateSwitchTranslateState("original")).catch(function () {}).then(replay); }
      catch (e) { replay(); }
    };
    var applyVisibleState = function () {
      if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return Promise.resolve(false);
      if (translationInputsChanged) {
        return pluginInstance._applyUserscriptTranslationInputChange(config, change, activeState, runtimeSequence).then(function (applied) {
          if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return;
          if (!applied) { restoreAndReplay(); return; }
          if (change.modeChanged && activeState && replayState && replayState !== activeState) {
            if (!pluginInstance._dispatchUserscriptTranslationMode(replayState)) { replay(); return; }
            pluginInstance._waitForUserscriptTranslationState(replayState, runtimeSequence).then(function (matched) {
              if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return;
              if (matched) repaintTheme(); else replay();
            });
            return;
          }
          if (activeState) repaintTheme();
        });
      }
      if (shouldRetranslate) { restoreAndReplay(); return Promise.resolve(true); }
      if (!activeState) return Promise.resolve(true);
      if (!change.modeChanged || !replayState || replayState === activeState) return Promise.resolve(true);
      if (!pluginInstance._dispatchUserscriptTranslationMode(replayState)) { replay(); return Promise.resolve(false); }
      return pluginInstance._waitForUserscriptTranslationState(replayState, runtimeSequence).then(function (matched) {
        if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return;
        if (matched) repaintTheme(); else replay();
      });
    };
    this._configRuntimeChain = Promise.resolve(this._configRuntimeChain).catch(function () { return false; }).then(function () {
      if (pluginInstance._isUnloaded || runtimeSequence !== pluginInstance._configRuntimeSequence) return false;
      return Promise.resolve(pluginInstance._syncUserscriptRuntimeConfig(config, previousConfig)).catch(function () { return false; }).then(applyVisibleState);
    });
    return true;
  };

  IMTExtendedPluginClass.prototype._setTranslationScopeSetting = async function (key, value) {
    if (key !== "uiTranslateEnabled" && key !== "articleTranslateEnabled") return false;
    var previous = this.settings[key]; this.settings[key] = !!value;
    try {
      var persisted = await this.saveSettings();
      if (persisted === false) throw new Error("saveSettings returned false");
    } catch (e) {
      this.settings[key] = previous;
      new obsidian.Notice("翻译范围保存失败，已保留原设置");
      return false;
    }
    var previousConfigState = _readGMConfigState();
    var config = this._persistHostScopeConfig();
    if (!config) {
      new obsidian.Notice("翻译范围已保存，但运行时配置无法读取；请重启 Obsidian 后重试");
      return false;
    }
    this._refreshUserscriptRuntime(config || {}, true, previousConfigState.valid ? previousConfigState.value : null);
    this._pushConfigToDashboard(config || undefined);
    new obsidian.Notice("翻译范围已实时更新");
    return true;
  };

  IMTExtendedPluginClass.prototype._createTranslationViewController = function () {
    var pluginInstance = this;
    return {
      getActiveView: function () {
        var workspace = pluginInstance.app && pluginInstance.app.workspace;
        if (!workspace || typeof workspace.getActiveViewOfType !== "function" || typeof obsidian.MarkdownView !== "function") return null;
        return workspace.getActiveViewOfType(obsidian.MarkdownView);
      },
      getMode: function (view) {
        return view && typeof view.getMode === "function" ? view.getMode() : "";
      },
      isConnected: function (view) {
        return !!(view && view.containerEl && view.containerEl.isConnected !== false);
      },
      isReadingReady: function (view) {
        return !!(view && typeof view.getMode === "function" && view.getMode() === "preview" &&
          view.previewMode && view.previewMode.containerEl && view.previewMode.containerEl.isConnected !== false);
      },
      enterReading: function (view) {
        var leaf = view && view.leaf;
        if (!leaf || typeof leaf.getViewState !== "function" || typeof leaf.setViewState !== "function") return null;
        var original = leaf.getViewState();
        if (!original || !original.state || typeof original.state !== "object") return null;
        var hadSourceMode = Object.prototype.hasOwnProperty.call(original.state, "source");
        var originalSourceMode = original.state.source;
        var readingState = Object.assign({}, original, { state: Object.assign({}, original.state, { mode: "preview" }) });
        var readingTransition = leaf.setViewState(readingState);
        if (readingTransition && typeof readingTransition.catch === "function") readingTransition.catch(function () {});
        return {
          restore: function () {
            var currentLeaf = view && view.leaf;
            if (!currentLeaf || typeof currentLeaf.getViewState !== "function" || typeof currentLeaf.setViewState !== "function") return false;
            var current = currentLeaf.getViewState();
            if (!current || !current.state || typeof current.state !== "object") return false;
            var editingState = Object.assign({}, current.state, { mode: "source" });
            if (hadSourceMode) editingState.source = originalSourceMode;
            return currentLeaf.setViewState(Object.assign({}, current, { state: editingState }));
          },
        };
      },
    };
  };

  IMTExtendedPluginClass.prototype._startTranslationViewBridge = function () {
    if (this._translationViewBridge) return this._translationViewBridge.start();
    try {
      this._translationViewBridge = createTranslationViewBridge({
        document: document,
        globalObject: window,
        viewController: this._createTranslationViewController(),
        MutationObserver: window.MutationObserver,
        setTimeout: setTimeout,
        clearTimeout: clearTimeout,
      });
      return this._translationViewBridge.start();
    } catch (e) {
      this._translationViewBridge = null;
      console.warn("[IMT-Extended] Translation view bridge unavailable:", e);
      return false;
    }
  };

  IMTExtendedPluginClass.prototype._notifyUserscriptConfigChange = function () {
    try {
      var configStr = localStorage.getItem(GM_STORE_PREFIX + IMT_CONFIG_KEY);
      window.dispatchEvent(new StorageEvent("storage", { key: GM_STORE_PREFIX + IMT_CONFIG_KEY, newValue: configStr, url: window.location.href }));
      return true;
    } catch (e) { return false; }
  };

  IMTExtendedPluginClass.prototype._removeExternalScripts = function () { for (var i = 0; i < this._externalScripts.length; i++) { var s = this._externalScripts[i]; if (s && s.parentNode) s.parentNode.removeChild(s); } this._externalScripts = []; };

  IMTExtendedPluginClass.prototype._isActiveGeneration = function (generation) { return !this._isUnloaded && generation === this._activationGeneration; };

  IMTExtendedPluginClass.prototype._isEngineLoaded = function () {
    try { return !!(window[_engineStateKey] && window[_engineStateKey].loaded && window[_engineStateKey].mode === "userscript"); } catch (e) { return false; }
  };

  IMTExtendedPluginClass.prototype._setUserscriptRuntimeVersion = function (content) {
    var version = _extractUserscriptVersion(content);
    if (!version) return "";
    this._loadedUserscriptVersion = version;
    try { if (window.GM_info && window.GM_info.script) window.GM_info.script.version = version; } catch (e) {}
    try { if (window.GM && window.GM.info && window.GM.info.script) window.GM.info.script.version = version; } catch (e) {}
    return version;
  };

  IMTExtendedPluginClass.prototype._markEngineLoaded = function () {
    try { window[_engineStateKey] = { loaded: true, mode: "userscript", loadedAt: Date.now(), userscriptVersion: this._loadedUserscriptVersion }; } catch (e) {}
  };

  IMTExtendedPluginClass.prototype._applyRuntimeConfig = function () {
    var storedConfig = _gmGetConfig();
    var targetLanguage = _normalizeTargetLanguage(storedConfig.targetLanguage) || _normalizeTargetLanguage(storedConfig.translationTargetLanguage) || DEFAULT_TARGET_LANGUAGE;
    var storedGeneralRule = storedConfig.generalRule && typeof storedConfig.generalRule === "object" && !Array.isArray(storedConfig.generalRule) ? storedConfig.generalRule : {};
    var sel = this._buildSelectors(storedGeneralRule);
    var userscriptConfig = Object.assign({}, storedConfig, {
      targetLanguage: targetLanguage,
      generalRule: Object.assign({}, storedGeneralRule, { selectors: sel.selectors, excludeSelectors: sel.excludeSelectors }),
    });
    this._patchGlobal(window, "immersiveTranslateConfig", { partnerId: "immersive-translate-sdk", translationTargetLanguage: targetLanguage, pageRule: { selectors: sel.selectors, excludeSelectors: sel.excludeSelectors } });
    this._patchGlobal(window, "IMMERSIVE_TRANSLATE_CONFIG", userscriptConfig);
  };

  IMTExtendedPluginClass.prototype._appendEngineScript = function (content, generation) {
    if (!content || !this._isActiveGeneration(generation)) return false;
    var script = document.createElement("script");
    script.textContent = content;
    try {
      document.body.append(script);
      this._externalScripts.push(script);
      this._markEngineLoaded();
      return true;
    } catch (e) { return false; }
  };

  IMTExtendedPluginClass.prototype._activateIMT = async function (generation) {
    if (this._isUnloaded) return false;
    if (generation === undefined) generation = ++this._activationGeneration;
    if (!this._isActiveGeneration(generation)) return false;
    this._applyRuntimeConfig();
    var existingEngine = null;
    try { existingEngine = window[_engineStateKey]; } catch (e) {}
    if (existingEngine && existingEngine.loaded && existingEngine.mode !== "userscript") {
      new obsidian.Notice("沉浸式翻译运行时已更新，请重启 Obsidian 完成加载。");
      return false;
    }
    if (this._isEngineLoaded()) {
      this._installGMPolyfill(); this._installBrowserAPIPolyfill(); this._installGMFetchPolyfill();
      return true;
    }
    this._installGMPolyfill(); this._installBrowserAPIPolyfill(); this._installGMFetchPolyfill();
    var scriptContent = await this._ensureUserscript(generation);
    if (!this._isActiveGeneration(generation)) return false;
    var currentEngine = null;
    try { currentEngine = window[_engineStateKey]; } catch (e) {}
    if (currentEngine && currentEngine.loaded && currentEngine.mode !== "userscript") {
      new obsidian.Notice("沉浸式翻译运行时已更新，请重启 Obsidian 完成加载。");
      return false;
    }
    if (this._isEngineLoaded()) {
      this._installGMPolyfill(); this._installBrowserAPIPolyfill(); this._installGMFetchPolyfill();
      return true;
    }
    if (!scriptContent) {
      new obsidian.Notice("请在插件设置中安装翻译运行时");
      return false;
    }
    var compatibilityPatch = patchUserscriptSidePanelMinWidth(scriptContent, OBSIDIAN_MOCK_SIDE_PANEL_MIN_WIDTH);
    scriptContent = compatibilityPatch.source;
    if (!compatibilityPatch.changed && compatibilityPatch.reason !== "already-patched" && compatibilityPatch.reason !== "anchor-not-found") {
      console.warn("[IMT-Extended] Userscript side-panel compatibility patch skipped: " + compatibilityPatch.reason);
    }
    var hostBridgePatch = patchUserscriptHostContentBridge(scriptContent);
    scriptContent = hostBridgePatch.source;
    if (!hostBridgePatch.changed && hostBridgePatch.reason !== "already-patched" && this._isDashboardEmbeddedEnabled()) {
      console.warn("[IMT-Extended] Userscript host-content compatibility patch skipped: " + hostBridgePatch.reason);
      new obsidian.Notice("当前沉浸式翻译运行时暂不支持 Dashboard 热同步；语言和翻译服务请在悬浮球中确认。");
    }
    this._setUserscriptRuntimeVersion(scriptContent);
    if (this._appendEngineScript(scriptContent, generation)) return true;
    this._loadedUserscriptVersion = "";
    if (this._isActiveGeneration(generation)) new obsidian.Notice("沉浸式翻译：引擎加载失败");
    return false;
  };

  IMTExtendedPluginClass.prototype._deactivateIMT = function () {
    for (var i = 0; i < this._gmStyleElements.length; i++) {
      var style = this._gmStyleElements[i];
      if (style && style.parentNode) style.parentNode.removeChild(style);
    }
    this._gmStyleElements = [];
  };

  function _renderAccountStatus(container, dashboardEnabled) {
    var bar = container.createDiv({ cls: "imt-account-bar" });
    var avatar = bar.createDiv({ cls: "imt-account-avatar" });
    var info = bar.createDiv({ cls: "imt-account-info" });
    var userInfo = _getStoredUserInfo();
    var accountName = userInfo && (userInfo.nickname || userInfo.email || userInfo.userId || userInfo.id);
    if (accountName !== undefined && accountName !== null && String(accountName)) {
      accountName = String(accountName);
      avatar.textContent = accountName.charAt(0).toUpperCase();
      var nameEl = info.createDiv({ cls: "imt-account-name" });
      nameEl.textContent = accountName;
      var check = document.createElement("span"); check.className = "imt-account-check"; check.textContent = " \u2713"; nameEl.appendChild(check);
      var statusEl = info.createDiv({ cls: "imt-account-status" });
      statusEl.textContent = userInfo.userType === "pro" ? "Pro 会员" : userInfo.userType === "max" ? "Max 会员" : "免费用户";
    } else {
      avatar.textContent = "?";
      info.createDiv({ cls: "imt-account-name", text: "未登录" });
      info.createDiv({ cls: "imt-account-status", text: dashboardEnabled ? "可在下方打开 Dashboard 登录" : "当前未检测到已保存的账户信息" });
    }
  }

  function _copySafeConfigToClipboard(value) {
    if (navigator && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return Promise.resolve(navigator.clipboard.writeText(value)).then(function () { return true; }).catch(function () { return false; });
    }
    try {
      var textarea = document.createElement("textarea");
      textarea.value = value; textarea.style.cssText = "position:fixed;top:-9999px";
      document.body.appendChild(textarea); textarea.select();
      var copied = typeof document.execCommand === "function" && document.execCommand("copy");
      textarea.remove();
      return Promise.resolve(!!copied);
    } catch (e) { return Promise.resolve(false); }
  }

  function IMTSettingTab(app, plugin) { obsidian.PluginSettingTab.call(this, app, plugin); this.plugin = plugin; }
  IMTSettingTab.prototype = Object.create(obsidian.PluginSettingTab.prototype); IMTSettingTab.prototype.constructor = IMTSettingTab;
  IMTSettingTab.prototype.display = function () {
    var containerEl = this.containerEl;
    var findDraftInput = function (root) {
      if (!root) return null;
      if (String(root.tagName || "").toUpperCase() === "TEXTAREA") return root;
      var children = root.children || [];
      for (var index = 0; index < children.length; index++) {
        var match = findDraftInput(children[index]);
        if (match) return match;
      }
      return null;
    };
    var existingImportInput = null;
    try {
      if (typeof containerEl.querySelector === "function") existingImportInput = containerEl.querySelector("textarea.imt-safe-config-input");
    } catch (e) {}
    if (!existingImportInput) existingImportInput = findDraftInput(containerEl);
    var preservedImportValue = existingImportInput && typeof existingImportInput.value === "string" ? existingImportInput.value : "";
    containerEl.empty(); var self = this;
    var dashboardEnabled = self.plugin._isDashboardEmbeddedEnabled();
    containerEl.createEl("h2", { text: "沉浸式翻译延伸版设置" });
    containerEl.createEl("h3", { text: "翻译运行时" });
    var runtimeStatus = self.plugin._getRuntimeStatus();
    var runtimeDescription = runtimeStatus.installed ? "本机已安装 v" + runtimeStatus.version : "本机尚未安装";
    if (runtimeStatus.latestState === "checking") runtimeDescription += "；正在检查官方当前版本…";
    else if (runtimeStatus.latestState === "error") runtimeDescription += "；暂时无法获取官方当前版本";
    else if (runtimeStatus.latestVersion) {
      runtimeDescription += "；官方当前版本 v" + runtimeStatus.latestVersion;
      if (runtimeStatus.installed && runtimeStatus.version === runtimeStatus.latestVersion) runtimeDescription += "，本机已是当前版本";
    }
    else runtimeDescription += "；即将检查官方当前版本";
    var runtimeIsCurrent = runtimeStatus.installed && runtimeStatus.latestState === "available" &&
      runtimeStatus.latestVersion && runtimeStatus.version === runtimeStatus.latestVersion;
    new obsidian.Setting(containerEl).setName(runtimeStatus.installed ? "运行时 v" + runtimeStatus.version : "安装翻译运行时").setDesc(runtimeDescription).addButton(function (b) {
      b.setButtonText(runtimeIsCurrent ? "已是最新版本" : runtimeStatus.installed ? "更新运行时" : "安装运行时");
      if (typeof b.setDisabled === "function") b.setDisabled(!!runtimeIsCurrent);
      if (runtimeIsCurrent || typeof b.onClick !== "function") return;
      b.onClick(function () {
        Promise.resolve(self.plugin._installRuntimeFromOfficialSource()).then(function (result) {
          if (result && result.ok) self.display();
        });
      });
    });
    if (self.plugin._shouldCheckLatestRuntimeVersion()) {
      Promise.resolve(self.plugin._checkLatestRuntimeVersion()).then(function () {
        if (!self.plugin._isUnloaded) self.display();
      });
    }
    containerEl.createEl("h3", { text: "翻译范围" });
    new obsidian.Setting(containerEl).setName("界面翻译范围").setDesc("翻译菜单、侧栏、设置和通知；关闭后立即清理这些区域的译文").addToggle(function (t) { t.setValue(self.plugin.settings.uiTranslateEnabled).onChange(function (v) { self.plugin._setTranslationScopeSetting("uiTranslateEnabled", v); }); });
    new obsidian.Setting(containerEl).setName("正文翻译范围").setDesc("翻译阅读视图正文；Markdown 编辑器始终受到保护，切换会实时生效").addToggle(function (t) { t.setValue(self.plugin.settings.articleTranslateEnabled).onChange(function (v) { self.plugin._setTranslationScopeSetting("articleTranslateEnabled", v); }); });
    containerEl.createEl("h3", { text: "账户与高级设置" });
    _renderAccountStatus(containerEl, dashboardEnabled);
    if (dashboardEnabled) {
      new obsidian.Setting(containerEl).setName("沉浸式翻译 Dashboard").setDesc("登录、账户管理，以及译文样式、字体、鼠标悬停等完整高级设置").addButton(function (b) { b.setButtonText("打开 Dashboard").onClick(function () { self.plugin._openDashboardWindow("https://dash.immersivetranslate.com/#general"); }); }).addButton(function (b) { b.setButtonText("从已打开的 Dashboard 同步").onClick(function () { self.plugin._syncDashboardConfig(); }); });
    }
    containerEl.createEl("h3", { text: "安全配置迁移" });
    new obsidian.Setting(containerEl).setName("导出安全配置").setDesc("复制经过筛选的设置；凭据、令牌、API 密钥和密码不会进入导出内容").addButton(function (b) { b.setButtonText("导出安全配置").onClick(function () {
      var value = self.plugin._exportConfig();
      _copySafeConfigToClipboard(value).then(function (copied) { new obsidian.Notice(copied ? "安全配置已复制到剪贴板" : "无法写入剪贴板，请检查 Obsidian 权限"); });
    }); });
    var importSection = containerEl.createDiv({ cls: "imt-settings-import" });
    var importInput = importSection.createEl("textarea", { cls: "imt-safe-config-input" });
    importInput.value = preservedImportValue;
    importInput.placeholder = "粘贴安全配置 JSON；凭据和密钥会被过滤";
    var importActions = importSection.createDiv({ cls: "imt-settings-import-actions" });
    var importButton = importActions.createEl("button", { text: "导入安全配置", cls: "mod-cta" });
    importButton.addEventListener("click", function () {
      var value = String(importInput.value || "").trim();
      if (!value) { new obsidian.Notice("请粘贴安全配置 JSON"); return; }
      importButton.disabled = true;
      Promise.resolve(self.plugin._importConfig(value)).then(function (applied) {
        if (applied) { importInput.value = ""; self.display(); return; }
        importButton.disabled = false;
      }).catch(function () { importButton.disabled = false; new obsidian.Notice("安全配置导入失败"); });
    });
    containerEl.createEl("h3", { text: "冲突处理" });
    var hasI18N = !!(this.app.plugins && this.app.plugins.plugins && this.app.plugins.plugins[I18N_PLUGIN_ID]);
    var hasStandalone = this.plugin._hasStandaloneConflict();
    if (hasI18N) new obsidian.Setting(containerEl).setName("屏蔽 I18N 沉浸式翻译模块").setDesc("启用后由本插件暂停该模块；关闭时恢复本插件实际修改的状态").addToggle(function (t) { t.setValue(self.plugin.settings.disableI18NImt).onChange(function (v) { self.plugin.settings.conflictChoiceVersion = 1; self.plugin.settings.disableI18NImt = v; self.plugin.saveSettings(); if (v) self.plugin._disableI18NImtModule(); else self.plugin._restoreI18NImtModule(); }); });
    if (hasStandalone) new obsidian.Setting(containerEl).setName("屏蔽 Immersive Translate 插件").setDesc("启用后由本插件暂停该插件；关闭时恢复本插件实际修改的状态").addToggle(function (t) { t.setValue(self.plugin.settings.disableStandaloneImt).onChange(function (v) { self.plugin.settings.conflictChoiceVersion = 1; self.plugin.settings.disableStandaloneImt = v; self.plugin.saveSettings(); if (v) self.plugin._disableStandaloneImt(); else self.plugin._restoreStandaloneImt(false); }); });
  };

  return IMTExtendedPluginClass;
})();

module.exports = IMTExtendedPlugin;
