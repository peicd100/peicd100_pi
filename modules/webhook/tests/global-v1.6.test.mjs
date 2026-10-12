import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';import {join} from 'node:path';import {tmpdir} from 'node:os';import {Store,deliver,notificationId} from '../src/core_v1.6.0.mjs';
const config={version:1,enabled:true,url:'https://notify.example.invalid/fixture',key:'dummy-only',format:'generic',notifyOn:['completed'],goalNotifyOn:['complete']};
async function fixture(run){const root=await mkdtemp(join(tmpdir(),'global switch ')),store=new Store(root);try{await store.writeConfig(config);await run(store);}finally{await rm(root,{recursive:true,force:true});}}
const event=id=>({id:notificationId('fixture',id,'completed'),sessionId:'fixture',outcome:'completed',test:true});
test('global is distinct; implicit on never grants endpoint/current/default, CAS cancel/noop preserve bytes and permissions',()=>fixture(async store=>{
 const before=await readFile(store.configPath);assert.equal((await store.readGlobalState()).enabled,true);assert.equal(await store.readDefault(),false);
 const off=await store.writeGlobal(false,'implicit');assert.equal(off.enabled,false);assert.deepEqual(await readFile(store.configPath),before);await store.writeDefault(true);assert.equal((await store.readGlobalState()).enabled,false);
 await assert.rejects(store.writeGlobal(true,'implicit'));const raw=await readFile(store.globalPath);await store.writeGlobal(false,off.revision);assert.deepEqual(await readFile(store.globalPath),raw);
 if(process.platform!=='win32')assert.equal((await stat(store.globalPath)).mode&0o777,0o600);
 await store.writeGlobal(true,off.revision);assert.equal(await store.readDefault(),true);assert.deepEqual(await readFile(store.configPath),before);
}));
test('global off blocks automatic and explicit tests before claims or DNS; corrupt file fail closed',()=>fixture(async store=>{
 let dns=0,posts=0;const options={resolver:async()=>{dns++;return [{address:'8.8.8.8',family:4}];},transport:async()=>{posts++;return {state:'ACCEPTED'};}};
 await store.writeGlobal(false);assert.equal((await deliver(store,config,event('off'),options)).state,'SKIPPED');assert.equal(dns,0);assert.equal(posts,0);assert.deepEqual(await store.recent(),[]);
 await writeFile(store.globalPath,'{"version":1,"enabled":true}\n',{mode:0o600});await assert.rejects(store.readGlobalState());await assert.rejects(deliver(store,config,event('invalid'),options));assert.equal(posts,0);
}));
test('other process off then on during DNS still invalidates old send; claim preserved; no retry',()=>fixture(async store=>{
 let posts=0;const sibling=new Store(store.root),result=await deliver(store,config,event('dns'),{resolver:async()=>{await sibling.writeGlobal(false);await sibling.writeGlobal(true);return [{address:'8.8.8.8',family:4}];},transport:async()=>{posts++;return {state:'ACCEPTED'};}});
 assert.equal(result.state,'FAILED_PRECHECK');assert.equal(posts,0);assert.equal((await store.recent())[0].state,'FAILED_PRECHECK');assert.equal((await deliver(store,config,event('dns'))).state,'DUPLICATE_NO_RESEND');
}));
test('global rechecked after awaited preDispatch; stale config CAS cannot reset others events or clear endpoint',()=>fixture(async store=>{
 let posts=0;const result=await deliver(store,config,event('guard'),{resolver:async()=>[{address:'8.8.8.8',family:4}],preDispatch:async()=>{await new Store(store.root).writeGlobal(false);return true;},transport:async()=>{posts++;return {state:'ACCEPTED'};}});assert.equal(result.state,'FAILED_PRECHECK');assert.equal(posts,0);
 const previous=await store.readConfig();await store.writeConfig({...config,notifyOn:['error']});await assert.rejects(store.writeConfig(config,previous));await assert.rejects(store.clear(previous));assert.deepEqual((await store.readConfig()).notifyOn,['error']);
}));
