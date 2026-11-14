import {namespaceAPI} from '../../../src/commands_v0.12.0.mjs';
import * as ui170 from '../../../src/ui_v0.17.0.ts';import{installNotifyControls}from'../src/controls_v2.7.0.mjs';import{Type}from'typebox';import{Text}from'@earendil-works/pi-tui';import{AgentPreference,AGENT_LIMITS,agentPermitted}from'../src/agent-message_v1.0.0.mjs';import{createAgentNotifier}from'../src/agent-delivery_v1.0.0.mjs';
import { join } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import {commandRouter,deprecatedInputGuard} from '../../../src/menus_v0.12.0.mjs';
import { Store, validateEndpoint, resolveDestination, deliver, notificationId, settledSnapshot, DEFAULT_GOAL_NOTIFY, PROVIDERS, profileFingerprint, validateProfile } from '../src/core_v2.0.2.mjs';
import { SESSION_POLICY_TYPE, readSessionPolicy, initialSessionPolicy, sessionEnabled, authorizedConfig } from '../src/session-policy_v2.0.0.mjs';
import { maskedInput } from '../src/secret-ui.ts';

const onOff=(v:boolean|undefined)=>v===undefined?'狀態未驗':v?'開啟':'關閉';
const stateLabel=(s:string)=>({ACCEPTED:'已接受',API_REJECTED:'API 拒絕',HTTP_REJECTED:'HTTP 拒絕',UNKNOWN:'送達未知',FAILED_PRECHECK:'未送出'}[s]??'狀態未知');
import { readGoalPolicy, goalOutcome, sameGoalTransition, terminalTransitions } from '../src/goal-policy_v2.2.0.mjs';
import { QuietGate, QUIET_MS } from '../src/quiet-gate_v1.2.0.mjs';

