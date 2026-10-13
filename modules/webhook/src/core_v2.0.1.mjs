import {promises as fs,constants} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import https from 'node:https';
import {Store as LegacyStore,validateEndpoint,resolveDestination,notificationId,settledSnapshot,publicAddress} from './core_v1.6.0.mjs';
import {replaceFile} from './atomic-file_v1.2.2.mjs';
export {validateEndpoint,resolveDestination,notificationId,settledSnapshot,publicAddress};
export const VERSION='2.0.1',TIMEOUT_MS=8000;
export const PROVIDERS=['telegram','discord','slack','generic'];
export const DEFAULT_GOAL_NOTIFY=['complete','paused','blocked','usage_limited','budget_limited','retry_exhausted'];
const hash=x=>createHash('sha256').update(x).digest('hex');
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const clean=(x,n=100)=>String(x??'').replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ').replace(/@everyone|@here|<@[^>]*>|<!(?:everyone|here|channel)>/gi,'[提及已隱藏]').replace(/https?:\/\/\S+|\b\d{5,20}:[A-Za-z0-9_-]{20,200}\b|\bBearer\s+\S+/gi,'[敏感資料已隱藏]').slice(0,n);
export function validateProfile(format,p){
 if(!PROVIDERS.includes(format)||!object(p)||typeof p.authorized!=='boolean')throw new Error('Invalid notification profile.');
 if(format==='telegram'){
  if(typeof p.token!=='string'||!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(p.token)||typeof p.chatId!=='string'||!/^(-?\d{1,20}|@[A-Za-z][A-Za-z0-9_]{4,63})$/.test(p.chatId))throw new Error('Invalid Telegram token/chat ID.');
  return {authorized:p.authorized,token:p.token,chatId:p.chatId};
 }
 if(typeof p.key!=='string'||p.key.length>4096||/[\x00-\x1f\x7f]/.test(p.key))throw new Error('Invalid notification credential.');
 return {authorized:p.authorized,url:validateEndpoint(p.url).href,key:p.key};
}
export function validateRegistry(r){
 if(!object(r)||r.version!==2||typeof r.revision!=='string'||!/^(implicit|legacy:[a-f0-9]{64}|[a-f0-9-]{36})$/.test(r.revision)||r.active!==null&&!PROVIDERS.includes(r.active)||!object(r.profiles)||Object.keys(r.profiles).some(k=>!PROVIDERS.includes(k))||typeof r.legacyConsentAllowed!=='boolean')throw new Error('Invalid notification registry.');
 const profiles=Object.fromEntries(Object.entries(r.profiles).map(([f,p])=>[f,validateProfile(f,p)]));
 if(r.active!==null&&!profiles[r.active])throw new Error('Selected notification profile missing.');
 return {version:2,revision:r.revision,active:r.active,profiles,legacyConsentAllowed:r.legacyConsentAllowed};
}
async function readPrivate(path){let h;try{h=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const s=await h.stat();if(!s.isFile()||s.size>131072||process.getuid&&s.uid!==process.getuid()||process.platform!=='win32'&&(s.mode&0o077))throw new Error('Unsafe notification storage.');return JSON.parse(await h.readFile('utf8'));}finally{await h?.close();}}
async function directory(path){await fs.mkdir(path,{recursive:true,mode:0o700});const s=await fs.lstat(path);if(!s.isDirectory()||s.isSymbolicLink()||process.getuid&&s.uid!==process.getuid())throw new Error('Unsafe notification directory.');await fs.chmod(path,0o700);}
async function atomic(path,value){const temp=path+'.'+randomUUID()+'.tmp';let h;try{h=await fs.open(temp,'wx',0o600);await h.writeFile(JSON.stringify(value,null,2)+'\n');await h.sync();await h.close();h=undefined;await replaceFile(temp,path);}finally{await h?.close();await fs.unlink(temp).catch(()=>{});}}
export function profileFingerprint(config){return hash(JSON.stringify([config.format,config.url,config.key,config.chatId??'']));}
export class Store extends LegacyStore {
 constructor(root){super(root);this.registryPath=join(root,'notify.json');}
 async readRegistry(){
  try{return validateRegistry(await readPrivate(this.registryPath));}catch(e){if(e.code!=='ENOENT')throw new Error('Notify profiles unavailable; fail closed.');}
  const old=await super.readConfig();
  if(!old)return {version:2,revision:'implicit',active:null,profiles:{},legacyConsentAllowed:true};
  const global=await super.readGlobalState();
  const profile=validateProfile(old.format,{authorized:old.enabled&&global.enabled,url:old.url,key:old.key});
  // Read-only projection. Old config/global/event receipts are never rewritten.
  return {version:2,revision:'legacy:'+hash(JSON.stringify([old.format,profile,global])),active:old.format,profiles:{[old.format]:profile},legacyConsentAllowed:global.enabled};
 }
 async readConfig(){const r=await this.readRegistry();if(r.active===null)return null;const p=r.profiles[r.active];return {version:2,format:r.active,enabled:p.authorized,url:r.active==='telegram'?`https://api.telegram.org/bot${p.token}/sendMessage`:p.url,key:r.active==='telegram'?'':p.key,...(r.active==='telegram'?{chatId:p.chatId}:{}),revision:r.revision,legacyConsentAllowed:r.legacyConsentAllowed};}
 async mutate(expectedRevision,change){
  await directory(this.root);const lock=this.registryPath+'.lock';await fs.mkdir(lock,{mode:0o700});
  try{const current=await this.readRegistry();if(current.revision!==expectedRevision)throw new Error('Notification profile changed; no overwrite.');const changed=change(structuredClone(current));const next=validateRegistry({...changed,revision:randomUUID()});await atomic(this.registryPath,next);return next;}finally{await fs.rmdir(lock);}
 }
 async writeDefault(defaultEnabled,expected){if(typeof defaultEnabled!=='boolean')throw new Error('Invalid default choice.');await directory(this.root);const lock=this.preferencesPath+'.lock';await fs.mkdir(lock,{mode:0o700});try{if(expected!==undefined&&await this.readDefault()!==expected)throw new Error('Default preference changed; no overwrite.');await atomic(this.preferencesPath,{version:1,defaultEnabled});}finally{await fs.rmdir(lock);}}
 async materializeLegacy(){const r=await this.readRegistry();if(!r.revision.startsWith('legacy:'))return r;try{return await this.mutate(r.revision,current=>current);}catch(error){const fresh=await this.readRegistry();if(!fresh.revision.startsWith('legacy:'))return fresh;throw error;}}
 async saveProfile(format,p,expectedRevision){const profile=validateProfile(format,p);return this.mutate(expectedRevision,r=>({...r,active:format,profiles:{...r.profiles,[format]:profile}}));}
 async select(format,expectedRevision){return this.mutate(expectedRevision,r=>{if(!r.profiles[format]?.authorized)throw new Error('Configure and authorize this channel first.');return {...r,active:format};});}
 async clearSelected(expectedRevision){return this.mutate(expectedRevision,r=>{const profiles={...r.profiles};delete profiles[r.active];return {...r,active:null,profiles};});}
}
export function stopDetails(event){
 const status=event.goalStatus??event.outcome;
 const values={retry_exhausted:['重試耗盡','上游請求重試已耗盡，目前未安排自動恢復。','送出 follow-up 或執行 /goal resume，處理後再重試。'],completed:['完成','任務已正常結束。','無需處理。'],complete:['完成','目標已正常完成。','無需處理。'],aborted:['已取消','本次工作已被取消，沒有已安排的自動續跑。','需要時手動繼續工作。'],paused:['已暫停','目標已明確暫停，未安排自動繼續。','需要時手動恢復目標。'],blocked:['受阻','目標已標記受阻；未提供可安全顯示的詳細停止原因。','檢查阻塞條件，處理後手動繼續。'],usage_limited:['額度停止','目標因使用額度限制停止。','檢查額度或稍後手動繼續。'],budget_limited:['預算停止','目標已達設定的 Token／時間預算限制。','確認是否調整預算後繼續。'],error:['錯誤停止','本次工作因錯誤確定停止；未提供可安全顯示的詳細停止原因。','檢查本機狀態，處理後手動繼續。']};
 const [label,reason,next]=values[status]??['停止','未提供明確停止原因。','檢查本機狀態。'];
 return {status,label,reason:!event.goalStatus&&event.outcome==='error'&&event.stopReason==='length'?'單次模型回應達到長度限制，工作已停止。':reason,next,completed:status==='completed'||status==='complete'};
}
export function formatSendTime(date){if(!(date instanceof Date)||!Number.isFinite(date.getTime()))throw new Error('Invalid send time.');return new Date(date.getTime()+8*3600000).toISOString().slice(0,19).replace('T',' ')+'（UTC+8）';}
export function makePayload(event,format,sentAt=new Date()){
 const details=stopDetails(event),name=clean(event.sessionName,80).trim()||`未命名對話（${clean(event.sessionId,12)}）`;
 const title=event.test?'需要處理':details.completed?'已完成':'需要處理';
 const text=`${details.completed&&!event.test?'✅':'🔔'} ${name}｜${title}\n\n狀態：${event.test?'測試通知':details.label}\n原因：${event.test?'使用者明確要求的通知測試。':details.reason}\n下一步：${event.test?'無需處理。':details.next}\n\n時間：${formatSendTime(sentAt)}`;
 if(format==='telegram')return {chat_id:event.chatId,text};
 if(format==='discord')return {content:text,allowed_mentions:{parse:[]}};
 if(format==='slack')return {text};
 return {schema_version:2,event:event.test?'pi.notify.test':event.goalStatus?'pi.goal.stopped':'pi.agent.settled',notification_id:event.id,status:event.outcome??details.status,reason:details.reason,next_action:details.next,session_id:clean(event.sessionId),session_name:name,...(event.goalStatus?{goal_id:clean(event.goalId,200),goal_status:event.goalStatus}:{}),sent_at:sentAt.toISOString(),text};
}
export function postJson(url,destination,key,payload,{signal,timeoutMs=TIMEOUT_MS,notificationId:id,telegram=false}={}){
 const body=Buffer.from(JSON.stringify(payload));if(body.length>4096)return Promise.reject(new Error('Notify payload too large.'));
 return new Promise((resolve,reject)=>{
  let done=false,timer;const finish=(error,result)=>{if(done)return;done=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(new Error('Notify request acceptance unknown.')):resolve(result);};
  const request=https.request(url,{method:'POST',agent:false,servername:url.hostname,rejectUnauthorized:true,family:destination.family,autoSelectFamily:false,lookup:(_h,_o,cb)=>cb(null,destination.address,destination.family),headers:{'Content-Type':'application/json','Content-Length':body.length,'User-Agent':'pi-notify/2.0.1','X-Pi-Notification-Id':id??payload.notification_id??'',...(key?{Authorization:`Bearer ${key}`}:{})}},response=>{
   const code=response.statusCode;
   if(!telegram||!(code>=200&&code<300)){response.destroy();finish(null,{state:code>=200&&code<300?'ACCEPTED':'HTTP_REJECTED',http_status:code});return;}
   // Telegram can reject at the API layer even on HTTP 200. Body is bounded,
   // never logged/stored/echoed; expose only an acceptance boolean.
   let bytes=0,chunks=[];
   response.on('data',chunk=>{bytes+=chunk.length;if(bytes>16384){response.destroy();finish(new Error('Oversized API response'));}else chunks.push(Buffer.from(chunk));});
   response.on('error',()=>finish(new Error('API read failed')));response.on('aborted',()=>finish(new Error('API read aborted')));
   response.on('end',()=>{try{const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(typeof data?.ok!=='boolean')throw new Error('Missing API acceptance');finish(null,{state:data.ok?'ACCEPTED':'API_REJECTED',http_status:code});}catch{finish(new Error('Unknown API acceptance'));}});
  });
  const abort=()=>{request.destroy();finish(new Error('abort'));};timer=setTimeout(()=>{request.destroy();finish(new Error('timeout'));},timeoutMs);request.on('error',()=>finish(new Error('network')));signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted){abort();return;}request.end(body);
 });
}
export async function deliver(store,config,event,{resolver=lookup,transport=postJson,signal,timeoutMs=TIMEOUT_MS,clock=()=>new Date(),preDispatch=async()=>true}={}){
 if(!config?.enabled||event.goalStatus&&!DEFAULT_GOAL_NOTIFY.includes(event.goalStatus)||!event.goalStatus&&!['completed','error','aborted'].includes(event.outcome))return {state:'SKIPPED'};
 const url=validateEndpoint(config.url);if(config.format==='telegram'&&(url.hostname!=='api.telegram.org'||!/^\/bot\d{5,20}:[A-Za-z0-9_-]{20,200}\/sendMessage$/.test(url.pathname)||url.search))throw new Error('Invalid Telegram destination.');
 const same=async()=>{const fresh=await store.readConfig();return !!fresh&&fresh.revision===config.revision&&fresh.enabled===(config.sourcePermission??config.enabled)&&profileFingerprint(fresh)===profileFingerprint(config);};
 if(!await same())return {state:'SKIPPED'};
 const receipt=await store.claim(event.id,{session_id:clean(event.sessionId),status:event.goalStatus??event.outcome,endpoint_host:url.hostname,endpoint_fingerprint:hash(url.href),provider:config.format,test:event.test===true});if(!receipt)return {state:'DUPLICATE_NO_RESEND'};
 let result,dispatched=false,timer;const deadline=Date.now()+timeoutMs;
 try{
  const destination=await Promise.race([resolveDestination(url,resolver),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('DNS timeout')),timeoutMs);})]);clearTimeout(timer);
  if(signal?.aborted||Date.now()>=deadline||!await same()||!await preDispatch()||!await same()||signal?.aborted||Date.now()>=deadline)throw new Error('Cancelled or channel changed.');
  const payload=makePayload({...event,chatId:config.chatId},config.format,clock());dispatched=true;
  result=await transport(url,destination,config.key,payload,{signal,timeoutMs:Math.max(1,deadline-Date.now()),notificationId:event.id,telegram:config.format==='telegram'});
  if(!['ACCEPTED','HTTP_REJECTED','API_REJECTED'].includes(result?.state))throw new Error('Unconfirmed acceptance.');
 }catch{result={state:dispatched?'UNKNOWN':'FAILED_PRECHECK',reason:dispatched?'No confirmed acceptance; never auto-resend.':'Validation/channel/session changed; no POST submitted.'};}finally{clearTimeout(timer);}
 await store.finish(event.id,receipt,result);return result;
}
