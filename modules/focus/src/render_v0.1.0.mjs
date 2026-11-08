import {ToolGroups} from './groups_v0.1.0.mjs';
// Ignore color and native OSC133 semantic prompt marks, not opaque/image
// protocols. Stripping every VT control could hide an image-only message.
const visibleLine=line=>typeof line!=='string'||line.replace(/\x1b\]133;[^\x07\x1b]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-9;:]*m/g,'').trim().length>0;
export function probeNative(deps){try{const C=deps.ToolExecutionComponent;if(typeof C!=='function'||typeof deps.Container!=='function'||['updateArgs','markExecutionStarted','setArgsComplete','updateResult','setExpanded','setOutputPad','render','invalidate','handleMouse'].some(k=>typeof C.prototype[k]!=='function'))return false;
 const empty={render:()=>[],invalidate(){}},test=new C('__focus_capability__','__focus_capability__',{}, {showImages:false},{renderShell:'self',renderCall:()=>empty,renderResult:()=>empty},{requestRender(){}},'.');return test.render(1).length===0;
 }catch{return false;}}
function interactive(component,deps){let visited=0;const seen=new Set();const visit=(c,depth)=>{if(!c||seen.has(c))return false;if(++visited>512||depth>20)return true;seen.add(c);if(typeof c.handleInput==='function'||c.capturesViewportInput)return true;
 if(c instanceof deps.Container){const handler=c.handleMouse;if(typeof handler==='function'&&handler!==deps.Container.prototype.handleMouse&&handler!==deps.Box?.prototype.handleMouse)return true;return c.children.some(child=>visit(child,depth+1));}return typeof c.handleMouse==='function';};return visit(component,0);}
