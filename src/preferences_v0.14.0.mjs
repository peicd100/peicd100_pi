import {promises as fs,constants} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
const validate=s=>{if(!s||s.schema!==1||typeof s.enabled!=='boolean'||typeof s.revision!=='string'||!(/^(?:implicit|[a-f0-9-]{36})$/).test(s.revision)||Object.keys(s).some(k=>!['schema','enabled','revision'].includes(k)))throw new Error('功能偏好格式無法驗證，未使用或覆寫');return s;};
// Only an enabled preference, never Goal text, progress data, secrets or runtime authority.
export class FeaturePreference{
 constructor(root,defaultEnabled=true){this.root=root;this.path=join(root,'preferences.json');this.defaultEnabled=defaultEnabled;}
 async read(){let handle;try{handle=await fs.open(this.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const stat=await handle.stat();if(!stat.isFile()||stat.size>16384||process.getuid&&stat.uid!==process.getuid())throw new Error('偏好檔案不可安全讀取');return validate(JSON.parse(await handle.readFile('utf8')));}catch(error){if(error.code==='ENOENT')return {schema:1,enabled:this.defaultEnabled,revision:'implicit'};throw error;}finally{await handle?.close();}}
 async write(enabled,expectedRevision){
  if(typeof enabled!=='boolean')throw new Error('enabled須為boolean');await fs.mkdir(this.root,{recursive:true,mode:0o700});const stat=await fs.lstat(this.root);if(!stat.isDirectory()||stat.isSymbolicLink()||process.getuid&&stat.uid!==process.getuid())throw new Error('偏好儲存位置無法驗證');
  const lock=join(this.root,'preferences.lock');await fs.mkdir(lock,{mode:0o700});let handle,temp;
  try{const current=await this.read();if(current.revision!==expectedRevision)throw new Error('功能偏好已變更，未覆寫');if(current.enabled===enabled)return current;const next={schema:1,enabled,revision:randomUUID()};temp=this.path+'.'+randomUUID()+'.tmp';handle=await fs.open(temp,'wx',0o600);await handle.writeFile(JSON.stringify(next,null,2)+'\n');await handle.sync();await handle.close();handle=undefined;await fs.rename(temp,this.path);return next;}
  finally{await handle?.close();if(temp)await fs.unlink(temp).catch(()=>{});await fs.rmdir(lock);}
 }
}
