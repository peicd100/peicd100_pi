import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {fromHost,ai} from './runtime.mjs';
import {SuffixStore,EMPTY,POLICY_TYPE,composeInput,readPolicy,validateConfig} from '../modules/suffix/src/core_v0.1.0.mjs';
import {commandName} from '../src/commands_v0.11.0.mjs';
import {Store as NotifyStore} from '../modules/webhook/src/core_v2.0.1.mjs';
const core=await fromHost('dist/index.js'),{loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const root=fileURLToPath(new URL('../',import.meta.url));
async function temp(fn){const dir=await mkdtemp(join(tmpdir(),'suffix 中文 '));try{return await fn(dir);}finally{await rm(dir,{recursive:true,force:true});}}
test('namespace keeps old spelling, suffix/context exact peicd100 only',()=>{assert.equal(commandName('suffix'),'suffix(peicd100)');assert.equal(commandName('context'),'context(peicd100)');assert.equal(commandName('acm'),'acm(piecd100)');assert.equal(commandName('notify'),'notify(piecd100)');});
test('suffix input adds user text exactly once with images, including manually matching tail',()=>{const images=[{type:'image',data:'fixture'}];assert.deepEqual(composeInput({source:'interactive',text:'請分析',images},true,'繁體中文'),{action:'transform',text:'請分析\n\n繁體中文',images});assert.equal(composeInput({source:'rpc',text:'原文\n\n繁體中文'},true,'繁體中文').text,'原文\n\n繁體中文\n\n繁體中文');});
for(const [source,text,enabled] of [['extension','auto',true],['interactive',' /suffix(peicd100)',true],['rpc','/unknown',true],['interactive','!pwd',true],['interactive','',true],['interactive','普通提示',false]])test(`no suffix for ${source}/${JSON.stringify(text)}/${enabled}`,()=>assert.deepEqual(composeInput({source,text},enabled,'後綴'),{action:'continue'}));
test('empty and invalid config fail rather than silent append; UTF8 byte bound',()=>{assert.throws(()=>composeInput({source:'rpc',text:'提示'},true,'  '));for(const cfg of [{...EMPTY,version:2},{...EMPTY,defaultEnabled:'on'},{...EMPTY,text:'中'.repeat(11000)},{...EMPTY,text:'\0'},{...EMPTY,unknown:true}])assert.throws(()=>validateConfig(cfg));});
test('private atomic store CAS/cancel/lock/reload/default false preserves full UTF8',()=>temp(async dir=>{const store=new SuffixStore(dir);assert.deepEqual(store.read(),{hash:'absent',config:EMPTY});const saved=await store.save({...EMPTY,text:'第一行\n臺灣繁體'},'absent');assert.equal(new SuffixStore(dir).read().config.text,'第一行\n臺灣繁體');if(process.platform!=='win32')assert.equal((await stat(store.path)).mode&0o777,0o600);await assert.rejects(()=>store.save({...EMPTY,text:'stale'},'absent'));await assert.rejects(()=>store.save({...EMPTY,text:'cancelled'},saved.hash,()=>{throw new Error('cancel');}));assert.equal(store.read().hash,saved.hash);await writeFile(join(store.dir,'config.lock'),'occupied');await assert.rejects(()=>store.save({...EMPTY,text:'busy'},saved.hash));assert.equal(store.read().hash,saved.hash);}));
test('policy chooses active branch only and rejects malformed newest policy',()=>{const a={type:'custom',customType:POLICY_TYPE,data:{version:1,enabled:true,defaultEnabled:false,origin:'explicit'}};assert.equal(readPolicy([a]).enabled,true);assert.equal(readPolicy([]),null);assert.throws(()=>readPolicy([a,{...a,data:{enabled:'yes'}}]));});
async function sdk(fn){return temp(async dir=>{const previous=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=dir;const sessions=[];try{
 const store=new SuffixStore(dir);let notices=[],menus=[],nextSelect,edited,confirmed=true;const errors=[],wires=[];
 async function make(manager=core.SessionManager.inMemory(dir)){
  const paths=['acm','webhook','theme','activity','suffix'].map(n=>join(root,'extensions',n+'.ts'));const loaded=await loadExtensions(paths,dir);assert.deepEqual(loaded.errors,[]);
  const registry=await core.ModelRuntime.create({credentials:new ai.InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});registry.hasConfiguredAuth=()=>true;registry.getAuth=async()=>({auth:{apiKey:'fixture-only-no-network'},source:'FIXTURE'});const model={...registry.getModel('openai-codex','gpt-6.1-sol'),contextWindow:272000};registry.streamSimple=()=>{throw new Error('Forbidden summary/provider');};
  const settings={acm:{triggerPercent:80,targetPercent:70},compaction:{enabled:true,reserveTokens:54400,keepRecentTokens:190400},retry:{enabled:false},theme:'system'};
  const loader={getExtensions:()=>loaded,getSkills:()=>({skills:[],diagnostics:[]}),getPrompts:()=>({prompts:[],diagnostics:[]}),getThemes:()=>({themes:[],diagnostics:[]}),getAgentsFiles:()=>({agentsFiles:[]}),getSystemPrompt:()=> 'SDK suffix fixture',getSystemPromptSource:()=>undefined,getAppendSystemPrompt:()=>[],getAppendSystemPromptSources:()=>[],extendResources:()=>{},reload:async()=>{}};
  const {session}=await core.createAgentSession({cwd:dir,agentDir:dir,modelRuntime:registry,model,settingsManager:core.SettingsManager.inMemory(settings),sessionManager:manager,resourceLoader:loader,tools:[]});sessions.push(session);
  await session.bindExtensions({mode:'tui',onError:e=>errors.push(e),uiContext:{notify:s=>notices.push(s),setStatus:()=>{},select:async(title,labels)=>{menus.push({title,labels});const cb=nextSelect;nextSelect=undefined;return cb?cb(labels):undefined;},editor:async()=>edited,input:async()=> '示例',confirm:async()=>confirmed}});
  session.agent.streamFunction=(m,context)=>{const stream=ai.createAssistantMessageEventStream();queueMicrotask(()=>{wires.push(structuredClone(context.messages));const response={role:'assistant',api:m.api,provider:m.provider,model:m.id,content:[{type:'text',text:'offline reply'}],usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};stream.push({type:'done',reason:'stop',message:response});stream.end();});return stream;};return session;
 }
 await fn({dir,store,make,notices,menus,wires,errors,select:cb=>{nextSelect=cb;},edit:text=>{edited=text;},confirm:b=>{confirmed=b;}});assert.deepEqual(errors,[]);
 }finally{sessions.forEach(s=>s.dispose());if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;}});}
const userText=wire=>wire.filter(m=>m.role==='user').at(-1).content.map(c=>c.type==='text'?c.text:'').join('');
test('genuine all-five SDK suffix default off/edit/on/persisted user + ACM wire/extension skip/off/mainmenus no model',()=>sdk(async f=>{
 const s=await f.make();assert.equal(readPolicy(s.sessionManager.getBranch()).enabled,false);await s.prompt('/suffix(peicd100) on');assert.equal(readPolicy(s.sessionManager.getBranch()).enabled,false);
 f.edit('請使用繁體中文。');f.select(labels=>labels[1]);await s.prompt('/suffix(peicd100)');assert.equal(f.store.read().config.text,'請使用繁體中文。');
 f.select(labels=>{assert.match(labels[0],/切換本對話是否啟用/);return labels[0];});await s.prompt('/suffix(peicd100)');assert.equal(readPolicy(s.sessionManager.getBranch()).enabled,true);
 await s.prompt('第一個問題');assert.equal(userText(f.wires.at(-1)),'第一個問題\n\n請使用繁體中文。');const msg=s.sessionManager.getBranch().filter(e=>e.type==='message'&&e.message.role==='user').at(-1);assert.equal(msg.message.content[0].text,'第一個問題\n\n請使用繁體中文。');assert.equal(s.model.contextWindow,272000);
 await s.prompt('自動續跑',{source:'extension'});assert.equal(userText(f.wires.at(-1)),'自動續跑');
 const calls=f.wires.length;f.select(labels=>{assert.equal(labels[0],'查看目前狀態');return labels[0];});await s.prompt('/acm(piecd100)');assert.match(f.notices.at(-1),/ACM/);assert.equal(f.wires.length,calls);
 f.select(labels=>{assert.match(labels[0],/切換本對話是否開啟/);return undefined;});await s.prompt('/notify(piecd100)');assert.equal(f.wires.length,calls);
 await s.prompt('/suffix(peicd100) off');await s.prompt('普通問題');assert.equal(userText(f.wires.at(-1)),'普通問題');
}));
test('genuine defaults apply new sessions only, branches inherit policy and old turns unchanged, restore manager survives reload',()=>sdk(async f=>{
 await f.store.save({...EMPTY,text:'後綴甲'},'absent');const a=await f.make();const leaf=a.sessionManager.getLeafId();const snap=f.store.read();await f.store.save({...snap.config,defaultEnabled:true},snap.hash);
 const b=await f.make();assert.equal(readPolicy(a.sessionManager.getBranch()).enabled,false);assert.equal(readPolicy(b.sessionManager.getBranch()).enabled,true);
 await a.prompt('/suffix(peicd100) on');await a.prompt('原問題');const raw=JSON.stringify(a.sessionManager.getEntries());const now=f.store.read();await f.store.save({...now.config,text:'後綴乙'},now.hash);assert.equal(JSON.stringify(a.sessionManager.getEntries()),raw);
 await a.prompt('新問題');assert.equal(userText(f.wires.at(-1)),'新問題\n\n後綴乙');await a.prompt('/suffix(peicd100) off');a.sessionManager.branch(leaf);assert.equal(readPolicy(a.sessionManager.getBranch()).enabled,false);
 const restored=await f.make(b.sessionManager);assert.equal(readPolicy(restored.sessionManager.getBranch()).enabled,true);await restored.prompt('恢復問題');assert.equal(userText(f.wires.at(-1)),'恢復問題\n\n後綴乙');
}));
test('real main menus persist defaults and notify first toggle without endpoint setup or network',()=>sdk(async f=>{
 await f.store.save({...EMPTY,text:'預設後綴'},'absent');await new NotifyStore(join(f.dir,'config/webhook-notifier')).writeDefault(true,false);const a=await f.make();f.select(labels=>{f.select(inner=>inner[0]);return labels[2];});await a.prompt('/suffix(peicd100)');assert.equal(f.store.read().config.defaultEnabled,true);assert.equal(readPolicy(a.sessionManager.getBranch()).enabled,false);const b=await f.make();assert.equal(readPolicy(b.sessionManager.getBranch()).enabled,true);
 f.select(labels=>labels[0]);await a.prompt('/notify(piecd100)');const entry=a.sessionManager.getBranch().findLast(e=>e.type==='custom'&&e.customType.includes('webhook')||e.type==='custom'&&e.customType.includes('notify'));assert(entry);assert.equal(entry.data.mode,'off');assert.equal(f.wires.length,0);
}));
test('file-backed genuine session reopens with saved suffix switch and original user text',()=>sdk(async f=>{
 await f.store.save({...EMPTY,text:'持久後綴'},'absent');const manager=core.SessionManager.create(f.dir,join(f.dir,'sessions'));const a=await f.make(manager);await a.prompt('/suffix(peicd100) on');await a.prompt('保存問題');const file=manager.getSessionFile();assert(file);await a.prompt('/suffix(peicd100) off');const reopened=core.SessionManager.open(file);const b=await f.make(reopened);assert.equal(readPolicy(b.sessionManager.getBranch()).enabled,false);assert(reopened.getBranch().some(e=>e.type==='message'&&e.message.role==='user'&&e.message.content[0].text==='保存問題\n\n持久後綴'));await b.prompt('恢復問題');assert.equal(userText(f.wires.at(-1)),'恢復問題');
}));
test('queued genuine follow-up freezes suffix at submission and is not double-appended on delivery',()=>sdk(async f=>{
 await f.store.save({...EMPTY,text:'排隊甲',defaultEnabled:true},'absent');const s=await f.make();const original=s.agent.streamFunction;let release,started;const ready=new Promise(r=>{started=r;});let first=true;
 s.agent.streamFunction=(m,context,options)=>{if(!first)return original(m,context,options);first=false;f.wires.push(structuredClone(context.messages));const stream=ai.createAssistantMessageEventStream();release=()=>{const response={role:'assistant',api:m.api,provider:m.provider,model:m.id,content:[{type:'text',text:'offline held reply'}],usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'stop',timestamp:Date.now()};stream.push({type:'done',reason:'stop',message:response});stream.end();};started();return stream;};
 const running=s.prompt('第一題');await ready;try{await s.prompt('排隊問題',{streamingBehavior:'followUp'});const snapshot=f.store.read();await f.store.save({...snapshot.config,text:'排隊乙'},snapshot.hash);}finally{release();}await running;await s.waitForIdle();assert.equal(f.wires.length,2);assert.equal(userText(f.wires.at(-1)),'排隊問題\n\n排隊甲');
}));
test('genuine automatic retry retains one suffix without calling input transformation again',()=>sdk(async f=>{
 await f.store.save({...EMPTY,text:'重試後綴',defaultEnabled:true},'absent');const s=await f.make();s.settingsManager.setRetryEnabled(true);const original=s.agent.streamFunction;let first=true;
 s.agent.streamFunction=(m,context,options)=>{if(!first)return original(m,context,options);first=false;f.wires.push(structuredClone(context.messages));const stream=ai.createAssistantMessageEventStream();queueMicrotask(()=>{const response={role:'assistant',api:m.api,provider:m.provider,model:m.id,content:[],usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},stopReason:'error',errorMessage:'429 rate limit fixture',timestamp:Date.now()};stream.push({type:'error',reason:'error',error:response});stream.end();});return stream;};
 await s.prompt('重試問題');assert.equal(f.wires.length,2);for(const wire of f.wires)assert.equal(userText(wire),'重試問題\n\n重試後綴');assert.equal(s.sessionManager.getBranch().filter(e=>e.type==='message'&&e.message.role==='user').length,1);
}));
test('malformed shared config blocks enabled input without model, off still permits input',()=>sdk(async f=>{
 await f.store.save({...EMPTY,text:'原後綴',defaultEnabled:true},'absent');const s=await f.make();await writeFile(f.store.path,'{broken');await s.prompt('不送出');assert.equal(f.wires.length,0);await s.prompt('/suffix(peicd100) off');
 assert.equal(readPolicy(s.sessionManager.getBranch()).enabled,false);assert.equal(await readFile(f.store.path,'utf8'),'{broken');await s.prompt('停用後正常');assert.equal(userText(f.wires.at(-1)),'停用後正常');
}));
test('menu cancelled/editor cancelled/config race/session branch drift have no side effects or model call',()=>sdk(async f=>{
 await f.store.save({...EMPTY,text:'初始'},'absent');const s=await f.make(),hash=f.store.read().hash;
 await s.prompt('/suffix(peicd100)');assert.equal(f.store.read().hash,hash);
 f.select(labels=>labels[1]);f.edit(undefined);await s.prompt('/suffix(peicd100)');assert.equal(f.store.read().hash,hash);
 f.edit('不保存');f.confirm(false);f.select(labels=>labels[1]);await s.prompt('/suffix(peicd100)');assert.equal(f.store.read().hash,hash);
 f.select(async labels=>{const snapshot=f.store.read();await f.store.save({...snapshot.config,text:'其他寫者'},snapshot.hash);return labels[0];});await s.prompt('/suffix(peicd100)');assert.equal(readPolicy(s.sessionManager.getBranch()).enabled,false);assert.equal(f.store.read().config.text,'其他寫者');assert.equal(f.wires.length,0);
}));