export class FocusRenderer{
 constructor(deps){this.deps=deps;this.supported=probeNative(deps);this.root=undefined;this.active=true;this.enabled=false;this.serial=0;this.views=new Map();this.byState=new WeakMap();this.nativeViews=new WeakMap();this.probing=undefined;this.queued=new Set();this.flushing=false;this.layoutCache=undefined;this.layoutStatus='not-captured';this.state=new ToolGroups(id=>this.queue(this.views.get(id)));}
 setRoot(root){this.root=root;this.layoutCache=undefined;this.layoutStatus=root instanceof this.deps.Container?'ready':'no-public-container';}
 canWrap(){return this.active&&this.supported&&this.root instanceof this.deps.Container;}
 stop(){this.active=false;this.enabled=false;this.root=undefined;this.queued.clear();this.views.clear();this.state.rows.clear();this.state.groups.clear();}
 queue(view){if(!view||!this.active||this.probing)return;this.queued.add(view);if(this.flushing)return;this.flushing=true;queueMicrotask(()=>{this.flushing=false;const pending=[...this.queued];this.queued.clear();if(!this.active)return;for(const v of pending)if(this.views.has(v.id))try{v.ctx.invalidate();}catch{/* disposed native view */}});}
 setEnabled(enabled){this.enabled=enabled;this.layoutCache=undefined;for(const v of this.views.values())this.queue(v);}
 view(name,original,args,ctx,theme){if(!ctx?.state||typeof ctx.state!=='object')throw new Error('缺少公開工具renderer state');let view=this.byState.get(ctx.state);
 if(!view){const id=String(++this.serial);view={id,name,original,ctx,args,result:undefined,partial:false,error:false,durationMs:undefined,delegate:undefined,syncing:false,callInteractive:false,resultInteractive:false,regions:[],lastOpen:undefined,seen:false};this.byState.set(ctx.state,view);this.views.set(id,view);this.state.ensure(id,name,args);
  view.component={render:width=>this.renderView(view,width),invalidate:()=>{if(this.probing)this.nativeViews.set(this.probing,view);},handleMouse:event=>this.mouse(view,event)};
 }
 view.ctx=ctx;view.theme=theme??view.theme;view.args=args;this.state.ensure(view.id,name,args);this.state.sync(view.id,{argsComplete:ctx.argsComplete,started:ctx.executionStarted,hostExpanded:ctx.expanded});if(this.probing)this.nativeViews.set(this.probing,view);
 if(view.delegate)this.syncDelegate(view);return view;
 }
 wrap(name,original){const self=this;return {renderShell:'self',renderCall(args,_theme,ctx){return self.view(name,original,args,ctx,_theme).component;},renderResult(result,_options,_theme,ctx){const v=self.view(name,original,ctx.args,ctx,_theme);v.result=result;v.partial=!!ctx.isPartial;v.error=!!ctx.isError;v.durationMs=ctx.durationMs;self.state.result(v.id,result,v.partial,v.error,v.durationMs);if(v.delegate)self.syncDelegate(v);return {render:()=>[],invalidate(){}};}};}
 definition(view){if(!view.original)return undefined;const definition={...view.original};for(const [key,flag] of [['renderCall','callInteractive'],['renderResult','resultInteractive']]){const fn=view.original[key];if(typeof fn!=='function')continue;definition[key]=(...args)=>{const i=key==='renderCall'?2:3;args[i]={...args[i],showImages:view.ctx.showImages??args[i]?.showImages};const component=fn(...args);view[flag]=interactive(component,this.deps);this.state.sync(view.id,{interactive:view.callInteractive||view.resultInteractive});return component;};}return definition;}
 syncDelegate(view){if(!view.delegate)return;view.syncing=true;try{view.delegate.updateArgs(view.args);if(view.ctx.argsComplete&&!view.argsDone){view.argsDone=true;view.delegate.setArgsComplete();}if(view.ctx.executionStarted&&!view.started){view.started=true;view.delegate.markExecutionStarted();}
  if(view.outputPad!==view.ctx.outputPad&&typeof view.ctx.outputPad==='number'){view.outputPad=view.ctx.outputPad;view.delegate.setOutputPad(view.outputPad);}
  if(view.result)view.delegate.updateResult({...view.result,isError:view.error,durationMs:view.durationMs},view.partial);
 }finally{view.syncing=false;}}
 delegate(view){if(view.delegate)return view.delegate;const root=this.root,ui=new Proxy(root??{},{get:(target,key)=>{if(key==='requestRender')return ()=>{if(!view.syncing)this.queue(view);};const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
 view.syncing=true;try{view.delegate=new this.deps.ToolExecutionComponent(view.name,view.ctx.toolCallId,view.args,{showImages:false,outputPad:view.ctx.outputPad},this.definition(view),ui,view.ctx.cwd);this.syncDelegate(view);}finally{view.syncing=false;}return view.delegate;
 }
 // Only documented Component.invalidate()/render() and Container.children are
 // used. Invalidating an outer native tool view lets OUR renderer associate its
 // own state with that component; no private native IDs/fields are inspected.
 layout(width){if(this.layoutCache?.width===width)return this.layoutCache.groups;const groups=new Map(),cache={width,groups};this.layoutCache=cache;queueMicrotask(()=>{if(this.layoutCache===cache)this.layoutCache=undefined;});if(!this.canWrap())return groups;
  const parents=new Set(),ancestors=new Map(),seen=new Set();let count=0,overflow=false;const walk=(node,parent,depth)=>{if(!node||seen.has(node))return;seen.add(node);if(parent)ancestors.set(node,parent);if(++count>16384||depth>32){overflow=true;return;}if(node instanceof this.deps.ToolExecutionComponent){if(parent)parents.add(parent);return;}if(node instanceof this.deps.Container)for(const child of node.children)walk(child,node,depth+1);};walk(this.root,undefined,0);
  if(overflow){this.layoutStatus='tree-budget-exceeded';return groups;}
  const containing=new Set();for(const parent of parents)for(let node=parent;node;node=ancestors.get(node))containing.add(node);
  const runs=[],live=new Set(),mappedParents=new Set();let probingFailed=false;
  for(const parent of parents){let run=[];const flush=()=>{if(run.length)runs.push(run);run=[];};for(const node of parent.children){
   if(node instanceof this.deps.ToolExecutionComponent){let view=this.nativeViews.get(node);if(!view){this.probing=node;try{node.invalidate();view=this.nativeViews.get(node);}catch{probingFailed=true;}finally{this.probing=undefined;}}
    if(view&&this.views.has(view.id)&&!live.has(view)){this.probing=node;try{this.delegate(view);}finally{this.probing=undefined;}run.push(view.id);live.add(view);mappedParents.add(parent);view.seen=true;}else{probingFailed=true;flush();}
   }else{let visible=true;try{visible=containing.has(node)||node.render(width).some(visibleLine);}catch{/* preserve unknown/safety UI as a boundary */}if(visible)flush();}
  }flush();}
  if(mappedParents.size>1){this.layoutStatus='multiple-native-tool-parents';return groups;}
  try{this.state.applyLayout(runs);for(const view of live){const group=this.state.group(this.state.rows.get(view.id));if(group)groups.set(view,group);}this.layoutStatus=probingFailed?'partial-native-fallback':'ready';
   for(const view of this.views.values())if(view.seen&&!live.has(view)){this.views.delete(view.id);this.state.rows.delete(view.id);}
  }catch{groups.clear();this.layoutStatus='layout-unverified';}
  return groups;
 }
 nativeLines(view,width,expanded){const c=this.delegate(view);if(view.lastExpanded!==expanded){view.lastExpanded=expanded;view.syncing=true;try{c.setExpanded(expanded);}finally{view.syncing=false;}}return c.render(width);}
 renderView(view,width){view.regions=[];if(width<=0)return[];if(this.active&&!this.views.has(view.id)){this.views.set(view.id,view);this.state.ensure(view.id,view.name,view.args);this.state.sync(view.id,{argsComplete:view.ctx.argsComplete,started:view.ctx.executionStarted,hostExpanded:view.ctx.expanded,interactive:view.callInteractive||view.resultInteractive});if(view.result)this.state.result(view.id,view.result,view.partial,view.error,view.durationMs);this.layoutCache=undefined;this.queue(view);}this.delegate(view);
  const group=this.active&&this.enabled?this.layout(width).get(view):undefined;
  if(!group){const lines=this.nativeLines(view,width,!!view.ctx.expanded),trim=lines[0]===''?1:0;view.regions=[{view,start:-trim,height:lines.length}];return lines.slice(trim);}
  if(group.ids[0]!==view.id)return[];const open=this.state.open(group),theme=view.theme,style=group.failures.size?'error':'accent';
  // use native theme supplied by the renderer; a plain fallback is only for SDK
  // component fixtures, never a reconstruction of native statistics or messages.
  const title=this.state.header(group),header=theme?.fg?theme.fg(style,title):title,lines=[this.deps.truncateToWidth(header,width,'')];
  if(open){for(const id of group.ids){const child=this.views.get(id);if(!child)continue;const content=this.nativeLines(child,width,true);view.regions.push({view:child,start:lines.length,height:content.length});lines.push(...content);}}
  group.lastOpen=open;return lines;
 }
 mouse(view,event){const group=this.active&&this.enabled?this.layout(event.width).get(view):undefined;if(group&&group.ids[0]===view.id&&event.y===0&&event.type==='click'&&event.button==='left'){this.state.toggle(group);return {handled:true};}
  for(const r of view.regions)if(event.y>=Math.max(0,r.start)&&event.y<r.start+r.height)return this.delegate(r.view).handleMouse({...event,y:event.y-r.start,height:r.height});return undefined;
 }
 status(){return {supported:this.supported,enabled:this.enabled,layout:this.layoutStatus,groups:this.state.groups.size,wrapped_records:this.views.size,images:'native-outside-fold',interactive:'preserve-open'};}
}
