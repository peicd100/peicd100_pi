// Financial orchestration is not a model tool. Only the Usage UI/controller
// owns grants. Every network POST follows a durable, account-global claim.
import{createGrant,observeLedger,reserveCard,markSubmitted,settleCard,cancelReserved,onceGrantSpent}from'./ledger_v0.1.0.mjs';import{selectAutoCredit,binding}from'./evidence_v0.1.0.mjs';import{AccountLedgerStore}from'./account-store_v0.1.0.mjs';
export function createUsageEngine({client,root,now=Date.now,storeFor=account=>new AccountLedgerStore(root,account)}={}){if(!client||typeof client.inspect!=='function'||typeof client.prepare!=='function'||typeof client.consume!=='function')throw new Error('Usage client未設定');
 const validScope=(valid,signal)=>typeof valid==='function'&&valid()===true&&!signal?.aborted;
 const contextFor=(snapshot,scope)=>({...scope,accountBinding:snapshot.evidence.accountBinding,modelBinding:snapshot.evidence.modelBinding});
 async function inspect(ctx,{signal,valid}={}){const snapshot=await client.inspect(ctx,{signal,valid});if(binding(snapshot.evidence.accountBinding)&&binding(snapshot.evidence.modelBinding))await storeFor(snapshot.evidence.accountBinding).transact(s=>observeLedger(s,snapshot.evidence,now()),{valid});return snapshot;}
 function authorize(snapshot,scope,mode,{userAction=false,creditId}={}){if(!binding(snapshot?.evidence?.accountBinding)||!binding(snapshot?.evidence?.modelBinding))throw new Error('目前帳號／模型未驗證，不建立用卡授權');return createGrant(contextFor(snapshot,scope),mode,{userAction,creditId});}
 async function execute(ctx,{grant,scope,creditId,nativeFailureKind='unknown',signal,valid,onOnceSpent=()=>{}}={}){let store,reservation,submitted=false,snapshot,context,id;try{if(!validScope(valid,signal))return{status:'not-sent',reason:'scope-invalid'};snapshot=await inspect(ctx,{signal,valid});context=contextFor(snapshot,scope);if(!validScope(valid,signal))return{status:'not-sent',reason:'scope-invalid'};if(!binding(context.accountBinding)||!binding(context.modelBinding))return{status:'blocked',reason:'unverified-account'};store=storeFor(context.accountBinding);id=grant?.mode==='manual'?creditId:selectAutoCredit(snapshot.availability,now())?.creditId;if(!id)return{status:'blocked',reason:'no-eligible-card',snapshot};
   reservation=await store.transact(s=>reserveCard(s,{grant,context,evidence:snapshot.evidence,availability:snapshot.availability,creditId:id,nativeFailureKind,now:now()}),{valid});const requestId=reservation.pending.requestId;
   // Recheck the actual runtime account/model and explicit card AFTER reserving,
   // still before the one-way submit marker. Closing an unsubmitted UI cancels.
   const fresh=await inspect(ctx,{signal,valid}),current=contextFor(fresh,scope);if(!validScope(valid,signal)||current.accountBinding!==context.accountBinding||current.modelBinding!==context.modelBinding)throw new Error('提交前範圍已變更');snapshot=fresh;
   const ticket=await client.prepare(snapshot,id,requestId,{context,grantNonce:grant.nonce,signal,valid});
   await store.transact(s=>markSubmitted(s,{requestId,grant,context,evidence:snapshot.evidence,availability:snapshot.availability,creditId:id,now:now()}),{valid});submitted=true;
   if(!validScope(valid,signal))throw new Error('提交標記後範圍已變更，不能假裝撤銷');let outcome;try{outcome=await client.consume(snapshot,id,requestId,{context,ticket,signal,valid});}catch{const unknown=await store.transact(s=>settleCard(s,requestId,null,now()));return{status:'unknown',reason:'submitted-result-unverified',requestId,ledger:unknown,snapshot};}
   // Settlement is bound to the ORIGINAL request, even if UI/session/model
   // changed after the POST. Never discard a committed result or resend it.
   let ledger=await store.transact(s=>settleCard(s,requestId,outcome,now()));const disableOnce=onceGrantSpent(ledger,grant);let preferenceSaved=true;if(disableOnce)try{await onOnceSpent(grant);}catch{preferenceSaved=false;}
   if(ledger.pending?.status==='unknown')return{status:'unknown',reason:'ambiguous-response',requestId,ledger,snapshot,disableOnce,preferenceSaved};
   if(validScope(valid,signal))try{snapshot=await inspect(ctx,{signal,valid});ledger=(await store.read()).state;}catch{}
   return{status:outcome.code==='reset'?'used':'not-used',requestId,outcome,ledger,snapshot,disableOnce,preferenceSaved,recoveryVerified:ledger.pending===null&&snapshot.evidence.state==='restored'};
  }catch{if(reservation?.pending&&store){const requestId=reservation.pending.requestId;if(!submitted){try{await store.transact(s=>cancelReserved(s,{requestId,grant,context,now:now()}));return{status:'not-sent',reason:'pre-submit-recheck-failed',requestId,snapshot};}catch{return{status:'blocked',reason:'reservation-needs-reconciliation',requestId,snapshot};}}try{const ledger=await store.transact(s=>settleCard(s,requestId,null,now()));return{status:'unknown',reason:'post-submit-scope-or-storage-failed',requestId,ledger,snapshot};}catch{return{status:'unknown',reason:'submitted-ledger-needs-reconciliation',requestId,snapshot};}}
   return{status:'blocked',reason:'scope-or-ledger-validation-failed',snapshot};}
 }
 return Object.freeze({inspect,authorize,execute,async grantSpent(grant){if(!binding(grant?.accountBinding))return false;return onceGrantSpent((await storeFor(grant.accountBinding).read()).state,grant);}});
}
