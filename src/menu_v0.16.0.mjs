import{randomUUID}from'node:crypto';
import{makePanel}from'./panel_v0.16.0.mjs';
import{makeDialogCanvas}from'./dialog_v0.16.0.mjs';
import{makeInputForm}from'./form_v0.16.0.mjs';
import{guardNativeEditor}from'./editor-guard_v0.16.0.mjs';
const scopes=new WeakMap(),closers=new WeakMap();
const sessionKey=ctx=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile?.()??ctx.cwd]);
const guardFor=ctx=>{const own=scopes.get(ctx);if(own)return own();const key=sessionKey(ctx);return()=>sessionKey(ctx)===key;};
const capable=(ctx,deps)=>ctx.mode==='tui'&&typeof ctx.ui?.custom==='function'&&typeof deps.SelectList?.prototype?.handleMouse==='function'&&['Container','Text','ScrollView','matchesKey','visibleWidth','truncateToWidth','stripTerminalSequences'].every(k=>typeof deps[k]==='function');
export function makeMenu({tui,theme,keybindings,done,title,items,deps,valid=()=>true,outside=()=>false}){
 const parts=String(title).split('\n'),caption=parts.shift(),description=parts.join('\n');
 const choices=items.map((label,index)=>({value:String(index),label:deps.stripTerminalSequences(label).replace(/[\r\n\t\x00-\x1f\x7f]/gu,' ')}));
 const list=new deps.SelectList(choices,Math.max(1,choices.length),{selectedPrefix:s=>theme.fg('accent',s),selectedText:s=>theme.fg('accent',s),description:s=>theme.fg('muted',s),scrollInfo:s=>theme.fg('dim',s),noMatch:s=>theme.fg('muted',s)});
 const body=new deps.Container(),intro=description?new deps.Text(description,0,0):undefined;if(intro)body.addChild(intro);body.addChild(list);
 let version=0,descriptionRows=0,panel;
 const source={render:width=>{descriptionRows=intro?.render(width).length??0;return body.render(width);},invalidate:()=>body.invalidate(),handleMouse:event=>body.handleMouse?.(event)};
 list.onSelect=item=>{if(valid())done(items[Number(item.value)]);else done(undefined);};list.onCancel=()=>done(undefined);list.onSelectionChange=()=>version++;
 const selected=()=>Number(list.getSelectedItem()?.value??0);
 const move=(delta,page=false)=>{const index=selected(),next=page?Math.max(0,Math.min(choices.length-1,index+delta)):(index+delta+choices.length)%choices.length;list.setSelectedIndex(next);version++;panel.reveal(descriptionRows+next);};
 const match=(key,action)=>keybindings.matches(key,'tui.select.'+action);
 panel=makePanel({tui,theme,done,title:caption,source,deps,revision:()=>version,valid,hint:()=>`Esc／Ctrl+C返回${outside()?'；外側點擊取消':''}；↑↓選擇，Enter確認（${selected()+1}/${items.length}）`,input:key=>{
  if(match(key,'cancel'))done(undefined);else if(match(key,'confirm')){const item=list.getSelectedItem();if(item)list.onSelect(item);}
  else if(match(key,'up'))move(-1);else if(match(key,'down'))move(1);
  else if(match(key,'pageUp'))move(-Math.max(1,panel.status().bodyHeight??1),true);else if(match(key,'pageDown'))move(Math.max(1,panel.status().bodyHeight??1),true);
 }});return panel;
}
async function openDialog(ctx,factory,{valid,signal,permission,deps}={}){
 const ui=ctx.ui,owned=closers.get(ctx);let finish,panel,activeTui,closed=false;
 const abort=()=>finish?.(undefined);
 try{
  return await ui.custom((tui,theme,keys,done)=>{
   activeTui=tui;
   finish=value=>{if(closed)return;closed=true;panel?.dispose?.();owned?.delete(finish);done(value);};owned?.add(finish);
   const content=factory({tui,theme,keys,done:finish,outside:()=>tui.mode==='fullscreen'});
   panel=makeDialogCanvas({panel:content,tui,theme,deps});
   signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();return panel;
  },{overlay:true,overlayOptions:()=>activeTui?.mode==='fullscreen'?{width:'100%',maxHeight:'100%',row:0,col:0}:{width:'90%',maxHeight:'90%'},...(permission?{blocked:{kind:'permission',message:permission}}:{})});
  // Overlay blocked is a native terminal-status hint, not a permission grant.
  // SDK1.5 ignores that hint for overlays; the awaited prompt still must be
  // explicitly confirmed, and ui_prompt lifecycle remains the waiting signal.
 }finally{signal?.removeEventListener('abort',abort);panel?.dispose?.();if(finish)owned?.delete(finish);}
}
async function openReadonly(ctx,factory,{valid,deps}){
 const ui=ctx.ui,owned=closers.get(ctx),key='peicd100-readonly-'+randomUUID();
 if(typeof ui.setWidget!=='function')throw Error('Public readonly UI unavailable');
 let canvas,handle,closed=false,finish,initialized=false,capturedTheme;
 const liveTheme=new Proxy({},{get(_target,prop){const theme=ui.theme??capturedTheme,value=theme?.[prop];return typeof value==='function'?value.bind(theme):value;}});
 const clean=()=>{if(closed)return;closed=true;canvas?.dispose();try{handle?.hide();}finally{try{ui.setWidget(key,undefined);}finally{owned?.delete(finish);}}};
 try{return await new Promise((resolve,reject)=>{
  finish=()=>{if(closed)return;try{clean();resolve(undefined);}catch(error){reject(error);}};owned?.add(finish);
  const empty={render:()=>[],invalidate(){canvas?.invalidate();},dispose(){finish();}};
  try{
   if(!valid()){finish();return;}
   // A zero-row public widget factory gives us the SAME host TUI. It creates
   // no second renderer/editor/footer and no ui_prompt waiting span. Raw
   // showOverlay owns its own hide/dispose lifecycle, unlike ctx.ui.custom.
   ui.setWidget(key,(tui,theme)=>{
    initialized=true;capturedTheme=theme;if(closed||canvas)return empty;
    try{
     if(typeof tui.showOverlay!=='function')throw Error('Public overlay unavailable');
     const panel=factory({tui,theme:liveTheme,done:finish,outside:()=>tui.mode==='fullscreen'});
     canvas=makeDialogCanvas({panel,tui,theme:liveTheme,deps});
     handle=tui.showOverlay(canvas,tui.mode==='fullscreen'?{width:'100%',maxHeight:'100%',row:0,col:0}:{width:'90%',maxHeight:'90%'});
    }catch(error){queueMicrotask(()=>{try{clean();}catch{}reject(error);});}
    return empty;
   });
   // Confirmed synchronous on supported SDK1.1/1.5. Null/RPC/opaque UI must
   // fail safely rather than leave an unresolvable promise behind.
   if(!initialized)throw Error('Public TUI factory was not invoked');
  }catch(error){try{clean();}finally{reject(error);}}
 });}finally{if(!closed)clean();}
}
export async function showDetails(ctx,{title,body,source,revision=()=>0,valid,copy}={},deps){
 const scope=guardFor(ctx),current=()=>scope()&&(valid?.()??true),ui=ctx.ui;
 if(!capable(ctx,deps)){ui.notify(typeof body==='string'?body:'目前介面不支援安全詳情檢視，保留原生內容。','info');return;}
 const content=source??new deps.Text(String(body??''),0,0);
 try{await openReadonly(ctx,({tui,theme,done,outside})=>makePanel({tui,theme,done,title,source:content,deps,revision,valid:current,copy:copy??deps.copyToClipboard,hint:()=>`Esc／Ctrl+C關閉${outside()?'；外側點擊關閉':''}；↑↓／PgUp／PgDn翻閱`}),{valid:current,deps});}
 catch{ui.notify('目前介面無法安全開啟只讀詳情，原工作與原生內容保持不變。','warning');}
}
export function scopedMenuAPI(api,deps){
 let epoch=0;const active=new Set();for(const type of ['session_start','session_tree','session_shutdown'])api.on(type,()=>{epoch++;for(const finish of [...active])finish(undefined);});
 const contexts=new WeakMap();
 const wrap=ctx=>{
  if(!ctx||typeof ctx!=='object')return ctx;if(contexts.has(ctx))return contexts.get(ctx);let ui;
  const capture=()=>{const value=epoch,key=sessionKey(ctx);return()=>epoch===value&&sessionKey(ctx)===key;};
  const proxy=new Proxy(ctx,{get(target,key){
   if(key==='ui'){
    if(!ui)ui=new Proxy(target.ui,{get(owner,prop){
     const native=Reflect.get(owner,prop,owner);
     if((prop==='select'||prop==='confirm')&&typeof native==='function')return async(...args)=>{
      const options=args[2],signal=options?.signal;
      if(!capable(target,deps)||(options&&Object.keys(options).some(k=>k!=='signal'))||(signal&&(typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function')))return native.apply(owner,args);
      if(signal?.aborted)return prop==='confirm'?false:undefined;
      const title=prop==='confirm'?`${args[0]}\n${args[1]}`:args[0],items=prop==='confirm'?['取消（預設）','確認']:args[1];
      if(!Array.isArray(items)||!items.length||items.some(s=>typeof s!=='string'))return prop==='confirm'?false:undefined;
      const valid=capture(),selected=await openDialog(proxy,({tui,theme,keys,done,outside})=>makeMenu({tui,theme,keybindings:keys,done,title,items,deps,valid,outside}),{valid,signal,deps,permission:prop==='confirm'?String(args[0]):undefined});
      if(!valid())return prop==='confirm'?false:undefined;return prop==='confirm'?selected==='確認':selected;
     };
     if(prop==='input'&&typeof native==='function')return async(...args)=>{
      const options=args[2],signal=options?.signal;
      if(!capable(target,deps)||!['ExtensionInputComponent','Input','Spacer','DynamicBorder','sliceByColumn'].every(k=>typeof deps[k]==='function')||typeof deps.CURSOR_MARKER!=='string'||(options&&Object.keys(options).some(k=>k!=='signal'))||(signal&&(typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function')))return native.apply(owner,args);
      if(signal?.aborted)return undefined;const valid=capture();
      try{return await openDialog(proxy,({tui,theme,keys,done})=>makeInputForm({tui,theme,keybindings:keys,done,title:args[0],placeholder:args[1],deps,valid,discard:()=>ui.confirm('放棄未儲存的輸入？','取消會保留目前文字；只有明確確認才會關閉，不會替你提交設定或撤回已送出的工作。')}),{valid,signal,deps});}
      catch{if(!valid())return undefined;owner.notify?.('輸入版面無法安全驗證，保留原生輸入與取消流程，不新增外點關閉。','warning');return native.apply(owner,args);}
     };
     if(prop==='editor'&&typeof native==='function')return(...args)=>{
      if(target.mode!=='tui'||args.length>2||typeof owner.setWidget!=='function'||typeof owner.onTerminalInput!=='function'||typeof deps.ExtensionEditorComponent!=='function'||typeof deps.Editor?.prototype?.getExpandedText!=='function'||typeof deps.getKeybindings!=='function')return native.apply(owner,args);
      return guardNativeEditor(proxy,native.bind(owner),args,deps,{valid:capture(),owned:active});
     };
     return typeof native==='function'?native.bind(owner):native;
    }});return ui;
   }
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});contexts.set(ctx,proxy);scopes.set(proxy,capture);closers.set(proxy,active);return proxy;
 };
 return new Proxy(api,{get(target,key){
  if(key==='on')return(type,handler)=>target.on(type,(event,ctx)=>handler(event,wrap(ctx)));
  if(key==='registerCommand')return(name,options)=>target.registerCommand(name,{...options,handler:(args,ctx)=>options.handler(args,wrap(ctx))});
  if(key==='registerTool')return definition=>target.registerTool({...definition,execute:(id,params,signal,onUpdate,ctx)=>definition.execute(id,params,signal,onUpdate,wrap(ctx))});
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
