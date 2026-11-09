import * as Tui from '@earendil-works/pi-tui';
import * as Native from '@earendil-works/pi-coding-agent';
import {scopedMenuAPI,showDetails} from './menu_v0.15.0.mjs';
import {getDisplay} from './display_v0.15.0.mjs';
const deps={...Native,...Tui,copyToClipboard:Native.copyToClipboard},wrapped=new WeakMap<object,any>();
export function withMouseMenus(pi:any){getDisplay(pi,deps);let value=wrapped.get(pi);if(!value){value=scopedMenuAPI(pi,deps);wrapped.set(pi,value);}return value;}
export function displayFor(pi:any){return getDisplay(pi,deps);}
// Explicit user-requested information only; ordinary notify()/stream/progress
// stays native and never automatically opens a dialog.
export function showInfo(ctx:any,title:string,body:string){return showDetails(ctx,{title,body},deps);}
export function showComponentDetails(ctx:any,title:string,source:any,revision:()=>unknown,valid?:()=>boolean){return showDetails(ctx,{title,source,revision,valid},deps);}
