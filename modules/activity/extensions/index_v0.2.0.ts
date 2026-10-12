import {FooterComponent,getAgentDir,type ExtensionAPI,type ExtensionContext} from '@earendil-works/pi-coding-agent';
import {Container,truncateToWidth} from '@earendil-works/pi-tui';
import {performance} from 'node:perf_hooks';import {join} from 'node:path';
import {ActivityState,row} from '../src/state_v0.1.0.mjs';import {VisibilityStore} from '../src/visibility_v0.2.0.mjs';
import {readGoalPolicy} from '../../webhook/src/goal-policy_v1.2.0.mjs';
const KEY='peicd100-activity',VERSION='0.2.0';
const EVENTS=['before_agent_start','agent_start','turn_start','message_start','message_update','message_end','tool_execution_start','tool_execution_update','tool_execution_end','ui_prompt_start','ui_prompt_end','session_before_compact','session_compact','session_compact_failed','agent_end','agent_settled'] as const;
// Bounded discovery through PUBLIC Container.children only. Keep the actual
// exported FooterComponent, never reconstruct native cost/model/context stats.
function nativeFooter(root:any){let count=0;const visit=(node:any,depth:number):any=>{
 if(++count>512||depth>20)return;
 if(node instanceof Container){if(node.children.length===1&&node.children[0] instanceof FooterComponent)return node.children[0];for(const child of node.children){const f=visit(child,depth+1);if(f)return f;}}
 };return visit(root,0);}
export default function activity(pi:ExtensionAPI){
 const state=new ActivityState(()=>performance.now()),store=new VisibilityStore(join(getAgentDir(),'config/activity-display'));
 let context:ExtensionContext|undefined,timer:ReturnType<typeof setInterval>|undefined,tui:any,visible=true,ownsFooter=false,layout='hidden',keyAtStart:string|undefined,leaf:any,goal:any,sampled=false,epoch=0;
 const key=(ctx:ExtensionContext)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd]);
 const snapshot=(ctx:ExtensionContext)=>{const current=ctx.sessionManager.getLeafId?.();if(!sampled||current===undefined||leaf!==current){goal=readGoalPolicy(ctx.sessionManager.getBranch());leaf=current;sampled=true;}return state.snapshot({idle:ctx.isIdle(),pending:ctx.hasPendingMessages(),goal});};
 const stopTimer=()=>{if(timer!==undefined)clearInterval(timer);timer=undefined;};
 const detach=()=>{stopTimer();try{if(ownsFooter){ownsFooter=false;context?.ui.setFooter(undefined);}context?.ui.setWidget(KEY,undefined,{placement:'belowEditor'});}catch{}tui=undefined;layout='hidden';};
 const line=(ctx:ExtensionContext,width:number)=>{try{const s=snapshot(ctx);return truncateToWidth(ctx.ui.theme.fg(s.warning?'warning':'muted',row(s)),Math.max(0,width));}catch{return truncateToWidth('活動｜狀態暫時無法確認',Math.max(0,width));}};
 const attach=(ctx:ExtensionContext)=>{
  detach();context=ctx;keyAtStart=key(ctx);if(!visible||ctx.mode!=='tui'||typeof ctx.ui.setWidget!=='function')return;
  let root:any;ctx.ui.setWidget(KEY,renderer=>{root=renderer;return{invalidate(){},render(){return[];}};},{placement:'belowEditor'});ctx.ui.setWidget(KEY,undefined,{placement:'belowEditor'});
  const original=nativeFooter(root);
  if(original&&typeof ctx.ui.setFooter==='function'){
   ctx.ui.setFooter((renderer)=>{tui=renderer;ownsFooter=true;layout='bottom';return{
    invalidate(){original.invalidate();},render(width:number){return [...original.render(width),line(ctx,width)];},
    dispose(){if(ownsFooter)layout='foreign-footer';ownsFooter=false;stopTimer();tui=undefined;}
   };});
  }else{
   layout='belowEditor-fallback';ctx.ui.setWidget(KEY,renderer=>{tui=renderer;return{invalidate(){},render(width:number){return[line(ctx,width)];}};},{placement:'belowEditor'});
  }
  timer=setInterval(()=>{try{if(!visible||!context||keyAtStart!==key(ctx)){detach();return;}snapshot(ctx);tui?.requestRender();}catch{detach();context=undefined;}},1000);timer.unref?.();
 };
 pi.on('session_start',async(_event,ctx)=>{epoch++;const own=epoch;detach();context=undefined;state.reset();sampled=false;if(ctx.mode!=='tui')return;context=ctx;keyAtStart=key(ctx);
  try{const value=await store.read();if(epoch!==own||keyAtStart!==key(ctx))return;visible=value;}catch{visible=false;ctx.ui.notify('活動顯示偏好無法確認；背景仍觀察，未更改保存檔。','warning');}
  if(epoch===own)attach(ctx);
 });
 pi.on('session_tree',(_event,ctx)=>{if(ctx.mode!=='tui')return;state.reset();sampled=false;if(visible)attach(ctx);});
 pi.on('session_shutdown',()=>{epoch++;detach();context=undefined;keyAtStart=undefined;state.reset();sampled=false;});
 for(const type of EVENTS)pi.on(type as any,(event:any,ctx:ExtensionContext)=>{if(ctx.mode!=='tui'||!context)return;try{if(keyAtStart!==key(ctx))return;state.event(type,event);if(visible)tui?.requestRender();}catch{detach();context=undefined;}});
 pi.registerCommand('pi-activity',{description:'活動列顯示／隱藏（保存偏好）；背景繼續觀察；[on|off|status|json]',handler:async(args,ctx)=>{
  let choice=args.trim().toLowerCase();if(!['','on','off','status','json'].includes(choice)){ctx.ui.notify('用法：/pi-activity [on|off|status|json]。','warning');return;}
  if(ctx.mode!=='tui'){ctx.ui.notify('活動列只支援 TUI；未修改偏好或啟動計時器。','info');return;}
  const own=epoch,scope=key(ctx);
  if(!choice){const picked=await ctx.ui.select('活動列顯示偏好（背景觀察一直啟用）',['顯示活動列','隱藏活動列']);if(!picked)return;choice=picked==='顯示活動列'?'on':'off';}
  if(choice==='on'||choice==='off'){
   if(epoch!==own||key(ctx)!==scope)return;
   try{await store.save(choice==='on');if(epoch!==own||key(ctx)!==scope)return;visible=choice==='on';attach(ctx);
    ctx.ui.notify(visible?`活動列已顯示並保存${layout==='bottom'?'，位於最底下':'；偵測不到可安全保留的原生 footer，使用輸入框下方，不覆蓋其他 footer'}`:'活動列已隱藏並保存；背景事件觀察仍持續，沒有每秒重繪。','info');
   }catch{ctx.ui.notify('活動顯示偏好保存失敗；未更改顯示選擇。','warning');}return;
  }
  const s=snapshot(ctx);ctx.ui.notify(choice==='json'?JSON.stringify({...s,version:VERSION,enabled:visible,visible,layout,timer_active:timer!==undefined,background_observation:true},null,2):`活動列 ${VERSION}｜${visible?'顯示':'隱藏'}（保存偏好）\n${row(s)}\n背景僅觀察，不中止／重試／通知工作。`,'info');
 }});
}
