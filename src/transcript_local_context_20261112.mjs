// UI-only, public native components. No session/model text mutation or host patch.
import {discoverTranscript,mountTranscript as legacyMount} from './transcript_v0.15.0.mjs';
import {assistantParts} from './assistant_v0.17.0.mjs';
export {discoverTranscript};
const WINDOW=Symbol.for('peicd100.transcript-window');
export function mountTranscript(root,deps,options={}){
 const {limit=100,project=n=>n,allowArchive,onHistory,onSelection,windowing=()=>true,revision=()=>0,release=()=>{}}=options;
 if(!Number.isSafeInteger(limit)||limit<1||limit>2000||typeof allowArchive!=='function')throw Error('Invalid reading window policy');
 const found=discoverTranscript(root,deps);
 const viewport=root?.mode==='fullscreen'&&typeof root.scrollBy==='function'&&typeof root.getScreenLines==='function'&&typeof root.hasActiveSelection==='function'&&Number.isFinite(root.viewportTop)&&typeof root.isFollowingOutput==='boolean';
 // Native 1.1/1.5 fullscreen primary document reuses flat children[0]. Require
 // the verified public Container path, never private layoutRoot/primary getter.
 const scene=found.reason==='ready'&&found.path[0]?.parent===root&&found.path[0]?.index===0&&found.path.length>=2&&found.path.slice(1).every(p=>p.parent?.constructor===deps.Container);
 if(!viewport||!scene)return legacyMount(root,deps,options);
 const {backing,path}=found,{parent,index}=path.at(-1),{Container,UserMessageComponent,truncateToWidth}=deps;
 let stopped=false,source,sourceLength=0,first,last,start=0,end=0,currentUser=-1,selected=[],ranges=[],prefix=0,lastWidth,layout='not-rendered';
 let archived=0,newer=0,following=true,lastEnabled,lastTop,lastCorrection,edgeRequest,anchorPin,latestRequested=false,adjusting=false,frame=0,renderCalls=0,cacheHits=0;
 const pins=new Set(),indices=new Map(),cache=new Map(),dirty=new Set(),gapCache=new Map();let userPrefix=[0],bodyPrefix=[0],nearestUser=[],contextPin,targetRow,contextGaps=0,countsDirty=Infinity;
 const owned=()=>{try{return !stopped&&path.slice(0,-1).every(p=>p.parent.children[p.index]===p.child)&&parent.children[index]===view;}catch{return false;}};
 const assess=(node,i)=>{if(allowArchive(node)===true)pins.delete(i);else pins.add(i);};
 const header={render:w=>[truncateToWidth(`歷史視窗 ${start+1}–${end}/${sourceLength}｜[較早] [較新] [最新]｜${start>0?'還有較早內容':'已到最早'}${root.hasActiveSelection()?'｜選字中：保留視窗':''}`,w,'')],invalidate(){},handleMouse(e){if(e.type!=='click'||e.button!=='left')return undefined;const line=deps.stripTerminalSequences(this.render(e.width)[0]),x=e.x;for(const [label,direction]of[['[較早]','older'],['[較新]','newer'],['[最新]','latest']]){const pos=line.indexOf(label);if(pos<0)continue;const left=deps.visibleWidth(line.slice(0,pos)),right=left+deps.visibleWidth(label);if(x>=left&&x<right){navigate(direction);return{handled:true};}}return undefined;}};
 function measurePrefix(width){let n=0;for(const p of path.slice(1))for(const node of p.parent.children.slice(0,p.index)){const rows=node.render(width);if(!Array.isArray(rows)||rows.length+n>4096)throw Error('Unverified primary document prefix');n+=rows.length;}return n;}
 // Reflow anchor from PUBLIC rendered text, never native Markdown source/private
 // caches. Opaque image/cursor rows keep a native-record/row anchor instead.
 function textRows(lines){if(!Array.isArray(lines)||lines.some(s=>/\x1b_G|\x1b\]1337;File=|\x1bP[0-9;]*q/u.test(s)||s.includes(deps.CURSOR_MARKER??'\u0000NEVER')))return;return lines.map(s=>deps.stripTerminalSequences(s).replace(/\s/gu,''));}
 function anchor(){if(!ranges.length)return undefined;const top=root.viewportTop-prefix;if(top<ranges[0].y)return undefined;let r=ranges.find(r=>r.y+r.height>top)??ranges.at(-1);if(!r)return undefined;const offset=Math.max(0,top-r.y),oldText=!pins.has(indices.get(r.node))?textRows(cache.get(r.node)?.lines):undefined;return{node:r.node,offset,oldText,top:root.viewportTop};}
 function reflowOffset(a){const next=textRows(cache.get(a.node)?.lines);if(!a.oldText||!next)return a.offset;if(a.oldText.length===next.length&&a.oldText.every((s,i)=>s===next[i]))return a.offset;const old=a.oldText.join(''),current=next.join(''),position=a.oldText.slice(0,a.offset).reduce((n,s)=>n+s.length,0);let target=position;if(old!==current){const needle=old.slice(position,position+64),i=needle?current.indexOf(needle):-1;if(i<0||current.indexOf(needle,i+1)!==-1)return a.offset;target=i;}let n=0;for(let i=0;i<next.length;i++){if(n+next[i].length>target)return i;n+=next[i].length;}return Math.max(0,next.length-1);}
 function restore(a,newPrefix,newRanges){if(!a||following||root.hasActiveSelection())return;const r=newRanges.find(r=>r.node===a.node);if(!r)return;const target=Math.max(0,newPrefix+r.y+Math.min(reflowOffset(a),Math.max(0,r.height-1)));if(Math.abs(target-root.viewportTop)<1)return;const own=frame;adjusting=true;queueMicrotask(()=>{if(!owned()||own!==frame){adjusting=false;return;}lastCorrection=target;root.scrollBy(target-root.viewportTop);lastTop=root.viewportTop;adjusting=false;root.requestRender();});}
 function sync(rows){
  // The host may replace a public children ARRAY without replacing any native
  // records. That is not a new conversation and must not reset the reader to
  // the latest window. Validate the full prefix on array replacement only;
  // ordinary append/render keeps the original constant-time fast path.
  const prefixMatches=rows.length>=sourceLength&&rows[0]===first&&rows[sourceLength-1]===last;
  const appended=prefixMatches&&(source===rows||rows.slice(0,sourceLength).every((node,i)=>indices.get(node)===i));if(!appended){pins.clear();indices.clear();currentUser=-1;cache.clear();gapCache.clear();userPrefix=[0];bodyPrefix=[0];nearestUser=[];countsDirty=0;contextPin=undefined;targetRow=undefined;ranges=[];anchorPin=undefined;following=true;start=Math.max(0,rows.length-limit);end=rows.length;}
  for(let i=appended?sourceLength:0;i<rows.length;i++){if(indices.has(rows[i])&&indices.get(rows[i])!==i)throw Error('Duplicate native row');indices.set(rows[i],i);if(rows[i]?.constructor===UserMessageComponent)currentUser=i;assess(rows[i],i);}
  const contextFrom=Math.min(appended?sourceLength:0,countsDirty);let priorUser=contextFrom>0?nearestUser[contextFrom-1]:-1;for(let i=contextFrom;i<rows.length;i++){const user=rows[i]?.constructor===UserMessageComponent;if(user)priorUser=i;nearestUser[i]=priorUser;userPrefix[i+1]=userPrefix[i]+(user?1:0);const body=rows[i]?.constructor===deps.AssistantMessageComponent&&assistantParts(rows[i],deps).parts?.some(p=>p.kind==='body');bodyPrefix[i+1]=bodyPrefix[i]+(body?1:0);}countsDirty=Infinity;
  if(appended&&following){end=rows.length;start=Math.max(0,end-limit);}source=rows;sourceLength=rows.length;first=rows[0];last=rows.at(-1);
 }
 function navigate(direction){if(root.hasActiveSelection())return false;edgeRequest=direction;following=direction==='latest';root.requestRender();return true;}
 function shift(direction,a){const chunk=Math.max(1,Math.min(limit,Math.ceil(root.terminal.rows/2)));
  if(direction==='latest'){following=true;latestRequested=true;anchorPin=undefined;contextPin=undefined;end=sourceLength;start=Math.max(0,end-limit);return;}
  following=false;
  if(direction==='older'){start=Math.max(0,start-chunk);end=Math.min(sourceLength,start+limit);}
  else if(direction==='newer'){end=Math.min(sourceLength,end+chunk);start=Math.max(0,end-limit);}
  // Pin only this one real record, never expand the whole range to an old
  // pinned user at index0 (that would accidentally render the full prefix).
  anchorPin=a?.node?indices.get(a.node):undefined;contextPin=nearestUser[start];
 }
 const contextCount=i=>(userPrefix[i]??0)+(bodyPrefix[i]??0);
 function loadGap(from,to){if(root.hasActiveSelection()||from<0||to>sourceLength||from>=to)return false;let lo=from,hi=to-1;const baseline=contextCount(from);while(lo<hi){const mid=(lo+hi)>>1;if(contextCount(mid+1)>baseline)hi=mid;else lo=mid+1;}const target=lo;following=false;start=Math.max(0,target-Math.min(8,Math.floor(limit/4)));end=Math.min(sourceLength,start+limit);contextPin=nearestUser[target];anchorPin=target;targetRow=source[target];root.requestRender();return true;}
 class ContextGap{
  constructor(from,to){this.from=from;this.to=to;this.contextGap=true;}
  render(width){const users=userPrefix[this.to]-userPrefix[this.from],bodies=bodyPrefix[this.to]-bodyPrefix[this.from];return[truncateToWidth(width<55?`對話未載入：提問${users}/回覆${bodies} [載入]`:`這段對話尚未載入（${users} 則使用者訊息／${bodies} 段代理正文） [點此載入]`,width,'')];}
  invalidate(){}
  handleMouse(e){if(e.type!=='click'||e.button!=='left'||e.y!==0||root.hasActiveSelection())return undefined;return loadGap(this.from,this.to)?{handled:true}:undefined;}
 }
 class CachedRow extends Container{
  constructor(node){super();this.node=node;this.children=[project(node)];}
  render(width){const value=this.children[0],rev=revision();if(this.lines&&this.width===width&&this.rev===rev&&!dirty.has(this.node)&&!pins.has(indices.get(this.node))){cacheHits++;return this.lines;}
   this.lines=value.render(width);this.width=width;this.rev=rev;dirty.delete(this.node);renderCalls++;return this.lines;
  }
  handleMouse(e){const r=this.children[0].handleMouse?.(e);if(r?.handled){dirty.add(this.node);root.requestRender();}return r;}
  invalidate(){dirty.add(this.node);this.children[0].invalidate?.();}
 }
 class ReadingWindow extends Container{
  render(width){if(!owned())return backing.render(width);frame++;renderCalls=0;cacheHits=0;const previousAnchor=anchor();try{
   const hadFrame=root.getScreenLines().length>0,top=root.viewportTop,userMoved=lastTop!==undefined&&top!==lastTop&&top!==lastCorrection;lastCorrection=undefined;lastTop=top;
   sync(backing.children);const enabled=windowing()===true,selection=root.hasActiveSelection();
   if(enabled&&lastEnabled===false){const i=previousAnchor?.node?indices.get(previousAnchor.node):undefined;end=following||i===undefined?sourceLength:Math.min(sourceLength,Math.max(limit,i+Math.ceil(limit*2/3)));start=Math.max(0,end-limit);}
   lastEnabled=enabled;
   if(!enabled){start=0;end=sourceLength;}else if(hadFrame&&!selection&&!adjusting){
    if(!root.isFollowingOutput&&end===sourceLength)following=false;else if(userMoved&&root.isFollowingOutput&&end===sourceLength)following=true;
    const nearTop=top<=prefix+Math.max(2,Math.floor(root.terminal.rows/3)),nearBottom=root.isFollowingOutput;
    const direction=edgeRequest??(userMoved&&nearTop&&start>0?'older':userMoved&&nearBottom&&end<sourceLength?'newer':undefined);
    if(direction)shift(direction,previousAnchor);edgeRequest=undefined;
   }
   const keep=new Set(pins);if(currentUser>=0)keep.add(currentUser);if(anchorPin!==undefined)keep.add(anchorPin);if(contextPin!==undefined&&contextPin>=0)keep.add(contextPin);for(let i=start;i<end;i++)keep.add(i);
   // Do not unload a live native selection. No fake blank document/clipboard.
   if(selection)for(const n of selected){const i=indices.get(n);if(i!==undefined)keep.add(i);}
   const rows=[...keep].sort((a,b)=>a-b).filter(i=>i<sourceLength).map(i=>source[i]);
   archived=start-[...keep].filter(i=>i<start).length;newer=sourceLength-end-[...keep].filter(i=>i>=end).length;
   if(rows.length!==selected.length||rows.some((n,i)=>n!==selected[i])){selected=rows;onSelection?.(rows,{archived,limit,newer});}
   for(const [n,c]of cache)if(!keep.has(indices.get(n))){cache.delete(n);dirty.delete(n);release(n);n.invalidate?.();}
   const entries=[],records=[],usedGaps=new Set();let previous=0;contextGaps=0;
   const gap=(from,to)=>{if(from>=to||contextCount(to)===contextCount(from))return;const key=from+':'+to;usedGaps.add(key);let value=gapCache.get(key);if(!value){value=new ContextGap(from,to);gapCache.set(key,value);}entries.push(value);records.push({gap:true});contextGaps++;};
   for(const n of rows){const i=indices.get(n);gap(previous,i);let c=cache.get(n);if(!c){c=new CachedRow(n);cache.set(n,c);}entries.push(c);records.push({node:n});previous=i+1;}gap(previous,sourceLength);for(const key of gapCache.keys())if(!usedGaps.has(key))gapCache.delete(key);
   this.children=[header,...entries];const result=super.render(width),nextRanges=[];let y=1;
   for(let i=0;i<entries.length;i++){const height=records[i].gap?1:entries[i].lines?.length??0;if(records[i].node)nextRanges.push({node:records[i].node,y,height});y+=height;}
   const nextPrefix=measurePrefix(width);if(targetRow){const target=nextRanges.find(r=>r.node===targetRow);targetRow=undefined;if(target){const own=frame;adjusting=true;queueMicrotask(()=>{if(owned()&&frame===own){root.scrollBy(nextPrefix+target.y-root.viewportTop);lastTop=root.viewportTop;root.requestRender();}adjusting=false;});}}else restore(previousAnchor,nextPrefix,nextRanges);prefix=nextPrefix;ranges=nextRanges;lastWidth=width;this.renderedHeight=result.length;layout=hadFrame?'reading-window':'awaiting-viewport-frame';
   if(latestRequested){latestRequested=false;const own=frame;queueMicrotask(()=>{if(owned()&&frame===own){root.scrollToBottom();lastTop=root.viewportTop;root.requestRender();}});}
   return result;
  }catch{layout='unverified-reading-window-native-fallback';this.children=[backing];return super.render(width);}}
  handleMouse(e){if(e.type==='wheel'&&e.wheelDelta&&!root.hasActiveSelection()){const requested=e.wheelDelta<0&&start>0&&e.y<Math.max(3,root.terminal.rows)?'older':e.wheelDelta>0&&end<sourceLength&&e.y>Math.max(0,this.renderedHeight-root.terminal.rows)?'newer':undefined;if(requested){edgeRequest=requested;root.requestRender();}}return super.handleMouse(e);}
 }
 const view=new ReadingWindow();view[WINDOW]=true;parent.children[index]=view;
 return{mounted:true,reason:'ready',backing,view,owned,navigate,
  status:()=>({mounted:owned(),layout,archived,newer,projected:selected.length,total:sourceLength,limit,start,end,following,cacheEntries:cache.size,nativeRenderCalls:renderCalls,cacheHits,selectionPinned:root.hasActiveSelection(),contextGaps,contextNavigation:'gap-v1',width:lastWidth}),
  refresh(nodes){if(nodes===undefined){countsDirty=0;for(const n of cache.keys())dirty.add(n);for(const [n,i]of indices)assess(n,i);return;}for(const n of nodes){dirty.add(n);const i=indices.get(n);if(i!==undefined){countsDirty=Math.min(countsDirty,i);assess(n,i);}}},
  selectedRows:()=>selected.slice(),
  historyPage:(page,size=100)=>{if(!Number.isSafeInteger(page)||page<0||!Number.isSafeInteger(size)||size<1||size>2000)throw Error('Invalid history page');return backing.children.slice(Math.max(0,start-(page+1)*size),Math.max(0,start-page*size));},
  stop(){stopped=true;const slots=parent.children.flatMap((n,i)=>n===view?[i]:[]);cache.clear();dirty.clear();if(slots.length!==1)return false;parent.children[slots[0]]=backing;backing.invalidate();return true;},
 };
}
