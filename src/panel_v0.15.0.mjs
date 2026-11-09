// Shared read-only/choice surface. Close only resolves the UI; it owns no job.
export function makePanel({tui,theme,done,title,source,deps,revision,copy,input,hint,valid=()=>true}){
 if(!tui||typeof done!=='function'||typeof source?.render!=='function'||typeof revision!=='function'||typeof deps.ScrollView!=='function'||!['truncateToWidth','visibleWidth','matchesKey','stripTerminalSequences'].every(k=>typeof deps[k]==='function'))throw new Error('Panel public API unavailable');
 const {truncateToWidth,visibleWidth,matchesKey,stripTerminalSequences}=deps;
 const scroll=new deps.ScrollView(source,{follow:'none',overscroll:'contain',scrollbar:'hidden'});
 let closed=false,cached,copying=false,notice='',last;
 const safe=()=>{try{return !closed&&valid();}catch{return false;}};
 const repaint=()=>{if(safe())tui.requestRender();};
 const close=()=>{if(closed)return;closed=true;done(undefined);};
 const style=(kind,text)=>typeof theme?.fg==='function'?theme.fg(kind,text):text;
 const caption=stripTerminalSequences(String(title)).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g,' ');
 const data=width=>{
  const key=revision();if(cached?.width===width&&cached.key===key)return cached;
  const lines=scroll.render(width);
  if(!Array.isArray(lines)||lines.some(line=>typeof line!=='string'))throw new Error('Unverified panel source');
  const images=lines.some(line=>/\x1b_G|\x1b\]1337;File=|\x1bP[0-9;]*q/u.test(line));
  cached={width,key,lines:images?['內容含圖片；請保留在主畫面原生檢視，不裁切圖片協定。']:lines,images};return cached;
 };
 const copyText=async()=>{
  if(copying||!safe()||typeof copy!=='function'||!cached)return;
  if(cached.images){notice='圖片請留在主畫面原生檢視，不複製圖片協定。';repaint();return;}
  const text=stripTerminalSequences(cached.lines.join('\n'));
  if(new TextEncoder().encode(text).byteLength>1048576){notice='文字超過複製上限，請分段選取。';repaint();return;}
  copying=true;repaint();
  try{await copy(text);if(safe())notice='已複製顯示文字。';}catch{if(safe())notice='無法複製；可選取後使用終端複製。';}
  finally{copying=false;repaint();}
 };
 return new class Panel{
  focused=false;
  capturesViewportInput=true;
  render(width){
   if(!safe()){close();return[];}if(!Number.isSafeInteger(width)||width<=0)return[];
   const height=Math.max(1,Math.min(40,Math.floor((tui.terminal?.rows??24)*0.8))),bodyHeight=Math.max(0,height-2);
   const closeLabel='[關閉]',copyLabel=copying?'[複製中]':'[複製]',showCopy=typeof copy==='function'&&width>=20;
   const buttons=(showCopy?copyLabel+' ':'')+closeLabel,buttonsWidth=Math.min(width,visibleWidth(buttons)),leftWidth=Math.max(0,width-buttonsWidth-1);
   const left=truncateToWidth(caption,leftWidth,''),gap=Math.max(0,width-visibleWidth(left)-buttonsWidth);
   const header=truncateToWidth(style('accent',left)+' '.repeat(gap)+style('accent',buttons),width,'');
   const closeX=Math.max(0,width-Math.min(width,visibleWidth(closeLabel))),copyX=showCopy?Math.max(0,closeX-visibleWidth(copyLabel)-1):undefined;
   let all,body=[];try{all=data(width);scroll.updateLayout(all.lines.length,bodyHeight,repaint);body=all.lines.slice(scroll.scrollTop,scroll.scrollTop+bodyHeight).map(line=>truncateToWidth(line,width,''));}catch{cached=undefined;all={lines:['內容無法驗證；原工作未被中斷。'],images:false};body=all.lines.slice(0,bodyHeight);}
   while(body.length<bodyHeight)body.push('');
   const help=notice||(typeof hint==='function'?hint():undefined)||`Ctrl+C／Esc關閉${showCopy?'；Ctrl+Y複製顯示文字':'；選取後用終端複製'}；↑↓/PgUp/PgDn ${scroll.scrollTop+1}/${Math.max(1,all.lines.length)}行`;
   last={width,height,bodyHeight,closeX,copyX,copyWidth:showCopy?visibleWidth(copyLabel):0,allHeight:all.lines.length};
   return height===1?[header]:[header,...body,truncateToWidth(style('dim',help),width,'')];
  }
  handleInput(key){
   if(!this.focused||!safe())return;
   if(matchesKey(key,'ctrl+c')||matchesKey(key,'escape')){close();return;}
   if(matchesKey(key,'ctrl+y')){void copyText();return;}
   if(input){input(key);cached=undefined;repaint();return;}
   if(matchesKey(key,'return'))close();
   else if(matchesKey(key,'up'))scroll.scrollBy(-1);
   else if(matchesKey(key,'down'))scroll.scrollBy(1);
   else if(matchesKey(key,'pageUp'))scroll.scrollBy(-Math.max(1,last?.bodyHeight??1));
   else if(matchesKey(key,'pageDown'))scroll.scrollBy(Math.max(1,last?.bodyHeight??1));
   else if(matchesKey(key,'home'))scroll.scrollToStart();
   else if(matchesKey(key,'end'))scroll.scrollToEnd();
   repaint();
  }
  handleMouse(event){
   if(!safe()||!last||event.x<0||event.x>=last.width||event.y<0||event.y>=last.height)return undefined;
   if(event.type==='click'&&event.button==='left'&&event.y===0){if(event.x>=last.closeX){close();return{handled:true};}if(last.copyX!==undefined&&event.x>=last.copyX&&event.x<last.copyX+last.copyWidth){void copyText();return{handled:true,focus:true};}}
   if(event.type==='wheel'&&event.wheelDelta){scroll.scrollBy(event.wheelDelta);return{handled:true,focus:true};}
   if(event.y>=1&&event.y<1+last.bodyHeight){const result=source.handleMouse?.({...event,y:event.y-1+scroll.scrollTop,width:last.width,height:last.allHeight});if(result?.handled){cached=undefined;repaint();return{...result,focus:true,focusTarget:this};}}
   // No press/drag capture: native terminal text selection must remain available.
   return undefined;
  }
  reveal(row){if(!safe()||!Number.isSafeInteger(row)||row<0||!last?.bodyHeight)return;if(row<scroll.scrollTop)scroll.scrollBy(row-scroll.scrollTop);else if(row>=scroll.scrollTop+last.bodyHeight)scroll.scrollBy(row-scroll.scrollTop-last.bodyHeight+1);repaint();}
  invalidate(){cached=undefined;source.invalidate?.();}
  dispose(){closed=true;}
  status(){return{closed,copying,scrollTop:scroll.scrollTop,sourceImages:cached?.images??false};}
 };
}
