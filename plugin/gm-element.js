"use strict";

function createGmElementApi(getDocument, onStyle) {
  function resolveDocument() {
    return typeof getDocument === "function" ? getDocument() : getDocument;
  }

  function addElement(parentOrTag, tagOrAttrs, maybeAttrs) {
    var twoArg = typeof parentOrTag === "string";
    var tagName = twoArg ? parentOrTag : tagOrAttrs;
    var attributes = twoArg ? tagOrAttrs : maybeAttrs;
    var runtimeDocument = resolveDocument();
    var parentNode = twoArg
      ? (runtimeDocument && (runtimeDocument.head || runtimeDocument.documentElement || runtimeDocument.body))
      : parentOrTag;
    var owner = (parentNode && parentNode.ownerDocument) || runtimeDocument;
    if (!parentNode || typeof parentNode.appendChild !== "function" || !tagName || !owner || typeof owner.createElement !== "function") return null;
    var el = owner.createElement(String(tagName));
    if (attributes && typeof attributes === "object") {
      var keys = Object.keys(attributes);
      for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (key === "innerHTML" || key === "outerHTML" || String(key).slice(0, 2).toLowerCase() === "on") continue;
        if (key === "textContent" || key === "className") {
          try { el[key] = attributes[key]; } catch (error) {}
          continue;
        }
        try {
          if (typeof el.setAttribute === "function") el.setAttribute(key, String(attributes[key]));
          else el[key] = attributes[key];
        } catch (error) {}
      }
    }
    try { parentNode.appendChild(el); } catch (error) { return null; }
    if (typeof onStyle === "function" && String(tagName).toLowerCase() === "style") {
      try { onStyle(el); } catch (error) {}
    }
    return el;
  }

  function addStyle(cssText) {
    var runtimeDocument = resolveDocument();
    if (!runtimeDocument) return null;
    return addElement(runtimeDocument.head || runtimeDocument.documentElement, "style", { textContent: String(cssText || "") });
  }

  return { addElement: addElement, addStyle: addStyle };
}

module.exports = { createGmElementApi };
