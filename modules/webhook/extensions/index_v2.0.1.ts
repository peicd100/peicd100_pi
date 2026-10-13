import {namespaceAPI} from '../../../src/commands_v0.7.0.mjs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { VERSION, Store, validateEndpoint, resolveDestination, deliver, notificationId, settledSnapshot, DEFAULT_GOAL_NOTIFY, PROVIDERS, profileFingerprint, validateProfile } from '../src/core_v2.0.1.mjs';
import { SESSION_POLICY_TYPE, readSessionPolicy, initialSessionPolicy, sessionEnabled, authorizedConfig } from '../src/session-policy_v2.0.0.mjs';
import { maskedInput } from '../src/secret-ui.ts';

const onOff=(v:boolean)=>v?'開啟':'關閉';
const stateLabel=(s:string)=>({ACCEPTED:'已接受',API_REJECTED:'API 拒絕',HTTP_REJECTED:'HTTP 拒絕',UNKNOWN:'送達未知',FAILED_PRECHECK:'未送出'}[s]??'狀態未知');
import { readGoalPolicy, goalOutcome, sameGoalTransition, terminalTransitions } from '../src/goal-policy_v2.0.1.mjs';
import { QuietGate, QUIET_MS } from '../src/quiet-gate_v1.2.0.mjs';

