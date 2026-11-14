// Native v1 policy / v1.16 pending transactions remain authoritative. Only
// first initialization gets a dated future-default snapshot; no current fork.
import{SessionPolicy as Native,SESSION_POLICY_TYPE,readSessionPolicy,validateDefaults,validateSessionPolicy}from'./session-policy_v1.16.0.mjs';
export * from'./session-policy_v1.16.0.mjs';
export class SessionPolicy extends Native{
 constructor(pi,dir,{initialDefaults,...options}={}){super(pi,dir,options);if(typeof initialDefaults!=='function')throw Error('ACM native initialization requires verified dated defaults');this.initialDefaults=initialDefaults;}
 ensure(ctx){const current=readSessionPolicy(ctx.sessionManager.getBranch());if(current)return current;const snapshot=validateDefaults(this.initialDefaults(ctx)),next=validateSessionPolicy({...snapshot,origin:'default',defaultSnapshot:snapshot});this.pi.appendEntry(SESSION_POLICY_TYPE,next);const saved=readSessionPolicy(ctx.sessionManager.getBranch());if(JSON.stringify(saved)!==JSON.stringify(next))throw Error('ACM native initial policy receipt unverified');return saved;}
}
