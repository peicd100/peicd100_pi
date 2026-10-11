import test from 'node:test';
import assert from 'node:assert/strict';
import {readGoalPolicy,sameGoalTransition,terminalTransitions} from '../src/goal-policy_v1.2.0.mjs';
import {QuietGate} from '../src/quiet-gate_v1.2.0.mjs';
import {validateConfig,makePayload,DEFAULT_GOAL_NOTIFY} from '../src/core_v1.2.0.mjs';
const row=(id,status='active',extra={})=>({id,type:'custom',customType:'goal-state',data:{goal:{id:'g',status,startedAt:1,updatedAt:2,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0,...extra}}});
test('Goal adapter follows selected branch and explicit status, waiting is still active, no objective is returned',()=>{
 assert.equal(readGoalPolicy([]).mode,'none');assert.equal(readGoalPolicy([row('a','active',{waiting:{resumeAt:999999999},text:'SECRET OBJECTIVE'})]).mode,'active');
 const p=readGoalPolicy([row('a'),row('b','blocked'),row('c','blocked')]);assert.equal(p.transitionId,'b');assert(!JSON.stringify(p).includes('SECRET'));
 const later=readGoalPolicy([row('a'),row('b','blocked'),row('resume'),row('d','blocked')]);assert.equal(later.transitionId,'d');assert(!sameGoalTransition(p,later));
 assert.equal(readGoalPolicy([row('done','complete')]).status,'complete');assert(terminalTransitions([row('done','complete')]).has('done'));
 assert.equal(readGoalPolicy([row('done','complete'),{id:'cleared-after-complete',type:'custom',customType:'goal-state',data:{goal:null}}]).transitionId,'done','Actual Goal completion immediately clears active state');
 assert.equal(readGoalPolicy([row('paused','paused')]).mode,'paused');assert.equal(readGoalPolicy([{id:'clear',type:'custom',customType:'goal-state',data:{goal:null}}]).mode,'none');
});
test('malformed/unsupported Goal entries block instead of restoring older active state or guessing no goal',()=>{
 for(const data of [{goal:{id:'g',status:'new-status'}},{goal:null,queue:[]},{},{goal:{...row('a').data.goal,updatedAt:NaN}}])assert.equal(readGoalPolicy([row('a'),{type:'custom',customType:'goal-state',data}]).mode,'unknown');
 assert.equal(readGoalPolicy([{type:'custom',customType:'goals-state',data:{}}]).mode,'unknown');
});
test('QuietGate is nonblocking debounce, cancels pending and invalidates running work',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const q=new QuietGate();let calls=0,epoch;
 q.schedule(e=>{epoch=e;calls++;});assert.equal(calls,0);t.mock.timers.tick(2999);await Promise.resolve();assert.equal(calls,0);
 t.mock.timers.tick(1);await Promise.resolve();await Promise.resolve();assert.equal(calls,1);q.cancel();assert.equal(q.current(epoch),false);
 q.schedule(()=>calls++);q.cancel();t.mock.timers.tick(3000);await Promise.resolve();assert.equal(calls,1);
});
test('Goal prefs preserve original config bytes semantics and terminal payload is metadata-only, correctly labelled',()=>{
 const config={version:1,enabled:true,url:'https://notify.example.invalid/test',key:'',format:'generic',notifyOn:['completed']};
 assert.deepEqual(validateConfig(config),config);assert.deepEqual(validateConfig({...config,goalNotifyOn:[]}).goalNotifyOn,[]);
 assert.throws(()=>validateConfig({...config,goalNotifyOn:['active']}));
 for(const goalStatus of DEFAULT_GOAL_NOTIFY){const p=makePayload({id:'id',sessionId:'session',cwd:'project',goalId:'g',goalStatus,outcome:goalStatus==='complete'?'completed':goalStatus});assert.equal(p.event,'pi.goal.stopped');assert.equal(p.goal_status,goalStatus);assert.match(p.text,goalStatus==='complete'?/目標已完成/:/需要處理/);}
});
