import {readGoalPolicy as legacy,sameGoalTransition,terminalTransitions,goalOutcome} from './goal-policy_v1.4.0.mjs';
export {sameGoalTransition,terminalTransitions,goalOutcome};
export const GOAL_TERMINALS=['complete','paused','blocked','usage_limited','budget_limited'];
export function readGoalPolicy(branch){
 const goal=legacy(branch);
 // Goal wait has an explicit continuation/wake contract, not a terminal alert.
 // Even an unobservable wake deadline is not evidence of failure: stay quiet.
 if(goal.mode==='terminal'&&goal.status==='waiting')return {mode:'active',goalId:goal.goalId,waiting:true,entryId:goal.transitionId};
 return goal;
}
