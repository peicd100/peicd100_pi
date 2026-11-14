// Shared framed surface. Only resolves its own UI; never aborts a job.
export function makePanel({tui,theme,done,title,source,deps,revision,copy,input,hint,initialEnd=false,valid=()=>true}){
 if(!tui||typeof done!=='function'||typeof source?.render!=='function'||typeof revision!=='function'||typeof deps.ScrollView!=='function'||!['truncateToWidth','visibleWidth','matchesKey','stripTerminalSequences'].every(k=>typeof deps[k]==='function'))throw Error('Panel public API unavailable');
 const {truncateToWidth,visibleWidth,matchesKey,stripTerminalSequences}=deps;
 const scroll=new deps.ScrollView(source,{follow:'none',overscroll:'contain',scrollbar:'hidden'});
 let closed=false,cached,copying=false,notice='',last,initialized=false,following=initialEnd;
 const updateFollowing=()=>{following=initialEnd&&!!last&&scroll.scrollTop>=Math.max(0,last.allHeight-last.bodyHeight);};
 const safe=()=>{try{return !closed&&valid();}catch{return false;}};
 const repaint=()=>{if(safe())tui.requestRender();};
 const close=()=>{if(closed)return;closed=true;done(undefined);};
 const fg=(kind,text)=>typeof theme?.fg==='function'?theme.fg(kind,text):text;
 const bg=text=>typeof theme?.bg==='function'?theme.bg('customMessageBg',text):text;
 const caption=stripTerminalSequences(String(title??'')).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ');
 const data=width=>{
  const key=revision();if(cached?.width===width&&cached.key===key)return cached;
  const lines=source.render(width);if(!Array.isArray(lines)||lines.some(s=>typeof s!=='string'))throw Error('Unverified panel source');
  const images=lines.some(s=>/\x1b_G|\x1b\]1337;File=|\x1bP[0-9;]*q/u.test(s));
  return cached={width,key,lines:images?['內容含圖片，請留在主畫面原生檢視。']:lines,images};
 };
 const copyText=async()=>{
  if(copying||!safe()||typeof copy!=='function'||!cached)return;
  if(cached.images){notice='圖片請留在主畫面，不複製圖片協定。';repaint();return;}
  const text=stripTerminalSequences(cached.lines.join('\n'));
  if(new TextEncoder().encode(text).byteLength>1048576){notice='文字超過複製上限，請分段選取。';repaint();return;}
  copying=true;repaint();
  try{await copy(text);if(safe())notice='已複製顯示文字。';}catch{if(safe())notice='無法複製，可使用終端選取複製。';}
  finally{copying=false;repaint();}
 };
 return new class Panel{
  focused=false;
  capturesViewportInput=true;
  render(width){
   if(!safe()){close();return[];}if(!Number.isSafeInteger(width)||width<1)return[];
   const rows=Number.isSafeInteger(tui.terminal?.rows)&&tui.terminal.rows>0?tui.terminal.rows:24;
   const ceiling=Math.max(1,Math.min(40,Math.floor(rows*0.8))),framed=width>=10&&ceiling>=7,pad=framed?(width>=18?2:1):0,bodyWidth=Math.max(1,width-(framed?2+pad*2:0));
   let all;try{all=data(bodyWidth);}catch{cached=undefined;all={lines:['內容無法驗證，原工作未被中斷。'],images:false};}
   const overhead=framed?6:ceiling===1?1:2,bodyHeight=Math.max(0,Math.min(Math.max(1,all.lines.length),ceiling-overhead));
   const changed=last&&last.sourceKey!==all.key;
   scroll.updateLayout(all.lines.length,bodyHeight,repaint);
   const request=source.takeScrollRequest?.();
   if(!initialized){initialized=true;if(initialEnd)scroll.scrollToEnd();}
   if(request?.end===true)scroll.scrollToEnd();
   else if(Number.isSafeInteger(request?.row)){
    if(Number.isSafeInteger(request.offset))scroll.scrollBy(request.row-request.offset-scroll.scrollTop);
    else if(request.row<scroll.scrollTop)scroll.scrollBy(request.row-scroll.scrollTop);
    else if(request.row>=scroll.scrollTop+bodyHeight)scroll.scrollBy(request.row-scroll.scrollTop-bodyHeight+1);
   }else if(changed&&following)scroll.scrollToEnd();
   const atEnd=scroll.scrollTop>=Math.max(0,all.lines.length-bodyHeight);if(request)following=initialEnd&&atEnd;
   source.panelLayout?.({scrollTop:scroll.scrollTop,bodyHeight,bodyWidth,atEnd});
   const body=all.lines.slice(scroll.scrollTop,scroll.scrollTop+bodyHeight).map(s=>truncateToWidth(s,bodyWidth,''));while(body.length<bodyHeight)body.push('');
   const closeLabel=bodyWidth>=6?'[關閉]':'[X]',copyLabel=copying?'[複製中]':'[複製]',showCopy=typeof copy==='function'&&bodyWidth>=24;
   const buttons=(showCopy?copyLabel+' ':'')+closeLabel,buttonsWidth=Math.min(bodyWidth,visibleWidth(buttons)),leftWidth=Math.max(0,bodyWidth-buttonsWidth-1),left=truncateToWidth(caption,leftWidth,'');
   const header=truncateToWidth(fg('accent',left)+' '.repeat(Math.max(0,bodyWidth-visibleWidth(left)-buttonsWidth))+fg('accent',buttons),bodyWidth,'');
   const bodyX=framed?1+pad:0,bodyY=framed?3:1,headerY=framed?1:0,closeX=bodyX+Math.max(0,bodyWidth-visibleWidth(closeLabel)),copyX=showCopy?closeX-visibleWidth(copyLabel)-1:undefined;
   const actions=Array.isArray(source.panelActions)?source.panelActions:[],actionText=actions.map(a=>a.label).join(' ');
   const help=notice||(actionText?`${actionText}  Esc返回；Enter展收；End到底`:undefined)||(typeof hint==='function'?hint():undefined)||`Esc／Ctrl+C關閉${showCopy?'；Ctrl+Y複製':''}；↑↓翻閱 ${Math.min(scroll.scrollTop+1,Math.max(1,all.lines.length))}/${Math.max(1,all.lines.length)}行`;
   const row=text=>fg('border','│')+bg(' '.repeat(pad)+truncateToWidth(text,bodyWidth,'')+' '.repeat(Math.max(0,bodyWidth-visibleWidth(truncateToWidth(text,bodyWidth,''))))+' '.repeat(pad))+fg('border','│');
   let lines;
   if(framed)lines=[fg('border','╭'+'─'.repeat(width-2)+'╮'),row(header),row(''),...body.map(row),row(''),row(fg('dim',help)),fg('border','╰'+'─'.repeat(width-2)+'╯')];
   else lines=ceiling===1?[header]:[header,...body,truncateToWidth(fg('dim',help),width,'')];
   last={width,height:lines.length,bodyWidth,bodyHeight,bodyX,bodyY,headerY,closeX,copyX,copyWidth:showCopy?visibleWidth(copyLabel):0,allHeight:all.lines.length,framed,sourceKey:all.key,actions,actionY:framed?lines.length-2:lines.length-1};return lines;
  }
  handleInput(key){
   if(!this.focused||!safe())return;
   if(matchesKey(key,'ctrl+c')||matchesKey(key,'escape')){close();return;}
   if(matchesKey(key,'ctrl+y')){void copyText();return;}
   if(input){input(key);cached=undefined;repaint();return;}
   if(source.navigateKey?.(key)===true){cached=undefined;if(!source.preserveScrollOnNavigate)scroll.scrollToStart();repaint();return;}
   if(matchesKey(key,'return'))close();
   else if(matchesKey(key,'up'))scroll.scrollBy(-1);
   else if(matchesKey(key,'down'))scroll.scrollBy(1);
   else if(matchesKey(key,'pageUp'))scroll.scrollBy(-Math.max(1,last?.bodyHeight??1));
   else if(matchesKey(key,'pageDown'))scroll.scrollBy(Math.max(1,last?.bodyHeight??1));
   else if(matchesKey(key,'home'))scroll.scrollToStart();else if(matchesKey(key,'end'))scroll.scrollToEnd();updateFollowing();repaint();
  }
  handleMouse(event){
   if(!safe()||!last||event.x<0||event.x>=last.width||event.y<0||event.y>=last.height)return;
   if(event.type==='click'&&event.button==='left'&&event.y===last.headerY){if(event.x>=last.closeX&&event.x<last.bodyX+last.bodyWidth){close();return{handled:true};}if(last.copyX!==undefined&&event.x>=last.copyX&&event.x<last.copyX+last.copyWidth){void copyText();return{handled:true,focus:true};}}
   if(event.type==='click'&&event.button==='left'&&event.y===last.actionY){let x=last.bodyX;for(const action of last.actions){const end=x+visibleWidth(action.label);if(event.x>=x&&event.x<end){action.run();cached=undefined;repaint();return{handled:true,focus:true,focusTarget:this};}x=end+1;}}
   if(event.type==='wheel'&&event.wheelDelta){scroll.scrollBy(event.wheelDelta);updateFollowing();return{handled:true,focus:true};}
   if(event.x>=last.bodyX&&event.x<last.bodyX+last.bodyWidth&&event.y>=last.bodyY&&event.y<last.bodyY+last.bodyHeight){const result=source.handleMouse?.({...event,x:event.x-last.bodyX,y:event.y-last.bodyY+scroll.scrollTop,width:last.bodyWidth,height:last.allHeight});if(result?.handled){cached=undefined;repaint();return{...result,focus:true,focusTarget:this};}}
   // Do not capture body press/drag: native selection and OSC8 links retain priority.
  }
  reveal(row){if(!safe()||!Number.isSafeInteger(row)||row<0||!last?.bodyHeight)return;if(row<scroll.scrollTop)scroll.scrollBy(row-scroll.scrollTop);else if(row>=scroll.scrollTop+last.bodyHeight)scroll.scrollBy(row-scroll.scrollTop-last.bodyHeight+1);repaint();}
  close(){close();}
  invalidate(){cached=undefined;source.invalidate?.();}
  dispose(){closed=true;}
  status(){return{closed,copying,scrollTop:scroll.scrollTop,sourceImages:cached?.images??false,...last};}
 };
}
