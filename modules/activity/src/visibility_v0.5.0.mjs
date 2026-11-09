import {promises as fs,constants} from 'node:fs';import {join} from 'node:path';import {createHash,randomUUID} from 'node:crypto';
const hash=b=>createHash('sha256').update(b).digest('hex'),owned=(s,dir=false)=>{if((dir?!s.isDirectory():!s.isFile())||s.isSymbolicLink()||process.getuid&&s.uid!==process.getuid()||process.platform!=='win32'&&(s.mode&0o077))throw new Error('活動偏好位置／擁有者／權限無法驗證');};
// Keep the exact old two-field format. CAS is a digest of the committed bytes,
// never a new revision field that would invalidate the previous release.
export class VisibilityStore{
 constructor(root){this.root=root;this.path=join(root,'preferences.json');}
 async snapshot(){let handle;try{owned(await fs.lstat(this.root),true);const before=await fs.lstat(this.path);owned(before);if(before.size>16384)throw new Error('活動偏好過大');handle=await fs.open(this.path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const current=await handle.stat();owned(current);if(before.dev!==current.dev||before.ino!==current.ino||current.size>16384)throw new Error('活動偏好讀取漂移');const raw=await handle.readFile(),value=JSON.parse(raw);if(value?.version!==1||typeof value.defaultEnabled!=='boolean'||Object.keys(value).sort().join()!=='defaultEnabled,version')throw new Error('活動偏好格式未知');return{visible:value.defaultEnabled,revision:hash(raw)};}catch(error){if(error.code==='ENOENT')return{visible:false,revision:'implicit'};throw error;}finally{await handle?.close();}}
 async read(){return(await this.snapshot()).visible;}
 async save(visible,expectedRevision,valid=()=>true){if(typeof visible!=='boolean'||typeof expectedRevision!=='string'||!valid())throw new Error('活動偏好操作範圍無效');await fs.mkdir(this.root,{recursive:true,mode:0o700});owned(await fs.lstat(this.root),true);const lock=join(this.root,'preferences.lock');await fs.mkdir(lock,{mode:0o700});let handle,temp;
  try{const current=await this.snapshot();if(current.revision!==expectedRevision||!valid())throw new Error('活動偏好已變更');if(current.visible===visible)return current;const raw=Buffer.from(JSON.stringify({version:1,defaultEnabled:visible},null,2)+'\n');temp=this.path+'.'+randomUUID()+'.tmp';handle=await fs.open(temp,'wx',0o600);await handle.writeFile(raw);await handle.sync();await handle.close();handle=undefined;if((await this.snapshot()).revision!==current.revision||!valid())throw new Error('活動偏好提交前已漂移');await fs.rename(temp,this.path);return{visible,revision:hash(raw)};}
  finally{await handle?.close();if(temp)await fs.unlink(temp).catch(()=>{});await fs.rmdir(lock);}
 }
}
