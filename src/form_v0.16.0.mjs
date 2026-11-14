import{makePanel}from'./panel_v0.16.0.mjs';
// Own input reuses native submit/paste/IME behavior. Native multiline editor
// stays in its original host layout/settings; see editor-guard_v0.16.0.mjs.
export function makeInputForm({tui,theme,keybindings,done,title,placeholder,deps,valid=()=>true,discard}){
 let closed=false,focused=false,asking=false,version=0,pane,layout,notice='',sourceValid=false,caret=-1,fieldStart=0,fieldHeight=0;
 const safe=()=>{try{return !closed&&valid();}catch{return false;}};
 const repaint=()=>{if(safe())tui.requestRender();};
 const settle=value=>{if(closed)return;closed=true;done(value);};
 const submit=value=>{if(!safe()){settle(undefined);return;}if(!layout?.ready||asking){notice='請放大視窗，確認輸入內容可見後再送出。';repaint();return;}settle(value);};
 let field,initial;
 const read=()=>field.getValue();
 const cancel=async()=>{
  if(!safe()){settle(undefined);return;}if(asking)return;
  const draft=read();if(draft===initial){settle(undefined);return;}
  if((tui.terminal?.columns??0)<24||(tui.terminal?.rows??0)<8){notice='內容尚未儲存，請放大視窗後確認是否放棄。';repaint();return;}
  asking=true;repaint();try{const yes=await discard();if(safe()&&yes===true){if(read()===draft)settle(undefined);else notice='確認期間內容變更，已保留輸入。';}}catch{notice='無法確認放棄，已保留輸入。';}finally{asking=false;repaint();}
 };
 const native=new deps.ExtensionInputComponent(String(title),placeholder,submit,()=>void cancel(),{tui});
 const Kind=deps.Input,children=native.children;
 if(!Array.isArray(children)||children.some(n=>n?.constructor!==Kind&&n?.constructor!==deps.Text&&n?.constructor!==deps.Spacer&&n?.constructor!==deps.DynamicBorder))throw Error('Unknown native form layout');
 const fields=children.filter(n=>n?.constructor===Kind);if(fields.length!==1)throw Error('Unverified public form field');field=fields[0];
 if(typeof field.handleInput!=='function'||typeof field.render!=='function'||typeof field.getValue!=='function')throw Error('Public form field API unavailable');
 const index=children.indexOf(field),before=children.slice(0,index).filter(n=>n?.constructor===deps.Text),after=children.slice(index+1).filter(n=>n?.constructor===deps.Text);
 if(!before.length||!after.length)throw Error('Unknown native form labels');
 const descriptions=before.slice(1),statuses=after.slice(0,-1),hint=after.at(-1);initial=read();
 const source={render(width){
  sourceValid=false;const lead=descriptions.flatMap(n=>n.render(width)),body=field.render(width),tail=statuses.flatMap(n=>n.render(width));
  fieldStart=lead.length;fieldHeight=body.length;const lines=[...lead,...body,...tail];
  sourceValid=lines.every(s=>typeof s==='string');caret=lines.findIndex(s=>s.includes(deps.CURSOR_MARKER));return lines;
 },invalidate(){native.invalidate?.();},handleMouse(event){if(event.y<fieldStart||event.y>=fieldStart+fieldHeight)return;const result=field.handleMouse?.({...event,y:event.y-fieldStart,height:fieldHeight});if(result?.handled){version++;repaint();}return result;}};
 pane=makePanel({tui,theme,title,source,deps,revision:()=>version,valid:safe,done:()=>{if(!safe())settle(undefined);else void cancel();},hint:()=>notice||deps.stripTerminalSequences(hint.render(Math.max(1,pane.status().bodyWidth??40)).join(' '))});
 const minimal=(width,height)=>{
  const renderWidth=Math.max(12,width),all=field.render(renderWidth),marker=deps.CURSOR_MARKER,row=all.findIndex(s=>s.includes(marker)),top=Math.max(0,Math.min(Math.max(0,all.length-height),row<0?0:row-height+1)),column=row<0?0:deps.visibleWidth(all[row].slice(0,all[row].indexOf(marker))),left=Math.max(0,column-width+1);
  const lines=all.slice(top,top+height).map((line,i)=>{
   const clean=line.split(marker).join(''),cursor=focused&&top+i===row,pos=Math.max(0,Math.min(width-1,column-left));
   const part=cursor?deps.sliceByColumn(clean,left,pos,true)+marker+deps.sliceByColumn(clean,left+pos,width-pos,true):deps.sliceByColumn(clean,left,width,true);
   return deps.truncateToWidth(part,width,'',true);
  });layout={kind:'minimal',width,height:lines.length,renderWidth,allHeight:all.length,top,left,ready:width>=12&&height>=3};return lines;
 };
 const match=(key,action)=>keybindings.matches(key,action);
 return new class Form{
  capturesViewportInput=true;
  get focused(){return focused;}
  set focused(value){focused=!!value;native.focused=focused;pane.focused=focused;}
  render(width){
   if(!safe()){settle(undefined);return[];}if(!Number.isSafeInteger(width)||width<1)return[];
   const height=Number.isSafeInteger(tui.terminal?.rows)&&tui.terminal.rows>0?tui.terminal.rows:24;
   // Drop decorative chrome when it would conceal the native caret. Public
   // cursor markers keep IME plumbing attached to the visible projected cell.
   if(height<12||width<18)return minimal(width,height);
   if(layout?.kind==='minimal')pane.invalidate();
   let lines=pane.render(width),state=pane.status();
   if(caret>=0&&state.bodyHeight>0&&(caret<state.scrollTop||caret>=state.scrollTop+state.bodyHeight)){pane.reveal(caret);lines=pane.render(width);state=pane.status();}
   layout={kind:'panel',width,height:lines.length,ready:sourceValid&&!state.sourceImages&&state.bodyHeight>0};return lines;
  }
  handleInput(key){
   if(!focused||!safe())return;
   if(deps.matchesKey(key,'escape')||deps.matchesKey(key,'ctrl+c')||match(key,'tui.select.cancel')){void cancel();return;}
   if(!layout?.ready&&(match(key,'tui.select.confirm')||match(key,'tui.input.submit')||key==='\n')){notice='請放大視窗後再送出。';repaint();return;}
   if(asking)return;native.handleInput(key);version++;repaint();
  }
  handleMouse(event){
   if(closed)return{handled:true};if(!safe()||!layout||asking)return;
   if(layout.kind==='minimal'){const result=field.handleMouse?.({...event,x:event.x+layout.left,y:event.y+layout.top,width:layout.renderWidth,height:layout.allHeight});if(result?.handled){version++;repaint();}return result;}
   const p=pane.status();if(event.type==='click'&&event.button==='left'&&event.y===p.headerY&&event.x>=p.closeX&&event.x<p.bodyX+p.bodyWidth){void cancel();return{handled:true};}
   return pane.handleMouse(event);
  }
  close(){void cancel();}
  invalidate(){pane.invalidate();}
  dispose(){closed=true;pane.dispose();native.dispose?.();}
  status(){return{closed,focused,asking,dirty:read()!==initial,layout:layout?{...layout}:undefined,panel:pane.status()};}
 };
}
