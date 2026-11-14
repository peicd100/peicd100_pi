// Public append-only UI preferences. No model messages, transcript rewriting,
// session-file IO, auth or execution-state duplication. Existing Goal/ACM state
// must keep its original owner instead of adopting this generic UI policy.
import {randomUUID,createHash} from 'node:crypto';import {isDeepStrictEqual} from 'node:util';
import {controlFields,controlValues} from './control-defaults_v0.17.0.mjs';import {CONTROL_MODULES} from './control-registry_v0.17.0.mjs';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value);
export class ControlSessionPolicy{
 constructor(api,{module,fields,check=()=>true}){if(!CONTROL_MODULES.includes(module)||!['focus','theme','activity'].includes(module)||typeof api?.appendEntry!=='function'||typeof check!=='function')throw Error('Unknown UI policy owner');this.api=api;this.module=module;this.check=check;this.fields=controlFields(fields);this.entryType='peicd100:controls:session-'+module+':v1';}
 validate(value){
  if(!exact(value,['schema','module','sessionId','revision','origin','values','defaultSnapshot'])||value.schema!==1||value.module!==this.module||typeof value.sessionId!=='string'||!value.sessionId||value.sessionId.length>256||!uuid(value.revision)||!['default','explicit'].includes(value.origin))throw Error('Unverified UI session policy');
  const b=value.defaultSnapshot;if(!exact(b,['source','sourceRevision','values'])||!['legacy-baseline','timeline','manual-baseline'].includes(b.source)||typeof b.sourceRevision!=='string'||!/^(?:implicit|absent|[a-f0-9-]{1,128})$/u.test(b.sourceRevision))throw Error('Unverified UI policy baseline');
  if(b.source==='manual-baseline'&&(value.origin!=='explicit'||!uuid(b.sourceRevision)))throw Error('Unconfirmed manual UI baseline');
  return Object.freeze({...value,values:controlValues(this.fields,value.values,this.check),defaultSnapshot:Object.freeze({...b,values:controlValues(this.fields,b.values,this.check)})});
 }
 policies(entries,sessionId,allBranches=false){const result=[];for(const entry of entries){if(entry.type!=='custom'||entry.customType!==this.entryType)continue;const value=this.validate(entry.data);if(value.sessionId===sessionId)result.push(value);}const comparable=allBranches?result.filter(value=>value.defaultSnapshot.source!=='manual-baseline'):result;if(comparable.some(value=>!isDeepStrictEqual(value.defaultSnapshot,comparable[0].defaultSnapshot)))throw Error('Conflicting UI default baselines');return result;}
 read(ctx){return this.policies(ctx.sessionManager.getBranch(),ctx.sessionManager.getSessionId()).at(-1)??null;}
 append(ctx,next,valid){
  if(typeof valid!=='function'||valid()!==true)throw Error('UI policy scope unavailable');const expected=this.validate(next);if(expected.sessionId!==ctx.sessionManager.getSessionId())throw Error('UI policy session changed');
  this.api.appendEntry(this.entryType,expected);const actual=this.read(ctx);if(!isDeepStrictEqual(actual,expected))throw Error('UI policy append receipt unverified; do not retry');return actual;
 }
 ensure(ctx,defaultView,valid){
  const existing=this.read(ctx);if(existing)return existing;
  // Baseline is session-wide, but explicit current values remain branch-local.
  // A branch before the first snapshot must not borrow a newer global default.
  const known=this.policies(ctx.sessionManager.getEntries(),ctx.sessionManager.getSessionId(),true).find(value=>value.defaultSnapshot.source!=='manual-baseline');let baseline=known?.defaultSnapshot;
  if(!baseline){if(defaultView?.status!=='ready')throw Error('UI default unknown; retain native presentation');baseline={source:defaultView.source,sourceRevision:defaultView.sourceRevision,values:controlValues(this.fields,defaultView.values,this.check)};}
  const next={schema:1,module:this.module,sessionId:ctx.sessionManager.getSessionId(),revision:randomUUID(),origin:'default',values:baseline.values,defaultSnapshot:baseline};return this.append(ctx,next,valid);
 }
 manualWitness(ctx){
  if(this.read(ctx))throw Error('Current branch already has verified UI preferences');const policies=this.policies(ctx.sessionManager.getEntries(),ctx.sessionManager.getSessionId(),true);if(policies.some(value=>value.defaultSnapshot.source!=='manual-baseline'))throw Error('Known shared baseline must be restored, not replaced by manual adoption');
  return createHash('sha256').update(JSON.stringify({module:this.module,sessionId:ctx.sessionManager.getSessionId(),file:ctx.sessionManager.getSessionFile?.()??null,cwd:ctx.cwd,leaf:ctx.sessionManager.getLeafId?.()??null,revisions:policies.map(value=>value.revision)})).digest('hex');
 }
 adoptManual(ctx,values,{confirmed=false,expectedWitness}={},valid){
  if(confirmed!==true||typeof valid!=='function'||valid()!==true||expectedWitness!==this.manualWitness(ctx))throw Error('Manual baseline scope/confirmation changed');const chosen=controlValues(this.fields,values,this.check),next={schema:1,module:this.module,sessionId:ctx.sessionManager.getSessionId(),revision:randomUUID(),origin:'explicit',values:chosen,defaultSnapshot:{source:'manual-baseline',sourceRevision:randomUUID(),values:chosen}};return this.append(ctx,next,valid);
 }
 commit(ctx,patch,expectedRevision,valid){
  if(!patch||typeof patch!=='object'||Array.isArray(patch)||!Object.keys(patch).length||Object.keys(patch).some(key=>!Object.hasOwn(this.fields,key)))throw Error('Unknown current-session patch');
  const before=this.read(ctx);if(!before||before.revision!==expectedRevision)throw Error('UI session revision changed');const values=controlValues(this.fields,{...before.values,...patch},this.check);if(isDeepStrictEqual(values,before.values))return before;
  return this.append(ctx,{...before,revision:randomUUID(),origin:'explicit',values},valid);
 }
}
