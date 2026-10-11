import test from 'node:test';import assert from 'node:assert/strict';import {readGoalPolicy,sameGoalTransition} from '../src/goal-policy_v1.4.0.mjs';import {DEFAULT_GOAL_NOTIFY,makePayload} from '../src/core_v1.4.0.mjs';
const row=(id,status,extra={})=>({id,type:'custom',customType:'goal-state',data:{goal:{id:'g',status,startedAt:1,updatedAt:1,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0,text:'PRIVATE_OBJECTIVE',...extra}}});
test('six defaults and waiting/paused labels never claim completion or expose private reasons',()=>{
 assert.deepEqual(DEFAULT_GOAL_NOTIFY,['complete','waiting','paused','blocked','usage_limited','budget_limited']);
 for(const status of ['waiting','paused']){const p=makePayload({id:'n',sessionId:'s',goalId:'g',goalStatus:status,outcome:status},'generic');assert.match(p.text,/尚未完成/);assert.equal(p.status,status);}
});
test('wait projection does not mutate active Goal and deduplicates contiguous episode; active wake starts a new episode',()=>{
 const a=row('a','active'),w=row('w','active',{waiting:{reason:'PRIVATE_REASON'}}),w2=row('w2','active',{waiting:{reason:'new reason',resumeAt:100}});const branch=[a,w,w2],before=JSON.stringify(branch);const s=readGoalPolicy(branch);assert.equal(s.status,'waiting');assert.equal(s.transitionId,'w');assert.equal(JSON.stringify(branch),before);assert(!JSON.stringify(s).includes('PRIVATE'));
 assert(sameGoalTransition(s,readGoalPolicy([a,w])));assert(!sameGoalTransition(s,readGoalPolicy([...branch,row('resume','active'),row('new','active',{waiting:{reason:'next'}})])));
});
test('paused persists as one episode, clear is none, complete-then-null still complete',()=>{
 assert.equal(readGoalPolicy([row('p','paused'),row('p2','paused')]).transitionId,'p');const nil={id:'nil',type:'custom',customType:'goal-state',data:{goal:null}};assert.equal(readGoalPolicy([row('p','paused'),nil]).mode,'none');assert.equal(readGoalPolicy([row('c','complete'),nil]).status,'complete');
});
test('invalid wait/schema is unknown, ordinary active retry is not a stop',()=>{
 assert.equal(readGoalPolicy([row('a','active')]).mode,'active');for(const waiting of [true,{}, {reason:''},{reason:'ok',resumeAt:NaN}])assert.equal(readGoalPolicy([row('bad','active',{waiting})]).mode,'unknown');
});
