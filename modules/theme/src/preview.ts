import {matchesKey,Key,truncateToWidth,parseColor} from '@earendil-works/pi-tui';
import {LABELS} from './palette_v0.1.0.mjs';

export function previewComponent(tui:any,theme:any,done:any,palette:any,signal?:AbortSignal) {
 const rows=[...Object.entries(palette.colors),...Object.entries(palette.export)],pageSize=8;let page=0,finished=false;
 const finish=()=>{if(finished)return;finished=true;signal?.removeEventListener('abort',finish);done(undefined);};
 signal?.addEventListener('abort',finish,{once:true});if(signal?.aborted)finish();
 return {
  render(width:number){
   if(width<1)return [];
   const lines=[`配色實際文字預覽（${page+1}/${Math.ceil(rows.length/pageSize)}）`,'← → 換頁；Enter 或 Escape 返回；預覽不保存設定。'];
   for(const[key,value]of rows.slice(page*pageSize,(page+1)*pageSize)){
    const background=key.endsWith('Bg')||['pageBg','cardBg','infoBg','scrollbarTrack','scrollbarThumb'].includes(key);
    const sample=background?theme.style(' 背景範例：中文 Aa 123 ',{fg:parseColor(palette.colors.text),bg:parseColor(value)}):theme.style(' 範例文字：中文 Aa 123 +新增 -刪除 ',{fg:parseColor(value)});
    lines.push(`${LABELS[key]}（${key}）：${value}`,sample);
   }
   lines.push(theme.style(' 使用者訊息：白底黑字範例 ',{fg:parseColor(palette.colors.userMessageText),bg:parseColor(palette.colors.userMessageBg)}));
   return lines.map(line=>truncateToWidth(line,width,'…'));
  },
  handleInput(data:string){if(matchesKey(data,Key.escape)||matchesKey(data,Key.enter))finish();else if(matchesKey(data,Key.right)||matchesKey(data,Key.down)){page=(page+1)%Math.ceil(rows.length/pageSize);tui.requestRender();}else if(matchesKey(data,Key.left)||matchesKey(data,Key.up)){page=(page-1+Math.ceil(rows.length/pageSize))%Math.ceil(rows.length/pageSize);tui.requestRender();}},
  invalidate(){},dispose(){signal?.removeEventListener('abort',finish);},
 };
}
