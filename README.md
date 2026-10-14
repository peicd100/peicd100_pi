# PEICD100 Pi 工具箱

版本 **0.13.0**；套件／GitHub repo：`peicd100_pi`。ACM、Notify、Theme、Activity、Suffix 共用一個安裝／更新來源，內部保持五個獨立資源、**七個指令入口**。

## 安裝一次，之後更新

需要 Node.js 22.19 以上、Git、Pi；完整歷史回歸基準 Pi 1.1.0；目前 ACM／Context／七入口契約另驗 Pi 1.2.0。

```sh
pi install git:github.com/peicd100/peicd100_pi
pi update git:github.com/peicd100/peicd100_pi
```

不加版本就是追蹤穩定 `main`；標籤供追查／回退。安裝或更新後等工作與佇列結束，再 `/reload` 或重新啟動。不會替正在執行的對話強制換 runtime。本機開發可在工具工作區 `pi install ./peicd100_pi`，不要同時安裝同一套件的 Git 來源。

## 五資源、七入口

| 資源 | 入口 | 用途 |
| --- | --- | --- |
| `extensions/acm.ts` | `/acm(piecd100)` | 本對話比例／自動縮減開關、新對話預設、狀態、分析、遺留原生設定修復 |
| 同一 ACM 資源 | `/acm-analysis(piecd100)` | **獨立**讀檔／縮減分析，可附 `json` |
| 同一 ACM 資源 | `/context(peicd100)` | **獨立** Pi 模型容量設定，不列入 ACM 選單 |
| `extensions/webhook.ts` | `/notify(piecd100)` | 通知中文主選單，本對話開關排第一 |
| `extensions/theme.ts` | `/pi-theme(piecd100)` | 主題模板、還原、狀態與取消 |
| `extensions/activity.ts` | `/pi-activity(piecd100)` | 活動列顯示／隱藏、狀態與取消 |
| `extensions/suffix.ts` | `/suffix(peicd100)` | 共用後綴文本、本對話開關、新對話預設、預覽與狀態 |

除恢復的 **`/acm-analysis(piecd100)`** 外，ACM／Notify **不再註冊**其他 `/acm-*`、`/notify-*` 快捷入口；輸入舊入口會被攔下並提示主選單，不當作一般提示送模型。沒有裸指令別名，`context`／`suffix` 精確使用 `(peicd100)`，其餘 `(piecd100)`；Pi／第三方 `/reload`、`/settings`、`/goal` 不改。唯讀自動化仍從同一入口使用 `/acm(piecd100) json`、`analysis`、`analysis-json` 與 `/notify(piecd100) json`，不是額外的註冊指令。

在 `pi config` 可個別停用五資源，Tab 切換個人／專案範圍，再閒置 `/reload`。ACM producer 與獨立 guard 同一資源一起掛載，沒有停用 guard 的選單。這不是安全沙盒，其他不可信插件可能破壞規則。新增插件都必須加入本套件 manifest 與共同命名 adapter／Gate；不擅自擴充使用者明確指定的資源篩選。

## ACM：對話記憶與新對話預設

`/acm(piecd100)` 中文主選單順序：

1. **設定本對話觸發比例**（單一數字 n；保留目標自動為 n−1）
2. 切換本對話自動縮減
3. 設定新對話預設是否啟用
4. 設定新對話預設觸發比例
5. 查看目前狀態
6. 讀檔／縮減分析
7. 檢查／修復 ACM 遺留原生設定
8. 取消

首次初始化對話／未存設定的分支時，保存一份預設快照。未設定新版 private 預設時，沿用既有 `settings.acm` 比例（缺省 70／55），開關缺省啟用且與 Pi `compaction.enabled` 分離，不是因更新把自訂 95／90 重設。之後以 active branch 的 `peicd100:acm-session-policy` custom entry 為準；恢復／reload 保持，分支繼承分支點，未採用分支不影響目前對話。Custom entry 不送入模型上下文。

