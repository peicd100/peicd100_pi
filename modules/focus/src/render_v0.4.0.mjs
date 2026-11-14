import {FocusRenderer as NativeToolViews} from './render_v0.1.0.mjs';
import {FocusGroups} from './groups_v0.3.0.mjs';
import {createGroupDetails} from './details_v0.4.0.mjs';
import {ObservedActivity} from './activity_v0.4.0.mjs';
import {assistantParts} from '../../../src/assistant_v0.17.0.mjs';
const EMPTY={render:()=>[],invalidate(){}},imageLine=line=>/\x1b_G|\x1b\]1337;File=|\x1bP[0-9;]*q/u.test(line);
// A read-only expansion affordance is not an authorization/input surface.
// MouseRegion.child is PRIVATE: never unwrap it. Unknown custom handlers stay native.
function classify(component,deps,width=80,trusted=false){let budget=0,reason='readonly',image=false;const seen=new Set(),fail=r=>{reason=r;return false;},text=node=>{try{const lines=node.render(Math.max(1,Math.min(4096,width)));if(Array.isArray(lines)&&lines.some(s=>typeof s==='string'&&imageLine(s))){image=true;return fail('image-protocol');}return Array.isArray(lines)&&lines.length<=16384&&lines.every(s=>typeof s==='string')||fail('render-budget');}catch{return fail('render-failed');}},visit=node=>{if(!node)return true;if(seen.has(node))return fail('unknown-cycle');seen.add(node);if(++budget>512)return fail('tree-budget');if(typeof node.handleInput==='function'||node.capturesViewportInput)return fail('input');
 if(node.constructor===deps.Spacer)return true;
 if(typeof deps.Image==='function'&&node.constructor===deps.Image){image=true;return fail('native-image');}
 if([deps.Text,deps.Markdown,deps.TruncatedText].filter(Boolean).includes(node.constructor)){if(typeof node.handleMouse==='function')return fail('custom-mouse');return text(node);}
 if(node.constructor===deps.Container||node.constructor===deps.Box){if(typeof node.handleMouse==='function'&&node.handleMouse!==deps.Container.prototype.handleMouse&&node.handleMouse!==deps.Box.prototype.handleMouse)return fail('custom-mouse');return node.children.every(visit);}
 // Only a reference-equal public builtin write renderer is attested. Never
 // whitelist by tool/class NAME, never trust arbitrary custom renderers.
 if(trusted&&node===component&&typeof node.handleMouse!=='function'){reason='native-readonly-expandable';return text(node);}return fail('unknown-component');};const readonly=visit(component);return{readonly,image,reason};}
