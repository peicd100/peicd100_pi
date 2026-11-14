// Explicit initialization review on the SAME public native TUI. This is NOT
// a login/account/quota/card action broker and never infers historical values.
export function createPresentationReview({owner,token,ctx,deps,repaint=()=>{}}){
 if(!['confirm-default-cutover','manual-branch-baseline'].includes(token?.kind)||token.module!==owner.module)throw Error('Unknown presentation review');
 const manual=token.kind==='manual-branch-baseline',confirm='[確認 Ctrl+S]',cancel='[取消 Ctrl+X]',clean=value=>deps.stripTerminalSequences(String(value)).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' '),value=x=>typeof x==='boolean'?x?'開啟':'關閉':clean(x);
 let version=0,index=0,phase='draft',notice='',closed=false,viewport={width:0,maxHeight:0},proof,layout,dragged=false,getViewport=()=>undefined;
 const bump=()=>{version++;proof=undefined;if(!closed)repaint();},chosen=()=>manual?token.candidates[index].values:token.values;
 const ready=()=>!closed&&phase==='draft'&&owner.actionStatus(token).ready;
 const full=()=>ready()&&proof?.terminal&&JSON.stringify(getViewport())===JSON.stringify(proof.terminal)&&proof?.version===version&&layout?.scrollTop===0&&layout.bodyWidth===proof.width&&layout.bodyHeight>=proof.rows&&proof.width>=Math.max(24,deps.visibleWidth(confirm+' '+cancel));
 const submit=()=>{if(!ready())return;if(!full()){notice='完整內容與確認鈕尚未同框可見；請放大視窗或回到頂端。';bump();return;}phase='committing';notice='已送出；關閉不代表撤回，請勿重送。';bump();void owner.applyAction(token,{confirmed:true,...(manual?{values:chosen()}:{})}).then(result=>{phase=result.status;notice=result.status==='applied'?'已完成此明確初始化／時間確認；沒有重送原設定。':result.status==='rejected'?'範圍或狀態已改變，未由此確認送出。':'結果未知；不要重試原操作，請重新查看已保存狀態。';bump();},()=>{phase='unknown';notice='結果未知；不要重試原操作。';bump();});};
 const abandon=()=>{if(phase==='draft'&&owner.cancelAction(token)){phase='cancelled';notice='已取消此草稿，未送出。';bump();}else if(phase==='committing'){notice='已送出，不能假稱取消／回滾；Esc只關閉檢視。';bump();}};
 return{
  bindViewport(reader){getViewport=reader;version++;proof=undefined;},
  revision:()=>String(version)+':'+owner.actionStatus(token).phase+':'+owner.actionStatus(token).ready,
  setViewport(next){if(next.width!==viewport.width||next.maxHeight!==viewport.maxHeight){viewport=next;version++;proof=undefined;layout=undefined;}},
  render(width){proof=undefined;if(!Number.isSafeInteger(width)||width<1)return[];const rows=[manual?'只建立目前分支初值；不是歷史還原，不傳到其他舊分支。':'只確認已保存預設的生效時間；不重送值，不追改舊對話。','對話：'+clean(ctx.sessionManager.getSessionId()),manual?'←→明確選來源：'+clean(token.candidates[index].label):'準備時間：'+new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',weekday:'long',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).format(token.preparedAt)+' UTC+8',...Object.entries(chosen()).map(([name,v])=>clean(owner.labels[name]??name)+'：'+value(v)),ready()?'審閱完整內容後 Ctrl+S 確認；Enter 不送出。':phase==='draft'?'範圍／代理狀態已變更；返回後重新查看，不會猜值。':'狀態：'+phase,...(notice?[notice]:[])];const text=new deps.Text(rows.join('\n'),0,0).render(width),buttonRow=text.length,buttons=confirm+' '+cancel;text.push(deps.truncateToWidth(buttons,width,''));proof={version,width,terminal:getViewport(),rows:text.length,buttonRow,confirmWidth:deps.visibleWidth(confirm),cancelX:deps.visibleWidth(confirm)+1,cancelWidth:deps.visibleWidth(cancel)};return text;},
  panelLayout(next){layout=next;},
  navigateKey(key){if(deps.matchesKey(key,'ctrl+s')){submit();return true;}if(deps.matchesKey(key,'ctrl+x')){abandon();return true;}if(deps.matchesKey(key,'return'))return true;if(manual&&phase==='draft'&&(deps.matchesKey(key,'left')||deps.matchesKey(key,'right'))){index=(index+(deps.matchesKey(key,'right')?1:token.candidates.length-1))%token.candidates.length;notice='';bump();return true;}return false;},
  handleMouse(event){if(event.type==='press')dragged=false;if(event.type==='drag')dragged=true;if(event.type!=='click'||event.button!=='left'||dragged||event.shift||event.alt||event.ctrl||event.y!==proof?.buttonRow)return;if(event.x>=0&&event.x<proof.confirmWidth){submit();return{handled:true};}if(event.x>=proof.cancelX&&event.x<proof.cancelX+proof.cancelWidth){abandon();return{handled:true};}},
  invalidate(){proof=undefined;version++;},
  close(){if(closed)return;closed=true;owner.cancelAction(token);},
  status:()=>({phase,selected:index,ready:ready(),canApply:full(),viewport:{...viewport},proof:proof?{...proof}:undefined,layout:layout?{...layout}:undefined}),
 };
}
