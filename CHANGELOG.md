# 更新紀錄

## 0.12.1

- ACM1.12.1 本對話／新對話預設改單一觸發 n 輸入，1<n<100，可小數與%；explicit 保存 n/n−1，完整相同值不寫，旧保存比例不自動改，取消／stale／private CAS 保持。
- 下方工具欄只顯示 ACM n%，不箭頭／保留目標／停用附註；n 是本對話觸發設定，不是原生使用量。開關及完整比例留在選單／狀態。
- 恢復獨立 /acm-analysis(piecd100) [json]，與主選單分析同 callback、只讀無模型；裸入口提示完整拼法，其他 removed shortcut 不恢復。五資源七入口，容量／whole batch／安全上限／no-summary guard／其他插件不變。
- 新 versioned producer/menu/threshold/footer/namespace module，immutable 1.12.0 歷史 Hash 保全；新增 genuine SDK 設定／恢復／分支／未來預設／Off／獨立分析／footer 與輸入邊界回歸。

## 0.12.0

- ACM1.12.0 主選單第一項本對話比例；本對話縮減開關、新對話預設開關／比例、狀態、分析、共用原生同步與取消。Private defaults atomic CAS，初始化 branch snapshot／恢復／分支點繼承；改預設只 future-only，改本對話不寫 global settings/models 或其他對話。
- Producer／獨立 guard 每次共用本分支 policy＋真 Pi 模型窗口衍生的請求預算與 one-shot fingerprint。Pi 1.1.0 無每 session 原生 compaction 設定 API，不冒充同步或覆寫全域；原 shared native validation／明確同步仍保留，native/manual/overflow/tree 摘要全部取消。
- 關閉只停自動縮減與預覽，不停安全上限／配對／獨立 no-summary guard，不提交新 cursor／不恢復已裁切歷史；健康 Main 才提交且驗 policy/model 沒有變更。Footer 現在是本對話比例／停用標示，仍不追加 Pi窗口。status 分清對話／預設／共用 native；分析篩選用本對話比例。
- Notify2.2.0／ACM 只各註冊一個中文主入口，移除所有 `/notify-*`／`/acm-*` 快捷；舊 bare／namespaced 輸入 handled 提示，不變一般模型prompt。內部 callback 直接路由，不 synthetic user／modeltool；唯讀 JSON 仍從主入口參數存取。
- `/context(peicd100)` 保持獨立，不放 ACM 選單，真 Pi models.json 雙檔交易／500K／1M與fresh reload保持；Suffix/Theme/Activity 原入口／功能不改。共五資源六入口；新增 current genuine SDK 對話／wire／off／restore／menu／guard tests，歷史 shared-config/autoinit fixture 固定 immutable1.11 不當新attestation，舊 runtime/tags Hash保全。

## 0.11.0

- 新增 Suffix0.1.0 `/suffix(peicd100)` 中文主選單／第一項對話toggle、共用後綴、defaultOff、activebranch開關持久、預覽／狀態。Pi原生input一般userinteractive/rpc提交一次追加、userrole/images原樣、retry/auto不double；私密atomicCAS，queue採提交時快照、history不改、空內容fail-safe。
- ACM1.11.0新增 `/acm(piecd100)` 直接中文整合主選單，原status/config/context/analysis/setup都保留，不關閉guard。
- Notify2.1.0主選單第一項當前對話toggle；Theme0.4.2/Activity0.3.2中文選單加入status/cancel。原容量/通知安全/其它runtime不改；新增第五root掛載，歷史Hash保留。

## 0.10.1

- 顯示only：ACM1.10.1不再於下方附加「· Pi窗口 ...」，保留原比例threshold，讓容量/用量/%只看Pi原生。
- /context詳細資料、直接Pi設定、實際500K/1M窗口/native/producerguard/模型身分/thinking及其它plugins不變；SDK500K/1M回歸改驗exact原footer且無Pi窗口。保留原版本Hash/history。

## 0.10.0

- `/context(peicd100)`改為直接Pi models.json/modelOverrides.contextWindow；Pi Registry/active model/原生用量％/footer+ACM/native同新窗口，不再ACM softcap/base105萬限制，舊budgetinactive。500K/1M可選，不改其他model/provider/auth/output/headers/全域nativetoken/prefs。
- 顯官方GPT6.1SolAPI1.05M(2026-10-13官方source)與Pi272K/磁碟override/真Codex服務Unknown，unknown不猜；兩階段＋擴大風險確認，不Probe模型，不把API規格當端點已驗。
- 雙檔jointlock/CAS/privatejournal/partialrollback/orphanproof/no force；localrefresh實際PiRegistry驗新覆寫、freshreload啟用metadata同identity/thinking；reloadfailure保留committed一致配置、models/runtime或pending不符停止，而非用stale context假回退。
- 歷史0.9bundle/guard/facade/runtime/oldtags保留，新增pure/UI/genuineSDK真reload 500K/1M回歸，沿用40read與其他plugin。

## 0.9.0

- 新增精確`/context(peicd100)`（其餘(piecd100)不改）容量查看／兩階段預算選單／唯讀JSON與明確參數；區分Pi宣告上限與服務端UNKNOWN，不假造500K/1M，超宣告拒絕/no provider探測/model請求。
- ACM1.9.0 per-model/endpoint-bound contextbudget＋singleproducer/guard/native同步／atomicCAS/settingsrollback/idle+queued+stale guards/noopcancel/no-restore；不改modelcontextWindow/其他prefs/其他模型/globalnativebudget。新capacitymetadata避免比例判讀混預算，原40cutread保持。
- 保留全部歷史runtime/facade/原guardHash；新版schema/config/adapter/producerguard與budget/GUI/security/genuineSDK回歸。Notify/Theme4040/Activity原功能不改。

## 0.8.2

- ACM1.8.2 read表改最近40次成功提交縮減以來，跨route/policy，過往read僅baseline，不計40輪或40倍window；no-op/失敗取消不算。原近期同模型比例判讀獨立保持，顯示route與filter0說明，避免誤稱沒有歷史縮減。newJSONschema2和bounds/incomplete資訊。
- Theme0.4.1執行中toolPendingBg只調為#404040，其餘palette/成功錯誤/設定不改。
- 新versionedruntime/facade/舊paletteHash保全，新增40cut/baseline/wholebatch/native/dedup/cap/不同model與palette唯一差異回歸；no模型/磁碟補讀/auto調參/live reload。

## 0.8.1

- Notify 2.0.1：修正提供者重試已耗盡、Goal仍記為 waiting 且無自動恢復期限時被靜音；辨識已驗 `Provider retries exhausted` 結構marker，通知「對話名稱｜需要處理」、安全耗盡原因與 follow-up／`/goal resume` 下一步，不洩漏完整錯誤或 request ID、不額外呼叫模型。
- 一般等待／有恢復期限／重試進行中仍不通知；不只因缺deadline或模糊文字就判人工停止。auto→manual 是新通知 episode，重複persist去重；恢復後再耗盡與最終完成分開通知。debounce／queued／input／off-on／DNS／startup不補送保護不變，不修改 Goal 或接管重試。
- 新版本factory／core／goalpolicy，保留已發布2.0與其他runtime、舊tag/data/resource paths；加入purepolicy/flow/genuineGoal-source與Pi SDK兩載入順序回歸。

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
