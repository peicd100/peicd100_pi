import {scopedMenuAPI,showDetails,showControlCenter} from './menu_v0.17.0.mjs';
import {getDisplay} from './display_v0.17.0.mjs';
import {getControlRegistry} from './control-registry_v0.17.0.mjs';
import {controlBindings} from './presentation-controls_v0.17.0.mjs';
import {CONTROL_SECTIONS} from './control-center_v0.17.0.mjs';
import {createPresentationReview} from './presentation-review_v0.17.0.mjs';
export function createUIService(deps){
 const wrapped=new WeakMap(),registryFor=raw=>getControlRegistry(raw,deps),displayFor=raw=>getDisplay(raw,deps);
 const showInfo=(ctx,title,body)=>showDetails(ctx,{title,body},deps);
 const showComponentDetails=(ctx,title,source,revision,valid,options={})=>showDetails(ctx,{title,source,revision,valid,initialEnd:options.initialEnd===true},deps);
 const showControlCenterFor=(raw,ctx,initialSection='diagnostics')=>{const registry=registryFor(raw),key=JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile?.()??null,ctx.cwd]);if(registry.centerRequest?.key===key)return registry.centerRequest.promise;const request={key};registry.centerRequest=request;let pending;try{pending=showControlCenter(ctx,registry.snapshot(ctx),deps,{controls:controlBindings(registry,ctx),initialSection});}catch(error){if(registry.centerRequest===request)delete registry.centerRequest;return Promise.reject(error);}request.promise=Promise.resolve(pending).finally(()=>{if(registry.centerRequest===request)delete registry.centerRequest;});return request.promise;};
 const withMouseMenus=raw=>{displayFor(raw);let value=wrapped.get(raw);if(!value){value=scopedMenuAPI(raw,deps);wrapped.set(raw,value);}const registry=registryFor(raw);if(!registry.centerRegistered){
  // Deliberate explicit /peicd100 global entry; old feature command names still
  // go through their existing namespace adapter and use this same registry/UI.
  value.registerCommand('peicd100',{description:'Pi工具箱｜單一控制中心；目前對話與新對話預設分開',handler:(args,ctx)=>showControlCenterFor(raw,ctx,CONTROL_SECTIONS.some(section=>section.id===args.trim())?args.trim():'diagnostics')});registry.centerRegistered=true;
 }return value;};
 const showInitialization=async(ctx,owner,kind,repaint)=>{if(ctx.mode!=='tui'){ctx.ui.notify('此明確初始化只提供於原生TUI；未改設定。','info');return;}let token;try{token=owner.captureAction(ctx,kind);}catch{await showInfo(ctx,'尚不能安全確認','需要閒置、無排隊、相同對話／分支／模型與已驗來源；請重新查看，不猜值也不重送。');return;}const source=createPresentationReview({owner,token,ctx,deps,repaint});try{await showComponentDetails(ctx,kind==='manual-branch-baseline'?'明確手選本分支初值（不是歷史還原）':'確認已保存預設的時間界線（不重送原設定）',source,()=>source.revision(),()=>owner.currentScope(ctx));}finally{source.close();}};
 return{withMouseMenus,registryFor,displayFor,showInfo,showComponentDetails,showControlCenterFor,showInitialization};
}
