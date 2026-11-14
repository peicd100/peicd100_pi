// Per-native-root factory-local capability graph; no process policy singleton.
// Native loader isolates Jiti module caches. Selected facades therefore send a
// finite CONSTRUCTION enrollment, not a caller factory, Context, policy, grant,
// route, money callback, or owner capability. Only the facade's public API flows
// INTO this root; ack is boolean. Exact shared registry identity binds roots.
// All actual admission/finance/Goal capabilities remain in this factory.
import {getAgentDir} from '@earendil-works/pi-coding-agent';
import {createAssistantMessageEventStream} from '@earendil-works/pi-ai';
import {builtinProviders} from '@earendil-works/pi-ai/providers/all';
import {NativeMachineContext} from '../modules/context/src/runtime_v0.1.0.mjs';
import {registerMachineContextCommand} from '../modules/context/src/command_v0.1.0.mjs';
import {createAccountRuntime} from '../modules/usage/src/account-runtime_v0.5.0.mjs';
import {createAccountGoalPair} from '../modules/usage/src/account-goal-pair_v0.1.0.mjs';
import {ACCOUNT_REQUEST_OBSERVED} from '../modules/usage/src/account-recovery_v0.5.0.mjs';
import {createUsageExtension} from '../modules/usage/extensions/index_v0.5.0.ts';
import {createGoalExtension} from '../modules/goal/extensions/index_v0.7.0.ts';
import {installWithCompactResults,compactGoalText} from './compact-tool-result_20261112.ts';
import {accountProviderId} from '../modules/usage/src/account-registry_v0.5.0.mjs';
import {namespaceAPI} from './commands_v0.12.0.mjs';
import * as ui from './ui_v0.17.0.ts';
const CHANNEL='peicd100:runtime-coordinator:v0.17:presence';
const ENROLL='peicd100:runtime-coordinator:v0.17:install-selected-resource';
export function runtimeCoordinatorActive(raw:any){const answers=new Set();raw.events.emit(CHANNEL,{accept:(v:any)=>{if(v?.active===true&&v?.version==='0.17.0')answers.add(v);}});if(answers.size>1)throw Error('Runtime coordinator owner conflict');return answers.size===1;}
export async function joinRuntimeCoordinator(raw:any,module:string){
 if(!['goal','usage'].includes(module))throw Error('Unknown coordinator resource');
 const answers:Promise<boolean>[]=[];
 raw.events.emit(ENROLL,{module,api:raw,accept:(completion:Promise<boolean>)=>answers.push(completion)});
 if(answers.length===0)return false;
 if(answers.length!==1)throw Error('Native root enrollment conflict');
 return await answers[0]===true;
}
export async function createRuntimeCoordinator(raw:any,{installACM,...deps}:any={}){
 if(runtimeCoordinatorActive(raw))throw Error('Runtime coordinator already installed');
 const registry=ui.registryFor(raw),pair=createAccountGoalPair();
 const machine=new NativeMachineContext({api:raw,agentDir:deps.agentDir??getAgentDir(),createStream:createAssistantMessageEventStream,builtinProviders:deps.builtinProviders??builtinProviders(),...(deps.store?{store:deps.store}:{})});
 let context:any,cached:any={configured:false,target:null,activeApplied:false,nativeReason:'NATIVE_CONTEXT_NOT_READY',serviceVerification:'UNKNOWN'},stopped=false,recovery:any,dispatch:any,accounts:any,usage:any,goal:any;
 const joined=new Map<string,any>();
 const cache=(ctx:any)=>{try{cached=machine.status(ctx);}catch{cached={configured:false,target:null,activeApplied:false,nativeReason:'CONTEXT_STATE_UNKNOWN',serviceVerification:'UNKNOWN'};}};
 const restore=async(event:any,ctx:any)=>{if(stopped)return;context=ctx;const state=machine.begin(ctx,event);try{machine.install(ctx);if(!state.ownedSelection&&machine.store.read().configured&&ctx.isIdle()===true&&!ctx.hasPendingMessages())await machine.activate(ctx);}catch{/* sender stays held; no guessed metadata or fallback */}cache(ctx);};
 for(const name of ['session_start','session_tree','session_compact','model_select','thinking_level_select'])raw.on(name,restore);
 raw.on('agent_settled',async(_event:any,ctx:any)=>{if(stopped||!machine.valid(ctx))return;try{if(machine.store.read().configured)await machine.activate(ctx);}catch{}cache(ctx);});
 const common=(ctx:any,model=ctx?.model)=>{try{if(stopped||!machine.valid(ctx))return false;const lease=machine.lease(ctx,model);return lease.allowed===true&&lease.legacyUnconfigured!==true&&lease.valid()===true;}catch{return false;}};
 const targetModel=(ctx:any,route:any)=>ctx.modelRegistry.find(accountProviderId(route.accountId,route.family),route.modelId);
 const install=async(module:string,childRaw:any)=>{
  if(stopped||!['goal','usage'].includes(module))throw Error('Coordinator resource unavailable');
  if(joined.has(module)){if(joined.get(module)!==childRaw)throw Error('Duplicate selected resource');return;}
  joined.set(module,childRaw);
  if(module==='goal'){goal=installWithCompactResults(childRaw,(api:any)=>createGoalExtension(api,{...deps.goal,...pair.goalDeps}),{peicd100_goal:compactGoalText});return;} // 2026-11-12: shorter model-facing Goal text only
  accounts=await createAccountRuntime(childRaw,{...deps.accounts,agentDir:deps.agentDir??getAgentDir(),bases:Object.fromEntries(['openai','openai-codex'].map(id=>[id,machine.base(id)])),...pair.accountDeps,bindDispatch:machine.bindDispatch,onRegisterProvider:(p:any)=>machine.ownAccountProvider(p),
   requestAllowed:(ctx:any)=>common(ctx),
   dispatchGate:async(request:any)=>{if(!common(request.ctx,request.model)||typeof request.readNativeRouting!=='function')return{allowed:false};const witness=await request.readNativeRouting();if(!common(request.ctx,request.model)||witness?.state!=='ready'||witness.accountBinding!==request.account.identityBinding)return{allowed:false};return{allowed:true,accountBinding:witness.accountBinding,modelBinding:witness.modelBinding};},
   sharedContext:async(ctx:any)=>{if(!common(ctx))throw Error('Shared Context not active');return{revision:machine.store.read().state.revision};},
   recoveryAllowed:async(ctx:any,route:any)=>common(ctx,route?targetModel(ctx,route):ctx.model),
   handoffGate:async({ctx,target}:any)=>common(ctx,targetModel(ctx,target)),
   financePriority:async()=>!!context&&common(context),
   bindRecovery:(get:any,take:any)=>{recovery=get;dispatch=take;},onRequestObserved:()=>childRaw.events.emit(ACCOUNT_REQUEST_OBSERVED)});
  usage=createUsageExtension(childRaw,{...deps.usage,accounts,accountRecovery:(ctx:any,options:any)=>recovery?.(ctx,options),accountDispatch:(ctx:any)=>dispatch?.(ctx)});
 };
 // Explicitly embedding the coordinator may request both modules. The package
 // ACM resource passes [] and each actually selected Goal/Usage facade joins.
 for(const module of deps.modules??['usage','goal'])await install(module,raw);
 const command=registerMachineContextCommand(namespaceAPI(ui.withMouseMenus(raw)),{store:machine.store,readNative:(ctx:any)=>machine.snapshot(ctx),materializerFor:(ctx:any)=>machine.materializer(ctx),activateFor:(ctx:any,options:any)=>machine.activate(ctx,options),onChanged:cache});
 const acm=typeof installACM==='function'?await installACM(raw,{contextSnapshot:()=>cached,openContext:(ctx:any)=>command.open(ctx)}):undefined;
 raw.events.on(ENROLL,(request:any)=>{
  if(stopped||!['goal','usage'].includes(request?.module)||typeof request?.accept!=='function')return;
  // A string/snapshot/copied routing JSON is not a Native scoped API. No
  // callbacks/factories from this message receive the private capability graph.
  try{if(ui.registryFor(request.api)!==registry)return;}catch{return;}
  request.accept(install(request.module,request.api).then(()=>true));
 });
 const presence=Object.freeze({get active(){return !stopped;},version:'0.17.0'});
 raw.events.on(CHANNEL,(request:any)=>{if(!stopped&&typeof request?.accept==='function')request.accept(presence);});
 raw.on('session_shutdown',()=>{if(stopped)return;stopped=true;pair.dispose();machine.dispose();accounts?.dispose();command.dispose();context=undefined;});
 return Object.freeze({machine,pair,command,acm,get accounts(){return accounts;},get usage(){return usage;},get goal(){return goal;}});
}