改新對話預設只影響未初始化的新對話／分支；改本對話比例與開關只追加本分支設定，不寫入其他對話、共用預設、`settings.json` 或 `models.json`。閒置／佇列清空才能修改；只輸入單一觸發比例 `n`（可小數或附 `%`），須 `1 < n < 100`；保留目標自動為 `n−1`，例如 `31` → `31%／30%`。先預覽確認並提醒 1 個百分點可能頻繁縮減；不接受舊雙數字輸入。更新／讀取不自動改寫舊保存比例；即使輸入的觸發值相同，只要舊保留值不同，確認後仍保存新 n−1。取消、完整同值、對話／分支／模型／設定異動不覆寫。保存後下一次請求生效，不需要 reload，不立刻裁切或恢復歷史。

**停用是停用自動縮減，不是停用安全保護。** 停用時不自動裁切／工具預覽，不提交新游標；已成功裁切的游標仍保持，不恢復已排除的舊上下文。超過本對話觸發比例所界定的安全輸入門檻時停止，不硬送超量內容，不改用 AI 摘要。Native threshold／manual／overflow compaction 與 tree 摘要仍取消。開啟時仍保護 system、最新 user、任務錨點與最近完整工具批次，保留配對與原始紀錄／簽章；只有匹配且健康的 Main 回應、同一分支／比例／模型才提交裁切候選。

### 對話預算與 Pi 原生基準分工

Pi 1.1.0／1.2.0 公開 API **沒有每對話原生 compaction token 設定 setter**，所以不會把對話比例寫成全域／其他對話的預算。ACM 每次請求由 Pi 活躍 `contextWindow` 與本分支比例計算滑動門檻／保留目標；producer 與獨立 guard 核對相同 policy／模型 fingerprint 與一次性批准。不存在 legacy 105 萬第二層軟上限。

Pi `settings.json` 的 ordinary／每模型 native compaction budget 是 Pi 自己的共用設定，不是 ACM owner。**原生同步與數值必須匹配 ACM 的驗證已退役**；載入、模型切換、比例／開關／預設、狀態、分析均不寫 native。原生預算不同不阻擋有效的 ACM 請求，但 Pi 自己仍驗其設定格式；模型容量、ACM 比例、實際預算與一次性批准繼續 fail closed。提前 native threshold／overflow 仍取消摘要，ACM 自己判定送出窗口。

選單「檢查／修復 ACM 遺留原生設定」只在明確選擇與確認後操作。目前模型 native 欄位必須與 `acm.autoInit.models` 管理紀錄相符；有容量交易前備份可還原該次備份值（不是最早原值保證），沒有原值可明確選擇移除管理欄位，回到 project／ordinary／Pi 預設。普通 `compaction.reserveTokens`／`keepRecentTokens` 也顯示並預測移除後有效值；來源未知的一般設定、使用者改值、其他模型與無關欄位保持，必要時人工對帳。先保存 private 原始 bytes／mode／receipt，再 CAS 寫入及 reload；選單可有條件回復上次修復，後續修改／不同模型／未知鎖／symlink／pending 容量交易均拒絕。

Pi 1.2.0 沒有辨識 ACM threshold 取消並單獨靜默的公開 result 欄位；**本版不保證取消提示消失**，不 monkey-patch Pi、不攔終端文字、不隱藏 manual／overflow／其他錯誤。

Footer 嚴格只顯示 **`ACM n%`**，例如 `ACM 31%`；n 是本對話觸發設定，不是即時用量。無箭頭／保留目標／停用附註／Pi窗口；停用仍顯示設定，開關與保留詳情從選單／狀態查。實際容量／用量／百分比由 Pi 原生顯示。狀態分開列本對話、新對話預設與共用原生基準，不混稱已同步。

### 唯讀分析

獨立 **`/acm-analysis(piecd100)`** 已恢復，可附 `json` 查技術資料；ACM 選單「讀檔／縮減分析」與 `/acm(piecd100) analysis[-json]` 使用同一 callback，不送模型、不產生 AI 摘要。裸 `/acm-analysis` 只提示完整指令，其餘已移除快捷不恢復。

