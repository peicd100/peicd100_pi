// Original template transaction kept separate from body preferences. No body
// restore listener/default write; reload only follows explicit template choice
// and a successful Store commit, never a status/body/cancel/no-op action.
import {readFileSync} from 'node:fs';import {join} from 'node:path';import {ToggleStore,TEMPLATE} from './toggle_v0.2.0.mjs';
export function createTemplateAction(raw,{agentDir,store=new ToggleStore(agentDir)}){
 let active,epoch=0;const invalidate=()=>{epoch++;active?.abort();},scope=ctx=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile?.()??ctx.cwd,ctx.sessionManager.getLeafId?.()??null]);
 for(const type of['session_start','session_tree','session_shutdown'])raw.on(type,invalidate);
 return async ctx=>{
  const notify=(text,kind='info')=>ctx.ui.notify(text,kind);if(ctx.mode!=='tui'){notify('模板需要TUI；未改設定。','warning');return;}if(active||ctx.isIdle?.()!==true||ctx.hasPendingMessages?.()!==false){notify('請等工作與佇列完成；一次只操作一個模板。','warning');return;}
  const controller=new AbortController();active=controller;const start=epoch,key=scope(ctx),model=JSON.stringify([ctx.model?.provider,ctx.model?.id]),live=()=>!controller.signal.aborted&&epoch===start&&ctx.isIdle()&&!ctx.hasPendingMessages()&&scope(ctx)===key&&JSON.stringify([ctx.model?.provider,ctx.model?.id])===model,guard=()=>{if(!live())throw Error('對話、分支或工作已變；模板操作取消。');};
  const original=ctx.ui.theme,selection=(typeof raw.getSettings==='function'?raw.getSettings()?.theme:undefined)??original.name??'system';let applied,committed=false,reload=false;
  try{
   const saved=await store.read();guard();const enabled=original.name===TEMPLATE,labels=[`啟用我的模板（目前：${enabled?'已啟用':'未啟用'}）`,`停用並還原原本主題（目前：${enabled?'已啟用':'未啟用'}）`,'查看目前設定','取消'];
   const choice=await ctx.ui.select(`模板獨立操作\n目前：${original.name??'未知'}；保存還原目標：${saved.state?.previousTheme??'未知'}\n只在明選且成功保存後reload；不改正文黑底或Goal。`,labels,{signal:controller.signal});guard();if(!choice||choice===labels[3])return;if(ctx.ui.theme!==original)throw Error('主題已被其他操作改變，未覆寫。');if(choice===labels[2]){notify(`目前主題：${original.name??'未知'}；還原目標：${saved.state?.previousTheme??'尚無紀錄'}；正文背景獨立。`);return;}
   const on=choice===labels[0];if(!on&&choice!==labels[1])throw Error('未知模板選項，未改設定。');if(on&&enabled){notify(saved.state?'模板已啟用，未重寫。':'模板已啟用但缺還原紀錄，請由 /settings 核對。');return;}if(!on&&!enabled){notify('目前未使用模板，保留目前主題。');return;}
   if(typeof selection!=='string'||selection.includes('/'))throw Error('目前是自動配對主題，公開接口不能完整還原；請由 /settings 明選單一主題，未改設定。');
   if(ctx.isProjectTrusted?.()===true){try{const project=JSON.parse(readFileSync(join(ctx.cwd,'.pi','settings.json'),'utf8'));if(Object.hasOwn(project,'theme'))throw Error('專案固定了theme，未改全域設定。');}catch(error){if(error.code!=='ENOENT')throw error;}}
   if(!on&&!saved.state)throw Error('沒有啟用前主題紀錄，不猜還原目標。');const target=on?TEMPLATE:saved.state.previousTheme;if(!ctx.ui.getTheme(target))throw Error('目標主題尚未載入或已不存在；未改設定，請手動 /settings 核對。');
   await store.save({version:1,enabled:on,previousTheme:on?selection:saved.state.previousTheme},saved.hash,()=>{guard();if(ctx.ui.theme!==original)throw Error('套用前主題已變。');const receipt=ctx.ui.setTheme(target);applied=ctx.ui.theme;if(!receipt.success)throw Error('官方主題接口未成功，模板紀錄已回退。');},live);committed=true;if(!live()||ctx.ui.theme!==applied)return;reload=typeof ctx.reload==='function';notify(on?'模板已啟用並保存；正文偏好不變。':'已保存還原原本主題；正文偏好不變。');if(!reload)notify('接口無reload，請閒置後手動 /reload。','warning');
  }catch(error){if(committed)return;if(applied&&ctx.ui.theme===applied&&live()){const receipt=ctx.ui.setTheme(selection);if(!receipt.success){ctx.ui.setTheme(original);notify('僅還原畫面，請用 /settings 核對保存選擇。','warning');}}notify(error instanceof Error&&!error.code&&/[\u3400-\u9fff]/u.test(error.message)?error.message:'模板操作未成功；未記錄私人內容或重試。','error');}
  finally{if(active===controller)active=undefined;controller.abort();}
  if(reload){if(epoch!==start||!ctx.isIdle()||ctx.hasPendingMessages()||scope(ctx)!==key||ctx.ui.theme!==applied){notify('模板已保存；範圍或工作已改，請稍後手動 /reload。','warning');return;}try{await ctx.reload();}catch{throw Error('模板已保存，但reload未成功；請閒置後手動 /reload。');}}
 };
}
