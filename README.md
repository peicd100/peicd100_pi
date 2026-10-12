# PEICD100 Pi 工具箱

版本 `0.7.0`；套件／GitHub repo：`peicd100_pi`。把 ACM、Webhook、Theme、Activity 整合成**一個安裝與更新入口**，內部仍是獨立模組，自有指令統一使用 `(piecd100)` 後綴，套件外資料位置不改。

## 安裝一次，之後更新

需要 Node.js 22.19 以上、Git、Pi；驗證基準 Pi 1.1.0。

```sh
pi install git:github.com/peicd100/peicd100_pi
```

不加版本：追蹤穩定 `main`。安裝後重新啟動，或等工作與訊息佇列完成後 `/reload`。

```sh
pi update git:github.com/peicd100/peicd100_pi
```

更新後仍需閒置 `/reload`，不會自動替正在執行的對話換插件。版本標籤只供追查／必要時回退；一般安裝指令不固定版本。

本機開發：在工具工作區執行 `pi install ./peicd100_pi`，不要再安裝同一套件的 Git 來源。

## 四個獨立模組、統一自有指令命名

| 資源 | 功能 | 指令 |
| --- | --- | --- |
| `extensions/acm.ts` | 無摘要上下文滑動＋獨立 no-summary guard | `/acm-status(piecd100)`、`/acm-analysis(piecd100)`、`/acm-config(piecd100)`、`/acm-setup(piecd100)` |
| `extensions/webhook.ts` | 必要資訊通知、防重送與對話偏好 | `/webhook(piecd100)`、`/webhook-status(piecd100)`、`/webhook-setup(piecd100)`、`/webhook-test(piecd100)`、`/webhook-on(piecd100)`、`/webhook-off(piecd100)`、`/webhook-events(piecd100)`、`/webhook-clear(piecd100)`、`/webhook-default(piecd100)`、`/webhook-global(piecd100)` |
| `extensions/theme.ts` | 中文模板啟用／停用還原，成功變更後安全自動 reload | `/pi-theme(piecd100)` |
| `extensions/activity.ts` | 獨立單行活動觀察，不取代 footer | `/pi-activity(piecd100) [on|off|status|json]` |

在終端機 `pi config` 可分別停用四項，按 Tab 切換個人／專案範圍，再閒置 `/reload`。**ACM 主體與 guard 同一資源一起開關**，沒有單獨停用 guard 的公開入口。這不是安全沙盒，其他不可信插件仍可能破壞規則。

**命名是永久規則**：目前與未來所有本套件自有 slash command 都帶 literal `(piecd100)`；不保留無後綴別名。Pi／第三方的 `/reload`、`/settings`、`/goal` 不改。新插件放在同套件、加入 `package.json` 的 `pi.extensions` 掛載，並使用 `src/commands_v0.7.0.mjs`；package Gate 與 loader 測試會檢查實際名稱。已有明確 resource 篩選不會被偷偷擴充。

各設定介面會標示目前狀態；全域保存偏好與本對話實際生效狀態分開顯示。磁碟與 runtime 不一致須閒置 `/reload`，未知不猜測，秘密不回顯。

Theme 的主題 JSON 是另一個原生 theme 資源。停用 Theme 指令入口不會自動還原配色；如要還原，先 `/pi-theme(piecd100)` 選「停用並還原原本主題」，再停用資源。

### Activity：獨立活動列

TUI 啟動後保留**實際 Pi 原生 FooterComponent**（不重建統計／費用），活動列在原生資訊與所有 status 插件下面，最後獨占一行。只經公開 Container.children 有界定位並 compose，不改 Pi；若第三方自訂 footer 或未知布局無法安全保留，回退輸入框下方 widget，不搶占對方，`/pi-activity(piecd100) status` 可查看。

```text
活動｜執行指令｜最後活動 12 秒前｜目前動作 2 分 08 秒
```

每秒只更新 UI，不新增模型請求、session entries 或模型上下文；計時使用單調時鐘。觀察模型有內容的串流、工具開始／進度／結束（含同時與巢狀工具）、上下文整理與 UI 等待，分開顯示最後活動和當前動作時間。工具沒有回傳進度不代表卡死；超過五分鐘只提醒「久未活動，不代表當機」，明確 Goal／UI 等待、已閒置時不警告。

