import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
import {EventEmitter} from 'node:events';
import dns from 'node:dns/promises';
import https from 'node:https';
import {fromHost,ai} from './runtime.mjs';
import {Store} from '../modules/webhook/src/core_v2.0.1.mjs';
const core=await fromHost('dist/index.js'),{loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const goalPath=fileURLToPath(new URL('../modules/goal/extensions/index_v0.1.0.ts',import.meta.url)),notifyPath=fileURLToPath(new URL('../modules/webhook/extensions/index_v2.3.0.ts',import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=7000){const start=Date.now();while(Date.now()-start<ms){if(await fn())return;await sleep(20);}throw new Error('Own Goal/Notify fixture timed out');}
for(const scenario of [{goalFirst:true,kind:'complete'},{goalFirst:false,kind:'complete'},{goalFirst:false,kind:'quota'},{goalFirst:true,kind:'wait'}])test(`own Goal + Notify actual AgentSession: ${scenario.kind}, ${scenario.goalFirst?'Goal first':'Notify first'}; no real POST`,async t=>{
 const root=await mkdtemp(join(tmpdir(),'peicd100 notify-own140 ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;let session;
 const posts=[],errors=[],notices=[];let requests=0;
 t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);syncBuiltinESMExports();
 t.mock.method(https,'request',(url,_options,callback)=>{assert.equal(url.hostname,'notify.example.invalid');const request=new EventEmitter();request.destroy=()=>{};request.end=body=>{posts.push(JSON.parse(body));queueMicrotask(()=>callback({statusCode:204,destroy(){}}));};return request;});
 try{
  const store=new Store(join(root,'config/webhook-notifier'));await store.writeConfig({version:1,enabled:true,url:'https://notify.example.invalid/fixture',key:'',format:'generic',notifyOn:['completed']});await store.writeDefault(true);
  const extensions=await loadExtensions(scenario.goalFirst?[goalPath,notifyPath]:[notifyPath,goalPath],root);assert.deepEqual(extensions.errors,[]);
  const runtime=await core.ModelRuntime.create({credentials:new ai.InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});runtime.hasConfiguredAuth=()=>true;runtime.checkAuth=async()=>true;runtime.getAuth=async()=>({auth:{apiKey:'fixture-only'},source:'FIXTURE'});runtime.streamSimple=()=>{throw new Error('No real/nested provider calls');};
  const manager=core.SessionManager.create(root,join(root,'sessions')),state=()=>manager.getBranch().findLast(e=>e.type==='custom'&&e.customType==='peicd100:goal-state')?.data;
  const loader={getExtensions:()=>extensions,getSkills:()=>({skills:[],diagnostics:[]}),getPrompts:()=>({prompts:[],diagnostics:[]}),getThemes:()=>({themes:[],diagnostics:[]}),getAgentsFiles:()=>({agentsFiles:[]}),getSystemPrompt:()=> 'Fixture only',getSystemPromptSource:()=>undefined,getAppendSystemPrompt:()=>[],getAppendSystemPromptSources:()=>[],extendResources:()=>{},reload:async()=>{}};
  ({session}=await core.createAgentSession({cwd:root,agentDir:root,modelRuntime:runtime,model:runtime.getModel('openai','gpt-4o'),thinkingLevel:'off',settingsManager:core.SettingsManager.inMemory({retry:{enabled:false},compaction:{enabled:false}}),sessionManager:manager,resourceLoader:loader}));
  session.agent.streamFunction=m=>{
   requests++;assert.ok(requests<5,'No unbounded fixture loop');assert.equal(posts.length,0,'Do not notify while Goal is still working/waiting');
   const stream=ai.createAssistantMessageEventStream();queueMicrotask(()=>{
    const usage={input:8,output:2,cacheRead:0,cacheWrite:0,totalTokens:10,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
    if(scenario.kind==='quota'&&requests===2){stream.push({type:'error',reason:'error',error:{role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:[],stopReason:'error',errorMessage:'insufficient_quota fixture-only',usage}});stream.end();return;}
    const g=state()?.goal;
    const content=requests===1?[{type:'toolCall',id:'create-own',name:'peicd100_goal',arguments:{action:'create',objective:'PRIVATE fixture objective',criteria:['PRIVATE fixture acceptance']}}]:scenario.kind==='wait'?(requests===2?[{type:'toolCall',id:'wait-own',name:'peicd100_goal',arguments:{action:'wait',id:g.id,revision:g.revision,kind:'user',reason:'PRIVATE user question'}}]:[{type:'text',text:'Waiting for fixture user choice.'}]):requests===2?[{type:'text',text:'Continue fixture verification.'}]:[{type:'toolCall',id:'complete-own',name:'peicd100_goal',arguments:{action:'complete',id:g.id,revision:g.revision,verification:['PRIVATE verified fixture result']}}];
    const stopReason=content.some(x=>x.type==='toolCall')?'toolUse':'stop';stream.push({type:'done',reason:stopReason,message:{role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content,stopReason,usage}});stream.end();
   });return stream;
  };
  await session.bindExtensions({mode:'tui',onError:e=>errors.push(e),uiContext:{notify:s=>notices.push(s),confirm:async()=>true,select:async()=>undefined,custom:async factory=>new Promise(async resolve=>{const c=await factory({requestRender(){}},{fg:(_k,s)=>s},{matches:(d,id)=>d==='\r'&&id==='tui.select.confirm'},resolve);c.handleInput('\r');}),setStatus(){},setWidget(){}},commandContextActions:{waitForIdle:()=>session.waitForIdle()}});
  await session.prompt('Create approved fixture Goal.');await session.waitForIdle();
  if(scenario.kind==='wait'){
   assert.equal(state().goal.status,'active');assert.equal(state().goal.waiting.kind,'user');await sleep(3600);assert.equal(posts.length,0);assert.equal((await store.recent()).length,0);
  }else{
   await until(()=>posts.length===1);await until(async()=>!(await store.recent()).some(x=>x.state==='UNKNOWN'));
   assert.equal(posts[0].goal_status,scenario.kind==='quota'?'usage_limited':'complete');assert.equal(posts[0].status,scenario.kind==='quota'?'usage_limited':'completed');assert.equal((await store.recent()).length,1);assert.ok(!JSON.stringify(posts).includes('PRIVATE'));await sleep(100);assert.equal(posts.length,1);
  }
  assert.deepEqual(errors,[]);assert.equal(requests,scenario.kind==='quota'?2:3);
 }finally{session?.dispose();t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
});
