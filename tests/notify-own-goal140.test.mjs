import test from 'node:test';
import assert from 'node:assert/strict';
import {GOAL_ENTRY,initialGoal,changeGoal,restoredGoal} from '../modules/goal/src/state_v0.1.0.mjs';
import {readGoalPolicy,terminalTransitions,sameGoalTransition,goalOutcome} from '../modules/webhook/src/goal-policy_v2.1.0.mjs';
import {makePayload} from '../modules/webhook/src/core_v2.0.1.mjs';
const create=()=>changeGoal(initialGoal('session-A'),{action:'create',objective:'PRIVATE GOAL TEXT never sent',criteria:['PRIVATE CRITERION']},{authorized:true,id:'goal-A',now:100});
const ref=s=>({id:s.goal.id,revision:s.goal.revision});
const row=(id,state)=>({type:'custom',customType:GOAL_ENTRY,id,data:state});
const legacy={type:'custom',customType:'goal-state',id:'legacy-complete',data:{goal:{id:'old-goal',status:'complete',startedAt:0,updatedAt:0,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0}}};
test('new Goal owner supersedes all third-party Goal state, including explicit none/delete',()=>{
 assert.equal(readGoalPolicy([legacy]).status,'complete');const s=create();assert.equal(readGoalPolicy([legacy,row('own',s)]).mode,'active');
 assert.equal(readGoalPolicy([legacy,row('own-none',initialGoal('session-A'))]).mode,'none');
 const deleted=changeGoal(s,{action:'delete',...ref(s)},{authorized:true});assert.equal(readGoalPolicy([legacy,row('own',s),row('deleted',deleted)]).mode,'none');
});
test('automatic waits/retries stay active and quiet; no invented retry_exhausted/budget_limited',()=>{
 const s=create();const wait=changeGoal(s,{action:'wait',...ref(s),kind:'external',reason:'依賴尚未就緒'});assert.deepEqual(readGoalPolicy([row('wait',wait)]),{mode:'active',goalId:'goal-A',waiting:true,entryId:'wait'});
 let retry=s;for(let i=0;i<1200;i++){retry=changeGoal(retry,{action:'retry',...ref(retry)},{now:100});assert.equal(readGoalPolicy([row('retry',retry)]).mode,'active');retry=changeGoal(retry,{action:'retry_dispatched',...ref(retry)});}
});
test('complete/explicit pause/block/quota map to existing fixed events, never fake completion',()=>{
 const s=create();for(const [reason,status] of [['user','paused'],['blocked','blocked'],['quota_exhausted','usage_limited'],['authentication','paused'],['permission','paused'],['invalid_request','paused'],['unknown','paused']]){const paused=changeGoal(s,{action:'pause',...ref(s),reason});const view=readGoalPolicy([row('stop',paused)]);assert.equal(view.status,status);assert.notEqual(goalOutcome(view.status),'completed');}
 const complete=changeGoal(s,{action:'complete',...ref(s),verification:['fixture PASS']});assert.equal(readGoalPolicy([row('done',complete)]).status,'complete');assert.equal(goalOutcome('complete'),'completed');
});
test('same stop episode deduplicates repeated entries; resume then stop is a fresh transition',()=>{
 const s=create(),paused=changeGoal(s,{action:'pause',...ref(s),reason:'user'}),again=changeGoal(paused,{action:'pause',...ref(paused),reason:'user'});
 const first=readGoalPolicy([row('active',s),row('pause-1',paused)]),same=readGoalPolicy([row('active',s),row('pause-1',paused),row('pause-2',again)]);assert.equal(sameGoalTransition(first,same),true);assert.equal(same.transitionId,'pause-1');
 const resumed=changeGoal(again,{action:'resume',...ref(again)},{authorized:true}),newPause=changeGoal(resumed,{action:'pause',...ref(resumed)});
 const next=readGoalPolicy([row('pause-1',paused),row('pause-2',again),row('resumed',resumed),row('new-pause',newPause)]);assert.equal(next.transitionId,'new-pause');assert.equal(sameGoalTransition(first,next),false);
});
test('restore/navigation pauses are not new stop notifications, and malformed latest never revives legacy',()=>{
 const s=create();for(const reason of ['restored','branch_changed'])assert.equal(readGoalPolicy([legacy,row('restore',restoredGoal(s,'session-B',reason))]).mode,'none');
 for(const data of [undefined,null,{schema:99}])assert.equal(readGoalPolicy([legacy,row('valid',s),row('bad',data)]).mode,'unknown');
});
test('startup baselines all own transitions, and payloads exclude objective/criteria/error bodies',()=>{
 const s=create(),done=changeGoal(s,{action:'complete',...ref(s),verification:['PRIVATE verification']});const branch=[legacy,row('own',s),row('done',done)];assert.ok(terminalTransitions(branch).has('done'));
 const view=readGoalPolicy(branch);for(const format of ['generic','telegram','discord','slack']){const payload=makePayload({id:'fixture-notification',sessionId:'fixture-session',sessionName:'Fixture',goalId:view.goalId,goalStatus:view.status,outcome:goalOutcome(view.status),chatId:'123'},format,new Date('2026-01-01T00:00:00Z'));assert.ok(!JSON.stringify(payload).includes('PRIVATE'));}
});
