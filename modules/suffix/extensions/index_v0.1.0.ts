import type {ExtensionAPI,ExtensionContext} from '@earendil-works/pi-coding-agent';
import {getAgentDir} from '@earendil-works/pi-coding-agent';
import {namespaceAPI} from '../../../src/commands_v0.11.0.mjs';
import {SuffixStore,POLICY_TYPE,readPolicy,composeInput,validateConfig} from '../src/core_v0.1.0.mjs';
export default function suffix(pi:ExtensionAPI){
 pi=namespaceAPI(pi);const store=new SuffixStore(getAgentDir());let active=false,epoch=0;
 const invalidate=()=>{epoch++;};
 const identity=(ctx:ExtensionContext)=>JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd,ctx.sessionManager.getLeafId?.()]);
 const ensure=(ctx:ExtensionContext)=>{
  const saved=readPolicy(ctx.sessionManager.getBranch());if(saved)return saved;
  const snapshot=store.read().config;const policy={version:1,enabled:snapshot.defaultEnabled,defaultEnabled:snapshot.defaultEnabled,origin:'default'};
  pi.appendEntry(POLICY_TYPE,policy);const result=readPolicy(ctx.sessionManager.getBranch());if(!result)throw new Error('後綴開關未能保存在對話；未套用。');return result;
 };
 for(const event of ['session_start','session_tree'] as const)pi.on(event,(_event,ctx)=>{invalidate();try{ensure(ctx);}catch{ctx.ui.notify('後綴開關或設定無法驗證；請檢查 /suffix 設定。','warning');}});
 pi.on('session_shutdown',invalidate);
 pi.on('input',(event,ctx)=>{
  if(!['interactive','rpc'].includes(event.source)||!event.text.trim()||/^\s*[\/!]/u.test(event.text))return {action:'continue'};
  try{const p=ensure(ctx);if(!p.enabled)return {action:'continue'};return composeInput(event,p.enabled,store.read().config.text);}catch{ctx.ui.notify('後綴設定無法驗證或內容為空；此次提示未送出，請先 /suffix 設定或停用。','warning');return {action:'handled'};}
 });
 pi.registerCommand('suffix',{description:'中文後綴主選單：本對話開關、共用後綴、新對話預設、預覽與狀態；[on|off|status|json]',handler:async(args,ctx)=>{
  if(active){ctx.ui.notify('後綴選單已開啟，請先完成或取消。','warning');return;}
  active=true;
  try{
   const action=args.trim();if(action&&!['on','off','status','json'].includes(action)){ctx.ui.notify('用法：/suffix [on|off|status|json]；內容請用選單編輯。','warning');return;}
   const p=ensure(ctx);
   // Explicit off never needs valid shared content; keep a safe escape hatch.
   if(action==='off'){if(p.enabled)pi.appendEntry(POLICY_TYPE,{...p,enabled:false,origin:'explicit'});ctx.ui.notify('本對話後綴已停用；共用內容不變。','info');return;}
   const s=store.read(),key=identity(ctx),start=epoch;
   const guard=()=>{if(start!==epoch||identity(ctx)!==key||JSON.stringify(readPolicy(ctx.sessionManager.getBranch()))!==JSON.stringify(p)||store.read().hash!==s.hash)throw new Error('對話、分支或設定已變更；請重新開啟選單。');};
   const onOff=(x:boolean)=>x?'啟用':'停用';
   const status=()=>ctx.ui.notify(action==='json'?JSON.stringify({version:'0.1.0',session_enabled:p.enabled,default_enabled:s.config.defaultEnabled,policy:p,suffix_text:s.config.text}):`本對話：${onOff(p.enabled)}；新對話預設：${onOff(s.config.defaultEnabled)}\n共用後綴：${s.config.text||'（尚未設定）'}\n共用內容修改只影響後續提交的提示；佇列保留提交時內容。`,'info');
   if(action==='status'||action==='json'){status();return;}
   let selected=action==='on'?0:action==='off'?0:-1;
   if(!action){
    if(ctx.mode!=='tui'){status();return;}
    const labels=[`切換本對話是否啟用（目前：${onOff(p.enabled)}）`,'編輯共用後綴提示詞',`新對話預設是否啟用（目前：${onOff(s.config.defaultEnabled)}）`,'預覽後綴與組合效果','查看目前設定','取消'];
    const picked=await ctx.ui.select('後綴提示詞主選單\n共用一份內容；修改只影響已啟用對話的後續提示，不改舊訊息。',labels);if(!picked)return;guard();selected=labels.indexOf(picked);
   }
   if(selected===0){const enabled=action?action==='on':!p.enabled;if(enabled&&!s.config.text.trim()){ctx.ui.notify('請先編輯非空後綴提示詞，尚未啟用。','warning');return;}guard();if(enabled===p.enabled)return;pi.appendEntry(POLICY_TYPE,{...p,enabled,origin:'explicit'});if(readPolicy(ctx.sessionManager.getBranch())?.enabled!==enabled)throw new Error('開關未保存。');ctx.ui.notify(`本對話後綴已${onOff(enabled)}；後續提示生效，舊訊息不變。`,'info');return;}
   if(selected===1){
    const text=await ctx.ui.editor('編輯共用後綴（最多32 KiB；取消不改。請勿填入秘密）',s.config.text);if(text===undefined)return;guard();const config=validateConfig({...s.config,text});
    if(JSON.stringify(config)===JSON.stringify(s.config))return;
    if(!await ctx.ui.confirm('保存共用後綴？','將影響所有已啟用對話的後續提示；不改舊訊息、已提交佇列或開關。內容為空時，已啟用對話會要求重新設定。'))return;guard();await store.save(config,s.hash,guard);ctx.ui.notify('共用後綴已保存；後續提交生效。','info');return;
   }
   if(selected===2){const labels=['啟用','停用'];const picked=await ctx.ui.select(`新對話預設（目前：${onOff(s.config.defaultEnabled)}；既有對話與分支開關不變）`,labels);if(!labels.includes(picked as string))return;guard();const enabled=picked===labels[0];if(enabled&&!s.config.text.trim()){ctx.ui.notify('請先設定非空後綴；預設未變更。','warning');return;}if(enabled!==s.config.defaultEnabled)await store.save({...s.config,defaultEnabled:enabled},s.hash,guard);ctx.ui.notify('新對話預設已保存；既有對話不變。','info');return;}
   if(selected===3){const sample=await ctx.ui.input('輸入示例提示（只預覽，不會送模型）','示例提示');if(sample===undefined)return;guard();ctx.ui.notify(`後綴內容：\n${s.config.text||'（空）'}\n\n啟用時組合：\n${sample}\n\n${s.config.text}\n\n本對話目前${onOff(p.enabled)}；一般提示只追加一次。`,'info');return;}
   if(selected===4)status();
  }catch{ctx.ui.notify('後綴操作未成功；請檢查設定格式、權限或是否已切換對話，未覆寫其他變更。','warning');}finally{active=false;}
 }});
}
