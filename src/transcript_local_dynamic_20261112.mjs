// Chronological, bounded native-history presentation. Never session/model edits.
import{discoverTranscript,mountTranscript as legacyMount}from'./transcript_v0.15.0.mjs';
export{discoverTranscript};const WINDOW=Symbol.for('peicd100.transcript-window');
export function mountTranscript(root,deps,options={}){
 const{limit=100,project=n=>n,allowArchive,onSelection,windowing=()=>true,revision=()=>0,release=()=>{},selectRows=rows=>rows,historyNotice=()=>undefined}=options;
 if(!Number.isSafeInteger(limit)||limit<1||limit>2000||typeof allowArchive!=='function')throw Error('Invalid dynamic-history policy');
 const found=discoverTranscript(root,deps),viewport=root?.mode==='fullscreen'&&typeof root.scrollBy==='function'&&typeof root.getScreenLines==='function'&&typeof root.hasActiveSelection==='function'&&Number.isFinite(root.viewportTop)&&typeof root.isFollowingOutput==='boolean';
 const scene=found.reason==='ready'&&found.path[0]?.parent===root&&found.path[0]?.index===0&&found.path.length>=2&&found.path.slice(1).every(p=>p.parent?.constructor===deps.Container);
 // Unsupported regular terminals keep COMPLETE native scrollback, not a
 // click-only history window. Never synthesize enormous spacer heights.
 if(!viewport||!scene)return legacyMount(root,deps,{...options,windowing:()=>false});
 const{backing,path}=found,{parent,index}=path.at(-1),{Container,truncateToWidth}=deps;
 let stopped=false,source=[],sourceLength=0,first,last,start=0,end=0,following=true,selected=[],ranges=[],prefix=0,width,layout='not-rendered',frame=0,lastTop,lastCorrection,adjusting=false,request,enabledBefore,renderCalls=0,cacheHits=0,archived=0,newer=0,lastRestoration;
 const indices=new Map(),pins=new Set(),cache=new Map(),dirty=new Set();
 const budget=()=>Math.min(2000,Math.max(limit,root.terminal.rows*3));
 const owned=()=>!stopped&&path.slice(0,-1).every(p=>p.parent.children[p.index]===p.child)&&parent.children[index]===view;
 const blocked=()=>root.hasActiveSelection()||root.hasOverlay?.()===true;
 const assess=(n,i)=>{if(allowArchive(n)===true)pins.delete(i);else pins.add(i);};
 function measurePrefix(w){let n=0;for(const p of path.slice(1))for(const node of p.parent.children.slice(0,p.index)){const rows=node.render(w);if(!Array.isArray(rows)||rows.length+n>4096)throw Error('Unverified primary prefix');n+=rows.length;}return n;}
 const textRows=lines=>Array.isArray(lines)&&!lines.some(s=>/\x1b_G|\x1b\]1337;File=|\x1bP[0-9;]*q/u.test(s)||s.includes(deps.CURSOR_MARKER??'\u0000NEVER'))?lines.map(s=>deps.stripTerminalSequences(s).replace(/\s/gu,'')):undefined;
 function anchor(){const top=root.viewportTop-prefix;const r=ranges.find(r=>r.height>0&&r.y+r.height>top);if(!r)return;return{node:r.node,offset:Math.max(0,top-r.y),oldText:textRows(cache.get(r.node)?.lines),top:root.viewportTop};}
 function reflow(a){const next=textRows(cache.get(a.node)?.lines);if(!a.oldText||!next)return a.offset;if(a.oldText.length===next.length&&a.oldText.every((s,i)=>s===next[i]))return a.offset;const old=a.oldText.join(''),current=next.join(''),position=a.oldText.slice(0,a.offset).reduce((n,s)=>n+s.length,0);let target=position;if(old!==current){const needle=old.slice(position,position+64),i=needle?current.indexOf(needle):-1;if(i<0||current.indexOf(needle,i+1)!==-1)return a.offset;target=i;}let n=0;for(let i=0;i<next.length;i++){if(n+next[i].length>target)return i;n+=next[i].length;}return Math.max(0,next.length-1);}
 function restore(a,rs,p){if(!a||following||blocked())return;const r=rs.find(r=>r.node===a.node);if(!r)return;const target=Math.max(0,p+r.y+Math.min(reflow(a),Math.max(0,r.height-1)));if(Math.abs(target-root.viewportTop)<1)return;const own=frame;adjusting=true;lastRestoration={target,index:indices.get(a.node),offset:a.offset,frame};lastCorrection=target;root.scrollBy(target-root.viewportTop);lastTop=root.viewportTop;queueMicrotask(()=>{if(owned()&&frame===own&&!blocked()&&root.viewportTop!==target){root.scrollBy(target-root.viewportTop);lastTop=root.viewportTop;root.requestRender();}adjusting=false;});}
 function sync(rows,a){
  const append=rows.length>=sourceLength&&rows[0]===first&&rows[sourceLength-1]===last&&(rows===source||rows.slice(0,sourceLength).every((n,i)=>indices.get(n)===i));
  const wasFollowing=following,oldStart=source[start];
  if(!append){indices.clear();pins.clear();for(let i=0;i<rows.length;i++){if(indices.has(rows[i]))throw Error('Duplicate native record');indices.set(rows[i],i);assess(rows[i],i);}const at=a?.node?indices.get(a.node):indices.get(oldStart);following=wasFollowing||at===undefined;if(!following){start=Math.max(0,Math.min(indices.get(oldStart)??Math.max(0,at-Math.floor(budget()/3)),rows.length-budget()));end=Math.min(rows.length,start+budget());}}
  else for(let i=sourceLength;i<rows.length;i++){if(indices.has(rows[i]))throw Error('Duplicate native record');indices.set(rows[i],i);assess(rows[i],i);}
  source=rows;sourceLength=rows.length;first=rows[0];last=rows.at(-1);if(following){end=sourceLength;start=Math.max(0,end-budget());}
 }
 function navigate(direction){if(blocked())return false;request=direction;root.requestRender();return true;}
 function shift(direction,a){if(direction==='latest'){following=true;end=sourceLength;start=Math.max(0,end-budget());return;}
  const chunk=Math.max(1,Math.floor(budget()/3)),at=a?.node?indices.get(a.node):undefined;following=false;
  if(direction==='older'){const candidate=Math.max(0,start-chunk);start=candidate;end=Math.min(sourceLength,start+budget());if(at!==undefined&&at>=end){end=at+1;start=Math.max(0,end-budget());}}
  else{end=Math.min(sourceLength,end+chunk);start=Math.max(0,end-budget());if(at!==undefined&&at<start){start=at;end=Math.min(sourceLength,start+budget());}}
 }
 const header={render:w=>[truncateToWidth(`${historyNotice()?.kind==='native-context-partial'?`原始歷史有${historyNotice().unmountedMessages}則未掛載，保留原生｜`:''}動態歷史 ${sourceLength?start+1:0}–${end}/${sourceLength}｜${start>0?'向上自動載入':'已到最早'}｜[較早] [較新] [最新]${blocked()?'｜暫保閱讀位置':''}`,w,'')],invalidate(){},handleMouse(e){if(e.type!=='click'||e.button!=='left'||e.y!==0||blocked())return;const text=deps.stripTerminalSequences(this.render(e.width)[0]);for(const[label,direction]of[['[較早]','older'],['[較新]','newer'],['[最新]','latest']]){const i=text.indexOf(label);if(i<0)continue;const left=deps.visibleWidth(text.slice(0,i));if(e.x>=left&&e.x<left+deps.visibleWidth(label))return navigate(direction)?{handled:true}:undefined;}}};
 const tail={render:w=>newer>0?[truncateToWidth(`後方還有較新內容（${newer}項），向下自動載入｜[回到最新]`,w,'')]:[],invalidate(){},handleMouse(e){return e.type==='click'&&e.button==='left'&&e.y===0&&navigate('latest')?{handled:true}:undefined;}};
 class CachedRow extends Container{constructor(node){super();this.node=node;this.children=[project(node)];}render(w){const rev=revision();if(root.hasActiveSelection()&&root.hasOverlay?.()!==true&&this.lines&&this.width===w){cacheHits++;return this.lines;}if(this.lines&&this.width===w&&this.rev===rev&&!dirty.has(this.node)&&!pins.has(indices.get(this.node))){cacheHits++;return this.lines;}this.lines=this.children[0].render(w);this.width=w;this.rev=rev;dirty.delete(this.node);renderCalls++;return this.lines;}invalidate(){dirty.add(this.node);this.children[0].invalidate?.();}handleMouse(e){const r=this.children[0].handleMouse?.(e);if(r?.handled){dirty.add(this.node);root.requestRender();}return r;}}
 class SafetyLabel{constructor(i){this.i=i;}render(w){return[truncateToWidth(`原生安全保留項目（歷史位置${this.i+1}；互動／執行狀態未能安全移出）`,w,'')];}invalidate(){}}
 class DynamicWindow extends Container{
  render(w){if(!owned())return backing.render(w);frame++;renderCalls=0;cacheHits=0;const a=anchor(),top=root.viewportTop,moved=lastTop!==undefined&&top!==lastTop&&top!==lastCorrection,direction=lastTop!==undefined&&top<lastTop?'older':'newer';lastCorrection=undefined;lastTop=top;
   try{const frozen=blocked(),enabled=windowing()===true;if(enabled&&moved&&!root.isFollowingOutput)following=false;else if(enabled&&moved&&direction==='newer'&&end===sourceLength&&root.isFollowingOutput)following=true;const wasFollowing=following;if(frozen)following=false;sync(enabled?selectRows(backing.children):backing.children,a);if(frozen)following=wasFollowing;
    if(!enabled){start=0;end=sourceLength;}else if(enabledBefore===false){following=false;const at=a?.node?indices.get(a.node):undefined;start=at===undefined?Math.max(0,sourceLength-budget()):Math.max(0,at-Math.floor(budget()/3));end=Math.min(sourceLength,start+budget());}
    enabledBefore=enabled;
    const explicit=request;request=undefined;
    if(enabled&&!frozen&&!adjusting){
     if(moved&&!root.isFollowingOutput)following=false;
     let desired=explicit;
     if(!desired&&moved){const visible=ranges.filter(r=>{const i=indices.get(r.node);return i>=start&&i<end&&r.height>0;});const first=visible[0],last=visible.at(-1),threshold=Math.max(2,root.terminal.rows);
      if(direction==='older'&&start>0&&first&&top-prefix-first.y<threshold)desired='older';
      else if(direction==='newer'&&end<sourceLength&&last&&last.y+last.height-(top-prefix+root.terminal.rows)<threshold)desired='newer';
     }
     if(desired)shift(desired,a);
    }
    const keep=new Set(pins);for(let i=start;i<end;i++)keep.add(i);
    if(frozen)for(const n of selected){const i=indices.get(n);if(i!==undefined)keep.add(i);}
    const rows=[...keep].sort((x,y)=>x-y).filter(i=>i>=0&&i<sourceLength).map(i=>source[i]);archived=Math.max(0,start-[...keep].filter(i=>i<start).length);newer=Math.max(0,sourceLength-end-[...keep].filter(i=>i>=end).length);
    if(rows.length!==selected.length||rows.some((n,i)=>n!==selected[i])){selected=rows;onSelection?.(rows,{archived,limit:newer+archived===0?sourceLength:budget(),newer});}
    for(const[n]of cache)if(!keep.has(indices.get(n))){cache.delete(n);dirty.delete(n);release(n);n.invalidate?.();}
    const entries=[header],records=[undefined];for(const n of rows){const i=indices.get(n);if(i<start||i>=end){entries.push(new SafetyLabel(i));records.push(undefined);}let value=cache.get(n);if(!value){value=new CachedRow(n);cache.set(n,value);}entries.push(value);records.push(n);}entries.push(tail);records.push(undefined);this.children=entries;
    const result=super.render(w),next=[];let y=0;for(let i=0;i<entries.length;i++){const height=records[i]?entries[i].lines?.length??0:entries[i]===tail?(newer>0?1:0):1;if(records[i])next.push({node:records[i],y,height});y+=height;}
    const nextPrefix=measurePrefix(w);restore(a,next,nextPrefix);prefix=nextPrefix;ranges=next;width=w;this.renderedHeight=result.length;layout='automatic-contiguous-history';
    if(explicit==='latest'&&!frozen){const own=frame;queueMicrotask(()=>{if(owned()&&frame===own&&!blocked()){root.scrollToBottom();lastTop=root.viewportTop;root.requestRender();}});}
    return result;
   }catch{layout='native-fallback';this.children=[backing];return super.render(w);}
  }
  handleMouse(e){if(e.type==='wheel'&&e.wheelDelta&&!blocked()){const from=prefix+ranges.find(r=>indices.get(r.node)>=start)?.y,through=prefix+(ranges.filter(r=>indices.get(r.node)<end).at(-1)?.y??this.renderedHeight);if(e.wheelDelta<0&&start>0&&root.viewportTop-from<root.terminal.rows)request='older';if(e.wheelDelta>0&&end<sourceLength&&through-root.viewportTop<root.terminal.rows*2)request='newer';if(request)root.requestRender();}return super.handleMouse(e);}
 }
 const view=new DynamicWindow();view[WINDOW]=true;parent.children[index]=view;
 return{mounted:true,reason:'ready',backing,view,owned,navigate,selectedRows:()=>selected.slice(),
  status:()=>({mounted:owned(),layout,archived,newer,total:sourceLength,rawTotal:backing.children.length,start,end,limit:budget(),configuredLimit:limit,following,projected:selected.length,cacheEntries:cache.size,nativeRenderCalls:renderCalls,cacheHits,selectionPinned:root.hasActiveSelection(),overlayPinned:root.hasOverlay?.()===true,contextNavigation:'dynamic-v1',viewportTop:root.viewportTop,viewportFollowing:root.isFollowingOutput,anchorIndex:indices.get(anchor()?.node),lastRestoration,width}),
  refresh(nodes){if(nodes===undefined){for(const n of cache.keys())dirty.add(n);for(const[n,i]of indices)assess(n,i);}else for(const n of nodes){if(!n)continue;dirty.add(n);const i=indices.get(n);if(i!==undefined)assess(n,i);}},
  historyPage:(page,size=100)=>{if(!Number.isSafeInteger(page)||page<0||!Number.isSafeInteger(size)||size<1||size>2000)throw Error('Invalid history page');return source.slice(Math.max(0,start-(page+1)*size),Math.max(0,start-page*size));},
  stop(){stopped=true;const slots=parent.children.flatMap((n,i)=>n===view?[i]:[]);for(const n of cache.keys())release(n);cache.clear();dirty.clear();if(slots.length!==1)return false;parent.children[slots[0]]=backing;backing.invalidate();return true;},
 };
}
