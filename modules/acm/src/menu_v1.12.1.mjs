import {parseThreshold} from './threshold_v1.12.1.mjs';
import {readSessionPolicy} from './session-policy_v1.12.0.mjs';
export function registerSessionMenu(pi,control,commands){
 let active=false,epoch=0;for(const event of ['session_start','session_tree','session_shutdown'])pi.on(event,()=>{epoch++;});
 pi.registerCommand('acm',{description:'ACM 中文主選單：本對話單一觸發比例／開關、新對話預設、狀態、分析、共用原生同步；[json|analysis|analysis-json]',handler:async(args,ctx)=>{
  if(active){ctx.ui.notify('ACM 選單已開啟，請先完成或取消。','warning');return;}active=true;
  try{
   const text=args.trim();if(text&&text!=='json'&&text!=='analysis-json'&&text!=='analysis'){ctx.ui.notify('ACM 請用中文主選單；非互動查詢可用 /acm json 或 /acm analysis-json。','warning');return;}
   const p=control.ensure(ctx);
   if(text==='json'||text==='analysis-json'||text==='analysis'){await commands.get(text==='json'?'acm-status':'acm-analysis').handler(text==='analysis'?'':'json',ctx);return;}
   if(ctx.mode!=='tui'){await commands.get('acm-status').handler('',ctx);return;}
   const defaults=control.store.read(pi.getSettings()),start=epoch;
   const identity=()=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd,ctx.sessionManager.getLeafId?.(),ctx.model?.provider,ctx.model?.id,ctx.model?.api,ctx.model?.baseUrl,ctx.model?.contextWindow,pi.getSettings()]);const key=identity();
   const guard=(write=false)=>{if(start!==epoch||key!==identity()||JSON.stringify(readSessionPolicy(ctx.sessionManager.getBranch()))!==JSON.stringify(p)||control.store.read(pi.getSettings()).hash!==defaults.hash)throw new Error('對話、分支、模型或設定已變更；請重開選單。');if(write&&(!ctx.isIdle()||ctx.hasPendingMessages()))throw new Error('請等工作與佇列結束後設定，未改檔。');};
   const onOff=v=>v?'啟用':'停用';const ratio=v=>`${v.triggerPercent}%／${v.targetPercent}%`;
   const labels=[`設定本對話觸發比例（目前：${p.triggerPercent}%；保留目標：${p.targetPercent}%）`,`切換本對話自動縮減（目前：${onOff(p.enabled)}）`,`設定新對話預設是否啟用（目前：${onOff(defaults.config.enabled)}）`,`設定新對話預設觸發比例（目前：${defaults.config.triggerPercent}%；保留目標：${defaults.config.targetPercent}%）`,'查看目前狀態','讀檔／縮減分析','共用原生設定同步','取消'];
   const selected=await ctx.ui.select('ACM 主選單\n本對話設定獨立保存；改預設只影響未初始化新對話。停用不改用摘要，超安全門檻仍停止。\nPi 模型容量請用獨立 /context(peicd100)。',labels);if(selected===undefined||selected===labels[7])return;guard();const i=labels.indexOf(selected);
   if(i===0||i===3){
    guard(true);const before=i===0?p:defaults.config;const input=await ctx.ui.input(`${i===0?'本對話':'新對話預設'}觸發比例：只輸入一個數字 n\n需 1 < n < 100；保留目標自動為 n−1%。例如 31 → 31%／30%。\n不寫入其他對話或 Pi 共用 token budget。`,`${before.triggerPercent}`);if(input===undefined)return;guard(true);if(!input.trim())return;const values=parseThreshold(input);if(values.triggerPercent===before.triggerPercent&&values.targetPercent===before.targetPercent)return;
    const gap=values.triggerPercent-values.targetPercent;const ok=await ctx.ui.confirm('確認 ACM 比例',`${ratio(before)} → ${ratio(values)}\n${gap<5?'保留目標自動為觸發比例減 1 個百分點；可能頻繁縮減。\n':''}${i===0?'只修改本對話目前分支，下一次請求生效，不立刻裁切／恢復歷史。':'只修改新對話預設，已初始化的對話與分支保持。'}\nPi 原生共用預算不改；每次 ACM 請求由本對話比例與 Pi 模型容量計算。`);if(!ok)return;guard(true);
    if(i===0)control.commit(ctx,p,values);else await control.store.save({...defaults.config,...values},defaults.hash,pi.getSettings(),()=>guard(true));ctx.ui.notify('ACM 比例已保存；不需要 reload，已保存的舊歷史不變。','info');return;
   }
   if(i===1){guard(true);control.commit(ctx,p,{enabled:!p.enabled});ctx.ui.notify(`本對話自動縮減已${onOff(!p.enabled)}；不使用 AI 摘要，超本對話安全門檻仍停止，不恢復已縮減歷史。`,'info');return;}
   if(i===2){guard(true);const choices=['啟用','停用','取消'];const choice=await ctx.ui.select(`新對話預設（目前：${onOff(defaults.config.enabled)}；既有對話不變）`,choices);if(!choice||choice===choices[2])return;guard(true);if(!choices.slice(0,2).includes(choice))return;const enabled=choice===choices[0];if(enabled!==defaults.config.enabled)await control.store.save({...defaults.config,enabled},defaults.hash,pi.getSettings(),()=>guard(true));ctx.ui.notify('ACM 新對話預設已保存；既有對話／分支保持。','info');return;}
   if(i===4||i===5){await commands.get(i===4?'acm-status':'acm-analysis').handler('',ctx);return;}
   if(i===6){guard(true);const ok=await ctx.ui.confirm('同步共用原生設定？','此功能維護 Pi 共用／每模型 compaction 基準，可能保存 settings.json 並 reload；不是把本對話比例同步到其他對話。對話開關／比例及新對話預設不變。');if(!ok)return;guard(true);await commands.get('acm-setup').handler('',ctx);return;}
  }catch{ctx.ui.notify('ACM 操作未成功；請檢查設定格式、權限或是否已切換對話／模型，未覆寫其他設定。','warning');}finally{active=false;}
 }});
}
