import test from 'node:test';import assert from 'node:assert/strict';
import {analyzeBranch,formatAnalysis} from '../modules/acm/src/analysis_v1.8.2.mjs';
import {analyzeBranch as legacy} from '../modules/acm/src/analysis_v1.8.1.mjs';
const p={triggerPercent:95,targetPercent:90},route=['fixture','fixture','m'];
const a=(id,content=[])=>({id,type:'message',message:{role:'assistant',provider:route[0],api:route[1],model:route[2],stopReason:'stop',content}});
const read=(id,error=false)=>[a('a'+id,[{type:'toolCall',name:'read',id,arguments:{path:'src/main.ts',offset:1,limit:10}}]),{id:'r'+id,type:'message',message:{role:'toolResult',toolName:'read',toolCallId:id,isError:error,content:[{type:'text',text:'PRIVATE_FILE_BODY'}]}}];
const cut=(id,cursor)=>({id,type:'custom',customType:'acm-passive',data:{cursorId:cursor,carriedIds:[],anchorIds:[],analysisPolicy:{version:1,route,percentages:p}}});
test('last40 committed cuts, not model responses/tokens; earlier reads only baseline, report readonly/body private',()=>{
 const b=[...read('baseline')];for(let i=0;i<42;i++){b.push(a('c'+i),cut('s'+i,'c'+i),...read('read'+i));}for(let i=0;i<20;i++)b.push(a('text'+i));const before=JSON.stringify(b),r=analyzeBranch(b,{cwd:'/project',currentRoute:route,currentPercentages:p});const x=r.recent_reads;assert.equal(x.observed_slides,40);assert.equal(x.requested_slides,40);assert.equal(x.selected_slide_ids[0],'s2');assert.equal(x.rows[0].reads,40);assert.equal(x.rows[0].repeated_reads,40);assert(x.observed_responses>10);assert.equal(JSON.stringify(b),before);assert(!JSON.stringify(r).includes('PRIVATE_FILE_BODY'));assert.match(formatAnalysis(r,p),/40／40 次成功縮減/);
 const old=legacy(b,{cwd:'/project',currentRoute:route,currentPercentages:p});for(const k of ['assessment','scope','successful_slides','post_slide_repeats'])assert.deepEqual(r[k],old[k]);
});
test('no cuts counts observable branch, fewer cuts shows actual; no-op metadata/cancelled events not counted',()=>{
 const b=[...read('old'),a('cursor'),cut('s','cursor'),cut('noop','cursor'),{id:'failed',type:'custom',customType:'acm-passive-failed',data:{cursorId:'cursor'}},...read('new')];const r=analyzeBranch(b);assert.equal(r.recent_reads.observed_slides,1);assert.equal(r.recent_reads.rows[0].reads,1);assert.equal(r.recent_reads.rows[0].repeated_reads,1);assert.equal(analyzeBranch(read('none')).recent_reads.observed_slides,0);assert.equal(analyzeBranch(read('none')).recent_reads.rows[0].reads,1);
});
test('only reads owned AFTER commit count, never a partial tool batch straddling cut',()=>{
 const batch=read('batch'),b=[batch[0],cut('s','abatch'),batch[1],...read('later')];const r=analyzeBranch(b);assert.equal(r.recent_reads.rows[0].reads,1);assert.equal(r.recent_reads.rows[0].repeated_reads,1);
});
test('native committed compactions count, duplicate event ID not duplicated; missing reference marks evidence incomplete',()=>{
 const c={id:'native',type:'compaction',firstKeptEntryId:'keep',summary:'PRIVATE_SUMMARY'};const b=[a('keep'),c,...read('new')];let r=analyzeBranch(b);assert.equal(r.recent_reads.observed_slides,1);assert(!JSON.stringify(r).includes('PRIVATE_SUMMARY'));r=analyzeBranch([...b,{...c}]);assert.equal(r.recent_reads.observed_slides,1);r=analyzeBranch([a('keep'),{...c,firstKeptEntryId:'missing'},...read('new')]);assert.equal(r.recent_reads.window_complete,false);
});
test('forty window crosses routes/policies while ratio assessment stays separate; filtered0 never claims whole-history0',()=>{
 const b=[a('c'),cut('s','c'),...read('one')];const r=analyzeBranch(b,{currentRoute:['other','other','other'],currentPercentages:p});assert.equal(r.recent_reads.observed_slides,1);assert.equal(r.successful_slides,0);const text=formatAnalysis(r,p);assert.match(text,/篩選為 0/);assert.match(text,/不代表整個對話沒有縮減/);assert.match(text,/判讀模型：other/);
});
test('bounded truncated baseline/missing history are lower bounds and not silently full windows',()=>{
 const b=[...read('old'),...Array.from({length:15},(_,i)=>a('x'+i)),...read('new')];const r=analyzeBranch(b,{maxEntries:4,metadataLimit:4,bodyLimit:4});assert.equal(r.recent_reads.window_complete,false);assert.equal(r.recent_reads.baseline_complete,false);assert.match(formatAnalysis(r,p),/證據不完整/);assert.throws(()=>analyzeBranch(b,{readWindowSlides:0}));
});
test('failed read/bash never in table; different model repeated reads not post-slide causal evidence',()=>{
 const b=[a('c'),cut('s','c'),...read('failed',true),a('cmd',[{type:'toolCall',name:'bash',id:'bash',arguments:{command:'rg text src'}}]),{id:'cmdresult',type:'message',message:{role:'toolResult',toolName:'bash',toolCallId:'bash',content:[{type:'text',text:'src/main.ts'}]}},...read('new')];assert.equal(analyzeBranch(b).recent_reads.rows[0].reads,1);
});
