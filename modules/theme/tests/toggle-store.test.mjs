import test from 'node:test'; import assert from 'node:assert/strict'; import {mkdtemp,rm,writeFile,mkdir,readFile,symlink} from 'node:fs/promises'; import {tmpdir} from 'node:os'; import {join} from 'node:path';
import {ToggleStore,validateState,TEMPLATE} from '../src/toggle_v0.2.0.mjs';
const input={version:1,enabled:true,previousTheme:'system'};
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'theme toggle CAS '));try{await fn(new ToggleStore(root),root);}finally{await rm(root,{recursive:true,force:true});}}
test('開關紀錄小型嚴格schema，不含配色、秘密或自動配對',()=>{
 assert.deepEqual(validateState(input),input);for(const bad of[{...input,previousTheme:TEMPLATE},{...input,previousTheme:'light/dark'},{...input,key:'secret'},{...input,enabled:'on'},{...input,previousTheme:''}])assert.throws(()=>validateState(bad));
});
test('原子保存、重開、CAS過期拒絕，不改使用者設定或theme檔',()=>fixture(async s=>{
 assert.equal((await s.read()).state,null);let calls=0;const a=await s.save(input,null,()=>{calls++;});assert.equal(calls,1);assert.equal((await new ToggleStore(join(s.config,'..')).read()).state.previousTheme,'system');await assert.rejects(s.save({...input,enabled:false},null,()=>{}),/變更/);await s.save({...input,enabled:false},a.hash,()=>{});assert.equal((await s.read()).state.enabled,false);
}));
test('套用失敗只回退自己的紀錄；foreign修改不得覆寫',()=>fixture(async s=>{
 await assert.rejects(s.save(input,null,()=>{throw new Error('fixture');}));assert.equal((await s.read()).state,null);
 await assert.rejects(s.save(input,null,async()=>{await writeFile(s.path,JSON.stringify({...input,previousTheme:'dark'}));throw new Error('fixture');}));assert.equal((await s.read()).state.previousTheme,'dark');
}));
test('busy lock不因時間接管；stale session不套用',()=>fixture(async s=>{
 await mkdir(s.root,{recursive:true});await mkdir(s.lock);await assert.rejects(s.save(input,null,()=>{}),/鎖定/);await rm(s.lock,{recursive:true});await assert.rejects(s.save(input,null,()=>{},()=>false),/變更/);assert.equal((await s.read()).state,null);
}));
test('紀錄symlink、無效UTF8/BOM／超限不讀寫',()=>fixture(async(s,root)=>{
 await mkdir(s.root,{recursive:true});for(const b of[Buffer.from('\uFEFF{}'),Buffer.from([255]),Buffer.alloc(4097)]){await writeFile(s.path,b);await assert.rejects(s.read());}await rm(s.path);const target=join(root,'target');await writeFile(target,'private');try{await symlink(target,s.path);}catch(e){if(['EPERM','EACCES'].includes(e.code))return;throw e;}await assert.rejects(s.read(),/連結/);assert.equal(await readFile(target,'utf8'),'private');
}));
test('setter已成功後對話切換不抹掉原主題還原紀錄',()=>fixture(async s=>{
 let live=true;await s.save(input,null,()=>{live=false;},()=>live);assert.equal((await s.read()).state.previousTheme,'system');
}));
