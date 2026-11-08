export const PROGRESS_ENTRY='peicd100:progress-state';
const statuses=new Set(['pending','in_progress','completed','blocked']);
const clone=x=>structuredClone(x);
export function initialProgress(sessionId){return {schema:1,sessionId,enabled:true,revision:0,goalId:null,steps:[]};}
export function validateProgress(s){
 if(!s||s.schema!==1||typeof s.sessionId!=='string'||typeof s.enabled!=='boolean'||!Number.isSafeInteger(s.revision)||s.revision<0||!(s.goalId===null||typeof s.goalId==='string')||!Array.isArray(s.steps)||s.steps.length>50)throw new Error('Progress資料格式無效');
 if(s.steps.filter(x=>x.status==='in_progress').length>1)throw new Error('最多一個in_progress步驟');
 for(const step of s.steps)if(!step||typeof step.text!=='string'||!step.text.trim()||Array.from(step.text).length>503||!statuses.has(step.status))throw new Error('步驟須有1–503字的文字及有效狀態');
 return s;
}
export function readProgress(entries,sessionId){for(let i=(entries?.length??0)-1;i>=0;i--){const e=entries[i];if(e.type==='custom'&&e.customType===PROGRESS_ENTRY)return clone(validateProgress(e.data));}return initialProgress(sessionId);}
export function changeProgress(state,command){
 validateProgress(state);if(command.action==='get')return clone(state);
 if(command.revision!==state.revision)throw new Error('Progress revision已變更，請先查詢最新狀態');
 const s=clone(state);
 if(command.action==='enable'){if(typeof command.enabled!=='boolean')throw new Error('enabled須為boolean');s.enabled=command.enabled;}
 else if(command.action==='replace'){
  if(!s.enabled)throw new Error('請先啟用Progress功能');if(!Array.isArray(command.steps))throw new Error('steps須為陣列');
  s.steps=command.steps.map(x=>({text:x.text,status:x.status}));
  if(command.goalId!==undefined)s.goalId=command.goalId;
 }else throw new Error('未知Progress操作');
 s.revision++;return validateProgress(s);
}
export function restoredProgress(state,sessionId){
 const s=clone(validateProgress(state));let changed=s.sessionId!==sessionId;s.sessionId=sessionId;
 for(const step of s.steps)if(step.status==='in_progress'){step.status='blocked';changed=true;}
 if(changed)s.revision++;return s;
}
export function openProgress(state,goalId){return state.goalId===goalId&&state.steps.some(x=>x.status!=='completed');}
