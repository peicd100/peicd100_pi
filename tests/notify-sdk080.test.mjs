import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import dns from 'node:dns/promises';
import https from 'node:https';
import {EventEmitter} from 'node:events';
import {syncBuiltinESMExports} from 'node:module';
import {createAssistantMessageEventStream,InMemoryCredentialStore} from '@earendil-works/pi-ai';
import {fromHost} from './runtime.mjs';
import {Store} from '../modules/webhook/src/core_v1.6.0.mjs';
import {readSessionPolicy,sessionEnabled,SESSION_POLICY_TYPE} from '../modules/webhook/src/session-policy_v2.0.0.mjs';
const core=await fromHost('dist/index.js');
const {loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const path=fileURLToPath(new URL('../modules/webhook/extensions/index_v2.0.0.ts',import.meta.url));
test('actual AgentSession TUI binding persists private policy, commands never call models, reload and automatic dedup work without real network',async t=>{
 const root=await mkdtemp(join(tmpdir(),'webhook actual SDK ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;let session;
 const sent=[],notices=[],errors=[];let requests=0;
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
 t.mock.method(https,'request',(_url,_options,callback)=>{const r=new EventEmitter();r.destroy=()=>{};r.end=b=>{sent.push(JSON.parse(b));queueMicrotask(()=>callback({statusCode:204,destroy:()=>{}}));};return r;});
 try {
  const store=new Store(join(root,'config/webhook-notifier'));await store.writeConfig({version:1,enabled:true,url:'https://notify.example.invalid/test',key:'dummy',format:'generic',notifyOn:['completed']});
  let extensions=await loadExtensions([path],root);assert.deepEqual(extensions.errors,[]);
  const registry=await core.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});registry.hasConfiguredAuth=()=>true;registry.checkAuth=async()=>true;registry.getAuth=async()=>({auth:{apiKey:'fixture-only-no-network'},source:'FIXTURE'});
  const model=registry.getModel('openai-codex','gpt-6.1-sol');registry.streamSimple=()=>{throw new Error('Forbidden nested model');};
  const manager=core.SessionManager.create(root,join(root,'sessions'));
  const loader={getExtensions:()=>extensions,getSkills:()=>({skills:[],diagnostics:[]}),getPrompts:()=>({prompts:[],diagnostics:[]}),getThemes:()=>({themes:[],diagnostics:[]}),getAgentsFiles:()=>({agentsFiles:[]}),getSystemPrompt:()=> 'Fixture only',getSystemPromptSource:()=>undefined,getAppendSystemPrompt:()=>[],getAppendSystemPromptSources:()=>[],extendResources:()=>{},reload:async()=>{extensions=await loadExtensions([path],root);}};
  ({session}=await core.createAgentSession({cwd:root,agentDir:root,modelRuntime:registry,model,thinkingLevel:'off',settingsManager:core.SettingsManager.create(root,root),sessionManager:manager,resourceLoader:loader,tools:[]}));
  session.agent.streamFunction=(m,context)=>{
   requests++;assert(!JSON.stringify(context).includes(SESSION_POLICY_TYPE));const stream=createAssistantMessageEventStream();queueMicrotask(()=>{const usage={input:8,output:2,cacheRead:0,cacheWrite:0,totalTokens:10,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}},message={role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:[{type:'text',text:'PRIVATE_ANSWER_FIXTURE'}],stopReason:'stop',usage};stream.push({type:'done',reason:'stop',message});stream.end();});return stream;
  };
  await session.bindExtensions({mode:'tui',onError:e=>errors.push(e),uiContext:{notify:text=>notices.push(text),select:async()=>undefined},commandContextActions:{waitForIdle:async()=>{},reload:async()=>session.reload()}});
  assert.equal(sessionEnabled(readSessionPolicy(manager.getBranch())),false);
  await session.prompt('/notify-default(piecd100) on');assert.equal(requests,0);assert.equal(sessionEnabled(readSessionPolicy(manager.getBranch())),false);
  await session.prompt('PRIVATE_PROMPT_FIXTURE');assert.equal(requests,1);assert.equal(sent.length,0);
  await session.prompt('/notify-on(piecd100)');assert.equal(requests,1);await session.prompt('PRIVATE_PROMPT_FIXTURE');
  for(let n=0;n<500&&sent.length===0;n++)await new Promise(r=>setTimeout(r,10));
  await session.prompt('/notify-status(piecd100) json');
  while(JSON.parse(notices.at(-1)).automatic_pending){await new Promise(r=>setTimeout(r,10));await session.prompt('/notify-status(piecd100) json');}
  assert.equal(sent.length,1,JSON.stringify({notices,policy:readSessionPolicy(manager.getBranch()),recent:await store.recent()}));
  assert(!JSON.stringify(sent).includes('PRIVATE_'));await session.reload();assert.equal(sessionEnabled(readSessionPolicy(manager.getBranch())),true);assert.equal(sent.length,1,'Reload never backfills/resends old terminal');
  await session.prompt('/notify-default(piecd100) off');assert.equal(sessionEnabled(readSessionPolicy(manager.getBranch())),true);await session.prompt('/notify-off(piecd100)');assert.equal(sessionEnabled(readSessionPolicy(manager.getBranch())),false);
  assert.equal(requests,2);assert.deepEqual(errors,[]);assert.equal((await store.recent()).length,1);
  // Real host command routing during an outstanding model stream: no queue,
  // extra model request, abort, endpoint/event or current-choice mutation.
  let release,signal;session.agent.streamFunction=(m,_context,options)=>{requests++;signal=options.signal;const stream=createAssistantMessageEventStream();release=()=>{const message={role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:[{type:'text',text:'PRIVATE_BUSY_FIXTURE'}],stopReason:'stop',usage:{input:1,output:1,cacheRead:0,cacheWrite:0,totalTokens:2,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};stream.push({type:'done',reason:'stop',message});stream.end();};return stream;};
  const before=await readFile(store.configPath),policy=JSON.stringify(readSessionPolicy(manager.getBranch())),working=session.prompt('PRIVATE_BUSY_PROMPT');for(let n=0;n<1000&&!release;n++)await new Promise(r=>setTimeout(r,1));assert(release);
  try{await session.prompt('/notify-on(piecd100)');assert.equal(sessionEnabled(readSessionPolicy(manager.getBranch())),true);assert.equal(signal?.aborted,false);assert.equal(requests,3);await session.prompt('/notify-off(piecd100)');assert.equal(sessionEnabled(readSessionPolicy(manager.getBranch())),false);assert.equal(signal?.aborted,false);assert.deepEqual(await readFile(store.configPath),before);}finally{release();await working;}assert.equal(requests,3);assert.equal(sent.length,1);assert.deepEqual(errors,[]);

  // Public native abort skips agent_before_settle: final settled.aborted still
  // warrants a cancellation notification, without another model request.
  await session.prompt('/notify-on(piecd100)');let entered=false;
  session.agent.streamFunction=(m,_c,o)=>{requests++;entered=true;const stream=createAssistantMessageEventStream();o.signal.addEventListener('abort',()=>{const message={role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:[],stopReason:'aborted',usage:{input:1,output:0,cacheRead:0,cacheWrite:0,totalTokens:1,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};stream.push({type:'done',reason:'aborted',message});stream.end();},{once:true});return stream;};
  const work=session.prompt('PRIVATE_CANCEL_PROMPT');for(let i=0;i<1000&&!entered;i++)await new Promise(r=>setTimeout(r,1));assert(entered);await session.abort();await work;
  for(let i=0;i<600&&sent.length<2;i++)await new Promise(r=>setTimeout(r,10));assert.equal(sent.length,2);assert.equal(sent.at(-1).status,'aborted');assert.match(sent.at(-1).text,/｜需要處理/);assert.equal(requests,4);assert.deepEqual(errors,[]);
 } finally {session?.dispose();t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
});
