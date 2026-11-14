// First-party public component layout only; never read a native private field.
export function assistantParts(node,deps){
 const {Container,AssistantMessageComponent,Markdown,MouseRegion,Spacer,Text}=deps;
 if(![Container,AssistantMessageComponent,Markdown,MouseRegion,Spacer,Text].every(c=>typeof c==='function')||node?.constructor!==AssistantMessageComponent)return {supported:false,reason:'unsupported-native-component'};
 try{
  if(node.children.length!==1||node.children[0]?.constructor!==Container)return {supported:false,reason:'unknown-assistant-layout'};
  const content=node.children[0],parts=[];
  for(let i=0;i<content.children.length;i++){
   const child=content.children[i],kind=child?.constructor===Markdown?'body':child?.constructor===MouseRegion?'thinking':child?.constructor===Spacer?'spacing':child?.constructor===Text?'notice':undefined;
   if(!kind)return {supported:false,reason:'unknown-assistant-child'};
   parts.push({node:child,kind,index:i});
  }
  return {supported:true,content,parts};
 }catch{return {supported:false,reason:'unverified-assistant-layout'};}
}
export function probeAssistantParts(deps){
 try{
  const sample=new deps.AssistantMessageComponent({content:[{type:'thinking',thinking:'Ordinary report-looking fixture'},{type:'text',text:'thinking-looking normal body'},{type:'thinking',thinking:'Another fixture'},{type:'text',text:'好'}],stopReason:'stop'});
  const result=assistantParts(sample,deps);
  return result.supported&&result.parts.filter(p=>p.kind!=='spacing').map(p=>p.kind).join(',')==='thinking,body,thinking,body';
 }catch{return false;}
}
export function createAssistantProjection(node,deps,project,{verified=probeAssistantParts(deps)}={}){
 let stopped=false,layout=verified?'not-rendered':'unsupported-native-fallback';
 const run=(width,phase,action)=>{
  if(stopped||!verified)return action();
  const inspected=assistantParts(node,deps);if(!inspected.supported){layout=inspected.reason+'-native-fallback';return action();}
  let projected;
  try{
   projected=inspected.parts.map(part=>{
    if(part.kind==='notice'||part.kind==='spacing')return part.node;
    const child=project(part,{width,phase});
    // Body may only remain native or be decorated by an actual native Box
    // containing that same native Markdown. Never silently filter a short body.
    if(part.kind==='body'&&child!==part.node&&!(typeof deps.Box==='function'&&child?.constructor===deps.Box&&child.children?.length===1&&child.children[0]===part.node))throw new Error('Body must stay native');
    return child;
   });
   if(projected.some(child=>!child||typeof child.render!=='function'))throw new Error('Unverified child projection');
  }catch{layout='unverified-projection-native-fallback';return action();}
  const {content}=inspected,before=content.children;content.children=projected;
  try{layout='ready';return action();}
  finally{
   // Native mouse handlers may legitimately rebuild their own children. Keep
   // that new array; never restore an older UI snapshot over a native update.
   if(content.children===projected)content.children=before;
   else layout='native-update-preserved';
  }
 };
 return {
  supported:verified,
  render:width=>width<=0?[]:run(width,'render',()=>node.render(width)),
  handleMouse:event=>run(event.width,'mouse',()=>node.handleMouse?.(event)),
  invalidate:()=>node.invalidate(),
  status:()=>({supported:verified,layout}),
  stop:()=>{stopped=true;},
 };
}
