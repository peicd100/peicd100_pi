// Genuine existing Suffix policy only; the legacy four-field native entry
// stays authoritative. Text remains in the original shared SuffixStore.
import {createHash} from 'node:crypto';import {POLICY_TYPE,readPolicy} from './core_v0.1.0.mjs';
const H=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex'),enabledValues=values=>!!values&&Object.keys(values).join()==='enabled'&&typeof values.enabled==='boolean';
export class SuffixPolicy{
 constructor(api,{canEnable}={}){if(typeof api?.appendEntry!=='function'||typeof canEnable!=='function')throw Error('Suffix owner/content witness unavailable');this.api=api;this.canEnable=canEnable;this.module='suffix';this.owner='native-suffix-policy';}
 state(ctx){return readPolicy(ctx.sessionManager.getBranch());}
 wrap(state){return state?Object.freeze({module:this.module,revision:H(state),values:Object.freeze({enabled:state.enabled}),defaultSnapshot:Object.freeze({source:this.owner})}):null;}
 read(ctx){return this.wrap(this.state(ctx));}
 append(ctx,next,valid){if(typeof valid!=='function'||valid()!==true)throw Error('Suffix scope changed');readPolicy([{type:'custom',customType:POLICY_TYPE,data:next}]);this.api.appendEntry(POLICY_TYPE,structuredClone(next));const actual=this.state(ctx);if(JSON.stringify(actual)!==JSON.stringify(next))throw Error('Suffix append receipt unknown; never retry');return this.wrap(actual);}
 ensure(ctx,view,valid){const state=this.state(ctx);if(state)return this.wrap(state);if(view?.status!=='ready'||!enabledValues(view.values))throw Error('Suffix initial default unknown; do not guess');return this.append(ctx,{version:1,enabled:view.values.enabled,defaultEnabled:view.values.enabled,origin:'default'},valid);}
 commit(ctx,patch,expected,valid){if(!enabledValues(patch)||typeof valid!=='function'||valid()!==true)throw Error('Unknown Suffix change');const state=this.state(ctx);if(!state||H(state)!==expected)throw Error('Native Suffix policy changed');if(patch.enabled&&!state.enabled&&this.canEnable(ctx)!==true)throw Error('Suffix content is not verified nonempty');return state.enabled===patch.enabled?this.wrap(state):this.append(ctx,{...state,enabled:patch.enabled,origin:'explicit'},valid);}
 manualWitness(ctx){if(this.state(ctx))throw Error('Native Suffix already initialized');return H({id:ctx.sessionManager.getSessionId(),file:ctx.sessionManager.getSessionFile?.()??null,cwd:ctx.cwd,leaf:ctx.sessionManager.getLeafId?.()??null});}
 adoptManual(ctx,values,{confirmed=false,expectedWitness}={},valid){if(confirmed!==true||typeof valid!=='function'||valid()!==true||expectedWitness!==this.manualWitness(ctx)||!enabledValues(values))throw Error('Unconfirmed Suffix baseline');if(values.enabled&&this.canEnable(ctx)!==true)throw Error('Suffix content is not verified nonempty');return this.append(ctx,{version:1,enabled:values.enabled,defaultEnabled:values.enabled,origin:'explicit'},valid);}
}
