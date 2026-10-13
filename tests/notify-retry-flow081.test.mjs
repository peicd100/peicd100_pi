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
import {Store} from '../modules/webhook/src/core_v1.2.2.mjs';
import {fromHost} from './runtime.mjs';
const {loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const {SessionManager}=await fromHost('dist/core/session-manager.js');
const path=fileURLToPath(new URL('../modules/webhook/extensions/index_v2.0.1.ts',import.meta.url));
const config={version:1,enabled:true,url:'https://notify.example.invalid/test',key:'dummy-only',format:'generic',notifyOn:['completed','error']};
const message=(stopReason='stop')=>({role:'assistant',provider:'fixture',api:'fixture',model:'fixture',timestamp:Date.now(),stopReason,content:[{type:'text',text:'PRIVATE RESPONSE'}]});
async function fixture(t,run) {
 const root=await mkdtemp(join(tmpdir(),'goal webhook ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;
 const sent=[],notices=[];let idle=true,pending=false,seq=0;
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
 t.mock.method(https,'request',(_url,options,callback)=>{const request=new EventEmitter();request.destroy=()=>{};request.end=b=>{sent.push({payload:JSON.parse(b),id:options.headers['X-Pi-Notification-Id']});queueMicrotask(()=>callback({statusCode:204,destroy:()=>{}}));};return request;});
 const manager=SessionManager.create(root,join(root,'sessions')),store=new Store(join(root,'config/webhook-notifier'));
 const ctx={mode:'tui',cwd:root,sessionManager:manager,isIdle:()=>idle,hasPendingMessages:()=>pending,ui:{notify:s=>notices.push(s)}};
 const loaded=await loadExtensions([path],root);assert.deepEqual(loaded.errors,[]);loaded.runtime.appendEntry=(type,data)=>manager.appendCustomEntry(type,data);
 const extension=loaded.extensions[0];
 const event=async(name,value={})=>{for(const h of extension.handlers.get(name)??[])await h(value,ctx);};
 const goal=(status='active',extra={})=>manager.appendCustomEntry('goal-state',{goal:{id:'g',text:'PRIVATE OBJECTIVE',status,startedAt:1,updatedAt:++seq,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0,...extra}});
 const status=async()=>{await extension.commands.get('notify-status(piecd100)').handler('json',ctx);return JSON.parse(notices.at(-1));};
 const drain=async()=>{for(let i=0;i<2000;i++){await immediate();if(!(await status()).automatic_pending)return;}throw new Error('Automatic notification did not settle');};
 const begin=()=>event('agent_start');
 const finish=async(outcome='completed',stopReason='stop')=>{const id=manager.appendMessage(message(stopReason));await event('turn_end',{outcome,messageEntryId:id});await event('agent_before_settle',{outcome});await event('agent_settled');return id;};
 const tick=async(ms=3000)=>{t.mock.timers.tick(ms);if(ms<3000){for(let i=0;i<200;i++){await immediate();if((await status()).automatic_pending)break;}return;}await drain();};
 try {
  await store.writeConfig(config);await store.writeDefault(true);await event('session_start');
  await run({command:(name,args='')=>extension.commands.get(name+'(piecd100)').handler(args,ctx),sent,notices,manager,store,ctx,event,goal,begin,finish,tick,status,drain,setIdle:v=>idle=v,setPending:v=>pending=v});
 }finally{await event('session_shutdown');t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
}


const exhausted={reason:'Provider retries exhausted: exceeded request buffer limit while retrying upstream PRIVATE_DETAIL'};
test('three retry failures then untimed provider-exhausted Goal wait notify once with safe cause/next action',t=>fixture(t,async f=>{
 f.manager.appendSessionInfo('上游錯誤通知');f.goal();await f.begin();for(let i=0;i<3;i++){await f.finish('error','error');await f.tick(1000);assert.equal(f.sent.length,0);}f.goal('active',{waiting:exhausted});await f.finish('error','error');await f.tick();assert.equal(f.sent.length,1);const p=f.sent[0].payload;assert.equal(p.goal_status,'retry_exhausted');assert.match(p.text,/^🔔 上游錯誤通知｜需要處理/);assert.match(p.reason,/上游請求重試已耗盡/);assert.match(p.next_action,/follow-up.*\/goal resume/);assert(!JSON.stringify(f.sent).includes('PRIVATE'));assert.equal((await f.status()).loaded_version,'2.0.1');
 f.goal('active',{waiting:{reason:'Provider retries exhausted: changed PRIVATE_DETAIL'}});await f.event('agent_settled');await f.tick(10000);assert.equal(f.sent.length,1);assert.equal((await f.store.recent()).length,1);
}));
test('ordinary and timed waits never alert; ordinary waiting followed by manual-exhausted waiting is a NEW transition',t=>fixture(t,async f=>{
 for(const waiting of [{reason:'external event'},{reason:'Provider retries exhausted: PRIVATE_DETAIL',resumeAt:Date.now()+60000}]){f.goal();await f.begin();f.goal('active',{waiting});await f.finish('error','error');await f.tick(10000);assert.equal(f.sent.length,0);}
 f.goal('active',{waiting:{reason:'external event'}});await f.tick(10000);assert.equal(f.sent.length,0);f.goal('active',{waiting:exhausted});await f.tick(1000);await f.tick();assert.equal(f.sent.length,1);
}));
test('manual resume followed by another exhaustion is a second episode; eventual goal completion notifies separately',t=>fixture(t,async f=>{
 const ids=[];for(let i=0;i<2;i++){f.goal();await f.begin();f.goal('active',{waiting:exhausted});await f.finish('error','error');await f.tick();ids.push(f.sent.at(-1).id);}assert.equal(f.sent.length,2);assert.notEqual(ids[0],ids[1]);f.goal();await f.begin();f.goal('complete');await f.finish('completed','toolUse');await f.tick();assert.equal(f.sent.length,3);assert.equal(f.sent.at(-1).payload.goal_status,'complete');
}));
test('resume/input within debounce cancels alert, busy/queued stays quiet and historical startup never backfills',t=>fixture(t,async f=>{
 f.goal();await f.begin();f.goal('active',{waiting:exhausted});await f.finish('error','error');f.goal();await f.event('input');await f.tick();assert.equal(f.sent.length,0);
 f.goal('active',{waiting:exhausted});f.setPending(true);await f.tick(10000);assert.equal(f.sent.length,0);await f.event('session_start');f.setPending(false);await f.tick(10000);assert.equal(f.sent.length,0);f.goal('active',{waiting:{reason:'Provider retries exhausted: repeated'}});await f.tick(10000);assert.equal(f.sent.length,0);
}));
test('off/on discard manual-wait candidates and status stays secret-safe; model-free new manual stop is observed',t=>fixture(t,async f=>{
 f.goal();await f.begin();f.goal('active',{waiting:exhausted});await f.finish('error','error');await f.command('notify-off');await f.command('notify-on');await f.tick(10000);assert.equal(f.sent.length,0);assert(!JSON.stringify(await f.status()).includes('PRIVATE_DETAIL'));
 f.goal();f.goal('active',{waiting:exhausted});await f.tick(1000);await f.tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].payload.goal_status,'retry_exhausted');
}));
test('resumed Goal during DNS never submits a stale manual-wait notification; durable claim never reused',t=>fixture(t,async f=>{
 let entered,release;const started=new Promise(r=>entered=r);t.mock.method(dns,'lookup',async()=>{entered();return new Promise(r=>release=()=>r([{address:'8.8.8.8',family:4}]));});syncBuiltinESMExports();f.goal();await f.begin();f.goal('active',{waiting:exhausted});await f.finish('error','error');t.mock.timers.tick(3000);await started;f.goal();await f.event('agent_start');release();await f.drain();assert.equal(f.sent.length,0);assert.equal((await f.store.recent())[0].state,'FAILED_PRECHECK');
}));
