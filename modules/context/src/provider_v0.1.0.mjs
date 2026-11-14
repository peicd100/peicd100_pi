// Owned public Provider adapters only: no host/private/prototype changes.
// A catalog/lease is LOCAL capacity evidence, never a service/tokenizer attestation.
// The final onPayload callback is guarded AFTER the original callback returns.
import { createHash } from 'node:crypto';
import { assessMachineContext } from './state_v0.1.0.mjs';
import { estimateMessageTokens, estimateTextTokens } from '@earendil-works/pi-ai/utils/estimate';
import { clampMaxTokensToContext } from '@earendil-works/pi-ai/api/simple-options';
const outputKeys=['max_tokens','max_output_tokens','max_completion_tokens'];
const bodyStamp = body => hash(Object.fromEntries(Object.entries(body).filter(([k])=>!outputKeys.includes(k))));
function localProjection(method,model,context,options){
  if(!Array.isArray(context?.messages))throw error();
  // Re-estimate the ACTUAL projected messages, not a prior assistant usage
  // count from before ACM masked/moved a prefix. This is not server attestation.
  const input=context.messages.reduce((n,m)=>n+estimateMessageTokens(m),0)+(context.systemPrompt?estimateTextTokens(context.systemPrompt):0)+(context.tools?.length?estimateTextTokens(JSON.stringify(context.tools)):0);
  const requested=options.maxTokens??model.maxTokens;
  if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(requested)||requested<1)throw error();
  const output=method==='streamSimple'?clampMaxTokensToContext(model,context,requested):requested;
  if(!Number.isSafeInteger(output)||output<1)throw error();
  if(input+output>model.contextWindow)throw error(`這次請求估算輸入 ${input} 加輸出 ${output} Token，超過目前模型視窗 ${model.contextWindow}。`);
  return Object.freeze({input,output,source:'public-native-estimator-local-only',serviceVerification:'UNKNOWN'});
}
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const identity = m => [m?.provider,m?.id,m?.api,m?.baseUrl,m?.contextWindow,m?.maxTokens];
const same = (a,b) => JSON.stringify(identity(a)) === JSON.stringify(identity(b));
const managedFamily = id => /^peicd100-account-[a-f0-9-]{36}-(openai|openai-codex)$/.exec(id)?.[1];
const error = detail => Object.assign(Error('本機共用 Context 未套用、原生上限未知或請求範圍已變；送出前阻擋，不補送。'+(detail?'原因：'+detail:'')), {code:'PEICD_CONTEXT_POLICY',detail});
// Plain-language cause for the operator; never includes prompt or config content.
const why = reason => ({CONTEXT_WRITER_UNCONFIRMED:'共用 Context 設定正在寫入，或上次寫入的鎖沒有解除。',MACHINE_TARGET_UNSET:'共用 Context 還沒有設定目標。',NATIVE_CAPABILITY_UNKNOWN_OR_DIFFERENT:'找不到這個模型的原始宣告，或它和目前選的模型不是同一個。',NATIVE_ACTIVE_WINDOW_NOT_APPLIED:'目前模型的視窗大小還沒套用成共用設定值（閒置時會自動套用；也可開 /context 選「套用」）。'})[reason];
export const OWNED = Symbol.for('peicd100.context.ownedProviderWrapper');
const zero = () => ({input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}});
export class ContextProviderOwner {
  #store; #stream; #readScope; #readRequestGuard; #closed=false; #providers=new Map(); #last;
  constructor({store,createStream,readScope,readRequestGuard=()=>undefined}) {
    if(!store?.read || typeof createStream!=='function' || typeof readScope!=='function') throw error();
    this.#store=store;this.#stream=createStream;this.#readScope=readScope;this.#readRequestGuard=readRequestGuard;
  }
  native(model,physicalProvider=model?.provider) {
    const p=this.#providers.get(physicalProvider);
    const native=p?.nativeModels().find(m=>m.provider===physicalProvider&&m.id===model?.id);
    if(!native) throw error();
    return structuredClone(native);
  }
  assessment(model,physicalProvider=model?.provider) {
    try { if(!this.supports(physicalProvider))throw error();return assessMachineContext(this.#store.read(),{model,native:this.native(model,physicalProvider),physicalProvider}); }
    catch { return Object.freeze({allowed:false,reason:'NATIVE_CAPABILITY_UNKNOWN',serviceVerification:'UNKNOWN'}); }
  }
  // Admission proof is not exported as a generic tool/event or financial permit.
  lease(model,physicalProvider=model?.provider) {
    const before=this.#store.read(),scope=this.#readScope(),stamp=hash(scope),providerRecord=this.#providers.get(physicalProvider);
    if(before.writePending)throw error(why('CONTEXT_WRITER_UNCONFIRMED'));
    if(this.#closed||!scope||typeof scope.key!=='string'||!scope.key)throw error();
    const native=this.native(model,physicalProvider),decision=assessMachineContext(before,{model,native,physicalProvider});
    const legacy=!before.configured&&model.provider===physicalProvider;
    if(!legacy&&providerRecord?.payloadContract!==true)throw error('這個 provider 不是工具箱認得的原生實作，設定共用 Context 後不放行。');
    if(!legacy&&!decision.allowed)throw error(why(decision.reason));
    if(!legacy&&(!Number.isSafeInteger(model.maxTokens)||model.maxTokens<1||model.maxTokens>native.maxTokens))throw error('目前模型的最大輸出 Token 超過原始宣告。');
    const selected=identity(model),capacity=identity(native);
    return Object.freeze({allowed:decision.allowed,legacyUnconfigured:legacy,revision:before.state.revision,
      target:before.state.target,serviceVerification:'UNKNOWN',valid:()=>{
        try {const now=this.#store.read();return !this.#closed&&this.#providers.get(physicalProvider)===providerRecord&&!now.writePending&&now.fingerprint===before.fingerprint&&hash(this.#readScope())===stamp&&JSON.stringify(identity(model))===JSON.stringify(selected)&&JSON.stringify(identity(this.native(model,physicalProvider)))===JSON.stringify(capacity)&&(legacy&&!now.configured||assessMachineContext(now,{model,native:this.native(model,physicalProvider),physicalProvider}).allowed===true);}
        catch{return false;}
      }});
  }
  wrap(base,{payloadContract=false,nativeModels=()=>base.getModels(),replaceOwned=false}={}) {
    if(this.#closed||!base||typeof base.id!=='string'||typeof base.getModels!=='function')throw error();
    const cached=this.#providers.get(base.id);
    if(cached?.base===base)return cached.wrapper;
    if(cached&&replaceOwned!==true)throw error();
    const owner=this;
    function adapt(m,record,originals){
      // Do not give image/classifier models a fabricated chat window.
      if(m.type&&m.type!=='chat')return m;
      const original=originals.find(n=>n.provider===base.id&&n.id===m.id&&n.api===m.api&&n.baseUrl===m.baseUrl);
      if(!record.configured||!original||!Number.isSafeInteger(original.contextWindow))return {...m};
      // Saved target is the operator's window, even above the original declaration.
      return {...m,contextWindow:record.state.target};
    }
    function guarded(method,model,context,options={}){
      const outer=owner.#stream();let last,terminal=false,started=false;
      queueMicrotask(async()=>{
        try {
          if(owner.#providers.get(base.id)?.base!==base||options.signal?.aborted||model?.provider!==base.id&&managedFamily(model?.provider)!==base.id)throw error();
          const ticket=owner.lease(model,base.id),managed=!!managedFamily(model.provider),requestGuard=owner.#readRequestGuard(options);
          if(managed&&(typeof requestGuard!=='function'||requestGuard()!==true))throw error();
          // Unknown provider implementations must not be called and only later
          // discovered to lack the before-network callback. Legacy is unchanged.
          if(!ticket.legacyUnconfigured&&payloadContract!==true)throw error();
          const projection=ticket.legacyUnconfigured?null:localProjection(method,model,context,options);
          const requestHash=hash(context),optionsModel=options.model;
          if(optionsModel!==undefined&&!same(optionsModel,model))throw error();
          const valid=()=>owner.#providers.get(base.id)?.base===base&&ticket.valid()&&(!managed||requestGuard()===true)&&hash(context)===requestHash&&!options.signal?.aborted;
          if(!valid())throw error();
          const original=options.onPayload;
          const requestOptions=ticket.legacyUnconfigured?options:{...options,onPayload:async(payload,payloadModel)=>{
            if(!valid())throw error();
            const beforeBody=bodyStamp(payload);
            const changed=original?await original(payload,payloadModel):undefined;
            const actual=changed===undefined?payload:changed;
            if(managed&&await requestGuard.fresh()!==true)throw error();
            if(!valid()||!same(payloadModel,model)||!actual||typeof actual!=='object'||Array.isArray(actual))throw error();
            // Do not allow a late hook to retarget a request behind the native
            // model/capacity check. Unknown normalization fails closed.
            if(actual.model!==undefined&&actual.model!==model.id||bodyStamp(actual)!==beforeBody)throw error();
            for(const key of outputKeys){
              if(actual[key]!==undefined&&(!Number.isSafeInteger(actual[key])||actual[key]<1||actual[key]>model.maxTokens||projection.input+actual[key]>model.contextWindow))throw error();
            }
            if(!valid())throw error();
            owner.#last=Object.freeze({source:'owned-native-onPayload-local-context',revision:ticket.revision,target:ticket.target,legacyUnconfigured:ticket.legacyUnconfigured,projection,serviceVerification:'UNKNOWN'});
            return actual;
          }};
          if(typeof base[method]!=='function'||!valid())throw error();
          started=true;
          const inner=base[method](model,context,requestOptions);
          for await(const event of inner){last=event.partial??event.message??event.error??last;if(event.type==='done'||event.type==='error')terminal=true;outer.push(event);}
          if(!terminal)throw error();
        }catch(caught){
          if(!terminal){const result={...(last??{}),role:'assistant',api:model?.api,provider:model?.provider,model:model?.id,timestamp:last?.timestamp??Date.now(),content:last?.content??[],usage:last?.usage??zero(),stopReason:options?.signal?.aborted?'aborted':'error',errorMessage:started?'本機 Context 或原生請求未取得可驗終態；保留已觀察內容，不自動重送。':'本機共用 Context 未套用、原生上限未知或範圍已變；未送出模型請求。'+(caught?.code==='PEICD_CONTEXT_POLICY'&&typeof caught.detail==='string'?'原因：'+caught.detail:'')};outer.push({type:'error',reason:result.stopReason,error:result});}
        }finally{outer.end();}
      });
      return outer;
    }
    const catalog=all=>{const record=owner.#store.read(),originals=nativeModels();return (all?base.getAllModels():base.getModels()).map(m=>adapt(m,record,originals));};
    const wrapper={...base,getModels:()=>catalog(false)};
    for(const key of Object.keys(wrapper))if(typeof wrapper[key]==='function'&&key!=='getModels')wrapper[key]=base[key].bind(base);
    if(base.getAllModels)wrapper.getAllModels=()=>catalog(true);
    for(const method of ['stream','streamSimple'])if(typeof base[method]==='function')wrapper[method]=(...args)=>guarded(method,...args);
    // Pi /reload keeps extension-registered providers but loads a new toolbox
    // instance. Mark our wrapper (global symbol survives module reload) so the
    // next instance can unwrap it instead of treating it as a foreign provider.
    Object.defineProperty(wrapper,OWNED,{value:Object.freeze({base,payloadContract})});
    this.#providers.set(base.id,{base,wrapper,payloadContract,nativeModels});
    return wrapper;
  }
  supports(provider){return this.#providers.get(provider)?.payloadContract===true;}
  has(provider){return this.#providers.has(provider);}
  wrapped(provider){return this.#providers.get(provider)?.wrapper;}
  status(){return Object.freeze({providers:this.#providers.size,lastPayloadReceipt:this.#last??null,serviceVerification:'UNKNOWN'});}
  dispose(){this.#closed=true;this.#last=undefined;}
}
