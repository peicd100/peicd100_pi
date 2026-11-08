import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir,symlink,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FeaturePreference} from '../src/preferences_v0.14.0.mjs';
async function fixture(run){const root=await mkdtemp(join(tmpdir(),'peicd100 preferences140 '));try{return await run(root);}finally{await rm(root,{recursive:true,force:true});}}
test('feature preferences default read creates nothing; disabled state persists across instances',()=>fixture(async root=>{
 const store=new FeaturePreference(join(root,'goal'));assert.deepEqual(await store.read(),{schema:1,enabled:true,revision:'implicit'});await assert.rejects(lstat(store.root),{code:'ENOENT'});
 const saved=await store.write(false,'implicit');assert.equal(saved.enabled,false);assert.deepEqual(await new FeaturePreference(store.root).read(),saved);const bytes=await readFile(store.path,'utf8');assert.deepEqual(await store.write(false,saved.revision),saved);assert.equal(await readFile(store.path,'utf8'),bytes);
}));
test('feature preference compare-and-set rejects concurrent/stale writers without overwriting',()=>fixture(async root=>{
 const a=new FeaturePreference(root),b=new FeaturePreference(root),results=await Promise.allSettled([a.write(false,'implicit'),b.write(false,'implicit')]);assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.filter(x=>x.status==='rejected').length,1);const saved=await a.read();await assert.rejects(b.write(true,'implicit'),/已變更/);assert.deepEqual(await a.read(),saved);
}));
test('unknown/malformed preference is fail-closed and preserved byte-for-byte',()=>fixture(async root=>{
 const store=new FeaturePreference(root);for(const raw of ['not json',JSON.stringify({schema:99,revision:'implicit',enabled:true}),JSON.stringify({schema:1,revision:'implicit',enabled:true,unknown:'preserve'})]){await writeFile(store.path,raw);await assert.rejects(store.read());await assert.rejects(store.write(false,'implicit'));assert.equal(await readFile(store.path,'utf8'),raw);}
}));
test('unproven existing lock is never deleted or taken over',()=>fixture(async root=>{
 const store=new FeaturePreference(root),lock=join(root,'preferences.lock');await mkdir(lock);await assert.rejects(store.write(false,'implicit'),{code:'EEXIST'});assert.equal((await lstat(lock)).isDirectory(),true);
}));
test('feature writes refuse a junction/symlink root without changing its target',()=>fixture(async root=>{
 const target=join(root,'target'),link=join(root,'linked');await mkdir(target);await symlink(target,link,process.platform==='win32'?'junction':'dir');const store=new FeaturePreference(link);await assert.rejects(store.write(false,'implicit'),/無法驗證/);await assert.rejects(lstat(join(target,'preferences.json')),{code:'ENOENT'});
}));
