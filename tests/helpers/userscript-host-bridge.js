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

// Minimal executable shape of the official 1.33.2 third-party dispatcher:
// message local is `o`, result accumulator is `i`, content transport is `Ae`.
function actual1332HostBridgeFixture() {
  return '// @version 1.33.2\n' +
    'async function hostHandler(e,t){const calls=[],r=e,Ae=async(...args)=>{calls.push(["Ae",...args]);return{ok:true}},E1t=async(...args)=>{calls.push(["translate",...args])},td=(...args)=>{calls.push(["response",...args])};let i;try{let o=JSON.parse(typeof t==="string"?t:t.detail||"{}");if(o&&o.type){if(o.type==="noop"){}else if(o.type==="translatePage")await E1t(r,o.data);else if(o.type==="getAsyncTranslationServiceList"){}else if(o.type==="switchTranslationMode"){calls.push(["switch"])}else Ae("content",o.type);i!==void 0&&o.id&&td(o.type,i,o.id)}}catch(u){}return{i,calls}}';
}

module.exports = {
  hostBridgeFixture,
  actual1328HostBridgeFixture,
  actual1332HostBridgeFixture,
  renamedTransportHostBridgeFixture,
};
