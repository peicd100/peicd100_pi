import {makePanel} from './panel_v0.15.0.mjs';
const scopes=new WeakMap();
const sessionKey=ctx=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile?.()??ctx.cwd]);
const guardFor=ctx=>{const own=scopes.get(ctx);if(own)return own();const key=sessionKey(ctx);return()=>sessionKey(ctx)===key;};
const capable=(ctx,deps)=>ctx.mode==='tui'&&typeof ctx.ui?.custom==='function'&&typeof ctx.ui.onTerminalInput==='function'&&typeof deps.SelectList?.prototype?.handleMouse==='function'&&['Container','Text','ScrollView','matchesKey','visibleWidth','truncateToWidth','stripTerminalSequences'].every(k=>typeof deps[k]==='function');
export function makeMenu({tui,theme,keybindings,done,title,items,deps,valid=()=>true}){
 const parts=String(title).split('\n'),caption=parts.shift(),description=parts.join('\n');
 const choices=items.map((label,index)=>({value:String(index),label:deps.stripTerminalSequences(label).replace(/[\r\n\t\x00-\x1f\x7f]/g,' ')}));
 // All choices are native rows; the single outer ScrollView owns scrolling.
 // This avoids a selected native virtual-list row being clipped by another
 // viewport, and lets us reveal its public selected-item index without peeking
 // at SelectList's private scroll offsets.
 const list=new deps.SelectList(choices,Math.max(1,choices.length),{selectedPrefix:s=>theme.fg('accent',s),selectedText:s=>theme.fg('accent',s),description:s=>theme.fg('muted',s),scrollInfo:s=>theme.fg('dim',s),noMatch:s=>theme.fg('muted',s)});
 const body=new deps.Container(),intro=description?new deps.Text(description,0,0):undefined;if(intro)body.addChild(intro);body.addChild(list);
 let version=0,descriptionRows=0,panel;
 const source={render:width=>{descriptionRows=intro?.render(width).length??0;return body.render(width);},invalidate:()=>body.invalidate(),handleMouse:event=>body.handleMouse?.(event)};
 list.onSelect=item=>{if(valid())done(items[Number(item.value)]);else done(undefined);};list.onCancel=()=>done(undefined);list.onSelectionChange=()=>{version++;};
 const selected=()=>Number(list.getSelectedItem()?.value??0);
 const move=(delta,page=false)=>{const i=selected(),next=page?Math.max(0,Math.min(choices.length-1,i+delta)):(i+delta+choices.length)%choices.length;list.setSelectedIndex(next);version++;panel.reveal(descriptionRows+next);};
 const match=(key,action)=>keybindings.matches(key,'tui.select.'+action);
 panel=makePanel({tui,theme,done,title:caption,source,deps,revision:()=>version,valid,hint:()=>`Ctrl+C／Esc返回；↑↓選項；Enter選取；滾輪可捲全文（${selected()+1}/${items.length}）`,input:key=>{
  if(match(key,'cancel'))done(undefined);
  else if(match(key,'confirm')){const item=list.getSelectedItem();if(item)list.onSelect(item);}
  else if(match(key,'up'))move(-1);else if(match(key,'down'))move(1);
  else if(match(key,'pageUp'))move(-Math.max(1,Math.floor((tui.terminal?.rows??24)*0.8)-2),true);
  else if(match(key,'pageDown'))move(Math.max(1,Math.floor((tui.terminal?.rows??24)*0.8)-2),true);
 }});
 return panel;
}
export async function showDetails(ctx,{title,body,source,revision=()=>0,valid,copy}={},deps){
 const current=valid??guardFor(ctx),ui=ctx.ui;
 if(!capable(ctx,deps)){if(typeof body==='string')ui.notify(body,'info');else ui.notify('目前介面不支援安全詳情檢視；保留原生內容。','info');return;}
 const content=source??new deps.Text(String(body??''),0,0);
 await ui.custom((tui,theme,_keys,done)=>makePanel({tui,theme,done,title,source:content,deps,revision,valid:current,copy:copy??deps.copyToClipboard}),{overlay:true,overlayOptions:{width:'90%',maxHeight:'90%'}});
}
export function scopedMenuAPI(api,deps){
 let epoch=0;for(const type of ['session_start','session_tree','session_shutdown'])api.on(type,()=>{epoch++;});
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
      const valid=capture();let finish,panel,closed=false;const abort=()=>finish?.(undefined);
      try{const selected=await owner.custom((tui,theme,keybindings,done)=>{
       finish=value=>{if(closed)return;closed=true;panel?.dispose();done(value);};
       panel=makeMenu({tui,theme,keybindings,done:finish,title,items,deps,valid});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();return panel;
      },prop==='confirm'?{blocked:{kind:'permission',message:String(args[0])}}:{overlay:true,overlayOptions:{width:'90%',maxHeight:'90%'}});
       if(!valid())return prop==='confirm'?false:undefined;return prop==='confirm'?selected==='確認':selected;
      }finally{signal?.removeEventListener('abort',abort);}
     };
     return typeof native==='function'?native.bind(owner):native;
    }});return ui;
   }
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});contexts.set(ctx,proxy);scopes.set(proxy,capture);return proxy;
 };
 return new Proxy(api,{get(target,key){
  if(key==='on')return(type,handler)=>target.on(type,(event,ctx)=>handler(event,wrap(ctx)));
  if(key==='registerCommand')return(name,options)=>target.registerCommand(name,{...options,handler:(args,ctx)=>options.handler(args,wrap(ctx))});
  if(key==='registerTool')return definition=>target.registerTool({...definition,execute:(id,params,signal,onUpdate,ctx)=>definition.execute(id,params,signal,onUpdate,wrap(ctx))});
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