Pi 沒有供 extension 使用的明確 auto-retry 事件，失敗後只能顯示「等待恢復／再次請求」，不猜重試次數／原因，不解析 prompt、工具參數、結果、命令或 Goal 私人內容。這不是進程心跳／所有背景程序完成偵測；UI 本身凍結時，列也不能繼續更新。

新對話、切樹或 reload 重設本次觀察；無歷史時間證據就顯示「載入後尚無活動紀錄」，不猜前次工作已跑多久。窄終端／ANSI／中文按可見欄位截短，保持一行。關閉／reload 清理 timer／widget；SDK／print／RPC 不啟動。`/pi-activity(piecd100)` 中文顯示／隱藏選單，`off` 隱藏、`on` 顯示並保存偏好，reload／新對話沿用。隱藏不重設本次時間或停止事件觀察，但移除自有顯示／每秒重繪；再顯示可看最新活動。背景沒有新模型請求。永久停用用 `pi config`；既有明確 extensions includes 不會偷偷加入新資源，請自行啟用 Activity。

### ACM

新安裝／reset 預設 70／55，已保存自訂值沿用。Footer 顯示有效門檻，例如 `ACM 95%→90%`；使用率由 Pi 原生 footer 顯示。`/acm-status(piecd100) json`、`/acm-analysis(piecd100) json` 保留技術欄位。

保護系統、最新使用者訊息、任務錨點與最近完整工具批次，維持配對、原始紀錄／簽章、路由隔離校準與單調游標。只在有效對應回覆後提交滑動邊界，不呼叫額外模型產生摘要。分析唯讀，先以最多 100,000 筆**僅 metadata**索引定位最近縮減及前置游標／carried read／tool-call owner；從原 10,000 筆起始範圍補讀必要連續區間，payload 最多 100,000 筆，超預算或真正缺依賴仍保守。較早無關紀錄未掃描不再讓完整的近期證據變成 INCOMPLETE，缺邊界與缺依賴分別顯示；判讀以最近最多 **5 次成功縮減 × 每次後續 5 次模型回應**為主。不同模型／已記錄比例只取最近連續範圍，不混著評分。

`/acm-analysis(piecd100)` 先顯示「判讀、觀察、建議」，少於 3 次、歷史比例未知、證據不足或觀察尚未完整時只建議維持設定。新版縮減會記錄當時模型與比例，不推測舊比例。Token／快取／費用累計與證據 ID 留在 `json`，不是訂閱額度或浪費證明。重讀可能是驗證或恢復，不能當成浪費率。

另附**最近 10 輪模型回應**逐檔表（含工具呼叫輪）：成功讀取次數、同檔／同範圍／同可見輸出的重讀次數，以及其中舊結果已被提交縮減移出後的重讀候選。較早成功讀取可作比較基準，但不算進最近 10 輪的讀取總數。三欄是包含關係，不能相加；寫入後與恢復檔另標，不推斷動機。不同區段／內容、失敗讀取不當成相同重讀；不猜 bash 間接讀取與沒有完整結果的 nested calls。歷史／窗口不足或無法比較時明示 unknown／候選下限，0 不當成確定沒有。一般畫面最多列 20 檔，`json` 保留此有界窗口全表；不另讀磁碟。

`/acm-config(piecd100)` 在閒置 TUI 先顯示目前比例、輸入「觸發 保留」兩個數字，再預覽前後差異確認。須 `0 < 保留 < 觸發 < 100`，差距小於 5 會提醒；取消／同值／確認期間模型、對話或設定變更，不寫入或 reload。確認後一次保存比例與 native budget，再官方 reload。明確參數 `[70 55|reset]` 保留；目前自訂 95／90 不會因更新改動。

真的常需讀回剛移出的資料且預算有餘裕，才一次提高保留目標 5 個百分點（例如 70／55 → 70／60，兩者仍至少差 5）；若縮減來不及則可單獨降低觸發門檻（70／55 → 65／55）。這些是條件式小幅試驗，不是報表自動推薦最佳值；沒有困擾就不調。

TUI 閒置時同步目前模型預算；明確自訂預算、停用設定或專案衝突不擅自覆蓋。未知模型／宿主以保守規則處理，必要內容過大時停止，不轉成摘要。停用整個 ACM 後會回到 Pi／其他插件的上下文行為，原生摘要可能恢復；不自動還原曾保存的模型預算。

### Webhook

