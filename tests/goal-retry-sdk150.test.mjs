import test from 'node:test';
import assert from 'node:assert/strict';
import {withGoal,create,complete,until,sleep} from './helpers/goal-fixture150.mjs';
import {commandName} from '../src/commands_v0.12.0.mjs';

test('real SDK: exact observed timeout/connection trace exhausts native three retries twice; Goal owns fixed 5s recoveries without replay',async()=>{
 await withGoal(({request,state})=>{
  if(request===1)return create();
  if(request===10)return complete(state);
  return {error:request===2||request===6?'Request timed out.':'Connection error.'};
 },async h=>{
  await h.session.prompt('Create the approved disposable goal.');await h.session.waitForIdle();
  assert.equal(h.requests.length,5,'One create plus initial error plus three native retries');
  assert.equal(h.state().goal.status,'active');assert.equal(h.state().goal.reason,null);assert.equal(h.state().goal.retry.attempt,1);
  assert.equal(h.state().goal.retry.nextAt-h.state().goal.updatedAt,5000);
  assert.equal(h.events.filter(e=>e.type==='auto_retry_end'&&e.success===false).length,1);
  for(const request of h.requests.slice(1,5))assert.equal(request.goal.retry.attempt,0,'Goal must not insert work during native retry');
  await until(()=>h.state()?.goal?.status==='complete',18000);await h.session.waitForIdle();
  assert.equal(h.requests.length,10);assert.equal(h.state().goal.retry.attempt,2);
  const ends=h.events.filter(e=>e.type==='auto_retry_end'&&e.success===false);
  assert.equal(ends.length,2);assert.deepEqual(ends.map(e=>e.attempt),[3,3]);
  for(const [round,request] of [[0,h.requests[5]],[1,h.requests[9]]])assert(request.at-ends[round].at>=4900,'Goal must wait actual fixed 5000ms after native exhaustion');
  const branch=h.manager.getBranch();
  assert.equal(branch.filter(e=>e.type==='message'&&e.message?.role==='toolResult'&&e.message.toolCallId==='create-once').length,1,'Do not replay the create tool or other prior effects');
  assert.equal(branch.filter(e=>e.type==='custom_message'&&e.customType==='peicd100:goal-continuation').length,2);
  assert.deepEqual(h.errors,[]);
 });
});
test('real SDK: human idle menu pause cancels the Goal retry after native exhaustion',async()=>{
 await withGoal(({request})=>request===1?create():{error:'Connection error.'},async h=>{
  await h.session.prompt('Create the approved disposable goal.');await h.session.waitForIdle();
  assert.equal(h.requests.length,5);assert.equal(h.state().goal.retry.attempt,1);assert(h.state().goal.retry.nextAt>Date.now());
  await h.session.prompt('/'+commandName('goal'));await h.session.waitForIdle();
  assert.equal(h.state().goal.status,'paused');assert.equal(h.state().goal.reason,'user');assert.equal(h.state().goal.retry.nextAt,null);
  await sleep(5150);assert.equal(h.requests.length,5,'A manually paused Goal cannot revive after its previous deadline');assert.deepEqual(h.errors,[]);
 },{select:({index})=>index===0?'暫停Goal':undefined});
});
test('real SDK: authentication, quota and actual unknown failures remain paused without a recovery request',async()=>{
 for(const [error,reason] of [['401 invalid_api_key','authentication'],['insufficient_quota: account balance exhausted','quota_exhausted'],['Unexpected provider failure','unknown']]){
  await withGoal(({request})=>request===1?create():{error},async h=>{
   await h.session.prompt('Create the approved disposable goal.');await h.session.waitForIdle();
   assert.equal(h.state().goal.status,'paused',error);assert.equal(h.state().goal.reason,reason);assert.equal(h.state().goal.retry.attempt,0);assert.equal(h.state().goal.retry.nextAt,null);
   assert.equal(h.requests.length,2);await sleep(50);assert.equal(h.requests.length,2);assert.deepEqual(h.errors,[]);
  });
 }
});
