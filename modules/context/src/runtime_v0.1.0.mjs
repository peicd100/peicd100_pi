// Native lifecycle coordinator. Production entry owns this object privately.
// Same-provider/same-model activation only; no OAuth, request, compaction or reload.
import {AsyncLocalStorage} from 'node:async_hooks';
import {createHash} from 'node:crypto';
import {MachineContextStore,effectiveMachineContext} from './state_v0.1.0.mjs';
import {NativeContextMaterializer} from './native_v0.1.0.mjs';
import {ContextProviderOwner,OWNED} from './provider_v0.1.0.mjs';
import {createOwnedRequestAdmissionChannel} from './request-admission_v0.1.0.mjs';
const managed=id=>/^peicd100-account-[a-f0-9-]{36}-(openai|openai-codex)$/.exec(id)?.[1];
const modelKey=m=>JSON.stringify([m?.provider,m?.id,m?.api,m?.baseUrl,m?.contextWindow,m?.maxTokens]);
const logical=m=>JSON.stringify([m?.provider,m?.id]);
const session=ctx=>JSON.stringify([ctx?.cwd,ctx?.sessionManager?.getSessionId(),ctx?.sessionManager?.getSessionFile?.()??null]);
const fail=()=>{throw Error('本機共用 Context 範圍或原生套用無法核實；不會重送、換帳號或重載。');};
export class NativeMachineContext {
  #api;#ctx;#epoch=0;#closed=false;#pending;#selection=new AsyncLocalStorage();#origins;#registered=new Set();#ownedAccounts=new Map();#materializer;
  constructor({api,agentDir,store=new MachineContextStore(agentDir),createStream,builtinProviders}) {
    if(!api?.registerProvider||!api?.setModel||!Array.isArray(builtinProviders))fail();
    this.#api=api;this.store=store;this.#origins=new Map(builtinProviders.map(p=>[p.id,p]));
    const channel=createOwnedRequestAdmissionChannel();
    this.bindDispatch=(options,ticket)=>channel.bind(options,ticket);
    const guard={store,createStream,readScope:()=>this.#scope(),readRequestGuard:options=>channel.read(options)};
    this.providers=new ContextProviderOwner(guard);
    this.ordinaryProviders=new ContextProviderOwner(guard);
  }
  #scope(){return !this.#closed&&this.#ctx?{key:session(this.#ctx),epoch:this.#epoch,model:modelKey(this.#ctx.model),thinking:this.#api.getThinkingLevel?.()??null}:null;}
  valid(ctx){return !this.#closed&&!!this.#ctx&&session(ctx)===session(this.#ctx);}
  begin(ctx,event){
    if(this.#closed)fail();
    const own=this.#selection.getStore();
    const exact=!!own&&event?.source==='set'&&logical(event.model)===own.logical&&modelKey(event.model)===own.expected&&session(ctx)===own.session;
    this.#ctx=ctx;
    if(!exact){this.#epoch++;this.#materializer?.dispose();this.#materializer=undefined;}
    return {epoch:this.#epoch,ownedSelection:exact};
  }
  base(family){
    const base=this.#origins.get(family);if(!base)fail();
    if(this.providers.has(family))return this.providers.wrapped(family);
    return this.providers.wrap(base,{payloadContract:true,nativeModels:()=>base.getModels()});
  }
  ownAccountProvider(provider){if(this.#closed||!managed(provider?.id))fail();this.#ownedAccounts.set(provider.id,provider);}
  #accountOwned(model){try{return !!managed(model?.provider)&&this.#ownedAccounts.has(model.provider)&&this.#ownedAccounts.get(model.provider)===this.#ctx?.modelRegistry.getRegisteredNativeProvider?.(model.provider);}catch{return false;}}
  install(ctx){
    if(!this.valid(ctx))fail();
    const ids=new Set(ctx.modelRegistry.getAll().map(m=>m.provider));
    for(const id of ids){
      if(this.#accountOwned({provider:id}))continue;
      const registered=ctx.modelRegistry.getRegisteredNativeProvider?.(id);
      if(this.#registered.has(id)&&registered===this.ordinaryProviders.wrapped(id))continue;
      // A wrapper left by an earlier toolbox instance (Pi /reload) is unwrapped
      // to its captured provider and keeps that provider's original verdict.
      const stale=registered?.[OWNED];
      const effective=stale?stale.base:ctx.modelRegistry.getProvider(id);if(!effective)continue;
      const origin=this.#origins.get(id),knownImplementation=stale?stale.payloadContract===true:!!origin&&(!registered||registered===origin);
      // Keep the captured public provider/auth/catalog unchanged. A foreign
      // implementation is transparent while unset, but configured requests are
      // held BEFORE its method: do not infer onPayload compliance from its id.
      const wrapper=this.ordinaryProviders.wrap(effective,{payloadContract:knownImplementation,nativeModels:()=>origin?.getModels()??effective.getModels(),replaceOwned:true});
      this.#api.registerProvider(wrapper);this.#registered.add(id);
    }
  }
  snapshot(ctx,model=ctx.model){
    if(!this.valid(ctx)||!model)fail();
    const owned=this.#accountOwned(model),physicalProvider=owned?managed(model.provider):model.provider,owner=owned?this.providers:this.ordinaryProviders;
    if(!owner.supports(physicalProvider))fail();
    return {model,native:owner.native(model,physicalProvider),physicalProvider,scopeKey:createHash('sha256').update(JSON.stringify(this.#scope())).digest('hex')};
  }
  lease(ctx,model=ctx.model){
    if(!this.valid(ctx))fail();
    const owned=this.#accountOwned(model);return (owned?this.providers:this.ordinaryProviders).lease(model,owned?managed(model?.provider):model?.provider);
  }
  materializer(ctx){
    if(!this.valid(ctx))fail();
    if(this.#materializer)return this.#materializer;
    const epoch=this.#epoch,stamp=session(ctx);
    return this.#materializer=new NativeContextMaterializer({store:this.store,readNative:()=>this.snapshot(ctx),valid:()=>this.valid(ctx)&&this.#epoch===epoch&&session(ctx)===stamp,registry:ctx.modelRegistry});
  }
  // An explicitly saved global target authorizes applying its SAME bounded
  // value at safe boundaries, not selecting an account/model or inventing one.
  async activate(ctx,{valid=()=>true,preview:approvedPreview}={}){
    if(!this.valid(ctx)||!valid()||ctx.isIdle?.()!==true||ctx.hasPendingMessages?.()!==false)return {activeApplied:false,reason:'NOT_IDLE_OR_SCOPE_CHANGED'};
    const record=this.store.read();if(!record.configured)return {activeApplied:false,reason:'MACHINE_TARGET_UNSET'};
    try{const lease=this.lease(ctx);if(lease.valid())return {activeApplied:true,reason:'ALREADY_NATIVE_BOUND_MATCH',revision:record.state.revision};}catch{}
    if(this.#pending)return this.#pending;
    const epoch=this.#epoch,logicalKey=logical(ctx.model),stamp=session(ctx),before=modelKey(ctx.model);
    const own=()=>this.valid(ctx)&&valid()&&this.#epoch===epoch&&session(ctx)===stamp&&logical(ctx.model)===logicalKey&&modelKey(ctx.model)===before&&ctx.isIdle?.()===true&&!ctx.hasPendingMessages();
    this.#pending=(async()=>{
      if(!own())fail();
      const owner=this.materializer(ctx),preview=approvedPreview??owner.preview(),result=await owner.apply(preview,{userAction:true,valid:own});
      if(!result.registryVerified||!own())return {...result,activeApplied:false};
      const fresh=ctx.modelRegistry.find(ctx.model.provider,ctx.model.id);
      if(!fresh||logical(fresh)!==logicalKey||fresh.contextWindow!==effectiveMachineContext(record,this.snapshot(ctx).native))fail();
      const token=Object.freeze({session:stamp,logical:logicalKey,expected:modelKey(fresh)});
      const applied=await this.#selection.run(token,()=>this.#api.setModel(fresh));
      if(applied!==true||!this.valid(ctx)||this.#epoch!==epoch||logical(ctx.model)!==logicalKey||modelKey(ctx.model)!==modelKey(fresh)||this.store.read().fingerprint!==record.fingerprint)return {...result,activeApplied:false};
      const lease=this.lease(ctx);
      return {...result,activeApplied:lease.valid(),revision:record.state.revision,reason:lease.valid()?'NATIVE_ACTIVE_BOUND_MATCH':'NATIVE_ACTIVE_NOT_VERIFIED',serviceVerification:'UNKNOWN'};
    })().catch(()=>({activeApplied:false,reason:'NATIVE_APPLY_OR_SCOPE_UNVERIFIED',serviceVerification:'UNKNOWN'})).finally(()=>{this.#pending=undefined;});
    return this.#pending;
  }
  status(ctx){
    const record=this.store.read();let decision={allowed:false,reason:'NATIVE_CONTEXT_NOT_READY'};
    try{const owned=this.#accountOwned(ctx.model);decision=(owned?this.providers:this.ordinaryProviders).assessment(ctx.model,owned?managed(ctx.model.provider):ctx.model.provider);}catch{}
    return Object.freeze({version:'0.1.0',target:record.state.target,revision:record.state.revision,configured:record.configured,activeApplied:this.valid(ctx)&&decision.allowed===true,nativeReason:decision.reason,serviceVerification:'UNKNOWN',scope:'same Pi agentDir + OS user; all accounts/models; original native catalog only',provider:this.providers.status(),ordinaryProvider:this.ordinaryProviders.status()});
  }
  dispose(){if(this.#closed)return;this.#closed=true;this.#epoch++;this.#materializer?.dispose();this.providers.dispose();this.ordinaryProviders.dispose();this.#ownedAccounts.clear();this.#ctx=undefined;}
}
