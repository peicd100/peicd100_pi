# 驗證範圍

## 0.3.0 新增 Gates

- Activity：factory 無 timer、TUI only belowEditor 單行、不替換footer、不寫session／發請求；1秒僅requestRender、0/1/2/12/40/100/200可見欄寬與ANSI/中文／動態theme；shutdown/reload/tree/on-off隔離；lastActivity/operationElapsed／平行巢狀工具／5分提醒／Goal和UI等待／idle／未知狀態／nonTUI／私人內容不儲存。
- Theme：已commit後官方reload只一次、store lock先釋放、noop/cancel/fail/queue不reload；reload失敗不rollback，stale-context getter禁存取；真AgentSession＋ThemeController＋Activity重載保持branch／settings／singleton widget，不呼叫模型。
- Webhook：setup與on明確完成-only／Goal四終態預設，off／載入保留custom config與session/default/private資料，無真POST。native Goal兩loadorder＋server wait/resume加入Activity共存回歸。
- 四個原生resources，新增activity可以獨立關閉，舊明確filter不偷偷擴大；完整回歸、三OS exacthead CI、隔離/remote/production install gate照舊。


## 0.2.2 本機檔案 Gates

- Windows 暫時分享鎖 rename 注入、同一原子替換無目標空窗、永久錯誤最多七次嘗試／630ms 等待、非 Windows／非分享錯誤不重試。此 retry 僅本機檔案 I/O，HTTP at-most-once 不變。
- 收據 finalize 尚未完成前 pending 不清零；Goal mock wire／DNS 取消／masterOff 仍要求確定 terminal receipt，不能改接受 UNKNOWN 來放寬測試。

## 0.2.0 新增 Gates

- ACM 最近五次／後五回應、三次最低樣本、歷史前置證據、已知模型／比例連續範圍、未知比例／截斷／觀察未完／缺邊界、跨路由不誤歸因、readonly／不洩漏內容。runtime 正確保存 analysisPolicy metadata，不改 selector／校準算法。
- Goal 0.54.11 dev-only 固定相容輸入；實際 Goal＋Pi 1.1.0 AgentSession mock wire，Goal-first／Webhook-first 都不通知中間回合，goal_complete 的 complete→null 持久狀態與 terminate tool batch 可通知一次。
- Goal active／external wait／server-error recovery、確定 blocked／usage／budget stop、pause／clear、未知 schema、啟動不補送、resume 新終態、普通回合、busy／queue／input、masterOff／event opt-out／tree、DNS 期間新工作取消等。Goal 狀態只是通知判斷，不接管它的續跑。
- 三秒防抖與送前重驗均有測試；所有傳送為 mocked DNS／HTTPS，不對真實端點 POST。已提交 HTTP 的撤回與第三方端點／裝置送達不在保證範圍。
- 原版不可變 runtime／聲明由 preserved_paths 綁原 Hash；active 新版 manifest 明確，不靠檔名新舊猜權威。依舊完整回歸、隔離安裝／更新／migration、公開隱私與三OS CI Gate。

## 0.1.0 基線

結果必須以 exact commit、輸入 Hash、log 與 CI evidence 為準，不能只因存在檔案就宣稱通過。

- 三模組原套件完整回歸；移植 runtime bytes 與 MODULES 原 Hash 保持，Theme 測試僅改善 fileURLToPath 空白／中文路徑相容。
- 官方 Pi 1.1.0 loader：三入口、原 commands、無模型工具、原來源資料；ACM producer／guard 同一資源與註冊順序。
- 合併來源真正 AgentSession mock wire：ACM 設定／校準／滑動／無摘要／branch，Webhook fresh default Off／既有 branch metadata，Theme 原選擇保存還原；不模型／實際 POST。
- 原資源篩選與原生 package manager 的 differential；單獨停用模組不殘留 ACM guard 半套，原 current theme 不自動切換。
- 遷移 preview 無寫入、原 packages 之外不變、敏感資料 backup／receipt、CAS、外部變更、busy lock、JSON／UTF-8／symlink／重複來源拒絕、idempotence、有條件 restore。
- 本機隔離 Git genuine branch update／tag pin／list／load／remove；正式依賴不含宿主，空白／中文路徑與 store／preferences／receipt／theme／toggle保持。
- 公開 Git exactheads 安裝與三系統 CI；無強推／移動舊 tags／變更舊倉庫。

沒有即時模型、真實端點送達或人工 UI 截圖；不代表所有 Pi 版本、終端機、worker／ephemeral session、斷電或 Windows ACL 情況已驗證。插件與 Pi 相同 OS 權限，不是沙盒。相同 producer/guard 註冊只靠可信 factory，不能阻擋其他惡意來源。
