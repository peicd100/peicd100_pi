import {createFooterProjection} from './footer_v0.15.0.mjs';
// The SDK mounts the SAME flat public children in regular/fullscreen modes,
// then sets a viewport layout reusing them. Do not read protected/private
// mounted-root/primary-scroll getters. Foreign wrappers are never replaced.
export function locateNativeFooter(root,deps){
 try{
  const {Container,FooterComponent}=deps;
  if(typeof Container!=='function'||typeof FooterComponent!=='function'||!(root instanceof Container))return{reason:'unsupported-root'};
  if(!['regular','fullscreen'].includes(root.mode))return{reason:'unknown-tui-mode'};
  const parent=root.children.at(-1),native=parent?.constructor===Container&&parent.children.length===1?parent.children[0]:undefined;
  if(native?.constructor!==FooterComponent||native.render!==FooterComponent.prototype.render)return{reason:'foreign-or-unverified-footer'};
  return{reason:'ready',parent,native};
 }catch{return{reason:'unverified-footer-layout'};}
}
export function mountFooterOwner(ctx,root,deps,{revision,rows=()=>[],valid=()=>true,onLost=()=>{}}={}){
 const found=locateNativeFooter(root,deps);
 if(found.reason!=='ready')return{mounted:false,reason:found.reason};
 if(typeof ctx.ui?.setFooter!=='function'||typeof revision!=='function'||!['truncateToWidth','wrapTextWithAnsi'].every(k=>typeof deps[k]==='function'))return{mounted:false,reason:'unsupported-footer-api'};
 let component,data,active=false,stopped=false,rowState='ready';
 const scope=()=>{try{return !stopped&&valid();}catch{return false;}};
 const owned=()=>active&&found.parent.children.length===1&&found.parent.children[0]===component;
 const projection=createFooterProjection(found.native,{...deps,styleModel:s=>ctx.ui.theme?.fg?ctx.ui.theme.fg('dim',s):s},()=>revision(data));
 try{ctx.ui.setFooter((_tui,_theme,footerData)=>{
  data=footerData;projection.invalidate();active=true;
  component={
   render(width){
    if(!Number.isSafeInteger(width)||width<=0)return[];
    if(!scope())return found.native.render(width);
    let original,tail;try{original=projection.render(width);}catch{rowState='unverified-base-native-fallback';return found.native.render(width);}
    try{tail=rows(width);if(!Array.isArray(tail)||tail.some(line=>typeof line!=='string'))throw new Error('Unverified footer rows');rowState='ready';}catch{rowState='own-rows-unavailable';return original;}
    return[...original,...tail];
   },
   invalidate(){projection.invalidate();},
   dispose(){active=false;if(!stopped)try{onLost();}catch{/* foreign owner must not be interrupted */}},
  };return component;
 });}catch{return{mounted:false,reason:'footer-setter-failed'};}
 return{
  mounted:true,reason:'ready',native:found.native,owned,
  status:()=>({mounted:owned(),layout:projection.status().layout,ownRows:rowState}),
  invalidate:()=>projection.invalidate(),
  stop(){const ours=owned();stopped=true;if(!ours)return false;ctx.ui.setFooter(undefined);active=false;return true;},
 };
}
