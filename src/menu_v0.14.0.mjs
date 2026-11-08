// No host imports here: components/keybindings are injected by the active Pi runtime.
export function makeMenu({tui,theme,keybindings,done,title,items,deps}){
 const {Container,Text,SelectList,truncateToWidth}=deps;
 const choices=items.map((label,index)=>({value:String(index),label}));
 const rows=Math.min(Math.max(choices.length,1),12);
 const list=new SelectList(choices,rows,{selectedPrefix:s=>theme.fg('accent',s),selectedText:s=>theme.fg('accent',s),description:s=>theme.fg('muted',s),scrollInfo:s=>theme.fg('dim',s),noMatch:s=>theme.fg('muted',s)});
 list.onSelect=item=>done(items[Number(item.value)]);list.onCancel=()=>done(undefined);
 const container=new Container();container.addChild(new Text(theme.fg('accent',title),0,0));container.addChild(list);
 container.addChild({render:width=>[truncateToWidth(theme.fg('dim','上下鍵／Enter／Esc；fullscreen可點選與滾輪'),Math.max(0,width))],invalidate(){}});
 const move=(delta,page=false)=>{const selected=list.getSelectedItem(),index=selected?Number(selected.value):0;const next=page?Math.max(0,Math.min(choices.length-1,index+delta)):((index+delta)%choices.length+choices.length)%choices.length;list.setSelectedIndex(next);};
 return {capturesViewportInput:true,render:width=>width<=0?[]:container.render(width).map(line=>truncateToWidth(line,width)),invalidate:()=>container.invalidate(),
  handleInput(data){
   if(keybindings.matches(data,'tui.select.cancel'))done(undefined);
   else if(keybindings.matches(data,'tui.select.confirm')){const selected=list.getSelectedItem();if(selected)done(items[Number(selected.value)]);}
   else if(keybindings.matches(data,'tui.select.up'))move(-1);
   else if(keybindings.matches(data,'tui.select.down'))move(1);
   else if(keybindings.matches(data,'tui.select.pageUp'))move(-rows,true);
   else if(keybindings.matches(data,'tui.select.pageDown'))move(rows,true);
   tui.requestRender();
  },
  handleMouse(event){const result=container.handleMouse?.(event);if(result?.handled)tui.requestRender();return result;}
 };
}
export function mouseMenuAPI(api,deps){
 const contexts=new WeakMap();
 const wrap=ctx=>{
  if(!ctx||typeof ctx!=='object')return ctx;if(contexts.has(ctx))return contexts.get(ctx);let ui;
  const proxy=new Proxy(ctx,{get(target,key){
   if(key==='ui'){
    if(!ui)ui=new Proxy(target.ui,{get(owner,prop){
     const native=Reflect.get(owner,prop,owner);
     if((prop==='select'||prop==='confirm')&&typeof native==='function')return async(...args)=>{
      // Preserve RPC/print, native timed dialogs/unknown options and old hosts.
      // A plain AbortSignal is supported explicitly so Theme's scope guard is
      // kept while its menu also gains native fullscreen mouse selection.
      const options=args[2],signal=options?.signal;
      // Require the public native terminal-input capability as well: partial
      // embedded/SDK UI contexts may wrap custom() without implementing it.
      if(target.mode!=='tui'||typeof owner.custom!=='function'||typeof owner.onTerminalInput!=='function'||typeof deps.SelectList.prototype.handleMouse!=='function'||(options&&Object.keys(options).some(k=>k!=='signal'))||(signal&&(typeof signal.addEventListener!=='function'||typeof signal.removeEventListener!=='function')))return native.apply(owner,args);
      if(signal?.aborted)return prop==='confirm'?false:undefined;
      const title=prop==='confirm'?`${args[0]}\n\n${args[1]}`:args[0],items=prop==='confirm'?['確認','取消']:args[1];
      if(!Array.isArray(items)||items.length===0)return prop==='confirm'?false:undefined;
      let finish;const abort=()=>finish?.(undefined);
      try{const selected=await owner.custom((tui,theme,keybindings,done)=>{
       let closed=false;finish=value=>{if(closed)return;closed=true;done(value);};signal?.addEventListener('abort',abort,{once:true});
       const component=makeMenu({tui,theme,keybindings,done:finish,title,items,deps});if(signal?.aborted)abort();return component;
      },{blocked:{kind:prop==='confirm'?'permission':'question',message:String(args[0])}});
       return prop==='confirm'?selected==='確認':selected;
      }finally{signal?.removeEventListener('abort',abort);}
     };
     return typeof native==='function'?native.bind(owner):native;
    }});return ui;
   }
   const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
  }});contexts.set(ctx,proxy);return proxy;
 };
 return new Proxy(api,{get(target,key){
  if(key==='on')return(type,handler)=>target.on(type,(event,ctx)=>handler(event,wrap(ctx)));
  if(key==='registerCommand')return(name,options)=>target.registerCommand(name,{...options,handler:(args,ctx)=>options.handler(args,wrap(ctx))});
  if(key==='registerTool')return definition=>target.registerTool({...definition,execute:(id,params,signal,onUpdate,ctx)=>definition.execute(id,params,signal,onUpdate,wrap(ctx))});
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
