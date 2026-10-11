import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {setImmediate as immediate} from 'node:timers/promises';
import dns from 'node:dns/promises';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import {Store} from '../src/core_v1.2.2.mjs';
import {fromHost} from './runtime.mjs';
const {loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const {SessionManager}=await fromHost('dist/core/session-manager.js');
const path=fileURLToPath(new URL('../extensions/index.ts',import.meta.url));
const config={version:1,enabled:true,url:'https://notify.example.invalid/test',key:'dummy-only',format:'generic',notifyOn:['completed','error']};
const message=(stopReason='stop')=>({role:'assistant',provider:'fixture',api:'fixture',model:'fixture',timestamp:Date.now(),stopReason,content:[{type:'text',text:'PRIVATE RESPONSE'}]});
async function fixture(t,run) {
 const root=await mkdtemp(join(tmpdir(),'goal webhook ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;
 const sent=[],notices=[];let idle=true,pending=false,seq=0;
 t.mock.timers.enable({apis:['setTimeout']});
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
 t.mock.method(https,'request',(_url,options,callback)=>{const request=new EventEmitter();request.destroy=()=>{};request.end=b=>{sent.push({payload:JSON.parse(b),id:options.headers['X-Pi-Notification-Id']});queueMicrotask(()=>callback({statusCode:204,destroy:()=>{}}));};return request;});
 const manager=SessionManager.create(root,join(root,'sessions')),store=new Store(join(root,'config/webhook-notifier'));
 const ctx={mode:'tui',cwd:root,sessionManager:manager,isIdle:()=>idle,hasPendingMessages:()=>pending,ui:{notify:s=>notices.push(s)}};
 const loaded=await loadExtensions([path],root);assert.deepEqual(loaded.errors,[]);loaded.runtime.appendEntry=(type,data)=>manager.appendCustomEntry(type,data);
 const extension=loaded.extensions[0];
 const event=async(name,value={})=>{for(const h of extension.handlers.get(name)??[])await h(value,ctx);};
 const goal=(status='active',extra={})=>manager.appendCustomEntry('goal-state',{goal:{id:'g',text:'PRIVATE OBJECTIVE',status,startedAt:1,updatedAt:++seq,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0,...extra}});
 const status=async()=>{await extension.commands.get('webhook-status').handler('json',ctx);return JSON.parse(notices.at(-1));};
 const drain=async()=>{for(let i=0;i<2000;i++){await immediate();if(!(await status()).automatic_pending)return;}throw new Error('Automatic notification did not settle');};
 const begin=()=>event('agent_start');
 const finish=async(outcome='completed',stopReason='stop')=>{const id=manager.appendMessage(message(stopReason));await event('turn_end',{outcome,messageEntryId:id});await event('agent_before_settle',{outcome});await event('agent_settled');return id;};
 const tick=async(ms=3000)=>{t.mock.timers.tick(ms);await drain();};
 try {
  await store.writeConfig(config);await store.writeDefault(true);await event('session_start');
  await run({sent,notices,manager,store,ctx,event,goal,begin,finish,tick,status,drain,setIdle:v=>idle=v,setPending:v=>pending=v});
 }finally{await event('session_shutdown');t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
}
test('Goal active/external waiting/server-error retry stay quiet even well beyond debounce; true completion notifies once',t=>fixture(t,async f=>{
 f.goal();await f.begin();await f.finish('error','error');await f.tick(30000);assert.equal(f.sent.length,0);
 f.goal('active',{waiting:{reason:'external event',resumeAt:Date.now()+60000}});await f.begin();await f.finish();await f.tick(30000);assert.equal(f.sent.length,0);
 await f.begin();f.goal('complete');await f.finish('completed','toolUse');t.mock.timers.tick(2999);await immediate();assert.equal(f.sent.length,0);await f.tick(1);
 assert.equal(f.sent.length,1);assert.equal(f.sent[0].payload.goal_status,'complete');assert(!JSON.stringify(f.sent).includes('PRIVATE'));
 await f.event('agent_settled');await f.tick();assert.equal(f.sent.length,1);
}));
for(const stop of ['blocked','usage_limited','budget_limited'])test(`${stop} is a real Goal stop, never a fake completion; later resume/completion is a new transition`,t=>fixture(t,async f=>{
 f.goal();await f.begin();f.goal(stop);await f.finish('error','error');await f.tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].payload.status,stop);assert.match(f.sent[0].payload.text,/需要處理/);
 f.goal();await f.begin();f.goal('complete');await f.finish();await f.tick();assert.equal(f.sent.length,2);assert.notEqual(f.sent[0].id,f.sent[1].id);
}));
test('load order: terminal state published by a later settled handler is detected, but continuation cancels a pending notice',t=>fixture(t,async f=>{
 f.goal();await f.begin();await f.finish();f.goal('complete');await f.tick();assert.equal(f.sent.length,1);
 f.goal();await f.begin();f.goal('blocked');await f.finish();f.goal();await f.event('agent_start');await f.tick();assert.equal(f.sent.length,1);
}));
test('unknown schema/paused/cleared Goal does not produce completion and startup never backfills historical terminal state',t=>fixture(t,async f=>{
 for(const stop of ['paused','unsupported']){f.goal();await f.begin();f.goal(stop);await f.finish();await f.tick();assert.equal(f.sent.length,0);}
 f.goal();await f.begin();f.manager.appendCustomEntry('goal-state',{goal:null});await f.finish();await f.tick();assert.equal(f.sent.length,0);
 f.goal('complete');await f.event('session_start');await f.event('agent_settled');await f.tick();assert.equal(f.sent.length,0);
}));
test('ordinary non-Goal turns retain notifications after quiet period, busy/queued follow-ups or user input suppress pending notices',t=>fixture(t,async f=>{
 await f.begin();await f.finish();await f.tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].payload.event,'pi.agent.settled');
 await f.begin();await f.finish();f.setPending(true);await f.tick();assert.equal(f.sent.length,1);f.setPending(false);
 await f.begin();await f.finish();f.setIdle(false);await f.tick();assert.equal(f.sent.length,1);f.setIdle(true);
 await f.begin();await f.finish();await f.event('input',{});await f.tick();assert.equal(f.sent.length,1);
}));
test('masterOff/sessionOff/Goal event opt-out cancel or suppress automatic notifications without changing existing config default',t=>fixture(t,async f=>{
 f.goal();await f.begin();f.goal('complete');await f.finish();await f.store.writeConfig({...config,enabled:false});await f.tick();assert.equal(f.sent.length,0);
 await f.store.writeConfig({...config,goalNotifyOn:[]});f.goal();await f.begin();f.goal('complete');await f.finish();await f.tick();assert.equal(f.sent.length,0);
 await f.store.writeConfig(config);f.goal();await f.begin();f.goal('complete');await f.finish();await f.event('session_tree');await f.tick();assert.equal(f.sent.length,0);
}));
test('external master-off during DNS is rechecked before POST even without a command cancellation event',t=>fixture(t,async f=>{
 let release,entered;const started=new Promise(r=>entered=r);
 t.mock.method(dns,'lookup',async()=>{entered();return new Promise(r=>release=()=>r([{address:'8.8.8.8',family:4}]));});syncBuiltinESMExports();
 f.goal();await f.begin();f.goal('complete');await f.finish();t.mock.timers.tick(3000);await started;
 await f.store.writeConfig({...config,enabled:false});release();await f.drain();assert.equal(f.sent.length,0);assert.equal((await f.store.recent())[0].state,'FAILED_PRECHECK');
}));
test('new work or changed Goal during DNS cannot submit a stale POST; durable claim is never retried',t=>fixture(t,async f=>{
 let release,entered;const started=new Promise(r=>entered=r);
 t.mock.method(dns,'lookup',async()=>{entered();return new Promise(r=>release=()=>r([{address:'8.8.8.8',family:4}]));});syncBuiltinESMExports();
 f.goal();await f.begin();f.goal('complete');await f.finish();t.mock.timers.tick(3000);await started;
 f.goal();await f.event('agent_start');assert.equal((await f.status()).automatic_pending,true,'Cancelled owned operation remains pending until the receipt is finished');release();await f.drain();
 // quiet.cancel invalidates state immediately; wait for the owned operation's receipt.
 for(let i=0;i<2000;i++){const rows=await f.store.recent();if(rows[0]?.state==='FAILED_PRECHECK')break;await immediate();}
 assert.equal(f.sent.length,0);assert.equal((await f.store.recent())[0].state,'FAILED_PRECHECK');
}));
