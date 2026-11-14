import{createHash,randomUUID}from'node:crypto';import{SessionPolicy as Legacy,readSessionPolicy,validateSessionPolicy}from'./session-policy_v1.13.0.mjs';export{SESSION_POLICY_TYPE,DefaultsStore,validateDefaults,legacyDefaults,validateSessionPolicy,readSessionPolicy,effectiveSettings,policyForBranch,requestPolicyKey}from'./session-policy_v1.13.0.mjs';
export const PENDING_POLICY_TYPE='peicd100:acm-pending-policy';
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex'),digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/u.test(x),uuid=x=>typeof x==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(x),text=x=>typeof x==='string'&&x.length>0&&x.length<=256,exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.slice().sort().join();
export function validateScope(s){if(!exact(s,['sessionId','fileBinding','branchNonce','anchorId','routeBinding','accountBinding','settingsBinding'])||!text(s.sessionId)||!uuid(s.branchNonce)||!digest(s.fileBinding)||!digest(s.routeBinding)||!digest(s.settingsBinding)||s.accountBinding!==null&&!digest(s.accountBinding)||s.anchorId!==null&&!text(s.anchorId))throw Error('ACM pending scope未驗證');return s;}
export function validatePending(p){if(!exact(p,['schema','id','revision','status','basePolicyKey','desired','scope','at','reason'])||p.schema!==1||!uuid(p.id)||!Number.isSafeInteger(p.revision)||p.revision<1||!['staged','blocked','applied','cancelled'].includes(p.status)||!digest(p.basePolicyKey)||!Number.isSafeInteger(p.at)||p.at<0||p.status==='staged'&&p.reason!==null||p.status!=='staged'&&(!text(p.reason)||p.reason.length>80))throw Error('ACM pending metadata未驗證');validateScope(p.scope);validateSessionPolicy(p.desired);return p;}
export function readPending(branch){const e=branch.findLast(e=>e.type==='custom'&&e.customType===PENDING_POLICY_TYPE);return e?structuredClone(validatePending(e.data)):null;}
export function pendingKey(p){return p?hash(validatePending(p)):'absent';}
export function sameScope(a,b,branch){validateScope(a);validateScope(b);return ['sessionId','fileBinding','branchNonce','routeBinding','accountBinding','settingsBinding'].every(k=>a[k]===b[k])&&(a.anchorId===null||branch.some(e=>e.id===a.anchorId));}
export class SessionPolicy extends Legacy{
 constructor(pi,dir,{getScope,working=ctx=>!ctx.isIdle()||ctx.hasPendingMessages(),clock=Date.now}={}){super(pi,dir);if(typeof getScope!=='function')throw Error('ACM pending requires explicit scoped identity');this.getScope=getScope;this.working=working;this.clock=clock;this.retired=new Set();}
 resetScope(){this.retired.clear();}
 scope(ctx){return validateScope(this.getScope(ctx));}
 pending(ctx){return readPending(ctx.sessionManager.getBranch());}
 pendingKey(ctx){return pendingKey(this.pending(ctx));}
 view(ctx){try{const p=this.pending(ctx);if(!p)return{status:'none',pending:null,reason:null};if(p.status!=='staged')return{status:p.status,pending:p,reason:p.reason};if(this.retired.has(p.id))return{status:'blocked',pending:p,reason:'unverified-resolution'};const current=this.ensure(ctx),s=this.scope(ctx);if(!p.scope.accountBinding||!s.accountBinding)return{status:'blocked',pending:p,reason:'account-unverified'};if(!sameScope(p.scope,s,ctx.sessionManager.getBranch()))return{status:'blocked',pending:p,reason:'scope-changed'};if(hash(current)!==p.basePolicyKey)return{status:'blocked',pending:p,reason:'active-policy-changed'};return{status:'staged',pending:p,reason:null};}catch{return{status:'unverified',pending:null,reason:'invalid-pending-metadata'};}}
 append(ctx,value,expected){const before=this.pending(ctx);if(pendingKey(before)!==expected)throw Error('ACM pending CAS已變更');validatePending(value);try{this.pi.appendEntry(PENDING_POLICY_TYPE,value);const after=this.pending(ctx);if(pendingKey(after)!==pendingKey(value))throw Error('ACM pending保存未核實');return after;}catch(e){this.retired.add(value.id);throw e;}}
 transition(ctx,p,status,reason){if(!Number.isSafeInteger(p.revision+1))throw Error('ACM pending revision已滿');return this.append(ctx,{...p,revision:p.revision+1,status,reason,at:this.clock()},pendingKey(p));}
 // Render/ensure never applies. Legacy direct commits may not mutate a running
 // request. New UI uses change(), which stages while work or queue is active.
 commit(ctx,expected,change){if(this.working(ctx))throw Error('工作中僅可保存pending，不能修改當前policy');return super.commit(ctx,expected,change);}
 change(ctx,expected,change,{expectedPending=this.pendingKey(ctx)}={}){
  const active=this.ensure(ctx);if(hash(active)!==hash(expected)||this.pendingKey(ctx)!==expectedPending)throw Error('ACM設定／pending已改，未覆寫');const desired=validateSessionPolicy({...active,...change,origin:'explicit'}),old=this.pending(ctx),scope={...this.scope(ctx)};
  if(!this.working(ctx)){if(old)this.retired.add(old.id);const saved=super.commit(ctx,expected,change);let receipt=true;if(old&&['staged','blocked'].includes(old.status))try{this.transition(ctx,old,'cancelled','superseded-by-idle-confirmation');}catch{receipt=false;}return{status:'saved',active:saved,receipt};}
  if(hash(desired)===hash(active)){if(old&&['staged','blocked'].includes(old.status)){this.retired.add(old.id);this.transition(ctx,old,'cancelled','user-kept-active-policy');}return{status:'unchanged',active};}
  const revision=(old?.revision??0)+1;if(!Number.isSafeInteger(revision))throw Error('ACM pending revision已滿');const next={schema:1,id:randomUUID(),revision,status:'staged',basePolicyKey:hash(active),desired,scope,at:this.clock(),reason:null};this.append(ctx,next,expectedPending);return{status:'pending',active,pending:next};
 }
 cancel(ctx,{expectedPending=this.pendingKey(ctx)}={}){const p=this.pending(ctx);if(pendingKey(p)!==expectedPending)throw Error('ACM pending已改');if(!p||!['staged','blocked'].includes(p.status))return false;this.retired.add(p.id);this.transition(ctx,p,'cancelled','user-cancelled-pending');return true;}
 block(ctx,reason){const p=this.pending(ctx);if(p?.status==='staged'){this.retired.add(p.id);this.transition(ctx,p,'blocked',reason);}}
 applyPending(ctx,{boundary}={}){
  if(boundary!=='context_with_system')throw Error('僅安全模型context邊界可套用pending');const view=this.view(ctx),p=view.pending;if(!p||p.status!=='staged')return view;
  if(view.status!=='staged'){try{this.transition(ctx,p,'blocked',view.reason);}catch{}return{...view,status:'blocked'};}
  // Atomic active CAS is the existing authoritative append+readback. If the
  // following audit receipt fails, never pretend rollback: current active wins,
  // old base hash cannot replay, and UI exposes the missing resolution receipt.
  const before=this.ensure(ctx);if(hash(before)!==p.basePolicyKey||this.pendingKey(ctx)!==pendingKey(p))return{status:'blocked',pending:p,reason:'concurrent-change'};
  let saved;try{saved=super.commit(ctx,before,p.desired);}catch{this.retired.add(p.id);const actual=readSessionPolicy(ctx.sessionManager.getBranch());return hash(actual)===hash(p.desired)?{status:'applied-receipt-missing',active:actual,pending:p,reason:'active-readback-unknown'}:{status:'blocked',pending:p,reason:'active-save-unverified'};}
  this.retired.add(p.id);let receipt=true;try{this.transition(ctx,p,'applied','safe-context-boundary');}catch{receipt=false;}
  return{status:receipt?'applied':'applied-receipt-missing',active:saved,pending:p,reason:receipt?null:'pending-resolution-unverified'};
 }
}
