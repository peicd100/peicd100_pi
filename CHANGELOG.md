# 更新紀錄

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
