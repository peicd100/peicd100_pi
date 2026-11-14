// Controlled Goal0.7 entry. No real credentials/provider/transport.
import{createGoalExtension}from'../../modules/goal/extensions/index_v0.7.0.ts';
export default function fixture(pi:any){const state:any={};state.owner=createGoalExtension(pi,{controlClock:()=>typeof state.clock==='function'?state.clock():Date.now()});pi.events.on('fixture:goal070-owner',(q:any)=>q?.respond?.(state));}
