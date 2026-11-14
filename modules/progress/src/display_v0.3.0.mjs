import{validateProgress}from'./state_v0.1.0.mjs';
export{ViewPreference,names,clean}from'./display_v0.2.0.mjs';
import{names,clean}from'./display_v0.2.0.mjs';
export const PROGRESS_VIEW_ENTRY='peicd100:progress-view-state';
const modes=new Set(['detailed','compact','hidden']);
export function readView(entries,sessionId,fallback='detailed'){
 if(!modes.has(fallback))throw Error('Progress default view unknown');
 for(let i=(entries?.length??0)-1;i>=0;i--){const e=entries[i];if(e.type!=='custom'||e.customType!==PROGRESS_VIEW_ENTRY)continue;const s=e.data;if(!s||s.schema!==1||typeof s.sessionId!=='string'||!Number.isSafeInteger(s.revision)||s.revision<1||!modes.has(s.mode)||Object.keys(s).some(k=>!['schema','sessionId','revision','mode'].includes(k)))throw Error('Progress current view invalid');if(s.sessionId===sessionId)return structuredClone(s);break;}
 return{schema:1,sessionId,revision:0,mode:fallback};
}
export function changeView(state,mode,revision){if(!state||!modes.has(state.mode)||!modes.has(mode)||revision!==state.revision||!Number.isSafeInteger(revision))throw Error('Progress view changed; reload current selection');return{schema:1,sessionId:state.sessionId,revision:revision+1,mode};}
export class ProgressView{
 constructor(state,{truncate,visibleWidth,fg=(_tone,s)=>s,mode='detailed',goalComplete=false,onToggle,onDetails}={}){
  validateProgress(state);if(typeof truncate!=='function'||typeof visibleWidth!=='function'||!modes.has(mode))throw Error('Progress public view capability unavailable');
  Object.assign(this,{state,truncate,visibleWidth,fg,mode,onToggle,onDetails});this.done=state.steps.filter(s=>s.status==='completed').length;this.blocked=state.steps.filter(s=>s.status==='blocked').length;this.active=state.steps.findIndex(s=>s.status==='in_progress');this.allDone=state.steps.length>0&&this.done===state.steps.length;this.anomaly=!!goalComplete&&!this.allDone&&state.steps.length>0;this.cache=undefined;this.hits=[];
  this.header=`Progress｜${this.done}/${state.steps.length}${this.anomaly?'｜Goal已完成但仍有未完步驟':''}${this.blocked?`｜受阻${this.blocked}`:''}${this.active>=0?`｜執行中 ${this.active+1}：${clean(state.steps[this.active].text)}`:''}`;
 }
 hidden(){return!this.state.enabled||!this.state.steps.length||this.allDone||this.mode==='hidden'&&!this.blocked&&!this.anomaly;}
 render(width,height=18,theme){if(width<=0||this.hidden()){this.hits=[];return[];}const compact=this.mode!=='detailed'||Number.isFinite(height)&&height<10,key=[width,height,theme,this.mode];if(this.cache&&key.every((v,i)=>Object.is(v,this.cache.key[i])))return this.cache.lines;
  const labels=width>=44?[[compact?'[展開]':'[收合]','toggle'],['[完整]','details']]:width>=24?[[compact?'[+]':'[-]','toggle'],['[詳]','details']]:width>=14?[[compact?'[+]':'[-]','toggle']]:[],buttons=labels.map(x=>x[0]).join(' '),buttonWidth=this.visibleWidth(buttons),available=Math.max(0,width-buttonWidth-(buttons?1:0)),prefix=this.truncate(this.fg(this.anomaly?'error':this.blocked?'warning':'muted',this.header),available,'');
  const gap=Math.max(0,width-this.visibleWidth(prefix)-buttonWidth),lines=[prefix+' '.repeat(gap)+labels.map(x=>this.fg('accent',x[0])).join(' ')];this.hits=[];let x=width-buttonWidth;for(const[label,action]of labels){this.hits.push({left:x,right:x+this.visibleWidth(label),action});x+=this.visibleWidth(label)+1;}
  const budget=compact?1:Math.max(1,Math.min(6,Math.floor((Number.isFinite(height)?height:18)/3))),slots=Math.max(0,budget-2),chosen=new Set();if(this.active>=0&&slots)chosen.add(this.active);for(let i=0;i<this.state.steps.length&&chosen.size<slots;i++)if(this.state.steps[i].status==='blocked')chosen.add(i);for(let i=0;i<this.state.steps.length&&chosen.size<slots;i++)chosen.add(i);
  for(const i of [...chosen].sort((a,b)=>a-b)){const s=this.state.steps[i];lines.push(this.truncate(this.fg(s.status==='blocked'?'warning':s.status==='in_progress'?'accent':'muted',`${i+1}. [${names[s.status]}] ${clean(s.text)}`),width,''));}
  if(!compact&&this.state.steps.length>chosen.size&&budget>1)lines.push(this.truncate(this.fg('muted',`另有${this.state.steps.length-chosen.size}步｜[完整] 或 /progress`),width,''));this.cache={key,lines};return lines;
 }
 handleMouse(event){if(event.type!=='click'||event.button!=='left'||event.y!==0||event.shift||event.alt||event.ctrl)return;const hit=this.hits.find(h=>event.x>=h.left&&event.x<h.right),fn=hit?.action==='toggle'?this.onToggle:hit?.action==='details'?this.onDetails:undefined;if(typeof fn==='function'){fn();return{handled:true};}}
 details(){return`${this.state.goalId?'關聯Goal：'+this.state.goalId:'獨立清單'}\nrevision ${this.state.revision}｜${this.done}/${this.state.steps.length}完成\n${this.anomaly?'異常：Goal已完成，關聯Progress仍有未完成項。\n':''}`+this.state.steps.map((s,i)=>`${i+1}. [${names[s.status]}] ${clean(s.text)}`).join('\n')+'\nProgress僅回報步驟，不代表Goal已驗收。';}
 invalidate(){this.cache=undefined;}
}
