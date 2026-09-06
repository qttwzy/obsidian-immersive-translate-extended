"use strict";

function hostBridgeFixture(version = "1.32.7") {
  return "// @version " + version + "\n" +
    'async function hostHandler(i){let a;const calls=[],r={},we=async(...args)=>{calls.push(["we",...args]);return{ok:true}},aKe=async(...args)=>{calls.push(["translate",...args])},vu=()=>{};if(i.type==="noop"){}else if(i.type==="translatePage")await aKe(r,i.data);else if(i.type==="getAsyncTranslationServiceList"){}else if(i.type==="switchTranslationMode"){calls.push(["switch"])}else i.type==="fallback"?a={fallback:true}:we("content",i.type);a!==void 0&&i.id&&vu(i.type,a,i.id);return{a,calls}}';
}

function actual1328HostBridgeFixture() {
  return '// @version 1.32.8\n' +
    'async function hostHandler(i){let a;const calls=[],r={},we=async(...args)=>{calls.push(["we",...args]);return{ok:true}},unt=async(...args)=>{calls.push(["translate",...args])},Xu=(...args)=>{calls.push(["response",...args])};if(i.type==="noop"){}else if(i.type==="translatePage")await unt(r,i.data);else if(i.type==="getAsyncTranslationServiceList"){}else if(i.type==="switchTranslationMode"){calls.push(["switch"])}else we("content",i.type);a!==void 0&&i.id&&Xu(i.type,a,i.id);return{a,calls}}';
}

function renamedTransportHostBridgeFixture() {
  return actual1328HostBridgeFixture()
    .replace("we=async", "Qe=async")
    .replace('else we("content",i.type)', 'else Qe("content",i.type)');
}

module.exports = {
  hostBridgeFixture,
  actual1328HostBridgeFixture,
  renamedTransportHostBridgeFixture,
};