選單「讀檔／縮減分析」或同一入口 `analysis`／`analysis-json`；不送模型、不重讀磁碟。最近 **40 次成功縮減**的逐檔成功 read／同範圍重讀／舊結果移出後再讀候選表，不是 40 輪回應；完整 owning tool batch、分段／nested／缺證據／有界窗口規則保持。畫面先表再判讀，最多 20 檔；JSON 保留有界全表及證據。

比例建議另用最近最多 **5 次同模型／比例／相容容量縮減 × 後續 5 次回應**，現在以本對話比例過濾。少於 3 次或歷史／校準不足只建議維持，不用最後一筆陌生路由猜目前值。重讀不是浪費率，Token／cache／費用不是訂閱額度證明；不自動調參或讀回已移出的結果。詳見 `docs/ACM_SESSION.md`。

## `/context(peicd100)`：獨立 Pi 模型容量

直接改 `models.json.providers[目前 provider].modelOverrides[目前 model].contextWindow`，由真正 Pi ModelRuntime local-only refresh 與 fresh reload 啟用。模型 identity／thinkingLevel／credentials／其他模型保持；ACM 各分支比例與開關不變，按新 Pi 窗口重新計算請求預算。

`json`／`status` 唯讀；TUI 目前／272K／500K／1M／自訂／取消，明確參數如 `1m` 仍確認，非互動寫入需 `--confirm-unverified`。K=1000、M=1000000。官方已知超上限拒絕，未知可明確承擔風險，不受當前本機 272K 的第二層 ACM cap 阻擋。

