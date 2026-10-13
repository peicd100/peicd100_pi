import {createHash} from 'node:crypto';
import path from 'node:path';
const hash=s=>createHash('sha256').update(s).digest('hex');
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const name=s=>String(s??'').split('.').at(-1);
const visible=message=>Array.isArray(message?.content)&&message.content.length&&message.content.every(b=>b.type==='text'&&typeof b.text==='string')?message.content.map(b=>b.text).join('\n'):null;
const validState=s=>s&&typeof s==='object'&&(s.cursorId===null||typeof s.cursorId==='string')&&['carriedIds','anchorIds'].every(k=>s[k]===undefined||Array.isArray(s[k])&&s[k].every(x=>typeof x==='string'));
const included=(rank,id,state,ranks)=>!state.cursorId||rank>=ranks.get(state.cursorId)||[...(state.carriedIds??[]),...(state.anchorIds??[]),state.taskAnchorId].includes(id);

const validPercentages=p=>p&&integer(p.triggerPercent)&&integer(p.targetPercent)&&p.triggerPercent<=100&&p.targetPercent>0&&p.triggerPercent-p.targetPercent>=5;
export function assessAnalysis(report) {
  const s=report.scope;
  if(!s.complete)return {code:'INCOMPLETE',label:'資料不完整，無法判斷是否需要調整',advice:'先維持目前設定；缺少的歷史或邊界證據不能當成沒有重讀。'};
  if(report.successful_slides<3)return {code:'INSUFFICIENT',label:'縮減紀錄不足，暫不建議調整比例',advice:'先維持目前設定；至少累積三次同一模型／設定範圍的縮減再觀察。'};
  if(!s.settings_verified)return {code:'UNKNOWN_SETTINGS',label:'歷史比例未記錄，不能套用目前比例判讀',advice:'先維持目前設定；新版之後的縮減會記錄當時模型與比例。'};
  if(s.observation_pending)return {code:'OBSERVING',label:'仍在觀察縮減後的回應，暫不建議調整',advice:'先維持目前設定；最近縮減的後續五次回應尚未收集完整。'};
  if(report.post_slide_repeats)return {code:'REVIEW_CANDIDATES',label:'有縮減後重讀案例，值得檢查但不代表浪費',advice:'先檢查是否為修改驗證或任務恢復，不只憑重讀次數調比例。確認剛移出的資料經常要讀回，且預算有餘裕時，才一次提高保留目標 5 個百分點；需維持觸發與保留至少相差 5。'};
  return {code:'NO_ADJUSTMENT_EVIDENCE',label:'此範圍未找到調整比例的依據',advice:'維持目前設定；沒有找到重讀候選，不代表沒有其他成本。'};
}
export function formatAnalysis(report,percentages) {
  const s=report.scope,a=report.assessment;
  const lines=['ACM 唯讀分析',`判讀：${a.label}。`,'',
    `範圍：最近最多 ${s.requested_slides} 次上下文縮減，每次觀察後續 ${s.post_slide_responses} 次模型回應（含工具呼叫回應）。`,
    `觀察：此範圍有 ${report.successful_slides} 次縮減、${report.post_slide_repeats} 次相同內容重讀候選。`];
  if(report.observed_post_slide_writes||report.observed_post_slide_recovery)lines.push(`其中 ${report.observed_post_slide_writes} 次有寫入紀錄、${report.observed_post_slide_recovery} 次涉及恢復檔案；分類可能重疊，不代表多餘讀取。`);
  if(s.mixed_epoch_excluded)lines.push('不同模型或已記錄比例的舊縮減未混入判讀。');
  if(!s.complete)lines.push(`歷史／邊界證據不完整：較早 ${report.omitted_entries} 筆未掃描，${report.unbound_slides} 個邊界無法驗證。`);
  lines.push('',`建議：${a.advice}`);
  if(validPercentages(percentages))lines.push(`目前設定：使用量到 ${percentages.triggerPercent}% 時，嘗試縮減至 ${percentages.targetPercent}%（不是歷史設定或實際保證值）。`);
  if(!s.settings_verified)lines.push('歷史比例：未知。');
  lines.push('不自動調參、不呼叫模型；Token／快取／紀錄估算費用與證據 ID 請用 /acm-analysis json，費用不是訂閱額度。');
  return lines.join('\n');
}

