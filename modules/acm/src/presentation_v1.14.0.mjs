import {validatePercentages,DEFAULT_PERCENTAGES} from './config_v1.10.0.mjs';
import {formatStatus as detailedStatus} from './presentation_v1.8.0.mjs';
export const formatK=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0?`${Math.round(n/1000)}K`:'?K';
// A display only: reuse Pi's already-computed current-context estimate. The
// denominator is the effective ACM trigger, NOT model capacity or retain target.
// ACM's actual request-local calibrated selector is deliberately unchanged.
export function formatFooter(settings,usage){
 const p=validatePercentages(settings?.acm??DEFAULT_PERCENTAGES),capacity=usage?.contextWindow;
 const trigger=Number.isSafeInteger(capacity)&&capacity>0?Math.floor(capacity*(p.triggerPercent/100)):undefined;
 return `ACM ${p.triggerPercent}% ${formatK(usage?.tokens)}/${formatK(trigger)}`;
}
export function formatStatus(data){return detailedStatus(data)+'\n工具列：觸發比例＋Pi目前上下文估計／ACM觸發門檻；1K=1000，四捨五入整數K，未知為?K。分子不是ACM校準後請求估計，不能用整數顯示判定精確裁切時點；詳細估計仍見上列原始數值。';}
