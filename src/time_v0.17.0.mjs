// Display-only wall clock. Never schedule/wake a Goal, poll a provider, infer
// an UNKNOWN deadline, or report model execution from a planned timestamp.
const formatter=new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',weekday:'long',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const time=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=8640000000000000;
export function formatTaipei(value){if(!time(value))return'時間未知';try{const parts=Object.fromEntries(formatter.formatToParts(value).map(p=>[p.type,p.value]));return`${parts.year}/${parts.month}/${parts.day}（${parts.weekday}）${parts.hour}:${parts.minute}:${parts.second} UTC+8`;}catch{return'時間未知';}}
export function goalWaitLabel(goal,now=Date.now()){
 if(goal?.status!=='active'||!goal.waiting)return'';const at=goal.waiting.resumeAt;
 if(goal.waiting.kind!=='external'||!time(at)||!time(now))return'Goal等待｜恢復時間未定';
 const prefix='預定恢復 '+formatTaipei(at);if(at<=now)return prefix+'｜已到預定時間；實際恢復待確認';
 const seconds=Math.ceil((at-now)/1000),h=Math.floor(seconds/3600),m=Math.floor(seconds%3600/60),s=seconds%60;
 return prefix+'｜剩餘 '+(h?`${h}時 `:'')+(h||m?`${m}分 `:'')+s+'秒';
}
export function clearedWaitLabel(previous,current){if(previous?.status!=='active'||!previous.waiting||typeof previous.id!=='string'||!previous.id||!Number.isSafeInteger(previous.revision)||previous.revision<1||!time(previous.updatedAt)||current?.status!=='active'||current.waiting!==null||previous.id!==current.id||!Number.isSafeInteger(current.revision)||current.revision<=previous.revision||!time(current.updatedAt)||current.updatedAt<previous.updatedAt)return'';return'Goal已解除等待 '+formatTaipei(current.updatedAt)+'（狀態時間；不是模型請求已送出證據）';}
