// Adapter over the existing Progress state. No second UI-policy entry, no Goal
// transition, no transcript/file rewrite and no global/current double write.
import {createHash} from 'node:crypto';
import {PROGRESS_ENTRY,initialProgress,readProgress,validateProgress,changeProgress,restoredProgress} from './state_v0.1.0.mjs';
const H=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export class ProgressPolicy{
 constructor(api){if(typeof api?.appendEntry!=='function')throw Error('Progress append API unavailable');this.api=api;this.module='progress';this.owner='native-progress-state';}
 raw(ctx){const entries=ctx.sessionManager.getBranch();return entries.some(e=>e.type==='custom'&&e.customType===PROGRESS_ENTRY)?readProgress(entries,ctx.sessionManager.getSessionId()):null;}
 state(ctx){const s=this.raw(ctx);if(s&&s.sessionId!==ctx.sessionManager.getSessionId())throw Error('Progress belongs to another session; explicit restore required');return s;}
 wrap(s){if(!s)return null;return Object.freeze({module:'progress',revision:H(s),values:Object.freeze({enabled:s.enabled}),defaultSnapshot:Object.freeze({source:'native-progress-state'})});}
 read(ctx){return this.wrap(this.state(ctx));}
 append(ctx,s,valid){validateProgress(s);if(typeof valid!=='function'||valid()!==true||s.sessionId!==ctx.sessionManager.getSessionId())throw Error('Progress scope changed');this.api.appendEntry(PROGRESS_ENTRY,structuredClone(s));const actual=this.state(ctx);if(JSON.stringify(actual)!==JSON.stringify(s))throw Error('Progress append receipt unknown; do not retry');return this.wrap(actual);}
 recover(ctx,valid){const s=this.raw(ctx);if(!s)return null;const next=restoredProgress(s,ctx.sessionManager.getSessionId());return JSON.stringify(s)===JSON.stringify(next)?this.wrap(s):this.append(ctx,next,valid);}
 ensure(ctx,view,valid){const s=this.raw(ctx);if(s)return s.sessionId===ctx.sessionManager.getSessionId()?this.wrap(s):this.recover(ctx,valid);if(view?.status!=='ready'||typeof view.values?.enabled!=='boolean')throw Error('Progress initial default unknown; do not guess');return this.append(ctx,{...initialProgress(ctx.sessionManager.getSessionId()),enabled:view.values.enabled},valid);}
 commit(ctx,patch,expected,valid){if(!patch||Object.keys(patch).join()!=='enabled'||typeof patch.enabled!=='boolean'||typeof valid!=='function'||valid()!==true)throw Error('Unknown Progress change');const s=this.state(ctx);if(!s||H(s)!==expected)throw Error('Progress revision changed');if(s.enabled===patch.enabled)return this.wrap(s);return this.append(ctx,changeProgress(s,{action:'enable',revision:s.revision,enabled:patch.enabled}),valid);}
 manualWitness(ctx){if(this.raw(ctx))throw Error('Native Progress already initialized');return H({id:ctx.sessionManager.getSessionId(),file:ctx.sessionManager.getSessionFile?.()??null,cwd:ctx.cwd,leaf:ctx.sessionManager.getLeafId?.()??null});}
 adoptManual(ctx,values,{confirmed=false,expectedWitness}={},valid){if(confirmed!==true||typeof valid!=='function'||valid()!==true||expectedWitness!==this.manualWitness(ctx)||!values||Object.keys(values).join()!=='enabled'||typeof values.enabled!=='boolean')throw Error('Unconfirmed Progress baseline');return this.append(ctx,{...initialProgress(ctx.sessionManager.getSessionId()),enabled:values.enabled},valid);}
}