// All classification uses observable branch facts; no files, LLM, writes or semantic motives.
export function analyzeBranch(input,{cwd='.',platform=process.platform,maxEntries=10000,postSlideResponses=5,recentSlides=5,currentRoute,currentPercentages,historyBaselineComplete=true,readWindowSlides=40}={}) {
  if(!integer(readWindowSlides)||readWindowSlides<1||readWindowSlides>100)throw new Error('讀取縮減範圍無效。');
  if(!Array.isArray(input)||!integer(maxEntries)||maxEntries<1||maxEntries>100000||!integer(recentSlides)||recentSlides<1||recentSlides>100||!integer(postSlideResponses)||postSlideResponses<1||postSlideResponses>100)throw new Error('分析範圍無效。');
  const branch=input.slice(-maxEntries),ranks=new Map(branch.map((e,i)=>[e.id,i])),otherEdits=new Map();
  for(let i=0;i<branch.length;i++){
    const e=branch[i];
    if(e.type==='context_edit'&&typeof e.targetId==='string'&&!otherEdits.has(e.targetId))otherEdits.set(e.targetId,i);
    if(e.type==='custom'&&e.customType==='acm')for(const[id,value]of Object.entries(e.data?.pruned??{}))if(value&&!otherEdits.has(id))otherEdits.set(id,i);
  }
  const report={schema_version:1,entries:branch.length,omitted_entries:input.length-branch.length,model_responses:0,successful_slides:0,reads:0,repeated_reads:0,post_slide_repeats:0,write_followup_repeats:0,recovery_path_candidates:0,repeated_commands:0,ambiguous_tools:0,unbound_slides:0,usage:[],evidence:[],unknown:['重讀動機與正常任務恢復','工具預覽是否造成重讀','未留下紀錄的預算中止','歷史比例與訂閱實際額度']};
  const usage=new Map(),steps=new Map(),responseEpochs=new Map();let step=0,lastAssistant,lastRoute,routeEpoch=0,state={cursorId:null,carriedIds:[],anchorIds:[]};const slides=[],slideIds=new Set();
  for(let i=0;i<branch.length;i++) {
    const e=branch[i],m=e.message;
    if(e.type==='message'&&m?.role==='assistant') {
      step++;lastAssistant=e;report.model_responses++;steps.set(e.id,step);
      const route=JSON.stringify([m.provider??'unknown',m.api??'unknown',m.model??'unknown']);
      if(lastRoute!==route){routeEpoch++;lastRoute=route;}responseEpochs.set(e.id,routeEpoch);
      const row=usage.get(route)??{route:JSON.parse(route),responses:0,usage_samples:0,input:0,cache_read:0,cache_write:0,output:0,estimated_cost:0,cost_samples:0,zero_cost_samples:0};row.responses++;
      if(m.usage&&['input','cacheRead','cacheWrite','output'].every(k=>integer(m.usage[k]))) {row.usage_samples++;row.input+=m.usage.input;row.cache_read+=m.usage.cacheRead;row.cache_write+=m.usage.cacheWrite;row.output+=m.usage.output;}
      const cost=m.usage?.cost?.total;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0){row.cost_samples++;row.estimated_cost+=cost;if(cost===0)row.zero_cost_samples++;}usage.set(route,row);
    }
    let next;
    if(e.type==='custom'&&e.customType==='acm-passive')next={...state,...e.data};
    else if(e.type==='compaction'&&e.details?.acmPassive?.version===1)next={...state,cursorId:e.firstKeptEntryId,carriedIds:e.details.acmPassive.carriedIds??[],taskAnchorId:e.details.acmPassive.taskAnchorId};
    else if(e.type==='compaction'&&typeof e.summary==='string'&&typeof e.firstKeptEntryId==='string')next={...state,cursorId:e.firstKeptEntryId,carriedIds:[],anchorIds:[]};
    if(!next)continue;
    if(!validState(next)||next.cursorId&&!ranks.has(next.cursorId)){report.unbound_slides++;continue;}
    const oldRank=state.cursorId?ranks.get(state.cursorId):-1,newRank=next.cursorId?ranks.get(next.cursorId):-1;
    const removedCarry=(state.carriedIds??[]).some(id=>!included(ranks.get(id),id,next,ranks));
    if((newRank>oldRank||removedCarry||e.type==='compaction')&&!slideIds.has(e.id)) {
      if(typeof e.id!=='string'||!e.id){report.unbound_slides++;continue;}slideIds.add(e.id);
      // turn_end persists AFTER the response/tool batch. Bind the cut to its
      // calibration response, otherwise immediate same-response rereads get missed.
      const calibration=branch[i-1];let effectiveRank=i,responseId=null;
      if(calibration?.type==='custom'&&calibration.customType==='acm-passive-calibration') {
        const id=calibration.data?.responseEntryId,owner=branch[ranks.get(id)];
        if(owner?.message?.role==='assistant'&&!['error','aborted'].includes(owner.message.stopReason)){effectiveRank=ranks.get(id);responseId=id;}
      }
      const policy=e.data?.analysisPolicy;
      const validPolicy=policy?.version===1&&Array.isArray(policy.route)&&policy.route.length===3&&policy.route.every(x=>typeof x==='string')&&validPercentages(policy.percentages);
      const owner=responseId?branch[ranks.get(responseId)]:lastAssistant;
      const route=owner?.message?[owner.message.provider??'unknown',owner.message.api??'unknown',owner.message.model??'unknown']:null;
      slides.push({id:e.id,rank:i,effectiveRank,responseId,step:responseId?steps.get(responseId):step,before:state,after:next,
        route,routeEpoch:responseEpochs.get(owner?.id),percentages:validPolicy&&JSON.stringify(policy.route)===JSON.stringify(route)?policy.percentages:null});report.successful_slides++;
    }
    state=next;
  }
  report.usage=[...usage.values()].map(r=>({...r,prompt_tokens:r.input+r.cache_read+r.cache_write,cache_read_fraction:r.input+r.cache_read+r.cache_write?r.cache_read/(r.input+r.cache_read+r.cache_write):null}));
  // Baseline reads are scanned across the bounded history, but findings belong
  // only to the latest contiguous model/settings epoch, never mixed sessions.
  const epoch=[];let mixedEpoch=false;
  const latest=slides.at(-1),route=currentRoute??latest?.route;
  const percentages=currentPercentages??latest?.percentages;
  for(const s of [...slides].reverse()) {
    if(s.routeEpoch!==routeEpoch||JSON.stringify(s.route)!==JSON.stringify(route)||
      (s.percentages&&percentages&&JSON.stringify(stable(s.percentages))!==JSON.stringify(stable(percentages)))||
      (epoch.length&&Boolean(s.percentages)!==Boolean(epoch[0].percentages))) {mixedEpoch=true;break;}
    epoch.unshift(s);if(epoch.length===recentSlides)break;
  }
  const selected=new Set(epoch.map(s=>s.id));
  report.total_successful_slides=report.successful_slides;report.successful_slides=epoch.length;
  report.scope={requested_slides:recentSlides,post_slide_responses:postSlideResponses,selected_slide_ids:epoch.map(s=>s.id),
    route:route??null,percentages:epoch[0]?.percentages??null,settings_verified:epoch.length>0&&epoch.every(s=>s.percentages!==null),
    mixed_epoch_excluded:mixedEpoch,complete:report.omitted_entries===0&&report.unbound_slides===0,
    observation_pending:epoch.some(s=>step-s.step<postSlideResponses)};
  report.observed_post_slide_writes=0;report.observed_post_slide_recovery=0;
  const windowSlides=slides.slice(-readWindowSlides),windowStart=windowSlides[0]?.rank??-1;
  const recentRows=new Map();
  const fileRow=full=>{if(!recentRows.has(full))recentRows.set(full,{file:displayFile(full).replace(/[\x00-\x1f\x7f|]/g,' ').slice(0,300),reads:0,repeated_reads:0,post_slide_repeats:0,write_followup_repeats:0,recovery_path_candidates:0,unverified_outputs:0});return recentRows.get(full);};
  const pending=new Map(),reads=new Map(),writes=new Map(),commands=new Map();const p=platform==='win32'?path.win32:path.posix;let currentStep=0;
  const fileKey=file=>{let x=p.resolve(cwd,file);return platform==='win32'?x.toLowerCase():x;};
  const displayFile=full=>{const relative=p.relative(p.resolve(cwd),full);return relative.startsWith('..')||p.isAbsolute(relative)?'[專案外]/'+p.basename(full):relative;};
  for(let i=0;i<branch.length;i++) {
    const e=branch[i],m=e.message;if(e.type!=='message')continue;
    if(m?.role==='assistant') {
      currentStep++;
      if(['error','aborted'].includes(m.stopReason))continue;
      for(const c of m.content??[])if(c.type==='toolCall'&&typeof c.id==='string') {
        if(pending.has(c.id)){pending.set(c.id,null);report.ambiguous_tools++;}
        else pending.set(c.id,{name:name(c.name),args:c.arguments,rank:i,step:currentStep,owner:e.id,
          route:[m.provider??'unknown',m.api??'unknown',m.model??'unknown']});
      }
    }
    if(m?.role!=='toolResult')continue;
    const call=pending.get(m.toolCallId);pending.delete(m.toolCallId);if(!call||m.isError||name(m.toolName)!==call.name)continue;
    const args=call.args;if(!args||typeof args!=='object'||Array.isArray(args))continue;
    if(['write','edit'].includes(call.name)&&typeof args.path==='string')writes.set(fileKey(args.path),i);
    if(['bash','powershell','grep','find'].includes(call.name)){
      const key=hash(JSON.stringify([call.name,stable(args)]));if(commands.has(key))report.repeated_commands++;commands.set(key,i);
    }
    if(call.name!=='read'||typeof args.path!=='string'||!integer(args.offset??1)||(args.offset??1)<1||args.limit!==null&&args.limit!==undefined&&(!integer(args.limit)||args.limit<1))continue;
    report.reads++;const full=fileKey(args.path),recent=call.rank>windowStart,row=recent?fileRow(full):null;if(row)row.reads++;
    const text=visible(m);if(text===null||Buffer.byteLength(text)>1048576){if(row)row.unverified_outputs++;reads.delete(hash(JSON.stringify([full,args.offset??1,args.limit??null])));continue;}
    const key=hash(JSON.stringify([full,args.offset??1,args.limit??null])),digest=hash(text),previous=reads.get(key);
    if(previous&&previous.digest===digest) {
      report.repeated_reads++;
      const written=(writes.get(full)??-1)>previous.rank;
      const recovery=/(?:^|[\\/])(?:AGENTS(?:\.override)?\.md|MEMORY_COMMIT\.json|MEMORY_INDEX\.yaml|ACTIVE_TASK\.md|CURRENT_STATE\.md|00_START_HERE\.md)$/i.test(full);
      if(written)report.write_followup_repeats++;if(recovery)report.recovery_path_candidates++;
      if(row){row.repeated_reads++;if(written)row.write_followup_repeats++;if(recovery)row.recovery_path_candidates++;
        const excluded=report.unbound_slides===0&&windowSlides.some(s=>(historyBaselineComplete||s!==slides[0])&&JSON.stringify(call.route)===JSON.stringify(s.route)&&JSON.stringify(previous.route)===JSON.stringify(s.route)&&(otherEdits.get(previous.id)??Infinity)>=s.effectiveRank&&previous.rank<s.effectiveRank&&s.effectiveRank<=call.rank&&included(previous.rank,previous.id,s.before,ranks)&&!included(previous.rank,previous.id,s.after,ranks));
        if(excluded)row.post_slide_repeats++;
      }
      const matching=epoch.filter(s=>selected.has(s.id)&&JSON.stringify(call.route)===JSON.stringify(s.route)&&JSON.stringify(previous.route)===JSON.stringify(s.route)&&(otherEdits.get(previous.id)??Infinity)>=s.effectiveRank&&previous.rank<s.effectiveRank&&s.effectiveRank<=call.rank&&call.step-s.step<=postSlideResponses&&included(previous.rank,previous.id,s.before,ranks)&&!included(previous.rank,previous.id,s.after,ranks));
      const slide=matching.at(-1);
      if(slide){report.post_slide_repeats++;if(written)report.observed_post_slide_writes++;if(recovery)report.observed_post_slide_recovery++;if(report.evidence.length<10)report.evidence.push({original_read:previous.id,slide:slide.id,slide_response:slide.responseId,repeated_read:e.id,file:displayFile(full),offset:args.offset??1,limit:args.limit??null,observable_output_sha256:digest,original_excluded_by_committed_boundary:true,observed_intervening_write:written,recovery_path_candidate:recovery,classification:written?'WRITE_FOLLOWUP':recovery?'RECOVERY_CANDIDATE':'POSSIBLE_POST_SLIDE_REREAD',motive:'UNKNOWN'});}
    }
    reads.set(key,{rank:i,id:e.id,digest,route:call.route});
  }
  report.recent_reads={schema_version:2,window_kind:'SUCCESSFUL_CUTS',requested_slides:readWindowSlides,observed_slides:windowSlides.length,total_observed_slides:slides.length,selected_slide_ids:windowSlides.map(s=>s.id),start_entry_id:windowSlides[0]?.id??branch[0]?.id??null,start_exclusive:windowSlides.length>0,observed_responses:branch.filter((e,i)=>i>windowStart&&e.message?.role==='assistant').length,rows:[...recentRows.values()].sort((a,b)=>b.repeated_reads-a.repeated_reads||b.reads-a.reads||a.file.localeCompare(b.file)),coverage:'BOUNDED_OBSERVABLE_HISTORY',baseline_complete:report.omitted_entries===0,unverified_outputs:[...recentRows.values()].reduce((n,r)=>n+r.unverified_outputs,0),unsupported_tools:'不統計 bash 間接讀取或未留完整結果的 nested calls',motive:'UNKNOWN'};
  report.assessment=assessAnalysis(report);
  report.conclusion=report.post_slide_repeats?'發現可追查的滑動後重讀候選；不等於浪費，也不證明門檻過低。':report.successful_slides&&report.reads?'此範圍未找到符合條件的重讀候選；不代表沒有額外成本。':'資料不足，無法判斷滑動效率。';
  return report;
}
export function formatTechnicalAnalysis(report,percentages) {
  const lines=['ACM 唯讀效率分析',percentages?`目前比例：觸發 ${percentages.triggerPercent}％／保留 ${percentages.targetPercent}％（不是歷史比例）`:null,
    `分析 ${report.entries} 筆紀錄；模型回覆 ${report.model_responses} 次；成功邊界滑動 ${report.successful_slides} 次`,
    `讀取 ${report.reads} 次；相同參數／可觀察輸出重讀 ${report.repeated_reads} 次；滑動後候選 ${report.post_slide_repeats} 次`,
    `已觀察寫入後重讀 ${report.write_followup_repeats} 次；恢復路徑候選 ${report.recovery_path_candidates} 次；相同命令參數重複 ${report.repeated_commands} 次`,report.conclusion];
  if(report.omitted_entries)lines.push(`範圍受限：較早 ${report.omitted_entries} 筆未納入；不是全對話統計。`);
  for(const u of report.usage)lines.push(`模型 ${u.route.join('/')}：有效用量 ${u.usage_samples}/${u.responses} 筆；非快取輸入 ${u.input}、快取讀取 ${u.cache_read}、快取寫入 ${u.cache_write}、輸出 ${u.output} Token；紀錄估算費用 ${u.cost_samples?u.estimated_cost.toFixed(6):'未知'}（零值可能是占位值，不等於訂閱額度）。`);
  for(const e of report.evidence.slice(0,5))lines.push(`證據：${e.original_read} → ${e.slide} → ${e.repeated_read}；${e.file}；可觀察輸出相同；${e.observed_intervening_write?'有寫入紀錄':e.recovery_path_candidate?'可能為恢復讀取':'原因未知'}。`);
  lines.push('未觀察到寫入不代表檔案未變更；不分析內容語意，不自動調整設定。','未知項目：'+report.unknown.join('、'),'原始技術欄位：/acm-analysis json。');return lines.filter(Boolean).join('\n');
}
