import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {fromHost,ai,host} from './runtime.mjs';
import {initialGoal,changeGoal} from '../modules/goal/src/state_v0.1.0.mjs';
import {initialProgress,changeProgress} from '../modules/progress/src/state_v0.1.0.mjs';
import {commandName} from '../src/commands_v0.12.0.mjs';
const core=await fromHost('dist/index.js'),{loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const tui=await import(pathToFileURL(createRequire(join(host,'package.json')).resolve('@earendil-works/pi-tui')).href);
const goalPath=fileURLToPath(new URL('../modules/goal/extensions/index_v0.1.0.ts',import.meta.url));
const progressPath=fileURLToPath(new URL('../modules/progress/extensions/index_v0.1.0.ts',import.meta.url));
const entry='peicd100:goal-state';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,ms=3000){const start=Date.now();while(Date.now()-start<ms){if(fn())return;await sleep(10);}throw new Error('Fixture lifecycle timed out');}
async function fixture(t,respond,{retry={enabled:false},seed,resumeMenu=false,captureInput=false}={}){
 const root=await mkdtemp(join(tmpdir(),'peicd100 goal140 ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;let session;
 const errors=[],notices=[],widgets=new Map(),inputHandlers=new Set();let requests=0,focused,autocomplete=false;
 const keybindings=tui.getKeybindings(),originalMatches=keybindings.matches;if(captureInput)keybindings.matches=function(data,action){return action==='app.interrupt'?data==='\x1b':originalMatches.call(this,data,action);};
 const nativeEditor=captureInput?new core.CustomEditor({requestRender(){}},{borderColor:s=>s,selectList:{}},{matches:()=>false},{}):undefined;if(nativeEditor)nativeEditor.isShowingAutocomplete=()=>autocomplete;focused=nativeEditor;
 const widgetTui={requestRender(){},getFocusedComponent:()=>focused};
 try{
  const extensions=await loadExtensions([goalPath,progressPath],root);assert.deepEqual(extensions.errors,[]);
  const runtime=await core.ModelRuntime.create({credentials:new ai.InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});
  runtime.hasConfiguredAuth=()=>true;runtime.checkAuth=async()=>true;runtime.getAuth=async()=>({auth:{apiKey:'fixture-only'},source:'FIXTURE'});runtime.streamSimple=()=>{throw new Error('No real/nested model requests');};
  const manager=core.SessionManager.create(root,join(root,'sessions'));if(seed)await seed(manager);
  const state=()=>manager.getBranch().findLast(e=>e.type==='custom'&&e.customType===entry)?.data;
  const loader={getExtensions:()=>extensions,getSkills:()=>({skills:[],diagnostics:[]}),getPrompts:()=>({prompts:[],diagnostics:[]}),getThemes:()=>({themes:[],diagnostics:[]}),getAgentsFiles:()=>({agentsFiles:[]}),getSystemPrompt:()=> 'Fixture only',getSystemPromptSource:()=>undefined,getAppendSystemPrompt:()=>[],getAppendSystemPromptSources:()=>[],extendResources:()=>{},reload:async()=>{}};
  const model=runtime.getModel('openai','gpt-4o');assert.ok(model,'Local fixture catalog must contain gpt-4o; no network discovery');
  ({session}=await core.createAgentSession({cwd:root,agentDir:root,modelRuntime:runtime,model,thinkingLevel:'off',settingsManager:core.SettingsManager.inMemory({retry,compaction:{enabled:false}}),sessionManager:manager,resourceLoader:loader}));
  session.agent.streamFunction=(m,_context,options)=>{
   requests++;assert.ok(requests<15,'Fixture runaway; production has no iteration cap');
   const stream=ai.createAssistantMessageEventStream();queueMicrotask(()=>{
    try{
     const spec=respond({request:requests,state:state(),manager,session});
     const usage={input:8,output:2,cacheRead:0,cacheWrite:0,totalTokens:10,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
     const message={role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:spec.content??[],stopReason:spec.error?'error':spec.content?.some(x=>x.type==='toolCall')?'toolUse':'stop',usage,...(spec.error?{errorMessage:spec.error}:{})};
     if(spec.hold){const abort=()=>{stream.push({type:'error',reason:'aborted',error:{...message,stopReason:'aborted',errorMessage:'Fixture aborted by user'}});stream.end();};if(options?.signal?.aborted)abort();else options?.signal?.addEventListener('abort',abort,{once:true});return;}
     if(spec.error)stream.push({type:'error',reason:'error',error:message});else stream.push({type:'done',reason:message.stopReason,message});stream.end();
    }catch(error){stream.push({type:'error',reason:'error',error:{role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:[],stopReason:'error',errorMessage:error.message,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}});stream.end();errors.push(error);}
   });return stream;
  };
  await session.bindExtensions({mode:'tui',onError:e=>errors.push(e),uiContext:{notify:(...n)=>notices.push(n),confirm:async()=>true,select:async()=>undefined,custom:async(factory,options)=>new Promise(async resolve=>{const component=await factory({requestRender(){}},{fg:(_k,s)=>s},{matches:(data,id)=>(data==='\r'&&id==='tui.select.confirm')||(data==='\x1b[B'&&id==='tui.select.down')},resolve);if(resumeMenu&&options?.blocked?.message==='Goal')for(let i=0;i<3;i++)component.handleInput('\x1b[B');component.handleInput('\r');}),setStatus(){},setWidget:(key,value)=>{widgets.set(key,value);if(captureInput&&typeof value==='function')value(widgetTui,{fg:(_k,s)=>s});},onTerminalInput:handler=>{inputHandlers.add(handler);return()=>inputHandlers.delete(handler);}},commandContextActions:{waitForIdle:()=>session.waitForIdle()}});
  return await t.run({session,manager,state,errors,notices,widgets,requests:()=>requests,interrupt:()=>{for(const handler of inputHandlers)handler('\x1b');},focusNative:()=>{focused=nativeEditor;},focusOther:()=>{focused={handleInput(){}};},setAutocomplete:value=>{autocomplete=value;}});
 }finally{session?.dispose();if(captureInput)keybindings.matches=originalMatches;if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
}
const call=(name,args,id='fixture-call')=>({content:[{type:'toolCall',id,name,arguments:args}]});
const create=()=>call('peicd100_goal',{action:'create',objective:'完成mock fixture',criteria:['mock assertions pass']});
function mustState(h){const s=h.state();assert.ok(s,JSON.stringify({requests:h.requests(),errors:h.errors,notices:h.notices,entries:h.manager.getBranch().slice(-6)},null,2));return s;}
// Wrap explicitly instead of allowing node:test's subtest helper to own fixture work.
async function runFixture(t,respond,run,options){return fixture({run},respond,options);}
test('actual AgentSession: own Goal creates, continues at final native boundary, completes with evidence; no pi-goal dependency',async t=>{
 await runFixture(t,({request,state})=>request===1?create():request===2?{content:[{type:'text',text:'Fixture work performed; continue to actual verification.'}]}:call('peicd100_goal',{action:'complete',id:state.goal.id,revision:state.goal.revision,verification:['mock assertions passed']},'complete-call'),async h=>{
  await h.session.prompt('Create the approved fixture goal.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'complete');assert.equal(h.requests(),3);assert.deepEqual(h.errors,[]);
  const branches=h.manager.getBranch();assert.ok(branches.some(e=>e.type==='custom_message'&&e.customType==='peicd100:goal-continuation'));assert.ok(!branches.some(e=>e.customType==='goal-state'));
 });
});
test('actual AgentSession: explicit account exhaustion pauses without retry and preserves progress',async t=>{
 await runFixture(t,({request})=>request===1?create():{error:'insufficient_quota: account credit balance exhausted'},async h=>{
  await h.session.prompt('Create approved fixture.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'paused');assert.equal(h.state().goal.reason,'quota_exhausted');assert.equal(h.requests(),2);await sleep(50);assert.equal(h.requests(),2);assert.deepEqual(h.errors,[]);
 });
});
test('actual AgentSession: external/user wait does not busy-loop or report completion',async t=>{
 await runFixture(t,({request,state})=>request===1?create():request===2?call('peicd100_goal',{action:'wait',id:state.goal.id,revision:state.goal.revision,kind:'user',reason:'需要fixture使用者選擇'},'wait-call'):{content:[{type:'text',text:'Waiting for the explicit user choice.'}]},async h=>{
  await h.session.prompt('Create approved fixture.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'active');assert.equal(h.state().goal.waiting.kind,'user');assert.ok(h.requests()<=3);await sleep(50);assert.ok(h.requests()<=3);assert.deepEqual(h.errors,[]);
 });
});
test('actual AgentSession: transient failure waits fixed 5000ms after final native settlement, then retries once without replaying tools',async t=>{
 let failedAt=0,retriedAt=0;
 await runFixture(t,({request,state})=>{if(request===1)return create();if(request===2){failedAt=Date.now();return {error:'503 Service unavailable fixture-only'};}retriedAt=Date.now();return call('peicd100_goal',{action:'complete',id:state.goal.id,revision:state.goal.revision,verification:['fixed-delay fixture passed']},'retry-complete');},async h=>{
  await h.session.prompt('Create approved fixture.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'active');assert.equal(h.state().goal.retry.attempt,1);assert.equal(h.requests(),2);
  await until(()=>h.state()?.goal?.status==='complete',8500);await h.session.waitForIdle();assert.ok(retriedAt-failedAt>=4900,`Premature retry: ${retriedAt-failedAt}`);assert.equal(h.requests(),3);assert.deepEqual(h.errors,[]);
  assert.equal(h.manager.getBranch().filter(e=>e.type==='message'&&e.message?.role==='toolResult'&&e.message?.toolName==='peicd100_goal'&&e.message?.details?.state?.goal?.revision===1).length,1,'Create side effect is not replayed');
 });
});
test('actual AgentSession: native manual abort pauses Goal and never revives it',async t=>{
 await runFixture(t,({request})=>request===1?create():{hold:true},async h=>{
  const running=h.session.prompt('Create approved fixture.');await until(()=>h.requests()===2);await h.session.abort();await running;
  assert.equal(mustState(h).goal.status,'paused');assert.equal(h.state().goal.reason,'interrupted');assert.equal(h.state().goal.retry.nextAt,null);await sleep(50);assert.equal(h.requests(),2);assert.deepEqual(h.errors,[]);
 });
});
test('actual AgentSession: native automatic retry owns the in-flight recovery; Goal does not add a duplicate retry',async t=>{
 await runFixture(t,({request,state})=>request===1?create():request===2?{error:'503 Service unavailable'}:call('peicd100_goal',{action:'complete',id:state.goal.id,revision:state.goal.revision,verification:['native retry fixture passed']},'native-retry-complete'),async h=>{
  await h.session.prompt('Create approved fixture.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'complete');assert.equal(h.state().goal.retry.attempt,0);assert.equal(h.requests(),3);assert.deepEqual(h.errors,[]);
 },{retry:{enabled:true,maxRetries:1,baseDelayMs:10,maxDelayMs:50}});
});
test('actual AgentSession: queued native follow-up is consumed without an extra Goal continuation',async t=>{
 await runFixture(t,({request,state,session})=>{if(request===1)return create();if(request===2){void session.followUp('Fixture follow-up inside the same approved scope.');return {content:[{type:'text',text:'Native follow-up is queued.'}]};}return call('peicd100_goal',{action:'complete',id:state.goal.id,revision:state.goal.revision,verification:['queued follow-up fixture passed']},'queued-complete');},async h=>{
  await h.session.prompt('Create approved fixture.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'complete');assert.equal(h.requests(),3);assert.equal(h.manager.getBranch().filter(e=>e.type==='custom_message'&&e.customType==='peicd100:goal-continuation').length,0);assert.deepEqual(h.errors,[]);
 });
});
test('actual AgentSession: linked Progress blocks premature Goal complete; finishing steps is not automatic Goal completion',async t=>{
 await runFixture(t,({request,state})=>{if(request===1)return create();if(request===2||request===4)return call('update_progress',{expected_revision:request===2?0:1,goal_id:state.goal.id,steps:[{text:'驗證fixture',status:request===2?'in_progress':'completed'}]},'progress-'+request);if(request===5)assert.equal(state.goal.status,'active','Finished Progress must not complete Goal');return call('peicd100_goal',{action:'complete',id:state.goal.id,revision:state.goal.revision,verification:['linked steps and actual fixture verified']},'complete-'+request);},async h=>{
  await h.session.prompt('Create approved fixture.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'complete');assert.equal(h.requests(),5);const premature=h.manager.getBranch().find(e=>e.type==='message'&&e.message?.role==='toolResult'&&e.message.toolCallId==='complete-3');assert.equal(premature.message.isError,true);assert.deepEqual(h.errors,[]);
 });
});
const seedActive=manager=>{const g=changeGoal(initialGoal('previous-session'),{action:'create',objective:'Restored fixture',criteria:['fixture verified']},{authorized:true,id:'restored-goal',now:1});manager.appendCustomEntry('peicd100:goal-state',g);const p=changeProgress(initialProgress('previous-session'),{action:'replace',revision:0,goalId:g.goal.id,steps:[{text:'Retained fixture progress',status:'in_progress'}]});manager.appendCustomEntry('peicd100:progress-state',p);};
test('actual AgentSession: restore/fork snapshot stays paused, retains data, blocks stale running labels and starts no provider request',async t=>{
 await runFixture(t,()=>{throw new Error('Restore must not authorize provider work');},async h=>{
  assert.equal(mustState(h).goal.status,'paused');assert.equal(h.state().goal.reason,'restored');assert.equal(h.requests(),0);const progress=h.manager.getBranch().findLast(e=>e.customType==='peicd100:progress-state').data;assert.equal(progress.steps[0].text,'Retained fixture progress');assert.equal(progress.steps[0].status,'blocked');await sleep(30);assert.equal(h.requests(),0);assert.deepEqual(h.errors,[]);
 },{seed:seedActive});
});
test('actual AgentSession: explicit idle menu resume authorizes exactly one new run, without keeping the menu open',async t=>{
 await runFixture(t,({state})=>call('peicd100_goal',{action:'complete',id:state.goal.id,revision:state.goal.revision,verification:['explicit idle resume fixture verified']},'idle-complete'),async h=>{
  assert.equal(mustState(h).goal.status,'paused');await h.session.prompt('/'+commandName('goal'));await until(()=>h.state().goal.status==='complete');await h.session.waitForIdle();assert.equal(h.requests(),1);assert.deepEqual(h.errors,[]);
 },{seed:manager=>manager.appendCustomEntry('peicd100:goal-state',changeGoal(initialGoal('previous-session'),{action:'create',objective:'Idle resume fixture',criteria:[]},{authorized:true,id:'idle-goal'})),resumeMenu:true});
});
test('actual AgentSession: native-editor interrupt cancels an idle pending Goal retry, but menu/autocomplete Escape does not',async t=>{
 await runFixture(t,({request})=>request===1?create():{error:'503 Service unavailable'},async h=>{
  await h.session.prompt('Create approved fixture.');await h.session.waitForIdle();assert.equal(mustState(h).goal.status,'active');assert.ok(h.state().goal.retry.nextAt>Date.now());
  h.focusOther();h.interrupt();assert.equal(h.state().goal.status,'active');h.focusNative();h.setAutocomplete(true);h.interrupt();assert.equal(h.state().goal.status,'active');h.setAutocomplete(false);h.interrupt();assert.equal(h.state().goal.status,'paused');assert.equal(h.state().goal.reason,'interrupted');assert.equal(h.state().goal.retry.nextAt,null);await sleep(5150);assert.equal(h.requests(),2);assert.deepEqual(h.errors,[]);
 },{captureInput:true});
});
