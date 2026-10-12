import {analyzeBranch as analyze,assessAnalysis,formatAnalysis as formatLegacy,formatTechnicalAnalysis} from './analysis_v1.6.0.mjs';
export {assessAnalysis,formatTechnicalAnalysis};
// Metadata discovery is bounded independently from payload analysis. Omitted
// unrelated history is not missing proof. Never read files or alter the branch.
export function analyzeBranch(input,options={}){
 const initial=options.maxEntries??10000,metadataLimit=options.metadataLimit??100000,bodyLimit=options.bodyLimit??100000,recent=options.recentSlides??5;
 if(!Array.isArray(input)||![initial,metadataLimit,bodyLimit,recent].every(Number.isSafeInteger)||initial<1||initial>100000||metadataLimit<1||metadataLimit>100000||bodyLimit<initial||bodyLimit>100000||recent<1||recent>100)throw new Error('分析範圍無效。');
 const metaStart=Math.max(0,input.length-metadataLimit),positions=new Map(),owners=new Map();for(let i=metaStart;i<input.length;i++){positions.set(input[i].id,i);const m=input[i].message;if(m?.role==='assistant'&&Array.isArray(m.content))for(const c of m.content)if(c.type==='toolCall'&&typeof c.id==='string'&&!owners.has(c.id))owners.set(c.id,i);}
 const checkpoints=[];let previous;
 for(let i=metaStart;i<input.length;i++){
  const e=input[i];let data;if(e.type==='custom'&&e.customType==='acm-passive')data=e.data;
  else if(e.type==='compaction'&&e.details?.acmPassive?.version===1)data={cursorId:e.firstKeptEntryId,...e.details.acmPassive};
  if(!data||typeof data!=='object')continue;
  const rank=positions.get(data.cursorId),old=positions.get(previous?.cursorId);
  if(data.cursorId&&(rank===undefined||previous===undefined||old===undefined||rank>old)||previous&&Array.isArray(previous.carriedIds)&&previous.carriedIds.some(id=>!Array.isArray(data.carriedIds)||!data.carriedIds.includes(id)))checkpoints.push({index:i,data});
  previous=data;
 }
 const selected=checkpoints.slice(-(recent+1));let start=Math.max(metaStart,input.length-initial),missing=0;
 for(const c of selected){
  start=Math.min(start,c.index);
  for(const id of [c.data.cursorId,...(Array.isArray(c.data.carriedIds)?c.data.carriedIds:[])]){
   if(!id)continue;const rank=positions.get(id);if(rank===undefined){missing++;continue;}start=Math.min(start,rank);
   // Include the owning assistant for a boundary/read result, not just its result.
   if(input[rank]?.message?.role==='toolResult'){
    const owner=owners.get(input[rank].message.toolCallId);
    if(owner!==undefined&&owner<rank)start=Math.min(start,owner);else missing++;
   }
  }
 }
 const wantedStart=start;start=Math.max(start,input.length-bodyLimit);const limited=start>wantedStart;
 const firstCheckpoint=selected[0]?.index??start;
 const payload=input.slice(start).filter((e,i)=>i+start>=firstCheckpoint||!(e.type==='custom'&&e.customType==='acm-passive'||e.type==='compaction'&&e.details?.acmPassive?.version===1));
 const report=analyze(payload,{...options,maxEntries:bodyLimit});
 report.omitted_entries=start;report.entries=input.length-start;
 report.scope.discovery_entries=input.length-metaStart;report.scope.payload_entries=report.entries;
 report.scope.expanded_entries=Math.max(0,report.entries-initial);report.scope.selection_strategy='RECENT_SLIDE_DEPENDENCIES';
 report.scope.missing_dependency_ids=missing;report.scope.budget_limited=limited;
 // A truncated metadata index with fewer than one predecessor + requested cuts
 // cannot prove that the baseline was available.
 const discoveryGap=metaStart>0&&selected.length<recent+1;
 report.scope.complete=report.unbound_slides===0&&missing===0&&!limited&&!discoveryGap;
 report.scope.verified_slides=report.successful_slides;report.assessment=assessAnalysis(report);
 return report;
}
export function formatAnalysis(report,percentages){
 let text=formatLegacy(report,percentages);
 if(report.scope.complete&&report.omitted_entries)text=text.replace('\n\n建議：',`\n較早 ${report.omitted_entries} 筆與本次必要證據無關，未納入；不影響此範圍判讀。\n\n建議：`);
 if(!report.scope.complete)text=text.replace(/歷史／邊界證據不完整：[^\n]*/,`必要證據尚不完整：${report.unbound_slides} 個邊界無法驗證、${report.scope.missing_dependency_ids} 個依賴未定位${report.scope.budget_limited?'；已達讀取預算':''}。`);
 return text;
}
