import test from 'node:test';import assert from 'node:assert/strict';import {analyzeBranch,formatAnalysis} from '../src/analysis_v1.8.0.mjs';
const route={provider:'fixture',api:'fixture',model:'m'},p={triggerPercent:95,targetPercent:90};
const a=(id,content=[])=>({id,type:'message',message:{role:'assistant',...route,stopReason:content.length?'toolUse':'stop',content}});
const read=(id,path='src/main.ts',offset=1,limit=100,text='DO_NOT_LEAK',error=false)=>[a('a'+id,[{type:'toolCall',name:'functions.read',id,arguments:{path,offset,limit}}]),{id:'r'+id,type:'message',message:{role:'toolResult',toolCallId:id,toolName:'read',isError:error,content:[{type:'text',text}]}}];
test('four reads / two unchanged repeats / one excluded-result post-cut reread; nested counts, not sums; no bodies or mutation',()=>{
 const b=[...read('1'),...read('2'),...read('3','src/main.ts',101),{id:'s',type:'custom',customType:'acm-passive',data:{cursorId:'a4',carriedIds:[],anchorIds:[],analysisPolicy:{version:1,route:['fixture','fixture','m'],percentages:p}}},...read('4')],before=JSON.stringify(b),r=analyzeBranch(b,{cwd:'/project'});
 assert.deepEqual(r.recent_reads.rows[0],{file:'src/main.ts',reads:4,repeated_reads:2,post_slide_repeats:1,write_followup_repeats:0,recovery_path_candidates:0,unverified_outputs:0});assert.equal(JSON.stringify(b),before);assert(!JSON.stringify(r).includes('DO_NOT_LEAK'));assert.match(formatAnalysis(r,p),/不能相加/);
});
test('only last ten owning assistant responses count; older baseline still makes first recent read a repeat',()=>{
 const b=[...read('old')];for(let i=0;i<10;i++)b.push(a('filler'+i));b.push(...read('recent'));
 const r=analyzeBranch(b,{cwd:'/project'}).recent_reads;assert.equal(r.observed_responses,10);assert.equal(r.rows[0].reads,1);assert.equal(r.rows[0].repeated_reads,1);assert.equal(r.rows[0].post_slide_repeats,0);
});
test('same file different ranges/content and failed reads do not count as matching rereads; edits/recovery separate',()=>{
 const b=[...read('1','ACTIVE_TASK.md'),a('edit',[{type:'toolCall',name:'edit',id:'edit',arguments:{path:'ACTIVE_TASK.md'}}]),{id:'edited',type:'message',message:{role:'toolResult',toolName:'edit',toolCallId:'edit',content:[{type:'text',text:'ok'}]}},...read('2','ACTIVE_TASK.md'),...read('3','ACTIVE_TASK.md',101),...read('4','ACTIVE_TASK.md',1,100,'NEW'),...read('fail','ACTIVE_TASK.md',1,100,'NEW',true)];
 const r=analyzeBranch(b).recent_reads.rows[0];assert.equal(r.reads,4);assert.equal(r.repeated_reads,1);assert.equal(r.write_followup_repeats,1);assert.equal(r.recovery_path_candidates,1);assert.equal(r.post_slide_repeats,0);
});
test('retained carries are not post-cut rereads; cross-route repeats never become cut claims',()=>{
 const b=[...read('1'),{id:'s',type:'custom',customType:'acm-passive',data:{cursorId:'a2',carriedIds:['r1'],anchorIds:[]}},...read('2')];assert.equal(analyzeBranch(b).recent_reads.rows[0].post_slide_repeats,0);
 b[2].data.carriedIds=[];b[3].message.model='other';assert.equal(analyzeBranch(b).recent_reads.rows[0].post_slide_repeats,0);
});
test('bounded missing baseline is marked incomplete, outside paths masked, unknown output invalidates comparison',()=>{
 const b=[...read('1','/outside/secret.ts'),...Array.from({length:8},(_,i)=>a('x'+i)),...read('2','/outside/secret.ts')],r=analyzeBranch(b,{maxEntries:4,metadataLimit:4,bodyLimit:4,cwd:'/project'});assert.equal(r.recent_reads.baseline_complete,false);assert.equal(r.recent_reads.window_complete,false);assert.equal(r.recent_reads.rows[0].file,'[專案外]/secret.ts');assert(!JSON.stringify(r).includes('/outside/'));assert.match(formatAnalysis(r,p),/0 不代表/);
 const c=[...read('1'),...read('2'),...read('3')];c[3].message.content=[{type:'image',data:'not-visible'}];const row=analyzeBranch(c).recent_reads.rows[0];assert.equal(row.reads,3);assert.equal(row.repeated_reads,0);assert.equal(row.unverified_outputs,1);
});
