// Public fullscreen canvas. The native viewport consumes mouse reports before
// extension input listeners, so outside hit testing belongs in a Component.
// Regular mode stays a compact native overlay with keyboard cancellation.
export function makeDialogCanvas({panel,tui,theme,deps}){
 let focused=false,closed=false,frame,press;
 const equal=(a,b)=>a.x===b.x&&a.y===b.y&&a.width===b.width&&a.height===b.height&&a.viewportWidth===b.viewportWidth&&a.viewportHeight===b.viewportHeight;
 const inside=(event,rect)=>event.x>=rect.x&&event.x<rect.x+rect.width&&event.y>=rect.y&&event.y<rect.y+rect.height;
 const fullscreen=()=>tui.mode==='fullscreen';
 return new class DialogCanvas{
  capturesViewportInput=true;
  get focused(){return focused;}
  set focused(value){focused=!!value;panel.focused=focused;if(!focused)press=undefined;}
  render(width){
   // A host auth/permission/inline editor taking focus must not be covered by
   // an opaque backdrop. Native focus restoration reveals this dialog again.
   if(closed||!focused)return[];
   if(!fullscreen()){const lines=panel.render(width);frame={x:0,y:0,width,height:lines.length,viewportWidth:width,viewportHeight:lines.length};return lines;}
   if(!Number.isSafeInteger(width)||width<1)return[];
   const height=tui.terminal?.rows;if(!Number.isSafeInteger(height)||height<1)return panel.render(width);
   const innerWidth=Math.max(1,Math.min(110,Math.floor(width*0.9))),content=panel.render(innerWidth);if(!content.length)return[];
   const x=Math.floor((width-innerWidth)/2),y=Math.max(0,Math.floor((height-content.length)/2));
   frame={x,y,width:innerWidth,height:content.length,viewportWidth:width,viewportHeight:height};
   const shade=s=>typeof theme?.bg==='function'?theme.bg('toolSuccessBg',s):s,blank=shade(' '.repeat(width)),lines=Array.from({length:height},()=>blank);
   for(let i=0;i<content.length&&y+i<height;i++)lines[y+i]=shade(' '.repeat(x))+content[i]+shade(' '.repeat(Math.max(0,width-x-deps.visibleWidth(content[i]))));
   return lines;
  }
  handleInput(key){if(!closed&&focused)panel.handleInput?.(key);}
  handleMouse(event){
   // A stale captured target must consume its tail, never click through.
   if(closed)return{handled:true};if(!focused||!frame)return;
   const hit=inside(event,frame),modified=event.shift||event.alt||event.ctrl;
   if(event.type==='press'){press={...frame,x0:event.x,y0:event.y,outside:!hit,dragged:false,left:event.button==='left'&&!modified};}
   if(event.type==='drag'&&press)press.dragged=true;
   if(event.type==='release'&&press&&(press.x0!==event.x||press.y0!==event.y))press.dragged=true;
   if(event.type==='click'){
    const started=press;press=undefined;
    if(!hit&&event.button==='left'&&!modified&&started?.left&&started.outside&&!started.dragged&&started.x0===event.x&&started.y0===event.y&&equal(started,frame)){panel.close();return{handled:true};}
   }
   // Already-focused overlay: requesting focus again can pulse Focusable false
   // and clear the press before its release. Consume without changing focus.
   if(!hit)return{handled:true};
   const result=panel.handleMouse?.({...event,x:event.x-frame.x,y:event.y-frame.y,width:frame.width,height:frame.height});
   if(closed||panel.status?.()?.closed)return{handled:true};
   // Keep the overlay root as focus/capture target. It will retarget subsequent
   // events itself; do not expose a nested list as the overlay's focus owner.
   return result?.handled?{handled:true,focus:!!result.focus,capture:!!result.capture,render:result.render}:undefined;
  }
  close(){panel.close();}
  invalidate(){panel.invalidate?.();}
  dispose(){closed=true;press=undefined;panel.dispose?.();}
  status(){return{closed,focused,fullscreen:fullscreen(),frame:frame?{...frame}:undefined,panel:panel.status?.()};}
 };
}
