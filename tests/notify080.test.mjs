import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {EventEmitter} from 'node:events';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
import {Store,validateProfile,validateRegistry,makePayload,formatSendTime,deliver,notificationId,postJson} from '../modules/webhook/src/core_v2.0.0.mjs';
import {Store as LegacyStore} from '../modules/webhook/src/core_v1.6.0.mjs';
import {initialSessionPolicy,authorizedConfig,sessionEnabled} from '../modules/webhook/src/session-policy_v2.0.0.mjs';
import {readGoalPolicy} from '../modules/webhook/src/goal-policy_v2.0.0.mjs';
const bot={authorized:true,token:'123456:TEST_ONLY_NOT_A_REAL_BOT_TOKEN_0000',chatId:'-100123456789'};
const hook={authorized:true,url:'https://notify.example.invalid/fixture',key:'dummy-only'};
const oldConfig={version:1,enabled:true,format:'discord',url:hook.url,key:'',notifyOn:['completed'],goalNotifyOn:['waiting']};
const event={id:notificationId('session','terminal','completed'),sessionId:'session',sessionName:'修正 ACM 分析介面',outcome:'completed'};
async function fixture(run){const root=await mkdtemp(join(tmpdir(),'notify80 中文 '));try{await run(new Store(root),new LegacyStore(root),root);}finally{await rm(root,{recursive:true,force:true});}}
test('Telegram fixed token/chat validation; registry selects one configured profile, no arbitrary endpoint fields',()=>{
 assert.equal(validateProfile('telegram',{...bot,url:'https://localhost/'}).token,bot.token);
 for(const p of [{...bot,token:'secret\nHEADER'},{...bot,chatId:'123\nTOKEN'},{...bot,token:'https://evil.test/'}])assert.throws(()=>validateProfile('telegram',p));
 assert.throws(()=>validateProfile('generic',{...hook,url:'http://notify.example.invalid/'}));assert.throws(()=>validateRegistry({version:2,revision:'implicit',active:'telegram',profiles:{},legacyConsentAllowed:true}));
});
test('legacy global-off is read-only permission migration, no silent grant, new branch consent is isolated',()=>fixture(async(store,legacy,root)=>{
 await legacy.writeConfig(oldConfig);await legacy.writeGlobal(false,'implicit');await legacy.writeDefault(true);
 const configRaw=await readFile(legacy.configPath),globalRaw=await readFile(legacy.globalPath),config=await store.readConfig();assert.equal(config.enabled,false);
 const oldBranch=[{type:'custom',customType:'webhook-notifier-session-policy',data:{version:1,mode:'on',defaultEnabled:true,origin:'explicit'}}];
 const policy=initialSessionPolicy(oldBranch,true,config);assert.equal(sessionEnabled(policy),false);assert.equal(authorizedConfig(config,policy).enabled,false);
 assert.deepEqual(await readFile(legacy.configPath),configRaw);assert.deepEqual(await readFile(legacy.globalPath),globalRaw);await assert.rejects(access(store.registryPath),{code:'ENOENT'});
 const r=await store.readRegistry();await store.saveProfile('telegram',bot,r.revision);assert.equal((await store.readRegistry()).profiles.discord.authorized,false);assert.equal(initialSessionPolicy(oldBranch,true,await store.readConfig()).mode,'off');assert.equal(await store.readDefault(),true);
}));
test('saved profiles/CAS switch revision/selected clear preserve other profiles/preferences/claims and old global becomes historical',()=>fixture(async(store,legacy)=>{
 await legacy.writeDefault(true);let r=await store.readRegistry();r=await store.saveProfile('discord',{...hook,key:''},r.revision);const first=r.revision;r=await store.saveProfile('telegram',bot,r.revision);r=await store.select('discord',r.revision);assert.notEqual(r.revision,first);assert.equal(r.active,'discord');assert.equal(r.profiles.telegram.token,bot.token);await assert.rejects(store.select('telegram',first));
 await legacy.writeGlobal(false,'implicit');assert.equal((await store.readConfig()).enabled,true,'new registry ignores superseded legacy global');
 await store.claim(event.id,{test:true});r=await store.clearSelected(r.revision);assert.equal(r.active,null);assert.equal(r.profiles.telegram.token,bot.token);assert.equal(await store.readDefault(),true);assert.equal((await store.recent()).length,1);
}));
test('malformed private legacy global/config/registry fail closed; no automatic overwrite',()=>fixture(async(store,legacy)=>{
 await legacy.writeConfig(oldConfig);await writeFile(legacy.globalPath,'{malformed',{mode:0o600});await assert.rejects(store.readRegistry());await writeFile(store.registryPath,'{}',{mode:0o600});await assert.rejects(store.readConfig());assert.equal(await readFile(store.registryPath,'utf8'),'{}');
}));
test('title firstline/status suffix/reason/next UTC8/unnamed/no mentions/private reason or response; same plain template across channels',()=>{
 const at=new Date('2026-10-12T00:00:00Z');assert.equal(formatSendTime(at),'2026-10-12 08:00:00（UTC+8）');
 for(const format of ['generic','slack','discord','telegram']){
  const p=makePayload({...event,chatId:bot.chatId,reason:'PRIVATE_REASON',response:'PRIVATE_RESPONSE'},format,at),text=p.text??p.content;assert.match(text,/^✅ 修正 ACM 分析介面｜已完成\n/);assert.match(text,/原因：任務已正常結束/);assert.match(text,/下一步：無需處理/);assert(!JSON.stringify(p).includes('PRIVATE'));
  if(format==='discord')assert.deepEqual(p.allowed_mentions,{parse:[]});if(format==='telegram'){assert.equal(p.chat_id,bot.chatId);assert(!p.parse_mode);}
 }
 const p=makePayload({...event,outcome:'error',sessionName:'',stopReason:'length'},'generic',at);assert.match(p.text,/^🔔 未命名對話（session）｜需要處理/);assert.match(p.reason,/長度限制/);
 const masked=makePayload({...event,sessionName:'@everyone '+bot.token},'discord',at);assert(!masked.content.includes('@everyone'));assert(!masked.content.includes(bot.token));
});
for(const status of ['paused','blocked','usage_limited','budget_limited'])test(`fixed ${status} reason and needs-action suffix`,()=>{
 const p=makePayload({...event,goalStatus:status,goalId:'g'},'generic');assert.match(p.text,/｜需要處理/);assert.equal(p.goal_status,status);assert(p.reason&&p.next_action);
});
test('delivery validates fixed API, ignores old event filters, honors API status and durable no resend',()=>fixture(async(store)=>{
 let r=await store.readRegistry();await store.saveProfile('telegram',bot,r.revision);const config=await store.readConfig();let calls=0;
 const options={resolver:async()=>[{address:'8.8.8.8',family:4}],transport:async(url,dest,key,payload,o)=>{calls++;assert.equal(url.hostname,'api.telegram.org');assert.equal(url.pathname,`/bot${bot.token}/sendMessage`);assert.equal(key,'');assert.equal(payload.chat_id,bot.chatId);assert.equal(o.telegram,true);return {state:'API_REJECTED',http_status:200};}};
 assert.equal((await deliver(store,config,event,options)).state,'API_REJECTED');assert.equal((await deliver(store,config,event,options)).state,'DUPLICATE_NO_RESEND');assert.equal(calls,1);assert(!JSON.stringify(await store.recent()).includes(bot.token));
 assert.equal((await deliver(store,config,{...event,goalStatus:'waiting'},options)).state,'SKIPPED');
}));
test('switch during DNS, and ABA switch during awaited guard, cancel without reroute/backfill',()=>fixture(async(store)=>{
 let r=await store.readRegistry();r=await store.saveProfile('discord',{...hook,key:''},r.revision);r=await store.saveProfile('telegram',bot,r.revision);const cfg=await store.readConfig();let calls=0;
 const o={resolver:async()=>{await store.select('discord',(await store.readRegistry()).revision);return [{address:'8.8.8.8',family:4}];},transport:async()=>{calls++;return {state:'ACCEPTED'};}};
 assert.equal((await deliver(store,cfg,event,o)).state,'FAILED_PRECHECK');assert.equal(calls,0);assert.equal((await deliver(store,await store.readConfig(),event,o)).state,'DUPLICATE_NO_RESEND');
 await store.select('telegram',(await store.readRegistry()).revision);const current=await store.readConfig();assert.equal((await deliver(store,current,{...event,id:notificationId('s','t2','error')},{...o,resolver:async()=>[{address:'8.8.8.8',family:4}],preDispatch:async()=>{await store.select('discord',(await store.readRegistry()).revision);await store.select('telegram',(await store.readRegistry()).revision);return true;}})).state,'FAILED_PRECHECK');assert.equal(calls,0);
}));
for(const body of [{ok:true},{ok:false},{}])test(`Telegram HTTP200 acceptance requires API ok (${JSON.stringify(body)})`,async t=>{
 t.mock.method(https,'request',(url,options,callback)=>{const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>{const res=new EventEmitter();res.statusCode=200;res.destroy=()=>{};callback(res);res.emit('data',Buffer.from(JSON.stringify(body)));res.emit('end');});return req;});syncBuiltinESMExports();
 try{const request=postJson(new URL(`https://api.telegram.org/bot${bot.token}/sendMessage`),{address:'8.8.8.8',family:4},'',{chat_id:bot.chatId,text:'test'},{telegram:true});if(body.ok===undefined)await assert.rejects(request,/unknown/);else assert.equal((await request).state,body.ok?'ACCEPTED':'API_REJECTED');}finally{t.mock.restoreAll();syncBuiltinESMExports();}
});
test('goal wait stays active/quiet, manual pause is terminal, unknown schemas remain unknown',()=>{
 const goal={id:'g',status:'active',startedAt:1,updatedAt:1,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0,waiting:{reason:'PRIVATE_REASON',resumeAt:123}};
 const branch=g=>[{type:'custom',customType:'goal-state',id:'entry',data:{goal:g}}];assert.equal(readGoalPolicy(branch(goal)).mode,'active');assert.equal(readGoalPolicy(branch({...goal,waiting:undefined,status:'paused'})).status,'paused');assert.equal(readGoalPolicy(branch({...goal,status:'future'})).mode,'unknown');
});

