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

// Reduced executable copies of the 1.33.2 k1t -> fo -> Yue call shape.
function actual1332HostLifecycleFixture() {
  return `// @version 1.33.2
const events=controls.events;
const R9e=controls.R9e,ao=controls.ao,Yt=controls.Yt;
const RestoreContext=async()=>{await controls.Nu();return{rule:{}}};
const Bt=()=>"Translated",She=()=>true,VE=()=>{};
const D5e=async()=>false,P5e=async()=>false;
const Uue=()=>{events.push("startSession");controls.onStartSession?.();return{session_id:"session"}};
const G3t=()=>{events.push("G3t")};
const NG=t=>t?.trigger;
const Va=name=>name==="translatePage"?fo:()=>{};
function B3t(e){if(!e)return{state:void 0,trigger:void 0,startedAt:void 0,documentTerminologyInput:void 0};let{trigger:t,startedAt:n,documentTerminologyInput:r,...i}=e;return{state:Object.keys(i).length?i:void 0,trigger:t,startedAt:n,documentTerminologyInput:r}}
function zn(){return "test:"}
async function k1t(e,t){let n=await R9e(e,t),r;return await Va("translatePage")(n,{trigger:NG(t),...r!==void 0?{documentTerminologyInput:r}:{}}),n}
function td(){}
async function Yue({passGate:e,preparePreviousPage:t,prepareCurrentPage:n,startSession:r}){if(await e())return await t(),n(),r()}
function I0(){}
async function Nu(){let e=await RestoreContext(zn(),{});controls.onRestore?.();}
function afterRestore(){}
async function fo(e,t){let n=globalThis.performance?.now?.()??Date.now(),r=Date.now(),i=true;let o=e,{state:a,trigger:s,startedAt:l,documentTerminologyInput:u}=B3t(t),c=typeof s=="string"?s:"unknown";let d;if(a){let b=globalThis.performance?.now?.()??Date.now();try{o=await Yt(zn(),a)}finally{d=(globalThis.performance?.now?.()??Date.now())-b}}if(!She(o.translationService,o.targetLanguage,o.config))return;let m=b=>{fo(e,{...a,...b,...s?{trigger:s}:{},...l?{startedAt:l}:{},...u!==void 0?{documentTerminologyInput:u}:{}})};if(VE(o),await D5e(o,c,m)||await P5e(o,m))return;let p,f=await Yue({passGate:async()=>{let y={onRetry:()=>(fo(e,t),!0)};return(await ao()).allowed},preparePreviousPage:async()=>{Bt()!=="Original"&&await Nu()},prepareCurrentPage:()=>{events.push("prepareCurrentPage")},startSession:()=>Uue(o,{trigger:c})});if(!f)return;let h=f.session_id;G3t(o);return f}
async function _De(){}
`;
}

const REGION_FIXTURE_SHAPES = {
  "1.33.2": { wrapper: "w9", traverser: "Ap", timer: "bp", marks: "ur", stopped: "Yr", engine: "Ve", context: "Ci", entry: "Yr()" },
  "1.33.3": { wrapper: "A9", traverser: "Mp", timer: "Tp", marks: "ur", stopped: "Yr", engine: "Ve", context: "Ci", entry: "Yr()" },
  "1.34.1": { wrapper: "$M", traverser: "Of", timer: "pf", marks: "sr", stopped: "ei", engine: "He", context: "Di", entry: "ei()||n?.shouldContinue?.()===!1" },
};

function hostRegionBridgeFixture(version = "1.33.2") {
  const shape = REGION_FIXTURE_SHAPES[version] || REGION_FIXTURE_SHAPES["1.33.2"];
  const { wrapper, traverser, timer, marks, stopped, engine, context, entry } = shape;
  return `// @version ${version}
const document=controls.document,globalThis=controls.globalObject,${marks}=controls.ur,${stopped}=controls.Yr;
let ${engine}=controls.engine;
const ${context}=()=>({}),${timer}=async(_name,callback)=>await callback();
function ${traverser}(request){return controls.scan(request)}
if(${engine}){${engine}.traverseContent=${traverser},${engine}.walkContainer=${traverser}}
async function ${wrapper}(e,t,n,r){if(${entry})return;let i=${context}(e.ctx);await ${timer}("initial_traverse_ms",()=>e.traverseContent({id:e.id,container:t,filterRule:i,performancePhase:r,onParagraph:async o=>{if(n?.shouldParseParagraph&&!n.shouldParseParagraph(o).shouldParse){n.onParsed?.(null);return}n?.onParsed?.(o??null);await controls.onParagraph?.(o)},engineCtx:e}))}
/* __imtHostLifecycleGuardV1 */
async function hostHandler(e,t){const calls=[],r=e,Ae=async()=>({ok:true}),E1t=async()=>{},td=()=>{};let i;try{let o=JSON.parse(typeof t==="string"?t:t.detail||"{}");if(o&&o.type){if(o.type==="noop"){}else if(o.type==="translatePage")await E1t(r,o.data);else if(o.type==="getAsyncTranslationServiceList"){}else if(o.type==="switchTranslationMode"){}else Ae("content",o.type);i!==void 0&&o.id&&td(o.type,i,o.id)}}catch(error){throw error}return i}
`;
}

