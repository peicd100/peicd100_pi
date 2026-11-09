import {FocusRenderer as NativeToolViews} from './render_v0.1.0.mjs';
import {FocusGroups} from './groups_v0.2.0.mjs';
import {assistantParts} from '../../../src/assistant_v0.15.0.mjs';
const EMPTY={render:()=>[],invalidate(){}},imageLine=line=>/\x1b_G|\x1b\]1337;File=|\x1bP[0-9;]*q/u.test(line);
// Unknown/custom input/image components remain on the original main surface.
function readonly(component,deps,width=80){let budget=0;const seen=new Set(),visit=node=>{if(!node)return true;if(seen.has(node))return false;seen.add(node);if(++budget>512||typeof node.handleInput==='function'||node.capturesViewportInput)return false;
 if(node.constructor===deps.Spacer)return true;
 if([deps.Text,deps.Markdown].includes(node.constructor)){try{const lines=node.render(Math.max(1,Math.min(4096,width)));return Array.isArray(lines)&&lines.length<=16384&&lines.every(line=>typeof line==='string'&&!imageLine(line));}catch{return false;}}
 if(node.constructor===deps.Container||node.constructor===deps.Box){if(typeof node.handleMouse==='function'&&node.handleMouse!==deps.Container.prototype.handleMouse&&node.handleMouse!==deps.Box.prototype.handleMouse)return false;return node.children.every(visit);}return false;};return visit(component);}
