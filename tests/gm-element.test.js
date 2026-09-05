"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { createGmElementApi } = require("../plugin/gm-element");

function createDocument() {
  function createElement(tagName) {
    const el = {
      tagName: String(tagName || "div"),
      children: [],
      parentNode: null,
      attributes: Object.create(null),
      textContent: "",
      className: "",
      setAttribute(name, value) { this.attributes[name] = String(value); },
      appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    };
    return el;
  }
  const head = createElement("head");
  const body = createElement("body");
  return {
    head,
    body,
    documentElement: body,
    createElement,
  };
}

test("createGmElementApi injects a style node with Tampermonkey two-arg and three-arg forms", () => {
  const document = createDocument();
  const styles = [];
  const api = createGmElementApi(function () { return document; }, function (el) { styles.push(el); });

  const fromTag = api.addElement("style", { textContent: ".a { color: red; }" });
  assert.equal(fromTag.textContent, ".a { color: red; }");
  assert.equal(fromTag.parentNode, document.head);
  assert.deepEqual(styles, [fromTag]);

  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const fromParent = api.addElement(parent, "style", { textContent: ".b { color: blue; }" });
  assert.equal(fromParent.parentNode, parent);
  assert.equal(styles[1], fromParent);
});

test("createGmElementApi skips markup and event attributes and records styles through addStyle", () => {
  const document = createDocument();
  const styles = [];
  const api = createGmElementApi(document, function (el) { styles.push(el); });
  const labeled = api.addElement(document.body, "div", {
    innerHTML: "<img src=x>",
    outerHTML: "<script>",
    onclick: "alert(1)",
    textContent: "ok",
    className: "probe",
    title: "hint",
  });
  assert.equal(labeled.textContent, "ok");
  assert.equal(labeled.className, "probe");
  assert.equal(labeled.innerHTML, undefined);
  assert.equal(labeled.attributes.title, "hint");
  assert.equal(Object.hasOwn(labeled.attributes, "onclick"), false);

  const sheet = api.addStyle(".c { color: teal; }");
  assert.equal(sheet.textContent, ".c { color: teal; }");
  assert.equal(sheet.parentNode, document.head);
  assert.equal(styles.length, 1);
  assert.equal(styles[0], sheet);
});