// Reduced executable copy of the 1.34.1 bSt -> vo -> Yme call shape.
function actual1341HostLifecycleFixture() {
  return `// @version 1.34.1
const events=controls.events;
const H7e=controls.R9e,Kt=controls.Yt,Vn=()=>"test:";
const _t=()=>"Translated",oE=()=>undefined;
const rxe=()=>true,nQ=()=>{},FIe=async()=>false,UIe=async()=>false;
const Ta=()=>"retry",Jo=()=>({dispose(){}}),fo=async()=>({allowed:true}),iRe=async()=>true,rRe=async()=>false,aRe=()=>{};
const jme=()=>{events.push("startSession");controls.onStartSession?.();return{session_id:"session"}};
const hQ=t=>t?.trigger;
const Xa=name=>name==="translatePage"?vo:()=>{};
function gwt(e){if(!e)return{state:void 0,trigger:void 0,startedAt:void 0,documentTerminologyInput:void 0,enableObserver:void 0};let{trigger:t,startedAt:n,documentTerminologyInput:r,enableObserver:i,...o}=e;return{state:Object.keys(o).length?o:void 0,trigger:t,startedAt:n,documentTerminologyInput:r,enableObserver:i}}
function Zn(){return "test:"}
async function bSt(e,t){let n=t?.enableObserver===!1?oE():void 0;try{let r=await H7e(e,t),i;return await Xa("translatePage")(r,{trigger:hQ(t),...t?.enableObserver===!1?{enableObserver:!1}:{},...i!==void 0?{documentTerminologyInput:i}:{}}),r}finally{n?.()}}
function Pd(){}
async function Yme({passGate:e,preparePreviousPage:t,prepareCurrentPage:n,startSession:r}){if(await e())return await t(),n(),r()}
function D1(){return globalThis.performance?.now?.()??Date.now()}
async function Zu(){let e=await Kt(Vn(),{});controls.onRestore?.()}
function vwt(){}
async function vo(e,t){let n=t?.enableObserver===!1?oE():void 0;try{let r=globalThis.performance?.now?.()??Date.now(),i=Date.now(),o=globalThis.self===globalThis.top;let a=e,{state:s,trigger:l,startedAt:u,documentTerminologyInput:c,enableObserver:g}=gwt(t),d=typeof l=="string"?l:"unknown";let p;if(s){let v=globalThis.performance?.now?.()??Date.now();try{a=await Kt(Vn(),s)}finally{p=(globalThis.performance?.now?.()??Date.now())-v}}if(!rxe(a.translationService,a.targetLanguage,a.config))return;let f=v=>{vo(e,{...s,...v,...l?{trigger:l}:{},...u?{startedAt:u}:{},...c!==void 0?{documentTerminologyInput:c}:{},...g===!1?{enableObserver:!1}:{}})};if(nQ(a),await FIe(a,d,f)||await UIe(a,f))return;let h,b=await Yme({passGate:async()=>{let v=Ta(),S=Jo({retryId:v,onRetry:()=>(vo(e,t),!0)});return(await controls.ao({})).allowed?(S.dispose(),await iRe(a)&&!await rRe(a)?(aRe(a),!1):!0):!1},preparePreviousPage:async()=>{_t()!=="Original"&&await Zu()},prepareCurrentPage:()=>{events.push("prepareCurrentPage")},startSession:()=>jme(a,{trigger:d})});if(!b)return;let y=b.session_id;events.push("session");return b}finally{n?.()}}
function FRe(){}
`;
}

function legacyHostRegionBridgeFixture() {
  return [
    "// @version 1.32.10",
    "const document=controls.document,globalThis=controls.globalObject;",
    "let Oe=controls.engine;",
    "const Wn={hasMark:node=>node.marked};",
    "function Er(){return false}",
    'async function IC(engine,container){return controls.scan({container,performancePhase:"dynamic",engine})}',
    "Oe.traverseContent=()=>{};",
    "const tc={};",
    'tc.handleThirdPartyTell=async(e,t)=>{let i;let a;let r=e;let we=async()=>{};try{if(t&&t.detail){let o=JSON.parse(t.detail);i=o;if(o&&o.type){if(o.type==="noop"){}else if(o.type==="translatePage")await pnt(r,o.data);else if(o.type==="switchTranslationMode"){ }else we("content",o.type);a!==void 0&&o.id&&ec(o.type,a,o.id)}}}catch(error){throw error}return a};',
    "async function pnt(){}",
    "function ec(){}",
    "",
  ].join("\n");
}

module.exports = {
  hostBridgeFixture,
  actual1328HostBridgeFixture,
  actual1332HostBridgeFixture,
  actual1332HostLifecycleFixture,
  actual1341HostLifecycleFixture,
  legacyHostRegionBridgeFixture,
  hostRegionBridgeFixture,
  renamedTransportHostBridgeFixture,
};
