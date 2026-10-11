import type {ExtensionAPI,ExtensionContext} from '@earendil-works/pi-coding-agent';
import {truncateToWidth} from '@earendil-works/pi-tui';
import {performance} from 'node:perf_hooks';
import {ActivityState,row,VERSION} from '../src/state_v0.1.0.mjs';
import {readGoalPolicy} from '../../webhook/src/goal-policy_v1.2.0.mjs';
const KEY='peicd100-activity';
const EVENTS=['before_agent_start','agent_start','turn_start','message_start','message_update','message_end','tool_execution_start','tool_execution_update','tool_execution_end','ui_prompt_start','ui_prompt_end','session_before_compact','session_compact','session_compact_failed','agent_end','agent_settled'] as const;
export default function activity(pi:ExtensionAPI){
 const state=new ActivityState(()=>performance.now());let context:ExtensionContext|undefined,timer:ReturnType<typeof setInterval>|undefined,tui:any,enabled=true,sessionKey:string|undefined,leaf:any,goal:any={mode:'none'},sampled=false;
 const key=(ctx:ExtensionContext)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd]);
 const goalState=(ctx:ExtensionContext)=>{
  const current=ctx.sessionManager.getLeafId?.();
  if(!sampled||current===undefined||current!==leaf){goal=readGoalPolicy(ctx.sessionManager.getBranch());leaf=current;sampled=true;}
  return goal;
 };
 const snapshot=(ctx:ExtensionContext)=>state.snapshot({idle:ctx.isIdle(),pending:ctx.hasPendingMessages(),goal:goalState(ctx)});
 const detach=()=>{
  if(timer!==undefined)clearInterval(timer);timer=undefined;tui=undefined;
  try{context?.ui.setWidget(KEY,undefined,{placement:'belowEditor'});}catch{/* old runtime may already be invalid */}
 };
 const show=(ctx:ExtensionContext)=>{
  detach();context=ctx;sessionKey=key(ctx);
  if(!enabled||ctx.mode!=='tui'||typeof ctx.ui.setWidget!=='function')return false;
  ctx.ui.setWidget(KEY,(renderer)=>{
   tui=renderer;
   return {invalidate(){},render(width:number){
    try{
     const s=snapshot(ctx),text=row(s);const limit=Math.max(0,Math.floor(width));
     return [truncateToWidth(ctx.ui.theme.fg(s.warning?'warning':'muted',text),limit)];
    }catch{return [truncateToWidth('活動｜狀態暫時無法確認',Math.max(0,width))];}
   }};
  },{placement:'belowEditor'});
  timer=setInterval(()=>{
   try{if(!enabled||ctx.mode!=='tui'||sessionKey!==key(ctx)){detach();return;}snapshot(ctx);tui?.requestRender();}
   catch{detach();context=undefined;}
  },1000);timer.unref?.();return true;
 };
 pi.on('session_start',(_event,ctx)=>{detach();context=undefined;state.reset();sampled=false;if(ctx.mode==='tui')show(ctx);});
 pi.on('session_tree',(_event,ctx)=>{if(ctx.mode!=='tui')return;state.reset();sampled=false;if(enabled)show(ctx);});
 pi.on('session_shutdown',()=>{detach();context=undefined;sessionKey=undefined;state.reset();sampled=false;});
 for(const type of EVENTS)pi.on(type as any,(event:any,ctx:ExtensionContext)=>{
  if(ctx.mode!=='tui'||!context)return;
  try{if(sessionKey!==key(ctx))return;state.event(type,event);tui?.requestRender();}catch{detach();context=undefined;}
 });
 pi.registerCommand('pi-activity',{description:'獨立活動列：/pi-activity [on|off|status|json]；只觀察，不中止或重試工作',handler:async(args,ctx)=>{
  const choice=args.trim().toLowerCase();
  if(!['','on','off','status','json'].includes(choice)){ctx.ui.notify('用法：/pi-activity [on|off|status|json]；不接受其他參數。','warning');return;}
  if(ctx.mode!=='tui'){ctx.ui.notify('活動列只支援互動式 TUI；沒有啟動計時器或修改資料。','info');return;}
  if(choice==='off'){enabled=false;detach();ctx.ui.notify('本次對話活動列已隱藏；reload／新對話恢復預設，永久停用請用 pi config。','info');return;}
  if(choice==='on'){enabled=true;if(!context){state.reset();sampled=false;}const attached=show(ctx);ctx.ui.notify(attached?'獨立活動列已顯示；每秒只更新 UI，不呼叫模型。':'目前宿主不支援活動 widget；未啟動計時器。',attached?'info':'warning');return;}
  const s=snapshot(ctx);ctx.ui.notify(choice==='json'?JSON.stringify({...s,enabled,timer_active:timer!==undefined},null,2):`活動列 ${VERSION}｜${enabled?'顯示':'隱藏'}\n${row(s)}\n只代表可觀察事件；不保證進程存活，不會自動中止、重試或通知。`,'info');
 }});
}
