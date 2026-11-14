// Optional raw read-only history browser, not a custom()/ui_prompt transaction.
// It freezes its end at open: streamed arrivals never pull the reader forward.
export function createHistorySource({getRows,renderRows,deps,size=50}){
 if(typeof getRows!=='function'||typeof renderRows!=='function'||!Number.isSafeInteger(size)||size<1||size>200||!['truncateToWidth','visibleWidth','matchesKey'].every(k=>typeof deps[k]==='function'))throw Error('Invalid history source');
 let end=getRows().length,page=0,version=0,last;
 const pages=()=>Math.max(1,Math.ceil(Math.min(end,getRows().length)/size));
 const move=direction=>{const before=page;if(direction==='latest'){end=getRows().length;page=0;version++;}else page=Math.max(0,Math.min(pages()-1,page+(direction==='older'?1:-1)));if(page!==before)version++;};
 return{
  render(width){const rows=getRows();end=Math.min(end,rows.length);page=Math.min(page,pages()-1);const to=Math.max(0,end-page*size),from=Math.max(0,to-size),labels='[較早] [較新] [最新]',caption=`${labels} 第${page+1}/${pages()}頁｜←較早／→較新`,body=renderRows(rows.slice(from,to),width);last={width,labels};return[deps.truncateToWidth(caption,width,''),...body];},
  navigateKey(key){if(deps.matchesKey(key,'left')){move('older');return true;}if(deps.matchesKey(key,'right')){move('newer');return true;}return false;},
  handleMouse(e){if(e.type!=='click'||e.button!=='left'||e.y!==0||!last)return;for(const[label,direction]of[['[較早]','older'],['[較新]','newer'],['[最新]','latest']]){const i=last.labels.indexOf(label),x=deps.visibleWidth(last.labels.slice(0,i));if(e.x>=x&&e.x<x+deps.visibleWidth(label)){move(direction);return{handled:true};}}},
  revision:()=>version,
  invalidate(){version++;},
  status:()=>({page,pages:pages(),frozenEnd:end,size}),
 };
}
