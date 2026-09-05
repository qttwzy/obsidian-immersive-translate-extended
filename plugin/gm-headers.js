"use strict";

function createGmHeaders() {
  function headersToObject(input) {
    var result = {};
    if (!input) return result;
    if (Array.isArray(input)) {
      for (var i = 0; i < input.length; i++) {
        if (input[i] && input[i].length >= 2) result[String(input[i][0])] = String(input[i][1]);
      }
      return result;
    }
    if (typeof input.forEach === "function") {
      input.forEach(function (value, key) { result[String(key)] = String(value); });
      return result;
    }
    if (typeof input === "object") {
      var keys = Object.keys(input);
      for (var k = 0; k < keys.length; k++) {
        var key = keys[k];
        if (input[key] !== undefined && input[key] !== null) result[key] = String(input[key]);
      }
    }
    return result;
  }

  function hasHeader(headers, name) {
    var target = String(name).toLowerCase();
    return Object.keys(headers || {}).some(function (key) { return key.toLowerCase() === target; });
  }

  function getResponseHeader(headers, name) {
    var target = String(name).toLowerCase();
    var key = Object.keys(headers || {}).find(function (candidate) { return candidate.toLowerCase() === target; });
    return key ? headers[key] : "";
  }

  function responseHeadersToString(headers) {
    return Object.keys(headers || {}).map(function (key) { return key + ": " + headers[key]; }).join("\r\n");
  }

  return {
    headersToObject: headersToObject,
    hasHeader: hasHeader,
    getResponseHeader: getResponseHeader,
    responseHeadersToString: responseHeadersToString,
  };
}

module.exports = { createGmHeaders };
