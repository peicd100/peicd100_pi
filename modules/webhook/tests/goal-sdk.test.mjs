import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import dns from 'node:dns/promises';
import https from 'node:https';
import {createAssistantMessageEventStream,InMemoryCredentialStore} from '@earendil-works/pi-ai';
import {Store} from '../src/core_v1.2.2.mjs';
import {fromHost} from './runtime.mjs';
const core=await fromHost('dist/index.js'),{loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const require=createRequire(import.meta.url),goalPath=join(dirname(require.resolve('@narumitw/pi-goal/package.json')),'dist/index.ts');
const webhookPath=fileURLToPath(new URL('../extensions/index_v1.6.0.ts',import.meta.url));
const activityPath=fileURLToPath(new URL('../../activity/extensions/index.ts',import.meta.url));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate){for(let i=0;i<1000;i++){if(await predicate())return;await sleep(10);}throw new Error('Timed out waiting for mocked Goal lifecycle');}
for(const {goalFirst,recover} of [{goalFirst:true,recover:false},{goalFirst:false,recover:false},{goalFirst:true,recover:true}])test(`real pi-goal 0.54.11 + Pi AgentSession (${goalFirst?'goal first':'webhook first'}${recover?', server-error wait/resume':''}): active continuation is silent; explicit wait and complete transitions notify once each`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'actual Goal interoperability ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;let session;
 const sent=[],errors=[],notices=[];let requests=0;
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
 t.mock.method(https,'request',(_url,_options,callback)=>{const r=new EventEmitter();r.destroy=()=>{};r.end=b=>{sent.push(JSON.parse(b));queueMicrotask(()=>callback({statusCode:204,destroy:()=>{}}));};return r;});
 try {
  const store=new Store(join(root,'config/webhook-notifier'));await store.writeConfig({version:1,enabled:true,url:'https://notify.example.invalid/fixture',key:'',format:'generic',notifyOn:['completed']});await store.writeDefault(true);
  const extensions=await loadExtensions(goalFirst?[goalPath,webhookPath,activityPath]:[webhookPath,goalPath,activityPath],root);assert.deepEqual(extensions.errors,[]);
  const registry=await core.ModelRuntime.create({credentials:new InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});registry.hasConfiguredAuth=()=>true;registry.checkAuth=async()=>true;registry.getAuth=async()=>({auth:{apiKey:'fixture-only'},source:'FIXTURE'});registry.streamSimple=()=>{throw new Error('No nested or real model calls');};
  const manager=core.SessionManager.create(root,join(root,'sessions'));
  const loader={getExtensions:()=>extensions,getSkills:()=>({skills:[],diagnostics:[]}),getPrompts:()=>({prompts:[],diagnostics:[]}),getThemes:()=>({themes:[],diagnostics:[]}),getAgentsFiles:()=>({agentsFiles:[]}),getSystemPrompt:()=> 'Fixture only',getSystemPromptSource:()=>undefined,getAppendSystemPrompt:()=>[],getAppendSystemPromptSources:()=>[],extendResources:()=>{},reload:async()=>{}};
  ({session}=await core.createAgentSession({cwd:root,agentDir:root,modelRuntime:registry,model:registry.getModel('openai-codex','gpt-6.1-sol'),thinkingLevel:'off',settingsManager:core.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}}),sessionManager:manager,resourceLoader:loader}));
  session.agent.streamFunction=m=>{
   requests++;assert(requests<=2,'Unexpected Goal continuation after completion');assert.equal(sent.length,recover&&requests>1?1:0,'Only an explicit stable waiting episode may notify before completion');
   const goal=manager.getBranch().findLast(e=>e.customType==='goal-state')?.data?.goal;
   const stream=createAssistantMessageEventStream();queueMicrotask(()=>{
    const usage={input:8,output:2,cacheRead:0,cacheWrite:0,totalTokens:10,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
    if(recover&&requests===1){stream.push({type:'error',reason:'error',error:{role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:[],stopReason:'error',errorMessage:'503 Service unavailable',usage}});stream.end();return;}
    const stopReason=requests===1?'stop':'toolUse',content=requests===1?[{type:'text',text:'Continue fixture work'}]:[{type:'toolCall',id:'complete-call',name:'goal_complete',arguments:{goal_id:goal.id,summary:'Fixture output verified by assertions.'}}];
    stream.push({type:'done',reason:stopReason,message:{role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content,stopReason,usage}});stream.end();
   });return stream;
  };
  await session.bindExtensions({mode:'tui',onError:e=>errors.push(e),uiContext:{notify:s=>notices.push(s),confirm:async()=>true,select:async()=>undefined,setStatus:()=>{},setWidget:()=>{}},commandContextActions:{waitForIdle:()=>session.waitForIdle()}});
  await session.prompt('/goal Complete the disposable fixture');
  if(recover){
    await until(()=>manager.getBranch().findLast(e=>e.customType==='goal-state')?.data?.goal?.waiting);
    await until(()=>sent.length===1);await until(async()=>!(await store.recent()).some(r=>r.state==='UNKNOWN'));assert.equal(sent[0].goal_status,'waiting');assert.match(sent[0].text,/尚未完成/);assert.equal(requests,1);
    await session.prompt('/goal resume');
  }
  try {await until(()=>manager.getBranch().some(e=>e.customType==='goal-state'&&e.data?.goal?.status==='complete'));}
  catch(error){error.message+=JSON.stringify({requests,notices,errors,states:manager.getBranch().filter(e=>e.customType==='goal-state').map(e=>e.data)});throw error;}
  const states=manager.getBranch().filter(e=>e.customType==='goal-state');assert.equal(states.at(-1).data.goal,null,'Characterize actual complete-then-null persistence');
  try {await until(()=>sent.length===(recover?2:1));await until(async()=>!(await store.recent()).some(r=>r.state==='UNKNOWN'));}
  catch(error){error.message+=JSON.stringify({requests,notices,errors,receipts:await store.recent()});throw error;}
  assert.equal(requests,2);assert.equal(sent.at(-1).goal_status,'complete');assert.equal(sent.at(-1).status,'completed');assert.deepEqual(errors,[]);
  assert(!JSON.stringify(sent).includes('disposable fixture'));assert.equal((await store.recent()).length,recover?2:1);
 }finally{session?.dispose();t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
});