export default function notifyNotifier(pi: ExtensionAPI) {
 pi=namespaceAPI(pi);
  const store=new Store(join(getAgentDir(),'config','webhook-notifier'));
  let candidate:any, freshTerminal:any, runStarted=0, runIdentity='', observedRevision='', stopped=false, runGoalControlled=false;
  const quiet=new QuietGate();let knownTransitions=new Set<string>();
  let observer:ReturnType<typeof setInterval>|undefined;
  const stopObserver=()=>{if(observer!==undefined)clearInterval(observer);observer=undefined;};
  const jobs=new Set<AbortController>(),operations=new Set<Promise<any>>();
  const show=(ctx:ExtensionContext,text:string,kind:'info'|'warning'|'error'='info')=>ctx.ui.notify(text,kind);
  const abortOwned=()=>{quiet.cancel();for(const controller of jobs)controller.abort();};
  const sessionKey=(ctx:ExtensionContext)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd]);
  const sameSession=(ctx:ExtensionContext,key:string)=>!stopped&&sessionKey(ctx)===key;
  const isBusy=(ctx:any)=>ctx.isIdle?.()===false||ctx.hasPendingMessages?.()===true;
  const permittedConfig=async(ctx:ExtensionContext)=>authorizedConfig(await store.readConfig(),ctx.sessionManager?readSessionPolicy(ctx.sessionManager.getBranch()):null);
  const settingsSummary=async(ctx:ExtensionContext)=>{const config=await store.readConfig(),registry=await store.readRegistry(),defaults=await store.readDefault(),policy=typeof ctx.sessionManager?.getBranch==='function'?readSessionPolicy(ctx.sessionManager.getBranch()):null,authorized=!!authorizedConfig(config,policy)?.enabled,current=!!policy&&sessionEnabled(policy);return {config,registry,defaults,policy,text:`通知方式：${registry.active??'未設定'}；新對話預設：${onOff(defaults)}\n當前對話：${policy?onOff(current):'尚未初始化'}；連線：${config?'已設定':'未設定'}／${authorized?'已授權':'未授權'}\n實際自動通知：${onOff(ctx.mode==='tui'&&authorized&&current)}（確定停止且閒置；固定事件；自動等待安靜，耗盡需人工恢復會通知）`};};
  const ensurePolicy=async(ctx:ExtensionContext)=>{
    await store.materializeLegacy();
    const key=sessionKey(ctx),branch=ctx.sessionManager.getBranch(),saved=readSessionPolicy(branch);
    if(saved)return saved;
    const defaultEnabled=await store.readDefault(),config=await store.readConfig();
    if(!sameSession(ctx,key))throw new Error('Session changed.');
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
    const operation=deliver(store,config,event,{signal:controller.signal,preDispatch});operations.add(operation);
    try {
      const result=await operation;
      if(result.state==='ACCEPTED')show(ctx,'Notify 端點已接受通知。');
      else if(!['SKIPPED','DUPLICATE_NO_RESEND'].includes(result.state))show(ctx,`Notify：${stateLabel(result.state)}；不會自動重試。請查看 /notify-status。`,'warning');
    } catch(error:any) {
      const code=/^[A-Z_]{2,24}$/.test(error?.code??'')?error.code:'UNKNOWN';
      show(ctx,`Notify 收據或保存失敗（${code}）；請勿盲目重送，請查看 /notify-status。`,'error');
    }
    finally {jobs.delete(controller);operations.delete(operation);}
  };
  const restore=async(_event:any,ctx:ExtensionContext)=>{
    stopObserver();abortOwned();candidate=undefined;freshTerminal=undefined;runStarted=0;stopped=false;
    knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());runGoalControlled=false;
    if(ctx.mode==='tui')try {
      await ensurePolicy(ctx);
      observedRevision=(await store.readRegistry()).revision;let leaf:any,goal:any,checking=false;const key=sessionKey(ctx);
      const own=setInterval(async()=>{if(checking)return;checking=true;try{
        if(observer!==own||!sameSession(ctx,key)){clearInterval(own);return;}
        const registry=await store.readRegistry();if(observer!==own||!sameSession(ctx,key))return;
        if(registry.revision!==observedRevision){observedRevision=registry.revision;abortOwned();candidate=undefined;freshTerminal=undefined;knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());}
        const current=ctx.sessionManager.getLeafId?.();
        if(!goal||current===undefined||current!==leaf){goal=readGoalPolicy(ctx.sessionManager.getBranch());leaf=current;}
        if(!isBusy(ctx)&&!quiet.pending&&!operations.size)queueGoalStop(ctx,goal);
      }catch{if(observer===own){abortOwned();stopObserver();}}finally{checking=false;}},1000);observer=own;observer.unref?.();
    }catch {show(ctx,'無法確認此對話的通知選擇；自動通知保持阻擋。','warning');}
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
  pi.on('session_shutdown',async()=>{stopObserver();
    stopped=true;candidate=undefined;freshTerminal=undefined;const pending=quiet.work;abortOwned();await Promise.allSettled([...operations,...(pending?[pending]:[])]);
  });

  const usage='/notify：主選單／切換方式；/notify-default [on|off] 新對話預設；/notify-on、/notify-off 當前對話；/notify-setup 設定；/notify-status [json] 狀態；/notify-test 明確測試；/notify-clear 清除目前方式。固定停止事件，秘密只能在遮蔽視窗輸入。';
  const providerLabels={telegram:'Telegram Bot',discord:'Discord',slack:'Slack',generic:'一般 Webhook'};
  const invalidate=(ctx:ExtensionContext)=>{abortOwned();candidate=undefined;freshTerminal=undefined;knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());};
  const setupProvider=async(ctx:ExtensionContext,selected?:string)=>{
    if(ctx.mode!=='tui'||isBusy(ctx)){show(ctx,'連線設定需要閒置 TUI；不會中斷執行中的工作。','warning');return;}
    const scope=sessionKey(ctx),summary=await settingsSummary(ctx);
    let format=selected??summary.registry.active;
    if(!format){const labels=PROVIDERS.map(f=>providerLabels[f]);const picked=await ctx.ui.select('設定通知方式（一次只啟用一種）',labels);format=PROVIDERS[labels.indexOf(picked??'')];}
    if(!format)return;
    let profile:any;
    if(format==='telegram'){
      const token=await maskedInput(ctx,'Telegram Bot Token（遮蔽）');if(token===undefined)return;
      const chatId=await maskedInput(ctx,'Telegram Chat ID（遮蔽；私聊先 /start，群組需加入 Bot）');if(chatId===undefined)return;
      profile=validateProfile(format,{authorized:true,token:token.trim(),chatId:chatId.trim()});
      await resolveDestination(new URL('https://api.telegram.org/'));
    }else{
      const endpoint=await maskedInput(ctx,'公開 HTTPS Webhook 網址（遮蔽）');if(endpoint===undefined)return;
      const url=validateEndpoint(endpoint.trim());await resolveDestination(url);
      const key=format==='discord'?'':await maskedInput(ctx,'Bearer 金鑰（遮蔽；非必填）');if(key===undefined)return;
      profile=validateProfile(format,{authorized:true,url:url.href,key});
    }
    if(!await ctx.ui.confirm('授權並選用通知方式？',`選用 ${providerLabels[format]} 傳送對話名稱與必要停止資訊？其他方式設定保留，不自動測試、不改對話／新對話開關。`))return;
    if(!sameSession(ctx,scope)||isBusy(ctx))return;
    const saved=await store.saveProfile(format,profile,summary.registry.revision);observedRevision=saved.revision;invalidate(ctx);
    show(ctx,'通知方式已設定並授權；一次只使用此方式。當前對話請 /notify-on；測試須明確 /notify-test，不補送歷史事件。');
  };
  const chooseProvider=async(ctx:ExtensionContext)=>{
    if(ctx.mode!=='tui')return;
    const scope=sessionKey(ctx),r=await store.readRegistry(),labels=PROVIDERS.map(f=>`${providerLabels[f]}（${r.active===f?'目前使用':r.profiles[f]?'已保存設定':'未設定'}）`);
    const picked=await ctx.ui.select('切換通知方式',labels);if(!picked||!sameSession(ctx,scope))return;
    const format=PROVIDERS[labels.indexOf(picked)];if(!format)return;
    if(r.active===format){show(ctx,'已是目前方式，未變更或發送。');return;}
    if(!r.profiles[format]?.authorized){await setupProvider(ctx,format);return;}
    if(!await ctx.ui.confirm('切換通知方式？',`改用 ${providerLabels[format]}；保留其他設定與對話開關，不測試、不補送、不轉送舊候選。`))return;
    if(!sameSession(ctx,scope))return;
    const saved=await store.select(format,r.revision);observedRevision=saved.revision;invalidate(ctx);show(ctx,`已切換 ${providerLabels[format]}。未提交通知已取消；已提交 HTTP 無法保證撤回。`);
  };
  const handler=(command:string)=>async(args:string,ctx:ExtensionContext)=>{
    const text=args.trim().toLowerCase();
    if(text&&!(command==='default'&&['on','off'].includes(text))&&!(command==='status'&&text==='json')){show(ctx,usage,'warning');return;}
    try{
      if(command==='setup'){await setupProvider(ctx);return;}
      if(command==='status'){
        const s=await settingsSummary(ctx),receipts=await store.recent();
        const status={loaded_version:VERSION,configured:!!s.config,provider:s.registry.active,stored_providers:Object.keys(s.registry.profiles),endpoint_authorized:!!authorizedConfig(s.config,s.policy)?.enabled,default_enabled:s.defaults,session_policy:s.policy,automatic_mode_supported:ctx.mode==='tui',effective_automatic_enabled:ctx.mode==='tui'&&!!authorizedConfig(s.config,s.policy)?.enabled&&!!s.policy&&sessionEnabled(s.policy),endpoint_host:s.config?new URL(s.config.url).hostname:'not set',credentials:'hidden',fixed_events:['completed','error','aborted',...DEFAULT_GOAL_NOTIFY],goal_policy:ctx.sessionManager?readGoalPolicy(ctx.sessionManager.getBranch()):{mode:'none'},quiet_ms:QUIET_MS,automatic_pending:quiet.pending||operations.size>0,receipts:receipts.map((x:any)=>({id:x.notification_id,state:x.state,http_status:x.http_status,status:x.status,test:x.test,started_at:x.started_at}))};
        show(ctx,text==='json'?JSON.stringify(status,null,2):`Notify ${VERSION}\n${s.text}\n停止事件固定；一般等待／自動重試不通知，重試耗盡需手動恢復會通知。連線與金鑰不回顯。`);return;
      }
      if(command==='default'){
        const scope=ctx.sessionManager?sessionKey(ctx):undefined,previous=await store.readDefault();let choice=text;
        if(!choice){if(ctx.mode!=='tui'){show(ctx,`新對話預設：${onOff(previous)}`);return;}const picked=await ctx.ui.select(`新對話預設（目前：${onOff(previous)}；既有對話不變）`,['開啟','關閉']);if(!picked)return;choice=picked==='開啟'?'on':picked==='關閉'?'off':'';if(!choice)return;}
        if(scope!==undefined&&!sameSession(ctx,scope))return;
        if(previous===(choice==='on')){show(ctx,'維持相同預設，未寫入。');return;}
        await store.writeDefault(choice==='on',previous);show(ctx,`新對話預設已保存：${onOff(choice==='on')}；既有對話不變。`);return;
      }
      if(command==='on'||command==='off'){
        const scope=sessionKey(ctx),previous=await ensurePolicy(ctx);let config=await store.readConfig(),consent=previous.authorizedEndpoint;
        if(command==='on'){
          if(!config){show(ctx,'尚未設定通知方式；請先 /notify-setup，當前對話未開啟。','warning');return;}
          if(!authorizedConfig(config,previous)?.enabled){
            if(ctx.mode!=='tui'||isBusy(ctx)){show(ctx,'舊通知原本被阻擋；需閒置後 /notify-on 明確確認，或重新 /notify-setup。工作不會中斷。','warning');return;}
            if(!await ctx.ui.confirm('允許此對話使用原通知連線？','原設定曾關閉通知。只授權當前分支，不更改其他對話或已保存連線，不發測試。'))return;
            if(!sameSession(ctx,scope)||isBusy(ctx)||JSON.stringify(config)!==JSON.stringify(await store.readConfig()))return;
            consent=profileFingerprint(config);
          }
        }
        if(!sameSession(ctx,scope)||JSON.stringify(readSessionPolicy(ctx.sessionManager.getBranch()))!==JSON.stringify(previous))return;
        if(previous.mode===command&&consent===previous.authorizedEndpoint){show(ctx,'已是目前對話選擇，未寫入。');return;}
        invalidate(ctx);pi.appendEntry(SESSION_POLICY_TYPE,{version:3,mode:command,origin:'explicit',defaultEnabled:previous.defaultEnabled,authorizedEndpoint:consent});
        if(readSessionPolicy(ctx.sessionManager.getBranch())?.mode!==command)throw new Error('Choice not saved.');
        show(ctx,command==='on'?'當前對話通知已開啟；模型與工具繼續執行，不補送歷史。':'當前對話通知已關閉；模型與工具繼續執行，已提交 HTTP 無法保證撤回。');return;
      }
      if(command==='clear'){
        if(ctx.mode!=='tui'||isBusy(ctx)){show(ctx,'清除需要閒置及互動確認；未更改。','warning');return;}
        const scope=sessionKey(ctx),r=await store.readRegistry();if(!r.active){show(ctx,'目前沒有啟用通知方式。');return;}
        if(!await ctx.ui.confirm('清除目前通知方式的連線資料？',`只清除 ${providerLabels[r.active]}；保留其他方式設定、新對話預設、對話選擇與防重送收據。`))return;
        if(!sameSession(ctx,scope)||isBusy(ctx))return;const saved=await store.clearSelected(r.revision);observedRevision=saved.revision;invalidate(ctx);show(ctx,'目前方式已清除；其他方式、偏好與收據保留。');return;
      }
      if(command==='test'){
        await ensurePolicy(ctx);const scope=sessionKey(ctx),config=await permittedConfig(ctx);if(!config?.enabled){show(ctx,'通知連線未設定／授權；請先閒置明確確認 /notify-on 或 /notify-setup。','warning');return;}
        await dispatch(ctx,{id:notificationId(ctx.sessionManager.getSessionId(),`explicit-test:${randomUUID()}`,'completed'),sessionId:ctx.sessionManager.getSessionId(),sessionName:ctx.sessionManager.getSessionName(),outcome:'completed',test:true},config,async()=>sameSession(ctx,scope)&&JSON.stringify(await permittedConfig(ctx))===JSON.stringify(config));
      }
    }catch{show(ctx,'Notify 未成功執行；請檢查設定、對話、公開 HTTPS 與保存權限。未記錄秘密內容。','error');}
  };
  pi.registerCommand('notify',{description:'通知主選單／切換單一方式；固定停止事件，無全域或事件選單',handler:async(args,ctx)=>{
    if(args.trim()||ctx.mode!=='tui'){show(ctx,usage);return;}
    try{const scope=sessionKey(ctx),s=await settingsSummary(ctx),labels=[`切換通知方式（目前：${s.registry.active??'未設定'}）`,'設定目前通知方式',`當前對話開（目前：${s.policy?onOff(sessionEnabled(s.policy)):'未初始化'}）`,`當前對話關（目前：${s.policy?onOff(sessionEnabled(s.policy)):'未初始化'}）`,`新對話預設（目前：${onOff(s.defaults)}）`,'查看狀態','明確送出測試','清除目前方式'];
      const picked=await ctx.ui.select(`Notify 設定\n${s.text}`,labels);if(!picked||!sameSession(ctx,scope))return;const index=labels.indexOf(picked);if(index===0){await chooseProvider(ctx);return;}const command=['','setup','on','off','default','status','test','clear'][index];if(command)await handler(command)('',ctx);
    }catch{show(ctx,'目前通知狀態無法確認，未更改設定。','warning');}
  }});
  for(const command of ['setup','on','off','default','status','test','clear'])pi.registerCommand(`notify-${command}`,{description:({setup:'遮蔽設定目前通知方式',on:'當前對話開（已授權可執行中切換）',off:'當前對話關（不中斷工作）',default:'新對話通知預設',status:'查看通知狀態',test:'明確真實通知測試',clear:'確認清除目前方式連線'}[command])+'；秘密不可放指令參數',handler:handler(command)});
}
