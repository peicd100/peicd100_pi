import test from 'node:test';import assert from 'node:assert/strict';
import {readGoalPolicy} from '../modules/webhook/src/goal-policy_v2.0.1.mjs';
import {makePayload,DEFAULT_GOAL_NOTIFY} from '../modules/webhook/src/core_v2.0.1.mjs';
const base={id:'g',status:'active',startedAt:1,updatedAt:1,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0};
const row=(id,waiting,extra={})=>({id,type:'custom',customType:'goal-state',data:{goal:{...base,...extra,...(waiting===undefined?{}:{waiting})}}});
const manual={reason:'Provider retries exhausted: exceeded request buffer limit while retrying upstream PRIVATE_DETAIL'};
test('verified provider retries exhausted without resumeAt is notification-only manual stop; raw state and reason do not change',()=>{
 const branch=[row('a',manual)],before=JSON.stringify(branch),view=readGoalPolicy(branch);assert.deepEqual(view,{mode:'terminal',goalId:'g',status:'retry_exhausted',transitionId:'a',notification_only:true});assert.equal(JSON.stringify(branch),before);assert(DEFAULT_GOAL_NOTIFY.includes(view.status));
 const p=makePayload({id:'id',sessionId:'sid',sessionName:'修正通知分類',goalId:view.goalId,goalStatus:view.status,outcome:view.status},'generic',new Date('2026-10-13T00:00:00Z'));assert.match(p.text,/^🔔 修正通知分類｜需要處理/);assert.match(p.reason,/上游請求重試已耗盡/);assert.match(p.next_action,/follow-up.*\/goal resume/);assert(!JSON.stringify(p).includes('PRIVATE_DETAIL'));assert(!JSON.stringify(p).includes('buffer limit'));
});
for(const waiting of [{reason:'external event'},{reason:'external manual resume'},{reason:'Provider retries exhausted',resumeAt:123},{reason:'Provider retries exhausted',resumeAt:0},{reason:'ordinary retry'},{reason:'prefix Provider retries exhausted'},{reason:'provider retries exhausted'},{reason:'Provider retries exhausted unknown wording'}])test(`ordinary/timed/unrecognized wait stays quiet (${waiting.reason}, ${waiting.resumeAt??'no deadline'})`,()=>{assert.equal(readGoalPolicy([row('a',waiting)]).mode,'active');});
test('unknown/malformed schema stays unknown, rather than reading arbitrary error text',()=>{
 for(const waiting of [{reason:'Provider retries exhausted',resumeAt:null},{reason:'Provider retries exhausted',resumeAt:-1},{reason:'Provider retries exhausted',resumeAt:NaN},{reason:'Provider retries exhausted'+'.'.repeat(1000)}])assert.equal(readGoalPolicy([row('a',waiting)]).mode,'unknown');
 const queued=row('a',manual);queued.data.pendingAction='untrusted';assert.equal(readGoalPolicy([queued]).mode,'unknown');assert.equal(readGoalPolicy([row('a',manual,{status:'future'})]).mode,'unknown');
});
test('generic wait -> manual exhausted is a new episode; repeated reasons coalesce and actual resume makes a new episode',()=>{
 const rows=[row('old-auto',{reason:'external event'}),row('first-manual',manual),row('repeat',{reason:'Provider retries exhausted: changed PRIVATE_DETAIL'})];assert.equal(readGoalPolicy(rows).transitionId,'first-manual');rows.push(row('resume'),row('new-manual',manual));assert.equal(readGoalPolicy(rows).transitionId,'new-manual');
 const broken=[row('malformed',manual,{iteration:-1}),row('valid',manual)];assert.equal(readGoalPolicy(broken).transitionId,'valid');
});
