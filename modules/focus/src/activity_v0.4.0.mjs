// Local observed phase time only. No provider telemetry, session writes, network,
// timers or tool execution. Missing observations never become fabricated starts.
import {performance} from 'node:perf_hooks';
export function thinkingOrdinal(message,index){
 const content=message?.content;if(!Array.isArray(content)||!Number.isSafeInteger(index)||index<0||index>=content.length||content[index]?.type!=='thinking')return undefined;
 let ordinal=0;for(let i=0;i<index;){if(content[i]?.type!=='thinking'){i++;continue;}let visible=false;while(i<index&&content[i]?.type==='thinking'){visible||=typeof content[i].thinking==='string'&&!!content[i].thinking.trim();i++;}if(i>index)return ordinal;if(i===index&&content[index-1]?.type==='thinking')return ordinal;if(visible)ordinal++;}return ordinal;
}
export class ObservedActivity{
 constructor({now=()=>performance.now()}={}){this.now=now;this.reset();}
 reset(){this.tools=new Map();this.live=new Set();this.assistant=undefined;this.last=undefined;}
 time(){const n=this.now();if(!Number.isFinite(n)||n<0)return undefined;this.last=Math.max(this.last??n,n);return this.last;}
 start(kind,label){const record={kind,label,start:this.time(),end:undefined,closed:false};if(record.start!==undefined)this.live.add(record);return record;}
 close(record){if(record&&!record.closed){record.end=this.time();record.closed=true;this.live.delete(record);}}
 startTool(id,label){if(typeof id!=='string'||!id)return;let value=this.tools.get(id);if(!value){value=this.start('tool',String(label??'工具'));this.tools.set(id,value);}return value;}
 endTool(id){const value=this.tools.get(id);this.close(value);return value;}
 beginAssistant(){this.endAssistant();this.assistant={runs:new Map(),active:undefined,closed:false};return this.assistant;}
 thinking(message,index,phase){const ordinal=thinkingOrdinal(message,index),a=this.assistant;if(ordinal===undefined||!a||a.closed)return;
  let record=a.runs.get(ordinal);if(!record){if(phase==='end')return;record=this.start('thinking','本機思考階段');a.runs.set(ordinal,record);}
  if(a.active&&a.active!==record)this.close(a.active);a.active=record;if(phase==='end'){this.close(record);a.active=undefined;}return record;
 }
 endThinking(){if(this.assistant){this.close(this.assistant.active);this.assistant.active=undefined;}}
 endAssistant(){if(this.assistant){this.endThinking();this.assistant.closed=true;}}
 summary(records){
  const now=this.time(),current=records.filter(r=>r&&r.start!==undefined&&!r.closed),known=records.length>0&&records.every(r=>r&&r.start!==undefined&&(r.closed?r.end!==undefined:now!==undefined));
  let earliest=Infinity,latest=-Infinity;if(known)for(const record of records){earliest=Math.min(earliest,record.start);latest=Math.max(latest,record.end??now);}const wallMs=known?Math.max(0,latest-earliest):undefined;
  return{current:current.map(r=>({kind:r.kind,label:r.label,elapsedMs:now===undefined?undefined:Math.max(0,now-r.start)})),wallMs,unknown:records.filter(r=>!r||r.start===undefined).length};
 }
 get running(){return this.live.size>0;}
}