`/webhook(piecd100)` 顯示目前總開關／預設／當前選擇／端點授權與實際生效狀態，再開四操作選單：

- `/webhook-global(piecd100) [on|off]`：**真正全域總開關**，影響所有對話及明確測試。
- `/webhook-default(piecd100) [on|off]`：新對話預設（初始 off），不改既有 snapshot。
- `/webhook-on(piecd100)`：只開啟當前對話，不更動事件。
- `/webhook-off(piecd100)`：只關閉當前對話，不更動事件。

全域與新對話預設、已授權的當前開關可在模型／工具執行中設定，**不中斷模型工作**。三種偏好互相獨立；全域關閉最高優先，送出前含 DNS 後重新讀取跨對話保存值及 revision，即使關閉後再開啟也不沿用舊通知。全域 on 不補送既有終態、不授權端點、不替對話開啟通知；off 阻擋未提交 POST，已提交 HTTP 無法保證撤回。

新總開關獨立保存在 `global.json`，缺檔視為允許既有選擇（不是自動啟用端點／對話）；錯誤格式或權限無法驗證則 fail closed。舊 config.enabled 仍是**端點傳送權限**，舊 false 不自動打開；當前 on 必須閒置 TUI 明確確認，僅於當前分支 v2 policy 保存非秘密端點指紋授權，不改 config.enabled 或其他對話。換端點後指紋失效。端點／事件／清除仍須閒置並核對確認時的設定，不能覆寫後來的變更。舊 webhook-session 已退役，原 branch policy 沿用；更新／載入不開通知。

初次或重新 `/webhook-setup(piecd100)` 一般 complete-only、Goal 六事件預設；**on/off/default 不再重設事件**，`/webhook-events(piecd100)` 可獨立自訂。`/webhook-test(piecd100)` 是明確真 POST，可越過當前 off，但不能越過全域 off 或未授權端點，任何開關操作都不發測試通知；明確測試也受全域總開關限制。

Discord 優先且只填端點；Slack／一般 JSON 可填 Bearer 金鑰。秘密只在遮蔽設定視窗輸入，不放指令參數。HTTPS 公開 DNS／443／TLS、metadata-only、防重送、不自動重試、送出時間與 UTC 偏移保持。未知收據不可刪除來重試。

通知以真正收尾為準，閒置 **3 秒**只是防抖，不以沉默猜完成；送出前與 DNS 之後都重驗 session／leaf、閒置與佇列、設定與開關。新輸入／新回合／切樹／reload／關閉會取消尚未提交的通知；已提交 HTTP 不能保證撤回，不重送。

Windows 檔案暫時占用時，僅重試同一次本機原子替換（最多 6 次重試／累計等待 630ms）；不刪除目標、不重送 HTTP，持續錯誤仍保留未知收據。這不是 provider／Webhook request retry。

取消後仍等待自有送出操作／收據寫入收尾，`/webhook-status(piecd100)` 不會提早顯示沒有待處理通知。

選用相容 `@narumitw/pi-goal 0.54.11`（非執行依賴、不改 Goal 套件）：
- Goal 仍正常 `active` 執行／暫時重試不通知；**已明確進入等待**（含暫時伺服器錯誤重試用盡後的 indefinite wait）會通知「尚未完成、等待中」，不是完成或當機。
- `paused`（手動暫停／中止、自動回應上限、無進展保護或工具不可用等）通知「尚未完成、已暫停」。停止原因與 Goal 私人內容不傳送；需要詳細原因請回 Pi `/goal` 查看。
- `complete` 通知目標完成；`blocked`、`usage_limited`、`budget_limited` 通知真正停止、需要處理，不誤稱完成。
- pause 不當成完成但會有暫停通知；clear 不通知。未知／不支援狀態保守阻擋。已完成後自動清除 active state 的紀錄仍能辨識，但啟動／更新不補送歷史。
- 同一 Goal 同一次終態轉換只通知一次；resume 後的新終態是另一個事件。沒有 Goal 時仍使用一般回合偏好，等待 Pi 重試與佇列真正結束後才通知。
- `/webhook-events(piecd100)` 可分別選一般回合與 Goal 停止事件；舊設定未含 `goalNotifyOn` 時預設完成／等待／暫停／受阻／額度與預算停止，但仍需端點已授權與此對話開啟，不會自動開啟通知。