官方 API GPT-6.1 Sol metadata 查核於 2026-10-13：上下文 1,050,000、最大輸出 128,000（[官方文件](https://developers.openai.com/api/docs/models/gpt-6.1-sol)）。**不是 Codex 訂閱／代理／連線上限證明**，service verification 仍 `UNKNOWN`，不做真模型探測。擴大可能 buffer／上下文／額度／成本錯誤，最大輸出不是全部保留量保證。

Models／settings joint locks＋fingerprint／CAS／private journal／atomic rename；**只修改 models 容量，settings 原始 bytes、native 與 ACM legacy 管理紀錄均保持**，settings lock 僅供一致性 Read Barrier；pending／外部變更不猜。Pi 本身讀不到新覆寫就安全 CAS 回退；已提交一致配置但 reload 失敗則保留並要求手動 reload，不用 stale context 還原後來的變更。孤兒恢復要 owner terminal 證據，不依 lock 年齡。只選定模型資料，不改其他 provider／auth／header／maxTokens／全域 token budgets；受信任專案衝突拒絕，未受信任專案不讀。

## Notify：只有 `/notify(piecd100)`

中文主選單：本對話開關（第一項）、切換單一通知方式、設定目前方式、新對話預設、狀態、明確測試、清除目前方式、取消。Telegram／Discord／Slack／generic HTTPS profiles 與秘密遮蔽輸入保留；一次只有一種 active 方式。已授權開關可工作中切換、不 abort／reload；新連線／清除／舊權限授權需閒置與確認。

新對話預設／active branch snapshot／授權 gate 保持。清除只清目前 profile，不清其他方式與 prefs，也不復活 legacy 來源。切換與保存 revision/CAS、awaited DNS／preDispatch 後重驗；不自動測試、補送或把舊通知轉送新方式。明確測試仍需授權，不應輸入秘密到 slash 參數。

固定 final settled／idle／無佇列／3 秒防抖終態通知；Goal 0.54.11 確定完成、手動等待／受阻／預算或額度停止才投影。一般 wait／retry／恢復暫錯保持安靜。例外只精確 `Provider retries exhausted` 的 active waiting、完全沒有 `resumeAt`，通知需要 follow-up／`/goal resume`，有期限（含 0）仍安靜；不改 Goal、不接管重試。

跨程序 claim／dedup／UNKNOWN 不重送；Telegram 固定 public HTTPS/TLS、DNS 全地址驗證、不 redirects、plain JSON，HTTP 成功且 API `ok:true` 才 ACCEPTED。所有方式固定安全文案，只對話名稱、可驗證的停止類別／下一步／UTC+8；不讀 prompt、raw error、objective 或秘密，不用模型產生通知、不全體 mentions。Startup／reload／切樹不補送，SDK／print／RPC 不自動通知。

## Suffix

`/suffix(peicd100)` 第一項本對話開關，共用 UTF-8 後綴文本、新對話預設 Off、預覽／狀態／取消。一般 interactive／RPC 人工提示在提交時追加一次，仍是 user role、images／原生與 ACM token count 保持；佇列凍結提交時文本，重試不 double，commands／bash／extension 自動訊息／舊歷史不加。空文本不可開啟，壞設定不猜內容；可明確關閉。Private 32 KiB／atomic CAS／exclusive lock，不放秘密，見 [後綴規則](docs/SUFFIX.md)。

## Theme／Activity

Theme 中文啟用模板／停用還原／狀態／取消。成功保存後 command-only 安全 reload 一次，取消／忙／同值／異動不 reload；reload 失敗保留已保存主題、提醒手動處理，不 stale rollback／循環。啟動不 auto apply，較新主題與未知原紀錄不猜。Pending 背景 `#404040`、success `#000000`，其餘 palette／正文／語法色不改。

Activity 未存偏好預設 Off；中文主選單或 `[on|off|status|json]`。獨立單行在原生 footer／status 下方，保留真正 FooterComponent，第三方未知佈局回退 widget。工作中可顯示／隱藏，不 abort／retry／reload／新增模型請求；隱藏停止自有每秒重繪，保留 readonly 背景觀察。使用單調時鐘、中文／ANSI 可見欄寬，久未活動不當成當機，不讀 prompt／工具參數／結果／Goal 私人內容。非 TUI 不啟動 UI timer。

## 資料、遷移與驗證

- ACM 新對話預設：`<agent-dir>/config/acm/defaults.json`；只有明確改預設才建立，4 KiB／0600／0700／atomic CAS＋joint exclusive lock。每對話開關／比例：原 session custom entries。原 settings.acm 比例只作初次 fallback；Pi compaction 開關不再作 ACM 初值，新版 private 預設存在後不復權。
- Native capacity／設定：`models.json`／`settings.json`；Context 只改前者。遺留修復備份／回復 receipt：private `config/acm/native-repair/`，不提交或分享。
- Notify：原 `config/webhook-notifier/` profiles／revision／authorization／receipts；legacy 資料只遷移／防重送證據。
- Suffix：`config/suffix/config.json`＋session；Activity：`config/activity-display/preferences.json`；Theme：`themes/pi-theme-user.json`、`config/pi-theme/toggle.json`。

不搬移／清除／提交私人資料，套件不是 credential store，Windows chmod 不等於 ACL 證明。不要同時載入本套件與舊三插件；見 [遷移流程](docs/MIGRATION.md)。原三 repos／標籤只留歷史，所有新 feature 在本套件維護。

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:target
npm test
npm run test:pi120
npm run check:package
npm run test:install
npm run test:remote
```

隔離 agent-dir／真正 SDK、mock 模型／DNS／HTTPS，不改個人配置、不真實 provider／Notify POST。歷史共享比例與 auto-init 回歸固定不可變 1.11 factory，目前 public 1.13 對話隔離／停用／單入口／native 分離／修復另有 genuine SDK suite；Pi 1.2.0 Gate 只驗目前 ACM／Context／公開入口契約，不將不可變 1.11 wire attestation 當作 1.2.0 全套支援證明；不把舊測試當新的 session budget attestation。新 runtime Hash／原 history Hash／UTF-8／隱私／pack／真 Pi install 與三系統 exact SHA Gate 見 [驗證](docs/VERIFICATION.md)、[發布](docs/RELEASING.md)。

Git 安裝僅 runtime `gpt-tokenizer`，不捆綁 Pi 宿主。`private:true`／`UNLICENSED` 防止意外 npm publish，GitHub 公開不等於一般開源授權，來源見 `NOTICE.md`。版本演進與退役機制見 `CHANGELOG.md`／`MODULES.json`；只有目前 active entries 有執行權威。
