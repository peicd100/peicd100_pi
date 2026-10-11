// Notification projection only: waiting remains active in pi-goal itself.
export const GOAL_TERMINALS=['complete','waiting','paused','blocked','usage_limited','budget_limited'];
const states=new Set(['active','paused','complete','blocked','usage_limited','budget_limited']);
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const valid=g=>record(g)&&typeof g.id==='string'&&g.id.trim()===g.id&&g.id.length>0&&g.id.length<=200&&states.has(g.status)&&['startedAt','updatedAt','iteration','tokensUsed','timeUsedSeconds','baselineTokens'].every(k=>typeof g[k]==='number'&&Number.isFinite(g[k])&&g[k]>=0);
function status(g){
 if(g.status!=='active')return g.status;
 if(!g.waiting)return 'active';
 if(!record(g.waiting)||typeof g.waiting.reason!=='string'||!g.waiting.reason.trim()||g.waiting.reason.length>1000||Object.hasOwn(g.waiting,'resumeAt')&&(!Number.isSafeInteger(g.waiting.resumeAt)||g.waiting.resumeAt<0))return 'unknown';
 return 'waiting';
}
export function readGoalPolicy(branch){
 let rows=branch.filter(e=>e.type==='custom'&&e.customType==='goal-state'),last=rows.at(-1);
 if(!last)return branch.some(e=>e.type==='custom'&&e.customType==='goals-state')?{mode:'unknown'}:{mode:'none'};
 if(typeof last.id!=='string'||!last.id||!record(last.data)||!Object.hasOwn(last.data,'goal')||Object.hasOwn(last.data,'queue')||Object.hasOwn(last.data,'pendingAction'))return {mode:'unknown'};
 if(last.data.goal===null){const prev=rows.at(-2);if(!valid(prev?.data?.goal)||prev.data.goal.status!=='complete')return {mode:'none',entryId:last.id};rows=rows.slice(0,-1);last=prev;}
 const g=last.data.goal;if(!valid(g))return {mode:'unknown'};const s=status(g);
 if(s==='unknown')return {mode:'unknown'};
 if(s==='active')return {mode:'active',goalId:g.id,waiting:false,entryId:last.id};
 let transitionId=last.id;
 for(const row of rows.slice(0,-1).reverse()){const p=row.data?.goal;if(!valid(p)||p.id!==g.id||status(p)!==s)break;transitionId=row.id;}
 if(typeof transitionId!=='string'||!transitionId)return {mode:'unknown'};
 return {mode:'terminal',goalId:g.id,status:s,transitionId,notification_only:true};
}
export const goalOutcome=status=>status==='complete'?'completed':status;
export const sameGoalTransition=(a,b)=>a?.mode==='terminal'&&b?.mode==='terminal'&&a.goalId===b.goalId&&a.status===b.status&&a.transitionId===b.transitionId;
export const terminalTransitions=branch=>new Set(branch.filter(e=>e.type==='custom'&&e.customType==='goal-state').map(e=>e.id));