TUI 會以一秒、leaf-change-only 的唯讀觀察器辨識 Goal 停止（手動 pause 未必有 agent_settled），不啟動模型、不修改 Goal。三秒閒置穩定後送出，醒來／resume／clear／新工作或 DNS 期間狀態變動即取消；同一 waiting／paused 持續寫入只通知一次，恢復後再次停下可新通知。啟動不補送歷史；observer 在 shutdown／reload 清理，nonTUI 不啟動。

已保存明確的四事件 `goalNotifyOn` 不會因 update 被覆寫；要套用六事件預設，載入新版後用 `/webhook-events(piecd100)` 選完整六項；`/webhook-on(piecd100)` 現在只開當前對話，不重設事件。

相容是經此版本狀態格式與 Pi 1.1.0 測試，不保證未來 Goal schema／所有工作流插件；不是其他背景程式的全域完成偵測器。

`/webhook-test(piecd100)` 是你明確要求的**真實 POST**，Discord 保留 `@everyone`。SDK／print／RPC 不自動通知。成功表示端點接受，不保證裝置已顯示。`--no-session` 或尚未保存的空對話不承諾跨程序恢復。

### Theme

只兩項：啟用我的模板／停用還原。成功變更並保存後，以官方 command-context `reload` **自動重新載入一次**，在 store lock／controller 釋放後執行；不是重新啟動程序。取消、已是同一主題、失敗、非 TUI、工作／佇列／對話變更不 reload。reload 失敗保留已保存主題，提示稍後手動 `/reload`，不拿 stale context 回退主題、不循環重載。僅此 `/pi-theme(piecd100)` 指令改變後會自動 reload，非所有 `/settings` 選擇，也不是套件更新後強制 reload。

主題選擇由官方 API 保存，模板不在啟動時自動選用。原自訂主題仍可用；另選主題後，停用不覆寫較新選擇。

執行中工具背景 `#303030`（較明亮石墨灰），成功背景仍 `#000000`。淡紫標題／連結 `#C7A0E8`、錯誤玫瑰紅 `#E07A86`、工具錯誤背景 `#3A2329`；模型正文與程式碼保留原色／語法色。不使用不穩定包色轉換、不改 Pi 本體或加模型背景。自動亮暗配對、專案固定主題或缺失原紀錄時拒絕不完整還原。256 色終端會近似，不控制終端機整體背景。

## 資料仍在原位置

- ACM：Pi `<agent-dir>/settings.json` 的 `acm`／`compaction`，與原 session entries。
- Webhook：`<agent-dir>/config/webhook-notifier/` 的 config、preferences、global.json（總開關）、events／receipts。
- Activity：`<agent-dir>/config/activity-display/preferences.json`（只含顯示布林偏好，不寫 session/模型上下文）。
- Theme：`<agent-dir>/themes/pi-theme-user.json`、`<agent-dir>/config/pi-theme/toggle.json` 與原 theme 選擇。

不搬移、清除或提交資料。設定由執行時檔案／session policy 決定，套件副本不充當 credential store。Windows chmod 不等於 ACL 證明。

## 已裝三個舊插件：只遷移一次

**不要同時載入整合套件與舊 ACM／Webhook／Theme。** 安裝新套件不會自動替你移除其他來源。

先完成安裝但不要重新啟動／`/reload`，照 `docs/MIGRATION.md` 的唯讀預覽與備份切換流程，或用 `pi remove` 移除原三個來源。舊資料不刪；遷移原篩選選擇，ACM 半套會依安全契約改成主體＋guard 一起載入。

舊三個倉庫／標籤保留歷史；後續只在本倉庫維護，避免四份程式碼同步。0.1.0 保持原功能；0.2.0 新增易讀分析與 Goal 通知相容，不加統一大選單或對話目錄。

## 開發與驗證

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:target
npm test
npm run check:package
npm run test:install
npm run test:remote
```

測試使用隔離 agent-dir、模擬模型／DNS／HTTPS；不改個人設定或送實際通知。正式 Git 安裝只安裝 `gpt-tokenizer`，不捆綁 Pi 宿主。公開 Git 測試需要網路。三系統 CI 與驗證範圍見 `docs/VERIFICATION.md`；發布流程見 `docs/RELEASING.md`。

套件 `private:true` 防止意外 npm publish；GitHub 公開與可安裝不代表一般開源授權，仍為 `UNLICENSED`，來源見 `NOTICE.md`。
