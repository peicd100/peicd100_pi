const states={SENDING:'送出中',ACCEPTED:'端點已接受',HTTP_REJECTED:'端點拒絕',UNKNOWN:'結果未知，禁止盲目重送',FAILED_PRECHECK:'送出前驗證失敗',DUPLICATE_NO_RESEND:'已處理，不重送',SKIPPED:'已略過'};
export const stateLabel=value=>states[value]??'未知狀態';
export const onOff=value=>value?'開啟':'關閉';
export const outcomeLabel=value=>({completed:'完成',error:'確定停止的錯誤',aborted:'取消'}[value]??'未知');
export function formatStatus(s) {
 const policy=s.session_policy;
 return [`Webhook 狀態（版本 ${s.loaded_version}）`,`端點：${s.configured?s.endpoint_host:'尚未設定'}；金鑰：${s.key==='configured (hidden)'?'已設定（隱藏）':'無'}`,
 `端點權限：${s.master_enabled?'已授權':'未設定或舊權限關閉，開啟對話需確認'}；新對話預設：${onOff(s.default_enabled)}`,
 `此對話：${policy?(policy.mode==='default'?'沿用已保存預設':'明確選擇')+'／'+onOff(policy.mode==='on'||policy.mode==='default'&&policy.defaultEnabled):'尚未初始化'}`,
 `目前可自動通知：${onOff(s.effective_automatic_enabled)}${s.automatic_mode_supported?'':'（此執行模式不自動通知）'}`,
 `格式：${s.format}；一般回合通知：${s.notifyOn.map(outcomeLabel).join('、')}`,
 `Goal 通知：${(s.goalNotifyOn??[]).map(x=>({complete:'完成',waiting:'等待（尚未完成）',paused:'暫停（尚未完成）',blocked:'受阻',usage_limited:'額度停止',budget_limited:'預算停止'}[x]??'未知')).join('、')||'關閉'}；進行中的暫時重試不通知；明確等待／暫停只通知狀態轉換，不冒稱完成。`,
 `送出前確認閒置 ${s.quiet_ms/1000} 秒；${s.automatic_pending?'有待確認通知':'目前無待確認通知'}（沉默不代表完成）。`,
 s.goal_policy?.mode==='unknown'?'Goal 狀態不支援或無法確認，自動通知保持阻擋。':null,
 ...s.receipts.slice(0,5).map(r=>`${r.test?'測試':'通知'}：${stateLabel(r.state)}；HTTP ${r.http_status??'未知'}；${r.started_at??'時間未知'}`),
 '開關只有：設定新對話預設／當前對話開／當前對話關；不重設事件。端點未授權不送出，開啟時明確提示。','原始技術欄位：/webhook-status json。'].filter(Boolean).join('\n');
}
