import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyFailure,initialGoal,changeGoal,RETRY_MS,shouldContinue} from '../modules/goal/src/state_v0.2.0.mjs';
import {classifyFailure as historical} from '../modules/goal/src/state_v0.1.0.mjs';

test('published historical classifier remains immutable; next runtime covers observed literal and native retry wrapper',()=>{
 assert.equal(historical('Connection error.'),'unknown');
 for(const text of ['Connection error.','Connection error','connection ERROR.','  Connection error.  ','Error: Connection error.','APIConnectionError: Connection error.','Retry failed after 3 attempts: Connection error.','Retry failed after 12 attempts: Error: Connection error.']){
  assert.equal(classifyFailure(text),'transient',text);
  assert.equal(classifyFailure({stopReason:'error',errorMessage:text}),'transient',text+' assistant message');
 }
});
test('historical transient errors stay retryable and explicit permanent failures win',()=>{
 for(const value of ['Request timed out.','ECONNRESET','ETIMEDOUT','fetch failed','503 Service unavailable','429 Too many requests'])assert.equal(classifyFailure(value),'transient',value);
 for(const [value,expected] of [
  ['insufficient_quota: Connection error.','quota_exhausted'],
  ['You have hit your ChatGPT usage limit','quota_exhausted'],
  ['401 invalid_api_key; Connection error.','authentication'],
  ['permission_denied; Connection error.','permission'],
  ['invalid_request_error; Connection error.','invalid_request'],
  ['context window exceeded','unknown'],['Unexpected provider failure','unknown'],
  ['The tool output says Connection error. but no transport failed','unknown'],
  ['Connection error: certificate verify failed','unknown'],
  ['Retry failed after 3 attempts: context window exceeded','unknown'],
 ])assert.equal(classifyFailure(value),expected,value);
});
test('malformed or absent error text remains unknown and never throws',()=>{
 for(const value of [undefined,null,{},42,{errorMessage:123},{errorMessage:{}},{errorMessage:null}])assert.equal(classifyFailure(value),'unknown');
});
test('observed connection failure schedules fixed 5000ms with no self-imposed attempt cap; pause cancels',()=>{
 let state=changeGoal(initialGoal('mock-session'),{action:'create',objective:'fixture-only',criteria:['actual verification']},{authorized:true,id:'fixture-goal',now:0});
 assert.equal(RETRY_MS,5000);
 for(let i=0;i<1500;i++){
  const at=100+i*10000;assert.equal(classifyFailure('Connection error.'),'transient');
  state=changeGoal(state,{action:'retry',id:state.goal.id,revision:state.goal.revision},{now:at});
  assert.equal(state.goal.retry.nextAt,at+5000);assert.equal(state.goal.retry.attempt,i+1);assert.equal(shouldContinue(state),false);
  state=changeGoal(state,{action:'retry_dispatched',id:state.goal.id,revision:state.goal.revision},{now:at+5000});assert.equal(shouldContinue(state),true);
 }
 state=changeGoal(state,{action:'retry',id:state.goal.id,revision:state.goal.revision},{now:99999999});
 state=changeGoal(state,{action:'pause',id:state.goal.id,revision:state.goal.revision,reason:'user'});
 assert.equal(state.goal.status,'paused');assert.equal(state.goal.retry.nextAt,null);assert.equal(shouldContinue(state),false);
 assert.doesNotMatch(JSON.stringify(state),/Connection error|Retry failed/,'Raw transport text never persists in Goal state');
});
