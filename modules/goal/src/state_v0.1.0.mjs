import {randomUUID} from 'node:crypto';
export const GOAL_ENTRY='peicd100:goal-state';
export const RETRY_MS=5000;
export const GOAL_EVENT='peicd100:goal-changed';
const statuses=new Set(['active','paused','complete']);
const reasons=new Set(['user','interrupted','disabled','restored','branch_changed','quota_exhausted','authentication','permission','invalid_request','unknown','blocked']);
const clone=x=>structuredClone(x);
export function text(value,label='文字',max=16384){if(typeof value!=='string'||!value.trim()||Buffer.byteLength(value,'utf8')>max)throw new Error(`${label}不可空白或超過${max} bytes`);return value.trim();}
export function initialGoal(sessionId){return {schema:1,sessionId,enabled:true,revision:0,goal:null};}
export function validateGoalState(s){
 if(!s||s.schema!==1||typeof s.sessionId!=='string'||typeof s.enabled!=='boolean'||!Number.isSafeInteger(s.revision)||s.revision<0)throw new Error('Goal資料格式不相容');
 if(s.goal===null)return s;
 const g=s.goal;if(!g||typeof g.id!=='string'||!g.id.trim()||g.id!==g.id.trim()||g.id.length>200||/[\x00-\x1f\x7f]/.test(g.id)||!Number.isSafeInteger(g.revision)||g.revision<1||g.revision>s.revision||!statuses.has(g.status)||!['createdAt','updatedAt'].every(k=>Number.isFinite(g[k])&&g[k]>=0)||!s.enabled&&g.status==='active')throw new Error('Goal狀態無效');
 text(g.objective,'目標');if(!Array.isArray(g.criteria)||g.criteria.length>32)throw new Error('Goal驗收條件無效');for(const c of g.criteria)text(c,'驗收條件',4096);
 if(g.status==='paused'?!reasons.has(g.reason):g.reason!==null)throw new Error('Goal暫停原因無效');
 if(g.waiting!==null){if(!g.waiting||g.status!=='active'||!['user','external'].includes(g.waiting.kind)||(g.waiting.resumeAt!==null&&(!Number.isFinite(g.waiting.resumeAt)||g.waiting.resumeAt<0||g.waiting.kind!=='external')))throw new Error('Goal等待狀態無效');text(g.waiting.reason,'等待說明',2048);}
 if(!g.retry||!Number.isSafeInteger(g.retry.attempt)||g.retry.attempt<0||![null,'connection'].includes(g.retry.reason)||(g.retry.nextAt!==null&&(!Number.isFinite(g.retry.nextAt)||g.retry.nextAt<0||g.status!=='active'||g.waiting!==null||g.retry.attempt<1)))throw new Error('Goal重試狀態無效');
 if(!Array.isArray(g.verification)||g.verification.length>32||(g.status==='complete'&&g.verification.length===0))throw new Error('Goal完成證據無效');for(const evidence of g.verification)text(evidence,'完成證據',4096);
 return s;
}
export function readGoal(entries,sessionId){for(let i=(entries?.length??0)-1;i>=0;i--){const e=entries[i];if(e.type==='custom'&&e.customType===GOAL_ENTRY)return clone(validateGoalState(e.data));}return initialGoal(sessionId);}
export function matchesGoal(s,id,revision){return !!s.goal&&s.goal.id===id&&s.goal.revision===revision;}
function check(s,c){if(!matchesGoal(s,c.id,c.revision))throw new Error('Goal ID或revision已變更，請先查詢最新狀態');}
function authorized(meta){if(meta.authorized!==true)throw new Error('此操作需要使用者明確授權');}
export function changeGoal(state,command,meta={}){
 validateGoalState(state);const s=clone(state),c=command??{},now=meta.now??Date.now();
 if(c.action==='get')return s;
 if(c.action==='enable'){
  if(typeof c.enabled!=='boolean')throw new Error('enabled須為boolean');if(s.enabled===c.enabled)return s;s.enabled=c.enabled;
  if(!c.enabled&&s.goal?.status==='active'){s.goal.status='paused';s.goal.reason='disabled';s.goal.waiting=null;s.goal.retry.nextAt=null;s.goal.revision++;s.goal.updatedAt=now;}
 }else if(c.action==='create'){
  authorized(meta);if(!s.enabled)throw new Error('請先啟用Goal功能');if(s.goal&&s.goal.status!=='complete')throw new Error('目前已有Goal，請編輯或明確刪除後再建立');
  if(c.criteria!==undefined&&(!Array.isArray(c.criteria)||c.criteria.length>32))throw new Error('驗收條件須為最多32項的陣列');const objective=text(c.objective,'目標'),criteria=(c.criteria??[]).map(x=>text(x,'驗收條件',4096));
  s.goal={id:meta.id??randomUUID(),revision:1,objective,criteria,status:c.draft?'paused':'active',reason:c.draft?'user':null,waiting:null,retry:{attempt:0,nextAt:null,reason:null},verification:[],createdAt:now,updatedAt:now};
 }else{
  check(s,c);const g=s.goal;
  if(c.action==='delete'){authorized(meta);s.goal=null;}
  else{
   if(c.action==='edit'){authorized(meta);if(c.objective!==undefined)g.objective=text(c.objective,'目標');if(c.criteria!==undefined){if(!Array.isArray(c.criteria)||c.criteria.length>32)throw new Error('驗收條件最多32項');g.criteria=c.criteria.map(x=>text(x,'驗收條件',4096));}g.verification=[];if(g.status==='complete'){g.status='paused';g.reason='user';}g.retry.nextAt=null;}
   else if(c.action==='pause'){const reason=c.reason??'user';if(!reasons.has(reason))throw new Error('未知暫停原因');if(g.status==='complete')throw new Error('已完成Goal不能暫停');g.status='paused';g.reason=reason;g.waiting=null;g.retry.nextAt=null;}
   else if(c.action==='resume'){authorized(meta);if(!s.enabled)throw new Error('請先啟用Goal功能');if(g.status==='complete')throw new Error('已完成Goal不能恢復');g.status='active';g.reason=null;g.waiting=null;g.retry.nextAt=null;}
   else if(c.action==='wait'){if(g.status!=='active')throw new Error('僅執行中的Goal可等待');if(!['user','external'].includes(c.kind))throw new Error('等待種類須為user或external');const resumeAt=c.resumeAt??null;if(resumeAt!==null&&(c.kind!=='external'||!Number.isFinite(resumeAt)||resumeAt<=now))throw new Error('自動喚醒僅允許未來的external時間');g.waiting={kind:c.kind,reason:text(c.reason,'等待說明',2048),resumeAt};g.retry.nextAt=null;}
   else if(c.action==='wake'){if(g.status!=='active'||!g.waiting||g.waiting.kind!=='external')throw new Error('Goal不在可自動恢復的外部等待');g.waiting=null;}
   else if(c.action==='retry'){if(g.status!=='active'||g.waiting)throw new Error('Goal目前不可重試');g.retry={attempt:g.retry.attempt+1,nextAt:now+RETRY_MS,reason:'connection'};}
   else if(c.action==='retry_dispatched'){if(g.status!=='active'||g.waiting||g.retry.nextAt===null)throw new Error('沒有待送出的重試');g.retry.nextAt=null;}
   else if(c.action==='complete'){
    if(g.status!=='active')throw new Error('僅執行中的Goal可回報完成');if(meta.openProgress)throw new Error('關聯Progress仍有未完成或受阻步驟，請先核對');
    if(!Array.isArray(c.verification)||c.verification.length===0||c.verification.length>32)throw new Error('完成須列出可查證的驗收結果/證據，不接受只勾完清單');
    g.verification=c.verification.map(x=>text(x,'完成證據',4096));g.status='complete';g.reason=null;g.waiting=null;g.retry.nextAt=null;
   }else throw new Error('未知Goal操作');
   g.revision++;g.updatedAt=now;
  }
 }
 s.revision++;return validateGoalState(s);
}
export function restoredGoal(state,sessionId,reason='restored'){
 let s=clone(validateGoalState(state));if(s.goal?.status==='active')s=changeGoal(s,{action:'pause',id:s.goal.id,revision:s.goal.revision,reason});
 if(s.sessionId!==sessionId){s.sessionId=sessionId;s.revision++;}return s;
}
// Classify only explicit account/auth failures. Generic 429 is NOT account exhaustion.
// Raw provider errors never enter durable Goal state or notification payloads.
export function classifyFailure(message){
 const raw=typeof message==='string'?message:message?.errorMessage??'';const value=raw.slice(0,16384);
 if(/insufficient_quota|insufficient[_ ]credits|insufficient[_ ]balance|credit balance.{0,40}(?:low|exhaust|insufficient)|billing[_ ]hard[_ ]limit/i.test(value))return 'quota_exhausted';
 if(!/rate.?limit|per (?:second|minute)|requests? per|tokens? per/i.test(value)&&/(?:you|your|account|plan|chatgpt|subscription).{0,80}usage limit/i.test(value)&&/(?:hit|reach|exceed|exhaust)/i.test(value))return 'quota_exhausted';
 if(/invalid[_ -]api[_ -]key|authentication[_ -](?:failed|error)|(?:^|\D)401(?:\D|$)|token.{0,20}(?:expired|revoked)/i.test(value))return 'authentication';
 if(/permission[_ -]denied|access[_ -]denied|not authorized|not permitted/i.test(value))return 'permission';
 if(/invalid_request_error|invalid request|unsupported.{0,25}(?:model|parameter)|model.{0,25}(?:does not exist|not found)/i.test(value))return 'invalid_request';
 if(/ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|fetch failed|network error|socket hang up|connection.{0,20}(?:closed|reset|lost)|timed? ?out|timeout|rate.?limit|too many requests|(?:^|\D)(?:429|500|502|503|504)(?:\D|$)|service unavailable|overloaded/i.test(value))return 'transient';
 return 'unknown';
}
export function shouldContinue(s){return s.enabled&&s.goal?.status==='active'&&!s.goal.waiting&&s.goal.retry.nextAt===null;}
export function publicGoal(s){return clone(s);}
export const reasonLabel={user:'使用者暫停',interrupted:'代理已中斷',disabled:'停用時已暫停，待明確恢復',restored:'已讀回，待明確恢復',branch_changed:'已切換分支，待明確恢復',quota_exhausted:'帳戶或方案額度不足',authentication:'登入或憑證失效',permission:'權限不足',invalid_request:'請求設定無效',unknown:'UNKNOWN，需人工確認錯誤原因',blocked:'工作受阻'};
