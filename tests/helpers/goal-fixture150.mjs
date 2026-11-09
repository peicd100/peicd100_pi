// Real AgentSession + extension loader, disposable storage, ONLY in-memory wire.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {fromHost,ai} from '../runtime.mjs';
const core=await fromHost('dist/index.js'),{loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const entry='peicd100:goal-state';
export const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function until(predicate,ms=18000){const started=Date.now();while(Date.now()-started<ms){if(predicate())return;await sleep(10);}throw new Error('Goal retry fixture deadline exceeded');}
export const tool=(name,args,id='fixture')=>({content:[{type:'toolCall',id,name,arguments:args}]});
export const create=()=>tool('peicd100_goal',{action:'create',objective:'Disposable transport recovery fixture',criteria:['actual assertions pass']},'create-once');
export const complete=state=>tool('peicd100_goal',{action:'complete',id:state.goal.id,revision:state.goal.revision,verification:['fixture actual assertions passed']},'complete-once');
export async function withGoal(respond,run,{retry={enabled:true,maxRetries:3,baseDelayMs:5,maxDelayMs:10},select}={}){
 const root=await mkdtemp(join(tmpdir(),'peicd100 retry150 ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;
 let session,unsubscribe;const errors=[],events=[],requests=[];let selections=0;
 try{
  const extension=fileURLToPath(new URL('../../modules/goal/extensions/index_v0.2.0.ts',import.meta.url));
  const extensions=await loadExtensions([extension],root);assert.deepEqual(extensions.errors,[]);
  const runtime=await core.ModelRuntime.create({credentials:new ai.InMemoryCredentialStore(),modelsPath:null,refreshOnCreate:false,allowModelNetwork:false});
  runtime.hasConfiguredAuth=()=>true;runtime.checkAuth=async()=>true;runtime.getAuth=async()=>({auth:{apiKey:'fixture-only'},source:'FIXTURE'});runtime.streamSimple=()=>{throw new Error('Nested or real model wire forbidden');};
  const manager=core.SessionManager.create(root,join(root,'sessions'));
  const state=()=>manager.getBranch().findLast(e=>e.type==='custom'&&e.customType===entry)?.data;
  const loader={getExtensions:()=>extensions,getSkills:()=>({skills:[],diagnostics:[]}),getPrompts:()=>({prompts:[],diagnostics:[]}),getThemes:()=>({themes:[],diagnostics:[]}),getAgentsFiles:()=>({agentsFiles:[]}),getSystemPrompt:()=> 'In-memory fixture only',getSystemPromptSource:()=>undefined,getAppendSystemPrompt:()=>[],getAppendSystemPromptSources:()=>[],extendResources:()=>{},reload:async()=>{}};
  const model=runtime.getModel('openai','gpt-4o');assert(model,'Offline fixture catalog requires gpt-4o');
  ({session}=await core.createAgentSession({cwd:root,agentDir:root,modelRuntime:runtime,model,thinkingLevel:'off',settingsManager:core.SettingsManager.inMemory({retry,compaction:{enabled:false}}),sessionManager:manager,resourceLoader:loader}));
  session.agent.streamFunction=(m,_context,options)=>{
   requests.push({at:Date.now(),goal:structuredClone(state()?.goal)});assert(requests.length<24,'Test-only runaway guard; production has no cap');
   const stream=ai.createAssistantMessageEventStream();queueMicrotask(()=>{
    try{
     const spec=respond({request:requests.length,state:state(),manager,session});
     const usage={input:8,output:2,cacheRead:0,cacheWrite:0,totalTokens:10,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}};
     const message={role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:spec.content??[],stopReason:spec.error?'error':spec.content?.some(x=>x.type==='toolCall')?'toolUse':'stop',usage,...(spec.error?{errorMessage:spec.error}:{})};
     if(spec.hold){const abort=()=>{stream.push({type:'error',reason:'aborted',error:{...message,stopReason:'aborted',errorMessage:'Fixture manual interruption'}});stream.end();};if(options?.signal?.aborted)abort();else options?.signal?.addEventListener('abort',abort,{once:true});return;}
     stream.push(spec.error?{type:'error',reason:'error',error:message}:{type:'done',reason:message.stopReason,message});stream.end();
    }catch(error){errors.push(error);stream.push({type:'error',reason:'error',error:{role:'assistant',api:m.api,provider:m.provider,model:m.id,timestamp:Date.now(),content:[],stopReason:'error',errorMessage:error.message,usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}}});stream.end();}
   });return stream;
  };
  unsubscribe=session.subscribe(event=>{if(event.type==='auto_retry_start'||event.type==='auto_retry_end'||event.type==='agent_settled')events.push({type:event.type,at:Date.now(),success:event.success,attempt:event.attempt});});
  await session.bindExtensions({mode:'tui',onError:e=>errors.push(e),uiContext:{notify(){},confirm:async()=>true,select:async(...args)=>select?.({args,index:selections++}),custom:async()=>undefined,setStatus(){},setWidget(){}},commandContextActions:{waitForIdle:()=>session.waitForIdle()}});
  return await run({session,manager,state,errors,events,requests});
 }finally{unsubscribe?.();session?.dispose();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
}
