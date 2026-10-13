import {readGoalPolicy as baseline,sameGoalTransition,terminalTransitions,goalOutcome,GOAL_TERMINALS as original} from './goal-policy_v2.0.0.mjs';
export {sameGoalTransition,terminalTransitions,goalOutcome};
export const GOAL_TERMINALS=[...original,'retry_exhausted'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
// pi-goal's enterGoalWait(provider_retry) clears recovery/continuation and
// persists this exact marker without resumeAt. No timer can resume that wait.
// Do NOT infer a manual stop from arbitrary waiting text or a missing deadline.
function manualWait(goal){
 return object(goal)&&typeof goal.id==='string'&&goal.id.trim()===goal.id&&goal.id.length>0&&goal.id.length<=200&&goal.status==='active'&&
  ['startedAt','updatedAt','iteration','tokensUsed','timeUsedSeconds','baselineTokens'].every(k=>typeof goal[k]==='number'&&Number.isFinite(goal[k])&&goal[k]>=0)&&
  object(goal.waiting)&&typeof goal.waiting.reason==='string'&&goal.waiting.reason.length<=1000&&/^Provider retries exhausted(?::|$)/.test(goal.waiting.reason)&&!Object.hasOwn(goal.waiting,'resumeAt');
}
export function readGoalPolicy(branch){
 const view=baseline(branch);
 if(view.mode!=='active'||!view.waiting)return view;
 const rows=branch.filter(e=>e.type==='custom'&&e.customType==='goal-state'),last=rows.at(-1),goal=last?.data?.goal;
 if(!manualWait(goal))return view;
 let transitionId=last.id;
 // Classify the episode, not generic "waiting": ordinary wait -> exhausted
 // wait is a NEW event, repeated reason/status writes within it are not.
 for(const row of rows.slice(0,-1).reverse()){
  if(typeof row.id!=='string'||!row.id||!object(row.data)||Object.hasOwn(row.data,'queue')||Object.hasOwn(row.data,'pendingAction')||!manualWait(row.data.goal)||row.data.goal.id!==goal.id)break;
  transitionId=row.id;
 }
 return {mode:'terminal',goalId:goal.id,status:'retry_exhausted',transitionId,notification_only:true};
}
