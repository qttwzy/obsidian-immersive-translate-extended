"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { isActiveTranslationState, readActiveTranslationState } = require("../plugin/translation-state");

function documentWithState(state, ballActive) {
  return {
    documentElement: {
      getAttribute(name) { return name === "imt-state" ? state : null; },
    },
    querySelector(selector) {
      if (selector !== "#immersive-translate-popup") return null;
      return {
        shadowRoot: {
          querySelector(inner) { return inner === ".imt-fb-btn.active" && ballActive ? {} : null; },
        },
      };
    },
  };
}

test("explicit dual and translation win over the floating ball", () => {
  assert.equal(readActiveTranslationState(documentWithState("translation", true)), "translation");
  assert.equal(readActiveTranslationState(documentWithState("dual", false)), "dual");
});

test("an empty attribute falls back to the active floating ball", () => {
  assert.equal(readActiveTranslationState(documentWithState("", true)), "dual");
  assert.equal(readActiveTranslationState(documentWithState("", false)), "");
});

test("an explicit inactive attribute does not use the floating-ball fallback", () => {
  assert.equal(readActiveTranslationState(documentWithState("original", true)), "");
  assert.equal(readActiveTranslationState(documentWithState("toString", true)), "");
  assert.equal(isActiveTranslationState("original"), false);
});
