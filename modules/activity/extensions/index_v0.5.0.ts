import {namespaceAPI} from '../../../src/commands_v0.12.0.mjs';import {withMouseMenus,displayFor,showInfo} from '../../../src/ui_v0.15.0.ts';
import {getAgentDir,type ExtensionAPI,type ExtensionContext} from '@earendil-works/pi-coding-agent';import {truncateToWidth} from '@earendil-works/pi-tui';import {performance} from 'node:perf_hooks';import {join} from 'node:path';import {ActivityState,row} from '../src/state_v0.1.0.mjs';import {VisibilityStore} from '../src/visibility_v0.5.0.mjs';import {readGoalPolicy} from '../../webhook/src/goal-policy_v2.1.0.mjs';
const VERSION='0.5.0',EVENTS=['before_agent_start','agent_start','turn_start','message_start','message_update','message_end','tool_execution_start','tool_execution_update','tool_execution_end','ui_prompt_start','ui_prompt_end','session_before_compact','session_compact','session_compact_failed','agent_end','agent_settled'] as const;
export default function activity(raw:ExtensionAPI){
 const display=displayFor(raw),pi=namespaceAPI(withMouseMenus(raw)),state=new ActivityState(()=>performance.now()),store=new VisibilityStore(join(getAgentDir(),'config/activity-display'));
 let context:ExtensionContext|undefined,timer:ReturnType<typeof setInterval>|undefined,visible=false,keyAtStart:string|undefined,goal:any,sampled=false,epoch=0;
 const key=(ctx:ExtensionContext)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd]);
 const current=(ctx:ExtensionContext)=>!!context&&keyAtStart===key(ctx)&&keyAtStart===key(context)&&display.current(ctx);
 // Own Goal events invalidate the cache; unrelated message leaves and UI ticks
 // never make us rescan a long conversation. Tree/restore resets it explicitly.
 const snapshot=(ctx:ExtensionContext,read=false)=>{if(read&&!sampled){goal=readGoalPolicy(ctx.sessionManager.getBranch());sampled=true;}return state.snapshot({idle:ctx.isIdle(),pending:ctx.hasPendingMessages(),goal});};
 const stop=()=>{if(timer!==undefined)clearInterval(timer);timer=undefined;};
 const detach=()=>{stop();if(context)display.setRow(context,'activity',undefined);};
 const line=(ctx:ExtensionContext,width:number)=>{try{const s=snapshot(ctx);return[truncateToWidth(ctx.ui.theme.fg(s.warning?'warning':'muted',row(s)),Math.max(0,width),'')];}catch{return[truncateToWidth('活動｜狀態暫時無法確認',Math.max(0,width),'')];}};
 const attach=(ctx:ExtensionContext)=>{detach();if(!visible||ctx.mode!=='tui'||!current(ctx))return;display.setRow(ctx,'activity',(width:number)=>line(ctx,width));timer=setInterval(()=>{if(!current(ctx)){detach();return;}snapshot(ctx);display.requestRender();},1000);timer.unref?.();};
 const restore=async(_event:any,ctx:ExtensionContext)=>{const own=++epoch;detach();context=ctx;keyAtStart=key(ctx);state.reset();sampled=false;visible=false;if(ctx.mode!=='tui')return;try{const saved=await store.snapshot();if(own!==epoch||!current(ctx))return;visible=saved.visible;}catch{if(own===epoch)ctx.ui.notify('活動顯示偏好無法驗證；只觀察事件，未更改保存檔。','warning');}if(own!==epoch||!current(ctx))return;snapshot(ctx,true);attach(ctx);};
 pi.on('session_start',restore);pi.on('session_tree',restore);pi.on('session_shutdown',()=>{epoch++;detach();context=undefined;keyAtStart=undefined;state.reset();sampled=false;});
 for(const type of EVENTS)pi.on(type as any,(event:any,ctx:ExtensionContext)=>{if(ctx.mode!=='tui'||!current(ctx))return;state.event(type,event);if(type!=='message_update'&&type!=='tool_execution_update')snapshot(ctx,true);if(visible)display.requestRender();});
 pi.events.on('peicd100:goal-changed',(event:any)=>{if(context&&current(context)&&event.sessionId===context.sessionManager.getSessionId()){sampled=false;snapshot(context,true);if(visible)display.requestRender();}});
 pi.registerCommand('pi-activity',{description:'活動列顯示／隱藏；保存偏好，預設隱藏，執行中可切換；[on|off|status|json]',handler:async(args,ctx)=>{
  let choice=args.trim().toLowerCase();if(!['','on','off','status','json'].includes(choice)){ctx.ui.notify('用法：/pi-activity [on|off|status|json]。','warning');return;}if(ctx.mode!=='tui'){ctx.ui.notify('活動列只支援TUI；未修改偏好或啟動計時器。','info');return;}
  const own=epoch,scope=key(ctx),valid=()=>own===epoch&&scope===key(ctx)&&current(ctx);let saved:any;try{saved=await store.snapshot();}catch{ctx.ui.notify('活動偏好無法驗證，未覆寫。','warning');return;}if(!valid())return;
  const layout=()=>display.status().footer.mounted?'bottom-shared-native':display.status().fallbackBelowEditor?'belowEditor-fallback':'pending-native-owner';
  if(!choice){const labels=[`活動列：${visible?'顯示':'隱藏'}（切換並保存）`,'查看目前狀態','返回'],selected=await ctx.ui.select(`活動列 ${VERSION}\n實際${visible?'顯示':'隱藏'}／保存${saved.visible?'顯示':'隱藏'}；位置：${layout()}\n共享原生Footer，最後一行；隱藏仍觀察，沒有每秒重繪。`,labels);if(!valid()||!selected||selected==='返回')return;choice=selected===labels[0]?(visible?'off':'on'):'status';}
  if(choice==='on'||choice==='off'){try{await store.save(choice==='on',saved.revision,valid);if(!valid())return;visible=choice==='on';attach(ctx);ctx.ui.notify(visible?'活動列已顯示並保存；使用共享原生Footer最後一行，未知或他人Footer則回退輸入框下方。':'活動列已隱藏並保存；背景觀察保留，沒有每秒重繪。','info');}catch{if(valid())ctx.ui.notify('活動偏好保存失敗或已變動，未套用過期選擇。','warning');}return;}
  const s=snapshot(ctx,true),report={...s,version:VERSION,visible,enabled:visible,layout:layout(),timer_active:timer!==undefined,background_observation:true};if(choice==='json')ctx.ui.notify(JSON.stringify(report,null,2));else await showInfo(ctx,'活動列狀態',`活動列 ${VERSION}｜${visible?'顯示':'隱藏'}\n${row(s)}\n位置：${layout()}\n只觀察與重繪，不中止／重試／通知工作。`);
 }});
}
