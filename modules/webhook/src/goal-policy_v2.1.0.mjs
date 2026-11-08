// Projection only: no dependency on third-party Goal tools, runtime, RPC or state.
// Legacy histories remain supported ONLY until this branch has its first own-Goal owner entry.
import {readGoalPolicy as legacy,terminalTransitions as legacyTransitions,sameGoalTransition,goalOutcome,GOAL_TERMINALS} from './goal-policy_v2.0.1.mjs';
import {GOAL_ENTRY,validateGoalState} from '../../goal/src/state_v0.1.0.mjs';
export {sameGoalTransition,goalOutcome,GOAL_TERMINALS};
function project(row){
 try{
  if(typeof row?.id!=='string'||!row.id)return {mode:'unknown'};
  const state=validateGoalState(row.data),g=state.goal;
  if(!g)return {mode:'none',entryId:row.id};
  if(g.status==='active')return {mode:'active',goalId:g.id,waiting:!!g.waiting||g.retry.nextAt!==null,entryId:row.id};
  // Reading/restoring a snapshot or navigating branches is NOT a new stopped job.
  if(g.status==='paused'&&['restored','branch_changed'].includes(g.reason))return {mode:'none',goalId:g.id,entryId:row.id};
  const status=g.status==='complete'?'complete':g.reason==='quota_exhausted'?'usage_limited':g.reason==='blocked'?'blocked':'paused';
  return {mode:'terminal',goalId:g.id,status,transitionId:row.id,notification_only:true};
 }catch{return {mode:'unknown'};}
}
export function readGoalPolicy(branch){
 const rows=branch.filter(e=>e.type==='custom'&&e.customType===GOAL_ENTRY);
 if(!rows.length)return legacy(branch);
 const view=project(rows.at(-1));if(view.mode!=='terminal')return view;
 for(let i=rows.length-2;i>=0;i--){const previous=project(rows[i]);if(previous.mode!=='terminal'||previous.goalId!==view.goalId||previous.status!==view.status)break;view.transitionId=previous.transitionId;}
 return view;
}
export function terminalTransitions(branch){return new Set([...legacyTransitions(branch),...branch.filter(e=>e.type==='custom'&&e.customType===GOAL_ENTRY).map(e=>e.id)]);}
