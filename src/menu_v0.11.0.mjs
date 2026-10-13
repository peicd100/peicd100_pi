// Capture owned command callbacks so menus dispatch directly without emitting
// fake user prompts, model calls, or re-entering input transformations.
export function captureCommands(api){
 const commands=new Map();const wrapped=new Proxy(api,{get(target,key){if(key==='registerCommand')return(name,options)=>{commands.set(name,options);return target.registerCommand(name,options);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 return {api:wrapped,commands};
}
export function registerAcmMenu(pi,commands){
 pi.registerCommand('acm',{description:'ACM 中文主選單：目前狀態、比例設定、Pi容量、分析、原生同步；不關閉保護',handler:async(args,ctx)=>{
  const rows=[['查看目前狀態','acm-status'],['設定觸發／保留比例','acm-config'],['設定 Pi 模型容量與查看官方上限','context'],['查看讀檔與縮減分析','acm-analysis'],['同步原生設定／查看安裝狀態','acm-setup']];
  if(args.trim()||ctx.mode!=='tui'){ctx.ui.notify('ACM 主選單\n'+rows.map(([label,cmd])=>`${label}：/${cmd}`).join('\n'),'info');return;}
  const key=JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd,ctx.sessionManager.getLeafId?.(),ctx.model?.provider,ctx.model?.id]);
  const labels=[...rows.map(r=>r[0]),'取消'];const picked=await ctx.ui.select('ACM 主選單（保留獨立保護；容量用量請看 Pi 原生顯示）',labels);
  if(key!==JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd,ctx.sessionManager.getLeafId?.(),ctx.model?.provider,ctx.model?.id]))return;
  const row=rows[labels.indexOf(picked)];if(row)await commands.get(row[1]).handler('',ctx);
 }});
}
