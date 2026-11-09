import {Type} from 'typebox';
import {join} from 'node:path';import{randomUUID}from'node:crypto';import{usageRouteKey}from'../../usage/src/client_v0.2.0.mjs';import{requestUsageService,windowQuotaFailure}from'../../usage/src/service_v0.1.0.mjs';
import {getAgentDir,CustomEditor} from '@earendil-works/pi-coding-agent';
import {FeaturePreference} from '../../../src/preferences_v0.15.0.mjs';
import {StringEnum} from '@earendil-works/pi-ai';
import {Text,truncateToWidth,getKeybindings} from '@earendil-works/pi-tui';
import {namespaceAPI} from '../../../src/commands_v0.12.0.mjs';
import {withMouseMenus,showInfo} from '../../../src/ui_v0.15.0.ts';
import {GOAL_ENTRY,GOAL_EVENT,RETRY_MS,readGoal,changeGoal,restoredGoal,shouldContinue,classifyFailure,reasonLabel,ControlPreference,controlView,managementDecision,latestUserReference,quotaFenceView,attachQuotaFence,clearQuotaFence,canPollQuota,resumeRecoveredGoal,QUOTA_POLL_MS} from '../src/state_v0.4.0.mjs';
import {readProgress,openProgress} from '../../progress/src/state_v0.1.0.mjs';
const TOOL='peicd100_goal';
const actions=['get','create','edit','pause','resume','delete','wait','complete'] as const;
const label=(g:any)=>g.status==='complete'?'已驗收完成':g.status==='paused'?`已暫停：${reasonLabel[g.reason]??'UNKNOWN'}`:g.waiting?`等待${g.waiting.kind==='user'?'使用者':'外部事件'}`:g.retry.nextAt!==null?`連線重試第${g.retry.attempt}次，約${Math.max(0,Math.ceil((g.retry.nextAt-Date.now())/1000))}秒後`:'執行中';
export default function goalExtension(raw:any){return createGoalExtension(raw);}
export function createGoalExtension(raw:any,deps:any={}){
 const pi=namespaceAPI(withMouseMenus(raw)),preferences=new FeaturePreference(join(getAgentDir(),'config','peicd100-goal')),controlPreferences=new ControlPreference(join(getAgentDir(),'config','peicd100-goal-control'));let stopped=false,blocked=false,epoch=0,lifecycle=0,uiWaiting=0,timer:any,ticker:any,context:any,uiTui:any,unsubscribeInput:any,branchCache:any,humanDirty=true,humanRef:string|null=null,quotaTimer:any,quotaController:any,quotaInFlight=false,branchNonce=randomUUID(),runId=randomUUID(),capturedRoute:any=null;const quotaPollMs=Number.isFinite(deps.quotaPollMs)&&deps.quotaPollMs>0?deps.quotaPollMs:QUOTA_POLL_MS;
 const sessionKey=(ctx:any)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd]);
 const branch=(ctx:any)=>{const key=sessionKey(ctx),leaf=ctx.sessionManager.getLeafId?.();if(leaf!==undefined&&branchCache?.key===key&&branchCache.leaf===leaf)return branchCache.entries;const entries=ctx.sessionManager.getBranch();branchCache={key,leaf,entries};return entries;};
 const snapshot=(ctx:any)=>readGoal(branch(ctx),ctx.sessionManager.getSessionId());
 const userReference=(ctx:any)=>{if(humanDirty){humanRef=latestUserReference(branch(ctx));humanDirty=false;}return humanRef;};
 const cancel=()=>{epoch++;if(timer!==undefined)clearTimeout(timer);if(ticker!==undefined)clearInterval(ticker);if(quotaTimer!==undefined)clearTimeout(quotaTimer);quotaController?.abort();quotaController=undefined;timer=ticker=quotaTimer=undefined;};
 const same=(ctx:any,key:string)=>!stopped&&context===ctx&&sessionKey(ctx)===key;
 const show=(ctx:any,known?:any)=>{if(ctx.mode!=='tui')return;if(blocked){ctx.ui.setWidget('peicd100-goal',['Goal｜偏好或資料無法驗證，自動續跑已阻擋'],{placement:'belowEditor'});return;}try{const s=known??snapshot(ctx),g=s.goal,q=g?.status==='paused'&&g.reason==='quota_exhausted'?(controlView(s).quotaRecovery?(quotaFenceView(s)?'｜額度恢復時將繼續':'｜原請求路由未驗證，待手動恢復'):'｜自動恢復已關閉'):'';if(!s.enabled||!g){ctx.ui.setWidget('peicd100-goal',undefined);return;}ctx.ui.setWidget('peicd100-goal',(tui:any,theme:any)=>{uiTui=tui;return {render:(width:number)=>[truncateToWidth(theme.fg(g.status==='paused'?'warning':g.status==='complete'?'success':'accent',`Goal｜${label(g)}${q}｜${g.objective.replace(/[\r\n\t\x00-\x1f\x7f]/g,' ')}`),Math.max(0,width))],invalidate(){}};},{placement:'belowEditor'});}catch{ctx.ui.setWidget('peicd100-goal',['Goal｜資料無法驗證，自動續跑已阻擋'],{placement:'belowEditor'});}};
 const persist=(ctx:any,next:any)=>{cancel();try{pi.appendEntry(GOAL_ENTRY,next);}catch(error){blocked=true;show(ctx);throw error;}branchCache=undefined;show(ctx,next);pi.events.emit(GOAL_EVENT,{sessionId:ctx.sessionManager.getSessionId(),goalId:next.goal?.id??null,revision:next.goal?.revision??null,status:next.goal?.status??'none'});return next;};
 const change=(ctx:any,command:any,meta:any={})=>persist(ctx,changeGoal(snapshot(ctx),command,{...meta,latestUserRef:userReference(ctx)}));
 const ref=(s:any)=>({id:s.goal.id,revision:s.goal.revision});
 const continuation=(s:any)=>`[PEICD100 Goal continuation; extension-authored, NOT new human authorization]\nGoal ID: ${s.goal.id}\nRevision: ${s.goal.revision}\nObjective: ${s.goal.objective}\nAcceptance: ${JSON.stringify(s.goal.criteria)}\nContinue within this existing authorized scope. Query ${TOOL} for the latest revision before changes. Verify actual outputs before complete; include concrete evidence. Progress completion alone is not Goal completion. Wait for user/external dependencies instead of inventing answers or looping; pause on an actual blocker. Never expand scope, spend extra funds, publish, delete, or change accounts without existing explicit user authorization.`;
 const kick=(ctx:any)=>{
  const s=snapshot(ctx);if(stopped||blocked||!shouldContinue(s)||uiWaiting||ctx.isIdle()!==true||ctx.hasPendingMessages())return false;
  pi.sendMessage({customType:'peicd100:goal-continuation',content:continuation(s),display:false},{triggerTurn:true});return true;
 };
 const schedule=(ctx:any)=>{
  cancel();if(blocked)return;const s=snapshot(ctx),g=s.goal;if(g?.status==='paused'&&g.reason==='quota_exhausted'){scheduleQuota(ctx);return;}if(!s.enabled||g?.status!=='active')return;
  const at=g.waiting?.kind==='external'?g.waiting.resumeAt:g.retry.nextAt;if(at===null||at===undefined)return;
  const own=epoch,key=sessionKey(ctx),id=g.id,revision=g.revision;
  ticker=setInterval(()=>{if(own===epoch&&same(ctx,key))show(ctx,s);},1000);ticker.unref?.();
  const dispatch=()=>{
   if(own!==epoch||!same(ctx,key))return;timer=undefined;if(ticker!==undefined)clearInterval(ticker);ticker=undefined;
   const current=snapshot(ctx);if(current.goal?.id!==id||current.goal?.revision!==revision||!current.enabled||current.goal.status!=='active')return;
   // If Pi has native retries, compaction, queued work or UI in flight, do NOT send.
   // The next settled boundary will schedule this same deadline; there is no polling run.
   if(ctx.isIdle()!==true||ctx.hasPendingMessages()||uiWaiting)return;
   try{change(ctx,{action:current.goal.waiting?'wake':'retry_dispatched',...ref(current)});kick(ctx);}catch{if(same(ctx,key)){const fresh=snapshot(ctx);if(fresh.goal?.status==='active')change(ctx,{action:'pause',...ref(fresh),reason:'unknown'});ctx.ui.notify('Goal排程無法安全接續，已暫停（UNKNOWN）。','warning');}}
  };
  timer=setTimeout(dispatch,Math.max(0,at-Date.now()));timer.unref?.();
 };
 const quotaContext=(ctx:any,s:any)=>{const f=quotaFenceView(s);return{sessionId:ctx.sessionManager.getSessionId(),goalId:s.goal?.id,goalRevision:s.goal?.revision,branchNonce,runId:f?.runId,routeKey:usageRouteKey(ctx),isIdle:ctx.isIdle()===true,hasPendingMessages:ctx.hasPendingMessages(),uiWaiting,latestUserRef:userReference(ctx)};};
 function scheduleQuota(ctx:any){if(quotaTimer!==undefined)clearTimeout(quotaTimer);quotaTimer=undefined;if(stopped||blocked)return;const s=snapshot(ctx),f=quotaFenceView(s),c=controlView(s);if(!f||!s.enabled||!c.quotaRecovery||c.barrier||f.branchNonce!==branchNonce||f.routeKey!==usageRouteKey(ctx))return;const life=lifecycle,key=sessionKey(ctx),own=epoch,valid=()=>!stopped&&!blocked&&life===lifecycle&&own===epoch&&sessionKey(ctx)===key&&context&&sessionKey(context)===key;
  quotaTimer=setTimeout(async()=>{quotaTimer=undefined;if(!valid())return;if(quotaInFlight){try{scheduleQuota(ctx);}catch{blocked=true;show(ctx);}return;}let current:any;try{current=snapshot(ctx);if(!canPollQuota(current,quotaContext(ctx,current))){scheduleQuota(ctx);return;}}catch{blocked=true;show(ctx);return;}const service=requestUsageService(pi.events);if(!service){scheduleQuota(ctx);return;}quotaInFlight=true;const controller=new AbortController();quotaController=controller;try{const options={signal:controller.signal,valid},snapshotUsage=await service.probe(options);if(!valid())return;const routing=await service.routing(options);if(!valid())return;const fresh=snapshot(ctx),scope=quotaContext(ctx,fresh);if(!canPollQuota(fresh,scope))return;const next=resumeRecoveredGoal(fresh,snapshotUsage.evidence,{...scope,routing,now:Date.now()});persist(ctx,next);ctx.ui.notify('已核實原帳號／模型額度恢復，繼續原Goal。','info');kick(ctx);}catch{/* Unknown/auth/HTTP/card receipt never dispatches or resumes by guess. */}finally{quotaInFlight=false;if(quotaController===controller)quotaController=undefined;if(valid())try{scheduleQuota(ctx);}catch{blocked=true;show(ctx);}}},quotaPollMs);quotaTimer.unref?.();
 }
 const stopInput=()=>{unsubscribeInput?.();unsubscribeInput=undefined;uiTui=undefined;};
 const attachInput=(ctx:any)=>{unsubscribeInput=ctx.ui.onTerminalInput?.((data:string)=>{
  // Observe the EXISTING native interrupt only at the actual native editor.
  // Never consume keys, replace the editor, override reserved shortcuts, or
  // mistake autocomplete/menu cancellation for an agent interruption.
  if(stopped||blocked||uiWaiting||!context||context.isIdle()!==true||typeof uiTui?.getFocusedComponent!=='function')return;
  const focused=uiTui.getFocusedComponent();if(!(focused instanceof CustomEditor)||focused.isShowingAutocomplete()||!(getKeybindings() as any).matches(data,'app.interrupt'))return;
  const s=snapshot(context),g=s.goal;if(s.enabled&&g&&(g.status==='active'&&(g.retry.nextAt!==null||g.waiting?.kind==='external'&&g.waiting.resumeAt!==null)||g.status==='paused'&&g.reason==='quota_exhausted'&&controlView(s).quotaRecovery))change(context,{action:'pause',...ref(s),reason:'interrupted'});
 });};
 const restore=async(event:any,ctx:any)=>{cancel();stopInput();branchNonce=randomUUID();runId=randomUUID();capturedRoute=null;const life=++lifecycle;branchCache=undefined;humanDirty=true;humanRef=null;stopped=false;blocked=true;context=ctx;uiWaiting=0;const key=sessionKey(ctx);try{const [pref,defaults]=await Promise.all([preferences.read(),controlPreferences.read()]);if(!same(ctx,key)||life!==lifecycle)return;const exists=branch(ctx).some((e:any)=>e.type==='custom'&&e.customType===GOAL_ENTRY),saved=snapshot(ctx);let next=restoredGoal(saved,ctx.sessionManager.getSessionId(),event.type==='session_tree'?'branch_changed':'restored',{defaults,latestUserRef:userReference(ctx)});if(!exists&&next.enabled!==pref.enabled)next=changeGoal(next,{action:'enable',enabled:pref.enabled},{latestUserRef:userReference(ctx)});blocked=false;persist(ctx,next);attachInput(ctx);}catch{if(life!==lifecycle)return;blocked=true;try{const saved=snapshot(ctx);if(saved.goal?.status==='active')persist(ctx,restoredGoal(saved,ctx.sessionManager.getSessionId(),'restored',{latestUserRef:userReference(ctx)}));}catch{}show(ctx);ctx.ui.notify('Goal偏好或資料無法驗證；不恢復舊狀態或自動執行。','warning');}};
 pi.on('session_start',restore);pi.on('session_tree',restore);
 pi.on('session_shutdown',(_event:any,ctx:any)=>{cancel();stopInput();lifecycle++;capturedRoute=null;stopped=true;context=undefined;branchCache=undefined;ctx.ui.setWidget('peicd100-goal',undefined);});
 pi.on('ui_prompt_start',()=>{uiWaiting++;cancel();});
 pi.on('ui_prompt_end',()=>{
  uiWaiting=Math.max(0,uiWaiting-1);if(uiWaiting||!context||stopped)return;
  // Let the accepted menu action commit/cancel first; never start a request in
  // the gap before a user's pause/delete/edit is applied.
  const ctx=context,key=sessionKey(ctx);cancel();const own=epoch;
  timer=setTimeout(()=>{timer=undefined;if(own!==epoch||!same(ctx,key)||uiWaiting)return;try{const s=snapshot(ctx);if(s.goal?.status==='paused'&&s.goal.reason==='quota_exhausted'||s.goal?.retry.nextAt!==null||s.goal?.waiting)schedule(ctx);else kick(ctx);}catch{show(ctx);}},0);timer.unref?.();
 });
 pi.on('input',()=>{cancel();humanDirty=true;return {action:'continue'};});
 pi.on('message_start',(event:any)=>{if(event.message?.role==='user')humanDirty=true;});
 pi.on('before_agent_start',(_event:any,ctx:any)=>{
  context=ctx;cancel();runId=randomUUID();capturedRoute=null;if(blocked){show(ctx);return;}try{let s=snapshot(ctx);if(s.goal?.status==='active'&&s.goal.retry.nextAt!==null)s=change(ctx,{action:'retry_dispatched',...ref(s)});show(ctx);if(s.enabled&&s.goal?.status==='active')return {message:{customType:'peicd100:goal-scope',content:continuation(s),display:false}};}catch{show(ctx);}
 });
 pi.on('before_provider_headers',async(event:any,ctx:any)=>{if(stopped||blocked)return;const service=requestUsageService(pi.events);if(!service)return;const life=lifecycle,key=sessionKey(ctx),own=runId,routeKey=usageRouteKey(ctx),valid=()=>!stopped&&!blocked&&life===lifecycle&&own===runId&&sessionKey(ctx)===key&&usageRouteKey(ctx)===routeKey;try{const route=await service.captureHeaders(event.headers,{valid});if(valid())capturedRoute=route?.state==='ready'&&route.captureSource==='native-headers'?{route,runId:own,branchNonce}:null;}catch{if(valid())capturedRoute=null;}});
 pi.on('model_select',(_event:any,ctx:any)=>{cancel();context=ctx;runId=randomUUID();capturedRoute=null;try{const s=snapshot(ctx);if(quotaFenceView(s))persist(ctx,clearQuotaFence(s));}catch{show(ctx);}});
 pi.on('agent_before_settle',(event:any,ctx:any)=>{
  context=ctx;if(blocked)return;const s=snapshot(ctx);
  if(event.outcome!=='completed'||!shouldContinue(s)||uiWaiting||event.continue||event.context?.pendingMessages?.length||ctx.hasPendingMessages())return;
  return {entries:[...event.entries,{type:'custom_message',customType:'peicd100:goal-continuation',content:continuation(s),display:false}],continue:true};
 });
 pi.on('agent_settled',(event:any,ctx:any)=>{
  context=ctx;if(blocked)return;try{let s=snapshot(ctx);if(!s.enabled||!s.goal)return;const quotaPaused=s.goal.status==='paused'&&s.goal.reason==='quota_exhausted',last=branch(ctx).findLast((e:any)=>e.type==='message'&&e.message?.role==='assistant')?.message;
   if((s.goal.status==='active'||quotaPaused)&&(event.aborted||last?.stopReason==='aborted')){capturedRoute=null;change(ctx,{action:'pause',...ref(s),reason:'interrupted'});return;}
   if(s.goal.status!=='active'){if(quotaPaused)schedule(ctx);return;}
   if(last?.stopReason==='error'){const kind=classifyFailure(last);if(kind==='transient'){if(s.goal.retry.nextAt===null)change(ctx,{action:'retry',...ref(s)});schedule(ctx);return;}s=change(ctx,{action:'pause',...ref(s),reason:kind});const captured=capturedRoute;capturedRoute=null;if(kind==='quota_exhausted'&&windowQuotaFailure(last)&&captured&&captured.branchNonce===branchNonce&&captured.runId===runId){try{persist(ctx,attachQuotaFence(s,captured.route,{sessionId:s.sessionId,goalId:s.goal.id,goalRevision:s.goal.revision,branchNonce,runId:captured.runId,routeKey:usageRouteKey(ctx),failureKind:'subscription_windows'}));}catch{/* No original request observation: remain quota-paused, never guess. */}}schedule(ctx);return;}
   schedule(ctx);
  }catch{show(ctx);}
 });
 const permission=async(ctx:any,action:string,state:any,params:any)=>{
  if(!['create','edit','delete','resume'].includes(action))return true;
  if(!ctx.hasUI)throw new Error('此Goal操作須使用者明確確認；此模式沒有互動授權介面');
  const key=sessionKey(ctx),revision=state.revision,leaf=ctx.sessionManager.getLeafId?.(),life=lifecycle;
  const message=action==='create'?`建立並${params.draft?'保持草案暫停':'立即開始'}此Goal？\n${params.objective}\n驗收：${JSON.stringify(params.criteria??[])}`:action==='edit'?`修改目前Goal並以新revision取代舊驗收？\n${params.objective??state.goal?.objective}\n驗收：${JSON.stringify(params.criteria??state.goal?.criteria)}`:action==='delete'?'刪除目前Goal並取消未送出的自動續跑？不撤回已發生的副作用。':'恢復目前Goal並在代理可用時接續工作？';
  const approved=await ctx.ui.confirm('Goal操作確認',message);
  if(!approved)throw new Error('使用者取消，Goal未變更');
  if(!same(ctx,key)||life!==lifecycle||snapshot(ctx).revision!==revision||ctx.sessionManager.getLeafId?.()!==leaf)throw new Error('授權期間對話或Goal已變更，未執行');return true;
 };
 const operate=async(ctx:any,p:any,user=false)=>{
  context=ctx;const s=snapshot(ctx);if(p.action==='get')return {...s,automationBlocked:blocked,quotaRecoveryServiceAvailable:!!requestUsageService(pi.events),quotaRequestAnchored:!!quotaFenceView(s)};if(blocked)throw new Error('Goal偏好或資料無法驗證，請先修復並重新開啟Goal選單或重載；不會自動恢復');
  if(p.action==='pause'&&p.reason!==undefined&&!['user','blocked'].includes(p.reason))throw new Error('工具暫停原因只允許user或blocked；額度/憑證錯誤須由實際執行證據辨識');
  if(p.action==='complete'){const progress=readProgress(branch(ctx),ctx.sessionManager.getSessionId());return change(ctx,p,{openProgress:openProgress(progress,s.goal?.id)});}
  let decision=managementDecision(s,p.action,{userAction:user,latestUserRef:userReference(ctx)});if(decision.confirmationRequired||user&&!controlView(s).autonomousManagement&&['create','edit','delete','resume'].includes(p.action)){await permission(ctx,p.action,s,p);decision={allowed:true,authorizationKind:'human_confirmation'};}
  const next=change(ctx,p,{authorized:true,authorizationKind:decision.authorizationKind});
  if(p.action==='create'&&!p.draft||p.action==='resume'||p.action==='edit'&&next.goal?.status==='active')kick(ctx);
  else if(p.action==='wait')schedule(ctx);
  return next;
 };
 pi.registerTool({name:TOOL,label:'Goal',description:'Manage this conversation\'s single authorized Goal. get is read-only. Mutations require current id/revision. When autonomous management is enabled, create/edit/delete/resume are delegated ONLY within an existing human-assigned task; otherwise they require human confirmation. Pure discussion is not an assignment. Manual stop, restored and completed barriers cannot be bypassed by replacing the Goal. This never grants external authorization. create starts immediately unless draft. pause never aborts current tools. wait stops automatic continuation until the specified dependency. complete requires actual verification evidence; never infer it from a finished checklist.',promptSnippet:'Query/manage the authorized Goal; retain ID+revision and verify evidence before complete',promptGuidelines:['Do not create or resume work from pure discussion. Autonomous management only administers a task already entrusted by the user; it never grants permission for external side effects.','Never use edit/delete/create to bypass a manual pause, interruption, restoration or completed Goal. A new user request or explicit user UI action is required.',`Use ${TOOL} to pause/wait when the authorized Goal needs a user decision or dependency; do not loop or invent authorization.`,`Use ${TOOL} complete only after actually verifying all acceptance criteria and returning concrete evidence. Never treat update_progress as Goal completion.`],executionMode:'sequential',parameters:Type.Object({action:StringEnum(actions),id:Type.Optional(Type.String()),revision:Type.Optional(Type.Integer({minimum:1})),objective:Type.Optional(Type.String({minLength:1,maxLength:16384})),criteria:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:4096}),{maxItems:32})),draft:Type.Optional(Type.Boolean()),reason:Type.Optional(Type.String({maxLength:2048,description:'For pause use user or blocked; for wait provide a factual dependency explanation.'})),kind:Type.Optional(StringEnum(['user','external'] as const)),resumeAt:Type.Optional(Type.Number()),verification:Type.Optional(Type.Array(Type.String({minLength:1,maxLength:4096}),{maxItems:32}))}),
  async execute(_id:any,p:any,_signal:any,_onUpdate:any,ctx:any){try{const state=await operate(ctx,p);return {content:[{type:'text',text:JSON.stringify(state)}],details:{state},...(p.action==='complete'?{terminate:true}:{})};}catch(error:any){return {content:[{type:'text',text:error.message}],details:undefined,isError:true};}},
  renderCall:(p:any,theme:any)=>new Text(theme.fg('toolTitle',`Goal ${p.action??''}`),0,0),renderResult:(r:any,_o:any,theme:any)=>new Text(theme.fg(r.details?.state?'muted':'error',r.details?.state?.goal?label(r.details.state.goal):r.details?.state?'尚無Goal':r.content[0]?.text??'Goal結果未知'),0,0)
 });
 pi.registerCommand('goal',{description:'目標、管理免逐次確認／額度恢復開關與驗收狀態',handler:async(args:any,ctx:any)=>{
  context=ctx;const life=lifecycle,key=sessionKey(ctx),alive=()=>!stopped&&life===lifecycle&&sessionKey(ctx)===key;
  if(args.trim()==='json'){try{ctx.ui.notify(JSON.stringify(await operate(ctx,{action:'get'})),'info');}catch(error:any){ctx.ui.notify(error.message,'warning');}return;}
  while(alive()){let s:any,pref:any,defaults:any;try{[pref,defaults]=await Promise.all([preferences.read(),controlPreferences.read()]);if(!alive())return;s=snapshot(ctx);blocked=false;}catch{cancel();blocked=true;show(ctx);ctx.ui.notify('Goal偏好或資料無法驗證，自動執行已阻擋。','error');return;}
   const g=s.goal,controls=controlView(s),options=[`Goal功能：${s.enabled?'開啟':'關閉'}（切換）`,`代理管理免逐次確認：${controls.autonomousManagement?'開啟':'關閉'}（切換）`,`額度恢復自動繼續：${controls.quotaRecovery?'開啟':'關閉'}（切換）`,'查看目標與驗收',...(!g||g.status==='complete'?['建立Goal']:['編輯Goal',g.status==='paused'||g.waiting?'恢復Goal':'暫停Goal','刪除Goal']),'返回'];
   const choice=await ctx.ui.select('Goal',options);if(!alive()||!choice||choice==='返回')return;
   const stable=()=>alive()&&snapshot(ctx).revision===s.revision;
   if(choice===options[0]){try{await preferences.write(!s.enabled,pref.revision,stable);if(!stable())throw new Error('Goal範圍已變更');change(ctx,{action:'enable',enabled:!s.enabled},{authorized:true,authorizationKind:'user_ui'});}catch{ctx.ui.notify('Goal開關或新對話預設未完整保存，請重新查看；未還原已提交內容。','warning');}continue;}
   if(choice===options[1]||choice===options[2]){const field=choice===options[1]?'autonomousManagement':'quotaRecovery',value=!controls[field];try{await controlPreferences.write({[field]:value},defaults.revision,stable);if(!stable())throw new Error('Goal控制範圍已變更');change(ctx,{action:'control_settings',expectedStateRevision:s.revision,[field]:value},{authorized:true,authorizationKind:'user_ui'});schedule(ctx);}catch{ctx.ui.notify('Goal控制開關未完整保存，請重新查看；未還原已提交內容。','warning');}continue;}
   if(choice==='查看目標與驗收'){await showInfo(ctx,'Goal目標與驗收',g?`${label(g)}\nID ${g.id} / revision ${g.revision}\n${g.objective}\n驗收：\n${g.criteria.join('\n')||'依目標要求逐項驗證'}\n完成證據：\n${g.verification.join('\n')||'尚未驗收'}\n管理免確認：${controls.autonomousManagement?'開':'關'}；額度恢復：${controls.quotaRecovery?'開':'關'}\n額度查證服務：${requestUsageService(pi.events)?'可用':'不可用'}；原請求路由：${quotaFenceView(s)?'已綁定':'未驗證，不自動恢復'}。`:'目前沒有Goal。');continue;}
   try{
    if(choice==='建立Goal'||choice==='編輯Goal'){
     const objective=await ctx.ui.editor('Goal目標',choice==='編輯Goal'?g.objective:'');if(!alive())return;if(objective===undefined)continue;
     const criteria=await ctx.ui.editor('驗收條件（每行一項）',choice==='編輯Goal'?g.criteria.join('\n'):'');if(!alive())return;if(criteria===undefined)continue;
     if(!stable())throw new Error('編輯期間Goal已變更，未提交');
     await operate(ctx,{action:choice==='建立Goal'?'create':'edit',objective,criteria:criteria.split(/\r?\n/).filter(x=>x.trim()),...(choice==='編輯Goal'?ref(s):{})},true);return;
    }else if(choice==='暫停Goal')await operate(ctx,{action:'pause',...ref(s),reason:'user'},true);
    else if(choice==='恢復Goal'||choice==='刪除Goal'){await operate(ctx,{action:choice==='恢復Goal'?'resume':'delete',...ref(s)},true);return;}
   }catch(error:any){ctx.ui.notify(error.message,'warning');}
  }
 }});
}
