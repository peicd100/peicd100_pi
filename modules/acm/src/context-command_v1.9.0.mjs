import {describeContextBudget,formatContextBudget,parseContextCapacity,patchContextCapacity,contextFingerprint} from './context-budget_v1.9.0.mjs';
import {inspectContext,commitContext,rollbackConfig,policyForSettings,nativeBudget,assertNativeSettings} from './config_v1.9.0.mjs';
export function registerContextCommand(pi,{base,setupOptions}){
 let editing=false;
 pi.registerCommand('context',{
  description:'查看宣告容量／未驗服務端上限並設定 ACM 預算；[json|status|auto|128k|272k|500k|1m|整數]，不呼叫模型',
  handler:async(args,ctx)=>{
   let receipt,owned=false;
   try{
    const text=args.trim(),settings=pi.getSettings();const view=describeContextBudget(settings,ctx.model,base.contextCap,ctx.getContextUsage?.());
    if(text==='json'){ctx.ui.notify(JSON.stringify(view,null,2),'info');return;}
    ctx.ui.notify(formatContextBudget(view),'info');if(text==='status')return;
    if(!ctx.model||view.setting_maximum===null){ctx.ui.notify('容量未知，未開放設定。','warning');return;}
    if(!text&&ctx.mode!=='tui')return;
    const idle=()=>{if(!ctx.isIdle()||ctx.hasPendingMessages())throw new Error('工作或佇列尚未結束；請閒置後設定，未修改。');};idle();
    if(editing)throw new Error('上下文設定對話已開啟；請先完成或取消。');editing=true;owned=true;
    const options=()=>setupOptions(ctx),snapshot=inspectContext(options()),sessionScope=JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile(),contextFingerprint(ctx.model)]);
    const guard=()=>{idle();if(sessionScope!==JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile(),contextFingerprint(ctx.model)])||inspectContext(options()).fingerprint!==snapshot.fingerprint)throw new Error('確認期間模型、連線、對話或磁碟設定已變更；未修改。');};
    let capacity;
    if(text)capacity=parseContextCapacity(text);
    else{
     const choices=['自動（依目前 Pi 宣告容量）',...view.options.map(o=>`${o.capacity.toLocaleString('en-US')} Token${o.selectable?'':'（超出宣告上限／尚未確認，不可使用）'}`),'自訂 Token','取消'];
     const choice=await ctx.ui.select('上下文預算（第一階段）\n'+formatContextBudget(view),choices);
     if(choice===undefined||choice==='取消'){ctx.ui.notify('已取消；設定不變。','info');return;}guard();
     const index=choices.indexOf(choice);if(index<0)throw new Error('無效選項；未修改。');
     if(index===0)capacity=null;
     else if(index<=view.options.length){const option=view.options[index-1];if(!option.selectable)throw new Error(`目前最多可設定 ${view.setting_maximum} Token；500K／1M 未確認，不會擴大模型宣告容量。`);capacity=option.capacity;}
     else {const input=await ctx.ui.input('請輸入 Token（K=1000，M=1000000）；最多 '+view.setting_maximum,String(view.effective_capacity??view.setting_maximum));if(input===undefined){ctx.ui.notify('已取消；設定不變。','info');return;}guard();capacity=parseContextCapacity(input);}
    }
    const proposed=patchContextCapacity(settings,ctx.model,base.contextCap,capacity),budget=nativeBudget(ctx.model,policyForSettings(base,proposed,ctx.model));
    if((capacity===null&&view.mode==='auto')||(view.mode==='manual'&&capacity===view.effective_capacity)){assertNativeSettings(settings,ctx.model,policyForSettings(base,proposed,ctx.model));ctx.ui.notify('與目前設定相同；未寫入或 reload。','info');return;}
    if(!text){const ok=await ctx.ui.confirm('上下文預算確認（第二階段）',`宣告最多：${view.setting_maximum} Token（非服務端驗證）\n預算：${view.effective_capacity??'需重設'} → ${budget.capacity} Token${capacity===null?'（自動）':''}\nACM 輸入觸發：${budget.trigger}／保留目標：${budget.target}\n模型總窗口剩餘預留：${budget.reserve} Token（包含輸出空間，不保證可輸出模型最大值）\n只同步目前模型的 ACM／native budget；不改模型容量、provider、其他模型或原始對話。調大不恢復已移出訊息。保存後閒置 reload；可能影響快取／重讀成本。`);if(!ok){ctx.ui.notify('已取消；設定不變。','info');return;}guard();}
    await ctx.waitForIdle();guard();receipt=commitContext(options(),{fingerprint:snapshot.fingerprint,capacity});
    if(receipt.lockCleanupWarning)ctx.ui.notify(receipt.lockCleanupWarning,'warning');
    ctx.ui.notify('上下文預算與目前模型 native budget 已一起保存；正在重新載入閒置對話。','info');
   }catch(error){if(receipt)rollbackConfig(receipt);ctx.ui.notify(error instanceof Error?error.message:'上下文設定失敗；未修改。','error');return;}
   finally{if(owned)editing=false;}
   try{await ctx.reload();}catch(error){try{rollbackConfig(receipt);}catch(rollbackError){throw new AggregateError([error,rollbackError],'reload失敗且設定已有後續異動，未強制覆寫；請檢查後閒置 /reload。');}throw new Error('reload失敗，設定已回退；請閒置 /reload。',{cause:error});}
  },
 });
}
