// SDK1.1/1.5 native user layout: one public Markdown child, with one
// native vertical padding row at each end. Never read its private text/padding.
export function createUserPreview(node,deps,{limit=()=>10,enabled=()=>true,changed=()=>{},styleControl=s=>s}={}){
 const {UserMessageComponent,Markdown,truncateToWidth,stripTerminalSequences}=deps;
 let expanded=false,stopped=false,cache,prepared,mounted,backing,sourceRenders=0,layout='not-rendered';
 const inspect=()=>{if(mounted&&node.children===mounted)return backing;const child=typeof UserMessageComponent==='function'&&typeof Markdown==='function'&&node?.constructor===UserMessageComponent&&Array.isArray(node.children)&&node.children.length===1&&node.children[0]?.constructor===Markdown?node.children[0]:undefined;if(child)backing=child;return child;};
 const budget=()=>{const n=limit();return Number.isSafeInteger(n)&&n>=1&&n<=200?n:10;};
 const toggle=value=>{expanded=typeof value==='boolean'?value:!expanded;changed();};
 const prepare=width=>{
  const child=inspect();if(!child||typeof truncateToWidth!=='function'||typeof stripTerminalSequences!=='function')return false;
  if(cache?.child!==child||cache.width!==width){const full=child.render(width);sourceRenders++;if(!Array.isArray(full)||full.length<2||full.some(s=>typeof s!=='string')||stripTerminalSequences(full[0]).trim()!==''||stripTerminalSequences(full.at(-1)).trim()!=='')return false;cache={child,width,full,content:full.slice(1,-1)};}
  const max=budget(),content=cache.content,long=content.length>max;
  if(!long){prepared=undefined;return false;}
  const body=expanded?content:content.slice(0,max),label=expanded?`[收合訊息：預覽 ${max} 行]`:`[展開全部訊息 · ${content.length} 行]`;
  prepared={width,rows:[cache.full[0],...body,truncateToWidth(styleControl(label),width,''),cache.full.at(-1)],controlY:1+body.length};return true;
 };
 const proxy={
  render:width=>prepare(width)?prepared.rows:cache?.full??[],
  invalidate(){backing?.invalidate?.();cache=undefined;},
  handleMouse:event=>{
   if(stopped||!enabled()||event.type!=='click'||event.button!=='left'||event.x<0||event.x>=event.width)return undefined;
   if(prepare(event.width)&&event.y===prepared.controlY){toggle();return{handled:true};}
   return cache?.child.handleMouse?.(event);
  },
 };
 const run=(width,action)=>{
  if(stopped||!enabled()){layout='native-disabled';return action();}
  if(!prepare(width)){layout='native-short-or-unknown';return action();}
  const before=node.children,previousMounted=mounted,projected=[proxy];mounted=projected;node.children=projected;
  try{layout='ready';return action();}finally{if(node.children===projected)node.children=before;else{cache=undefined;layout='native-update-preserved';}mounted=previousMounted;}
 };
 return{
  render:width=>!Number.isSafeInteger(width)||width<=0?[]:run(width,()=>node.render(width)),
  handleMouse:event=>run(event.width,()=>node.handleMouse?.(event)),
  invalidate(){cache=undefined;node.invalidate?.();},
  toggle,
  status:()=>({expanded,layout,previewLimit:budget(),contentRows:cache?Math.max(0,cache.full.length-2):undefined,sourceRenders}),
  stop(){stopped=true;},
 };
}
