import {mkdirSync,rmdirSync,unlinkSync,existsSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';import {join,dirname} from 'node:path';import {randomUUID} from 'node:crypto';
import {parseDocument,readDocument,object,hash,modelIdentity,modelFingerprint,patchPiWindow,overrideWindow,transactionPath} from './pi-context_v1.10.0.mjs';
import {atomicReplace} from './config_v1.10.0.mjs';
const ownerFile='.pi-context-owner.json',relevant=s=>JSON.stringify({acm:s.acm,compaction:s.compaction});
export function mergeSettings(base,override){const result={...base};for(const[k,v]of Object.entries(override))Object.defineProperty(result,k,{enumerable:true,writable:true,configurable:true,value:object(v)&&object(base[k])?mergeSettings(base[k],v):v});return result;}
const filePaths=o=>({settings:o.path,models:join(dirname(o.path),'models.json')});
function snapshot(o){
 const files=filePaths(o),raw={settings:readDocument(files.settings),models:readDocument(files.models)};
 const settings=parseDocument(raw.settings),models=parseDocument(raw.models);const projectRaw=o.projectTrusted?readDocument(join(o.cwd,'.pi','settings.json')):undefined,project=parseDocument(projectRaw);
 const effective=mergeSettings(settings,project);if(relevant(effective)!==relevant(o.runtimeSettings))throw new Error('磁碟與執行中設定不同；請閒置 /reload，未改檔。');
 modelIdentity(o.model);overrideWindow(models,o.model);
 return {files,raw,settings,models,project,effective,fingerprint:hash(JSON.stringify([raw,projectRaw,modelFingerprint(o.model)]))};
}
export function inspectPiContext(o){if(existsSync(transactionPath(dirname(o.path))))throw new Error('容量交易待恢復；請閒置 /context(peicd100) recover。');return {fingerprint:snapshot(o).fingerprint};}
function locks(dir,operation){
 mkdirSync(dir,{recursive:true});const id=randomUUID(),paths=['models.json.lock','settings.json.lock'].map(p=>join(dir,p)),held=[];let result;
 try{for(const p of paths){try{mkdirSync(p);}catch{throw new Error('Pi 模型／設定檔正在寫入或有未確認鎖；未修改，請稍後重試或 recover。');}held.push(p);writeFileSync(join(p,ownerFile),JSON.stringify({kind:'pi-context-v1',pid:process.pid,id}),{mode:0o600});}result=operation({kind:'pi-context-v1',id,pid:process.pid});return result;}
 finally{for(const p of held.reverse()){try{const owner=JSON.parse(readFileSync(join(p,ownerFile),'utf8'));if(owner.id!==id||owner.pid!==process.pid||readdirSync(p).some(n=>n!==ownerFile))throw new Error();unlinkSync(join(p,ownerFile));rmdirSync(p);}catch{if(result)result.lockCleanupWarning='已提交，但鎖清理未完成；請確認沒有其他寫入後 recover。';}}}
}
function journalWrite(dir,data,expected){const path=transactionPath(dir);mkdirSync(dirname(path),{recursive:true,mode:0o700});atomicReplace(path,JSON.stringify(data)+'\n',expected);}
function restore(path,before,current){if(before===undefined){if(readDocument(path)!==current)throw new Error('檔案已有後續變更，未強制回退。');if(current!==undefined)unlinkSync(path);}else atomicReplace(path,before,current);}
function runFiles(dir,files,before,after,owner,{replace=atomicReplace,phase='save'}={}){
 const journal={version:1,owner,phase,state:'PREPARED',before:{settings:before.settings??null,models:before.models??null},after:{settings:after.settings??null,models:after.models??null}};
 journalWrite(dir,journal,undefined);let current={...before};
 try{
  for(const key of ['models','settings']){if(after[key]===current[key])continue;if(after[key]===undefined)restore(files[key],undefined,current[key]);else replace(files[key],after[key],current[key]);current[key]=after[key];}
  for(const key of ['models','settings'])if(readDocument(files[key])!==after[key])throw new Error('設定寫入驗證失敗。');
  const raw=readDocument(transactionPath(dir));journalWrite(dir,{...journal,state:'COMMITTED'},raw);
  unlinkSync(transactionPath(dir));
 }catch(error){
  let restored=true;
  for(const key of ['settings','models']){try{const now=readDocument(files[key]);if(now!==before[key]&&now!==after[key])throw new Error();if(now!==before[key])restore(files[key],before[key],now);}catch{restored=false;}}
  if(restored){try{unlinkSync(transactionPath(dir));}catch{restored=false;}}
  if(!restored)throw new Error('交易未完整收斂；保留私人復原日誌，請 recover，模型請求將停止。',{cause:error});throw error;
 }
}
export function commitPiContext(o,{fingerprint,contextWindow}={}){
 const dir=dirname(o.path);if(existsSync(transactionPath(dir)))throw new Error('交易待恢復，未建立第二個 writer。');
 return locks(dir,owner=>{
  const s=snapshot(o);if(s.fingerprint!==fingerprint)throw new Error('確認後模型、連線或設定已變更；未改檔。');
  const models=patchPiWindow(s.models,o.model,contextWindow),prospective={...o.model,contextWindow},key=modelIdentity(o.model);
  // Pi capacity is independent of ACM and native compaction. Keep settings
  // bytes unchanged; its lock/CAS remains a read barrier against concurrent edits.
  const after={settings:s.raw.settings,models:JSON.stringify(models,null,2)+'\n'};
  const backup=join(dir,'config','pi-context','backups',owner.id+'.json');mkdirSync(dirname(backup),{recursive:true,mode:0o700});atomicReplace(backup,JSON.stringify({version:1,before:{settings:s.raw.settings??null,models:s.raw.models??null}})+'\n',undefined);
  runFiles(dir,s.files,s.raw,after,owner,{replace:o.replace});return {dir,id:owner.id,backup,files:s.files,before:s.raw,after,contextWindow};
 });
}
export function rollbackPiContext(receipt){return locks(receipt.dir,owner=>{for(const key of ['models','settings'])if(readDocument(receipt.files[key])!==receipt.after[key])throw new Error('設定已有後續變更，未強制回退。');runFiles(receipt.dir,receipt.files,receipt.after,receipt.before,owner,{phase:'rollback'});return {rolled_back:true};});}
function terminalOwner(owner){if(owner?.kind!=='pi-context-v1'||!Number.isSafeInteger(owner.pid)||owner.pid<=0||typeof owner.id!=='string')return false;try{process.kill(owner.pid,0);return false;}catch(e){return e.code==='ESRCH';}}
export function recoverPiContext(dir){
 const pending=readDocument(transactionPath(dir)),j=pending===undefined?undefined:parseDocument(pending);if(j&&(!object(j)||j.version!==1||!['PREPARED','COMMITTED'].includes(j.state)||!object(j.before)||!object(j.after)||!terminalOwner(j.owner)))throw new Error('交易 owner 尚未證實終止／格式未知，未接管。');
 for(const name of ['models.json.lock','settings.json.lock']){const path=join(dir,name);if(!existsSync(path))continue;let owner;try{owner=parseDocument(readDocument(join(path,ownerFile)));}catch{throw new Error('鎖 owner 未知，未接管。');}if(!terminalOwner(owner)||j&&owner.id!==j.owner.id||readdirSync(path).some(n=>n!==ownerFile))throw new Error('鎖仍有效、不屬此交易或含未知項，未接管。');unlinkSync(join(path,ownerFile));try{rmdirSync(path);}catch{throw new Error('鎖含未知內容，未強制刪除。');}}
 if(!j)return {recovered:false};
 return locks(dir,()=>{
  const files={settings:join(dir,'settings.json'),models:join(dir,'models.json')};
  for(const key of ['settings','models']){for(const state of [j.before,j.after])if(state[key]!==null&&typeof state[key]!=='string')throw new Error('復原內容格式未知。');const now=readDocument(files[key]);if(now!==(j.before[key]??undefined)&&now!==(j.after[key]??undefined))throw new Error('復原檔已有外部修改，未強制覆寫。');}
  if(j.state==='COMMITTED'){for(const key of ['models','settings'])if(readDocument(files[key])!==(j.after[key]??undefined))throw new Error('已提交交易內容不符，未猜測。');}
  else for(const key of ['settings','models']){const before=j.before[key]??undefined,now=readDocument(files[key]);if(now!==before)restore(files[key],before,now);}
  unlinkSync(transactionPath(dir));return {recovered:true,state:j.state==='COMMITTED'?'COMMITTED':'ROLLED_BACK'};
 });
}
