import {existsSync,lstatSync,readFileSync,mkdirSync,openSync,writeFileSync,closeSync,unlinkSync} from 'node:fs';
import {join} from 'node:path';
import {rename} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {replaceFile} from '../../webhook/src/atomic-file_v1.2.2.mjs';
export const POLICY_TYPE='peicd100:suffix-policy';
export const MAX_BYTES=32768;
export const EMPTY=Object.freeze({version:1,defaultEnabled:false,text:''});
const hash=b=>createHash('sha256').update(b).digest('hex');
export function validateConfig(value){
 if(!value||value.version!==1||typeof value.defaultEnabled!=='boolean'||typeof value.text!=='string'||Object.keys(value).some(k=>!['version','defaultEnabled','text'].includes(k))||Buffer.byteLength(value.text,'utf8')>MAX_BYTES||value.text.includes('\0'))throw new Error('後綴設定格式錯誤或超過32 KiB；未更改。');
 return {...value};
}
export function readPolicy(branch){
 const entry=branch.findLast(e=>e.type==='custom'&&e.customType===POLICY_TYPE);
 if(!entry)return null;
 const d=entry.data;if(!d||d.version!==1||typeof d.enabled!=='boolean'||typeof d.defaultEnabled!=='boolean'||!['default','explicit'].includes(d.origin))throw new Error('本對話後綴開關無法驗證；未套用。');
 return {...d};
}
export function composeInput(event,enabled,text){
 if(!['interactive','rpc'].includes(event.source)||!enabled||!event.text?.trim()||/^\s*[\/!]/u.test(event.text))return {action:'continue'};
 if(!text.trim())throw new Error('後綴內容為空，請先設定或關閉本對話後綴。');
 return {action:'transform',text:event.text+'\n\n'+text,images:event.images};
}
export class SuffixStore {
 constructor(agentDir){this.dir=join(agentDir,'config','suffix');this.path=join(this.dir,'config.json');}
 read(){
  if(existsSync(this.dir)&&(!lstatSync(this.dir).isDirectory()||lstatSync(this.dir).isSymbolicLink()))throw new Error('後綴設定目錄不安全。');
  if(!existsSync(this.path))return {config:{...EMPTY},hash:'absent'};
  const st=lstatSync(this.path);if(!st.isFile()||st.isSymbolicLink()||st.size>MAX_BYTES*6+1024)throw new Error('後綴設定檔無法安全讀取。');
  const raw=readFileSync(this.path);return {config:validateConfig(JSON.parse(raw.toString('utf8'))),hash:hash(raw)};
 }
 async save(config,expected,guard=()=>{}){
  validateConfig(config);this.read();mkdirSync(this.dir,{recursive:true,mode:0o700});
  const lock=join(this.dir,'config.lock');let fd;
  try{fd=openSync(lock,'wx',0o600);}catch{throw new Error('後綴設定正由其他操作修改；請稍後重試，未覆寫。');}
  const temp=join(this.dir,'.config-'+randomUUID()+'.tmp');
  try{
   writeFileSync(fd,JSON.stringify({pid:process.pid,id:randomUUID()}));guard();if(this.read().hash!==expected)throw new Error('後綴設定已變更；請重新開啟選單，未覆寫。');
   writeFileSync(temp,JSON.stringify(config,null,2)+'\n',{flag:'wx',mode:0o600});guard();
   // The exclusive lock protects cooperating writers; CAS protects earlier UI snapshots.
   if(this.read().hash!==expected)throw new Error('後綴設定已變更；未覆寫。');
   await replaceFile(temp,this.path,{rename:(a,b)=>{guard();if(this.read().hash!==expected)throw new Error('後綴設定已變更；未覆寫。');return rename(a,b);}});return this.read();
  }finally{if(existsSync(temp))unlinkSync(temp);closeSync(fd);unlinkSync(lock);}
 }
}
