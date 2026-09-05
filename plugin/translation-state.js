"use strict";

const ACTIVE_TRANSLATION_STATES = { dual: true, translation: true };

function isActiveTranslationState(state) {
  return state === "dual" || state === "translation";
}

function readActiveTranslationState(runtimeDocument) {
  if (!runtimeDocument) return "";
  try {
    const explicit = String(runtimeDocument.documentElement && runtimeDocument.documentElement.getAttribute("imt-state") || "").trim();
    if (isActiveTranslationState(explicit)) return explicit;
    if (explicit) return "";
    const popup = runtimeDocument.querySelector && runtimeDocument.querySelector("#immersive-translate-popup");
    if (popup && popup.shadowRoot && popup.shadowRoot.querySelector(".imt-fb-btn.active")) return "dual";
  } catch (error) {}
  return "";
}

module.exports = {
  ACTIVE_TRANSLATION_STATES,
  isActiveTranslationState,
  readActiveTranslationState,
};
