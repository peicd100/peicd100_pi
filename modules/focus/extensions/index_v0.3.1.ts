import {join} from 'node:path';
import * as Native from '@earendil-works/pi-coding-agent';
import * as Tui from '@earendil-works/pi-tui';
import {namespaceAPI} from '../../../src/commands_v0.12.0.mjs';
import {withMouseMenus,displayFor,showInfo,showComponentDetails} from '../../../src/ui_v0.16.0.ts';
import {FeaturePreference} from '../../../src/preferences_v0.15.0.mjs';
import {DisplayPreferences} from '../../../src/display-preferences_v0.15.0.mjs';
import {FocusRenderer} from '../src/render_v0.3.1.mjs';
import {createHistorySource} from '../../../src/history-source_v0.16.0.mjs';
const VERSION='0.3.1';
export default function focusExtension(raw:any){
 const pi=namespaceAPI(withMouseMenus(raw)),display=displayFor(raw),deps={...Native,...Tui},preferences=new FeaturePreference(join(Native.getAgentDir(),'config','peicd100-focus')),visual=new DisplayPreferences(join(Native.getAgentDir(),'config','peicd100-display'));
 let generation=0,context:any,blocked=true,displayBlocked=true;
 const key=(ctx:any)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??null]);
 const validFor=(ctx:any)=>{const own=generation,scope=key(ctx);return()=>own===generation&&scope===key(ctx)&&renderer.active&&display.current(ctx);};
 const open=async(ctx:any,group:any,valid:()=>boolean)=>{if(!valid())return;await showComponentDetails(ctx,'思考／工具詳情（原生原序）',renderer.source(group),()=>group.revision,valid);};
 const renderer=new FocusRenderer(deps,display,{getImagePreference:()=>{if(typeof raw.getSettings!=='function')return undefined;return raw.getSettings()?.terminal?.showImages??true;},openGroup:(group:any)=>{if(!context)return;const ctx=context,valid=validFor(ctx);void open(ctx,group,valid).catch(()=>{if(valid())ctx.ui.notify('詳情檢視無法開啟；主畫面與工作保持原狀。','warning');});}});
 const status=()=>({version:VERSION,preferenceBlocked:blocked,displayPreferenceBlocked:displayBlocked,...renderer.status(),display:display.status()});
 const history=async(ctx:any,valid:()=>boolean)=>{if(!valid())return;
  const source=createHistorySource({getRows:()=>display.window?.backing?.children??[],deps,size:50,renderRows:(rows:any[],width:number)=>{const container=new Tui.Container();for(const row of rows){if(display.safeToArchive(row))container.addChild(row);else container.addChild(new Tui.Text('此項含圖片／互動／錯誤或未驗版式，請留在主畫面原生檢視。',0,0));}return renderer.ungrouped(container).render(width);}});
  await showComponentDetails(ctx,'完整歷史（原生顯示文字，非session原始格式）',source,()=>source.revision()+':'+renderer.model.dataVersion,valid);
 };
 const restore=async(_event:any,ctx:any)=>{const own=++generation,scope=key(ctx);context=ctx;blocked=true;displayBlocked=true;renderer.restart();display.setFocusAdapter(ctx,renderer);display.onHistory(ctx,()=>{const valid=validFor(ctx);void history(ctx,valid).catch(()=>{if(valid())ctx.ui.notify('歷史檢視未能開啟；原始記錄保持不變。','warning');});});
  const [focus,view]=await Promise.allSettled([preferences.read(),visual.read()]);if(own!==generation||scope!==key(ctx)||!display.current(ctx))return;
  blocked=focus.status!=='fulfilled';displayBlocked=view.status!=='fulfilled';const enabled=!blocked&&(focus as any).value.enabled;renderer.setEnabled(enabled);
  const prefs=view.status==='fulfilled'?view.value:{window:false,preview:false,lines:10,limit:100};display.configure(ctx,{focus:enabled,...{window:prefs.window,preview:prefs.preview,lines:prefs.lines,limit:prefs.limit}});
 };
 pi.on('session_start',restore);pi.on('session_tree',restore);pi.on('session_shutdown',()=>{generation++;context=undefined;blocked=true;displayBlocked=true;renderer.stop();});
 if(typeof pi.registerToolRenderer==='function')pi.registerToolRenderer((name:string,next:any)=>{const original=next();return renderer.canWrap()?renderer.wrap(name,original):original;});
 pi.registerCommand('focus',{description:'專注顯示、思考／工具群組、較早歷史與長訊息預覽',handler:async(args:string,ctx:any)=>{
  if(args.trim()==='json'){ctx.ui.notify(JSON.stringify(status(),null,2));return;}
  if(ctx.mode!=='tui'){ctx.ui.notify('Focus僅改TUI顯示；不改工具執行、session或模型上下文。','info');return;}
  const valid=validFor(ctx),model=JSON.stringify([ctx.model?.provider,ctx.model?.id]),editable=()=>valid()&&ctx.isIdle()&&!ctx.hasPendingMessages()&&model===JSON.stringify([ctx.model?.provider,ctx.model?.id]);
  const save=async(patch:any,current:any)=>{if(!editable()){ctx.ui.notify('持久顯示設定請在閒置且無排隊訊息時調整；進行中仍可原位展開或查看詳情。','warning');return;}try{const saved=await visual.write(patch,current.revision,editable);if(!valid())return;displayBlocked=false;display.configure(ctx,{window:saved.window,preview:saved.preview,lines:saved.lines,limit:saved.limit});}catch{if(valid())ctx.ui.notify('顯示偏好已變更或無法安全保存；未套用過期選擇，請重新查看。','warning');}};
  while(valid()){
   let pref:any,view:any;try{[pref,view]=await Promise.all([preferences.read(),visual.read()]);}catch{if(valid())await showInfo(ctx,'Focus偏好無法驗證','保留目前原生安全回退，不覆寫損壞、未知格式或未驗證的偏好。');return;}if(!valid())return;
   const choices=[`專注折疊：${pref.enabled?'開啟':'關閉'}（切換）`,`長對話最佳化：${view.window?'開啟':'關閉'}（切換）`,`使用者長訊息預覽：${view.preview?'開啟':'關閉'}（切換）`,`預覽行數：${view.lines}畫面行（調整）`,`閱讀視窗：最多${view.limit}片段＋必要保留（調整）`,'最近使用者訊息：原位展開／收合','查看思考／工具群組詳情','查看完整歷史（只讀，不暫停工作）','查看狀態與限制','返回'];
   const selected=await ctx.ui.select('Focus｜專注顯示\n只改顯示，不摘要或重寫原文；真正互動／圖片／權限／錯誤仍保留原生。',choices);if(!valid()||!selected||selected==='返回')return;
   if(selected===choices[0]){if(!editable()){ctx.ui.notify('持久開關請於閒置且無排隊訊息時調整。','warning');continue;}try{const saved=await preferences.write(!pref.enabled,pref.revision,editable);if(!valid())return;blocked=false;renderer.setEnabled(saved.enabled);display.configure(ctx,{focus:saved.enabled});}catch{if(valid())ctx.ui.notify('Focus偏好已變動或無法保存；未套用過期選擇。','warning');}}
   else if(selected===choices[1])await save({window:!view.window},view);
   else if(selected===choices[2])await save({preview:!view.preview},view);
   else if(selected===choices[3]||selected===choices[4]){const preview=selected===choices[3],numbers=preview?[1,5,10,15,20,30,50,100,200]:[50,100,200,500,1000,2000],options=[...numbers.map(String),'返回'],choice=await ctx.ui.select(preview?'使用者訊息預覽（畫面行，縮放會重算）':'閱讀視窗上限（依閱讀位置載入，另保留必要互動）',options);if(!valid()||!choice||choice==='返回')continue;await save({[preview?'lines':'limit']:Number(choice)},view);}
   else if(selected===choices[5]){if(!view.preview)ctx.ui.notify('目前預覽已關閉，使用者原文完整顯示。','info');else if(!display.toggleLatestUser())ctx.ui.notify('目前沒有可展開的使用者訊息。','info');}
   else if(selected===choices[6]){const groups=renderer.model.groups.slice(-50).reverse();if(!groups.length){await showInfo(ctx,'思考／工具群組','目前沒有可檢視的群組；未知元件仍留在原生主畫面。');continue;}const labels=groups.map((g:any,i:number)=>`${i+1}. ${renderer.title(g)}`),choice=await ctx.ui.select('最近思考／工具群組（最多50組）',[...labels,'返回']);if(!valid()||!choice||choice==='返回')continue;const group=groups[labels.indexOf(choice)];if(group)await open(ctx,group,valid);}
   else if(selected===choices[7]){await history(ctx,valid);return;}
   else if(selected===choices[8])await showInfo(ctx,'Focus狀態與限制',JSON.stringify(status(),null,2)+'\n依公開元件型別分組，普通正文不論長短均保留。思考依原生可見設定，原生思考切換仍可操作。\n窗口只讓已完成且驗明安全的舊元件不參與主畫面渲染；原記錄與模型上下文不變。\n圖片、互動、錯誤或未知布局保留主畫面，詳情檢視不代替權限操作。\nCtrl+C／Esc只關閉有焦點的檢視，複製另用按鈕／Ctrl+Y；不暫停背景工作。');
  }
 }});
}
