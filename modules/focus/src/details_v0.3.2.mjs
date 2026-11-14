// Presentation-only accordion. Stable typed keys, no session writes or execution.
export function createGroupDetails(group,deps,{describe,renderBody}){
 const expanded=new Set(),positions=new Map();let version=0,selected,viewport={scrollTop:0,bodyHeight:0},request,pending,dragged=false,seenCount=group.members.length;
 const members=()=>group.members,clean=s=>deps.stripTerminalSequences(String(s??'')).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ');
 const anchor=key=>{const row=positions.get(key);return{key,offset:Number.isInteger(row)?row-viewport.scrollTop:undefined};};
 const toggle=key=>{pending=anchor(key);if(expanded.has(key))expanded.delete(key);else expanded.add(key);selected=key;version++;};
 const collapse=()=>{pending=anchor(selected??members().at(-1)?.key);expanded.clear();version++;};
 const end=()=>{selected=members().at(-1)?.key;request={end:true};version++;};
 return{
  preserveScrollOnNavigate:true,
  revision:()=>group.revision+':'+version,
  get panelActions(){const count=Math.max(0,members().length-seenCount);return[{label:'[全部收合]',run:collapse},{label:count?`[到底部：新增${count}項]`:'[到底部]',run:end}];},
  panelLayout(value){viewport=value;if(value.atEnd)seenCount=members().length;},
  takeScrollRequest(){const next=request;request=undefined;return next;},
  render(width){const previous=[...positions].filter(([,row])=>row<=viewport.scrollTop).at(-1),oldAnchor=previous?{key:previous[0],offset:previous[1]-viewport.scrollTop}:undefined;positions.clear();const rows=[];if(!selected||!members().some(m=>m.key===selected))selected=members().at(-1)?.key;
   for(const member of members()){
    const info=describe(member),label=clean(info.label),open=expanded.has(member.key),prefix=(member.key===selected?'> ':'  ')+(open?'[-] ':'[+] ');
    positions.set(member.key,rows.length);let title=deps.truncateToWidth(prefix+label,Math.max(1,width),'');
    if(info.error&&typeof info.theme?.fg==='function')title=info.theme.fg('error',title);rows.push(title);
    if(open){let body;try{body=renderBody(member,width);}catch{body=['內容無法安全驗證，原記錄保持不變。'];}
     if(!Array.isArray(body)||body.some(s=>typeof s!=='string'||/\x1b_G|\x1b\]1337;File=|\x1bP[0-9;]*q/u.test(s)))body=['此項保留在主畫面原生檢視。'];
     for(const line of body)rows.push(deps.truncateToWidth(line,Math.max(1,width),''));
    }
   }
   if(pending){const row=positions.get(pending.key);if(row!==undefined)request={row,...(pending.offset!==undefined?{offset:pending.offset}:{})};pending=undefined;}
   else if(!request&&!viewport.atEnd&&oldAnchor&&positions.has(oldAnchor.key))request={row:positions.get(oldAnchor.key),offset:oldAnchor.offset};
   return rows.length?rows:['此群組目前沒有可見項目。'];
  },
  handleMouse(event){if(event.type==='press')dragged=false;if(event.type==='drag'){dragged=true;return;}
   if(event.type!=='click'||event.button!=='left')return;if(dragged){dragged=false;return;}
   const entry=[...positions].find(([,row])=>row===event.y);if(!entry)return;toggle(entry[0]);return{handled:true};
  },
  navigateKey(key){const list=members();if(!list.length)return false;const match=name=>deps.matchesKey(key,name),i=Math.max(0,list.findIndex(m=>m.key===selected));
   if(match('return')||key===' '){toggle(selected??list.at(-1).key);return true;}
   if(match('up')||match('down')){selected=list[Math.max(0,Math.min(list.length-1,i+(match('up')?-1:1)))].key;request={row:positions.get(selected)??0};version++;return true;}
   if(key==='c'){collapse();return true;}return false;
  },
  invalidate(){version++;},
  status:()=>({expanded:expanded.size,selectedIndex:members().findIndex(m=>m.key===selected),rows:[...positions.values()]}),
 };
}
