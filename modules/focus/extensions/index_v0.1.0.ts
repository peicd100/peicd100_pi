import {join} from 'node:path';
import * as Native from '@earendil-works/pi-coding-agent';
import {Container,Box,truncateToWidth} from '@earendil-works/pi-tui';
import {namespaceAPI} from '../../../src/commands_v0.12.0.mjs';
import {withMouseMenus} from '../../../src/ui_v0.14.0.ts';
import {FeaturePreference} from '../../../src/preferences_v0.14.0.mjs';
import {FocusRenderer} from '../src/render_v0.1.0.mjs';
const VERSION='0.1.0',KEY='peicd100-focus-capture';
export default function focusExtension(raw:any){
 const pi=namespaceAPI(withMouseMenus(raw)),preferences=new FeaturePreference(join(Native.getAgentDir(),'config','peicd100-focus'));
 const deps={Container,Box,truncateToWidth,ToolExecutionComponent:(Native as any).ToolExecutionComponent};let generation=0,blocked=true,renderer=new FocusRenderer(deps);
 const key=(ctx:any)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??null]);
 const status=()=>({version:VERSION,preferenceBlocked:blocked,rendererAPI:typeof pi.registerToolRenderer==='function',uiReady:renderer.canWrap(),...renderer.status()});
 const restore=async(_event:any,ctx:any)=>{const own=++generation;renderer.stop();const next=new FocusRenderer(deps);renderer=next;blocked=true;const scope=key(ctx);
  try{const pref=await preferences.read();if(own!==generation||scope!==key(ctx))return;
   if(ctx.mode==='tui'&&typeof ctx.ui.setWidget==='function'){try{ctx.ui.setWidget(KEY,(tui:any)=>{next.setRoot(tui);return {render:()=>[],invalidate(){}};},{placement:'belowEditor'});}finally{ctx.ui.setWidget(KEY,undefined);}}
   if(own!==generation||scope!==key(ctx))return;blocked=false;next.setEnabled(pref.enabled);
  }catch{if(own===generation){blocked=true;next.setEnabled(false);}}
 };
 pi.on('session_start',restore);pi.on('session_tree',restore);pi.on('session_shutdown',(_event:any,ctx:any)=>{generation++;blocked=true;renderer.stop();ctx.ui.setWidget?.(KEY,undefined);});
 if(typeof pi.registerToolRenderer==='function')pi.registerToolRenderer((name:string,next:any)=>{const original=next();return renderer.canWrap()?renderer.wrap(name,original):original;});
 pi.registerCommand('focus',{description:'工具紀錄群組折疊與功能開關',handler:async(args:string,ctx:any)=>{
  if(args.trim()==='json'){ctx.ui.notify(JSON.stringify(status(),null,2));return;}if(ctx.mode!=='tui'){ctx.ui.notify('Focus僅改原生TUI的工具顯示，不改模型輸入或執行。','info');return;}
  const own=generation,scope=key(ctx),target=renderer,valid=()=>own===generation&&scope===key(ctx)&&target===renderer;
  while(valid()){
   let pref:any;try{pref=await preferences.read();}catch{ctx.ui.notify('Focus偏好無法驗證，保留原生顯示，未覆寫偏好。','warning');return;}if(!valid())return;
   const options=[`專注折疊：${pref.enabled?'開啟':'關閉'}（切換）`,'查看狀態與限制','返回'];const choice=await ctx.ui.select('Focus｜工具紀錄折疊\n同一選項切換，偏好跨啟動保存。',options);if(!valid()||!choice||choice==='返回')return;
   if(choice===options[0]){try{const saved=await preferences.write(!pref.enabled,pref.revision);if(!valid())return;blocked=false;target.setEnabled(saved.enabled);}catch{if(valid())ctx.ui.notify('Focus偏好已變更或無法保存；未套用過期選擇，請重新查看。','warning');}}
   else if(choice==='查看狀態與限制')ctx.ui.notify(JSON.stringify(status(),null,2)+'\n只折疊原有工具顯示，不摘要或改寫內容。\n圖片仍由宿主在折疊區外顯示；互動元件保留展開。\n公開元件排列無法驗證時保留原生顯示，不猜測或隱藏。');
  }
 }});
}
