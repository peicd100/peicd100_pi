import {join,dirname} from 'node:path';import {describePiContext,formatPiContext,parsePiWindow,patchPiWindow,readDocument,parseDocument,modelFingerprint,assertPiContextReady,transactionPath} from './pi-context_v1.10.0.mjs';
import {inspectPiContext,commitPiContext,rollbackPiContext,recoverPiContext} from './pi-context-txn_v1.10.0.mjs';
import {policyForSettings,nativeBudget,assertNativeSettings} from './config_v1.10.0.mjs';
export function registerPiContextCommand(pi,{base,setupOptions}){
 let editing=false;
 // ctx.reload invalidates old contexts. Activate from the NEW lifecycle only,
 // using Pi's public local-refresh/setModel APIs, preserving model identity
 // and the user's current thinking level. Never register/replace providers.
 pi.on('session_start',async(event,ctx)=>{
  if(event.reason!=='reload'||!ctx.model||ctx.model.api==='pi-virtual')return;
  try{const dir=dirname(setupOptions(ctx).path);const model=ctx.model,thinking=pi.getThinkingLevel();
   await ctx.modelRegistry.refresh({allowNetwork:false,providers:[model.provider]});
   const fresh=ctx.modelRegistry.find(model.provider,model.id);if(!fresh)throw new Error('Pi 模型資料未載入。');
   assertPiContextReady(fresh,dir);
   if(fresh.contextWindow!==ctx.model?.contextWindow){if(!await pi.setModel(fresh))throw new Error('Pi 無法啟用新模型資料。');pi.setThinkingLevel(thinking);}
   assertPiContextReady(ctx.model,dir);
  }catch{ctx.ui.notify('Pi 容量資料未完整載入；請檢查模型設定並閒置 /reload，未宣稱已生效。','error');}
 });
 pi.registerCommand('context',{
  description:'直接查看／修改 Pi models.json 的模型 contextWindow（不是 ACM 軟上限）；[json|status|272k|500k|1m|整數|recover]，非互動寫入需 --confirm-unverified',
  handler:async(args,ctx)=>{
   let receipt,owned=false,reloadReady=false;
   try{
    const text=args.trim(),options=()=>setupOptions(ctx),dir=dirname(options().path);
    const idle=()=>{if(!ctx.isIdle()||ctx.hasPendingMessages())throw new Error(receipt?'Pi 配置已保存，但工作／佇列有變動，未重載；請閒置 /reload。':'請等工作結束、佇列清空後修改 Pi，未改檔。');};
    if(text==='recover'){idle();recoverPiContext(dir);ctx.ui.notify('已核對孤兒交易／鎖；將重新載入 Pi。','info');reloadReady=true;}
    else{
     const doc=parseDocument(readDocument(join(dir,'models.json'))),view=describePiContext(ctx.model,doc,ctx.getContextUsage?.(),dir);
     if(text==='json'){ctx.ui.notify(JSON.stringify(view,null,2),'info');return;}
     ctx.ui.notify(formatPiContext(view),'info');if(text==='status')return;
     if(view.error||view.pi_context_window===null){ctx.ui.notify('模型或容量未知，未開放設定。','warning');return;}
     if(!text&&ctx.mode!=='tui')return;idle();
     if(editing)throw new Error('Pi 容量設定對話已開啟；請先完成或取消。');editing=true;owned=true;
     const snap=inspectPiContext(options()),session=JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile(),modelFingerprint(ctx.model)]),activationScope=JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile(),ctx.model.provider,ctx.model.id,ctx.model.api,ctx.model.baseUrl]);
     const guard=()=>{idle();if(session!==JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile(),modelFingerprint(ctx.model)])||inspectPiContext(options()).fingerprint!==snap.fingerprint)throw new Error('確認期間模型、連線、對話或設定有異動；未改檔。');};
     const parts=text.split(/\s+/).filter(Boolean);let n,explicitRisk=false;
     if(text){if(parts.length>2||parts[1]&&parts[1]!=='--confirm-unverified')throw new Error('參數無效；使用1m或1m --confirm-unverified。');n=parsePiWindow(parts[0]);explicitRisk=parts[1]==='--confirm-unverified';}
     else{
      const choices=['保持目前 Pi 設定（不改）',...view.options.map(o=>`${o.contextWindow.toLocaleString('en-US')} Token（直接 Pi）${o.selectable?'':'／超出官方已知上限，不可使用'}`),'自訂 Token','取消'];
      const choice=await ctx.ui.select('Pi 容量設定（第一階段）\n'+formatPiContext(view),choices);
      if(choice===undefined||choice==='取消'||choice===choices[0]){ctx.ui.notify('設定不變；未寫入或 reload。','info');return;}guard();
      const i=choices.indexOf(choice);if(i<0)throw new Error('無效選項。');
      if(i<=view.options.length){if(!view.options[i-1].selectable)throw new Error('超出目前官方已知模型上限，未改 Pi。');n=view.options[i-1].contextWindow;}
      else{const input=await ctx.ui.input('請輸入 Pi contextWindow；K=1000/M=1000000，官方未知需自負連線拒絕風險',String(view.pi_context_window));if(input===undefined){ctx.ui.notify('已取消；未改檔。','info');return;}guard();n=parsePiWindow(input);}
     }
     patchPiWindow(doc,ctx.model,n);const b=nativeBudget({...ctx.model,contextWindow:n},policyForSettings(base,pi.getSettings(),{...ctx.model,contextWindow:n}));
     if(n===view.pi_context_window&&(view.disk_override===null||view.disk_override===n)){assertPiContextReady(ctx.model,dir);assertNativeSettings(pi.getSettings(),ctx.model,policyForSettings(base,pi.getSettings(),ctx.model));ctx.ui.notify('Pi 容量與 native budget 已一致；未改檔或 reload。','info');return;}
     const dialog=ctx.mode==='tui'||ctx.hasUI;
     if(dialog){const ok=await ctx.ui.confirm('直接修改 Pi（第二階段）',`Pi contextWindow：${view.pi_context_window} → ${n}\n模型官方 API 上限：${view.official_model_limit?.contextWindow??'未知'}；目前 Codex／連線上限尚未確認。\nACM 只按新 Pi 窗口與百分比：trigger ${b.trigger}／target ${b.target}／reserve ${b.reserve}，無第二層容量上限。\n只改目前模型 models.json.contextWindow 與 native budget，保留其他模型/provider/auth/maxTokens/headers/settings；保存會標準化 JSON 格式，原文字備份在私密設定目錄。\n調大不恢復舊窗口；過小無法保護 system/user/toolbatch 時停止。保存後閒置 reload；若載入失敗，保留已提交的一致配置並要求手動 reload，不冒充成功。`);if(!ok){ctx.ui.notify('已取消；未改檔。','info');return;}guard();
      if(n>view.pi_context_window||!view.official_model_limit){const risk=await ctx.ui.confirm('連線容量風險確認',`接受手動 Pi 容量覆寫 ${n} Token？\n官方 API 規格不保證此 Codex 訂閱／代理／連線接受，可能發生 request buffer／上下文錯誤、額度限制與更高成本。沒有實際模型探測或支援保證。`);if(!risk){ctx.ui.notify('未確認風險；設定不變。','info');return;}guard();}}
     else if(!explicitRisk)throw new Error('非互動設定需加 --confirm-unverified，明確接受真服務端容量未驗證風險；未改檔。');
     await ctx.waitForIdle();guard();receipt=commitPiContext(options(),{fingerprint:snap.fingerprint,contextWindow:n});
     // Read actual Pi modelOverrides through its runtime before reload, NOT a
     // fabricated Model clone. This does not change active model identity.
     try{await ctx.modelRegistry.refresh({allowNetwork:false,providers:[ctx.model.provider]});const fresh=ctx.modelRegistry.find(ctx.model.provider,ctx.model.id);if(ctx.modelRegistry.getError?.()||fresh?.contextWindow!==n)throw new Error();}
     catch{rollbackPiContext(receipt);receipt=undefined;try{await ctx.modelRegistry.refresh({allowNetwork:false,providers:[ctx.model.provider]});}catch{/* no private provider error content in UI */}throw new Error('Pi 未讀到新覆寫（SDK需使用標準agentDir/modelsPath）；雙檔已安全回退，未稱生效。');}
     idle();if(activationScope!==JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile(),ctx.model.provider,ctx.model.id,ctx.model.api,ctx.model.baseUrl]))throw new Error('已保存原模型配置，但對話／模型已切換，未重載其他對話；請自行核對後 /reload。');for(const key of ['models','settings'])if(readDocument(receipt.files[key])!==receipt.after[key])throw new Error('保存後配置已有其他異動，未強制覆寫或宣稱生效；請核對後閒置 /reload。');
     if(receipt.lockCleanupWarning)ctx.ui.notify(receipt.lockCleanupWarning,'warning');
     ctx.ui.notify('Pi 模型覆寫與 native budget 已完整提交；將重新載入，目前尚未宣稱活躍模型已更新。','info');reloadReady=true;
    }
   }catch(error){ctx.ui.notify(error instanceof Error?error.message:'Pi 容量設定失敗。','error');return;}
   finally{if(owned)editing=false;}
   if(reloadReady){try{await ctx.reload();}catch{throw new Error('Pi 容量配置已保存，但 reload 未完整完成；不使用舊 context 回退／假稱生效。請閒置 /reload，配置不符時模型請求會停止。');}}
  },
 });
}
