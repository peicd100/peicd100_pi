import {analyzeBranch,assessAnalysis,formatTechnicalAnalysis} from './analysis_v1.8.0.mjs';
export {analyzeBranch,assessAnalysis,formatTechnicalAnalysis};

// Display-only: never mutate the report, inspect files, or change assessment.
const segments=new Intl.Segmenter('zh-TW',{granularity:'grapheme'});
const clean=value=>String(value??'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x1f\x7f]/g,'');
const graphemes=text=>[...segments.segment(text)].map(s=>s.segment);
const cellWidth=s=>{
 if(/\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u.test(s))return 2;
 const cp=s.codePointAt(0);
 if(/^[\p{Mark}\u200d\ufe0f]+$/u.test(s))return 0;
 return cp>=0x1100&&(cp<=0x115f||cp===0x2329||cp===0x232a||cp>=0x2e80&&cp<=0xa4cf||cp>=0xac00&&cp<=0xd7a3||cp>=0xf900&&cp<=0xfaff||cp>=0xfe10&&cp<=0xfe19||cp>=0xfe30&&cp<=0xfe6f||cp>=0xff01&&cp<=0xff60||cp>=0xffe0&&cp<=0xffe6||cp>=0x20000&&cp<=0x3fffd)?2:1;
};
export const displayWidth=text=>graphemes(clean(text)).reduce((n,s)=>n+cellWidth(s),0);
function clip(text,width){
 if(displayWidth(text)<=width)return text;
 let out='',used=0;
 for(const s of graphemes(text)){const w=cellWidth(s);if(used+w>width-1)break;out+=s;used+=w;}
 return out+'…';
}
const pad=(text,width,right=false)=>{text=clip(String(text),width);const spaces=' '.repeat(Math.max(0,width-displayWidth(text)));return right?spaces+text:text+spaces;};
function wrap(text,width){
 const lines=[];let line='',used=0;
 for(const s of graphemes(text)){
  const w=cellWidth(s);
  if(used+w>width&&line){lines.push(line.trimEnd());line='';used=0;}
  if(w>width){line+='.';used++;}else{line+=s;used+=w;}
 }
 if(line)lines.push(line.trimEnd());return lines;
}
function fileLabels(rows){
 const paths=rows.map(r=>clean(r.file).replaceAll('\\','/')),parts=paths.map(p=>p.split('/'));
 const labels=parts.map(p=>p.at(-1)||'未知檔案');
 // Outside-project labels stay masked and retain their warning marker.
 for(let i=0;i<labels.length;i++){
  if(paths[i].startsWith('[專案外]/')){labels[i]=paths[i];continue;}
  for(let depth=1;depth<=parts[i].length;depth++){
   const suffix=parts[i].slice(-depth).join('/');
   if(parts.every((p,j)=>i===j||p.slice(-depth).join('/')!==suffix)){labels[i]=suffix;break;}
  }
 }
 let common=[];
 if(parts.length&&paths.every(p=>!p.startsWith('[專案外]/'))){
  common=parts[0].slice(0,-1);
  for(const p of parts.slice(1)){let i=0;while(i<common.length&&i<p.length-1&&common[i]===p[i])i++;common=common.slice(0,i);}
 }
 return {labels,common:common.length?common.join('/')+'/':null};
}
export function formatAnalysis(report,percentages,{width=100}={}){
 width=Number.isFinite(width)?Math.max(1,Math.min(200,Math.floor(width))):100;
 const r=report.recent_reads,rows=r.rows.slice(0,20),{labels,common}=fileLabels(rows),lines=[`ACM 分析｜最近 ${r.observed_responses}／${r.requested_responses} 輪模型回應`,''];
 const headers=['讀取','重讀','縮減後'],keys=['reads','repeated_reads','post_slide_repeats'];
 const sizes=headers.map((h,i)=>Math.max(displayWidth(h),...rows.map(row=>displayWidth(String(row[keys[i]])))));
 const available=width-sizes.reduce((a,b)=>a+b,0)-6;
 if(width>=56&&available>=12){
  const fileWidth=Math.min(available,Math.max(4,...labels.map(displayWidth)));
  lines.push(pad('檔案',fileWidth)+'  '+headers.map((h,i)=>pad(h,sizes[i],true)).join('  '));
  const clipped=labels.map(label=>clip(label,fileWidth));
  rows.forEach((row,i)=>{const label=clipped.filter(x=>x===clipped[i]).length>1?`${i+1}. ${labels[i]}`:labels[i];lines.push(pad(label,fileWidth)+'  '+keys.map((key,j)=>pad(row[key],sizes[j],true)).join('  '));});
 }else{
  rows.forEach((row,i)=>{
   // Numbering distinguishes labels even when narrow-screen truncation collides.
   lines.push(clip(`${i+1}. ${labels[i]}`,width));
   lines.push(...wrap(`讀取 ${row.reads} · 重讀 ${row.repeated_reads} · 縮減後 ${row.post_slide_repeats}`,width),'');
  });
 }
 if(!rows.length)lines.push(r.window_complete?'此範圍沒有成功 read 紀錄。':'未觀察到成功 read；窗口不完整，不能判定沒有讀取。');
 if(common){if(displayWidth('表列共用路徑：'+common)<=width)lines.push('表列共用路徑：'+common);else lines.push('表列共用路徑：',common);}
 if(r.rows.length>20)lines.push(`另 ${r.rows.length-20} 個檔案請看 JSON。`);
 if(rows.some(row=>row.write_followup_repeats||row.recovery_path_candidates))lines.push('部分重讀涉及寫入後驗證／恢復檔案；分類可能重疊，不代表浪費，細節見 JSON。');
 lines.push('※ 重讀可比對更早紀錄：窗口內讀取 1 次也可能是重讀。','※ 重讀包含在讀取裡，縮減後重讀包含在重讀裡，不能相加。');
 if(!r.window_complete||!r.baseline_complete||!r.post_slide_evidence_complete)lines.push('讀取／歷史證據不完整：表中為觀察值或候選下限，0 不代表確定沒有重讀。');
 const s=report.scope,a=report.assessment??assessAnalysis(report),p=percentages;
 lines.push('',`縮減判讀｜目前 ${p?.triggerPercent??'未知'}% → ${p?.targetPercent??'未知'}%`,a.label+'。',
  `同模型／比例範圍：${report.successful_slides} 次縮減、${report.post_slide_repeats} 次重讀候選；最近最多 ${s.requested_slides} 次縮減 × 後 ${s.post_slide_responses} 輪。`,
  '表格與縮減判讀的統計範圍不同；表格可能含其他模型／比例時期的重讀。');
 if(!s.complete)lines.push('縮減的必要歷史／邊界證據不完整，先維持設定。');
 if(!s.settings_verified)lines.push('歷史比例：未知。');
 lines.push(a.code==='REVIEW_CANDIDATES'?'建議：先檢查修改驗證／任務恢復；調整條件與完整建議見 JSON。':'建議：先維持目前設定。',
  '唯讀、不呼叫模型、不自動調參；比例不是實際縮減保證。',
  '完整路徑／證據／Token／快取／估算費用見 JSON（費用非訂閱額度）。',
  '/acm-analysis(piecd100) json');
 return lines.flatMap(line=>line?wrap(clean(line),width):['']).join('\n');
}
