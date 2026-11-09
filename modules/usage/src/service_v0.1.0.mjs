import{classifyFailure}from'../../goal/src/state_v0.3.0.mjs';
export const USAGE_SERVICE_EVENT='peicd100:usage-service:v1';
// A billing/RPM/unknown failure is NOT evidence of a resettable subscription
// window, even if some unrelated displayed budget happens to be full.
export function windowQuotaFailure(message){const raw=String(message?.errorMessage??'').slice(0,16384);return message?.stopReason==='error'&&classifyFailure(message)==='quota_exhausted'&&!/insufficient_quota|insufficient[_ ]credits|insufficient[_ ]balance|credit balance.{0,40}(?:low|exhaust|insufficient)|billing[_ ]hard[_ ]limit/iu.test(raw)&&/(?:usage limit|usage_limit|subscription.{0,40}(?:limit|quota))/iu.test(raw);}
export function requestUsageService(events){const found=[];try{events.emit(USAGE_SERVICE_EVENT,{respond:s=>{if(found.length<2)found.push(s);}});}catch{return undefined;}return found.length===1&&['probe','routing','captureHeaders'].every(k=>typeof found[0]?.[k]==='function')?found[0]:undefined;}
