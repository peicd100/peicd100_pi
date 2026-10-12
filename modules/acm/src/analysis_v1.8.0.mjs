import {analyzeBranch as legacy,formatAnalysis as legacyFormat,assessAnalysis,formatTechnicalAnalysis} from './analysis_v1.7.0.mjs';
import {analyzeBranch as observe} from './analysis_detail_v1.8.0.mjs';
export {assessAnalysis,formatTechnicalAnalysis};
// Keep the existing recent-cut assessment unchanged. The independent ten-response
// view counts successful read results by owning assistant, not transcript entries.
export function analyzeBranch(input,options={}){
 const report=legacy(input,options),limit=options.bodyLimit??100000;
 const details=observe(input.slice(-limit),{...options,maxEntries:limit,historyBaselineComplete:input.length<=limit});
 const recent=details.recent_reads;
 recent.window_complete=input.length<=limit||details.model_responses>=10;
 recent.baseline_complete=input.length<=limit&&details.unbound_slides===0&&details.ambiguous_tools===0&&recent.unverified_outputs===0;
 recent.post_slide_evidence_complete=details.unbound_slides===0&&input.length<=limit;
 recent.scanned_entries=Math.min(limit,input.length);recent.omitted_entries=Math.max(0,input.length-limit);
 report.recent_reads=recent;return report;
}
export function formatAnalysis(report,percentages){
 const r=report.recent_reads,lines=[legacyFormat(report,percentages),'',`最近 ${r.observed_responses}／${r.requested_responses} 輪模型回應讀檔統計（含工具呼叫輪）`,'檔案 │ 讀取次數 │ 相同範圍／內容重讀 │ 其中縮減後重讀'];
 for(const row of r.rows.slice(0,20))lines.push(`${row.file} │ ${row.reads} │ ${row.repeated_reads} │ ${row.post_slide_repeats}${row.write_followup_repeats||row.recovery_path_candidates?`（其中寫入後 ${row.write_followup_repeats}／恢復檔候選 ${row.recovery_path_candidates}）`:''}`);
 if(!r.rows.length)lines.push(r.window_complete?'此可觀察範圍沒有成功 read 紀錄。':'未觀察到成功 read；窗口不完整，不能判定沒有讀取。');
 if(r.rows.length>20)lines.push(`另 ${r.rows.length-20} 個檔案請看 /acm-analysis json。`);
 lines.push('重讀與縮減後重讀是讀取次數的子集合，不能相加；修改／恢復分類可重疊，不代表浪費。','只統計成功 read；不同範圍或可見內容不算相同重讀，不猜測 bash 間接讀取與缺少結果的 nested calls。');
 if(!r.window_complete||!r.baseline_complete||!r.post_slide_evidence_complete)lines.push('讀取／歷史比較證據不完整：表中是可驗證的觀察值或候選下限，0 不代表確定沒有重讀；未自動補讀磁碟檔案。');
 return lines.join('\n');
}
