import{createHash,randomUUID}from'node:crypto';import{ACCOUNTING_ENTRY,accountingRecords,projectAccounting,validateAccounting,normalizeUsage}from'./accounting_v0.5.0.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex'),key=ctx=>sha([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile?.()??ctx.cwd]),route=ctx=>[ctx.model?.provider??null,ctx.model?.api??null,ctx.model?.id??null],responseKey=m=>typeof m?.provider==='string'&&typeof m.api==='string'&&typeof m.model==='string'&&Number.isFinite(m.timestamp)?sha([m.provider,m.api,m.model,m.timestamp]):undefined,outcome=m=>m?.stopReason==='aborted'?'aborted':m?.stopReason==='error'||m?.isError?'failed':'completed';
// Passive observer of native events. Every callback returns undefined. No HTTP,
// LLM, payload/header replacement, model mutation or completion notification.
export function createAccountingObserver(pi,{getState,clock=Date.now}={}){
 if(typeof getState!=='function'||typeof clock!=='function')throw Error('Accounting observer requires state/clock');
 let ready=false,scope,scopeKey,context,records=[],fault=null,warned=false,pending=[],active=new Map(),closed=new Set(),preexisting=new Set(),currentRun,phase,leaseGoalId;
 const models=new Map(),toolBindings=new Map(),toolOwners=new Map(),ended=new Set();
 const at=()=>clock(),owned=ctx=>ready&&scopeKey===key(ctx),fresh=()=>({schema:1,id:randomUUID(),scopeId:scope.scopeId,sessionId:scope.sessionId,at:at()});
 function safe(fn){try{fn();}catch{fault='結算觀測資料未完整驗證；未改動模型請求或Goal。';if(!warned&&context?.mode==='tui'){warned=true;try{context.ui.notify(fault,'warning');}catch{}}}}
 function append(type,data,when){const e={...fresh(),type,...data,...(when===undefined?{}:{at:when})};validateAccounting(e);pi.appendEntry(ACCOUNTING_ENTRY,e);records.push(e);return e;}
 function projection(ctx){return projectAccounting(records,{sessionId:ctx.sessionManager.getSessionId(),fileBinding:key(ctx),now:at()});}
 function existing(ctx,id){return projection(ctx).runs.findLast(r=>r.goalId===id&&r.outcome===null);}
 function ensureRun(ctx,g){if(currentRun?.goalId===g.id&&!closed.has(currentRun.runId))return currentRun;let r=existing(ctx,g.id);if(!r){const e=append('open',{runId:randomUUID(),goalId:g.id,goalRevision:g.revision,preexisting:preexisting.has(g.id)});r={runId:e.runId,goalId:g.id};}currentRun=r;phase=undefined;return r;}
 function changePhase(ctx,value,run=currentRun,when){if(!run||closed.has(run.runId)||phase===value&&run.runId===currentRun?.runId)return;append('phase',{runId:run.runId,phase:value},when);if(run.runId===currentRun?.runId)phase=value;}
 function actualPhase(ctx){const s=getState(ctx),g=s.goal;if([...active.values()].some(id=>id===currentRun?.runId))return'executing';if(g?.id!==currentRun?.goalId||!s.enabled||g?.status==='paused')return'paused';if(g.waiting||g.retry.nextAt!==null)return'waiting';return'idle';}
 function updatePhase(ctx){changePhase(ctx,actualPhase(ctx));}
 function beginOperation(ctx,{kind,role,opId=randomUUID(),owner}={}){const s=getState(ctx),g=s.goal;if(!owner&&!(s.enabled&&g?.status==='active'||g?.status==='paused'&&leaseGoalId===g.id))return;const r=owner??ensureRun(ctx,g);const rev=owner?.goalRevision??g.revision;append('operation',{runId:r.runId,opId,kind,role,goalRevision:rev,route:kind==='model'?route(ctx):[null,null,null]});const value={runId:r.runId,goalId:r.goalId,goalRevision:rev,opId,role,kind};active.set(opId,r.runId);if(kind==='tool')append('start',{runId:r.runId,opId});changePhase(ctx,'executing',r);return value;}
 function endOperation(ctx,b,result){if(!b||ended.has(b.opId))return;append('end',{runId:b.runId,opId:b.opId,outcome:result});ended.add(b.opId);active.delete(b.opId);if(currentRun?.runId===b.runId)updatePhase(ctx);}
 function receipt(ctx,b,message,source){if(!b||message.usage===undefined)return;const result=outcome(message),providerId=source==='sdk-assistant'&&typeof message.responseId==='string'&&message.responseId.length<=1024?sha([message.provider,message.api,message.model,message.responseId]):null;
  const receiptId=sha([source,b.runId,providerId??b.opId]),nested=source==='sdk-tool-aggregate'?message.nestedCalls:undefined,covers=[...new Set((nested?.calls??[]).map(c=>toolBindings.get(c.id)?.opId).filter(id=>id&&id!==b.opId))];append('receipt',{runId:b.runId,opId:b.opId,receiptId,source,usage:normalizeUsage(message.usage,{outcome:result}),outcome:result,covers,nestedComplete:typeof nested?.complete==='boolean'?nested.complete:null});}
 const api={
  suspend(){ready=false;leaseGoalId=undefined;},
  restore(ctx,reason='start'){safe(()=>{ready=false;context=ctx;scopeKey=key(ctx);records=accountingRecords(ctx.sessionManager.getBranch());pending=[];active.clear();models.clear();toolBindings.clear();toolOwners.clear();ended.clear();closed.clear();currentRun=undefined;phase=undefined;leaseGoalId=undefined;fault=null;warned=false;const sid=ctx.sessionManager.getSessionId(),g=getState(ctx).goal;preexisting=new Set(g?[g.id]:[]);scope=records.findLast(e=>e.type==='scope'&&e.sessionId===sid&&e.fileBinding===scopeKey);
   if(!scope||reason==='tree'){scope={schema:1,id:randomUUID(),type:'scope',scopeId:randomUUID(),sessionId:sid,at:at(),fileBinding:scopeKey,reason:reason==='tree'?'tree':'fresh'};validateAccounting(scope);pi.appendEntry(ACCOUNTING_ENTRY,scope);records.push(scope);}
   ready=true;if(g){const r=existing(ctx,g.id);if(r){currentRun=r;changePhase(ctx,'gap',r,r.lastAt);updatePhase(ctx);}}
  });},
  stateChanged(ctx,state){if(!owned(ctx))return;safe(()=>{const g=state.goal;if(g?.status==='active'&&state.enabled)leaseGoalId=g.id;if(currentRun&&(g?.id!==currentRun.goalId||g?.status==='complete')){if(!closed.has(currentRun.runId)){append('close',{runId:currentRun.runId,outcome:g?.id===currentRun.goalId&&g.status==='complete'?'completed':'deleted'});closed.add(currentRun.runId);}currentRun=undefined;phase=undefined;}else if(currentRun)updatePhase(ctx);});},
  shutdown(ctx){if(owned(ctx))safe(()=>changePhase(ctx,'gap'));ready=false;context=undefined;},
  report(ctx){try{const result=owned(ctx)?projection(ctx):projectAccounting(accountingRecords(ctx.sessionManager.getBranch()),{sessionId:ctx.sessionManager.getSessionId(),fileBinding:key(ctx),now:at()});return{...result,runs:fault?result.runs.map(r=>({...r,completeness:{...r.completeness,complete:false,observerFault:true}})):result.runs,observerFault:fault};}catch{return{scope:null,runs:[],observerFault:'結算資料格式／範圍未驗證，不採session totals補值。'};}},
 };
 // SDK cache warmer reuses provider onPayload callbacks but emits no Main
 // context_with_system/message_start. Bind the Main CONTEXT before transport,
 // not every HTTP callback; never mischarge warming to the next Main reply.
 pi.on('agent_start',(_e,ctx)=>{if(!owned(ctx))return;safe(()=>{const s=getState(ctx);leaseGoalId=s.enabled&&s.goal?.status==='active'?s.goal.id:undefined;});});
 pi.on('context_with_system',(_e,ctx)=>{if(!owned(ctx))return;safe(()=>{for(const old of pending)endOperation(ctx,old,'orphaned');pending=[];const b=beginOperation(ctx,{kind:'model',role:'Main'});if(b)pending.push(b);});});
 pi.on('before_provider_request',()=>{});
 pi.on('message_start',(e,ctx)=>{if(!owned(ctx)||e.message?.role!=='assistant')return;safe(()=>{const k=responseKey(e.message);if(!k||models.has(k))return;const b=pending.shift();if(b){models.set(k,b);append('start',{runId:b.runId,opId:b.opId},e.message.timestamp);}});});
 pi.on('tool_execution_start',(e,ctx)=>{if(!owned(ctx)||typeof e.toolCallId!=='string')return;safe(()=>{if(toolBindings.has(e.toolCallId))return;const b=beginOperation(ctx,{kind:'tool',role:e.toolName==='subagent'?'子代理合計':'工具合計',owner:toolOwners.get(e.toolCallId)});if(b)toolBindings.set(e.toolCallId,b);});});
 pi.on('tool_execution_end',(e,ctx)=>{if(!owned(ctx))return;safe(()=>{const b=toolBindings.get(e.toolCallId);if(e.parentToolCallId&&e.result?.usage!==undefined)receipt(ctx,b,{usage:e.result.usage,isError:e.isError},'sdk-tool-aggregate');endOperation(ctx,b,e.isError?'failed':'completed');});});
 pi.on('message_end',(e,ctx)=>{if(!owned(ctx))return;safe(()=>{const m=e.message;if(m?.role==='assistant'){const b=models.get(responseKey(m));if(!b)return;receipt(ctx,b,m,'sdk-assistant');for(const c of m.content??[])if(c.type==='toolCall'&&typeof c.id==='string')toolOwners.set(c.id,b);endOperation(ctx,b,outcome(m));}else if(m?.role==='toolResult'){const b=toolBindings.get(m.toolCallId);if(!b)return;receipt(ctx,b,m,'sdk-tool-aggregate');endOperation(ctx,b,outcome(m));}});});
 pi.on('agent_settled',(_e,ctx)=>{if(!owned(ctx))return;safe(()=>{for(const b of [...pending,...models.values()])endOperation(ctx,b,'orphaned');pending=[];leaseGoalId=undefined;if(currentRun)updatePhase(ctx);});});
 return api;
}
