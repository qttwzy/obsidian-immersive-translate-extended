"use strict";

function createGmRequestBody(hasHeader) {
  function encodeUtf8(value) {
    return new TextEncoder().encode(String(value));
  }

  function joinByteArrays(parts) {
    var length = parts.reduce(function (total, part) { return total + part.byteLength; }, 0);
    var joined = new Uint8Array(length);
    var offset = 0;
    for (var i = 0; i < parts.length; i++) {
      joined.set(parts[i], offset);
      offset += parts[i].byteLength;
    }
    return joined.buffer;
  }

  async function serializeFormData(formData, headers) {
    var boundary = "----IMTObsidian" + Math.random().toString(16).slice(2) + Date.now().toString(16);
    var parts = [];
    for (var headerName in headers) if (headerName.toLowerCase() === "content-type") delete headers[headerName];
    for (var entry of formData.entries()) {
      var name = String(entry[0]).replace(/"/g, "%22");
      var value = entry[1];
      if (typeof value === "string") {
        parts.push(encodeUtf8("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + value + "\r\n"));
      } else {
        var filename = String(value.name || "blob").replace(/"/g, "%22");
        var contentType = value.type || "application/octet-stream";
        parts.push(encodeUtf8("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"; filename=\"" + filename + "\"\r\nContent-Type: " + contentType + "\r\n\r\n"));
        parts.push(new Uint8Array(await value.arrayBuffer()));
        parts.push(encodeUtf8("\r\n"));
      }
    }
    parts.push(encodeUtf8("--" + boundary + "--\r\n"));
    headers["Content-Type"] = "multipart/form-data; boundary=" + boundary;
    return joinByteArrays(parts);
  }

  async function classify(data, method, headers) {
    if (data === undefined || data === null || method === "GET" || method === "HEAD") return { kind: "empty" };
    if (typeof data === "string") return { kind: "text", value: data };
    if (typeof URLSearchParams !== "undefined" && data instanceof URLSearchParams) {
      if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/x-www-form-urlencoded;charset=UTF-8";
      return { kind: "text", value: data.toString() };
    }
    if (typeof FormData !== "undefined" && data instanceof FormData) return { kind: "formdata", value: data };
    if (typeof Blob !== "undefined" && data instanceof Blob) {
      return { kind: "bytes", value: new Uint8Array(await data.arrayBuffer()) };
    }
    if (data instanceof ArrayBuffer) return { kind: "bytes", value: new Uint8Array(data) };
    if (ArrayBuffer.isView(data)) {
      return { kind: "bytes", value: new Uint8Array(data.buffer, data.byteOffset, data.byteLength) };
    }
    if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";
    return { kind: "text", value: JSON.stringify(data) };
  }

  async function serializeHostBody(data, method, headers) {
    var part = await classify(data, method, headers);
    if (part.kind === "empty") return undefined;
    if (part.kind === "text") return part.value;
    if (part.kind === "formdata") return serializeFormData(part.value, headers);
    return part.value.buffer.slice(part.value.byteOffset, part.value.byteOffset + part.value.byteLength);
  }

  async function serializeIpcBody(data, method, headers, bytesToBase64) {
    var part = await classify(data, method, headers);
    if (part.kind === "empty") return null;
    if (part.kind === "text") return { type: "text", data: part.value };
    if (part.kind === "formdata") {
      if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";
      return { type: "text", data: JSON.stringify(data) };
    }
    return { type: "base64", data: bytesToBase64(part.value) };
  }

  return {
    serializeHostBody: serializeHostBody,
    serializeIpcBody: serializeIpcBody,
  };
}

module.exports = { createGmRequestBody };
