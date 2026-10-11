export const VERSION='0.1.0';
export const STALE_MS=300000;
const toolLabels={read:'讀取檔案',write:'寫入檔案',edit:'修改檔案',bash:'執行指令',powershell:'執行指令',grep:'搜尋',find:'搜尋',ls:'列出檔案',codemode:'執行腳本'};
export function duration(ms){const sec=Math.max(0,Math.floor(ms/1000));if(sec<60)return `${sec} 秒`;if(sec<3600)return `${Math.floor(sec/60)} 分 ${sec%60} 秒`;return `${Math.floor(sec/3600)} 小時 ${Math.floor(sec%3600/60)} 分`;}
export class ActivityState {
 constructor(now){this.now=now;this.reset();}
 reset(){this.observingSince=this.now();this.last=null;this.actionSince=this.observingSince;this.phase='idle';this.tools=new Map();this.overflow=false;this.prompts=0;this.failed=false;this.mode=null;this.modeSince=this.observingSince;}
 touch(){this.last=this.now();}
 event(type,event={}){
  switch(type){
   case 'before_agent_start':this.failed=false;this.touch();break;
   case 'agent_start':case 'turn_start':this.phase=this.failed?'recovery':'model';this.actionSince=this.now();this.touch();break;
   case 'message_start':if(event.message?.role==='assistant'){this.phase=this.failed?'recovery':'model';this.touch();}break;
   case 'message_update':{
    const e=event.assistantMessageEvent;
    if(['text_delta','thinking_delta','toolcall_delta'].includes(e?.type)&&typeof e.delta==='string'&&e.delta.length){this.touch();this.failed=false;this.phase='model';}break;
   }
   case 'message_end':if(event.message?.role==='assistant'){this.touch();this.failed=event.message.stopReason==='error';this.phase=this.failed?'recovery':'settling';this.actionSince=this.now();}break;
   case 'tool_execution_start':
    if(typeof event.toolCallId==='string'&&event.toolCallId.length<=512){
     if(this.tools.size<512)this.tools.set(event.toolCallId,{since:this.now(),label:toolLabels[event.toolName]??'執行工具'});else this.overflow=true;
    }else this.overflow=true;
    this.touch();break;
   case 'tool_execution_update':this.touch();break;
   case 'tool_execution_end':this.tools.delete(event.toolCallId);this.touch();if(!this.tools.size){this.phase='settling';this.actionSince=this.now();}break;
   case 'ui_prompt_start':this.prompts++;this.touch();break;
   case 'ui_prompt_end':this.prompts=Math.max(0,this.prompts-1);this.touch();break;
   case 'session_before_compact':this.phase='compacting';this.actionSince=this.now();this.touch();break;
   case 'session_compact':case 'session_compact_failed':this.phase='settling';this.actionSince=this.now();this.touch();break;
   case 'agent_end':this.phase=this.failed?'recovery':'settling';this.actionSince=this.now();this.touch();break;
   case 'agent_settled':this.tools.clear();this.overflow=false;this.phase='idle';this.actionSince=this.now();this.touch();break;
  }
 }
 snapshot({idle=true,pending=false,goal={mode:'none'}}={}){
  const now=this.now(),ago=this.last===null?null:Math.max(0,now-this.last);
  let mode,label,actionSince=this.actionSince;
  if(this.prompts){mode='waiting';label='等待操作';}
  else if(goal.mode==='active'&&goal.waiting){mode='waiting';label='Goal 等待';}
  else if(this.tools.size||this.overflow){mode='tool';label=this.tools.size===1&&!this.overflow?[...this.tools.values()][0].label:`執行工具 ×${this.overflow?'多個':this.tools.size}`;actionSince=Math.min(...[...this.tools.values()].map(t=>t.since),now);}
  else if(idle&&!pending&&goal.mode!=='active'){mode='idle';label=goal.mode==='unknown'?'閒置（Goal 狀態未知）':'已閒置';}
  else if(this.phase==='compacting'){mode='compacting';label='整理上下文';}
  else if(this.phase==='recovery'){mode='recovery';label='等待恢復／再次請求';}
  else if(idle&&goal.mode==='active'){mode='continuation';label='Goal 等待接續';}
  else if(this.phase==='model'){mode='model';label='模型執行中';}
  else{mode='settling';label=pending?'等待佇列／收尾':'執行／收尾中';}
  if(mode!==this.mode){this.mode=mode;this.modeSince=now;}
  if(mode==='waiting'||mode==='idle'||mode==='continuation')actionSince=this.modeSince;
  return {version:VERSION,mode,label,last_activity_ago_ms:ago,action_elapsed_ms:Math.max(0,now-actionSince),observing_elapsed_ms:Math.max(0,now-this.observingSince),tool_count:this.tools.size,tracking_incomplete:this.overflow,warning:goal.mode!=='unknown'&&!['idle','waiting'].includes(mode)&&ago!==null&&ago>=STALE_MS};
 }
}
export function row(snapshot){
 const last=snapshot.last_activity_ago_ms===null?'載入後尚無活動紀錄':`最後活動 ${duration(snapshot.last_activity_ago_ms)}前`;
 const elapsed=`${snapshot.mode==='idle'?'閒置':'目前動作'} ${duration(snapshot.action_elapsed_ms)}`;
 return `活動｜${snapshot.warning?'注意：久未活動（不代表當機）｜':''}${snapshot.label}｜${last}｜${elapsed}`;
}