const VERSION='2.7.0',AGENT_TOOL='peicd100_notify';
export default function notifyNotifier(pi: ExtensionAPI) {return createNotifyExtension(pi);}
export function createNotifyExtension(pi:any,deps:any={}) {
 const raw=pi,ui=deps.ui??ui170;let controls:any;pi=namespaceAPI(ui.withMouseMenus(pi));
  const routing=commandRouter(pi,['notify']);pi=routing.api;
  deprecatedInputGuard(pi,['notify-setup','notify-on','notify-off','notify-default','notify-status','notify-test','notify-clear'],'notify');
  const store=deps.store??new Store(deps.root??join(getAgentDir(),'config','webhook-notifier')),agentPreference=new AgentPreference(join(store.root,'agent-interface'));let agentLife=0,agentReady=false,activeKey='';
  let candidate:any, freshTerminal:any, runStarted=0, runIdentity='', observedRevision='', stopped=false, runGoalControlled=false;
  const quiet=new QuietGate(deps.quietOptions);let knownTransitions=new Set<string>();
  let observer:ReturnType<typeof setInterval>|undefined;
  const stopObserver=()=>{if(observer!==undefined)clearInterval(observer);observer=undefined;};
  const jobs=new Set<AbortController>(),operations=new Set<Promise<any>>();
  const show=(ctx:ExtensionContext,text:string,kind:'info'|'warning'|'error'='info')=>ctx.ui.notify(text,kind);
  const abortOwned=()=>{quiet.cancel();for(const controller of jobs)controller.abort();};
  const sessionKey=(ctx:ExtensionContext)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd,agentLife]);
  const sameSession=(ctx:ExtensionContext,key:string)=>!stopped&&activeKey===key&&sessionKey(ctx)===key;
  const isBusy=(ctx:any)=>ctx.isIdle?.()===false||ctx.hasPendingMessages?.()===true;
  const permittedConfig=async(ctx:ExtensionContext)=>authorizedConfig(await store.readConfig(),ctx.sessionManager?readSessionPolicy(ctx.sessionManager.getBranch()):null);
  const settingsSummary=async(ctx:ExtensionContext)=>{const config=await store.readConfig(),registry=await store.readRegistry(),defaults=controls?.defaultStatus==='ready'?controls.currentDefault().value:undefined,policy=typeof ctx.sessionManager?.getBranch==='function'?readSessionPolicy(ctx.sessionManager.getBranch()):null,authorized=!!authorizedConfig(config,policy)?.enabled,current=!!policy&&sessionEnabled(policy),agent=await agentPreference.read();return {config,registry,defaults,policy,agent,text:`通知方式：${registry.active??'未設定'}；新對話預設：${onOff(defaults)}\n當前對話：${policy?onOff(current):'尚未初始化'}；連線：${config?'已設定':'未設定'}／${authorized?'已授權':'未授權'}\n實際自動通知：${onOff(ctx.mode==='tui'&&authorized&&current)}（確定停止且閒置；固定事件；自動等待安靜，耗盡需人工恢復會通知）\n代理自訂通知介面：${onOff(agent.enabled)}；目前可發送：${onOff(agentPermitted({feature:agent,config,policy}))}（仍須本對話開啟及連線已授權；舊分支臨時同意不覆蓋通道停用，不改Goal）`};};
  const ensurePolicy=async(ctx:ExtensionContext)=>{
    const own=agentLife,key=sessionKey(ctx);await store.materializeLegacy();if(own!==agentLife||!sameSession(ctx,key))throw new Error('Session changed.');
    const branch=ctx.sessionManager.getBranch(),saved=readSessionPolicy(branch);
    if(saved)return saved;
    const defaultEnabled=controls.defaultForSession(ctx),config=await store.readConfig();
    if(own!==agentLife||!sameSession(ctx,key))throw new Error('Session changed.');
    // Re-read after awaits: never overwrite another command's already-persisted choice.
    const current=ctx.sessionManager.getBranch(),existing=readSessionPolicy(current);
    if(existing)return existing;
    const policy=initialSessionPolicy(current,defaultEnabled,config);
    pi.appendEntry(SESSION_POLICY_TYPE,policy);
    if(!readSessionPolicy(ctx.sessionManager.getBranch()))throw new Error('Session policy persistence unavailable.');
    return policy;
  };
  const dispatch=async(ctx:ExtensionContext,event:any,config:any,preDispatch?:()=>Promise<boolean>)=>{
    if(stopped)return;
    const controller=new AbortController();jobs.add(controller);
    const operation=deliver(store,config,event,{signal:controller.signal,preDispatch,resolver:deps.resolver,transport:deps.transport,clock:deps.clock});operations.add(operation);
    try {
      const result=await operation;
      if(result.state==='ACCEPTED')show(ctx,'Notify 端點已接受通知。');
      else if(!['SKIPPED','DUPLICATE_NO_RESEND'].includes(result.state))show(ctx,`Notify：${stateLabel(result.state)}；不會自動重試。請在 /notify 選單查看狀態。`,'warning');
    } catch(error:any) {
      const code=/^[A-Z_]{2,24}$/.test(error?.code??'')?error.code:'UNKNOWN';
      show(ctx,`Notify 收據或保存失敗（${code}）；請勿盲目重送，請在 /notify 選單查看狀態。`,'error');
    }
    finally {jobs.delete(controller);operations.delete(operation);}
  };
  const restore=async(_event:any,ctx:ExtensionContext)=>{
    const restoreLife=++agentLife;agentReady=false;activeKey=sessionKey(ctx);stopObserver();abortOwned();candidate=undefined;freshTerminal=undefined;runStarted=0;stopped=false;
    knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());runGoalControlled=false;controls.begin(ctx);
    if(ctx.mode==='tui')try {
      await controls.prepare(ctx);if(restoreLife!==agentLife||!sameSession(ctx,activeKey))return;
      await ensurePolicy(ctx);if(restoreLife!==agentLife||!sameSession(ctx,activeKey))return;agentReady=true;
      await controls.refresh(ctx);observedRevision=(await store.readRegistry()).revision;let leaf:any,goal:any,checking=false;const key=sessionKey(ctx);
      const own=setInterval(async()=>{if(checking)return;checking=true;try{
        if(observer!==own||!sameSession(ctx,key)){clearInterval(own);return;}
        const registry=await store.readRegistry();if(observer!==own||!sameSession(ctx,key))return;
        if(registry.revision!==observedRevision){observedRevision=registry.revision;abortOwned();candidate=undefined;freshTerminal=undefined;knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());await controls.refresh(ctx);if(observer!==own||!sameSession(ctx,key))return;}
        controls.sync(ctx);const current=ctx.sessionManager.getLeafId?.();
        if(!goal||current===undefined||current!==leaf){goal=readGoalPolicy(ctx.sessionManager.getBranch());leaf=current;}
        if(!isBusy(ctx)&&!quiet.pending&&!operations.size)queueGoalStop(ctx,goal);
      }catch{if(observer===own){abortOwned();stopObserver();}}finally{checking=false;}},deps.observerMs??1000);observer=own;observer.unref?.();
    }catch {show(ctx,'無法確認此對話的通知選擇；自動通知保持阻擋。','warning');}
    else try{await controls.prepare(ctx);if(restoreLife!==agentLife||!sameSession(ctx,activeKey))return;agentReady=!!readSessionPolicy(ctx.sessionManager.getBranch());}catch{agentReady=false;}
  };
  pi.on('session_start',restore);
  pi.on('session_tree',restore);
  pi.on('agent_start',(_event,ctx)=>{abortOwned();runStarted=Date.now();runIdentity=ctx.sessionManager.getBranch().at(-1)?.id??randomUUID();candidate=undefined;freshTerminal=undefined;
    const goal=readGoalPolicy(ctx.sessionManager.getBranch());runGoalControlled=goal.mode==='active'||goal.mode==='unknown';});
  pi.on('input',()=>{abortOwned();candidate=undefined;freshTerminal=undefined;});
  pi.on('turn_end',event=>{freshTerminal=runStarted?{entryId:event.messageEntryId,outcome:event.outcome}:undefined;});
  pi.on('agent_before_settle',(event,ctx)=>{
    const branch=ctx.sessionManager.getBranch(),goal=readGoalPolicy(branch);
    const last=branch.findLast((e:any)=>e.type==='message'&&e.message?.role==='assistant');
    let snapshot=settledSnapshot(branch,ctx.sessionManager.getSessionId(),event.outcome,ctx.sessionManager.getSessionFile()??ctx.cwd);
    // goal_complete may terminate a tool batch: a successful terminal Goal does
    // not require an additional assistant text message with stopReason=stop.
    if(!snapshot&&goal.mode!=='none'&&last)snapshot={terminalEntryId:last.id,outcome:event.outcome,sessionId:ctx.sessionManager.getSessionId()};
    candidate=snapshot&&freshTerminal?.entryId===snapshot.terminalEntryId&&freshTerminal.outcome===event.outcome&&(!ctx.signal?.aborted||event.outcome==='aborted')
      ?{...snapshot,normalSnapshot:!!settledSnapshot(branch,ctx.sessionManager.getSessionId(),event.outcome),
        sessionName:ctx.sessionManager.getSessionName(),cwd:ctx.cwd,stopReason:last?.message?.stopReason,elapsedMs:runStarted?Date.now()-runStarted:0,sessionKey:sessionKey(ctx)}:undefined;
  });
  const eligible=(ctx:ExtensionContext,event:any,epoch:number)=>{
    if(!quiet.current(epoch)||!sameSession(ctx,event.sessionKey)||(!event.goalTransition&&ctx.signal?.aborted&&event.outcome!=='aborted')||ctx.mode!=='tui'||ctx.isIdle()!==true||ctx.hasPendingMessages())return false;
    const branch=ctx.sessionManager.getBranch(),goal=readGoalPolicy(branch);
    const last=branch.findLast((e:any)=>e.type==='message'&&e.message?.role==='assistant');
    if(!event.goalTransition&&event.nativeAborted){if(branch.at(-1)?.id!==event.lastBranchId)return false;}else if(!event.goalTransition&&last?.id!==event.terminalEntryId)return false;
    if(event.goalTransition){if(!sameGoalTransition(goal,event.goalTransition))return false;}
    else if(goal.mode==='active'||goal.mode==='unknown'||
      (goal.mode==='terminal'&&!knownTransitions.has(goal.transitionId)))return false;
    const policy=readSessionPolicy(branch);return !!policy&&sessionEnabled(policy);
  };
  const queueGoalStop=(ctx:ExtensionContext,goal:any)=>{
    if(stopped||ctx.mode!=='tui'||goal?.mode!=='terminal'||knownTransitions.has(goal.transitionId)||isBusy(ctx))return;
    const key=sessionKey(ctx);
    quiet.schedule(async epoch=>{try{
      if(!sameSession(ctx,key)||!sameGoalTransition(readGoalPolicy(ctx.sessionManager.getBranch()),goal))return;
      const branch=ctx.sessionManager.getBranch(),policy=readSessionPolicy(branch);
      if(!policy||!sessionEnabled(policy))return;
      const event={sessionKey:key,sessionId:ctx.sessionManager.getSessionId(),sessionName:ctx.sessionManager.getSessionName(),cwd:ctx.cwd,elapsedMs:runStarted?Date.now()-runStarted:0,
        goalTransition:goal,goalId:goal.goalId,goalStatus:goal.status,outcome:goalOutcome(goal.status),
        id:notificationId(ctx.sessionManager.getSessionId(),`goal:${goal.goalId}:${goal.transitionId}`,goal.status,ctx.sessionManager.getSessionFile()??ctx.cwd)};
      if(!eligible(ctx,event,epoch))return;
      const config=await permittedConfig(ctx);if(!eligible(ctx,event,epoch))return;
      knownTransitions.add(goal.transitionId);
      if(!config?.enabled)return;
      const guard=async()=>{if(!eligible(ctx,event,epoch))return false;const fresh=await permittedConfig(ctx);return !!fresh?.enabled&&JSON.stringify(fresh)===JSON.stringify(config)&&eligible(ctx,event,epoch);};
      await dispatch(ctx,event,config,guard);
    }catch{if(!stopped&&quiet.current(epoch))show(ctx,'Goal 停止狀態或設定無法確認，未送通知。','warning');}});
  };
  pi.on('agent_settled',(settled,ctx)=>{
    const current=readGoalPolicy(ctx.sessionManager.getBranch());
    if(current.mode==='terminal'&&!knownTransitions.has(current.transitionId)){candidate=undefined;freshTerminal=undefined;queueGoalStop(ctx,current);return;}
    const raw=candidate??(settled.aborted&&runStarted?{outcome:'aborted',terminalEntryId:`native-aborted:${runIdentity}`,normalSnapshot:false,nativeAborted:true,lastBranchId:ctx.sessionManager.getBranch().at(-1)?.id,sessionId:ctx.sessionManager.getSessionId(),sessionName:ctx.sessionManager.getSessionName(),sessionKey:sessionKey(ctx)}:undefined);candidate=undefined;freshTerminal=undefined;
    if(!raw||stopped||ctx.signal?.aborted&&raw.outcome!=='aborted'||ctx.mode!=='tui')return;
    try {
      const branch=ctx.sessionManager.getBranch(),initialGoal=readGoalPolicy(branch);
      if(initialGoal.mode==='unknown')return;
      const controlled=runGoalControlled;
      const policy=readSessionPolicy(branch);if(!policy||!sessionEnabled(policy))return;
      // Do not await the debounce or POST in agent_settled: Goal is allowed to
      // schedule follow-up work from this very same notification-only boundary.
      quiet.schedule(async epoch=>{
        try {
          if(!quiet.current(epoch)||!sameSession(ctx,raw.sessionKey))return;
          // Read after all settled handlers, regardless of extension load order.
          const goal=readGoalPolicy(ctx.sessionManager.getBranch());
          if(goal.mode==='active'||goal.mode==='unknown')return; // waits/retries stay quiet indefinitely
          let event=raw;
          if(goal.mode==='terminal'&&!knownTransitions.has(goal.transitionId)) {
            if(initialGoal.goalId&&initialGoal.goalId!==goal.goalId)return;
            knownTransitions.add(goal.transitionId);
            event={...raw,goalTransition:goal,goalId:goal.goalId,goalStatus:goal.status,outcome:goalOutcome(goal.status),
              id:notificationId(raw.sessionId,`goal:${goal.goalId}:${goal.transitionId}`,goal.status,ctx.sessionManager.getSessionFile()??ctx.cwd)};
          } else {
            if(!raw.nativeAborted&&(controlled||!raw.normalSnapshot))return; // pause/clear are not completion
            event={...raw,id:notificationId(raw.sessionId,raw.terminalEntryId,raw.outcome,ctx.sessionManager.getSessionFile()??ctx.cwd)};
          }
          if(!eligible(ctx,event,epoch))return;
          const config=await permittedConfig(ctx);
          if(!config?.enabled||!eligible(ctx,event,epoch))return;
          const guard=async()=>{
            if(!eligible(ctx,event,epoch))return false;
            const current=await permittedConfig(ctx);
            return !!current?.enabled&&JSON.stringify(current)===JSON.stringify(config)&&eligible(ctx,event,epoch);
          };
          await dispatch(ctx,event,config,guard);
        }catch {if(quiet.current(epoch)&&!stopped)show(ctx,'Notify 設定、Goal 狀態或對話選擇無法確認；未送出通知。','warning');}
      });
    }catch {show(ctx,'Notify 設定或對話選擇無效；未送出通知。','error');}
  });
  pi.on('session_shutdown',async()=>{controls.dispose();stopObserver();
    stopped=true;agentReady=false;agentLife++;activeKey='';candidate=undefined;freshTerminal=undefined;const pending=quiet.work;abortOwned();await Promise.allSettled([...operations,...(pending?[pending]:[])]);
  });

  pi.registerTool({name:AGENT_TOOL,label:'通知',description:'Send a proactive plaintext notification through this conversation\'s existing configured, explicitly authorized and enabled channel. Only title/body are accepted. Interface defaults On but cannot override any channel/session/feature Off or grant authorization. No credentials, destination, config, history, prompt or raw errors are returned/attached. No repeated confirmation for an already-authorized normal send. ACCEPTED means endpoint acceptance, never human read or Goal completion. Exact same content is conservatively deduplicated for this session/destination even after acceptance. UNKNOWN must NOT be retried, rephrased, given a new ID or sent through curl/another channel. Rate limiting does not pause Goal.',promptSnippet:'Send an authorized, non-sensitive progress notification; UNKNOWN never permits resend',promptGuidelines:['Use only for a brief relevant notification within the already entrusted task, never to expand external authorization.','Do not include credentials, personal data, destinations, raw model errors, prompts, conversation text or files. Title <=160 UTF8 bytes; body <=2048 bytes; escaped wire <=4096 bytes.','Treat UNKNOWN as a durable hold: never change ID, paraphrase, change channel or use curl to retry. RATE_LIMITED is not permission to spam or start a retry loop.','Notification acceptance is not recipient read or evidence that the Goal is complete. Never modify Goal/progress based solely on notification delivery.'],executionMode:'sequential',parameters:Type.Object({title:Type.String({minLength:1,maxLength:160}),body:Type.String({minLength:1,maxLength:2048})}),async execute(callId:any,p:any,signal:any,_onUpdate:any,ctx:any){if(!agentReady||stopped)return{content:[{type:'text',text:'代理通知尚未初始化或已停止，未送出。'}],details:{state:'SKIPPED_DISABLED'}};const own=agentLife,key=sessionKey(ctx),controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();jobs.add(controller);const notifier=createAgentNotifier({store,readPermission:async()=>({feature:await agentPreference.read(),config:await store.readConfig(),policy:readSessionPolicy(ctx.sessionManager.getBranch())}),resolver:deps.resolver,transport:deps.transport,now:deps.now,timeoutMs:deps.timeoutMs});const operation=notifier.send(p,{requestId:callId,sessionId:ctx.sessionManager.getSessionId(),namespace:ctx.sessionManager.getSessionFile()??ctx.cwd,signal:controller.signal,valid:()=>agentReady&&own===agentLife&&sameSession(ctx,key)});operations.add(operation);try{const result=await operation;return{content:[{type:'text',text:JSON.stringify(result)}],details:result};}finally{jobs.delete(controller);operations.delete(operation);signal?.removeEventListener('abort',abort);}},renderCall:(_p:any,theme:any)=>new Text(theme.fg('toolTitle','通知'),0,0),renderResult:(r:any,_o:any,theme:any)=>new Text(theme.fg(r.details?.state==='ACCEPTED'?'muted':'warning',r.details?.state==='ACCEPTED'?'通知端點已接受（不代表已讀）':r.details?.state==='UNKNOWN'?'通知結果 UNKNOWN，禁止重送':`通知：${r.details?.state??'UNKNOWN'}`),0,0)});

  const usage='/notify：中文主選單；本對話開關、通知方式／設定、新對話預設、狀態、明確測試與清除；/notify json 只讀狀態。固定停止事件，秘密只能在遮蔽視窗輸入。';
  const providerLabels={telegram:'Telegram Bot',discord:'Discord',slack:'Slack',generic:'一般 Webhook'};
  const invalidate=(ctx:ExtensionContext)=>{abortOwned();candidate=undefined;freshTerminal=undefined;knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());};
  const setupProvider=async(ctx:ExtensionContext,selected?:string,valid=()=>true)=>{
    if(!valid()||ctx.mode!=='tui'||isBusy(ctx)){show(ctx,'連線設定需要閒置 TUI；不會中斷執行中的工作。','warning');return;}
    const scope=sessionKey(ctx),summary=await settingsSummary(ctx);if(!valid())return;
    let format=selected??summary.registry.active;
    if(!format){const labels=PROVIDERS.map(f=>providerLabels[f]);const picked=await ctx.ui.select('設定通知方式（一次只啟用一種）',labels);format=PROVIDERS[labels.indexOf(picked??'')];}
    if(!format)return;
    let profile:any;
    if(format==='telegram'){
      const token=await maskedInput(ctx,'Telegram Bot Token（遮蔽）');if(token===undefined||!valid())return;
      const chatId=await maskedInput(ctx,'Telegram Chat ID（遮蔽；私聊先 /start，群組需加入 Bot）');if(chatId===undefined||!valid())return;
      profile=validateProfile(format,{authorized:true,token:token.trim(),chatId:chatId.trim()});
      await resolveDestination(new URL('https://api.telegram.org/'),deps.resolver);
    }else{
      const endpoint=await maskedInput(ctx,'公開 HTTPS Webhook 網址（遮蔽）');if(endpoint===undefined||!valid())return;
      const url=validateEndpoint(endpoint.trim());await resolveDestination(url,deps.resolver);
      const key=format==='discord'?'':await maskedInput(ctx,'Bearer 金鑰（遮蔽；非必填）');if(key===undefined||!valid())return;
      profile=validateProfile(format,{authorized:true,url:url.href,key});
    }
    if(!valid()||!await ctx.ui.confirm('授權並選用通知方式？',`選用 ${providerLabels[format]} 傳送對話名稱與必要停止資訊；代理自訂摘要另受介面與本對話開關控制，不改Goal？其他方式設定保留，不自動測試、不改對話／新對話開關。`))return;
    if(!valid()||!sameSession(ctx,scope)||isBusy(ctx))return;
    const saved=await store.saveProfile(format,profile,summary.registry.revision);observedRevision=saved.revision;invalidate(ctx);
    show(ctx,'通知方式已設定並授權；一次只使用此方式。當前對話開關與明確測試請在 /notify 選單操作，不補送歷史事件。');
  };
  const chooseProvider=async(ctx:ExtensionContext,valid=()=>true)=>{
    if(!valid()||ctx.mode!=='tui')return;
    const scope=sessionKey(ctx),r=await store.readRegistry(),labels=PROVIDERS.map(f=>`${providerLabels[f]}（${r.active===f?'目前使用':r.profiles[f]?'已保存設定':'未設定'}）`);
    if(!valid())return;const picked=await ctx.ui.select('切換通知方式',labels);if(!picked||!valid()||!sameSession(ctx,scope))return;
    const format=PROVIDERS[labels.indexOf(picked)];if(!format)return;
    if(r.active===format){show(ctx,'已是目前方式，未變更或發送。');return;}
    if(!r.profiles[format]?.authorized){await setupProvider(ctx,format,valid);return;}
    if(!valid()||!await ctx.ui.confirm('切換通知方式？',`改用 ${providerLabels[format]}；保留其他設定與對話開關，不測試、不補送、不轉送舊候選。`))return;
    if(!valid()||!sameSession(ctx,scope))return;
    const saved=await store.select(format,r.revision);observedRevision=saved.revision;invalidate(ctx);show(ctx,`已切換 ${providerLabels[format]}。未提交通知已取消；已提交 HTTP 無法保證撤回。`);
  };
  const handler=(command:string,valid=()=>true,expectedConfig?:string)=>async(args:string,ctx:ExtensionContext)=>{
    if(!valid())return;const text=args.trim().toLowerCase();
    if(text&&!(command==='default'&&['on','off'].includes(text))&&!(command==='status'&&text==='json')){show(ctx,usage,'warning');return;}
    try{
      if(command==='setup'){await setupProvider(ctx,undefined,valid);return;}
      if(command==='status'){
        await controls.prepare(ctx);if(!valid())return;const s=await settingsSummary(ctx),receipts=await store.recent();
        const status={loaded_version:VERSION,configured:!!s.config,provider:s.registry.active,stored_providers:Object.keys(s.registry.profiles),endpoint_authorized:!!authorizedConfig(s.config,s.policy)?.enabled,default_enabled:s.defaults,session_policy:s.policy,automatic_mode_supported:ctx.mode==='tui',effective_automatic_enabled:ctx.mode==='tui'&&!!authorizedConfig(s.config,s.policy)?.enabled&&!!s.policy&&sessionEnabled(s.policy),endpoint_host:s.config?new URL(s.config.url).hostname:'not set',credentials:'hidden',agent_interface_enabled:s.agent.enabled,effective_agent_enabled:agentPermitted({feature:s.agent,config:s.config,policy:s.policy}),agent_tool:AGENT_TOOL,agent_limits:AGENT_LIMITS,fixed_events:['completed','error','aborted',...DEFAULT_GOAL_NOTIFY],goal_policy:ctx.sessionManager?readGoalPolicy(ctx.sessionManager.getBranch()):{mode:'none'},quiet_ms:QUIET_MS,automatic_pending:quiet.pending||operations.size>0,receipts:receipts.map((x:any)=>({id:x.notification_id,state:x.state,http_status:x.http_status,status:x.status,test:x.test,started_at:x.started_at}))};
        show(ctx,text==='json'?JSON.stringify(status,null,2):`Notify ${VERSION}\n${s.text}\n停止事件固定；一般等待／自動重試不通知，重試耗盡需手動恢復會通知。連線與金鑰不回顯。`);return;
      }
      if(command==='default'){
        await controls.prepare(ctx);if(!valid())return;const previous=controls.currentDefault();let choice=text;
        if(!choice&&ctx.mode!=='tui'){show(ctx,`新對話預設：${onOff(previous.value)}`);return;}
        const registry=controls.registry,token=registry.begin(ctx,'webhook','enabled-default');
        if(!choice){const picked=await ctx.ui.select(`新對話預設（目前：${onOff(previous.value)}；既有對話不變）`,['開啟','關閉']);choice=picked==='開啟'?'on':picked==='關閉'?'off':'';if(!choice||!valid()){registry.cancel(token);return;}}
        registry.draft(token,choice==='on');const result=await registry.apply(token);show(ctx,['applied','unchanged'].includes(result.status)?`通知新預設已確認：${onOff(choice==='on')}；不改既有對話、原default檔或通道授權。`:'新預設結果／時間界線未驗；只可觀察或確認已保存時間，不重送原操作。',['applied','unchanged'].includes(result.status)?'info':'warning');return;
      }
      if(command==='on'||command==='off'){
        const scope=sessionKey(ctx),previous=(command==='off'?readSessionPolicy(ctx.sessionManager.getBranch()):null)??await ensurePolicy(ctx);if(!valid())return;let config=command==='on'?await store.readConfig():null,consent=previous.authorizedEndpoint;
        if(command==='on'){
          if(expectedConfig&&createHash('sha256').update(JSON.stringify(config)).digest('hex')!==expectedConfig)return;
          if(!config){show(ctx,'尚未設定通知方式；請先在 /notify 選單設定，當前對話未開啟。','warning');return;}
          if(!authorizedConfig(config,previous)?.enabled){
            if(ctx.mode!=='tui'||isBusy(ctx)){show(ctx,'舊通知原本被阻擋；需閒置後在 /notify 選單開啟本對話並明確確認，或重新設定方式。工作不會中斷。','warning');return;}
            if(!valid()||!await ctx.ui.confirm('允許此對話使用原通知連線？','原設定曾關閉通知。只授權當前分支，不更改其他對話或已保存連線，不發測試。'))return;
            if(!valid()||!sameSession(ctx,scope)||isBusy(ctx)||JSON.stringify(config)!==JSON.stringify(await store.readConfig()))return;
            consent=profileFingerprint(config);
          }
        }
        if(!valid()||!sameSession(ctx,scope)||JSON.stringify(readSessionPolicy(ctx.sessionManager.getBranch()))!==JSON.stringify(previous))return;
        if(previous.mode===command&&consent===previous.authorizedEndpoint){show(ctx,'已是目前對話選擇，未寫入。');return;}
        invalidate(ctx);pi.appendEntry(SESSION_POLICY_TYPE,{version:3,mode:command,origin:'explicit',defaultEnabled:previous.defaultEnabled,authorizedEndpoint:consent});
        const committed=readSessionPolicy(ctx.sessionManager.getBranch());if(committed?.mode!==command)throw new Error('Choice not saved.');
        await controls.refresh(ctx);if(sameSession(ctx,scope))show(ctx,command==='on'?'當前對話通知已開啟；模型與工具繼續執行，不補送歷史。':'當前對話通知已關閉；模型與工具繼續執行，已提交 HTTP 無法保證撤回。');return committed;
      }
      if(command==='clear'){
        if(ctx.mode!=='tui'||isBusy(ctx)){show(ctx,'清除需要閒置及互動確認；未更改。','warning');return;}
        const scope=sessionKey(ctx),r=await store.readRegistry();if(!r.active){show(ctx,'目前沒有啟用通知方式。');return;}
        if(!valid()||!await ctx.ui.confirm('清除目前通知方式的連線資料？',`只清除 ${providerLabels[r.active]}；保留其他方式設定、新對話預設、對話選擇與防重送收據。`))return;
        if(!valid()||!sameSession(ctx,scope)||isBusy(ctx))return;const saved=await store.clearSelected(r.revision);observedRevision=saved.revision;invalidate(ctx);show(ctx,'目前方式已清除；其他方式、偏好與收據保留。');return;
      }
      if(command==='test'){
        if(ctx.mode!=='tui'||isBusy(ctx)||!valid()){show(ctx,'明確通知測試需要閒置TUI與獨立確認，未送出。','warning');return;}
        const testScope=sessionKey(ctx);if(!await ctx.ui.confirm('明確送出一則通知測試？','這會使用目前已授權通道送出測試，不代表已讀，也不修改Goal或重送未知收據。'))return;if(!valid()||!sameSession(ctx,testScope)||isBusy(ctx))return;
        await ensurePolicy(ctx);const scope=sessionKey(ctx),config=await permittedConfig(ctx);if(!config?.enabled){show(ctx,'通知連線未設定／授權；請先閒置在 /notify 選單明確確認開啟本對話或設定方式。','warning');return;}
        await dispatch(ctx,{id:notificationId(ctx.sessionManager.getSessionId(),`explicit-test:${randomUUID()}`,'completed'),sessionId:ctx.sessionManager.getSessionId(),sessionName:ctx.sessionManager.getSessionName(),outcome:'completed',test:true},config,async()=>valid()&&sameSession(ctx,scope)&&JSON.stringify(await permittedConfig(ctx))===JSON.stringify(config));
      }
    }catch{show(ctx,'Notify 未成功執行；請檢查設定、對話、公開 HTTPS 與保存權限。未記錄秘密內容。','error');}
  };
  const nativeMenu=async(ctx:ExtensionContext,valid=()=>true)=>{
    if(!valid()||ctx.mode!=='tui'||isBusy(ctx))return;
    try{const scope=sessionKey(ctx),s=await settingsSummary(ctx),labels=[`切換通知方式（目前：${s.registry.active??'未設定'}）`,'設定目前方式（遮蔽輸入／授權確認）','只讀狀態','明確送出測試（獨立確認）','清除目前方式（獨立確認）','返回'];
      const picked=await ctx.ui.select(`通知方式與授權\n${s.text}`,labels);if(!picked||!valid()||!sameSession(ctx,scope))return;const index=labels.indexOf(picked);
      if(index===0)return chooseProvider(ctx,valid);if(index===1)return setupProvider(ctx,undefined,valid);if(index===2)return controls.open(ctx,'status');if(index===3)return handler('test',valid)('',ctx);if(index===4)return handler('clear',valid)('',ctx);
    }catch{show(ctx,'通知狀態／範圍未驗，未變更或測試。','warning');}
  };
  controls=installNotifyControls(raw,{ui,store,agentPreference,clock:deps.controlClock??Date.now,setCurrent:(ctx:any,value:boolean,valid:any,expectedConfig?:string)=>handler(value?'on':'off',valid,expectedConfig)('',ctx),onInterfaceChanged:invalidate,nativeAction:(ctx:any,id:string,valid:any)=>id==='notify-settings'?nativeMenu(ctx,valid):handler(id==='notify-test'?'test':'clear',valid)('',ctx)});
  pi.registerCommand('notify',{description:'同 /peicd100 通知頁；原生對話／新預設／代理介面分開；授權與測試獨立確認',handler:async(args,ctx)=>{
    if(args.trim()==='json'){await handler('status')('json',ctx);return;}if(args.trim()){show(ctx,usage,'warning');return;}
    if(ctx.mode!=='tui'){await handler('status')('',ctx);return;}
    await controls.prepare(ctx);return ui.showControlCenterFor(raw,ctx,'notify');
  }});
  for(const command of ['setup','on','off','default','status','test','clear'])pi.registerCommand(`notify-${command}`,{description:({setup:'遮蔽設定目前通知方式',on:'當前對話開（已授權可執行中切換）',off:'當前對話關（不中斷工作）',default:'新對話通知預設',status:'查看通知狀態',test:'明確真實通知測試',clear:'確認清除目前方式連線'}[command])+'；秘密不可放指令參數',handler:handler(command)});
  return{controls,store,agentPreference};
}
