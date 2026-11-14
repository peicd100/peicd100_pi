// One typed future-default timeline. Never overwrite the legacy private file,
// never use a future default for an older session, never perform render-time IO.
import {randomUUID,createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {PrivatePreference} from './preferences_v0.17.0.mjs';
import {CONTROL_MODULES,validateControlValue} from './control-registry_v0.17.0.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const revision=value=>typeof value==='string'&&/^(?:implicit|absent|[a-f0-9-]{1,128})$/u.test(value);
export function controlFields(definitions){
 if(!definitions||typeof definitions!=='object'||Array.isArray(definitions)||!Object.keys(definitions).length||Object.keys(definitions).length>32)throw Error('Unknown preference fields');
 const result={};for(const [name,def]of Object.entries(definitions)){
  if(!/^[a-z][a-zA-Z0-9]*$/u.test(name)||!def||!['boolean','integer','number','enum'].includes(def.kind)||Object.keys(def).some(key=>!['kind','min','max','options'].includes(key)))throw Error('Unknown field definition');
  if(!exact(def,def.kind==='boolean'?['kind']:['integer','number'].includes(def.kind)?['kind','min','max']:['kind','options']))throw Error('Irrelevant field options');
  if(def.kind==='integer'&&(!Number.isSafeInteger(def.min)||!Number.isSafeInteger(def.max)||def.min>def.max))throw Error('Unbounded preference integer');
  if(def.kind==='number'&&(!Number.isFinite(def.min)||!Number.isFinite(def.max)||def.min>def.max))throw Error('Unbounded preference number');
  if(def.kind==='enum'&&(!Array.isArray(def.options)||!def.options.length||def.options.length>100||def.options.some(x=>typeof x!=='string'||x.length>80)))throw Error('Unknown preference options');
  result[name]=Object.freeze({...def,...(def.options?{options:Object.freeze([...def.options])}:{})});
 }return Object.freeze(result);
}
export function controlValues(fields,input,check=()=>true){if(!exact(input,Object.keys(fields)))throw Error('Unknown/incomplete preference values');const result={};for(const [name,def]of Object.entries(fields))result[name]=validateControlValue(def,input[name]);Object.freeze(result);const semantic=check(result);if(semantic instanceof Promise)void semantic.catch(()=>{});if(semantic!==true)throw Error('Preference semantics unverified; no silent coercion');return result;}
export class ControlDefaults{
 constructor(root,{module,fields,legacy,verifyLegacy,check=()=>true,clock=Date.now,maxBytes=262144}){
  if(!CONTROL_MODULES.includes(module)||typeof verifyLegacy!=='function'||typeof clock!=='function'||typeof check!=='function')throw Error('Unknown default owner or import witness');this.module=module;this.fields=controlFields(fields);this.clock=clock;this.verifyLegacy=verifyLegacy;this.check=check;
  if(!exact(legacy,['revision','values'])||!revision(legacy.revision))throw Error('Unknown legacy import snapshot');this.legacy=Object.freeze({revision:legacy.revision,values:controlValues(this.fields,legacy.values,this.check)});
  const validate=value=>{
   if(!exact(value,['schema','module','revision','legacy','history'])||value.schema!==1||value.module!==module||!revision(value.revision)||!exact(value.legacy,['revision','values'])||!revision(value.legacy.revision)||!Array.isArray(value.history)||value.history.length>4096)throw Error('Unverified default timeline');
   const baseline=Object.freeze({revision:value.legacy.revision,values:controlValues(this.fields,value.legacy.values,this.check)});let prior=0;const ids=new Set([baseline.revision]);const history=value.history.map((item,index)=>{if(!exact(item,['revision','preparedAt','effectiveAt','values'])||!revision(item.revision)||ids.has(item.revision)||!Number.isSafeInteger(item.preparedAt)||item.preparedAt<=prior||item.effectiveAt!==null&&(!Number.isSafeInteger(item.effectiveAt)||item.effectiveAt<item.preparedAt)||item.effectiveAt===null&&index!==value.history.length-1)throw Error('Ambiguous default chronology');prior=item.effectiveAt??item.preparedAt;ids.add(item.revision);return Object.freeze({revision:item.revision,preparedAt:item.preparedAt,effectiveAt:item.effectiveAt,values:controlValues(this.fields,item.values,this.check)});});if(value.revision==='implicit'&&history.length)throw Error('Unverified persisted default revision');
   return Object.freeze({schema:1,module,revision:value.revision,legacy:baseline,history:Object.freeze(history)});
  };
  this.store=new PrivatePreference(root,{maxBytes,defaults:()=>({schema:1,module,revision:'implicit',legacy:this.legacy,history:[]}),validate,patchFields:['history']});
 }
 read(){return this.store.read();}
 pending(state){if(state?.module!==this.module)throw Error('Default owner mismatch');const last=state.history.at(-1);return last?.effectiveAt===null?last:null;}
 current(state){if(state?.module!==this.module)throw Error('Default owner mismatch');if(this.pending(state))throw Error('Default cutover unconfirmed; do not retry');return state.history.at(-1)?.values??state.legacy.values;}
 etag(state){if(state?.module!==this.module)throw Error('Default owner mismatch');return createHash('sha256').update(JSON.stringify(state)).digest('hex');}
 async update(patch,expectedRevision,valid=()=>true){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!Object.hasOwn(this.fields,key)))throw Error('Unknown default patch');
  const before=await this.read();if(this.etag(before)!==expectedRevision||valid()!==true)throw Error('Default revision/scope changed');const values=controlValues(this.fields,{...this.current(before),...patch},this.check);if(isDeepStrictEqual(values,this.current(before)))return before;
  const preparedAt=this.clock(),last=before.history.at(-1)?.effectiveAt??0;if(!Number.isSafeInteger(preparedAt)||preparedAt<=last)throw Error('Clock rollback or imprecise default boundary');
  if(before.revision==='implicit'&&await this.verifyLegacy()!==before.legacy.revision)throw Error('Legacy import changed; no timeline written');if(valid()!==true)throw Error('Default scope changed before write');
  const next={revision:randomUUID(),preparedAt,effectiveAt:null,values},staged=await this.store.write({history:[...before.history,next]},before.revision,()=>valid()===true,before);
  // A post-rename witness closes the time interval. Failure leaves a typed hold,
  // never guesses a cutover or retries the original value update.
  return this.confirmPending(this.etag(staged),valid);
 }
 async confirmPending(expectedRevision,valid){
  const before=await this.read();if(typeof valid!=='function'||valid()!==true||this.etag(before)!==expectedRevision)throw Error('Pending default confirmation scope/revision changed');const pending=this.pending(before);if(!pending)throw Error('No unconfirmed default cutover');
  const effectiveAt=this.clock();if(!Number.isSafeInteger(effectiveAt)||effectiveAt<pending.preparedAt)throw Error('Clock rollback; default cutover unconfirmed');
  return this.store.write({history:[...before.history.slice(0,-1),{...pending,effectiveAt}]},before.revision,()=>valid()===true,before);
 }
 forSession(state,ctx){
  let start;try{const header=ctx.sessionManager.getHeader();if(state?.module!==this.module||header?.id!==ctx.sessionManager.getSessionId()||typeof header.timestamp!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(header.timestamp))throw Error('Unknown session');start=Date.parse(header.timestamp);if(new Date(start).toISOString()!==header.timestamp)throw Error('Unverified session timestamp');}catch{return{status:'unknown',reason:'session-start-unavailable'};}
  const now=this.clock();if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(now)||now<0||start>now||(state.history.at(-1)?.effectiveAt??state.history.at(-1)?.preparedAt??0)>now)return{status:'unknown',reason:'session-clock-unverified'};
  if(state.history.some(item=>start>=item.preparedAt&&(item.effectiveAt===null||start<=item.effectiveAt)))return{status:'unknown',reason:'unverified-default-cutover-window'};
  const chosen=state.history.findLast(item=>item.effectiveAt!==null&&item.effectiveAt<start);return Object.freeze({status:'ready',source:chosen?'timeline':'legacy-baseline',sourceRevision:chosen?.revision??state.legacy.revision,defaultStoreRevision:this.etag(state),values:chosen?.values??state.legacy.values});
 }
}
