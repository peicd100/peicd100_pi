// UI-only projection. Native/session objects and backing children stay intact.
const WINDOW=Symbol.for('peicd100.transcript-window');
export function discoverTranscript(root,deps){
 const {Container,UserMessageComponent,AssistantMessageComponent,ToolExecutionComponent}=deps;
 if(typeof Container!=='function'||!(root instanceof Container)||![UserMessageComponent,AssistantMessageComponent,ToolExecutionComponent].every(c=>typeof c==='function'))return {reason:'unsupported-public-components'};
 const isMessage=node=>node instanceof UserMessageComponent||node instanceof AssistantMessageComponent||node instanceof ToolExecutionComponent;
 const seen=new Set(),candidates=[];let visited=0,invalid=false;
 const walk=(node,path,depth)=>{
  if(!node||invalid)return;
  if(++visited>16384||depth>32||seen.has(node)){invalid=true;return;}seen.add(node);
  if(isMessage(node)||node[WINDOW])return;
  if(!(node instanceof Container)||!Array.isArray(node.children))return;
  if(node.constructor===Container&&node.children.some(isMessage))candidates.push({backing:node,path});
  for(let i=0;i<node.children.length;i++)walk(node.children[i],[...path,{parent:node,index:i,child:node.children[i]}],depth+1);
 };
 try{walk(root,[],0);}catch{return {reason:'unverified-layout'};}
 if(invalid)return {reason:'ambiguous-or-over-budget'};
 if(candidates.length!==1||!candidates[0].path.length)return {reason:candidates.length>1?'multiple-transcript-parents':'transcript-not-ready'};
 return {...candidates[0],reason:'ready',visited};
}
export function mountTranscript(root,deps,{limit=100,project=node=>node,onHistory,allowArchive,preserveCurrentTurn=true,pinCurrentUser=true,onSelection,windowing=()=>true}={}){
 if(!Number.isSafeInteger(limit)||limit<1||limit>2000||typeof preserveCurrentTurn!=='boolean'||typeof pinCurrentUser!=='boolean'||typeof windowing!=='function')throw new Error('Invalid UI window policy');
 if(typeof allowArchive!=='function')return {mounted:false,reason:'archive-safety-policy-required'};
 if(typeof deps.truncateToWidth!=='function')return {mounted:false,reason:'native-width-helper-required'};
 const found=discoverTranscript(root,deps);if(found.reason!=='ready')return {mounted:false,reason:found.reason};
 const {backing,path}=found,{parent,index}=path.at(-1),{Container,UserMessageComponent,truncateToWidth}=deps;
 let stopped=false,previousArray,previousLength=-1,previousLast,previousFirst,startOfCurrent=-1,archiveBoundary=0,archived=0,projectionCount=0,renderStatus='not-rendered',selected=[];
 const pinned=new Set(),indices=new Map(),retainedPrefix=new Set();
 const owned=()=>{try{return !stopped&&path.slice(0,-1).every(x=>x.parent.children[x.index]===x.child)&&parent.children[index]===view;}catch{return false;}};
 const assess=(node,i)=>{if(allowArchive(node)===true)pinned.delete(i);else pinned.add(i);};
 class Window extends Container{
  render(width){
   if(!owned()){renderStatus='owner-changed-native-fallback';return backing.render(width);}
   try{
    const source=backing.children;
    if(source!==previousArray||source.length!==previousLength||source.at(-1)!==previousLast||source[0]!==previousFirst){
     const appendOnly=source===previousArray&&source.length>=previousLength&&source[0]===previousFirst&&source[previousLength-1]===previousLast;
     const begin=appendOnly?Math.max(0,previousLength):0;
     if(begin===0){startOfCurrent=-1;pinned.clear();indices.clear();}
     for(let i=begin;i<source.length;i++){
      if(indices.has(source[i]))throw new Error('Duplicated native row');indices.set(source[i],i);
      if(source[i] instanceof UserMessageComponent)startOfCurrent=i;assess(source[i],i);
     }
     previousArray=source;previousLength=source.length;previousLast=source.at(-1);previousFirst=source[0];
    }
    let start=windowing()===true?Math.max(0,source.length-limit):0;retainedPrefix.clear();
    if(preserveCurrentTurn){start=Math.min(start,Math.max(0,startOfCurrent),...pinned);}
    else{
     // Keep only the actual unsafe/live rows and latest user, not thousands
     // of already-completed tool rows from one uninterrupted Goal turn.
     for(const i of pinned)if(i<start)retainedPrefix.add(i);
     if(pinCurrentUser&&startOfCurrent>=0&&startOfCurrent<start)retainedPrefix.add(startOfCurrent);
    }
    archiveBoundary=start;archived=start-retainedPrefix.size;
    const rows=[...Array.from(retainedPrefix).sort((a,b)=>a-b).map(i=>source[i]),...source.slice(start)];projectionCount=rows.length;
    if(rows.length!==selected.length||rows.some((row,i)=>row!==selected[i])){selected=rows;onSelection?.(rows,{archived,limit});}
    const display=rows.map(project);if(display.some(n=>!n||typeof n.render!=='function'))throw new Error('Unverified UI projection');
    this.children=archived?[historyHeader,...display]:display;renderStatus='ready';return super.render(width);
   }catch{this.children=[backing];archiveBoundary=0;archived=0;retainedPrefix.clear();selected=[];projectionCount=backing.children.length;renderStatus='unverified-projection-native-fallback';return super.render(width);}
  }
 }
 const view=new Window();view[WINDOW]=true;
 const historyHeader={render:width=>[truncateToWidth(`較早的 ${archived} 個片段已移出即時渲染；可從Focus選單檢視歷史`,Math.max(0,width))],invalidate(){},handleMouse:event=>{if(event.type==='click'&&event.button==='left'&&onHistory){onHistory();return {handled:true};}return undefined;}};
 parent.children[index]=view;
 return {mounted:true,reason:'ready',backing,view,owned,
  status:()=>({mounted:owned(),layout:renderStatus,archived,projected:projectionCount,total:backing.children.length,limit,preserveCurrentTurn,pinned:pinned.size}),
  refresh:nodes=>{if(nodes===undefined){previousArray=undefined;return;}try{for(const node of nodes){const i=indices.get(node);if(i!==undefined&&backing.children[i]===node)assess(node,i);}}catch{previousArray=undefined;renderStatus='unverified-safety-native-fallback';}},
  selectedRows:()=>selected.slice(),
  historyPage:(page,size=100)=>{if(!Number.isSafeInteger(page)||page<0||!Number.isSafeInteger(size)||size<1||size>2000)throw new Error('Invalid history page');const hidden=retainedPrefix.size?backing.children.slice(0,archiveBoundary).filter((_node,i)=>!retainedPrefix.has(i)):backing.children.slice(0,archiveBoundary);const rows=hidden.slice(Math.max(0,hidden.length-(page+1)*size),Math.max(0,hidden.length-page*size));for(const node of rows)node.invalidate?.();return rows;},
  stop:()=>{let slot;try{const matches=parent.children.flatMap((node,i)=>node===view?[i]:[]);if(matches.length===1)slot=matches[0];}catch{}stopped=true;if(slot===undefined)return false;parent.children[slot]=backing;backing.invalidate();return true;},
 };
}
