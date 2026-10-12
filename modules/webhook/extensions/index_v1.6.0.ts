import {namespaceAPI} from '../../../src/commands_v0.7.0.mjs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { VERSION, Store, validateEndpoint, resolveDestination, deliver, notificationId, settledSnapshot, DEFAULT_GOAL_NOTIFY } from '../src/core_v1.6.0.mjs';
import { SESSION_POLICY_TYPE, readSessionPolicy, initialSessionPolicy, sessionEnabled, authorizedConfig, endpointFingerprint } from '../src/session-policy_v1.5.0.mjs';
import { maskedInput } from '../src/secret-ui.ts';

import { formatStatus, stateLabel, onOff } from '../src/presentation_v1.6.0.mjs';
import { readGoalPolicy, goalOutcome, sameGoalTransition, terminalTransitions } from '../src/goal-policy_v1.4.0.mjs';
import { QuietGate, QUIET_MS } from '../src/quiet-gate_v1.2.0.mjs';

export default function webhookNotifier(pi: ExtensionAPI) {
 pi=namespaceAPI(pi);
  const store=new Store(join(getAgentDir(),'config','webhook-notifier'));
  let candidate:any, freshTerminal:any, runStarted=0, stopped=false, runGoalControlled=false;
  const quiet=new QuietGate();let knownTransitions=new Set<string>();
  let observer:ReturnType<typeof setInterval>|undefined;
  const stopObserver=()=>{if(observer!==undefined)clearInterval(observer);observer=undefined;};
  const jobs=new Set<AbortController>(),operations=new Set<Promise<any>>();
  const show=(ctx:ExtensionContext,text:string,kind:'info'|'warning'|'error'='info')=>ctx.ui.notify(text,kind);
  const abortOwned=()=>{quiet.cancel();for(const controller of jobs)controller.abort();};
  const sessionKey=(ctx:ExtensionContext)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd]);
  const sameSession=(ctx:ExtensionContext,key:string)=>!stopped&&sessionKey(ctx)===key;
  const isBusy=(ctx:any)=>ctx.isIdle?.()===false||ctx.hasPendingMessages?.()===true;
  const permittedConfig=async(ctx:ExtensionContext)=>{const config=authorizedConfig(await store.readConfig(),ctx.sessionManager?readSessionPolicy(ctx.sessionManager.getBranch()):null),global=await store.readGlobalState();return config?{...config,enabled:config.enabled&&global.enabled,globalRevision:global.revision}:null;};
  const settingsSummary=async(ctx:ExtensionContext)=>{const config=await store.readConfig(),global=await store.readGlobalState(),defaults=await store.readDefault(),policy=typeof ctx.sessionManager?.getBranch==='function'?readSessionPolicy(ctx.sessionManager.getBranch()):null,authorized=!!authorizedConfig(config,policy)?.enabled,current=!!policy&&sessionEnabled(policy);return {config,global,defaults,policy,text:`全域總開關：${onOff(global.enabled)}；新對話預設：${onOff(defaults)}\n當前對話：${policy?onOff(current):'尚未初始化'}；端點：${config?'已設定':'未設定'}／${authorized?'已授權':'未授權'}\n實際自動通知：${onOff(ctx.mode==='tui'&&global.enabled&&authorized&&current)}（還須符合事件與停止／閒置條件）`};};
  const ensurePolicy=async(ctx:ExtensionContext)=>{
    const key=sessionKey(ctx),branch=ctx.sessionManager.getBranch(),saved=readSessionPolicy(branch);
    if(saved)return saved;
    const defaultEnabled=await store.readDefault(),config=await store.readConfig();
    if(!sameSession(ctx,key))throw new Error('Session changed.');
    // Re-read after awaits: never overwrite another command's already-persisted choice.
    const current=ctx.sessionManager.getBranch(),existing=readSessionPolicy(current);
    if(existing)return existing;
    const policy=initialSessionPolicy(current,defaultEnabled,config?.enabled??false);
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
      if(result.state==='ACCEPTED')show(ctx,'Webhook 端點已接受通知。');
      else if(!['SKIPPED','DUPLICATE_NO_RESEND'].includes(result.state))show(ctx,`Webhook：${stateLabel(result.state)}；不會自動重試。請查看 /webhook-status。`,'warning');
    } catch(error:any) {
      const code=/^[A-Z_]{2,24}$/.test(error?.code??'')?error.code:'UNKNOWN';
      show(ctx,`Webhook 收據或保存失敗（${code}）；請勿盲目重送，請查看 /webhook-status。`,'error');
    }
    finally {jobs.delete(controller);operations.delete(operation);}
  };
  const restore=async(_event:any,ctx:ExtensionContext)=>{
    stopObserver();abortOwned();candidate=undefined;freshTerminal=undefined;runStarted=0;stopped=false;
    knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());runGoalControlled=false;
    if(ctx.mode==='tui')try {
      await ensurePolicy(ctx);
      let leaf:any,goal:any,checking=false,revision=(await store.readGlobalState()).revision;const key=sessionKey(ctx);
      const own=setInterval(async()=>{if(checking)return;checking=true;try{
        if(observer!==own||!sameSession(ctx,key)){clearInterval(own);return;}
        const global=await store.readGlobalState();if(observer!==own||!sameSession(ctx,key))return;
        if(global.revision!==revision){revision=global.revision;abortOwned();candidate=undefined;freshTerminal=undefined;knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());}
        const current=ctx.sessionManager.getLeafId?.();
        if(!goal||current===undefined||current!==leaf){goal=readGoalPolicy(ctx.sessionManager.getBranch());leaf=current;}
        if(!isBusy(ctx)&&!quiet.pending&&!operations.size)queueGoalStop(ctx,goal);
      }catch{if(observer===own){abortOwned();stopObserver();}}finally{checking=false;}},1000);observer=own;observer.unref?.();
    }catch {show(ctx,'無法確認此對話的通知選擇；自動通知保持阻擋。','warning');}
  };
  pi.on('session_start',restore);
  pi.on('session_tree',restore);
  pi.on('agent_start',(_event,ctx)=>{abortOwned();runStarted=Date.now();candidate=undefined;freshTerminal=undefined;
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
    candidate=snapshot&&freshTerminal?.entryId===snapshot.terminalEntryId&&freshTerminal.outcome===event.outcome&&!ctx.signal?.aborted
      ?{...snapshot,normalSnapshot:!!settledSnapshot(branch,ctx.sessionManager.getSessionId(),event.outcome),
        sessionName:ctx.sessionManager.getSessionName(),cwd:ctx.cwd,elapsedMs:runStarted?Date.now()-runStarted:0,sessionKey:sessionKey(ctx)}:undefined;
  });
  const eligible=(ctx:ExtensionContext,event:any,epoch:number)=>{
    if(!quiet.current(epoch)||!sameSession(ctx,event.sessionKey)||(!event.goalTransition&&ctx.signal?.aborted)||ctx.mode!=='tui'||ctx.isIdle()!==true||ctx.hasPendingMessages())return false;
    const branch=ctx.sessionManager.getBranch(),goal=readGoalPolicy(branch);
    const last=branch.findLast((e:any)=>e.type==='message'&&e.message?.role==='assistant');
    if(!event.goalTransition&&last?.id!==event.terminalEntryId)return false;
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
  pi.on('agent_settled',(_event,ctx)=>{
    const current=readGoalPolicy(ctx.sessionManager.getBranch());
    if(current.mode==='terminal'&&!knownTransitions.has(current.transitionId)){candidate=undefined;freshTerminal=undefined;queueGoalStop(ctx,current);return;}
    const raw=candidate;candidate=undefined;freshTerminal=undefined;
    if(!raw||stopped||ctx.signal?.aborted||ctx.mode!=='tui')return;
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
            if(controlled||!raw.normalSnapshot)return; // pause/clear are not completion
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
        }catch {if(quiet.current(epoch)&&!stopped)show(ctx,'Webhook 設定、Goal 狀態或對話選擇無法確認；未送出通知。','warning');}
      });
    }catch {show(ctx,'Webhook 設定或對話選擇無效；未送出通知。','error');}
  });
  pi.on('session_shutdown',async()=>{stopObserver();
    stopped=true;candidate=undefined;freshTerminal=undefined;const pending=quiet.work;abortOwned();await Promise.allSettled([...operations,...(pending?[pending]:[])]);
  });
  const commands=['status','setup','test','on','off','events','clear','default','global'];
  const usage='/webhook-global [on|off] 所有對話總開關；/webhook-default [on|off] 新對話預設；/webhook-on、/webhook-off 當前對話。三種設定獨立、不重設事件；端點/事件：/webhook-setup、/webhook-events；查看：/webhook-status [json]；測試/清除：/webhook-test、/webhook-clear。秘密只能在遮蔽視窗輸入。';
  pi.registerCommand('webhook',{description:'通知設定：全域總開關／新對話預設／當前對話開關，顯示目前狀態',handler:async(args,ctx)=>{
    if(args.trim()||ctx.mode!=='tui'){show(ctx,usage);return;}
    try{const scope=sessionKey(ctx),s=await settingsSummary(ctx),labels=[`設定全域總開關（目前：${onOff(s.global.enabled)}）`,`設定新對話預設（目前：${onOff(s.defaults)}）`,`當前對話開（目前：${s.policy?onOff(sessionEnabled(s.policy)):'尚未初始化'}）`,`當前對話關（目前：${s.policy?onOff(sessionEnabled(s.policy)):'尚未初始化'}）`];
      const choice=await ctx.ui.select(`Webhook 設定\n${s.text}`,labels);if(!choice||!sameSession(ctx,scope))return;const index=labels.indexOf(choice);if(index<0)return;await handler(['global','default','on','off'][index])('',ctx);
    }catch{show(ctx,'目前狀態無法確認；未變更通知設定。','warning');}
  }});
  const handler=(command:string)=>async(args:string,ctx:ExtensionContext)=>{
    const text=args.trim().toLowerCase();
    if(text&&!['default','global'].includes(command)&&!(command==='status'&&text==='json')){show(ctx,usage,'warning');return;}
    try {
      if(command==='global'){
        if(text&&!['on','off'].includes(text)){show(ctx,usage,'warning');return;}
        const scope=ctx.sessionManager?sessionKey(ctx):undefined,previous=await store.readGlobalState();let choice=text;
        show(ctx,`全域總開關目前：${onOff(previous.enabled)}；影響所有對話與明確測試，不改端點授權、事件、對話選擇或新對話預設。`);
        if(!choice){if(ctx.mode!=='tui')return;const picked=await ctx.ui.select(`全域總開關（目前：${onOff(previous.enabled)}；可執行中設定）`,['開啟（on）','關閉（off）']);if(!picked)return;choice=picked==='開啟（on）'?'on':picked==='關閉（off）'?'off':'';if(!choice)return;}
        if(scope!==undefined&&!sameSession(ctx,scope))return;
        const saved=await store.writeGlobal(choice==='on',previous.revision);
        if(saved.revision!==previous.revision){abortOwned();candidate=undefined;freshTerminal=undefined;if(ctx.sessionManager)knownTransitions=terminalTransitions(ctx.sessionManager.getBranch());}
        show(ctx,`全域總開關${saved.revision===previous.revision?'維持目前值（同值，未寫入）':'已保存'}，送出前即時重驗：${onOff(saved.enabled)}。模型與工具繼續執行；${saved.enabled?'不補送既有停止事件、不自動授權端點或開啟對話。':'未提交通知會被阻擋，已提交 HTTP 無法保證撤回。'}`);return;
      }
      if(command==='on'||command==='off'){
        const summary=await settingsSummary(ctx);show(ctx,summary.text);
        if(command==='off')abortOwned();
        if(!ctx.sessionManager)throw new Error('No session.');
        const scope=sessionKey(ctx);let config=await store.readConfig();const previous=await ensurePolicy(ctx);let consent=previous.version===2?previous.authorizedEndpoint:'';
        if(command==='on'){
          if(!config){show(ctx,'尚未設定端點，請先 /webhook-setup；此對話未開啟。','warning');return;}
          if(!authorizedConfig(config,previous)?.enabled){
            if(ctx.mode!=='tui'||isBusy(ctx)){show(ctx,'舊端點權限關閉；請在閒置時 /webhook-on 明確確認遷移，執行中的工作不會被停止。','warning');return;}
            if(!await ctx.ui.confirm('確認沿用舊端點通知權限？','舊版總開關目前關閉。只有確認後才允許當前對話通知；不更改端點、金鑰、事件或其他對話。'))return;
            if(!sameSession(ctx,scope)||isBusy(ctx))return;
            const current=await store.readConfig();if(JSON.stringify(current)!==JSON.stringify(config))throw new Error('Endpoint changed.');
            consent=endpointFingerprint(config.url); // current branch only; raw legacy config stays off for siblings
          }
          // Already-authorized endpoints need no config mutation. This works
          // while streaming; only the non-context branch policy is changed.
        }
        if(!sameSession(ctx,scope))return;
        pi.appendEntry(SESSION_POLICY_TYPE,{version:2,mode:command,defaultEnabled:previous.defaultEnabled,origin:'explicit',authorizedEndpoint:consent});
        const saved=readSessionPolicy(ctx.sessionManager.getBranch());if(saved?.mode!==command)throw new Error('Choice failed.');
        show(ctx,command==='on'?'當前對話通知已開啟；端點、事件、新對話預設與其他對話不變。':'當前對話通知已關閉；未提交通知已取消，已提交 HTTP 無法保證撤回；模型與工具繼續執行。');return;
      }
      if(command==='default') {
        if(text&&!['on','off'].includes(text)){show(ctx,usage,'warning');return;}
        const scope=ctx.sessionManager?sessionKey(ctx):undefined,defaultEnabled=await store.readDefault();let choice=text;
        if(!choice){
          show(ctx,`新對話預設：${onOff(defaultEnabled)}；不修改已有對話的選擇。`);if(ctx.mode!=='tui')return;
          const picked=await ctx.ui.select(`新對話通知預設（目前：${onOff(defaultEnabled)}；既有對話不變）`,['開啟（on）','關閉（off）']);if(!picked)return;choice=picked==='開啟（on）'?'on':'off';
        }
        if(scope!==undefined&&!sameSession(ctx,scope))throw new Error('Preference context changed.');
        await store.writeDefault(choice==='on');show(ctx,`新對話預設已保存：${onOff(choice==='on')}。既有對話不變；未設定或未授權端點會在開啟時明確提示。`);return;
      }
      const config=command==='setup'||command==='clear'?null:await store.readConfig();
      if(command==='status'){
        const receipts=await store.recent(),defaultEnabled=await store.readDefault();
        const policy=ctx.sessionManager?readSessionPolicy(ctx.sessionManager.getBranch()):null;
        const permitted=authorizedConfig(config,policy);
        const global=await store.readGlobalState();
        const status={loaded_version:VERSION,configured:!!config,enabled:!!permitted?.enabled&&global.enabled,master_enabled:global.enabled,global_revision:global.revision,endpoint_authorized:permitted?.enabled??false,legacy_endpoint_permission:config?.enabled??false,
          default_enabled:defaultEnabled,session_policy:policy,automatic_mode_supported:ctx.mode==='tui',effective_automatic_enabled:ctx.mode==='tui'&&global.enabled&&!!permitted?.enabled&&!!policy&&sessionEnabled(policy),
          endpoint_host:config?new URL(config.url).hostname:'not set',key:config?.key?'configured (hidden)':'none',format:config?.format??'generic',notifyOn:config?.notifyOn??['completed'],
          goal_policy:ctx.sessionManager?readGoalPolicy(ctx.sessionManager.getBranch()):{mode:'none'},goalNotifyOn:config?.goalNotifyOn??DEFAULT_GOAL_NOTIFY,
          quiet_ms:QUIET_MS,automatic_pending:quiet.pending||operations.size>0,
          receipts:receipts.map((row:any)=>({id:row.notification_id,state:row.state,http_status:row.http_status,status:row.status,test:row.test,started_at:row.started_at}))};
        show(ctx,text==='json'?JSON.stringify(status,null,2):formatStatus(status));return;
      }
      if(command==='setup'){
        if(ctx.mode!=='tui'){show(ctx,'遮蔽設定需要 Pi 互動式 TUI；禁止在指令參數輸入秘密。','error');return;}
        if(isBusy(ctx)){show(ctx,'端點設定仍須閒置；全域總開關可用 /webhook-global 在執行中設定。','warning');return;}
        const scope=sessionKey(ctx),summary=await settingsSummary(ctx);show(ctx,summary.text);
        const picked=await ctx.ui.select(`通知資料格式（目前：${summary.config?.format??'未設定'}）`,['Discord','Slack','一般 JSON']);
        const format={Discord:'discord',Slack:'slack','一般 JSON':'generic'}[picked??''];if(!format)return;
        const endpoint=await maskedInput(ctx,'HTTPS Webhook 網址（遮蔽；Enter 確認）');if(endpoint===undefined)return;
        const url=validateEndpoint(endpoint.trim());await resolveDestination(url);
        const key=format==='discord'?'':await maskedInput(ctx,'Bearer 金鑰（遮蔽；非必填，不需要時留空）');if(key===undefined)return;
        if(!await ctx.ui.confirm('允許使用此端點傳送通知？',`允許傳送必要通知資訊至 ${url.hostname}？每個對話另有開關；不傳送對話、回答或檔案內容。`))return;
        if(!sameSession(ctx,scope)||isBusy(ctx))return;
        await store.writeConfig({version:1,enabled:true,controlMode:'session',url:url.href,key,format,notifyOn:['completed'],goalNotifyOn:[...DEFAULT_GOAL_NOTIFY]},summary.config);
        show(ctx,'Webhook 端點已設定並明確授權；新對話預設／當前對話開關獨立。當前對話用 /webhook-on 或 /webhook-off，明確測試 /webhook-test。');return;
      }
      if(command==='clear'){
        if(ctx.mode!=='tui'){show(ctx,'清除端點與金鑰需要互動確認。','warning');return;}
        if(isBusy(ctx)){show(ctx,'端點清除仍須閒置；未修改設定。','warning');return;}
        const scope=sessionKey(ctx),summary=await settingsSummary(ctx);show(ctx,summary.text);
        if(await ctx.ui.confirm('清除 Webhook 端點與金鑰？','刪除本機端點與金鑰；保留新對話預設及防重送收據。')){
          if(!sameSession(ctx,scope)||isBusy(ctx))return;
          abortOwned();await store.clear(summary.config);show(ctx,'端點與金鑰已清除；偏好與收據保留。');
        }return;
      }
      if(!config){show(ctx,'尚未設定通知端點；請執行 /webhook-setup。','warning');return;}
      if(command==='events'){
        if(isBusy(ctx)){show(ctx,'事件設定仍須閒置；未修改設定。','warning');return;}
        const scope=sessionKey(ctx);
        show(ctx,`目前一般回合事件：${config.notifyOn.join('、')}；Goal：${(config.goalNotifyOn??DEFAULT_GOAL_NOTIFY).join('、')||'關閉'}。`);
        if(ctx.mode!=='tui'){show(ctx,'通知事件選擇需要互動模式。','warning');return;}
        const choice=await ctx.ui.select('哪些結果需要通知？',['只有完成','完成與錯誤','完成、錯誤與取消']);if(!choice)return;
        const notifyOn=choice==='只有完成'?['completed']:choice==='完成與錯誤'?['completed','error']:['completed','error','aborted'];
        const goalChoice=await ctx.ui.select('Goal 停止時通知？',['完成、等待、暫停、受阻與額度／預算停止','只有目標完成','不通知 Goal']);if(!goalChoice)return;
        const goalNotifyOn=goalChoice==='只有目標完成'?['complete']:goalChoice==='不通知 Goal'?[]:DEFAULT_GOAL_NOTIFY;
        if(!sameSession(ctx,scope)||isBusy(ctx))return;
        await store.writeConfig({...config,notifyOn,goalNotifyOn},config);show(ctx,'一般回合與 Goal 停止通知偏好已保存；Goal 明確等待／暫停會通知但不冒稱完成，進行中的暫時重試不通知。');return;
      }
      if(command==='test'){
        if(!(await store.readGlobalState()).enabled){show(ctx,'全域總開關目前關閉；明確測試也不送出。','warning');return;}
        const permitted=await permittedConfig(ctx);
        if(!permitted?.enabled){show(ctx,'端點權限尚未授權；請先閒置並明確確認 /webhook-on 遷移或重新 /webhook-setup。','warning');return;}
        const sessionId=ctx.sessionManager.getSessionId();
        await dispatch(ctx,{id:notificationId(sessionId,`explicit-test:${randomUUID()}`,'completed'),sessionId,sessionName:ctx.sessionManager.getSessionName(),cwd:ctx.cwd,outcome:'completed',elapsedMs:0,test:true},{...permitted,notifyOn:['completed']});
      }
    }catch {show(ctx,'通知指令未成功執行；請檢查偏好、對話狀態、公開 HTTPS 端點與保存權限。未記錄秘密內容。','error');}
  };
  for(const command of commands)pi.registerCommand(`webhook-${command}`,{description:({global:'所有對話總開關（可執行中設定；不改模型工作）',status:'查看通知狀態',setup:'遮蔽設定端點與金鑰',test:'明確傳送一則測試通知',on:'當前對話開（已授權端點可執行中切換）',off:'當前對話關（不中斷工作）',events:'選擇通知事件',clear:'確認清除端點與金鑰',default:'設定新對話預設',session:'設定並保存此對話選擇'}[command])+'；禁止在參數輸入秘密',handler:handler(command)});
}
