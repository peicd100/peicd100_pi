import{randomUUID}from'node:crypto';
// Preserve host effective editor settings/IME/layout. Observe cancel only while
// the exact native editor opened by this call owns public TUI focus. No render,
// method/prototype replacement, private field, global key injection or second editor.
export async function guardNativeEditor(ctx,native,args,deps,{valid=()=>true,owned}={}){
 const ui=ctx.ui,key='peicd100-editor-guard-'+randomUUID();let tui,target,field,initial,unsubscribe,stopped=false,asking=false,resolveScope;
 const current=()=>{try{return !stopped&&valid();}catch{return false;}};
 const focused=()=>{try{return tui?.getFocusedComponent?.();}catch{return undefined;}};
 const read=()=>field.getExpandedText();
 const scopeClosed=new Promise(resolve=>{resolveScope=resolve;});
 const clean=()=>{if(stopped)return;stopped=true;try{if(typeof unsubscribe==='function')unsubscribe();}finally{try{ui.setWidget(key,undefined);}finally{owned?.delete(clean);resolveScope(undefined);}}};
 const warn=text=>{if(current())try{ui.notify(text,'warning');}catch{}};
 try{
  owned?.add(clean);
  try{ui.setWidget(key,(host)=>{tui=host;return{render:()=>[],invalidate(){},dispose:clean};});}
  catch{try{clean();}catch{}return native(...args);}
  const pending=Promise.race([native(...args),scopeClosed]);
  if(!current()){await pending;return undefined;}
  target=focused();
  if(typeof deps.ExtensionEditorComponent==='function'&&target?.constructor===deps.ExtensionEditorComponent&&Array.isArray(target.children)){
   const fields=target.children.filter(node=>node?.constructor===deps.Editor&&typeof node.getExpandedText==='function');if(fields.length===1)field=fields[0];
  }
  if(!field||typeof ui.onTerminalInput!=='function'||typeof deps.getKeybindings!=='function')warn('此編輯器無法驗證草稿保護，保留原生編輯與取消流程，不新增外點關閉。');
  else{
   initial=read();
   unsubscribe=ui.onTerminalInput(data=>{
    if(!current()||focused()!==target||!deps.getKeybindings().matches(data,'tui.select.cancel')||read()===initial)return;
    if(asking)return{consume:true};
    if((tui.terminal?.columns??0)<24||(tui.terminal?.rows??0)<8){warn('內容尚未儲存，請放大視窗後確認是否放棄。');return{consume:true};}
    asking=true;const draft=read();
    void(async()=>{
     try{
      const yes=await ui.confirm('放棄未儲存的輸入？','取消會保留目前文字；只有明確確認才會關閉，不會替你提交設定或撤回已送出的工作。');
      if(yes!==true||!current()||focused()!==target)return;
      if(read()!==draft||!deps.getKeybindings().matches(data,'tui.select.cancel')){warn('輸入或快捷鍵在確認期間變更，已保留草稿。');return;}
      // Public method on the SAME component; the native onCancel callback owns
      // its original dialog/promise lifecycle. Do not inject into global TUI.
      target.handleInput(data);
     }catch{warn('無法確認放棄，已保留草稿。');}finally{asking=false;}
    })();
    return{consume:true};
   });
  }
  const result=await pending;return current()?result:undefined;
 }finally{clean();}
}
