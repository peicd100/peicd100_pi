import test from 'node:test';
import assert from 'node:assert/strict';
import {GOAL_ENTRY,initialGoal,changeGoal,readGoal,restoredGoal,shouldContinue,classifyFailure,RETRY_MS,validateGoalState} from '../modules/goal/src/state_v0.1.0.mjs';
import {PROGRESS_ENTRY,initialProgress,changeProgress,readProgress,restoredProgress,openProgress} from '../modules/progress/src/state_v0.1.0.mjs';
const create=(extra={})=>changeGoal(initialGoal('session-A'),{action:'create',objective:'完成fixture並驗證',criteria:['fixture test passes'],...extra},{authorized:true,id:'goal-A',now:100});
const cmd=(s,action,extra={})=>({action,id:s.goal.id,revision:s.goal.revision,...extra});
test('malformed or impossible restored Goal states fail closed, including empty verification and disabled active snapshots',()=>{
 const s=create(),done=changeGoal(s,cmd(s,'complete',{verification:['verified fixture']}));
 for(const mutate of [x=>{x.enabled=false;},x=>{x.goal.id='';},x=>{x.goal.updatedAt=NaN;},x=>{x.goal.reason='quota_exhausted';},x=>{x.goal.retry.reason='RAW provider error';},x=>{x.goal.revision=x.revision+1;}]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>validateGoalState(bad));}
 const empty=structuredClone(done);empty.goal.verification=['   '];assert.throws(()=>validateGoalState(empty));assert.throws(()=>create({criteria:'not an array'}),/陣列/);
});
test('Goal create starts immediately unless draft; explicit authorization and one goal',()=>{
 assert.throws(()=>changeGoal(initialGoal('a'),{action:'create',objective:'x'}),/授權/);
 const s=create();assert.equal(s.goal.status,'active');assert.equal(shouldContinue(s),true);
 assert.equal(create({draft:true}).goal.status,'paused');
 assert.throws(()=>changeGoal(s,{action:'create',objective:'x'},{authorized:true}),/已有Goal/);
 assert.deepEqual(changeGoal(s,{action:'get'}),s);
});
test('Goal ID/revision CAS prevents stale edits, completions and deletion; no input mutation',()=>{
 const s=create(),before=structuredClone(s);const edited=changeGoal(s,cmd(s,'edit',{objective:'新版fixture'}),{authorized:true});
 assert.deepEqual(s,before);assert.equal(edited.goal.objective,'新版fixture');
 assert.throws(()=>changeGoal(edited,cmd(s,'complete',{verification:['old result']})),/revision/);
 for(const action of ['edit','delete','resume'])assert.throws(()=>changeGoal(s,cmd(s,action,{objective:'wider scope'})),/授權/);
 assert.throws(()=>changeGoal(s,{action:'delete',id:'other',revision:1},{authorized:true}),/ID/);
 assert.equal(changeGoal(s,cmd(s,'delete'),{authorized:true}).goal,null);
});
test('pause/disable do not mean complete; enable does not resume',()=>{
 const s=create(),paused=changeGoal(s,cmd(s,'pause',{reason:'user'}));assert.equal(shouldContinue(paused),false);
 assert.throws(()=>changeGoal(paused,cmd(paused,'complete',{verification:['not allowed']})),/執行中/);
 const disabled=changeGoal(s,{action:'enable',enabled:false});assert.equal(disabled.goal.status,'paused');
 const enabled=changeGoal(disabled,{action:'enable',enabled:true});assert.equal(enabled.goal.status,'paused');assert.equal(shouldContinue(enabled),false);
 const resumed=changeGoal(enabled,cmd(enabled,'resume'),{authorized:true});assert.equal(shouldContinue(resumed),true);
});
test('restore and branch inheritance pause, preserve objective/evidence, require explicit resume',()=>{
 for(const reason of ['restored','branch_changed']){const s=create(),r=restoredGoal(s,'session-B',reason);assert.equal(r.goal.status,'paused');assert.equal(r.goal.reason,reason);assert.equal(r.sessionId,'session-B');assert.equal(r.goal.objective,s.goal.objective);assert.ok(r.goal.revision>s.goal.revision);assert.equal(shouldContinue(r),false);}
 const done=changeGoal(create(),{action:'complete',id:'goal-A',revision:1,verification:['node --test fixture: PASS']});assert.equal(restoredGoal(done,'session-A').goal.status,'complete');
});
test('wait does not busy-loop; timed automatic wake only for explicit external waiting',()=>{
 const s=create(),waiting=changeGoal(s,cmd(s,'wait',{kind:'user',reason:'等待選擇'}),{now:100});assert.equal(shouldContinue(waiting),false);
 assert.throws(()=>changeGoal(s,cmd(s,'wait',{kind:'user',reason:'x',resumeAt:6000}),{now:100}),/external/);
 const external=changeGoal(s,cmd(s,'wait',{kind:'external',reason:'等待可觀察事件',resumeAt:6000}),{now:100});assert.equal(shouldContinue(external),false);
 assert.equal(shouldContinue(changeGoal(external,cmd(external,'wake'))),true);
});
test('fixed 5000ms, unbounded retries and natural continuations; no retry after pause/delete',()=>{
 let s=create();assert.equal(RETRY_MS,5000);
 for(let i=0;i<1200;i++){s=changeGoal(s,cmd(s,'retry'),{now:i*20000});assert.equal(s.goal.retry.nextAt,i*20000+5000);assert.equal(s.goal.retry.attempt,i+1);assert.equal(shouldContinue(s),false);s=changeGoal(s,cmd(s,'retry_dispatched'));assert.equal(shouldContinue(s),true);}
 for(let i=0;i<10000;i++)assert.equal(shouldContinue(s),true);
 const paused=changeGoal(s,cmd(s,'pause'));assert.equal(paused.goal.retry.nextAt,null);assert.throws(()=>changeGoal(paused,cmd(paused,'retry')),/不可重試/);
 assert.equal(changeGoal(s,cmd(s,'delete'),{authorized:true}).goal,null);
});
test('explicit quota is not generic rate limit, context overflow or UNKNOWN',()=>{
 for(const x of ['insufficient_quota','Insufficient credits','Credit balance too low','You have hit your ChatGPT usage limit'])assert.equal(classifyFailure(x),'quota_exhausted');
 for(const x of ['429 Too many requests','rate limit exceeded','429 usage limit exceeded for requests per minute','Rate limit reached for account usage limits','503 Service unavailable','ECONNRESET','fetch failed','ETIMEDOUT'])assert.equal(classifyFailure(x),'transient');
 assert.equal(classifyFailure('context window exceeded'),'unknown');assert.equal(classifyFailure('unexpected provider failure'),'unknown');
 assert.equal(classifyFailure('401 invalid_api_key'),'authentication');assert.equal(classifyFailure('permission_denied'),'permission');assert.equal(classifyFailure('invalid_request_error'),'invalid_request');
});
test('Goal complete requires explicit evidence and no unfinished linked Progress; list completion alone does not complete Goal',()=>{
 const s=create();assert.throws(()=>changeGoal(s,cmd(s,'complete',{verification:[]})),/證據/);
 assert.throws(()=>changeGoal(s,cmd(s,'complete',{verification:['fixture PASS']}),{openProgress:true}),/Progress/);
 const done=changeGoal(s,cmd(s,'complete',{verification:['fixture PASS']}));assert.equal(done.goal.status,'complete');assert.deepEqual(done.goal.verification,['fixture PASS']);assert.equal(shouldContinue(done),false);
});
test('latest malformed Goal/Progress entry fails closed, never revives an older state',()=>{
 const s=create();assert.throws(()=>readGoal([{type:'custom',customType:GOAL_ENTRY,data:s},{type:'custom',customType:GOAL_ENTRY,data:{schema:99}}],'session-A'),/格式/);
 assert.throws(()=>readProgress([{type:'custom',customType:PROGRESS_ENTRY,data:initialProgress('a')},{type:'custom',customType:PROGRESS_ENTRY,data:{schema:99}}],'a'),/格式/);
});
test('Progress independent or linked, one in_progress, CAS, restore blocks stale running labels',()=>{
 const p=initialProgress('a');const next=changeProgress(p,{action:'replace',revision:0,steps:[{text:'準備fixture',status:'completed'},{text:'驗證',status:'in_progress'}]});assert.equal(next.goalId,null);assert.equal(openProgress(next,'goal-A'),false);
 const linked=changeProgress(next,{action:'replace',revision:1,goalId:'goal-A',steps:next.steps});assert.equal(openProgress(linked,'goal-A'),true);
 assert.throws(()=>changeProgress(linked,{action:'replace',revision:1,steps:[]}),/revision/);
 assert.throws(()=>changeProgress(p,{action:'replace',revision:0,steps:[{text:'a',status:'in_progress'},{text:'b',status:'in_progress'}]}),/最多一個/);
 const restored=restoredProgress(linked,'b');assert.equal(restored.steps[1].status,'blocked');assert.equal(restored.steps[0].status,'completed');assert.equal(restored.sessionId,'b');
 const finished=changeProgress(linked,{action:'replace',revision:2,steps:linked.steps.map(x=>({...x,status:'completed'}))});assert.equal(openProgress(finished,'goal-A'),false);assert.equal(create().goal.status,'active');
 assert.deepEqual(p.steps,[]);
});
