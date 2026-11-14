// 2026-11-12 (Claude, owner-authorized): shorter model-facing text for peicd100_goal and update_progress.
// Only the text the model reads is shortened. `details` (UI, accounting, session record) is passed through
// unchanged, and errors are untouched. Measured on a long-running production session: a goal result was 2.7K–7.5K
// characters and a progress result 2K–3K, almost all of it bookkeeping the model never uses.
const pick=(source:any,keys:string[])=>{const out:any={};if(source&&typeof source==='object')for(const key of keys)if(source[key]!==undefined)out[key]=source[key];return out;};

/** Goal state the model needs to act: ids and revisions for mutations, the objective and criteria, and why it is stopped. */
export function compactGoalText(text:string){
 let state:any;try{state=JSON.parse(text);}catch{return text;}
 if(!state||typeof state!=='object'||!('goal' in state))return text;
 const goal=state.goal?pick(state.goal,['id','revision','objective','criteria','status','reason','waiting','retry','verification']):null;
 const controls=state.controls?{...pick(state.controls,['autonomousManagement','quotaRecovery']),...(state.controls.barrier?{barrier:pick(state.controls.barrier,['reason','goalId'])}:{})}:undefined;
 const out:any={...pick(state,['enabled','revision','automationBlocked']),goal,...(controls?{controls}:{})};
 if(state.settlement)out.settlement='recorded; see the Goal menu';
 return JSON.stringify(out);
}

/** A replace echoes back only what changed hands: the new revision and the step counts. A query still returns every step. */
export function compactProgressText(text:string,params:any){
 let state:any;try{state=JSON.parse(text);}catch{return text;}
 if(!state||typeof state!=='object'||!Array.isArray(state.steps))return text;
 const base=pick(state,['enabled','revision','goalId','automationBlocked']);
 if(params?.steps===undefined)return JSON.stringify({...base,steps:state.steps.map((step:any)=>pick(step,['text','status']))});
 const counts:any={};for(const step of state.steps)counts[step.status]=(counts[step.status]??0)+1;
 const current=state.steps.find((step:any)=>step.status==='in_progress');
 return JSON.stringify({...base,updated:true,steps:state.steps.length,counts,...(current?{in_progress:current.text}:{})});
}

/**
 * Run `install(pi)` while tools named in `compact` get their successful text result shortened.
 * registerTool is patched on the same object only for the duration of the synchronous install, so every
 * identity-keyed lookup in the modules still sees the original `pi`. If patching is impossible the module
 * installs exactly as before.
 */
export function installWithCompactResults(pi:any,install:(pi:any)=>any,compact:Record<string,(text:string,params:any)=>string>){
 const original=pi.registerTool;
 const wrap=(tool:any)=>{
  const shorten=tool&&compact[tool.name];if(!shorten||typeof tool.execute!=='function')return tool;
  return {...tool,async execute(id:any,params:any,...rest:any[]){
   const result=await tool.execute(id,params,...rest);
   try{
    if(result&&!result.isError&&Array.isArray(result.content)&&result.content.length===1&&result.content[0]?.type==='text'&&typeof result.content[0].text==='string')
     return {...result,content:[{type:'text',text:shorten(result.content[0].text,params)}]};
   }catch{/* keep the original result */}
   return result;
  }};
 };
 let patched=false;
 try{pi.registerTool=function(tool:any){return original.call(this,wrap(tool));};patched=pi.registerTool!==original;}catch{patched=false;}
 try{return install(pi);}
 finally{if(patched){try{pi.registerTool=original;}catch{/* nothing to restore */}}}
}
