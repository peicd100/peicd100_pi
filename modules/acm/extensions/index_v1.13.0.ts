import {namespaceAPI} from '../../../src/commands_v0.12.1.mjs';
import { readFileSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { buildSessionProjection, sessionEntryToContextMessages, getAgentDir, VERSION as PI_VERSION } from '@earendil-works/pi-coding-agent';
import { getCurrentSystemMessage } from '@earendil-works/pi-ai';
import { MARKER, validatePolicy, createCounter, previewMessage, messageKey,
  selectWindow, branchState, applyLegacyRows, applyCursor, assertPairing, atomicGroups, omitFailedAttempts } from '../src/window_v1.5.0.mjs';
import { CALIBRATION_TYPE, createCalibration, modelKey } from '../src/calibration_v1.5.0.mjs';
import { DEFAULT_PERCENTAGES, policyForSettings, nativeBudget } from '../src/config_v1.10.0.mjs';

import { analyzeBranch, formatAnalysis } from '../src/analysis_v1.9.0.mjs';
import {describePiContext,parseDocument,readDocument,assertPiContextReady} from '../src/pi-context_v1.10.0.mjs';
import {registerPiContextCommand} from '../src/pi-context-command_v1.13.0.mjs';
const describeContextBudget=(_settings:any,model:any,_base:any,usage?:any)=>describePiContext(model,parseDocument(readDocument(join(getAgentDir(),'models.json'))),usage,getAgentDir());
import { formatStatus, formatFooter } from '../src/presentation_v1.12.1.mjs';
import {SessionPolicy,readSessionPolicy,requestPolicyKey} from '../src/session-policy_v1.13.0.mjs';
import {registerNativeRepair,nativeStatus} from '../src/native-repair_v1.13.0.mjs';
import {registerSessionMenu} from '../src/menu_v1.13.0.mjs';
import {commandRouter,deprecatedInputGuard} from '../../../src/menus_v0.12.0.mjs';

export default function passiveWindow(pi: ExtensionAPI) {
 pi=namespaceAPI(pi);
 const publicAPI=pi;
 const routing=commandRouter(pi,['context','acm']);pi=routing.api;
 const control=new SessionPolicy(pi,getAgentDir());
 const settings=(ctx:ExtensionContext)=>control.settings(ctx);
 deprecatedInputGuard(pi,['acm-status','acm-config','acm-setup'],'acm');
 pi.on('input',(event,ctx)=>{if(/^\s*\/acm-analysis(?:\s|$)/u.test(event.text)){ctx.ui.notify('請使用獨立 /acm-analysis(piecd100) 指令。','warning');return {action:'handled'};}return {action:'continue'};});
  // Invalid policy prevents this extension loading; config/resource smoke is required before activation.
  const basePolicy = validatePolicy(JSON.parse(readFileSync(fileURLToPath(new URL('../policy.json', import.meta.url)), 'utf8')));
  let policy = basePolicy;
  const refreshPolicy = (ctx?: ExtensionContext) => { policy = validatePolicy(policyForSettings(basePolicy, ctx?settings(ctx):pi.getSettings(), ctx?.model)); return policy; };
  const counter = createCounter(basePolicy);
  let fault: string | undefined;
  let last: any = { version: '1.13.0', windowMode: 'automatic', manualCheckpointRequired: false,
    before: 0, after: 0, slides: 0, phase: 'startup' };
  let displayedNative: string | undefined;
  const setupOptions=(ctx:ExtensionContext)=>({path:join(getAgentDir(),'settings.json'),cwd:ctx.cwd,
    projectTrusted:ctx.isProjectTrusted(),runtimeSettings:pi.getSettings(),model:ctx.model,base:basePolicy});
  registerPiContextCommand(pi,{base:basePolicy,setupOptions});
  registerNativeRepair(pi,setupOptions);
  const renderNativeStatus = (ctx: ExtensionContext) => {
    const native = ctx.getContextUsage();
    // Pi owns the live context percentage. This label only shows the effective
    // trigger/target configuration, not an estimate of current consumption.
    const text = formatFooter(settings(ctx));
    last = { ...last, nativePiView: native, displaySource: 'effective-ACM-settings', footer: text };
    if (text !== displayedNative) {
      ctx.ui.setStatus('acm-passive', text);
      displayedNative = text;
    }
  };
  // Only audited host conversion contracts may lower foreign replay estimates.
  const calibration = createCalibration({responsesProjection:PI_VERSION==='1.1.0'});
  let pending: any;
  const inFlight = new Map<string, any>();
  const responseKey = (m: any) => JSON.stringify([m.provider, m.api, m.model, m.timestamp]);
  const calibrated = (ctx: ExtensionContext, branch = ctx.sessionManager.getBranch()) => {
    calibration.restore(branch);
    return calibration.view(modelKey(ctx.model), counter, policy);
  };

  const fail = (ctx: ExtensionContext, error: unknown) => {
    const text = error instanceof Error ? error.message : String(error);
    fault = text;
    pending = undefined;
    // Pi catches ordinary handler exceptions; abort the run explicitly BEFORE returning/throwing.
    try { ctx.abort(); } catch { /* the independent no-summary guard still cancels compaction */ }
    try { ctx.ui.notify(`ACM 滑動視窗已停止：${text}。不會改用 AI 摘要。`, 'error'); } catch { /* non-UI mode */ }
  };
  const configCheck = (ctx: ExtensionContext) => {
    if (pi.getAllTools().some(t => t.name.startsWith('acm_'))) throw new Error('仍載入舊版可由模型呼叫的 ACM 工具，請停用重複插件。');
    assertPiContextReady(ctx.model,getAgentDir());
    refreshPolicy(ctx);
    // ACM owns only the active branch's request budget. Native Pi settings are
    // diagnostic input, never a required synchronized baseline.
    return nativeBudget(ctx.model,policy);
  };

  const boundaryKey = (s: any) => JSON.stringify([s.cursorId, s.carriedIds, s.anchorIds,
    s.taskAnchorId, s.windowMode]);

  function sourceRows(branch: any[], override?: any) {
    const { legacy, state: stored } = branchState(branch);
    const state = override ?? stored;
    let rows = buildSessionProjection(branch).entries.flatMap(e => e.messages
      .filter(m => m.role !== 'system' && !(m.role === 'compactionSummary' && m.summary === MARKER))
      .map(message => ({ id: e.sourceEntry.id, message })));
    rows = applyLegacyRows(rows, legacy);
    const protectedIds = [...state.anchorIds, ...(state.taskAnchorId ? [state.taskAnchorId] : []),
      ...Object.keys(legacy.pinned ?? {}).filter(id => legacy.pinned[id])];
    const carry = new Set([...protectedIds, ...state.carriedIds]);
    // Version 1.2 working-span/checkpoint metadata is historical only. Do not
    // resurrect its old prefix or make an entire multi-day task mandatory.
    const retained = new Set(carry);
    const present = new Set(rows.map(r => r.id));
    const edits = new Map(branch.filter(e => e.type === 'context_edit').map(e => [e.targetId, e.replacement]));
    for (const e of branch) if (carry.has(e.id) && !present.has(e.id) && !legacy.pruned?.[e.id]) {
      if (edits.has(e.id) && edits.get(e.id) === null) continue;
      for (let message of sessionEntryToContextMessages(e)) {
        if (message.role === 'system' || message.role === 'compactionSummary') continue;
        const replacement: any = edits.get(e.id);
        if (replacement) message = { ...message, content: typeof replacement.content === 'string' &&
          ['assistant', 'toolResult'].includes(message.role) ? [{ type: 'text', text: replacement.content }] : replacement.content } as any;
        rows.push({ id: e.id, message });
      }
    }
    const rank = new Map(branch.map((e, i) => [e.id, i]));
    rows.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    rows = applyCursor(rows, { ...state, carriedIds: [...retained] }, branch);
    return { rows, state, protectedIds, carriedIds: [...retained] };
  }

  function normalize(rows: any[], ctx: ExtensionContext, protectedIds: string[] = []) {
    const path = ctx.sessionManager.getSessionFile();
    const clean = omitFailedAttempts(rows);
    const groups = atomicGroups(clean);
    const full = new Set(protectedIds);
    const latestBatch = groups.findLast(g => g.rows.some(r => r.message.role === 'assistant' &&
      r.message.content?.some?.((b: any) => b.type === 'toolCall')));
    for (const r of latestBatch?.rows ?? []) full.add(r.id);
    // ESC/error does not change the latest completed batch. Its full results
    // remain byte-for-byte in retry input; only older optional text is previewed.
    return clean.map(r => ({ ...r, message: full.has(r.id) ? r.message :
      previewMessage(r.message, policy, path ? JSON.stringify(path) : '原始記憶體對話紀錄') }));
  }

  pi.on('session_start', (event, ctx) => {
    fault = undefined;
    last = { version: '1.13.0', windowMode: 'automatic', manualCheckpointRequired: false,
      before: 0, after: 0, slides: 0, phase: 'startup' };
    try {
      refreshPolicy(ctx);
      const percentages = (pi.getSettings() as any).acm ?? DEFAULT_PERCENTAGES;
      // Initialization/config commands provide their own one-line notice.
    } catch (error) { fail(ctx, error); }
    pending = undefined;
    inFlight.clear();
    calibration.restore(ctx.sessionManager.getBranch());
    ctx.ui.setStatus('acm', undefined);
    displayedNative = undefined;
    renderNativeStatus(ctx);
  });
  // Commands only, never registered as model tools. Latest user and latest complete tool batch are automatic anchors.
  pi.registerCommand('acm-status', {
    description: '查看中文上下文狀態；json 顯示原始欄位，不呼叫模型',
    handler: async (args, ctx) => {
      if(args.trim()&&!['json'].includes(args.trim())){ctx.ui.notify('用法：/acm-status [json]','warning');return;}
      try { refreshPolicy(ctx); } catch (error) { fault = error instanceof Error ? error.message : String(error); }
      renderNativeStatus(ctx);
      const data={ ...last, fault, policy, session_policy:control.ensure(ctx),new_session_defaults:control.store.read(pi.getSettings()).config,
        native_compaction:nativeStatus(pi.getSettings(),ctx.model),
        native_sync_retired:true,cancel_notification_silencing:'unsupported-by-current-host-contract',
        config: (settings(ctx) as any).acm ?? DEFAULT_PERCENTAGES, counter: counter.stats(),
        calibration: calibrated(ctx).describe(), piContext:describeContextBudget(pi.getSettings(),ctx.model,basePolicy.contextCap,ctx.getContextUsage()), nativePiView: ctx.getContextUsage(),
        boundary: branchState(ctx.sessionManager.getBranch()).state };
      ctx.ui.notify(args.trim()==='json'?JSON.stringify(data,null,2):formatStatus(data)+`\n本對話自動縮減：${data.session_policy.enabled?'啟用':'停用'}；比例 ${data.session_policy.triggerPercent}%／${data.session_policy.targetPercent}%\n新對話預設：${data.new_session_defaults.enabled?'啟用':'停用'}；比例 ${data.new_session_defaults.triggerPercent}%／${data.new_session_defaults.targetPercent}%\nPi 原生壓縮由 Pi 自己管理；ACM 不同步、不改寫原生預算。`,'info');
    },
  });
  pi.registerCommand('acm-analysis', {
    description:'最近40次成功縮減以來逐檔read表與獨立近期縮減判讀；json 顯示細節，不自動調參',
    handler:async(args,ctx)=>{
      if(args.trim()&&!['json'].includes(args.trim())){ctx.ui.notify('用法：/acm-analysis [json]','warning');return;}
      try {
        const report=analyzeBranch(ctx.sessionManager.getBranch(),{cwd:ctx.cwd,
          currentRoute:ctx.model?JSON.parse(modelKey(ctx.model)):undefined,
          currentPercentages:(settings(ctx) as any).acm??DEFAULT_PERCENTAGES,
          currentCapacity:ctx.model?refreshPolicy(ctx).contextCap:undefined,manualCapacity:describeContextBudget(pi.getSettings(),ctx.model,basePolicy.contextCap).disk_override!==null});
        ctx.ui.notify(args.trim()==='json'?JSON.stringify(report,null,2):formatAnalysis(report,(settings(ctx) as any).acm??DEFAULT_PERCENTAGES,{width:Math.max(1,(process.stdout.columns??100)-4)}),'info');
      }catch{ctx.ui.notify('ACM 分析資料不完整或無法驗證；未修改歷史或設定。','warning');}
    },
  });
  // Native threshold/overflow estimates are hints, not permission to discard work.
  // The SAME request-local selector below owns the window. Its durable cursor is
  // committed only after a healthy, matched Main response, never before transport.
  // Cancel every native/manual summarization path, including failed recovery.
  pi.on('session_before_compact', (event, ctx) => {
    if (event.reason === 'manual') ctx.ui.notify('AI 摘要壓縮已停用；原始對話紀錄保留。', 'info');
    return { cancel: true };
  });

  // Same selector, NOT an independent priority/pressure pruning system.
  // Covers estimator drift, new user input, and multi-tool batches before every main request.
  pi.on('context_with_system', (event, ctx) => {
    try {
      const b = configCheck(ctx);
      const system = getCurrentSystemMessage(event.messages);
      if (!system) throw new Error('缺少開頭的系統提示或工具宣告。');
      const branch = ctx.sessionManager.getBranch();
      const { rows: sources, state, protectedIds, carriedIds } = sourceRows(branch);
      const byKey = new Map(sources.map(r => [messageKey(r.message), r]));
      const canonicalKeys = new Set(buildSessionProjection(branch).messages.map(messageKey));
      const transport = event.messages.filter(m => m.role !== 'system' && !(m.role === 'compactionSummary' && m.summary === MARKER));
      // Only the authoritative projected/current cursor span is sent. Preserve request-local changes to known rows.
      let rows = transport.flatMap((message, i) => {
        const key = messageKey(message);
        const source = byKey.get(key);
        if (source) return [{ id: source.id, message }];
        // Older canonical rows excluded by the durable guard cursor must not revive.
        const known = canonicalKeys.has(key);
        if (known) return [];
        return [{ id: `request-local:${i}`, message }];
      });
      const present = new Set(rows.map(r => r.id));
      const carried = sources.filter(r => !present.has(r.id) && carriedIds.includes(r.id));
      rows = omitFailedAttempts([...carried, ...rows]);
      atomicGroups(rows);
      const taskAnchorId = state.taskAnchorId ?? rows.findLast(r => r.message.role === 'user')?.id ?? null;
      const nextState = { ...state, taskAnchorId, windowMode: 'automatic',
        worksetInitialized: false, worksetStartId: null, checkpointThroughId: null };
      // Migrate old mandatory-span metadata without moving the saved cursor.
      // Normal task duration, retry, ESC and continue require no manual release.
      if (state.windowMode !== 'automatic' || state.taskAnchorId !== taskAnchorId) pi.appendEntry('acm-passive', nextState);
      const sessionPolicy=control.ensure(ctx);
      if(sessionPolicy.enabled)rows = normalize(rows, ctx, [...protectedIds, ...(taskAnchorId ? [taskAnchorId] : [])]);
      const budget = calibrated(ctx, branch);
      const fixed = budget.offset + budget.tokens(system) + budget.tokens({ role: 'compactionSummary', summary: MARKER });
      const plan = sessionPolicy.enabled?selectWindow(rows, budget, ctx.model!.contextWindow, policy,
        [...protectedIds, ...(taskAnchorId ? [taskAnchorId] : [])], fixed):
        {rows,changed:false,before:fixed+budget.total(rows.map(r=>r.message)),firstKeptId:state.cursorId,carriedIds};
      if (plan.changed && (plan.firstKeptId.startsWith('request-local:') || plan.carriedIds.some(id => id.startsWith('request-local:')))) {
        throw new Error('無法保存僅屬於此次請求的滑動邊界來源。');
      }
      const messages: any[] = [system];
      if (state.cursorId || plan.changed) messages.push({ role: 'compactionSummary', summary: MARKER, tokensBefore: plan.before, timestamp: Date.now() });
      messages.push(...plan.rows.map(r => r.message));
      assertPairing(messages);
      const after = budget.total(messages);
      if (!Number.isSafeInteger(after) || after > b.trigger) throw new Error(`校準輸入預算驗證失敗：${after} > ${b.trigger}`);
      const candidate = plan.changed ? { ...nextState, taskAnchorId, cursorId: plan.firstKeptId,
        carriedIds: plan.carriedIds,
        analysisPolicy: {version:1,route:JSON.parse(modelKey(ctx.model)),
          percentages:{triggerPercent:sessionPolicy.triggerPercent,targetPercent:sessionPolicy.targetPercent},capacity:b.capacity},
        lastGoodBoundary: { cursorId: state.cursorId,
          carriedIds: [...state.carriedIds], anchorIds: [...state.anchorIds], taskAnchorId: state.taskAnchorId } } : null;
      pending = { requestId: randomUUID(), modelKey: modelKey(ctx.model),policyKey:requestPolicyKey(sessionPolicy,ctx.model), countingRule:budget.countingRule,
        inputFingerprint: createHash('sha256').update(JSON.stringify(messages.map(messageKey))).digest('hex'),
        visibleInputTokens: budget.visible(messages), basisTokens: budget.basis(messages),
        baseBoundary: boundaryKey(nextState), candidate };
      fault = undefined;
      last = { ...last, before: plan.before, after, phase: 'calibrated-next-request',
        windowMode: 'automatic', manualCheckpointRequired: false,
        rawVisibleInputTokens: counter.total(messages)-policy.requestMargin,
        targetRouteVisibleInputTokens: pending.visibleInputTokens, opaqueBudgetBasisTokens: pending.basisTokens,
        countingRule:budget.countingRule,
        calibration: budget.describe(), contextBudget: b };
      renderNativeStatus(ctx);
      pi.events.emit('acm-passive:request-ready', { messages, estimatedTokens: after,policyKey:requestPolicyKey(sessionPolicy,ctx.model) });
      return { messages };
    } catch (error:any) {
      fail(ctx, error);
      throw error;
    }
  });
  registerSessionMenu(pi,control,routing.commands);
  publicAPI.registerCommand('acm-analysis',routing.commands.get('acm-analysis')!);
  pi.events.on('acm:session-policy-changed',(data:any)=>renderNativeStatus(data.ctx));
  // Bind the approved context to the Main assistant at stream start. A later
  // preview/warming request cannot steal this response's calibration snapshot.
  pi.on('message_start', (event, ctx) => {
    const m: any = event.message;
    if (m.role !== 'assistant') return;
    if (pending?.modelKey === modelKey(ctx.model) &&
      modelKey({ provider: m.provider, api: m.api, id: m.model }) === pending.modelKey) {
      if (!inFlight.has(responseKey(m))) inFlight.set(responseKey(m), pending);
    }
    pending = undefined;
  });
  pi.on('turn_end', (event, ctx) => {
    try {
      const m: any = event.message;
      const key = responseKey(m);
      const snapshot = inFlight.get(key);
      inFlight.delete(key);
      const record = calibration.observe(snapshot, m, modelKey(ctx.model), event.messageEntryId);
      if (record) pi.appendEntry(CALIBRATION_TYPE, record);
      if (record && snapshot?.candidate && ['stop', 'toolUse'].includes(m.stopReason)) {
        const current = branchState(ctx.sessionManager.getBranch()).state;
        if (boundaryKey(current) === snapshot.baseBoundary && snapshot.policyKey===requestPolicyKey(control.ensure(ctx),ctx.model)) {
          assertPairing(sourceRows(ctx.sessionManager.getBranch(), snapshot.candidate).rows.map(r => r.message));
          pi.appendEntry('acm-passive', snapshot.candidate);
          last.slides++;
        } else ctx.ui.notify('ACM：工作邊界已變更，保留目前上下文，未提交過期裁切候選。', 'warning');
      }
      // Calibration still owns the background next-request safety budget.
      // Live consumption stays in Pi's native footer; ACM shows trigger/target.
      last = { ...last, phase: 'native-Pi-current-context',
        matchedCalibrationRequest: record?.requestId ?? null };
      renderNativeStatus(ctx);
    } catch (error) { fail(ctx, error); }
  });
  // Refresh effective settings and detailed native view on lifecycle boundaries;
  // changing the live context percentage does not change this configuration label.
  for (const event of ['turn_start', 'message_end', 'tool_execution_end', 'agent_end',
    'session_compact', 'session_tree', 'model_select'] as const) {
    pi.on(event, (_event, ctx) => { renderNativeStatus(ctx); });
  }
  pi.on('session_before_tree', event => {
    // Explicit tree summaries must not silently invoke an LLM either. Plain navigation is unchanged.
    if (event.preparation.userWantsSummary) return { cancel: true };
  });
  pi.on('session_shutdown', (_event, ctx) => ctx.ui.setStatus('acm-passive', undefined));
}
