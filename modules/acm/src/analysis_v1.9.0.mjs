import {analyzeBranch as baseline,formatAnalysis as formatBase,displayWidth,assessAnalysis,formatTechnicalAnalysis} from './analysis_v1.8.2.mjs';
export {displayWidth,assessAnalysis,formatTechnicalAnalysis};
export function analyzeBranch(input,options={}){
 const report=baseline(input,options),capacity=options.currentCapacity;
 if(Number.isSafeInteger(capacity)&&capacity>0){
  const byId=new Map(input.map(e=>[e.id,e]));
  const mismatch=report.scope.selected_slide_ids.some(id=>{const saved=byId.get(id)?.data?.analysisPolicy?.capacity;return saved===undefined?Boolean(options.manualCapacity):saved!==capacity;});
  report.scope.context_capacity=capacity;report.scope.context_capacity_verified=!mismatch;
  if(mismatch)report.assessment={code:'UNKNOWN_CONTEXT_BUDGET',label:'歷史上下文預算不同或未記錄，暫不建議調整比例',advice:'維持目前比例，累積同一上下文預算的縮減紀錄後再判讀。'};
 }
 return report;
}
export {formatBase as formatAnalysis};
