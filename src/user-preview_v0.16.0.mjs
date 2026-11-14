// Verified native public layout only. Preserve original Markdown, message text,
// native padding/zones and real attachment/image output. No summarizing/model IO.
export function createUserPreview(node,deps,{limit=()=>10,enabled=()=>true,changed=()=>{},styleControl=s=>s,revision=()=>0}={}){
 const{UserMessageComponent,Markdown,truncateToWidth,stripTerminalSequences,visibleWidth}=deps;
 let expanded=false,stopped=false,cache,prepared,mounted,backing,sourceRenders=0,layout='not-rendered',reason;
 const inspect=()=>{if(mounted&&node.children===mounted)return backing;const child=typeof UserMessageComponent==='function'&&typeof Markdown==='function'&&node?.constructor===UserMessageComponent&&Array.isArray(node.children)&&node.children.length===1&&node.children[0]?.constructor===Markdown?node.children[0]:undefined;if(child)backing=child;return child;};
 const budget=()=>{const n=limit();return Number.isSafeInteger(n)&&n>=1&&n<=200?n:10;};
 const toggle=value=>{expanded=typeof value==='boolean'?value:!expanded;changed();};
 const unsafe=line=>(typeof deps.isImageLine==='function'&&deps.isImageLine(line))||/\x1b(?:_G|\]1337;File=)/u.test(line)||(typeof deps.CURSOR_MARKER==='string'&&line.includes(deps.CURSOR_MARKER));
 const prepare=width=>{
  prepared=undefined;reason=undefined;
  const child=inspect();if(!child||![truncateToWidth,stripTerminalSequences,visibleWidth].every(fn=>typeof fn==='function')){reason='shape';return false;}
  if(!Number.isSafeInteger(width)||width<12){reason='narrow';return false;}
  const rev=revision();if(cache?.child!==child||cache.width!==width||cache.revision!==rev){
   if(cache&&cache.revision!==rev)child.invalidate?.();
   const full=child.render(width);sourceRenders++;
   if(!Array.isArray(full)||full.length<2||full.some(s=>typeof s!=='string')||stripTerminalSequences(full[0]).trim()!==''||stripTerminalSequences(full.at(-1)).trim()!==''){reason='native-padding';return false;}
   cache={child,width,revision:rev,full,content:full.slice(1,-1),unsafe:full.some(unsafe)};
  }
  if(cache.unsafe){reason='image-or-cursor';return false;}
  const max=budget(),content=cache.content,long=content.length>max;if(!long){reason='short';return false;}
  let count=max;
  // A visual-line limit is a ceiling, not a promise to cut through a paragraph.
  // Prefer a nearby paragraph boundary, but never reduce a long paragraph to
  // an empty preview or pretend native visual rows are original source lines.
  for(let i=max-1;i>=Math.max(1,Math.ceil(max*0.6));i--)if(stripTerminalSequences(content[i]).trim()===''){count=i;while(count>1&&stripTerminalSequences(content[count-1]).trim()==='')count--;break;}
  const body=expanded?content:content.slice(0,count),counts=`${body.length}/${content.length}`,fullLabel=expanded?`[收合訊息 · ${counts} 畫面行]`:`[展開全部訊息 · ${counts} 畫面行]`,compact=width<30||visibleWidth(fullLabel)>width,label=compact?(expanded?'[收合訊息]':'[展開全文]'):fullLabel;
  const plain=content.slice(0,max).map(stripTerminalSequences).filter(s=>s.trim()!=='');const indent=plain.length?Math.min(...plain.map(s=>(s.match(/^ */u)?.[0].length??0))):1;
  const left=Math.max(0,Math.min(indent,width-visibleWidth(label)));if(compact&&visibleWidth(counts)>width-left){reason='counter-width';return false;}
  const controls=[' '.repeat(left)+label];if(compact)controls.push(' '.repeat(left)+counts+(visibleWidth(counts)+3<=width-left?' 行':''));let styled;
  try{styled=controls.map((s,i)=>{const control=truncateToWidth(s,width,'',true),row=truncateToWidth(styleControl(control,width,i===0?'control':'count'),width,'',true);if(stripTerminalSequences(row)!==stripTerminalSequences(control))throw Error('Control text changed');return row;});}catch{reason='control-style';return false;}
  prepared={width,rows:[cache.full[0],...body,...styled,cache.full.at(-1)],controlY:1+body.length,counterY:1+body.length+(compact?1:0),controlX:left,controlRight:Math.min(width,left+visibleWidth(label)),previewRows:body.length};return true;
 };
 const proxy={
  render:width=>prepare(width)?prepared.rows:cache?.full??[],
  invalidate(){backing?.invalidate?.();cache=undefined;},
  handleMouse:event=>{
   if(stopped||!enabled()||event.type!=='click'||event.button!=='left')return undefined;
   if(prepare(event.width)&&event.y===prepared.controlY&&event.x>=prepared.controlX&&event.x<prepared.controlRight){toggle();return{handled:true};}
   return cache?.child.handleMouse?.(event);
  },
 };
 const run=(width,action)=>{
  if(stopped||!enabled()){layout='native-disabled';return action();}
  if(!prepare(width)){layout='native-'+reason;return action();}
  const before=node.children,previousMounted=mounted,projected=[proxy];mounted=projected;node.children=projected;
  try{layout='ready';return action();}finally{if(node.children===projected)node.children=before;else{cache=undefined;layout='native-update-preserved';}mounted=previousMounted;}
 };
 return{
  render:width=>!Number.isSafeInteger(width)||width<=0?[]:run(width,()=>node.render(width)),
  handleMouse:event=>run(event.width,()=>node.handleMouse?.(event)),
  invalidate(){cache=undefined;node.invalidate?.();},
  releaseCache(){cache=undefined;prepared=undefined;},
  toggle,
  status:()=>({expanded,layout,previewLimit:budget(),previewRows:prepared?.previewRows,controlY:prepared?.controlY,counterY:prepared?.counterY,controlX:prepared?.controlX,controlRight:prepared?.controlRight,contentRows:cache?.content.length,sourceRenders}),
  stop(){stopped=true;cache=undefined;prepared=undefined;},
 };
}
