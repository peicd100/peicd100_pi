import*as Tui from'@earendil-works/pi-tui';import{makePanel}from'../../../src/panel_v0.17.0.mjs';import{makeDialogCanvas}from'../../../src/dialog_v0.16.0.mjs';import{summaryRows,bucketRows,cardRows,clean,local}from'./presentation_v0.4.0.mjs';
// Projection only: no inspect(), grants, HTTP or submission in render/mouse.
// Result is an INTENT. Controller must recheck scope and confirm an exact card.
export function createDashboardSource(snapshot,options={},deps=Tui,{done=()=>{},theme={fg:(_k,s)=>s},valid=()=>true}={}){
 const cards=snapshot?.availability?.state==='ready'?snapshot.availability.cards:[],actions=[{label:'返回〔預設〕',value:{action:'return'}},{label:'使用重置（明選卡片）',value:{action:'manual'}},{label:`自動用卡：${options.mode==='each'?'每次（有限N）':options.mode==='once'?'一次':'關閉'}（設定）`,value:{action:'settings'}}];for(let i=0;i<cards.length;i++){actions.push({label:'詳情',value:{action:'details',index:i}},{label:'使用這張',value:{action:'use',index:i}});}let selected=0,positions=new Map(),hits=[],lastWidth=0,version=0;
 const styled=(i,text)=>theme.fg?.(i===selected?'accent':'muted',text)??text,activate=i=>{if(!valid())return done(undefined);if(i!==0&&lastWidth<12)return;done(actions[i]?.value);};
 const wrap=(s,w)=>deps.wrapTextWithAnsi(String(s),Math.max(1,w)).map(x=>deps.truncateToWidth(x,Math.max(1,w),'')),pad=(s,w)=>s+' '.repeat(Math.max(0,w-deps.visibleWidth(s)));
 const source={
  render(width){lastWidth=width;positions=new Map();hits=[];const rows=[],button=(index,x=0,y=rows.length,w=width)=>{const text=styled(index,`${index===selected?'>':' '} [${actions[index].label}]`);positions.set(index,y);hits.push({index,x,y,width:Math.max(0,Math.min(w,deps.visibleWidth(text)))});return deps.truncateToWidth(text,w,'');};
   for(let i=0;i<3;i++)rows.push(button(i));if(width<12){rows.push(...wrap('視窗過窄；請先放大再設定／使用卡片。',width));return rows;}
   for(const line of summaryRows(snapshot,options))rows.push(...wrap(line,width));
   for(const metric of snapshot?.view?.report?.metrics??[])if(metric.id!=='reset-credits')rows.push(...wrap(`${local(metric.label)}：${local(metric.value)}`,width));
   for(const b of snapshot?.view?.report?.buckets??[]){rows.push('');for(const line of bucketRows(snapshot,b,width))rows.push(...wrap(line,width));}
   if(!cards.length){rows.push('');rows.push(...wrap(snapshot?.availability?.state==='ready'?'沒有已核實可明選的卡片。':'卡片明細未知；不造0張或虛構卡片。',width));return rows;}
   rows.push('');const gap=2,cols=width>=70?Math.max(1,Math.floor((width+gap)/36)):1,cell=Math.floor((width-gap*(cols-1))/cols);
   for(let offset=0;offset<cards.length;offset+=cols){const group=cards.slice(offset,offset+cols).map((card,j)=>{const index=offset+j,inner=Math.max(1,cell-4),content=cardRows(card,index).flatMap(s=>wrap(s,inner)),detail=3+index*2,use=detail+1;content.push('');const detailY=content.length+1;content.push(button(detail,j*(cell+gap)+2,rows.length+detailY,inner));const useY=content.length+1;content.push(button(use,j*(cell+gap)+2,rows.length+useY,inner));return['╭'+'─'.repeat(Math.max(0,cell-2))+'╮',...content.map(s=>'│ '+pad(s,inner)+' │'),'╰'+'─'.repeat(Math.max(0,cell-2))+'╯'];});const height=Math.max(...group.map(x=>x.length));for(let y=0;y<height;y++)rows.push(group.map(g=>pad(g[y]??'',cell)).join(' '.repeat(gap)));rows.push('');}
   return rows.map(x=>deps.truncateToWidth(x,width,''));
  },
  invalidate(){version++;},revision:()=>version,
  move(delta){selected=(selected+delta+actions.length)%actions.length;version++;return positions.get(selected)??0;},first(){selected=0;version++;return 0;},last(){selected=actions.length-1;version++;return positions.get(selected)??0;},select:()=>activate(selected),
  handleMouse(event){if(event.type!=='click'||event.button!=='left'||event.shift||event.alt||event.ctrl)return;const hit=hits.find(h=>event.y===h.y&&event.x>=h.x&&event.x<h.x+h.width);if(!hit)return;selected=hit.index;version++;activate(selected);return{handled:true,focus:true};},
  status:()=>({selected,actions:actions.map(x=>({...x.value})),hits:hits.map(x=>({...x})),positions:[...positions],width:lastWidth}),
 };return source;
}
export async function showUsageDashboard(ctx,snapshot,options={},valid=()=>true,signal){
 if(ctx.mode!=='tui'||typeof ctx.ui?.custom!=='function'){ctx.ui.notify('目前介面只顯示資訊，不提供用卡控制。','info');return;}
 let canvas,activeTui,finish,finished=false;const abort=()=>finish?.(undefined);try{return await ctx.ui.custom((tui,theme,keys,done)=>{activeTui=tui;finish=value=>{if(finished)return;finished=true;canvas?.dispose();done(valid()?value:undefined);};const source=createDashboardSource(snapshot,options,Tui,{done:finish,theme,valid});let panel;
  panel=makePanel({tui,theme,done:()=>finish(undefined),title:'Usage｜訂閱額度與重置卡',source,deps:Tui,revision:source.revision,valid,hint:()=>`Esc／Ctrl+C返回；↑↓／Tab選動作，Enter確認；PgUp/Dn閱覽；點卡面不提交`,input:key=>{if(keys.matches(key,'tui.select.confirm'))source.select();else if(keys.matches(key,'tui.select.down')||Tui.matchesKey(key,'tab'))panel.reveal(source.move(1));else if(keys.matches(key,'tui.select.up')||Tui.matchesKey(key,'shift+tab'))panel.reveal(source.move(-1));else if(keys.matches(key,'tui.select.pageDown'))panel.reveal(Math.min((panel.status().allHeight??1)-1,(panel.status().scrollTop??0)+(panel.status().bodyHeight??1)));else if(keys.matches(key,'tui.select.pageUp'))panel.reveal(Math.max(0,(panel.status().scrollTop??0)-(panel.status().bodyHeight??1)));else if(Tui.matchesKey(key,'home'))panel.reveal(source.first());else if(Tui.matchesKey(key,'end'))panel.reveal(source.last());}});
  canvas=makeDialogCanvas({panel,tui,theme,deps:Tui});signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();return canvas;
 },{overlay:true,overlayOptions:()=>activeTui?.mode==='fullscreen'?{width:'100%',maxHeight:'100%',row:0,col:0}:{width:'90%',maxHeight:'90%'},blocked:{kind:'permission',message:'Usage用卡控制；尚未授權或送出'}});}finally{signal?.removeEventListener('abort',abort);canvas?.dispose();}
}
