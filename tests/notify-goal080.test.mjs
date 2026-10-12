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
const path=fileURLToPath(new URL('../modules/webhook/extensions/index_v2.0.0.ts',import.meta.url));
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
 const tick=async(ms=3000)=>{t.mock.timers.tick(ms);await drain();};
 try {
  await store.writeConfig(config);await store.writeDefault(true);await event('session_start');
  await run({command:(name,args='')=>extension.commands.get(name+'(piecd100)').handler(args,ctx),sent,notices,manager,store,ctx,event,goal,begin,finish,tick,status,drain,setIdle:v=>idle=v,setPending:v=>pending=v});
 }finally{await event('session_shutdown');t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
}

test('active retry/wait stay quiet; later completion notifies once with title and no private content',t=>fixture(t,async f=>{
 f.manager.appendSessionInfo('通知測試對話');f.goal();await f.begin();await f.finish('error','error');await f.tick(30000);assert.equal(f.sent.length,0);
 f.goal('active',{waiting:{reason:'PRIVATE_REASON',resumeAt:Date.now()+60000}});await f.begin();await f.finish();await f.tick(30000);assert.equal(f.sent.length,0);
 await f.begin();f.goal('complete');await f.finish('completed','toolUse');await f.tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].payload.goal_status,'complete');assert.match(f.sent[0].payload.text,/^✅ 通知測試對話｜已完成/);assert(!JSON.stringify(f.sent).includes('PRIVATE'));
 await f.event('agent_settled');await f.tick();assert.equal(f.sent.length,1);
}));
for(const stop of ['paused','blocked','usage_limited','budget_limited'])test(`Notify ${stop} produces needs-action once, then resume/completion is a new transition`,t=>fixture(t,async f=>{
 f.goal();await f.begin();f.goal(stop);await f.finish('error','error');await f.tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].payload.status,stop);assert.match(f.sent[0].payload.text,/｜需要處理/);assert(f.sent[0].payload.reason);
 f.goal();await f.begin();f.goal('complete');await f.finish();await f.tick();assert.equal(f.sent.length,2);assert.notEqual(f.sent[0].id,f.sent[1].id);
}));
test('ordinary settled completed/error/aborted all notify, despite old completed-only preference; new work/pending/unknown Goal/startup remain quiet',t=>fixture(t,async f=>{
 await f.store.writeConfig({...config,notifyOn:['completed']});
 for(const [outcome,stopReason] of [['completed','stop'],['error','error'],['aborted','aborted']]){await f.begin();await f.finish(outcome,stopReason);await f.tick();}
 assert.equal(f.sent.length,3);assert.match(f.sent[1].payload.text,/原因：/);assert.match(f.sent[2].payload.text,/已取消/);
 await f.begin();await f.finish();f.setPending(true);await f.tick();assert.equal(f.sent.length,3);f.setPending(false);
 await f.begin();await f.finish();await f.event('input');await f.tick();assert.equal(f.sent.length,3);
 f.goal('future');await f.begin();await f.finish();await f.tick();assert.equal(f.sent.length,3);
 f.goal('complete');await f.event('session_start');await f.event('agent_settled');await f.tick();assert.equal(f.sent.length,3);
}));
test('cross-process selected-profile switch during DNS prevents dispatch, without cancelling model work or retrying claim',t=>fixture(t,async f=>{
 const {Store}=await import('../modules/webhook/src/core_v2.0.0.mjs');const store=new Store(f.store.root);let entered,release;const started=new Promise(r=>entered=r);
 t.mock.method(dns,'lookup',async()=>{entered();return new Promise(r=>release=()=>r([{address:'8.8.8.8',family:4}]));});syncBuiltinESMExports();
 await f.begin();await f.finish();t.mock.timers.tick(3000);await started;
 const before=await store.readRegistry();await store.saveProfile('discord',{authorized:true,url:'https://notify.example.invalid/another',key:''},before.revision);release();await f.drain();assert.equal(f.sent.length,0);assert.equal((await store.recent())[0].state,'FAILED_PRECHECK');
}));
test('manual Goal pause without a model message notifies after quiet interval; startup wait/paused never backfills',t=>fixture(t,async f=>{
 f.goal();f.goal('paused');t.mock.timers.tick(1000);for(let i=0;i<2000;i++){await immediate();if((await f.status()).automatic_pending)break;}await f.tick();assert.equal(f.sent.length,1);assert.equal(f.sent[0].payload.status,'paused');
 f.goal('paused');await f.event('session_start');await f.tick(10000);assert.equal(f.sent.length,1);
 f.goal('active',{waiting:{reason:'PRIVATE_REASON'}});await f.event('session_start');await f.tick(10000);assert.equal(f.sent.length,1);
}));

test('off/on and menu channel switches discard pending Goal transitions, never requeue on the observer',t=>fixture(t,async f=>{
 f.goal();await f.begin();f.goal('blocked');await f.finish('error','error');await f.command('notify-off');await f.command('notify-on');await f.tick(10000);assert.equal(f.sent.length,0);
 const {Store}=await import('../modules/webhook/src/core_v2.0.0.mjs');const store=new Store(f.store.root);const r=await store.readRegistry();await store.saveProfile('discord',{authorized:true,url:'https://notify.example.invalid/another',key:''},r.revision);await f.tick(1000);
 f.goal();await f.begin();f.goal('complete');await f.finish();const selections=['切換通知方式','一般 Webhook'];f.ctx.ui.select=async(_title,options)=>{const picked=selections.shift();return options.find(p=>p.startsWith(picked));};f.ctx.ui.confirm=async()=>true;await f.command('notify');await f.tick(10000);assert.equal(f.sent.length,0);
 f.goal();await f.begin();f.goal('complete');await f.finish();await f.tick();assert.equal(f.sent.length,1);
}));
