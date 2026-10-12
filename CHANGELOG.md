# 更新紀錄

## 0.8.0

- Notify 2.0：自有 Webhook 命令改為 Notify 八指令，移除 global／events 選單與舊 alias，只留新對話預設及當前對話 on/off；legacy global-off／端點 permission／branch選擇保守遷移，不偷偷啟用或移除原資料／收據。
- Telegram Bot／Discord／Slack／generic profiles 分開保存，一次一種 selected；revision／CAS／跨程序 DNS 與 preDispatch freshcheck，切換不補送／轉送舊候選／自動測試。Telegram固定HTTPS/plaintext、HTTP＋APIok確認、secret-safe response與no retry。
- 固定通知完成與需處理的確定停止，Goal自恢復wait／retryquiet；真正native取消、Goalpaused／blocked／usagebudget與各loadorder皆回歸。標題第一行對話名稱｜需要處理／已完成，狀態／可安全停止原因／下一步／UTC8實際送出時間；no @everyone／extraLLM。
- ACM 1.8.1：唯讀分析逐檔表置頂、共用路徑一次／同名補父目錄／Unicode對齊／窄螢幕卡片；同模型比例縮減摘要置後、不同統計窗口／較早比較明示；JSON完整資料／原分析不變。
- Activity 0.3.1：未保存偏好預設隱藏／無repaintticker，saved偏好保留；工作中on/off立即切換/noabort／reload，hidden事件觀察保持。Theme配色／原nativefooter與ACM無summary/guard/比例等安全契約不變。
- 已發布 runtime／facade／原tag保留 Hash，新版本不覆蓋舊檔，resources paths與private資料路徑不強制搬移。

## 0.7.0

- 所有自有 slash command 統一 literal `(piecd100)` 後綴，無 bare alias；共同 adapter、manifest 掛載與 loader／package Gate 作為未來新增插件規則。Pi／第三方指令不改。
- ACM 1.8.0：保留最近五次縮減判讀，新增最近十輪模型回應逐檔成功讀取／同範圍同內容重讀／其中已移出結果後重讀表；較早歷史只作比較，寫入／恢復另標、缺證據不當成 0，不判浪費或自動改比例。
- ACM 互動設定改兩階段：目前狀態與兩數字輸入→差異預覽確認；取消／同值／模型、對話或設定漂移不寫、不 reload。明確參數保留，儲存原子同步 native budget，原比例不因更新變更。
- Webhook 1.6.0：新增真正所有對話總開關，獨立 private global.json／revision／CAS；可忙碌設定、送出前跨程序重驗、off→on 不沿用舊候選，明確測試同受阻擋。不 grant endpoint、重設事件或修改對話／預設，不 modelabort／重送／補歷史。端點與事件確認使用 CAS，不覆寫後續變更。
- Activity 0.3.0／Theme 0.4.0：設定選項標目前狀態，保存偏好與 runtime 分開；原活動計時／footer、palette 與安全 reload 保持。各設定介面重讀目前狀態，不回顯 URL path/key。
- 新增版本路徑，保全 0.6.0 原 factory／facade／runtime Hash 與舊標籤；資料不搬移、不自動開通知、不強制忙碌 reload。

## 0.6.0

- ACM 1.7.0：最近五次縮減與必要游標／carried read/tool owner metadata 定位，按需擴充讀取（metadata/body各最多100000）；無關舊紀錄截斷不再誤標 INCOMPLETE，真正缺依賴／budget上限仍保守，read-only/noLLM/比例不改。
- Activity 0.2.0：保留實際原生 FooterComponent/statistics/statuses，活動列最後獨立行；未知／第三方footer不搶，fallback widget。中文顯示／隱藏選單保存偏好，hidden持續觀察但無每秒重繪，時間不重設、reload不猜歷史。
- Webhook 1.5.0：三開關操作 default（future only）／on／off（current only），授權端點可busy切當前選擇，不modelabort／不resetevents。legacyoff只在idle明確確認**當前分支的端點指紋授權**，不把舊全域enabled偷偷打開、其他對話不受影響；v1 policy向後讀取、新v2 consent不含secret。
- Theme 0.3.2：只把pending block改較明亮#303030石墨灰，success/error/其餘保持；immutable palette、factory/entries/oldtags原Hash保全。

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
