import test from'node:test';import assert from'node:assert/strict';import{analyzeBranch,formatAnalysis}from'../src/analysis_v1.5.0.mjs';
const asst=(id,calls=[])=>({id,type:'message',message:{role:'assistant',provider:'fixture',api:'fixture',model:'fixture',stopReason:calls.length?'toolUse':'stop',content:calls,usage:{input:10,cacheRead:20,cacheWrite:3,output:2,cost:{total:0}}}});
const call=(id,path='src/a.ts',extra={})=>({type:'toolCall',name:'read',id,arguments:{path,offset:1,limit:10,...extra}});
const result=(id,toolCallId,text='PRIVATE FILE CONTENT',extra={})=>({id,type:'message',message:{role:'toolResult',toolName:'read',toolCallId,content:[{type:'text',text}],...extra}});
const slide=(id,cursorId,carriedIds=[])=>({id,type:'custom',customType:'acm-passive',data:{cursorId,carriedIds,anchorIds:[]}});
const initial=()=>[asst('a1',[call('c1')]),result('r1','c1'),asst('a2')];
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};

test('readonly same-response reread binds to calibration even though slide metadata is committed after its tool result',()=>{
 const branch=freeze([...initial(),asst('a3',[call('c2')]),result('r2','c2'),{id:'cal',type:'custom',customType:'acm-passive-calibration',data:{responseEntryId:'a3'}},slide('s1','a2')]);
 const r=analyzeBranch(branch,{cwd:'/workspace'});assert.equal(r.successful_slides,1);assert.equal(r.post_slide_repeats,1);assert.equal(r.evidence[0].slide_response,'a3');assert.equal(r.evidence[0].motive,'UNKNOWN');assert(!JSON.stringify(r).includes('PRIVATE FILE CONTENT'));assert.equal(r.usage[0].prompt_tokens,99);assert.equal(r.usage[0].cache_read,60);assert.match(formatAnalysis(r,{triggerPercent:70,targetPercent:55}),/唯讀.*分析|訂閱額度/s);
});
test('post-commit reread evidence is bounded and retains relative paths, not raw output',()=>{
 const r=analyzeBranch([...initial(),slide('s1','a2'),asst('a3',[call('c2')]),result('r2','c2')],{cwd:'/workspace',platform:'linux'});assert.equal(r.post_slide_repeats,1);assert.equal(r.evidence[0].file,'src/a.ts');assert.equal(r.evidence[0].original_read,'r1');assert.match(r.conclusion,/不等於浪費/);
});
test('carried/anchored results are not falsely classified as excluded; no sliding or changed output/range is not slide-induced',()=>{
 for(const carry of[['r1'],[]]){const b=[...initial(),slide('s1',carry.length?'a2':null,carry),asst('a3',[call('c2')]),result('r2','c2')];assert.equal(analyzeBranch(b).post_slide_repeats,0);}
 for(const b of[[...initial(),asst('a3',[call('c2')]),result('r2','c2')],[...initial(),slide('s1','a2'),asst('a3',[call('c2','src/a.ts',{offset:2})]),result('r2','c2')],[...initial(),slide('s1','a2'),asst('a3',[call('c2')]),result('r2','c2','CHANGED')]])assert.equal(analyzeBranch(b).post_slide_repeats,0);
});
test('parallel out-of-order tool results pair by id; duplicate or orphan ids do not invent readings',()=>{
 const b=[asst('a1',[call('c1'),call('c2','src/b.ts')]),result('r2','c2'),result('r1','c1')];assert.equal(analyzeBranch(b).reads,2);
 const malformed=[asst('a1',[call('c1'),call('c1')]),result('r1','c1'),result('orphan','missing')];const r=analyzeBranch(malformed);assert.equal(r.reads,0);assert.equal(r.ambiguous_tools,1);
});
test('write-followup and recovery paths remain candidates, never semantic claims',()=>{
 const b=[...initial(),asst('write',[{type:'toolCall',name:'edit',id:'wc',arguments:{path:'src/a.ts'}}]),{...result('wr','wc'),message:{role:'toolResult',toolName:'edit',toolCallId:'wc',content:[{type:'text',text:'ok'}]}},slide('s1','a2'),asst('a3',[call('c2')]),result('r2','c2')];const r=analyzeBranch(b,{cwd:'/workspace'});assert.equal(r.write_followup_repeats,1);assert.equal(r.evidence[0].classification,'WRITE_FOLLOWUP');
 const recovery=[asst('a1',[call('c1','AGENTS.md')]),result('r1','c1'),asst('a2'),slide('s1','a2'),asst('a3',[call('c2','AGENTS.md')]),result('r2','c2')];assert.equal(analyzeBranch(recovery).evidence[0].classification,'RECOVERY_CANDIDATE');
});
test('failed tools, failed attempts, absent usage, missing boundary, outside paths and limited history are explicit',()=>{
 const b=[...initial(),slide('s1','missing'),asst('a3',[call('c2')]),result('r2','c2','PRIVATE FILE CONTENT',{isError:true})];const r=analyzeBranch(b,{maxEntries:3});assert.equal(r.omitted_entries,3);assert.equal(r.unbound_slides,1);assert.equal(r.post_slide_repeats,0);
 const msg=asst('a');delete msg.message.usage;assert.equal(analyzeBranch([msg]).usage[0].usage_samples,0);
 assert.match(formatAnalysis(analyzeBranch([])),/資料不足/);assert.throws(()=>analyzeBranch([], {maxEntries:0}));
});
test('windows paths are compared case-insensitively and report hides private absolute parent',()=>{
 const b=[asst('a1',[call('c1','C:\\external\\a.ts')]),result('r1','c1'),asst('a2'),slide('s1','a2'),asst('a3',[call('c2','c:\\EXTERNAL\\a.ts')]),result('r2','c2')];const r=analyzeBranch(b,{cwd:'C:\\work',platform:'win32'});assert.equal(r.post_slide_repeats,1);assert.equal(r.evidence[0].file,'[專案外]/a.ts');
});
test('其他上下文編輯或舊刪除標記不能誤歸因滑動，工具名稱須符合呼叫',()=>{
 for(const edit of[{id:'edit',type:'context_edit',targetId:'r1',replacement:null},{id:'edit',type:'custom',customType:'acm',data:{pruned:{r1:true}}}]){
  const b=[...initial(),edit,slide('s1','a2'),asst('a3',[call('c2')]),result('r2','c2')];assert.equal(analyzeBranch(b).post_slide_repeats,0);
 }
 const mismatch=result('r','c');mismatch.message.toolName='unknown';assert.equal(analyzeBranch([asst('a',[call('c')]),mismatch]).reads,0);
});
