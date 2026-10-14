// All first-party slash commands MUST use this adapter; no bare aliases.
export const COMMAND_SUFFIX='(piecd100)';
export function commandName(name){if(typeof name!=='string'||!/^[a-z][a-z0-9-]*$/.test(name))throw new Error('Invalid owned command name.');return ['context','suffix'].includes(name)?name+'(peicd100)':name+COMMAND_SUFFIX;}
export function commandText(text,names=[]){if(typeof text!=='string'||/^\s*[\[{]/.test(text))return text;const owned=Array.isArray(names)?names.filter(n=>/^[a-z][a-z0-9-]*$/.test(n)):[];const pattern=new RegExp('(?<![\\w./\\]-])\\/('+[...owned,'acm-[a-z0-9-]+','notify(?:-[a-z0-9-]+)?','webhook(?:-[a-z0-9-]+)?','pi-theme','pi-activity'].join('|')+')(?![\\w(./-])','g');return text.replace(pattern,(_,name)=>'/'+commandName(name==='acm-analysis'?name:/^acm-/.test(name)?'acm':/^notify-/.test(name)?'notify':name));}
// Preserve the real contexts/lifecycle and public methods. Only UI text and
// owned command routing change; nothing is appended to model context.
export function namespaceAPI(api){
 const names=new Map(),contexts=new WeakMap(),text=value=>commandText(value,[...names.values()]);
 const context=ctx=>{if(!ctx||typeof ctx!=='object')return ctx;if(contexts.has(ctx))return contexts.get(ctx);let ui;
  const wrapped=new Proxy(ctx,{get(target,key){if(key==='ui'){if(!ui&&target.ui)ui=new Proxy(target.ui,{get(owner,prop){const value=Reflect.get(owner,prop,owner);if(typeof value!=='function')return value;if(['notify','select','confirm','input','editor'].includes(prop))return(...args)=>{const converted=args.map(x=>typeof x==='string'?text(x):Array.isArray(x)?x.map(item=>text(item)):x),result=value.apply(owner,converted);if(prop!=='select'||!Array.isArray(args[1]))return result;return Promise.resolve(result).then(choice=>{const index=converted[1].indexOf(choice);return index<0?choice:args[1][index];});};return value.bind(owner);}});return ui;}const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});contexts.set(ctx,wrapped);return wrapped;};
 return new Proxy(api,{get(target,key){
  if(key==='registerCommand')return(name,options)=>{const actual=commandName(name);names.set(actual,name);return target.registerCommand(actual,{...options,description:text(options.description??'')+' '+(['context','suffix'].includes(name)?'(peicd100)':COMMAND_SUFFIX),handler:(args,ctx)=>options.handler(args,context(ctx))});};
  if(key==='getCommands')return()=>target.getCommands().map(c=>names.has(c.name)?{...c,name:names.get(c.name)}:c);
  if(key==='sendUserMessage')return(value,...rest)=>target.sendUserMessage(text(value),...rest);
  if(key==='on')return(type,handler)=>target.on(type,(event,ctx)=>handler(event,context(ctx)));
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 }});
}
