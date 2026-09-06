"use strict";

function createGmResponseValue(getResponseHeader) {
  function decode(options) {
    var type = String(options.responseType || "text").toLowerCase();
    var text = typeof options.text === "string" ? options.text : "";
    var headers = options.headers || {};
    var bytes = options.bytes;
    if (type === "json") {
      if (options.json !== undefined && typeof options.json === "object" && options.json !== null) return options.json;
      return JSON.parse(text || "null");
    }
    if (type === "arraybuffer") return bytes;
    if (type === "blob") {
      var contentType = getResponseHeader(headers, "content-type") || "application/octet-stream";
      if (typeof Blob === "function") return new Blob([bytes], { type: contentType });
      return bytes;
    }
    if (type === "document") {
      var mime = String(getResponseHeader(headers, "content-type") || "").toLowerCase().indexOf("html") >= 0
        ? "text/html"
        : "application/xml";
      return typeof DOMParser === "function" ? new DOMParser().parseFromString(text, mime) : text;
    }
    return text;
  }

  return { decode: decode };
}

module.exports = { createGmResponseValue };