export class FocusRenderer extends NativeToolViews{
 constructor(deps,display,{openGroup=()=>{}}={}){super(deps);this.display=display;this.openGroup=openGroup;this.model=new FocusGroups();this.slots=new WeakMap();this.headers=new WeakMap();this.visible=[];this.visibleVersion=0;this.headerVersion='';this.headerMembers=new WeakMap();this.callViews=new Map();this.latestDirty=false;this.thinkingDirty=false;this.detailsDepth=0;this.lookupCount=0;}
 canWrap(){return this.supported;}
 restart(){this.viewEpoch=(this.viewEpoch??0)+1;this.active=true;this.enabled=false;this.model.reset();this.slots=new WeakMap();this.headers=new WeakMap();this.visible=[];this.visibleVersion++;this.headerVersion='';this.headerMembers=new WeakMap();this.nativeViews=new WeakMap();this.views.clear();this.state.rows.clear();this.state.groups.clear();this.callViews.clear();this.latestDirty=false;this.thinkingDirty=false;}
 setEnabled(value){this.enabled=!!value;this.display.requestRender();}
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
 definition(view){if(!view.original)return undefined;const definition={...view.original};for(const [name,flag]of [['renderCall','callInteractive'],['renderResult','resultInteractive']]){const fn=view.original[name];if(typeof fn!=='function')continue;definition[name]=(...args)=>{const index=name==='renderCall'?2:3;args[index]={...args[index],showImages:view.ctx.showImages??args[index]?.showImages};const node=fn(...args);view[flag]=!readonly(node,this.deps,this.root?.terminal?.columns??80);this.state.sync(view.id,{interactive:view.callInteractive||view.resultInteractive});return node;};}return definition;}
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
 safeToArchive(node){const v=this.lookup(node);return !!v&&!!v.result&&!v.partial&&!this.exception(v);}
 describe(row){const d=this.deps;if(row?.constructor===d.ToolExecutionComponent){const view=this.lookup(row);return view?[{kind:'tool',key:view.anchor,native:row,view}]:[{kind:'boundary'}];}
  if(row?.constructor===d.AssistantMessageComponent){const result=assistantParts(row,d);if(!result.supported)return[{kind:'boundary'}];return result.parts.map(part=>({kind:part.kind==='notice'?'boundary':part.kind,key:this.slot(row,part.index,part.kind),index:part.index,native:part.node}));}
  return[{kind:row?.constructor===d.Spacer?'spacing':'boundary'}];
 }
 event(type,event){if(type==='message_start'||type==='message_update'||type==='message_end'){if(event.message?.role==='assistant'){this.latestDirty=true;const kind=event.assistantMessageEvent?.type;this.thinkingDirty||=type!=='message_update'||typeof kind!=='string'||kind.startsWith('thinking_');}}
  if(type==='tool_execution_update'||type==='tool_execution_end'){const view=this.callViews.get(event.toolCallId);if(view)this.model.touch(view.anchor);}
 }
 changed(row){this.model.dirty(row);for(const segment of this.model.segments(row))if(segment.kind==='thinking')this.model.touch(segment.key);}
 prepare(rows){if(!this.active)return;const latest=this.display.latestCache?.latest;if(latest&&this.latestDirty)this.model.dirty(latest);this.model.update(rows,row=>this.describe(row));if(latest&&this.thinkingDirty)for(const segment of this.model.segments(latest))if(segment.kind==='thinking')this.model.touch(segment.key);this.latestDirty=false;this.thinkingDirty=false;}
 selection(rows){this.visible=rows;this.visibleVersion++;}
 leader(group){const revision=this.model.version+':'+this.visibleVersion;if(revision!==this.headerVersion){this.headerVersion=revision;this.headerMembers=new WeakMap();for(const row of this.visible)for(const segment of this.model.segments(row)){if(segment.kind!=='tool'&&segment.kind!=='thinking')continue;const g=this.model.groupFor(segment.key);if(g&&!this.headerMembers.has(g))this.headerMembers.set(g,segment.key);}}return this.headerMembers.get(group);}
 title(group){const c=group.counts,status=c.running?`${c.running}項執行中`:c.pending?`${c.pending}項準備／等待`:'已結束',time=c.knownDuration?`｜已知耗時${(c.durationMs/1000).toFixed(1)}秒`:'';return`[查看] 思考／工具 ${group.members.length}項（思考${c.thinking}／工具${c.tools}）｜${status}${c.failed?`｜${c.failed}項錯誤`:''}${c.images?'｜圖片留主畫面':''}${c.interactive?'｜原生介面留主畫面':''}${time}`;}
 header(group){let node=this.headers.get(group);if(!node){node={render:width=>{const theme=this.display.ctx?.ui.theme,text=this.title(group);return[this.deps.truncateToWidth(theme?.fg?theme.fg(group.counts.failed?'error':'accent',text):text,Math.max(0,width),'')];},invalidate(){},handleMouse:event=>{if(this.active&&event.type==='click'&&event.button==='left'){this.openGroup(group);return{handled:true};}return undefined;}};this.headers.set(group,node);}return node;}
 grouped(){return this.active&&this.enabled&&this.display.focusActive()&&this.detailsDepth===0;}
 thinking(row,part){if(!this.grouped())return part.node;const segment=this.model.segments(row).find(s=>s.kind==='thinking'&&s.index===part.index);if(!segment)return part.node;segment.native=part.node;const group=this.model.groupFor(segment.key);if(!group)return part.node;return this.leader(group)===segment.key?this.header(group):EMPTY;}
 renderView(view,width,host){if(width<=0)return[];this.delegate(view);this.refreshMeta(view);const group=this.grouped()?this.model.groupFor(view.anchor):undefined,children=[];
  if(group&&this.leader(group)===view.anchor)children.push(this.header(group));
  const inline=!group||this.exception(view)||view.ctx.expanded||this.detailsDepth>0;
  if(inline){const native=this.delegate(view),expanded=!!(this.detailsDepth||this.exception(view)||view.ctx.expanded);if(view.lastExpanded!==expanded){view.lastExpanded=expanded;view.syncing=true;try{native.setExpanded(expanded);}finally{view.syncing=false;}}this.refreshMeta(view);if(this.detailsDepth&&this.exception(view))children.push(new this.deps.Text(`此項含圖片／錯誤／互動：${view.name}，請留在主畫面原生檢視。`,0,0));else children.push(native);}
  host.children=children;return this.deps.Container.prototype.render.call(host,width);
 }
 source(group){const renderer=this,container=new this.deps.Container();return{
  render(width){const children=[];for(const segment of group.members){if(segment.kind==='thinking'){const current=assistantParts(segment.row,renderer.deps).parts?.find(p=>p.kind==='thinking'&&p.index===segment.index);if(current)segment.native=current.node;children.push(segment.native);continue;}
    const view=segment.view,native=renderer.delegate(view);view.syncing=true;try{native.setExpanded(true);view.lastExpanded=true;}finally{view.syncing=false;}renderer.refreshMeta(view);
    if(renderer.exception(view)){children.push(new renderer.deps.Text(`此項含錯誤／圖片／互動：${view.name}，請於主畫面原生檢視／操作。`,0,0));continue;}
    const lines=native.render(width);if(lines.some(imageLine)){view.customImage=true;renderer.refreshMeta(view);children.push(new renderer.deps.Text(`此項含圖片：${view.name}，已保留主畫面原生檢視。`,0,0));continue;}
    children.push({render:()=>lines,invalidate:()=>native.invalidate(),handleMouse:event=>native.handleMouse?.(event)});
   }container.children=children;return container.render(width);},
  handleMouse(event){const result=container.handleMouse(event);if(result?.handled){for(const segment of group.members)if(segment.kind==='thinking')renderer.changed(segment.row);group.revision++;renderer.display.requestRender();}return result;},
  invalidate(){container.invalidate();},
 };}
 ungrouped(source){const renderer=this;return{render(width){renderer.detailsDepth++;try{return source.render(width);}finally{renderer.detailsDepth--;}},handleMouse(event){renderer.detailsDepth++;try{return source.handleMouse?.(event);}finally{renderer.detailsDepth--;}},invalidate:()=>source.invalidate?.()};}
 stop(){this.model.reset();this.callViews.clear();super.stop();}
 status(){return{version:'0.2.0',supported:this.supported,enabled:this.enabled,layout:this.display.status().mode,groups:this.model.status(),wrapped_records:this.views.size,lookups:this.lookupCount,images:'native-inline',interactive:'native-inline',thinking:'typed-with-tools'};}
}
