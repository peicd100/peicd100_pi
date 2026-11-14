// Fixed one-line summary. Details remain available without changing the list,
// Goal or display preferences. Native width helpers preserve CJK/ANSI cells.
import {validateProgress} from './state_v0.1.0.mjs';
import {names,clean} from './display_v0.2.0.mjs';
export {names,clean};
export class ProgressView{
 constructor(state,{truncate,visibleWidth,fg=(_tone,s)=>s,goalComplete=false,onDetails}={}){validateProgress(state);if(typeof truncate!=='function'||typeof visibleWidth!=='function')throw Error('Native Progress width API unavailable');Object.assign(this,{state,truncate,visibleWidth,fg,onDetails});this.done=state.steps.filter(s=>s.status==='completed').length;this.blocked=state.steps.filter(s=>s.status==='blocked').length;this.active=state.steps.findIndex(s=>s.status==='in_progress');this.allDone=state.steps.length>0&&this.done===state.steps.length;this.anomaly=goalComplete&&!this.allDone&&state.steps.length>0;this.header=`Progress｜${this.done}/${state.steps.length}${this.anomaly?'｜異常：Goal已完成但步驟未完':''}${this.blocked?`｜受阻${this.blocked}`:''}${this.active>=0?`｜執行中 ${this.active+1}：${clean(state.steps[this.active].text)}`:''}`;this.hitWidth=0;this.dragged=false;}
 hidden(){return!this.state.enabled||!this.state.steps.length||this.allDone;}
 render(width){this.hitWidth=0;if(!Number.isSafeInteger(width)||width<1||this.hidden())return[];const line=this.truncate(this.fg(this.anomaly?'error':this.blocked?'warning':'muted',this.header),width,'');this.hitWidth=Math.min(width,this.visibleWidth(line));return[line];}
 handleMouse(e){if(e.type==='press')this.dragged=false;if(e.type==='drag')this.dragged=true;if(e.type!=='click')return;const drag=this.dragged;this.dragged=false;if(drag||e.button!=='left'||e.shift||e.ctrl||e.alt||e.y!==0||!Number.isSafeInteger(e.x)||e.x<0||e.x>=this.hitWidth||typeof this.onDetails!=='function')return;this.onDetails();return{handled:true};}
 details(){return`${this.state.goalId?'關聯Goal：'+clean(this.state.goalId):'獨立清單'}\nrevision ${this.state.revision}｜${this.done}/${this.state.steps.length}完成\n${this.anomaly?'異常：Goal已完成，關聯Progress仍有未完成項。\n':''}`+this.state.steps.map((s,i)=>`${i+1}. [${names[s.status]}] ${clean(s.text)}`).join('\n')+'\nProgress僅回報步驟，不代表Goal已驗收。';}
 invalidate(){this.hitWidth=0;}
}
