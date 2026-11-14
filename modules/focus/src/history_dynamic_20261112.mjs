// Owned Focus/display instances only; no native prototype/private access.
export function installDynamicHistory(renderer){
 const display=renderer.display;if(typeof display?.setHistoryPresenter!=='function')return{active:false,reason:'old-display'};
 const original=renderer.safeToArchive,oldStop=renderer.stop,oldRestart=renderer.restart;let cache,source,first,last,length=-1,key;
 // Completed default/native readonly errors/images can leave the viewport.
 // Unknown/custom interactive renderers still fail closed through their flags.
 const safe=node=>{const v=renderer.lookup(node);return !!v&&!!v.result&&!v.partial&&!v.callInteractive&&!v.resultInteractive&&!v.customImage;};
 renderer.safeToArchive=function(node){return original.call(this,node)||safe(node);};
 const presenter={
  rows(rows){if(!renderer.grouped())return rows;const k=renderer.model.version+':'+renderer.model.dataVersion;
   if(source===rows&&length===rows.length&&first===rows[0]&&last===rows.at(-1)&&key===k)return cache;
   const selected=[],seen=new Set();let spacing;
   for(const row of rows){if(row?.constructor===renderer.deps.Spacer){spacing=row;continue;}
    const segments=renderer.model.segments(row);let keep=!segments.length&&row?.constructor!==renderer.deps.AssistantMessageComponent;
    for(const segment of segments){if(segment.kind==='spacing')continue;if(segment.kind==='body'||segment.kind==='boundary'||segment.kind==='notice'){keep=true;continue;}
     if(segment.kind!=='tool'&&segment.kind!=='thinking'){keep=true;continue;}
     const group=renderer.model.groupFor(segment.key);if(!group){keep=true;continue;}if(!seen.has(group)){seen.add(group);keep=true;}
     if(segment.kind==='tool'&&(!segment.view?.result||segment.view.partial||renderer.displayException(segment.view)))keep=true;
    }
    if(row===display.activeAssistant||row===display.attention)keep=true;
    if(keep){if(spacing&&selected.length)selected.push(spacing);selected.push(row);spacing=undefined;}
   }
   source=rows;length=rows.length;first=rows[0];last=rows.at(-1);key=k;cache=selected;return selected;
  },
  release(row){const view=renderer.nativeViews.get(row);if(view)for(const image of view.imageNodes??[])renderer.imageSurface(image,view).invalidate?.();},
  status:()=>({kind:'chronological-semantic-records',cachedRecords:cache?.length??0,rawRecords:length<0?0:length}),
 };
 display.setHistoryPresenter(presenter);renderer.restart=function(...args){const result=oldRestart.apply(this,args);display.setHistoryPresenter(presenter);return result;};renderer.stop=function(...args){if(display.historyPresenter===presenter)display.setHistoryPresenter(undefined);cache=undefined;return oldStop.apply(this,args);};return{active:true,presenter};
}
