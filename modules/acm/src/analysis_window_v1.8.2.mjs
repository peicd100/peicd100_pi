import {analyzeBranch as legacy,formatAnalysis as legacyFormat,assessAnalysis,formatTechnicalAnalysis} from './analysis_v1.7.0.mjs';
import {analyzeBranch as observe} from './analysis_detail_v1.8.2.mjs';
export {assessAnalysis,formatTechnicalAnalysis};
// Ratio assessment remains the original five-cut epoch. The separate read
// table covers forty committed cuts across routes/policies, with earlier baseline.
export function analyzeBranch(input,options={}){
 const report=legacy(input,options),limit=options.bodyLimit??100000;
 const details=observe(input.slice(-limit),{...options,maxEntries:limit,historyBaselineComplete:input.length<=limit});
 const recent=details.recent_reads;
 recent.window_complete=details.unbound_slides===0&&(input.length<=limit||recent.observed_slides===recent.requested_slides);
 recent.baseline_complete=input.length<=limit&&details.unbound_slides===0&&details.ambiguous_tools===0&&recent.unverified_outputs===0;
 recent.post_slide_evidence_complete=details.unbound_slides===0&&input.length<=limit;
 recent.scanned_entries=Math.min(limit,input.length);recent.omitted_entries=Math.max(0,input.length-limit);
 report.recent_reads=recent;return report;
}
