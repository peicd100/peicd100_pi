import {existsSync,lstatSync,readFileSync,mkdirSync,openSync,writeFileSync,closeSync,unlinkSync,fstatSync,fsyncSync} from 'node:fs';
import {rename} from 'node:fs/promises';import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
import {validatePercentages,DEFAULT_PERCENTAGES,policyForSettings} from './config_v1.10.0.mjs';
import {replaceFile} from '../../webhook/src/atomic-file_v1.2.2.mjs';
export const SESSION_POLICY_TYPE='peicd100:acm-session-policy';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export function validateDefaults(value){
 if(!value||value.version!==1||typeof value.enabled!=='boolean'||Object.keys(value).some(k=>!['version','enabled','triggerPercent','targetPercent'].includes(k)))throw new Error('ACM 預設設定格式無效。');
 return {version:1,enabled:value.enabled,...validatePercentages(value)};
}
export function legacyDefaults(settings){return validateDefaults({version:1,enabled:true,...validatePercentages(settings.acm??DEFAULT_PERCENTAGES)});}
export function validateSessionPolicy(value){
 if(!value||value.version!==1||typeof value.enabled!=='boolean'||!['default','explicit'].includes(value.origin)||Object.keys(value).some(k=>!['version','enabled','triggerPercent','targetPercent','origin','defaultSnapshot'].includes(k)))throw new Error('ACM 對話設定格式無效；未改用全域值。');
 return {version:1,enabled:value.enabled,...validatePercentages(value),origin:value.origin,defaultSnapshot:validateDefaults(value.defaultSnapshot)};
}
export function readSessionPolicy(branch){const e=branch.findLast(e=>e.type==='custom'&&e.customType===SESSION_POLICY_TYPE);return e?validateSessionPolicy(e.data):null;}
export function effectiveSettings(settings,policy){const p=validateSessionPolicy(policy);return {...settings,acm:{...settings.acm,triggerPercent:p.triggerPercent,targetPercent:p.targetPercent}};}
export function policyForBranch(base,settings,branch,model){const p=readSessionPolicy(branch);if(!p)throw new Error('ACM 缺少本對話設定快照。');return policyForSettings(base,effectiveSettings(settings,p),model);}
export function requestPolicyKey(policy,model){return hash(JSON.stringify([validateSessionPolicy(policy),model?.provider,model?.id,model?.api,model?.baseUrl,model?.contextWindow,model?.maxTokens,model?.inputLimits]));}
export class DefaultsStore {
 constructor(agentDir){this.dir=join(agentDir,'config','acm');this.path=join(this.dir,'defaults.json');}
 read(settings){
  if(existsSync(this.dir)&&(!lstatSync(this.dir).isDirectory()||lstatSync(this.dir).isSymbolicLink()))throw new Error('ACM 預設設定目錄不安全。');
  if(!existsSync(this.path))return {config:legacyDefaults(settings),hash:'absent',source:'legacy-import'};
  const st=lstatSync(this.path);if(!st.isFile()||st.isSymbolicLink()||st.size>4096)throw new Error('ACM 預設設定檔無法安全讀取。');
  const raw=readFileSync(this.path);return {config:validateDefaults(JSON.parse(raw.toString('utf8'))),hash:hash(raw),source:'private-defaults'};
 }
 async save(config,expected,settings,guard=()=>{}){
  validateDefaults(config);this.read(settings);mkdirSync(this.dir,{recursive:true,mode:0o700});const lock=join(this.dir,'defaults.lock');let fd;
  try{fd=openSync(lock,'wx',0o600);}catch{throw new Error('ACM 預設設定正由其他操作修改；未覆寫。');}
  const identity=fstatSync(fd),temp=join(this.dir,'.defaults-'+randomUUID()+'.tmp');
  try{
   writeFileSync(fd,JSON.stringify({pid:process.pid,id:randomUUID()}));guard();if(this.read(settings).hash!==expected)throw new Error('ACM 預設設定已變更；未覆寫。');
   writeFileSync(temp,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});const output=openSync(temp,'r+');try{fsyncSync(output);}finally{closeSync(output);}guard();
   await replaceFile(temp,this.path,{rename:(a,b)=>{guard();if(this.read(settings).hash!==expected)throw new Error('ACM 預設設定已變更；未覆寫。');return rename(a,b);}});
   return this.read(settings);
  }finally{if(existsSync(temp))unlinkSync(temp);closeSync(fd);if(existsSync(lock)){const current=lstatSync(lock);if(current.ino===identity.ino&&current.dev===identity.dev&&current.birthtimeMs===identity.birthtimeMs)unlinkSync(lock);}}
 }
}
export class SessionPolicy {
 constructor(pi,agentDir){this.pi=pi;this.store=new DefaultsStore(agentDir);}
 ensure(ctx){const current=readSessionPolicy(ctx.sessionManager.getBranch());if(current)return current;const snapshot=this.store.read(this.pi.getSettings()).config;this.pi.appendEntry(SESSION_POLICY_TYPE,{...snapshot,origin:'default',defaultSnapshot:snapshot});const saved=readSessionPolicy(ctx.sessionManager.getBranch());if(!saved)throw new Error('ACM 對話設定未能保存。');return saved;}
 settings(ctx){return effectiveSettings(this.pi.getSettings(),this.ensure(ctx));}
 commit(ctx,expected,change){const current=readSessionPolicy(ctx.sessionManager.getBranch());if(JSON.stringify(current)!==JSON.stringify(expected))throw new Error('ACM 對話設定已變更。');const next=validateSessionPolicy({...current,...change,origin:'explicit'});if(JSON.stringify(next)!==JSON.stringify(current))this.pi.appendEntry(SESSION_POLICY_TYPE,next);const saved=readSessionPolicy(ctx.sessionManager.getBranch());if(JSON.stringify(saved)!==JSON.stringify(next))throw new Error('ACM 對話設定未保存；請重新查看狀態。');this.pi.events.emit('acm:session-policy-changed',{ctx});return saved;}
}
