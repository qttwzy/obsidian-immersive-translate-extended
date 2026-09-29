"use strict";

// Region IDs are the protocol boundary. Callers cannot supply arbitrary selectors.
const HOST_UI_REGIONS = Object.freeze({
  "settings-content": ".vertical-tab-content",
  "settings-navigation": ".vertical-tab-header",
  "settings-heading": ".modal-title",
  "settings": ".mod-settings",
  "overlays": ".menu, .popover, .tooltip, .suggestion-container, .prompt",
  "dialogs": ".modal, .modal-container, .mod-community-plugin, .mod-community-theme",
});

function normalizeHostRegions(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.filter(value => typeof value === "string" && Object.prototype.hasOwnProperty.call(HOST_UI_REGIONS, value))));
}

function hostRegionForNode(node, root) {
  for (let current = node && node.nodeType === 3 ? node.parentNode : node; current && current !== root; current = current.parentNode) {
    for (const [id, selectors] of Object.entries(HOST_UI_REGIONS)) {
      const classes = typeof current.className === "string" ? current.className.split(/\s+/) : [];
      if (selectors.split(", ").some(selector => current.classList?.contains(selector.slice(1)) || classes.includes(selector.slice(1)))) return id;
    }
  }
  return null;
}

module.exports = { HOST_UI_REGIONS, normalizeHostRegions, hostRegionForNode };
