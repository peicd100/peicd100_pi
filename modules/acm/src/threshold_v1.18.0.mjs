import {validatePercentages} from './config_v1.10.0.mjs';
// 1.18.0: the retained target is always half of the trigger.
// Why: with target = n−1 the window slid about every 8 requests and every slide
// rewrote the request prefix, so the provider prompt cache missed in full each time
// (measured: 456 of 461 slides were full cache misses). A wide gap makes slides rare.
export const TARGET_SHARE = 0.5;
export function effectiveTarget(triggerPercent) {
 if(!Number.isFinite(triggerPercent)||!(0<triggerPercent&&triggerPercent<100))throw new Error('觸發比例無效。');
 return triggerPercent*TARGET_SHARE;
}
// Stored policies keep their old targetPercent bytes; only the effective value is derived.
export function effectivePercentages(value) {
 return validatePercentages({triggerPercent:value?.triggerPercent,targetPercent:effectiveTarget(value?.triggerPercent)});
}
// Explicit UI writes only. Never migrate stored policies/defaults on read.
export function parseThreshold(input) {
 const text=typeof input==='string'?input.trim():'';
 if(text.length>32||!/^\d+(?:\.\d+)?%?$/.test(text))throw new Error('請輸入單一觸發比例 n；需 1 < n < 100，保留目標自動為 n 的一半。');
 const n=Number(text.replace(/%$/,''));
 if(!Number.isFinite(n)||!(1<n&&n<100))throw new Error('觸發比例需 1 < n < 100；保留目標自動為 n 的一半。');
 return effectivePercentages({triggerPercent:n});
}
