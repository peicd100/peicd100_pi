// Pure tests: no SDK, no model, no network. Only the model-facing text is shortened; details pass through.
import test from 'node:test';import assert from 'node:assert/strict';
import {compactGoalText,compactProgressText,installWithCompactResults} from '../src/compact-tool-result_20261112.ts';

const goalState={schema:1,sessionId:'s',enabled:true,revision:50,goal:{id:'g1',revision:24,objective:'Do the thing',criteria:['a','b'],status:'paused',reason:'user',waiting:null,retry:{attempt:0,nextAt:null,reason:null},verification:[],createdAt:1,updatedAt:2},
 controls:{schema:1,autonomousManagement:true,quotaRecovery:true,barrier:{reason:'restored',goalId:'g1',userRef:'u',at:3},audit:{id:'x',action:'restore',scopeBefore:'h'.repeat(64),scopeAfter:'h'.repeat(64)}},quotaFence:null,
 settlement:{runs:[{runId:'r',roles:{Main:{totals:{input:{known:1}}}}}]}};

test('goal text keeps what the model acts on and drops the bookkeeping',()=>{
 const out=JSON.parse(compactGoalText(JSON.stringify(goalState)));
 assert.deepEqual(out.goal,{id:'g1',revision:24,objective:'Do the thing',criteria:['a','b'],status:'paused',reason:'user',waiting:null,retry:{attempt:0,nextAt:null,reason:null},verification:[]});
 assert.equal(out.revision,50);assert.equal(out.enabled,true);
 assert.deepEqual(out.controls,{autonomousManagement:true,quotaRecovery:true,barrier:{reason:'restored',goalId:'g1'}});
 assert.equal(typeof out.settlement,'string');assert.equal('sessionId' in out,false);assert.equal('quotaFence' in out,false);
 assert.ok(compactGoalText(JSON.stringify(goalState)).length<JSON.stringify(goalState).length);
});

test('goal text with no goal, and anything that is not goal state, is safe',()=>{
 assert.deepEqual(JSON.parse(compactGoalText(JSON.stringify({enabled:true,revision:1,goal:null}))),{enabled:true,revision:1,goal:null});
 assert.equal(compactGoalText('Goal id or revision is stale'),'Goal id or revision is stale');
 assert.equal(compactGoalText('{"other":1}'),'{"other":1}');
});

const progressState={schema:1,sessionId:'s',enabled:true,revision:7,goalId:'g1',steps:[{text:'one',status:'completed',extra:1},{text:'two',status:'in_progress'},{text:'three',status:'pending'}],automationBlocked:false};

test('progress replace returns the revision and counts, not an echo of every step',()=>{
 const out=JSON.parse(compactProgressText(JSON.stringify(progressState),{steps:progressState.steps,expected_revision:6}));
 assert.deepEqual(out,{enabled:true,revision:7,goalId:'g1',automationBlocked:false,updated:true,steps:3,counts:{completed:1,in_progress:1,pending:1},in_progress:'two'});
});

test('progress query still returns every step',()=>{
 const out=JSON.parse(compactProgressText(JSON.stringify(progressState),{}));
 assert.deepEqual(out.steps,[{text:'one',status:'completed'},{text:'two',status:'in_progress'},{text:'three',status:'pending'}]);assert.equal(out.revision,7);
 assert.equal(compactProgressText('請先查詢Progress',{}),'請先查詢Progress');
});

test('wrapper shortens only the named tool, keeps details and errors, and restores registerTool',async()=>{
 const tools=[];const pi={registerTool(tool){tools.push(tool);}};const original=pi.registerTool;
 const details={state:goalState};
 const value=installWithCompactResults(pi,api=>{
  assert.equal(api,pi);
  api.registerTool({name:'peicd100_goal',execute:async(_id,p)=>p.fail?{content:[{type:'text',text:'boom'}],isError:true}:{content:[{type:'text',text:JSON.stringify(goalState)}],details}});
  api.registerTool({name:'other',execute:async()=>({content:[{type:'text',text:JSON.stringify(goalState)}]})});
  return 'installed';
 },{peicd100_goal:compactGoalText});
 assert.equal(value,'installed');assert.equal(pi.registerTool,original);
 const ok=await tools[0].execute('1',{});assert.equal(ok.details,details);assert.equal(JSON.parse(ok.content[0].text).goal.id,'g1');assert.equal('sessionId' in JSON.parse(ok.content[0].text),false);
 const bad=await tools[0].execute('2',{fail:true});assert.equal(bad.content[0].text,'boom');assert.equal(bad.isError,true);
 assert.equal((await tools[1].execute('3',{})).content[0].text,JSON.stringify(goalState));
});

test('a frozen api installs unchanged instead of failing',()=>{
 const seen=[];const pi=Object.freeze({registerTool(tool){seen.push(tool);}});
 installWithCompactResults(pi,api=>api.registerTool({name:'peicd100_goal',execute:async()=>({})}),{peicd100_goal:compactGoalText});
 assert.equal(seen.length,1);
});