export class FocusRenderer extends NativeToolViews{
 constructor(deps,display,{openGroup=()=>{},getImagePreference=()=>undefined,now}={}){super(deps);this.display=display;this.openGroup=openGroup;this.getImagePreference=getImagePreference;this.readonlyRenderers=new Set();try{const a=deps.createWriteToolDefinition?.('.'),b=deps.createWriteToolDefinition?.('.');if(typeof a?.renderCall==='function'&&a.renderCall===b?.renderCall)this.readonlyRenderers.add(a.renderCall);}catch{/* unknown SDK keeps native */}this.model=new FocusGroups();this.slots=new WeakMap();this.headers=new WeakMap();this.visible=[];this.visibleVersion=0;this.headerVersion='';this.headerMembers=new WeakMap();this.callViews=new Map();this.latestDirty=false;this.thinkingDirty=false;this.detailsDepth=0;this.lookupCount=0;this.activity=new ObservedActivity({now});this.assistantClocks=new WeakMap();this.clockRowBefore=undefined;this.clockAssistant=undefined;this.tickTimer=undefined;this.imageSurfaces=new WeakMap();this.imageEnvironment=undefined;}
 canWrap(){return this.supported;}
 restart(){this.stopTick();this.activity.reset();this.assistantClocks=new WeakMap();this.clockAssistant=undefined;this.clockRowBefore=undefined;this.active=false;for(const v of this.views.values())this.releaseImages(v);this.viewEpoch=(this.viewEpoch??0)+1;this.active=true;this.enabled=false;this.model.reset();this.slots=new WeakMap();this.headers=new WeakMap();this.visible=[];this.visibleVersion++;this.headerVersion='';this.headerMembers=new WeakMap();this.nativeViews=new WeakMap();this.views.clear();this.state.rows.clear();this.state.groups.clear();this.callViews.clear();this.latestDirty=false;this.thinkingDirty=false;}
 setEnabled(value){this.enabled=!!value;if(this.enabled)this.scheduleTick();else this.stopTick();this.display.requestRender();}
 stopTick(){if(this.tickTimer!==undefined){clearTimeout(this.tickTimer);this.tickTimer=undefined;}}
 scheduleTick(){if(!this.active||!this.enabled||!this.activity.running||this.tickTimer!==undefined)return;this.tickTimer=setTimeout(()=>{this.tickTimer=undefined;if(!this.active||!this.enabled)return;this.model.dataVersion++;this.display.requestRender();this.scheduleTick();},1000);this.tickTimer.unref?.();}
 groupActivity(group){const records=group.members.map(segment=>segment.kind==='tool'?this.activity.tools.get(segment.view.ctx.toolCallId):this.assistantClocks.get(segment.row)?.runs.get(this.model.segments(segment.row).filter(s=>s.kind==='thinking').indexOf(segment)));return this.activity.summary(records);}
 queue(view){if(!this.active||!view||this.probing||view.syncing)return;this.refreshMeta(view);this.display.requestRender();}
 slot(row,index,kind){let slots=this.slots.get(row);if(!slots){slots=new Map();this.slots.set(row,slots);}const id=kind+':'+index;let value=slots.get(id);if(!value){value={row,index,kind};slots.set(id,value);}return value;}
 view(name,original,args,ctx,theme){const v=super.view(name,original,args,ctx,theme);this.views.set(v.id,v);if(v.ownerEpoch!==this.viewEpoch){v.ownerEpoch=this.viewEpoch;v.snapshot=undefined;v.native=undefined;}
  if(!v.anchor){v.anchor={view:v};const renderer=this;v.component=new class extends renderer.deps.Container{
   render(width){return renderer.renderView(v,width,this);}
   invalidate(){if(renderer.probing)renderer.nativeViews.set(renderer.probing,v);}
  };}
  if(ctx.toolCallId)this.callViews.set(ctx.toolCallId,v);return v;
 }
 wrap(name,original){const renderer=this;return{renderShell:'self',renderCall(args,theme,ctx){const v=renderer.view(name,original,args,ctx,theme);renderer.refreshMeta(v);return v.component;},renderResult(result,_options,theme,ctx){const v=renderer.view(name,original,ctx.args,ctx,theme);v.result=result;v.partial=!!ctx.isPartial;v.error=!!ctx.isError;v.durationMs=ctx.durationMs;renderer.state.result(v.id,result,v.partial,v.error,v.durationMs);if(v.delegate)renderer.syncDelegate(v);renderer.refreshMeta(v);return EMPTY;}};}
 definition(view){if(!view.original)return undefined;const definition={...view.original};for(const [name,flag]of [['renderCall','callInteractive'],['renderResult','resultInteractive']]){const fn=view.original[name];if(typeof fn!=='function')continue;definition[name]=(...args)=>{const index=name==='renderCall'?2:3;args[index]={...args[index],showImages:view.ctx.showImages??args[index]?.showImages};const node=fn(...args),classification=classify(node,this.deps,this.root?.terminal?.columns??80,this.readonlyRenderers.has(fn));view[flag]=!classification.readonly;view[name==='renderCall'?'callReason':'resultReason']=classification.reason;if(classification.image)view.customImage=true;this.state.sync(view.id,{interactive:view.callInteractive||view.resultInteractive});return node;};}return definition;}
 delegate(view){if(view.delegate)return view.delegate;const renderer=this,ui=new Proxy({},{get(_target,key){if(key==='requestRender')return()=>{if(!view.syncing)renderer.queue(view);};const root=renderer.root,value=root?.[key];return typeof value==='function'?value.bind(root):value;}});
  view.syncing=true;try{view.delegate=new this.deps.ToolExecutionComponent(view.name,view.ctx.toolCallId,view.args,{showImages:false,outputPad:view.ctx.outputPad},this.definition(view),ui,view.ctx.cwd);this.syncDelegate(view);}finally{view.syncing=false;}return view.delegate;
 }
 refreshMeta(view){if(!view.anchor)return;const snapshot=[view.args,view.result,view.partial,view.error,view.durationMs,view.ctx.argsComplete,view.ctx.executionStarted,view.ctx.expanded,view.callInteractive,view.resultInteractive,view.customImage];const changed=!view.snapshot||snapshot.some((v,i)=>!Object.is(v,view.snapshot[i]));if(!changed)return;
  const resultChanged=!view.snapshot||view.snapshot[1]!==view.result;view.snapshot=snapshot;
  if(resultChanged)view.resultImage=!!view.result?.content?.some(part=>part?.type==='image'||part?.type==='text'&&imageLine(part.text??''));
  const terminal=!!view.result&&!view.partial,phase=terminal?(view.error?'error':'done'):view.ctx.executionStarted?'running':view.ctx.argsComplete?'pending':'preparing';
  this.model.setMeta(view.anchor,{phase,error:view.error,image:!!(view.resultImage||view.customImage),interactive:view.callInteractive||view.resultInteractive,durationMs:view.durationMs});this.model.touch(view.anchor);
  if(view.native)this.display.window?.refresh?.([view.native]);
 }
 lookup(node){let view=this.nativeViews.get(node);if(!view){this.lookupCount++;this.probing=node;try{node.invalidate();view=this.nativeViews.get(node);}finally{this.probing=undefined;}}if(!view)return undefined;view.native=node;this.probing=node;try{this.delegate(view);this.refreshMeta(view);}finally{this.probing=undefined;}return view;}
 exception(view){return view.callInteractive||view.resultInteractive||view.resultImage||view.customImage||view.error;}
 // Error is still pinned by exception()/safeToArchive(), but plain readonly
 // error TEXT is no longer a reason to force an expanded native main row.
 displayException(view){return view.callInteractive||view.resultInteractive||view.resultImage||view.customImage;}
 safeToArchive(node){const v=this.lookup(node);return !!v&&!!v.result&&!v.partial&&!this.exception(v);}
 describe(row){const d=this.deps;if(row?.constructor===d.ToolExecutionComponent){const view=this.lookup(row);return view?[{kind:'tool',key:view.anchor,native:row,view}]:[{kind:'boundary'}];}
  if(row?.constructor===d.AssistantMessageComponent){const result=assistantParts(row,d);if(!result.supported)return[{kind:'boundary'}];return result.parts.map(part=>({kind:part.kind==='notice'?'boundary':part.kind,key:this.slot(row,part.index,part.kind),index:part.index,native:part.node}));}
  return[{kind:row?.constructor===d.Spacer?'spacing':'boundary'}];
 }
 event(type,event){
  if(type==='message_start'&&event.message?.role==='assistant'){this.clockRowBefore=this.display.latestCache?.latest;this.clockAssistant=this.activity.beginAssistant();this.clockBound=false;}
  if(type==='message_update'&&event.message?.role==='assistant'){const stream=event.assistantMessageEvent;if(stream?.type?.startsWith('thinking_'))this.activity.thinking(event.message,stream.contentIndex,stream.type==='thinking_end'?'end':'start');else if(stream?.type==='text_start'||stream?.type==='toolcall_start')this.activity.endThinking();}
  if(type==='message_end'&&event.message?.role==='assistant')this.activity.endAssistant();
  if(type==='tool_execution_start'){this.activity.endThinking();this.activity.startTool(event.toolCallId,event.toolName);}
  if(type==='tool_execution_end')this.activity.endTool(event.toolCallId);
  if(type==='agent_end'){this.activity.endAssistant();for(const record of this.activity.tools.values())this.activity.close(record);this.stopTick();}
  if(this.activity.running)this.scheduleTick();else this.stopTick();
  if(type==='message_start'||type==='message_update'||type==='message_end'){if(event.message?.role==='assistant'){this.latestDirty=true;const kind=event.assistantMessageEvent?.type;this.thinkingDirty||=type!=='message_update'||typeof kind!=='string'||kind.startsWith('thinking_');}}
  if(type==='tool_execution_update'||type==='tool_execution_end'){const view=this.callViews.get(event.toolCallId);if(view)this.model.touch(view.anchor);}
 }
 changed(row){this.model.dirty(row);for(const segment of this.model.segments(row))if(segment.kind==='thinking')this.model.touch(segment.key);}
 syncImageEnvironment(){const cells=this.deps.getCellDimensions?.(),signature=JSON.stringify([cells?.widthPx,cells?.heightPx,this.deps.getCapabilities?.()?.images,this.root?.hasOverlay?.()]);if(signature===this.imageEnvironment)return;this.imageEnvironment=signature;for(const view of this.views.values())for(const image of view.imageNodes??[])image.invalidate();this.model.dataVersion++;}
 imageSurface(image,view){let surface=this.imageSurfaces.get(image);if(!surface){surface={render:width=>{const rows=image.render(width);if(this.root?.hasOverlay?.()===true){view.previewState='temporarily-hidden-overlay';return rows.map(()=>'');}view.previewState='native-image-component';return rows;},invalidate:()=>image.invalidate()};this.imageSurfaces.set(image,surface);}return surface;}
 prepare(rows){if(!this.active)return;this.syncImageEnvironment();const latest=this.display.latestCache?.latest;if(!this.clockBound&&latest&&latest!==this.clockRowBefore&&this.clockAssistant&&!this.assistantClocks.has(latest)){this.assistantClocks.set(latest,this.clockAssistant);this.clockBound=true;}if(latest&&this.latestDirty)this.model.dirty(latest);this.model.update(rows,row=>this.describe(row));if(latest&&this.thinkingDirty)for(const segment of this.model.segments(latest))if(segment.kind==='thinking')this.model.touch(segment.key);this.latestDirty=false;this.thinkingDirty=false;}
 selection(rows){this.visible=rows;this.visibleVersion++;}
 leader(group){const revision=this.model.version+':'+this.visibleVersion;if(revision!==this.headerVersion){this.headerVersion=revision;this.headerMembers=new WeakMap();for(const row of this.visible)for(const segment of this.model.segments(row)){if(segment.kind!=='tool'&&segment.kind!=='thinking')continue;const g=this.model.groupFor(segment.key);if(g&&!this.headerMembers.has(g))this.headerMembers.set(g,segment.key);}}return this.headerMembers.get(group);}
 title(group){const c=group.counts,clock=this.groupActivity(group),current=clock.current,tools=current.filter(r=>r.kind==='tool'),seconds=n=>Number.isFinite(n)?`${(n/1000).toFixed(1)}秒`:'未知',status=tools.length>1?`並行${tools.length}工具：${tools.map(t=>`${t.label} ${seconds(t.elapsedMs)}`).join('、')}`:tools.length?`工具 ${tools[0].label}｜已經過${seconds(tools[0].elapsedMs)}`:current.length?`本機思考階段｜已經過${seconds(current[0].elapsedMs)}`:c.running?`${c.running}項執行中（觀測起點未知）`:c.pending?`${c.pending}項準備／等待`:'已結束',time=clock.wallMs===undefined?'｜群組歷時未知':`｜群組牆鐘${seconds(clock.wallMs)}`;return`[查看] 思考／工具 ${group.members.length}項（思考${c.thinking}／工具${c.tools}）｜${status}${c.failed?`｜${c.failed}項錯誤`:''}${c.images?'｜含圖片（預覽待確認）':''}${c.interactive?'｜原生介面留主畫面':''}${time}`;}
 header(group){let node=this.headers.get(group);if(!node){node={render:width=>{const theme=this.display.ctx?.ui.theme,text=this.title(group);return[this.deps.truncateToWidth(theme?.fg?theme.fg(group.counts.failed?'error':'accent',text):text,Math.max(0,width),'')];},invalidate(){},handleMouse:event=>{if(this.active&&event.type==='click'&&event.button==='left'){this.openGroup(group);return{handled:true};}return undefined;}};this.headers.set(group,node);}return node;}
 grouped(){return this.active&&this.enabled&&this.display.focusActive()&&this.detailsDepth===0;}
 thinking(row,part){if(!this.grouped())return part.node;const segment=this.model.segments(row).find(s=>s.kind==='thinking'&&s.index===part.index);if(!segment)return part.node;segment.native=part.node;const group=this.model.groupFor(segment.key);if(!group)return part.node;return this.leader(group)===segment.key?this.header(group):EMPTY;}
 // Explicit single native Image owner. Public setShowImages() suppresses only
 // the outer tool's duplicate slot, never global settings or model content.
 releaseImages(view){if(!view.hostImageSuppressed)return;view.hostImageSuppressed=false;view.native?.setShowImages?.(view.imagePreference??true);}
 imageNodes(view){if(!view.resultImage)return[];let pref;try{pref=this.getImagePreference();}catch{/* unknown preference: native fallback */}if(typeof pref==='boolean')view.imagePreference=pref;const blocks=view.result?.content?.filter(p=>p.type==='image')??[],caps=this.deps.getCapabilities?.(),png=blocks.length>0&&blocks.every(p=>p.mimeType==='image/png'&&typeof p.data==='string'&&p.data.length>0),own=this.active&&typeof pref==='boolean'&&typeof this.deps.Image==='function'&&typeof view.native?.setShowImages==='function'&&png&&!view.customImage;
  if(!own){this.releaseImages(view);view.previewState='native-outer-fallback';return[];}
  if(!view.hostImageSuppressed||view.ctx.showImages!==false){view.hostImageSuppressed=true;view.native.setShowImages(false);}
  if(!pref){view.previewState='disabled';return[];}if(!caps?.images){view.previewState='protocol-unavailable';return[];}
  if(!view.imageBlocks||blocks.length!==view.imageBlocks.length||blocks.some((b,i)=>b.data!==view.imageBlocks[i].data||b.mimeType!==view.imageBlocks[i].mimeType)){view.imageBlocks=blocks;view.imageNodes=blocks.map(b=>new this.deps.Image(b.data,b.mimeType,{fallbackColor:s=>view.theme?.fg?.('toolOutput',s)??s},{maxWidthCells:60}));}view.previewState='native-image-component';return view.imageNodes;
 }
 renderView(view,width,host){if(width<=0)return[];this.syncImageEnvironment();this.delegate(view);this.refreshMeta(view);const imageNodes=this.imageNodes(view);const group=this.grouped()?this.model.groupFor(view.anchor):undefined,children=[];
  if(group&&this.leader(group)===view.anchor)children.push(this.header(group));
  const inline=!group||this.displayException(view)||(!view.error&&view.ctx.expanded)||this.detailsDepth>0;
  if(inline){const native=this.delegate(view),expanded=!!(this.detailsDepth||this.displayException(view)||view.ctx.expanded);if(view.lastExpanded!==expanded){view.lastExpanded=expanded;view.syncing=true;try{native.setExpanded(expanded);}finally{view.syncing=false;}}this.refreshMeta(view);if(this.detailsDepth&&this.exception(view))children.push(new this.deps.Text(`此項含圖片／錯誤／互動：${view.name}，請留在主畫面原生檢視。`,0,0));else{children.push(native);if(view.resultImage||view.customImage){const path=typeof view.args?.path==='string'?view.args.path:typeof view.args?.file_path==='string'?view.args.file_path:undefined,source=path?`圖片來源（工具參數）：${path.replace(/[\u0000-\u001f\u007f]/gu,'')}`:'圖像由本次工具的原生輸出提供；未額外讀檔或加入模型上下文。';if(!view.imageSourceCaption)view.imageSourceCaption=new this.deps.Text(source,0,0);else if(view.imageSourceText!==source)view.imageSourceCaption.setText(source);view.imageSourceText=source;children.push(view.imageSourceCaption);if(view.previewState==='disabled')children.push(new this.deps.Text('圖片預覽已關閉；可在原生圖片設定開啟。',0,0));else if(view.previewState==='protocol-unavailable')children.push(new this.deps.Text('目前終端未支援／無法使用圖片協定；原始檔仍可由上述來源查看。',0,0));else if(view.previewState==='native-outer-fallback')children.push(new this.deps.Text('圖片保留原生顯示路徑；預覽是否可見仍待確認。',0,0));for(const image of imageNodes){children.push(new this.deps.Spacer(1));children.push(this.imageSurface(image,view));}}}}
  host.children=children;return this.deps.Container.prototype.render.call(host,width);
 }
 source(group){return createGroupDetails(group,this.deps,{
  describe:segment=>{
   if(segment.kind==='thinking')return{label:'思考｜原生可見內容',theme:this.display.ctx?.ui.theme};
   const v=segment.view,hint=[v.args?.path,v.args?.file_path,v.args?.command].find(s=>typeof s==='string'),state=v.partial?'執行中':v.result?v.error?'失敗':'完成':v.ctx.executionStarted?'執行中':'準備／等待',time=Number.isFinite(v.durationMs)&&v.durationMs>=0?`｜${(v.durationMs/1000).toFixed(1)}秒`:'';
   return{label:`${v.name}｜${state}${time}`,hint,error:!!v.error,theme:this.display.ctx?.ui.theme};
  },
  renderBody:(segment,width)=>{
   if(segment.kind==='thinking'){const current=assistantParts(segment.row,this.deps).parts?.find(p=>p.kind==='thinking'&&p.index===segment.index);return current?.node?.render(width)??[];}
   const view=segment.view,native=this.delegate(view);if(this.displayException(view))return[`此項含圖片／真正互動：${view.name}，保留主畫面原生檢視／操作。`];
   view.syncing=true;try{native.setExpanded(true);view.lastExpanded=true;}finally{view.syncing=false;}this.refreshMeta(view);
   const lines=native.render(width);if(lines.some(imageLine)){view.customImage=true;this.refreshMeta(view);return[`此項含圖片：${view.name}，保留主畫面原生檢視。`];}return lines;
  },
 });}
 ungrouped(source){const renderer=this;return{render(width){renderer.detailsDepth++;try{return source.render(width);}finally{renderer.detailsDepth--;}},handleMouse(event){renderer.detailsDepth++;try{return source.handleMouse?.(event);}finally{renderer.detailsDepth--;}},invalidate:()=>source.invalidate?.()};}
 stop(){this.stopTick();this.activity.endAssistant();this.active=false;for(const v of this.views.values())this.releaseImages(v);this.model.reset();this.callViews.clear();super.stop();}
 status(){return{version:'0.4.0',diagnostics:[...this.views.values()].slice(-30).map(v=>({tool:v.name,call:v.callReason,result:v.resultReason,preview:v.previewState??'no-image',owner:v.hostImageSuppressed?'single-native-image-component':'native-tool',physicalVisible:'UNVERIFIED'})),supported:this.supported,enabled:this.enabled,layout:this.display.status().mode,groups:this.model.status(),wrapped_records:this.views.size,lookups:this.lookupCount,images:'native-inline',interactive:'native-inline',thinking:'typed-with-tools'};}
}
