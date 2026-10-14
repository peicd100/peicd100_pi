// Explicit migration only. Normal ACM startup/requests never call a writer here.
import {existsSync,lstatSync,readFileSync,mkdirSync,writeFileSync,openSync,closeSync,fsyncSync,fchmodSync,renameSync,unlinkSync,rmdirSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {object,hash,modelIdentity,modelFingerprint,parseDocument,transactionPath} from './pi-context_v1.10.0.mjs';
import {mergeSettings} from './pi-context-txn_v1.13.0.mjs';
const fields=['reserveTokens','keepRecentTokens'];
const defaults={reserveTokens:16384,keepRecentTokens:20000};
function safeDir(path){if(existsSync(path)){const s=lstatSync(path);if(!s.isDirectory()||s.isSymbolicLink())throw new Error('設定／備份目錄不安全。');}}
function read(path,max=1048576){if(!existsSync(path))return undefined;const s=lstatSync(path);if(!s.isFile()||s.isSymbolicLink()||s.size>max)throw new Error('設定／備份檔不安全或過大。');return readFileSync(path,'utf8');}
function privateDir(dir){safeDir(dir);mkdirSync(dir,{recursive:true,mode:0o700});}
function replace(path,text,expected,mode=0o600){
 const temp=join(dirname(path),'.native-repair-'+randomUUID()+'.tmp');let fd;
 try{fd=openSync(temp,'wx',0o600);writeFileSync(fd,text);fchmodSync(fd,mode);fsyncSync(fd);closeSync(fd);fd=undefined;if(read(path,8388608)!==expected)throw new Error('儲存期間檔案已變更，未覆寫。');renameSync(temp,path);}
 finally{if(fd!==undefined)closeSync(fd);if(existsSync(temp))unlinkSync(temp);}
}
function locked(path,fn){
 const lock=path+'.lock',id=randomUUID(),owner=join(lock,'.acm-native-repair-owner.json');mkdirSync(lock);
 try{writeFileSync(owner,JSON.stringify({id,pid:process.pid}),{flag:'wx',mode:0o600});return fn();}
 finally{if(read(owner)===JSON.stringify({id,pid:process.pid})&&readdirSync(lock).length===1){unlinkSync(owner);rmdirSync(lock);}}
}
function snapshot(o){
 const dir=dirname(o.path);safeDir(dir);if(existsSync(transactionPath(dir)))throw new Error('容量交易尚未恢復，未操作原生設定。');if(o.projectTrusted)safeDir(join(o.cwd,'.pi'));const raw=read(o.path),settings=parseDocument(raw),mode=raw===undefined?0o600:lstatSync(o.path).mode&0o777;
 const modelsRaw=read(join(dir,'models.json'));const projectRaw=o.projectTrusted?read(join(o.cwd,'.pi','settings.json')):undefined,project=parseDocument(projectRaw),effective=mergeSettings(settings,project);
 if(JSON.stringify({acm:effective.acm,compaction:effective.compaction})!==JSON.stringify({acm:o.runtimeSettings.acm,compaction:o.runtimeSettings.compaction}))throw new Error('磁碟與執行中設定不同，請先閒置 /reload。');
 const key=modelIdentity(o.model);safeDir(join(dir,'config'));safeDir(join(dir,'config','pi-context'));
 const backupRaw=read(join(dir,'config','pi-context','last-backup.json'),8388608);
 let backup;
 if(backupRaw!==undefined){const b=parseDocument(backupRaw);if(b.version!==1||!object(b.before)||b.before.settings!==null&&typeof b.before.settings!=='string')throw new Error('舊容量備份格式未知，未猜測原值。');backup=parseDocument(b.before.settings??undefined);}
 const fingerprint=hash(JSON.stringify([raw,mode,modelsRaw,projectRaw,backupRaw,modelFingerprint(o.model)]));
 return {dir,raw,mode,modelsRaw,settings,project,effective,key,backup,fingerprint};
}
export function nativeStatus(settings,model){
 const c=settings.compaction??{},key=model?.provider+'/'+model?.id,override=c.modelOverrides?.[key]??{};
 const reserveTokens=override.reserveTokens??c.reserveTokens??defaults.reserveTokens,keepRecentTokens=override.keepRecentTokens??c.keepRecentTokens??defaults.keepRecentTokens;
 const token=v=>Number.isSafeInteger(v)&&v>=0;
 const valid=object(c)&&object(override)&&(c.enabled===undefined||typeof c.enabled==='boolean')&&(c.modelOverrides===undefined||object(c.modelOverrides))&&(c.modelOverrides?.[key]===undefined||object(c.modelOverrides[key]))&&fields.every(f=>(c[f]===undefined||token(c[f]))&&(override[f]===undefined||token(override[f])))&&token(reserveTokens)&&token(keepRecentTokens);
 return {owner:'Pi',scope:'shared-model-not-session',enabled:c.enabled!==false,reserveTokens:valid?reserveTokens:'INVALID',keepRecentTokens:valid?keepRecentTokens:'INVALID',valid,triggerTokens:valid&&Number.isSafeInteger(model?.contextWindow)?model.contextWindow-reserveTokens:null,acmSynchronization:false};
}
export function inspectNativeRepair(o,{mode='remove'}={}){
 if(!['remove','backup'].includes(mode))throw new Error('修復模式無效。');const s=snapshot(o),next=structuredClone(s.settings);
 const owned=s.settings.acm?.autoInit?.version===1?s.settings.acm.autoInit.models?.[s.key]:undefined;
 const current=s.settings.compaction?.modelOverrides?.[s.key],original=s.backup?.compaction?.modelOverrides?.[s.key];
 if(mode==='backup'&&!s.backup)throw new Error('沒有容量交易前備份，不能宣稱還原原值。');
 const operations=[],unknown=[];
 for(const field of fields){
  if(!object(owned)||!Number.isSafeInteger(owned[field])||owned[field]<0||!object(current)||!Object.hasOwn(current,field)||current[field]!==owned[field]){unknown.push(field+'：缺少 ACM 管理證據或值已被修改，保持。');continue;}
  const present=mode==='backup'&&object(original)&&Object.hasOwn(original,field),value=present?original[field]:undefined;
  if(present&&(!Number.isSafeInteger(value)||value<0))throw new Error('備份原生欄位無效，未還原。');
  if(present&&value===current[field])continue;
  operations.push({field,before:current[field],action:present?'restore':'remove',...(present?{value}: {})});
  if(present)next.compaction.modelOverrides[s.key][field]=value;else delete next.compaction.modelOverrides[s.key][field];
  // Retire ONLY the matching field's claim; retain user-modified and other models.
  delete next.acm.autoInit.models[s.key][field];
 }
 if(operations.length){if(Object.keys(next.compaction.modelOverrides[s.key]).length===0)delete next.compaction.modelOverrides[s.key];if(Object.keys(next.acm.autoInit.models[s.key]).length===0)delete next.acm.autoInit.models[s.key];}
 const general=Object.fromEntries(fields.filter(f=>s.settings.compaction?.[f]!==undefined).map(f=>[f,{value:s.settings.compaction[f],action:'preserve-ownership-unknown'}]));
 return {fingerprint:s.fingerprint,key:s.key,mode,backupAvailable:s.backup!==undefined,operations,unknown,general,effectiveAfter:nativeStatus(mergeSettings(next,s.project),o.model),next};
}
function paths(dir){safeDir(join(dir,'config'));safeDir(join(dir,'config','acm'));safeDir(join(dir,'config','acm','native-repair'));return {folder:join(dir,'config','acm','native-repair'),last:join(dir,'config','acm','native-repair','last.json')};}
export function commitNativeRepair(o,{fingerprint,mode='remove',guard=()=>{}}={}){
 return locked(o.path,()=>{
  guard();const s=snapshot(o),plan=inspectNativeRepair(o,{mode});if(s.fingerprint!==fingerprint||plan.fingerprint!==fingerprint)throw new Error('確認後設定、備份或模型已變，未修改。');if(!plan.operations.length)throw new Error('沒有可安全修復的 ACM 管理欄位。');
  const p=paths(s.dir);for(const d of [join(s.dir,'config'),join(s.dir,'config','acm'),p.folder])privateDir(d);
  const id=randomUUID(),receiptPath=join(p.folder,id+'.json'),after=JSON.stringify(plan.next,null,2)+'\n';
  const receipt={kind:'acm-native-repair-v1',id,state:'PREPARED',model:modelFingerprint(o.model),modelsHash:hash(s.modelsRaw??'ABSENT'),key:s.key,mode:s.mode,before:s.raw,after,beforeHash:hash(s.raw),afterHash:hash(after),fields:plan.operations};
  replace(receiptPath,JSON.stringify(receipt)+'\n',undefined); // durable backup BEFORE settings mutation
  const prior=read(p.last);replace(p.last,JSON.stringify({id})+'\n',prior);
  guard();if(snapshot(o).fingerprint!==fingerprint)throw new Error('保存前配置已變，保留備份但未覆寫。');
  (o.replace??replace)(o.path,after,s.raw,s.mode);
  if(read(o.path)!==after)throw new Error('修復寫入未通過驗證，保留備份供回復。');
  replace(receiptPath,JSON.stringify({...receipt,state:'COMMITTED'})+'\n',read(receiptPath));return {id,operations:plan.operations,effectiveAfter:plan.effectiveAfter};
 });
}
export function inspectNativeRollback(o){
 const s=snapshot(o),p=paths(s.dir),pointer=parseDocument(read(p.last));if(typeof pointer.id!=='string'||!/^[a-f0-9-]{36}$/.test(pointer.id))throw new Error('沒有可信的修復收據。');
 const receiptPath=join(p.folder,pointer.id+'.json'),raw=read(receiptPath,8388608),r=parseDocument(raw);
 if(r.kind!=='acm-native-repair-v1'||r.id!==pointer.id||r.key!==s.key||r.model!==modelFingerprint(o.model)||r.modelsHash!==hash(s.modelsRaw??'ABSENT')||s.mode!==r.mode||!['PREPARED','COMMITTED'].includes(r.state)||typeof r.before!=='string'||typeof r.after!=='string'||hash(r.before)!==r.beforeHash||hash(r.after)!==r.afterHash||s.raw!==r.after||!Number.isInteger(r.mode)||r.mode<0||r.mode>0o777)throw new Error('修復收據無效或已有後續修改，未強制回復。');
 return {fingerprint:hash(JSON.stringify([s.fingerprint,raw])),receiptPath,raw,r};
}
export function rollbackNativeRepair(o,{fingerprint,guard=()=>{}}={}){
 return locked(o.path,()=>{guard();const p=inspectNativeRollback(o);if(p.fingerprint!==fingerprint)throw new Error('確認後修復收據／配置已變，未回復。');guard();replace(o.path,p.r.before,p.r.after,p.r.mode);if(read(o.path)!==p.r.before)throw new Error('回復未通過驗證。');replace(p.receiptPath,JSON.stringify({...p.r,state:'ROLLED_BACK'})+'\n',p.raw);return {rolled_back:true};});
}
export function registerNativeRepair(pi,options){
 let busy=false;
 pi.registerCommand('acm-repair',{description:'只在中文選單明確確認後修復 ACM 遺留原生設定；可回復',handler:async(_args,ctx)=>{
  if(busy)return;busy=true;let saved=false;
  try{
   const identity=()=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile(),ctx.sessionManager.getLeafId?.(),modelFingerprint(ctx.model)]),start=identity();
   const guard=()=>{if(!ctx.isIdle()||ctx.hasPendingMessages()||identity()!==start)throw new Error('工作、佇列、對話或模型已變，未操作。');};guard();
   const o=()=>options(ctx),plan=inspectNativeRepair(o());
   if(!ctx.hasUI&&ctx.mode!=='tui')throw new Error('修復需要互動確認，未改檔。');
   const labels=['移除已確認 ACM 模型覆寫，交回 Pi','依既有容量交易前備份還原欄位','回復上次 ACM 修復','取消'];
   const choice=await ctx.ui.select(`ACM 遺留原生設定修復\n目前模型 ${plan.key}\n可確認欄位：${plan.operations.map(x=>x.field+'='+x.before).join('、')||'無'}\n一般 compaction 欄位來源不明，一律保持。沒有首次修改前證據，不宣稱恢復最初設定。`,labels);if(!choice||choice===labels[3])return;guard();
   let pending,rollback=choice===labels[2];
   if(rollback)pending=inspectNativeRollback(o());else if(choice===labels[0]||choice===labels[1])pending=inspectNativeRepair(o(),{mode:choice===labels[1]?'backup':'remove'});else return;
   if(!rollback&&!pending.operations.length){ctx.ui.notify('沒有可安全修復的欄位；原設定保持。','info');return;}
   const text=rollback?'依上次私密收據精準回復；任何後續設定修改都會拒絕覆寫。':`${pending.operations.map(x=>x.field+': '+x.before+' → '+(x.action==='restore'?x.value:'移除模型覆寫')).join('\n')}\n修復後有效原生 reserve=${pending.effectiveAfter.reserveTokens}／keep=${pending.effectiveAfter.keepRecentTokens}。一般與專案覆寫仍可能影響門檻。\n${pending.mode==='backup'?'還原容量交易前備份，不保證是首次 ACM 修改前。':'沒有原始值證據；移除已確認覆寫，不宣稱恢復原狀。'}\n其他模型、一般 compaction、已被修改欄位保持。JSON 會標準化；先保存私密原文字備份，再 CAS／驗證。`;
   if(!await ctx.ui.confirm(rollback?'確認回復 ACM 修復？':'確認修復原生設定？',text))return;guard();await ctx.waitForIdle();guard();
   if(rollback)rollbackNativeRepair(o(),{fingerprint:pending.fingerprint,guard});else commitNativeRepair(o(),{fingerprint:pending.fingerprint,mode:pending.mode,guard});saved=true;
   ctx.ui.notify('原生設定已保存並驗證；將在閒置時 reload，ACM 對話比例不變。','info');
  }catch{ctx.ui.notify('原生設定操作未完成；可能缺少管理證據、配置／備份有異動或鎖被占用。未強制覆寫；必要時先閒置 reload，再檢查／回復。','warning');}
  finally{busy=false;}
  if(saved){try{await ctx.reload();}catch{throw new Error('原生設定已保存，但 reload 未完成；請閒置手動 /reload，不宣稱 runtime 已生效。');}}
 }});
}
