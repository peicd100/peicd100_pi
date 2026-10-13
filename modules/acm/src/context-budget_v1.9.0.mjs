// Declared model metadata only. Never query/authenticate/probe a provider here.
import {createHash} from 'node:crypto';
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const CONTEXT_COMMAND='/context(peicd100)';
export function contextModelKey(model){
 if(!model||![model.provider,model.id].every(x=>typeof x==='string'&&x.length>0&&x.length<=200&&!/[\x00-\x1f\x7f]/.test(x)))throw new Error('目前模型識別無效；未修改設定。');
 return `${model.provider}/${model.id}`;
}
export function contextFingerprint(model){
 contextModelKey(model);
 return createHash('sha256').update(JSON.stringify([model.provider,model.api??null,model.id,model.baseUrl??null,model.contextWindow,model.maxTokens??null,model.inputLimits??null])).digest('hex');
}
export function contextMaximum(model,baseCap){
 contextModelKey(model);
 if(!Number.isSafeInteger(model.contextWindow)||model.contextWindow<=0||!Number.isSafeInteger(baseCap)||baseCap<=0)throw new Error('模型宣告容量未知或無效；不能設定或猜測上限。');
 return Math.min(model.contextWindow,baseCap);
}
function records(settings){
 const value=settings.acm?.contextBudgets;
 if(value===undefined)return {};
 if(!object(value)||value.version!==1||!object(value.models)||Object.keys(value).some(k=>!['version','models'].includes(k)))throw new Error('上下文預算紀錄無效；請檢查設定，未自動修復。');
 return value.models;
}
export function resolveContextCapacity(settings,model,baseCap){
 const map=records(settings);if(!model)return baseCap;
 // Capacity-only callers retain the historical conservative guard when no
 // per-model budget exists. Any stored budget requires full route binding.
 if(!Object.keys(map).length){if(!Number.isSafeInteger(model.contextWindow)||model.contextWindow<=0)throw new Error('模型宣告容量未知或無效。');return Math.min(model.contextWindow,baseCap);}
 const maximum=contextMaximum(model,baseCap),key=contextModelKey(model),entry=Object.hasOwn(map,key)?map[key]:undefined;
 if(entry===undefined)return maximum;
 if(!object(entry)||Object.keys(entry).some(k=>!['capacity','fingerprint'].includes(k))||!Number.isSafeInteger(entry.capacity)||entry.capacity<4096||entry.capacity>maximum||typeof entry.fingerprint!=='string'||entry.fingerprint!==contextFingerprint(model))throw new Error('此模型的上下文預算綁定或容量已變更；請閒置 /context(peicd100) 重新確認，未沿用舊預算。');
 return entry.capacity;
}
export function patchContextCapacity(settings,model,baseCap,capacity){
 const maximum=contextMaximum(model,baseCap),key=contextModelKey(model),map=records(settings);
 if(capacity!==null&&(!Number.isSafeInteger(capacity)||capacity<4096||capacity>maximum))throw new Error(`最多可設定 ${maximum.toLocaleString('en-US')} Token（目前 Pi 資料宣告，非服務端驗證）；超額尚未確認，不會修改模型容量。`);
 const next={...map};if(capacity===null)delete next[key];else Object.defineProperty(next,key,{enumerable:true,configurable:true,writable:true,value:{capacity,fingerprint:contextFingerprint(model)}});
 return {...settings,acm:{...settings.acm,contextBudgets:{version:1,models:next}}};
}
export function parseContextCapacity(text){
 const s=text.trim().toLowerCase();if(s==='auto'||s==='reset')return null;
 if(!/^\d+(?:k|m)?$/.test(s))throw new Error('請輸入 auto、128k、272k、500k、1m 或整數 Token；K=1000、M=1000000。');
 const value=Number(s.replace(/[km]$/,''))*(s.endsWith('k')?1000:s.endsWith('m')?1000000:1);
 if(!Number.isSafeInteger(value)||value<4096)throw new Error('上下文預算必須是至少4096的安全整數 Token。');return value;
}
export function describeContextBudget(settings,model,baseCap,usage){
 const result={schema_version:1,command:CONTEXT_COMMAND,source:'Pi model metadata; not provider-attested',service_maximum:null,service_verification:'UNKNOWN',declared_capacity:null,setting_maximum:null,model:null,mode:'unknown',effective_capacity:null,output_maximum:null,observed_usage:null,options:[]};
 try{result.model=contextModelKey(model);result.declared_capacity=model.contextWindow;result.setting_maximum=contextMaximum(model,baseCap);result.output_maximum=Number.isSafeInteger(model.maxTokens)&&model.maxTokens>0?model.maxTokens:null;const map=records(settings);result.mode=Object.hasOwn(map,result.model)?'manual':'auto';result.effective_capacity=resolveContextCapacity(settings,model,baseCap);}
 catch{result.mode='needs_reconfirmation';}
 if(usage&&usage.contextWindow===model?.contextWindow&&Number.isFinite(usage.tokens)&&usage.tokens>=0)result.observed_usage=usage.tokens;
 result.options=[128000,272000,500000,1000000].map(capacity=>({capacity,selectable:result.setting_maximum!==null&&capacity<=result.setting_maximum,reason:result.setting_maximum!==null&&capacity<=result.setting_maximum?'within declared capacity':'beyond declared capacity; unverified'}));
 return result;
}
export function formatContextBudget(view){
 const n=x=>x===null?'未知':x.toLocaleString('en-US');
 return `上下文使用預算\n目前模型：${view.model??'未知'}\nPi 宣告容量：${n(view.declared_capacity)} Token\n最多可設定：${n(view.setting_maximum)} Token（依宣告資料，不代表服務端已驗證）\n服務端實際上限：尚未確認\n目前預算：${view.mode==='auto'?'自動':view.mode==='manual'?'手動':'需重新確認'}／${n(view.effective_capacity)} Token\n模型最大輸出：${n(view.output_maximum)} Token（不是目前預留量）\n可對照的目前用量：${n(view.observed_usage)} Token\n500K／1M 若超過宣告上限會拒絕，不能靠修改數字突破服務端限制。\n只限閒置保存；由 ACM 同步模型 native budget，不改模型、provider、原始對話或其他模型。調大不恢復已移出窗口的訊息。`;
}
