import {validatePercentages} from './config_v1.10.0.mjs';
// Explicit UI writes only. Never migrate stored policies/defaults on read.
export function parseThreshold(input) {
 const text=typeof input==='string'?input.trim():'';
 if(text.length>32||!/^\d+(?:\.\d+)?%?$/.test(text))throw new Error('請輸入單一觸發比例 n；需 1 < n < 100，保留目標自動為 n−1。');
 const n=Number(text.replace(/%$/,''));
 if(!Number.isFinite(n)||!(1<n&&n<100))throw new Error('觸發比例需 1 < n < 100；保留目標自動為 n−1。');
 return validatePercentages({triggerPercent:n,targetPercent:n-1});
}
