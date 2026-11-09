import {validatePercentages,DEFAULT_PERCENTAGES} from './config_v1.10.0.mjs';
import {formatStatus as detailedStatus} from './presentation_v1.8.0.mjs';
export const formatK=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?`${Math.round(n/1000)}K`:'?K';
export function currentPercent(tokens,capacity){if(typeof tokens!=='number'||!Number.isFinite(tokens)||tokens<0||!Number.isSafeInteger(capacity)||capacity<=0)return'?%';const percent=(tokens/capacity)*100;return Number.isFinite(percent)?`${Math.round(percent)}%`:'?%';}
// Presentation only: raw native numerator / full capacity, not rounded K and
// not calibrated request cost. Preserve the existing effective trigger K.
export function formatFooter(settings,usage){const p=validatePercentages(settings?.acm??DEFAULT_PERCENTAGES),capacity=usage?.contextWindow,trigger=Number.isSafeInteger(capacity)&&capacity>0?Math.floor(capacity*(p.triggerPercent/100)):undefined;return`ACM ${currentPercent(usage?.tokens,capacity)}/${p.triggerPercent}% ${formatK(usage?.tokens)}/${formatK(trigger)}`;}
export function formatStatus(data){return detailedStatus(data)+'\n工具列：Pi目前未取整tokens／完整contextWindow四捨五入整數%／有效觸發%；另保留目前K／觸發K（1K=1000），未知為?%或?K。不以顯示整數判斷精確裁切時點，不改ACM校準、選擇器、原生預算或模型資料。';}
