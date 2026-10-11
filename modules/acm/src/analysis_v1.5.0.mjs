import {createHash} from 'node:crypto';
import path from 'node:path';
const hash=s=>createHash('sha256').update(s).digest('hex');
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])])):value;
const name=s=>String(s??'').split('.').at(-1);
const visible=message=>Array.isArray(message?.content)&&message.content.length&&message.content.every(b=>b.type==='text'&&typeof b.text==='string')?message.content.map(b=>b.text).join('\n'):null;
const validState=s=>s&&typeof s==='object'&&(s.cursorId===null||typeof s.cursorId==='string')&&['carriedIds','anchorIds'].every(k=>s[k]===undefined||Array.isArray(s[k])&&s[k].every(x=>typeof x==='string'));
const included=(rank,id,state,ranks)=>!state.cursorId||rank>=ranks.get(state.cursorId)||[...(state.carriedIds??[]),...(state.anchorIds??[]),state.taskAnchorId].includes(id);

// All classification uses observable branch facts; no files, LLM, writes or semantic motives.
export function analyzeBranch(input,{cwd='.',platform=process.platform,maxEntries=10000,postSlideResponses=5}={}) {
  if(!Array.isArray(input)||!integer(maxEntries)||maxEntries<1||maxEntries>100000)throw new Error('分析範圍無效。');
  const branch=input.slice(-maxEntries),ranks=new Map(branch.map((e,i)=>[e.id,i])),otherEdits=new Map();
  for(let i=0;i<branch.length;i++){
    const e=branch[i];
    if(e.type==='context_edit'&&typeof e.targetId==='string'&&!otherEdits.has(e.targetId))otherEdits.set(e.targetId,i);
    if(e.type==='custom'&&e.customType==='acm')for(const[id,value]of Object.entries(e.data?.pruned??{}))if(value&&!otherEdits.has(id))otherEdits.set(id,i);
  }
  const report={schema_version:1,entries:branch.length,omitted_entries:input.length-branch.length,model_responses:0,successful_slides:0,reads:0,repeated_reads:0,post_slide_repeats:0,write_followup_repeats:0,recovery_path_candidates:0,repeated_commands:0,ambiguous_tools:0,unbound_slides:0,usage:[],evidence:[],unknown:['重讀動機與正常任務恢復','工具預覽是否造成重讀','未留下紀錄的預算中止','歷史比例與訂閱實際額度']};
  const usage=new Map(),steps=new Map();let step=0,state={cursorId:null,carriedIds:[],anchorIds:[]};const slides=[];
  for(let i=0;i<branch.length;i++) {
    const e=branch[i],m=e.message;
    if(e.type==='message'&&m?.role==='assistant') {
      step++;report.model_responses++;steps.set(e.id,step);
      const route=JSON.stringify([m.provider??'unknown',m.api??'unknown',m.model??'unknown']);
      const row=usage.get(route)??{route:JSON.parse(route),responses:0,usage_samples:0,input:0,cache_read:0,cache_write:0,output:0,estimated_cost:0,cost_samples:0,zero_cost_samples:0};row.responses++;
      if(m.usage&&['input','cacheRead','cacheWrite','output'].every(k=>integer(m.usage[k]))) {row.usage_samples++;row.input+=m.usage.input;row.cache_read+=m.usage.cacheRead;row.cache_write+=m.usage.cacheWrite;row.output+=m.usage.output;}
      const cost=m.usage?.cost?.total;if(typeof cost==='number'&&Number.isFinite(cost)&&cost>=0){row.cost_samples++;row.estimated_cost+=cost;if(cost===0)row.zero_cost_samples++;}usage.set(route,row);
    }
    let next;
    if(e.type==='custom'&&e.customType==='acm-passive')next={...state,...e.data};
    else if(e.type==='compaction'&&e.details?.acmPassive?.version===1)next={...state,cursorId:e.firstKeptEntryId,carriedIds:e.details.acmPassive.carriedIds??[],taskAnchorId:e.details.acmPassive.taskAnchorId};
    if(!next)continue;
    if(!validState(next)||next.cursorId&&!ranks.has(next.cursorId)){report.unbound_slides++;continue;}
    const oldRank=state.cursorId?ranks.get(state.cursorId):-1,newRank=next.cursorId?ranks.get(next.cursorId):-1;
    const removedCarry=(state.carriedIds??[]).some(id=>!included(ranks.get(id),id,next,ranks));
    if(newRank>oldRank||removedCarry) {
      // turn_end persists AFTER the response/tool batch. Bind the cut to its
      // calibration response, otherwise immediate same-response rereads get missed.
      const calibration=branch[i-1];let effectiveRank=i,responseId=null;
      if(calibration?.type==='custom'&&calibration.customType==='acm-passive-calibration') {
        const id=calibration.data?.responseEntryId,owner=branch[ranks.get(id)];
        if(owner?.message?.role==='assistant'&&!['error','aborted'].includes(owner.message.stopReason)){effectiveRank=ranks.get(id);responseId=id;}
      }
      slides.push({id:e.id,rank:i,effectiveRank,responseId,step:responseId?steps.get(responseId):step,before:state,after:next});report.successful_slides++;
    }
    state=next;
  }
  report.usage=[...usage.values()].map(r=>({...r,prompt_tokens:r.input+r.cache_read+r.cache_write,cache_read_fraction:r.input+r.cache_read+r.cache_write?r.cache_read/(r.input+r.cache_read+r.cache_write):null}));
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
        else pending.set(c.id,{name:name(c.name),args:c.arguments,rank:i,step:currentStep,owner:e.id});
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
    report.reads++;const text=visible(m);if(text===null||Buffer.byteLength(text)>1048576)continue;
    const full=fileKey(args.path),key=hash(JSON.stringify([full,args.offset??1,args.limit??null])),digest=hash(text),previous=reads.get(key);
    if(previous&&previous.digest===digest) {
      report.repeated_reads++;
      const written=(writes.get(full)??-1)>previous.rank;
      const recovery=/(?:^|[\\/])(?:AGENTS(?:\.override)?\.md|MEMORY_COMMIT\.json|MEMORY_INDEX\.yaml|ACTIVE_TASK\.md|CURRENT_STATE\.md|00_START_HERE\.md)$/i.test(full);
      if(written)report.write_followup_repeats++;if(recovery)report.recovery_path_candidates++;
      const matching=slides.filter(s=>(otherEdits.get(previous.id)??Infinity)>=s.effectiveRank&&previous.rank<s.effectiveRank&&s.effectiveRank<=call.rank&&call.step-s.step<=postSlideResponses&&included(previous.rank,previous.id,s.before,ranks)&&!included(previous.rank,previous.id,s.after,ranks));
      const slide=matching.at(-1);
      if(slide){report.post_slide_repeats++;if(report.evidence.length<10)report.evidence.push({original_read:previous.id,slide:slide.id,slide_response:slide.responseId,repeated_read:e.id,file:displayFile(full),offset:args.offset??1,limit:args.limit??null,observable_output_sha256:digest,original_excluded_by_committed_boundary:true,observed_intervening_write:written,recovery_path_candidate:recovery,classification:written?'WRITE_FOLLOWUP':recovery?'RECOVERY_CANDIDATE':'POSSIBLE_POST_SLIDE_REREAD',motive:'UNKNOWN'});}
    }
    reads.set(key,{rank:i,id:e.id,digest});
  }
  report.conclusion=report.post_slide_repeats?'發現可追查的滑動後重讀候選；不等於浪費，也不證明門檻過低。':report.successful_slides&&report.reads?'此範圍未找到符合條件的重讀候選；不代表沒有額外成本。':'資料不足，無法判斷滑動效率。';
  return report;
}
export function formatAnalysis(report,percentages) {
  const lines=['ACM 唯讀效率分析',percentages?`目前比例：觸發 ${percentages.triggerPercent}％／保留 ${percentages.targetPercent}％（不是歷史比例）`:null,
    `分析 ${report.entries} 筆紀錄；模型回覆 ${report.model_responses} 次；成功邊界滑動 ${report.successful_slides} 次`,
    `讀取 ${report.reads} 次；相同參數／可觀察輸出重讀 ${report.repeated_reads} 次；滑動後候選 ${report.post_slide_repeats} 次`,
    `已觀察寫入後重讀 ${report.write_followup_repeats} 次；恢復路徑候選 ${report.recovery_path_candidates} 次；相同命令參數重複 ${report.repeated_commands} 次`,report.conclusion];
  if(report.omitted_entries)lines.push(`範圍受限：較早 ${report.omitted_entries} 筆未納入；不是全對話統計。`);
  for(const u of report.usage)lines.push(`模型 ${u.route.join('/')}：有效用量 ${u.usage_samples}/${u.responses} 筆；非快取輸入 ${u.input}、快取讀取 ${u.cache_read}、快取寫入 ${u.cache_write}、輸出 ${u.output} Token；紀錄估算費用 ${u.cost_samples?u.estimated_cost.toFixed(6):'未知'}（零值可能是占位值，不等於訂閱額度）。`);
  for(const e of report.evidence.slice(0,5))lines.push(`證據：${e.original_read} → ${e.slide} → ${e.repeated_read}；${e.file}；可觀察輸出相同；${e.observed_intervening_write?'有寫入紀錄':e.recovery_path_candidate?'可能為恢復讀取':'原因未知'}。`);
  lines.push('未觀察到寫入不代表檔案未變更；不分析內容語意，不自動調整設定。','未知項目：'+report.unknown.join('、'),'原始技術欄位：/acm-analysis json。');return lines.filter(Boolean).join('\n');
}
