// Human-readable timestamp only. All claims/permissions/transport/UNKNOWN and
// deadline handling remain the immutable native2.0.1 implementation.
import*as Native from'./core_v2.0.1.mjs';import{formatTaipei}from'../../../src/time_v0.17.0.mjs';export*from'./core_v2.0.1.mjs';
export function formatSendTime(date){const old=Native.formatSendTime(date),next=formatTaipei(date.getTime());return next==='時間未知'?old:next;}
function dated(payload,date){const before='時間：'+Native.formatSendTime(date),after='時間：'+formatSendTime(date),copy={...payload};for(const name of['text','content'])if(typeof copy[name]==='string')copy[name]=copy[name].replace(before,after);return copy;}
export function makePayload(event,format,sentAt=new Date()){return dated(Native.makePayload(event,format,sentAt),sentAt);}
export function deliver(store,config,event,options={}){const transport=options.transport??Native.postJson,clock=options.clock??(()=>new Date());let at;return Native.deliver(store,config,event,{...options,clock:()=>{at=clock();return at;},transport:(url,destination,key,payload,settings)=>transport(url,destination,key,dated(payload,at),settings)});}
