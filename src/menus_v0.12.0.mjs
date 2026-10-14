import {commandName} from './commands_v0.11.0.mjs';
// Capture internal handlers WITHOUT exposing the removed slash commands.
export function commandRouter(api,allowed){
 const commands=new Map();const wrapped=new Proxy(api,{get(target,key){
  if(key==='registerCommand')return(name,options)=>{const raw=name.replace(/\((?:piecd100|peicd100)\)$/,'');commands.set(raw,options);if(allowed.includes(raw))return target.registerCommand(name,options);};
  if(key==='getCommands')return()=>target.getCommands();
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});return {api:wrapped,commands};
}
export function deprecatedInputGuard(pi,names,main){
 const exact=new Set([...names,...names.map(commandName)]);pi.on('input',(event,ctx)=>{
  const match=/^\s*\/([^\s]+)(?:\s|$)/u.exec(event.text);if(!match||!exact.has(match[1]))return {action:'continue'};
  ctx.ui.notify(`此快捷入口已移除；請使用 /${commandName(main)} 中文主選單。`,'warning');return {action:'handled'};
 });
}
