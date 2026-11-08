// Presentation metadata only. Arguments/results are referenced, never edited.
// Membership comes from the actual public Container layout, not guessed message
// semantics: native thinking labels, notices and third-party entries stay barriers.
const labels={read:'讀取檔案',write:'寫入檔案',edit:'修改檔案',bash:'執行指令',powershell:'執行指令',grep:'搜尋',find:'搜尋',ls:'列出檔案',codemode:'執行腳本',update_progress:'更新進度',peicd100_goal:'管理目標',codex_generate_image:'產生或編輯圖片'};
export class ToolGroups{
 constructor(invalidate=()=>{}){this.invalidate=invalidate;this.rows=new Map();this.groups=new Map();this.layoutKey='';}
 group(row){return row?.groupId==null?undefined:this.groups.get(row.groupId);}
 changed(g){if(g?.ids.length)this.invalidate(g.ids[0]);}
 ensure(id,name,args){if(typeof id!=='string'||!id||typeof name!=='string'||!name)throw new Error('工具顯示識別資料無法驗證');let row=this.rows.get(id);if(row){if(row.name!==name)throw new Error('重複顯示ID使用不同工具名稱');row.args=args;return row;}
  row={id,name,args,argsComplete:false,started:false,partial:false,error:false,interactive:false,hasImage:false,result:undefined,groupId:null,hostExpanded:false};this.rows.set(id,row);return row;
 }
 contribute(row){const g=this.group(row);if(!g)return;const done=!!row.result&&!row.partial,flags={running:!done&&row.started,pending:!done&&!row.started,preparing:!done&&!row.started&&!row.argsComplete,failures:row.error,images:row.hasImage,interactive:row.interactive};
  for(const [key,value] of Object.entries(flags))if(value)g[key].add(row.id);else g[key].delete(row.id);
 }
 // Called once per changed layout. Reuse each leader's user-open state; only
 // actual visible tool rows count. No branch reads, model calls or log rewrites.
 applyLayout(runs){if(!Array.isArray(runs))throw new Error('工具介面排列必須是陣列');const seen=new Set();for(const ids of runs){if(!Array.isArray(ids)||ids.some(id=>!this.rows.has(id)||seen.has(id)))throw new Error('未知或重複的工具介面排列');for(const id of ids)seen.add(id);if(new Set(ids).size!==ids.length)throw new Error('重複的工具介面排列');}
  const key=JSON.stringify(runs);if(key===this.layoutKey)return false;const previous=this.groups,oldMembership=new Map([...this.rows.values()].map(r=>[r.id,r.groupId]));this.groups=new Map();this.layoutKey=key;for(const r of this.rows.values())r.groupId=null;
  for(const ids of runs){if(!ids.length)continue;const leader=ids[0];
   const old=previous.get(leader),hostExpanded=this.rows.get(leader).hostExpanded,g={id:leader,ids:[...ids],running:new Set(),pending:new Set(),preparing:new Set(),failures:new Set(),images:new Set(),interactive:new Set(),hostExpanded,manual:old?.hostExpanded===hostExpanded?old.manual:undefined,lastOpen:old?.lastOpen??false};this.groups.set(leader,g);
   for(const id of ids){const row=this.rows.get(id);if(row.groupId!==null)throw new Error('同一工具介面出現在多個群組');row.groupId=leader;this.contribute(row);}
  }
  for(const r of this.rows.values())if(oldMembership.get(r.id)!==r.groupId)this.invalidate(r.id);return true;
 }
 sync(id,values){const r=this.rows.get(id);if(!r)return;let changed=false;for(const key of ['argsComplete','started'])if(values[key]===true&&!r[key]){r[key]=true;changed=true;}
  if(typeof values.interactive==='boolean'&&r.interactive!==values.interactive){r.interactive=values.interactive;changed=true;}
  if(typeof values.hostExpanded==='boolean'&&r.hostExpanded!==values.hostExpanded){r.hostExpanded=values.hostExpanded;const g=this.group(r);if(g){g.hostExpanded=r.hostExpanded;g.manual=undefined;}changed=true;}
  if(changed){this.contribute(r);this.changed(this.group(r));}return r;
 }
 result(id,result,partial=false,error=false,durationMs){const r=this.rows.get(id);if(!r)return;if(r.result&&!r.partial&&partial)return r;
  const hasImage=!!result?.content?.some?.(x=>x?.type==='image'),changed=r.result?.content!==result?.content||r.result?.details!==result?.details||r.partial!==partial||r.error!==error||r.durationMs!==durationMs||r.hasImage!==hasImage;
  r.result=result;r.partial=partial;r.error=error;r.durationMs=durationMs;r.hasImage=hasImage;if(changed){this.contribute(r);this.changed(this.group(r));}return r;
 }
 open(g){return !!g&&(g.interactive.size>0||(g.manual??g.hostExpanded));}
 toggle(g){if(!g||g.interactive.size)return false;g.manual=!this.open(g);this.changed(g);return true;}
 header(g){let action;if(g.running.size){const first=this.rows.get(g.running.values().next().value);action='正在'+(labels[first?.name]??'執行工具')+(g.running.size>1?`＋另${g.running.size-1}項執行中`:'');}
  else if(g.pending.size)action=g.preparing.size?'工具參數準備中':'等待執行';else action='執行結束';
  return `${g.failures.size?`! ${g.failures.size}項失敗｜`:''}${this.open(g)?'▾':'▸'} 工具紀錄 ${g.ids.length}項｜${action}${g.images.size?'｜圖片沿用原生設定':''}${g.interactive.size?'｜互動介面保留展開':''}`;
 }
}
