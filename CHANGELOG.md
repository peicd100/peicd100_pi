# 更新紀錄

## 0.4.1

- Theme 0.3.1 僅將執行中工具背景 `toolPendingBg` 改為 `#1A1A1A`；成功、錯誤與其他配色全部保持。保全舊 palette Hash，native Theme 渲染與單 key diff 回歸驗證；其他模組、資料、主題保存與安全 reload 不變。

## 0.4.0

- Webhook 1.4.0：Goal 預設六事件 complete/waiting/paused/blocked/usage_limited/budget_limited，等待／暫停明確尚未完成；clear 不通知，正常 active 重試不通知。
- 新選用通知投影不改 Goal canonical active-wait 狀態；一秒 TUI readonly leaf observer補 manual pause／aborted turn無settled的漏訊，三秒idle/queueempty與DNS後同transition檢查、防重送/startup不補送/OptOut安全維持。
- repeated waiting/paused persistence同episode只一次，resume後新episode可再通知；不傳私人原因/objective。不overwrite已保存custom事件，on/setup明確回六預設。
- Activity／Theme／ACM與其獨立設定／行為不變；原 runtime/newpaths、標籤／資料保全。

## 0.3.0

- 新增 Activity 0.1.0：belowEditor 獨立單行、每秒純 UI、單調時計／每對話隔離、最後活動與動作耗時分開；等待／閒置不誤警，五分鐘無活動只提醒不代表當機。窄寬度／中文／ANSI、reload/shutdown 清理；不自動中止／重試／通知或寫模型上下文。
- Theme 0.3.0：`/pi-theme` 成功更改並保存後安全自動官方 reload；noop／取消／失敗／新工作與佇列不 reload，reload 失敗不回退已保存主題、不取用 stale context。
- Webhook 1.3.0：初次設定或明確 `/webhook-on` 重設事件預設，一般只有完成，Goal 完成／受阻／額度與預算停止；`events` 仍可自訂、`off` 保留，載入／更新不自動改偏好或開通知。
- 第四資源可獨立 `pi config` 關閉，既有明確 filters 不擴大；原比例／樣式／資料位置、Goal 等待與防重送不變；舊 runtime／標籤保全。

## 0.2.2

- Webhook 1.2.2：Windows 分享鎖／暫時存取錯誤時，對同一本機原子 rename 做有界重試，總等待最多 630ms；絕不 unlink 目標或重送 HTTP，持續失敗仍保留 UNKNOWN／防重送。
- 新增暫時／永久檔案故障注入、非 Windows 不重試驗證；保存錯誤僅顯示安全 error code，不輸出秘密或私有路徑。
- 保留 0.2.0／0.2.1 標籤與 runtime；Goal 狀態門檻、ACM 判讀策略、設定／資料位置不變。

## 0.2.1

- Webhook 1.2.1：待處理狀態包含自有送出操作，取消 debounce 不等於 DNS／收據已收尾；避免 Windows 在終態收據寫完前誤讀 UNKNOWN。取消期間仍禁止 POST，不弱化收據或防重送驗證。
- 保留 0.2.0 標籤與不可變 runtime，新增 patch factory／core；ACM 與 Goal 判斷策略不變。

## 0.2.0

- ACM 1.6.0：`/acm-analysis` 改為判讀／觀察／建議；最近最多五次縮減、後五次模型回應；少於三次／缺證據／歷史比例未知不提供數值調參；技術累計與證據留 JSON。記錄新版縮減的 route／比例，不改滑動算法或自動調參。
- Webhook 1.2.0：選用相容 Goal 0.54.11；active／wait／retry 不通知，只在 complete／blocked／額度或預算停止後確認閒置。三秒防抖、送前與 DNS 後重驗、終態轉換去重；手動 pause／clear 不冒稱完成，不補送歷史。
- 一般回合與 Goal 停止事件可分別選擇；原總開關／對話選擇／秘密／收據保持，更新不自動開啟通知。未知 Goal schema 保守阻擋。
- 保全初版 runtime Hash，新增版本檔與明確 active manifest；加入真實 Goal 套件＋Pi mock wire 的雙載入順序相容回歸，無真實模型／POST。

## 0.1.0

- 首次整合 ACM 1.5.1、Webhook 1.1.1、Theme 0.2.0，一個不固定版本 Git 安裝／更新入口。
- 原指令、演算法與套件外資料位置保持；三個公開入口各自可停用，ACM 主體與 guard 不再分開。
- 私人備份、原資源篩選、Pi-compatible lock、SHA-256／CAS 與有條件回復的一次性來源遷移。
- 保留舊模組來源 commit、原 LICENSE／NOTICE／不可變 runtime Hash，後續本倉庫為唯一維護來源。
- 不新增模型工具、統一大選單／對話目錄，不自動打開通知或套用主題，也不修改 Pi 本體。
