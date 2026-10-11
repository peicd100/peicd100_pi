import{promises as fs,constants}from'node:fs';import{join,dirname,resolve}from'node:path';import{randomUUID,createHash}from'node:crypto';import{validatePalette,OWN_NAME}from'./palette_v0.1.0.mjs';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
async function directory(path){await fs.mkdir(path,{recursive:true,mode:0o700});const st=await fs.lstat(path);if(!st.isDirectory()||st.isSymbolicLink())throw new Error('配色目錄不是安全的普通目錄。');}
async function bytes(path,optional=false){let file;try{const info=await fs.lstat(path);if(!info.isFile()||info.isSymbolicLink())throw new Error('配色檔案不可為連結或特殊檔案。');file=await fs.open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const st=await file.stat();if(st.size>65536)throw new Error('配色檔案超過 64 KiB。');return await file.readFile();}catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}finally{await file?.close();}}
const parse=b=>{const text=b.toString('utf8');if(!Buffer.from(text,'utf8').equals(b)||text.startsWith('\uFEFF'))throw new Error('主題必須是 UTF-8 無 BOM。');try{return validatePalette(JSON.parse(text));}catch(e){if(e instanceof SyntaxError)throw new Error('主題 JSON 語法無效。');throw e;}};
async function stage(path,data){const temp=path+'.'+randomUUID()+'.tmp';let file;try{file=await fs.open(temp,'wx',0o600);await file.writeFile(data);await file.sync();await file.close();file=null;return temp;}catch(e){await file?.close();await fs.unlink(temp).catch(()=>{});throw e;}}
export class ThemeStore {
 constructor(agent){this.agent=agent;this.root=join(agent,'config','pi-theme');this.path=join(agent,'themes',OWN_NAME+'.json');this.lock=join(this.root,'save.lock');}
 async snapshot(){const raw=await bytes(this.path,true);return {raw,hash:raw?digest(raw):null};}
 async read(){const snap=await this.snapshot();return {...snap,palette:snap.raw?parse(snap.raw):null};}
 async import(path){return parse(await bytes(resolve(path)));}
 async export(path,input){path=resolve(path);if(path===resolve(this.path)||!path.toLowerCase().endsWith('.json'))throw new Error('匯出請指定新的 .json 檔案，不可覆寫目前使用者主題。');await directory(dirname(path));const data=Buffer.from(JSON.stringify(validatePalette(input,{name:'pi-theme-export'}),null,2)+'\n');const temp=await stage(path,data);try{await fs.link(temp,path);}catch(e){if(e.code==='EEXIST')throw new Error('匯出檔案已存在；請指定新檔名，不會覆寫。');throw e;}finally{await fs.unlink(temp).catch(()=>{});}}
 async save(input,expectedHash,apply,live=()=>true){
  const palette=validatePalette(input),data=Buffer.from(JSON.stringify(palette,null,2)+'\n');await directory(join(this.agent,'config'));await directory(this.root);await directory(dirname(this.path));
  try{await fs.mkdir(this.lock);}catch(e){if(e.code==='EEXIST')throw new Error('另一個配色保存作業持有鎖定；不會自動接管，請確認舊作業已結束。');throw e;}
  const token=randomUUID();let temp,old,written=false;
  try{
   await fs.writeFile(join(this.lock,'owner.json'),JSON.stringify({pid:process.pid,token,started_at:new Date().toISOString()}));old=await this.snapshot();if(old.hash!==expectedHash||!live())throw new Error('配色檔案或對話已變更；未覆寫，請重新開啟編輯器。');
   temp=await stage(this.path,data);const now=await this.snapshot();if(now.hash!==old.hash||!live())throw new Error('儲存前配色或對話已變更；未覆寫。');await fs.rename(temp,this.path);temp=null;written=true;
   if(!live())throw new Error('對話已變更；取消套用。');await apply(palette);
   if((await this.snapshot()).hash!==digest(data))throw new Error('套用期間配色檔案已被其他作業更改；不覆寫後續修改。');
   return {hash:digest(data)};
  }catch(e){
   if(written&&(await this.snapshot()).hash===digest(data)){if(old.raw){const undo=await stage(this.path,old.raw);await fs.rename(undo,this.path);}else await fs.unlink(this.path);}
   throw e;
  }finally{
   if(temp)await fs.unlink(temp).catch(()=>{});
   const owner=await fs.readFile(join(this.lock,'owner.json'),'utf8').then(JSON.parse).catch(()=>null);
   if(owner?.token===token)await fs.rm(this.lock,{recursive:true});
  }
 }
}
