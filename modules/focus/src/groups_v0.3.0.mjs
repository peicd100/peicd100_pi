// Typed presentation records only. No message text, native private fields,
// session reads or tool execution. Completed prefixes are not rescanned.
const fields=['thinking','tools','running','pending','done','failed','images','interactive','durationMs','knownDuration'];
const zeros=()=>Object.fromEntries(fields.map(k=>[k,0]));
const validKey=key=>key!==null&&(typeof key==='object'||typeof key==='function');
const sameSegments=(a,b)=>a.length===b.length&&a.every((s,i)=>s.kind===b[i].kind&&s.key===b[i].key);
export class FocusGroups{
 constructor(){this.serial=0;this.version=0;this.dataVersion=0;this.anchors=new WeakMap();this.meta=new WeakMap();this.members=new WeakMap();this.groups=[];this.current=undefined;this.before=[];this.indices=new Map();this.cache=new WeakMap();this.dirtyRows=new Set();this.structuralRows=new Set();this.imageBoundaries=new WeakSet();this.source=undefined;this.count=0;this.first=undefined;this.last=undefined;this.work={described:0,processed:0};}
 groupFor(key){return this.members.get(key)?.group;}
 segments(row){return this.cache.get(row)??[];}
 dirty(row){if(this.indices.has(row))this.dirtyRows.add(row);}
 touch(key){const g=this.groupFor(key);if(g){g.revision++;this.dataVersion++;}}
 weight(segment,meta){const w=zeros();if(segment.kind==='thinking'){w.thinking=1;return w;}w.tools=1;const phase=meta?.phase??'pending';if(phase==='running')w.running=1;else if(phase==='done'||phase==='error')w.done=1;else w.pending=1;w.failed=meta?.error?1:0;w.images=meta?.image?1:0;w.interactive=meta?.interactive?1:0;if(Number.isFinite(meta?.durationMs)&&meta.durationMs>=0){w.durationMs=meta.durationMs;w.knownDuration=1;}return w;}
 add(group,weight,direction=1){for(const key of fields)group.counts[key]+=direction*weight[key];}
 // Once a returned image split this presentation timeline, later status/text
 // updates cannot silently merge post-image work back into the pre-image group.
 hasImageBoundary(key){return validKey(key)&&this.imageBoundaries.has(key);}
 setMeta(key,value){if(!validKey(key))throw new Error('Invalid owned group key');const previous=this.meta.get(key),next={phase:value.phase,error:!!value.error,image:!!value.image,interactive:!!value.interactive,durationMs:value.durationMs},newBoundary=next.image&&!this.imageBoundaries.has(key);if(next.image)this.imageBoundaries.add(key);if(previous&&Object.keys(next).every(k=>next[k]===previous[k]))return false;this.meta.set(key,next);const record=this.members.get(key);if(record){this.add(record.group,record.weight,-1);record.weight=this.weight(record.segment,next);this.add(record.group,record.weight);record.group.revision++;this.dataVersion++;if(newBoundary&&record.segment.row){this.dirtyRows.add(record.segment.row);this.structuralRows.add(record.segment.row);}}return true;}
 truncate(group,length=0){while(group.members.length>length){const segment=group.members.pop(),record=this.members.get(segment.key);if(record?.group===group){this.add(group,record.weight,-1);this.members.delete(segment.key);}}group.revision++;}
 rollback(index){const point=this.before[index]??{groups:0,current:undefined,length:0};for(let i=this.groups.length-1;i>=point.groups;i--)this.truncate(this.groups[i]);this.groups.length=point.groups;if(point.current)this.truncate(point.current,point.length);this.current=point.current;this.before.length=index;}
 append(segment){if(!validKey(segment.key))throw new Error('Missing typed member key');if(this.members.has(segment.key))throw new Error('Duplicate visible member');let group=this.current;
  if(!group){group=this.anchors.get(segment.key);if(!group){group={id:++this.serial,members:[],counts:zeros(),revision:0};this.anchors.set(segment.key,group);}else this.truncate(group);this.groups.push(group);this.current=group;}
  group.members.push(segment);const weight=this.weight(segment,this.meta.get(segment.key));this.members.set(segment.key,{group,segment,weight});this.add(group,weight);group.revision++;
 }
 describe(row,fn){const parts=fn(row);this.work.described++;if(!Array.isArray(parts)||parts.some(p=>!p||!['body','thinking','tool','boundary','spacing'].includes(p.kind)))throw new Error('Unverified typed row');return parts;}
 update(rows,describe){if(!Array.isArray(rows)||typeof describe!=='function')throw new Error('Invalid native row source');this.work={described:0,processed:0};
  const appendOnly=this.source===rows&&rows.length>=this.count&&rows[0]===this.first&&rows[this.count-1]===this.last,changed=new Map();let from=appendOnly?this.count:0;
  if(!appendOnly){this.rollback(0);this.before=[];this.indices.clear();this.cache=new WeakMap();}
  else for(const row of this.dirtyRows){const i=this.indices.get(row);if(i===undefined||rows[i]!==row){from=0;break;}const next=this.describe(row,describe),old=this.cache.get(row)??[];
   if(sameSegments(old,next)&&!this.structuralRows.has(row)){for(let n=0;n<old.length;n++)Object.assign(old[n],next[n]);}
   else{changed.set(row,next);from=Math.min(from,i);}
  }
  this.dirtyRows.clear();this.structuralRows.clear();
  if(from===rows.length&&appendOnly)return false;
  if(appendOnly)this.rollback(from);
  for(let i=from;i<rows.length;i++){
   const row=rows[i],existing=this.indices.get(row);if(existing!==undefined&&existing!==i&&rows[existing]===row)throw new Error('Duplicated native row');this.indices.set(row,i);
   this.before[i]={groups:this.groups.length,current:this.current,length:this.current?.members.length??0};
   const segments=changed.get(row)??this.cache.get(row)??this.describe(row,describe);this.cache.set(row,segments);this.work.processed++;
   for(const segment of segments){segment.row=row;if(segment.kind==='thinking'||segment.kind==='tool'){const boundary=this.hasImageBoundary(segment.key);if(boundary)this.current=undefined;this.append(segment);if(boundary)this.current=undefined;}else if(segment.kind!=='spacing')this.current=undefined;}
  }
  this.before[rows.length]={groups:this.groups.length,current:this.current,length:this.current?.members.length??0};this.source=rows;this.count=rows.length;this.first=rows[0];this.last=rows.at(-1);this.version++;this.dataVersion++;return true;
 }
 summary(group){return{id:group.id,members:group.members.length,...group.counts};}
 status(){return{rows:this.count,groups:this.groups.length,version:this.version,dataVersion:this.dataVersion,lastDescribed:this.work.described,lastProcessed:this.work.processed};}
 reset(){for(const group of this.groups)this.truncate(group);this.groups=[];this.current=undefined;this.before=[];this.indices.clear();this.cache=new WeakMap();this.dirtyRows.clear();this.structuralRows.clear();this.imageBoundaries=new WeakSet();this.source=undefined;this.count=0;this.first=undefined;this.last=undefined;this.meta=new WeakMap();this.members=new WeakMap();this.anchors=new WeakMap();this.version++;}
}
