import test from 'node:test';import assert from 'node:assert/strict';
import {ActivityState,row,STALE_MS,duration} from '../src/state_v0.1.0.mjs';
const fixture=()=>{let time=0;const state=new ActivityState(()=>time);return{state,tick:ms=>time+=ms};};
test('only real observed events move last activity; rendering/ticks do not fabricate heartbeats',()=>{
 const f=fixture();assert.equal(f.state.snapshot().last_activity_ago_ms,null);assert.match(row(f.state.snapshot()),/載入後尚無活動/);
 f.state.event('agent_start');f.tick(12000);let s=f.state.snapshot({idle:false});assert.equal(s.last_activity_ago_ms,12000);assert.equal(s.action_elapsed_ms,12000);
 f.state.event('message_update',{assistantMessageEvent:{type:'text_delta',delta:''}});assert.equal(f.state.snapshot({idle:false}).last_activity_ago_ms,12000);
 f.state.event('message_update',{assistantMessageEvent:{type:'thinking_delta',delta:'SECRET_NOT_STORED'}});assert.equal(f.state.snapshot({idle:false}).last_activity_ago_ms,0);assert(!JSON.stringify(f.state).includes('SECRET'));
});
test('concurrent/nested tools keep oldest active action duration, progress from any tool is visible, no private args/results',()=>{
 const f=fixture();f.state.event('tool_execution_start',{toolCallId:'parent',toolName:'bash',args:{command:'PRIVATE_COMMAND'}});f.tick(3000);f.state.event('tool_execution_start',{toolCallId:'child',toolName:'private.custom',parentToolCallId:'parent'});f.tick(5000);
 let s=f.state.snapshot({idle:false});assert.equal(s.tool_count,2);assert.equal(s.action_elapsed_ms,8000);f.state.event('tool_execution_end',{toolCallId:'parent',result:'SECRET'});s=f.state.snapshot({idle:false});assert.equal(s.tool_count,1);assert.equal(s.action_elapsed_ms,5000);assert(!JSON.stringify(f.state).includes('PRIVATE'));assert(!row(s).includes('private.custom'));
 f.state.event('agent_settled');assert.equal(f.state.snapshot().mode,'idle');assert.equal(f.state.tools.size,0);
});
test('five-minute inactivity is only a warning; idle and explicit Goal/UI wait and unknown Goal never get stuck verdicts',()=>{
 const f=fixture();f.state.event('agent_start');f.tick(STALE_MS);assert.equal(f.state.snapshot({idle:false}).warning,true);assert.match(row(f.state.snapshot({idle:false})),/不代表當機/);
 assert.equal(f.state.snapshot().warning,false);assert.equal(f.state.snapshot({idle:false,goal:{mode:'active',waiting:true}}).warning,false);
 assert.equal(f.state.snapshot({idle:false,goal:{mode:'unknown'}}).warning,false);f.state.event('ui_prompt_start');f.tick(STALE_MS);assert.equal(f.state.snapshot({idle:false}).mode,'waiting');assert.equal(f.state.snapshot({idle:false}).warning,false);f.state.event('ui_prompt_end');
});
test('errors stay recovering until next meaningful output/settlement; compaction/queue are observation, not workflow control',()=>{
 const f=fixture();f.state.event('message_end',{message:{role:'assistant',stopReason:'error'}});assert.equal(f.state.snapshot({idle:false}).mode,'recovery');f.state.event('agent_start');assert.equal(f.state.snapshot({idle:false}).mode,'recovery');f.state.event('message_update',{assistantMessageEvent:{type:'text_delta',delta:'ok'}});assert.equal(f.state.snapshot({idle:false}).mode,'model');
 f.state.event('session_before_compact');assert.equal(f.state.snapshot({idle:false}).mode,'compacting');f.state.event('session_compact_failed');assert.equal(f.state.snapshot({idle:true,pending:true}).mode,'settling');
});
test('reset/reload starts new observation, bounded tool tracking and backward clocks do not invent history or negative durations',()=>{
 const f=fixture();for(let i=0;i<514;i++)f.state.event('tool_execution_start',{toolCallId:String(i),toolName:'bash'});assert.equal(f.state.tools.size,512);assert.equal(f.state.snapshot({idle:false}).tracking_incomplete,true);f.state.reset();assert.equal(f.state.snapshot().last_activity_ago_ms,null);assert.equal(f.state.tools.size,0);
 assert.equal(duration(-5),'0 秒');assert.equal(duration(62000),'1 分 2 秒');assert.equal(duration(3661000),'1 小時 1 分');
});
