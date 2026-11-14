import {mountTranscript} from './transcript_local_dynamic_20261112.mjs';
import {mountFooterOwner} from './footer-owner_v0.16.0.mjs';
import {createUserPreview} from './user-preview_v0.16.0.mjs';
import {assistantParts,probeAssistantParts,createAssistantProjection} from './assistant_v0.17.0.mjs';
import {createBodyDecoration} from './body-decoration_v0.16.0.mjs';
const instances=new WeakMap(),CHANNEL='peicd100:display:v0.17:acquire',KEY='peicd100-shared-display',FALLBACK='peicd100-shared-footer-fallback';
const scopeKey=ctx=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile?.()??ctx.cwd]);
const EVENTS=['agent_start','agent_end','message_start','message_update','message_end','tool_execution_start','tool_execution_update','tool_execution_end','model_select','session_compact'];
const FOOTER_EVENTS=new Set(['agent_start','agent_end','message_start','message_end','model_select','session_compact']);
const defaults=()=>({window:false,preview:false,black:false,focus:false,lines:10,limit:100});
// SDK creates a distinct events facade for each extension and disables Jiti's
// module cache. A synchronous public EventBus handshake, not object identity or
// a module-local singleton, gives all resources one runtime-scoped owner.
export function getDisplay(api,deps){let value=instances.get(api);if(value&&!value.disposed)return value;const events=api.events,answers=new Set();
 if(typeof events?.emit==='function'&&typeof events.on==='function')events.emit(CHANNEL,{accept:service=>{if(service?.serviceVersion==='0.17.0'&&!service.disposed)answers.add(service);}});
 if(answers.size>1)throw new Error('共享顯示owner衝突；保留原生顯示，未搶占Footer。');
 value=answers.values().next().value;
 if(!value){value=new DisplayCoordinator(api,deps);if(typeof events?.on==='function')events.on(CHANNEL,request=>{if(!value.disposed&&typeof request?.accept==='function')request.accept(value);});}
 instances.set(api,value);return value;
}
function coverage(ctx){try{const manager=ctx.sessionManager;if(typeof manager.getBranch!=='function'||typeof manager.buildContextEntries!=='function')return{kind:'unverified-native-source',reason:'public-api-unavailable'};const branch=manager.getBranch(),context=manager.buildContextEntries(),ids=new Set(context.map(e=>e.id)),visible=e=>e.type==='message'&&e.message?.role!=='system'||e.type==='custom_message'&&e.display===true;const missing=branch.filter(e=>visible(e)&&!ids.has(e.id)).length;return{kind:missing?'native-context-partial':'native-context-complete',unmountedMessages:missing,branchEntries:branch.length,contextEntries:context.length};}catch{return{kind:'unverified-native-source',reason:'public-api-failed'};}}
export class DisplayCoordinator{
 constructor(api,deps){this.api=api;this.deps=deps;this.serviceVersion='0.17.0';this.disposed=false;this.epoch=0;this.flags=defaults();this.rows=new Map();this.footerEpoch=0;this.focusHealthy=true;this.mode='detached';this.resetViews();
  api.on('session_start',(_e,ctx)=>{if(!this.disposed)this.attach(ctx);});api.on('session_tree',(_e,ctx)=>{if(!this.disposed)this.attach(ctx);});api.on('session_shutdown',()=>{this.disposed=true;this.detach();});
  for(const type of EVENTS)api.on(type,(event,ctx)=>{if(!this.current(ctx))return;this.viewRevision++;if(FOOTER_EVENTS.has(type))this.footerEpoch++;
   if(type==='session_compact')this.historyCoverage=coverage(ctx);
   if(type==='message_start'&&event.message?.role==='assistant'){this.streaming=true;const previous=this.attention;this.attention=undefined;this.needsAttention=false;if(previous)this.window?.refresh?.([previous]);}
   if(type==='message_start'&&event.message?.role==='user'){const previous=this.attention;this.attention=undefined;this.needsAttention=false;if(previous)this.window?.refresh?.([previous]);}
   if(type==='message_end'&&event.message?.role==='assistant'){const previous=this.activeAssistant;this.streaming=false;this.needsAttention=['error','aborted'].includes(event.message.stopReason);this.attention=this.needsAttention?previous:undefined;this.activeAssistant=undefined;if(previous)this.window?.refresh?.([previous]);}
   try{this.focusAdapter?.event?.(type,event);}catch{this.focusHealthy=false;}this.requestRender();});
 }
 resetViews(){this.nativeBypass=false;this.viewRevision=0;this.userViews=new WeakMap();this.assistantViews=new WeakMap();this.boxes=new WeakMap();this.assistantAPI=undefined;this.black=undefined;this.latestCache=undefined;this.activeAssistant=undefined;this.attention=undefined;this.needsAttention=false;this.streaming=false;}
 current(ctx=this.ctx){try{return !this.disposed&&!!ctx&&!!this.ctx&&this.key===scopeKey(ctx)&&this.key===scopeKey(this.ctx);}catch{return false;}}
 requestRender(){try{this.root?.requestRender();}catch{/* disposed renderer */}}
 setHistoryPresenter(presenter){this.historyPresenter=presenter;this.viewRevision++;this.window?.refresh?.();this.requestRender();}
 attach(ctx){this.detach();this.ctx=ctx;this.key=scopeKey(ctx);this.historyCoverage=coverage(ctx);this.flags=defaults();this.streaming=typeof ctx.isIdle==='function'?!ctx.isIdle():false;this.footerEpoch++;this.mode=ctx.mode==='tui'?'capture-pending':'non-tui';if(ctx.mode!=='tui'||typeof ctx.ui.setWidget!=='function')return;
  const epoch=this.epoch;ctx.ui.setWidget(KEY,(root)=>{if(epoch===this.epoch&&this.current(ctx)&&this.root!==root){this.root=root;this.focusAdapter?.setRoot?.(root);}return{render:()=>{if(epoch===this.epoch&&this.current(ctx))this.frame();return[];},invalidate(){}};},{placement:'aboveEditor'});
 }
 detach(){this.epoch++;try{this.window?.stop?.();}catch{}try{this.footer?.stop?.();}catch{}try{this.focusAdapter?.stop?.();}catch{}
  if(this.ctx?.mode==='tui'){try{this.ctx.ui.setWidget(KEY,undefined);this.ctx.ui.setWidget(FALLBACK,undefined);}catch{}}
  this.window=undefined;this.footer=undefined;this.focusAdapter=undefined;this.root=undefined;this.ctx=undefined;this.rows.clear();this.fallback=false;this.mode='detached';this.historyHandler=undefined;this.resetViews();
 }
 configure(ctx,patch){if(!this.current(ctx))return false;for(const [key,value]of Object.entries(patch)){
  if(['window','preview','black','focus'].includes(key)){if(typeof value!=='boolean')throw new Error('無效的顯示開關');}
  else if(key==='lines'){if(!Number.isSafeInteger(value)||value<1||value>200)throw new Error('訊息預覽須為1至200行');}
  else if(key==='limit'){if(!Number.isSafeInteger(value)||value<1||value>2000)throw new Error('無效的即時窗口大小');}
  else throw new Error('未知顯示設定');
 }
  this.viewRevision++;const resize=patch.limit!==undefined&&patch.limit!==this.flags.limit;Object.assign(this.flags,patch);
  if(resize){this.window?.stop?.();this.window=undefined;}else this.window?.refresh?.();
  this.focusHealthy=true;this.requestRender();return true;
 }
 setFocusAdapter(ctx,adapter){if(!this.current(ctx))return false;this.focusAdapter?.stop?.();this.focusAdapter=adapter;this.focusHealthy=true;this.viewRevision++;if(this.root)adapter.setRoot?.(this.root);this.window?.refresh?.();this.requestRender();return true;}
 setRow(ctx,name,render){if(!this.current(ctx))return false;if(render===undefined)this.rows.delete(name);else if(typeof render==='function')this.rows.set(name,render);else throw new Error('無效Footer資料來源');this.requestRender();return true;}
 onHistory(ctx,handler){if(!this.current(ctx))return false;this.historyHandler=handler;return true;}
 focusActive(){return !this.nativeBypass&&this.flags.focus&&this.focusHealthy&&!!this.focusAdapter;}
 setNativeRescue(ctx,enabled=true){
  if(!this.current(ctx)||!this.root)return false;
  const rows=this.window?.backing?.children??[];this.window?.stop?.();this.window=undefined;this.nativeBypass=!!enabled;
  this.focusAdapter?.setEnabled?.(!this.nativeBypass&&this.flags.focus);
  this.assistantViews=new WeakMap();this.userViews=new WeakMap();this.boxes=new WeakMap();this.latestCache=undefined;
  for(const row of rows){row.invalidate?.();this.focusAdapter?.changed?.(row);}
  this.viewRevision++;if(!this.nativeBypass)this.frame();this.requestRender();return true;
 }
 changed(node){this.window?.refresh?.([node]);try{this.focusAdapter?.changed?.(node);}catch{this.focusHealthy=false;}this.requestRender();}
 syncLatest(rows){let cache=this.latestCache;const append=cache&&cache.array===rows&&cache.length<=rows.length&&rows[0]===cache.first&&rows[cache.length-1]===cache.last;let latest=append?cache.latest:undefined;for(let i=append?cache.length:0;i<rows.length;i++)if(rows[i]?.constructor===this.deps.AssistantMessageComponent)latest=rows[i];this.latestCache={array:rows,length:rows.length,first:rows[0],last:rows.at(-1),latest};
  const previous=this.activeAssistant;this.activeAssistant=this.streaming?latest:undefined;if(this.needsAttention)this.attention??=latest;if(previous!==this.activeAssistant)this.window?.refresh?.([previous,this.activeAssistant].filter(Boolean));
 }
 safeToArchive(node){const d=this.deps;if(!node||typeof node.render!=='function')return false;
  if(node?.constructor===d.UserMessageComponent){let count=0;const readonly=n=>{if(!n||++count>256||typeof n.handleInput==='function')return false;const C=n.constructor;if(typeof n.handleMouse==='function'&&n.handleMouse!==C?.prototype?.handleMouse)return false;if(C===d.Markdown||C===d.Image||C===d.Spacer)return true;if(C===d.Text)return typeof n.handleMouse!=='function';if(C===d.Container||C===d.Box)return Array.isArray(n.children)&&n.children.every(readonly);return false;};return Array.isArray(node.children)&&node.children.every(readonly);}
  if(node?.constructor===d.AssistantMessageComponent)return node!==this.activeAssistant&&node!==this.attention&&assistantParts(node,d).supported;
  if(node?.constructor===d.ToolExecutionComponent)return this.focusAdapter?.safeToArchive?.(node)===true;
  if(node?.constructor===d.Spacer)return true;
  if(node?.constructor===d.Text&&typeof node.handleInput!=='function'&&typeof node.handleMouse!=='function')return true;
  return false;
 }
 preview(node){let view=this.userViews.get(node);if(!view){view=createUserPreview(node,this.deps,{limit:()=>this.flags.lines,enabled:()=>this.flags.preview,changed:()=>this.changed(node),revision:()=>this.ctx.ui.theme,styleControl:(text,width,kind)=>this.ctx.ui.theme.bg('userMessageBg',this.ctx.ui.theme.fg(kind==='count'?'dim':'accent',this.deps.truncateToWidth(text,width,'',true)))});this.userViews.set(node,view);}return view;}
 project(node){const d=this.deps;if(node?.constructor===d.UserMessageComponent)return this.preview(node);
  if(node?.constructor!==d.AssistantMessageComponent)return node;
  let view=this.assistantViews.get(node);if(!view){if(this.assistantAPI===undefined)this.assistantAPI=probeAssistantParts(d);
   const native=createAssistantProjection(node,d,(part,context)=>{
    if(part.kind==='thinking'&&this.focusActive())return this.focusAdapter.thinking(node,part)??part.node;
    if(part.kind!=='body'||!this.flags.black)return part.node;
    if(typeof d.parseColor!=='function'||typeof d.styleText!=='function')return part.node;
    let decoration=this.boxes.get(part.node);if(!decoration){this.black??=d.parseColor('#000000');decoration=createBodyDecoration(part.node,d,{color:this.black});this.boxes.set(part.node,decoration);}return decoration.pick(context.width,context);
   },{verified:this.assistantAPI});
   view={render:w=>native.render(w),invalidate:()=>native.invalidate(),handleMouse:event=>{const result=native.handleMouse(event);if(result?.handled)this.changed(node);return result;}};this.assistantViews.set(node,view);
  }return view;
 }
 footerKey(data){const ctx=this.ctx;return JSON.stringify([this.footerEpoch,ctx.sessionManager.getLeafId?.(),ctx.model?.provider,ctx.model?.id,this.api.getThinkingLevel?.(),data?.getGitBranch?.(),data?.getAvailableProviderCount?.(),Array.from(data?.getExtensionStatuses?.()??[])]);}
 ownRows(width){return [...this.rows].sort(([a],[b])=>a==='activity'?1:b==='activity'?-1:a.localeCompare(b)).flatMap(([_name,render])=>render(width));}
 frame(){if(!this.current()||!this.root)return;try{
  if(this.theme!==this.ctx.ui.theme){this.theme=this.ctx.ui.theme;this.viewRevision++;this.footerEpoch++;this.footer?.invalidate?.();}
  if(!this.nativeBypass&&(!this.window?.mounted||!this.window.owned())){
   this.window?.stop?.();const epoch=this.epoch;
   this.window=mountTranscript(this.root,this.deps,{limit:this.flags.limit,preserveCurrentTurn:false,windowing:()=>this.flags.window&&this.historyCoverage?.kind!=='native-context-partial',selectRows:rows=>this.historyPresenter?.rows(rows)??rows,historyNotice:()=>this.historyCoverage,allowArchive:node=>this.safeToArchive(node),project:node=>this.project(node),revision:()=>this.viewRevision+':'+(this.focusAdapter?.model?.dataVersion??0),release:node=>{this.userViews.get(node)?.releaseCache();this.historyPresenter?.release(node);},onHistory:()=>this.historyHandler?.(),onSelection:rows=>{try{this.focusAdapter?.selection?.(rows);}catch{this.focusHealthy=false;}}});
   if(this.window.mounted){const original=this.window.view.render.bind(this.window.view);this.window.view.render=width=>{if(epoch!==this.epoch)return[];this.syncLatest(this.window.backing.children);try{this.focusAdapter?.prepare?.(this.window.backing.children);}catch{this.focusHealthy=false;}return original(width);};this.requestRender();}
  }
  if(!this.footer?.mounted||!this.footer.owned()){
   const epoch=this.epoch;this.footer=mountFooterOwner(this.ctx,this.root,this.deps,{revision:data=>this.footerKey(data),rows:width=>this.ownRows(width),valid:()=>epoch===this.epoch&&this.current(),onLost:()=>this.requestRender()});
  }
  const fallback=!this.footer?.mounted||!this.footer.owned();if(fallback!==this.fallback){this.fallback=fallback;
   this.ctx.ui.setWidget(FALLBACK,fallback?()=>({render:width=>this.ownRows(width),invalidate(){}}):undefined,{placement:'belowEditor'});
  }
  this.mode=this.nativeBypass?'native-rescue':this.window?.mounted?'projected':this.window?.reason??'capture-pending';
 }catch{this.mode='native-fallback';}
 }
 historyPage(page,size=100){return this.window?.mounted?this.window.historyPage(page,size):[];}
 toggleLatestUser(){const rows=this.window?.backing?.children??[];for(let i=rows.length-1;i>=0;i--)if(rows[i]?.constructor===this.deps.UserMessageComponent){this.preview(rows[i]).toggle();return true;}return false;}
 status(){return{contextNavigation:'dynamic-v1',historyCoverage:this.historyCoverage,historyPresenter:this.historyPresenter?.status?.(),mode:this.mode,flags:{...this.flags},nativeRescue:this.nativeBypass,window:this.window?.status?.(),footer:this.footer?.status?.()??{mounted:false,reason:this.footer?.reason??'not-ready'},fallbackBelowEditor:!!this.fallback,focusHealthy:this.focusHealthy};}
}
