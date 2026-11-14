// Local-only compatibility bootstrap. Not a release, no host/private mutation.
// Legacy UI16 callers deliberately receive a UI16 CONTRACT adapter over the
// SINGLE UI17 display owner; do not instantiate two transcript coordinators.
import {readFileSync} from 'node:fs';
import * as Native from '@earendil-works/pi-coding-agent';
import * as Tui from '@earendil-works/pi-tui';
import {getDisplay} from './display_local_dynamic_20261112.mjs';
const CHANNEL='peicd100:local-focus-goal:display-bridge:20261112';
const LEGACY='peicd100:display:v0.16:acquire';
export function localFocusGoalActive(pi:any){const values=new Set();pi.events.emit(CHANNEL,{accept:(v:any)=>{if(v?.active)values.add(v);}});return values.size===1;}
export function bootstrapLocalFocusGoalDisplay(pi:any){let enabled=false;try{const m=JSON.parse(readFileSync(new URL('./local-focus-goal-enabled_20261112.json',import.meta.url),'utf8'));enabled=m.schema===1&&m.enabled===true;}catch{}if(enabled)return ensureLocalFocusGoalDisplay(pi);}
export function ensureLocalFocusGoalDisplay(pi:any){
 const known=new Set<any>();pi.events.emit(CHANNEL,{accept:(v:any)=>{if(v?.active)known.add(v);}});
 if(known.size>1)throw Error('本機 Focus/Goal 相容顯示 owner 不唯一。');
 if(known.size===1)return [...known][0];
 const old=new Set();pi.events.emit(LEGACY,{accept:(v:any)=>{if(v&&!v.disposed)old.add(v);}});
 if(old.size)throw Error('舊顯示層已先載入；本機 Focus/Goal 需要套件第一入口 bootstrap，未疊加顯示層。');
 const display=getDisplay(pi,{...Native,...Tui}),methods=new Map();
 const legacy=new Proxy(display,{get(target:any,key){if(key==='serviceVersion')return'0.16.0';if(key==='compatibilitySource')return'local UI16 contract -> UI17 owner';const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;if(!methods.has(key))methods.set(key,value.bind(target));return methods.get(key);}});
 const receipt={active:true,display,legacy,kind:'local-single-display-contract-adapter'};
 pi.events.on(LEGACY,(q:any)=>{if(receipt.active&&!display.disposed&&typeof q?.accept==='function')q.accept(legacy);});
 pi.events.on(CHANNEL,(q:any)=>{if(receipt.active&&typeof q?.accept==='function')q.accept(receipt);});
 pi.on('session_shutdown',()=>{receipt.active=false;methods.clear();});
 return receipt;
}
