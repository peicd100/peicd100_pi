import { validatePercentages, DEFAULT_PERCENTAGES } from './config_v1.5.0.mjs';
export function formatFooter(settings) {
 if (settings?.compaction?.enabled === false) return 'ACM 關閉';
 try {
  const p = validatePercentages(settings?.acm ?? DEFAULT_PERCENTAGES);
  return `ACM ${p.triggerPercent}%→${p.targetPercent}%`;
 } catch { return 'ACM 設定無效'; }
}
export function formatStatus(data) {
 const number=n=>typeof n==='number'&&Number.isFinite(n)?n.toLocaleString('zh-TW'):'未知';
 const phase={startup:'啟動中','calibrated-next-request':'下一次請求已校準','native-Pi-current-context':'Pi 目前上下文'};
 return [`ACM 狀態（版本 ${data.version}）`,`模式：自動滑動；不產生 AI 摘要；不要求手動檢查點`,
 `目前上下文：${data.nativePiView?.percent!=null?data.nativePiView.percent.toFixed(1)+'％':'未知'}；${number(data.nativePiView?.tokens)} Token`,
 `設定：觸發 ${data.config.triggerPercent}％／保留目標 ${data.config.targetPercent}％`,
 `階段：${phase[data.phase]??'等待有效請求'}；本次載入後已提交滑動 ${number(data.slides)} 次`,
 `最近估算：滑動前 ${number(data.before)}／滑動後 ${number(data.after)} Token（不是目前 Pi 使用量）`,
 `可見輸入 ${number(data.targetRouteVisibleInputTokens)}；不透明內容預算基礎 ${number(data.opaqueBudgetBasisTokens)}`,
 `校準：${number(data.calibration.samples)} 筆；倍率 ${number(data.calibration.factor)}；固定偏移 ${number(data.calibration.offset)}`,
 `目前邊界：${data.boundary.cursorId??'尚未滑動'}；保護錨點 ${data.boundary.anchorIds?.length??0} 個`,
 data.fault?'停止原因：'+data.fault:'未記錄停止原因。','效率診斷：/acm-analysis；原始技術欄位：/acm-status json。'].join('\n');
}
