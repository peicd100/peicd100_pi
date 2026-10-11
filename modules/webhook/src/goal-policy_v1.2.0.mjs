// Optional compatibility adapter for @narumitw/pi-goal 0.54.11 session entries.
// No import of its internals, global state, prompt text, objective or credentials.
export const GOAL_TERMINALS = ['complete', 'blocked', 'usage_limited', 'budget_limited'];
const statuses = new Set(['active', 'paused', ...GOAL_TERMINALS]);
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const valid = g => record(g) && typeof g.id === 'string' && g.id.trim() === g.id && g.id.length > 0 && g.id.length <= 200 &&
  statuses.has(g.status) && ['startedAt','updatedAt','iteration','tokensUsed','timeUsedSeconds','baselineTokens'].every(k => typeof g[k] === 'number' && Number.isFinite(g[k]) && g[k] >= 0);
export function readGoalPolicy(branch) {
  let rows = branch.filter(e => e.type === 'custom' && e.customType === 'goal-state');
  let last = rows.at(-1);
  if (!last) return branch.some(e => e.type === 'custom' && e.customType === 'goals-state') ? {mode:'unknown'} : {mode:'none'};
  if(typeof last.id!=='string'||!last.id)return {mode:'unknown'};
  let data = last.data;
  if (!record(data) || !Object.hasOwn(data,'goal') || Object.hasOwn(data,'queue') || Object.hasOwn(data,'pendingAction')) return {mode:'unknown'};
  if (data.goal === null) {
    // pi-goal 0.54.11 persists complete then immediately clears active state.
    // Only that explicit predecessor is completion; clearing active/paused is not.
    const previous=rows.at(-2);
    if(!valid(previous?.data?.goal)||previous.data.goal.status!=='complete')return {mode:'none',entryId:last.id};
    rows=rows.slice(0,-1);last=previous;data=last.data;
  }
  const goal = data.goal;
  if (!valid(goal)) return {mode:'unknown'};
  if (goal.status === 'active') return {mode:'active',goalId:goal.id,waiting:!!goal.waiting,entryId:last.id};
  if (goal.status === 'paused') return {mode:'paused',goalId:goal.id,entryId:last.id};
  let transitionId = last.id;
  // Repeated persistence of a terminal state is still one transition. A resume
  // back to active starts a distinct terminal episode, even with the same id.
  for (const row of rows.slice(0,-1).reverse()) {
    const previous = row.data?.goal;
    if (!valid(previous) || previous.id !== goal.id || previous.status !== goal.status) break;
    transitionId = row.id;
  }
  if (typeof transitionId !== 'string' || !transitionId) return {mode:'unknown'};
  return {mode:'terminal',goalId:goal.id,status:goal.status,transitionId};
}
export const goalOutcome = status => status === 'complete' ? 'completed' : status;
export const sameGoalTransition = (a,b) => a?.mode === 'terminal' && b?.mode === 'terminal' &&
  a.goalId === b.goalId && a.status === b.status && a.transitionId === b.transitionId;
export function terminalTransitions(branch) {
  return new Set(branch.filter(e => e.type === 'custom' && e.customType === 'goal-state').map(e => e.id));
}