test('revoked authorization, blocked DNS, pre-dispatch cancellation and unknown transport never POST/resend',()=>fixture(async store=>{
 await store.saveProfile('telegram',bot,(await store.readRegistry()).revision);const cfg=await store.readConfig();let calls=0;
 const transport=async()=>{calls++;return {state:'ACCEPTED'};};
 assert.equal((await deliver(store,cfg,event,{resolver:async()=>[{address:'127.0.0.1',family:4}],transport})).state,'FAILED_PRECHECK');assert.equal(calls,0);
 const second={...event,id:notificationId('s','revoked','completed')};
 const result=await deliver(store,cfg,second,{resolver:async()=>{const r=await store.readRegistry();r.profiles.telegram.authorized=false;await writeFile(store.registryPath,JSON.stringify(r));return [{address:'8.8.8.8',family:4}];},transport});assert.equal(result.state,'FAILED_PRECHECK');assert.equal(calls,0);
 await store.saveProfile('telegram',bot,(await store.readRegistry()).revision);const fresh=await store.readConfig();const third={...event,id:notificationId('s','unknown','completed')};
 assert.equal((await deliver(store,fresh,third,{resolver:async()=>[{address:'8.8.8.8',family:4}],transport:async()=>{calls++;throw new Error('secret '+bot.token);}})).state,'UNKNOWN');assert.equal(calls,1);assert.equal((await deliver(store,fresh,third,{transport})).state,'DUPLICATE_NO_RESEND');assert(!JSON.stringify(await store.recent()).includes(bot.token));
}));
for(const code of [302,401])test(`Telegram HTTP ${code} rejects without redirect/body logging`,async t=>{
 let calls=0;t.mock.method(https,'request',(_url,_o,cb)=>{calls++;const req=new EventEmitter();req.destroy=()=>{};req.end=()=>queueMicrotask(()=>cb({statusCode:code,destroy(){}}));return req;});syncBuiltinESMExports();try{const r=await postJson(new URL(`https://api.telegram.org/bot${bot.token}/sendMessage`),{address:'8.8.8.8',family:4},'',{text:'test'},{telegram:true});assert.equal(r.state,'HTTP_REJECTED');assert.equal(calls,1);}finally{t.mock.restoreAll();syncBuiltinESMExports();}
});
