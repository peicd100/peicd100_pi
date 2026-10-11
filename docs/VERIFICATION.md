# 0.1.0 驗證範圍

結果必須以 exact commit、輸入 Hash、log 與 CI evidence 為準，不能只因存在檔案就宣稱通過。

- 三模組原套件完整回歸；移植 runtime bytes 與 MODULES 原 Hash 保持，Theme 測試僅改善 fileURLToPath 空白／中文路徑相容。
- 官方 Pi 1.1.0 loader：三入口、原 commands、無模型工具、原來源資料；ACM producer／guard 同一資源與註冊順序。
- 合併來源真正 AgentSession mock wire：ACM 設定／校準／滑動／無摘要／branch，Webhook fresh default Off／既有 branch metadata，Theme 原選擇保存還原；不模型／實際 POST。
- 原資源篩選與原生 package manager 的 differential；單獨停用模組不殘留 ACM guard 半套，原 current theme 不自動切換。
- 遷移 preview 無寫入、原 packages 之外不變、敏感資料 backup／receipt、CAS、外部變更、busy lock、JSON／UTF-8／symlink／重複來源拒絕、idempotence、有條件 restore。
- 本機隔離 Git genuine branch update／tag pin／list／load／remove；正式依賴不含宿主，空白／中文路徑與 store／preferences／receipt／theme／toggle保持。
- 公開 Git exactheads 安裝與三系統 CI；無強推／移動舊 tags／變更舊倉庫。

沒有即時模型、真實端點送達或人工 UI 截圖；不代表所有 Pi 版本、終端機、worker／ephemeral session、斷電或 Windows ACL 情況已驗證。插件與 Pi 相同 OS 權限，不是沙盒。相同 producer/guard 註冊只靠可信 factory，不能阻擋其他惡意來源。
