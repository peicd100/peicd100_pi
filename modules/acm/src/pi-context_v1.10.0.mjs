import {readFileSync,existsSync,lstatSync} from 'node:fs';import {join} from 'node:path';import {homedir} from 'node:os';import {createHash} from 'node:crypto';
export const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const hash=x=>createHash('sha256').update(x).digest('hex');
export const nodeAgentDir=()=>{const p=process.env.PI_CODING_AGENT_DIR||undefined;return p&&/^~[\\/]/.test(p)?join(homedir(),p.slice(2)):p??join(homedir(),'.pi','agent');};
export const transactionPath=dir=>join(dir,'config','pi-context','pending.json');
export function parseDocument(raw){
 if(raw===undefined)return {};
 // Match Pi's line-comment/trailing-comma JSON configuration syntax. Values,
 // including URLs/credentials containing //, remain string literals.
 const text=raw.replace(/^\uFEFF/,'').replace(/"(?:\\.|[^"\\])*"|\/\/[^\n]*/g,m=>m[0]==='"'?m:'').replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g,(m,tail)=>tail??m);
 let result;try{result=JSON.parse(text);}catch{throw new Error('設定 JSON 格式無效；未顯示內容或私密值。');}if(!object(result))throw new Error('設定文件必須是 JSON 物件。');return result;
}
export function readDocument(path){try{const s=lstatSync(path);if(s.isSymbolicLink()||!s.isFile()||s.size>2097152)throw new Error('設定檔為 symlink、非普通檔或超過2MiB，未修改。');return readFileSync(path,'utf8');}catch(e){if(e.code==='ENOENT')return undefined;throw e;}}
export function modelIdentity(model){if(!model||![model.provider,model.id].every(s=>typeof s==='string'&&s.length>0&&s.length<=200&&!/[\x00-\x1f\x7f]/.test(s)))throw new Error('目前模型識別未知；不能設定 Pi 容量。');if(model.api==='pi-virtual')throw new Error('目前是虛擬路由模型；請先選擇實體模型，models.json 覆寫不能保證所有路由的容量。');return `${model.provider}/${model.id}`;}
export function modelFingerprint(model){modelIdentity(model);return hash(JSON.stringify([model.provider,model.id,model.api,model.baseUrl,model.contextWindow,model.maxTokens,model.inputLimits]));}
export function officialLimit(model){if(['openai','openai-codex'].includes(model?.provider)&&model.id==='gpt-6.1-sol')return {contextWindow:1050000,maxOutputTokens:128000,scope:'OpenAI API model specification; not Codex endpoint attestation',source:'https://developers.openai.com/api/docs/models/gpt-6.1-sol',checked_at:'2026-10-13'};return null;}
export function parsePiWindow(text){const s=text.trim().toLowerCase();if(!/^\d+(?:k|m)?$/.test(s))throw new Error('請輸入272k、500k、1m或整數 Token；K=1000、M=1000000。這是直接 Pi 覆寫，不是 ACM auto 預算。');const n=Number(s.replace(/[km]$/,''))*(s.endsWith('k')?1000:s.endsWith('m')?1000000:1);if(!Number.isSafeInteger(n)||n<4096)throw new Error('Pi 容量必須是至少4096的安全整數 Token。');return n;}
export function overrideWindow(doc,model){modelIdentity(model);if(doc.providers!==undefined&&!object(doc.providers))throw new Error('models.json providers 格式無效。');const p=doc.providers?.[model.provider];if(p!==undefined&&!object(p))throw new Error('models.json provider 格式無效。');if(p?.modelOverrides!==undefined&&!object(p.modelOverrides))throw new Error('models.json modelOverrides 格式無效。');const m=p?.modelOverrides?.[model.id];if(m!==undefined&&!object(m))throw new Error('models.json 模型覆寫格式無效。');const n=m?.contextWindow;if(n!==undefined&&(!Number.isSafeInteger(n)||n<=0))throw new Error('models.json contextWindow 格式無效。');return n;}
export function patchPiWindow(doc,model,n){overrideWindow(doc,model);parsePiWindow(String(n));const limit=officialLimit(model);if(limit&&n>limit.contextWindow)throw new Error(`超過目前官方 OpenAI API 模型規格 ${limit.contextWindow} Token；未修改 Pi。`);const provider=doc.providers?.[model.provider]??{},old=provider.modelOverrides?.[model.id]??{};return {...doc,providers:{...doc.providers,[model.provider]:{...provider,modelOverrides:{...provider.modelOverrides,[model.id]:{...old,contextWindow:n}}}}};}
export function assertPiContextReady(model,dir=nodeAgentDir()){
 if(existsSync(transactionPath(dir)))throw new Error('Pi 容量交易尚未收斂；請閒置 /context(peicd100) recover，請求已停止。');
 const doc=parseDocument(readDocument(join(dir,'models.json')));
 if(!model?.provider||!model?.id){if(doc.providers&&Object.values(doc.providers).some(p=>object(p?.modelOverrides)&&Object.values(p.modelOverrides).some(m=>m?.contextWindow!==undefined)))throw new Error('有 Pi 容量覆寫，但目前模型識別未知；未放行。');return;}
 const n=overrideWindow(doc,model);if(n!==undefined&&n!==model.contextWindow)throw new Error('Pi models.json 與執行中模型容量不同；請閒置 /reload，未用舊容量執行。');
}
export function describePiContext(model,doc={},usage,dir=nodeAgentDir()){
 const r={schema_version:2,mode:'DIRECT_PI_MODEL_OVERRIDE',command:'/context(peicd100)',model:null,pi_context_window:null,disk_override:null,official_model_limit:officialLimit(model),service_maximum:null,service_verification:'UNKNOWN',model_max_output:null,native_usage:null,pending_transaction:existsSync(transactionPath(dir)),legacy_acm_budget_execution:'RETIRED',options:[]};
 try{r.model=modelIdentity(model);if(!Number.isSafeInteger(model.contextWindow)||model.contextWindow<=0)throw new Error();r.pi_context_window=model.contextWindow;r.disk_override=overrideWindow(doc,model)??null;r.model_max_output=Number.isSafeInteger(model.maxTokens)?model.maxTokens:null;}catch{r.error='模型或設定格式未知／無效，不能猜測或設定容量。';}
 if(usage?.contextWindow===r.pi_context_window&&Number.isFinite(usage.tokens)&&usage.tokens>=0)r.native_usage=usage.tokens;
 r.options=[272000,500000,1000000].map(n=>({contextWindow:n,selectable:r.pi_context_window!==null&&(!r.official_model_limit||n<=r.official_model_limit.contextWindow)}));return r;
}
export function formatPiContext(r){const n=x=>x===null?'未知':x.toLocaleString('en-US');return `直接設定 Pi 上下文容量\n目前模型：${r.model??'未知'}\n模型官方上限（OpenAI API 規格）：${n(r.official_model_limit?.contextWindow??null)} Token${r.official_model_limit?`（查核 ${r.official_model_limit.checked_at}）`:''}\nPi 目前執行中容量：${n(r.pi_context_window)} Token\nmodels.json 明確覆寫：${r.disk_override===null?'未設定':n(r.disk_override)+' Token'}\n目前連線／訂閱實際上限：尚未確認\n模型最大輸出：${n(r.model_max_output)} Token（不是預留量）\n原生目前用量：${n(r.native_usage)} Token\n${r.pending_transaction?'交易尚未完成，請 recover；目前禁止模型請求。\n':''}保存會直接改 models.json 的模型 contextWindow，ACM 只套用 Pi 容量與百分比，不再額外限制。500K／1M 可手動覆寫；官方 API 規格不保證目前 Codex 連線可用，buffer／額度／成本限制仍可能存在。調大不恢復已移出窗口的訊息。`+(r.official_model_limit?'\n官方來源：'+r.official_model_limit.source:'');}
