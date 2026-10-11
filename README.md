# PEICD100 Pi 工具箱

版本 `0.1.0`；套件／GitHub repo：`peicd100_pi`。把 ACM、Webhook、Theme 整合成**一個安裝與更新入口**，內部仍是獨立模組，原指令與套件外資料位置不改。

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

## 三個模組、原指令不變

| 資源 | 功能 | 指令 |
| --- | --- | --- |
| `extensions/acm.ts` | 無摘要上下文滑動＋獨立 no-summary guard | `/acm-status`、`/acm-analysis`、`/acm-config`、`/acm-setup` |
| `extensions/webhook.ts` | 必要資訊通知、防重送與對話偏好 | `/webhook`、`/webhook-status`、`/webhook-setup`、`/webhook-test`、`/webhook-on`、`/webhook-off`、`/webhook-events`、`/webhook-clear`、`/webhook-default`、`/webhook-session` |
| `extensions/theme.ts` | 中文模板啟用／停用還原 | `/pi-theme` |

在終端機 `pi config` 可分別停用三項，按 Tab 切換個人／專案範圍，再閒置 `/reload`。**ACM 主體與 guard 同一資源一起開關**，沒有單獨停用 guard 的公開入口。這不是安全沙盒，其他不可信插件仍可能破壞規則。

Theme 的主題 JSON 是另一個原生 theme 資源。停用 Theme 指令入口不會自動還原配色；如要還原，先 `/pi-theme` 選「停用並還原原本主題」，再停用資源。

### ACM

新安裝／reset 預設 70／55，已保存自訂值沿用。Footer 顯示有效門檻，例如 `ACM 95%→90%`；使用率由 Pi 原生 footer 顯示。`/acm-status json`、`/acm-analysis json` 保留技術欄位。

保護系統、最新使用者訊息、任務錨點與最近完整工具批次，維持配對、原始紀錄／簽章、路由隔離校準與單調游標。只在有效對應回覆後提交滑動邊界，不呼叫額外模型產生摘要。分析唯讀，目前分支最多 10,000 筆；重讀／費用／快取不是訂閱額度或浪費證明。

TUI 閒置時同步目前模型預算；明確自訂預算、停用設定或專案衝突不擅自覆蓋。未知模型／宿主以保守規則處理，必要內容過大時停止，不轉成摘要。停用整個 ACM 後會回到 Pi／其他插件的上下文行為，原生摘要可能恢復；不自動還原曾保存的模型預算。

### Webhook

總開關、新對話預設、此對話選擇互相獨立。新對話預設關閉；已有設定與既有對話選擇保持。總開關關閉連明確測試也阻擋；測試只越過此對話關閉。更新／載入不打開通知或補送歷史。

Discord 優先且只填端點；Slack／一般 JSON 可填 Bearer 金鑰。秘密只在遮蔽設定視窗輸入，不放指令參數。HTTPS 公開 DNS／443／TLS、metadata-only、防重送、不自動重試、送出時間與 UTC 偏移保持。未知收據不可刪除來重試。

`/webhook-test` 是你明確要求的**真實 POST**，Discord 保留 `@everyone`。SDK／print／RPC 不自動通知。成功表示端點接受，不保證裝置已顯示。`--no-session` 或尚未保存的空對話不承諾跨程序恢復。

### Theme

只兩項：啟用我的模板／停用還原。主題選擇由官方 API 保存，模板不在啟動時自動選用。原自訂主題仍可用；另選主題後，停用不覆寫較新選擇。

淡紫標題／連結 `#C7A0E8`、錯誤玫瑰紅 `#E07A86`、工具錯誤背景 `#3A2329`；模型正文與程式碼保留原色／語法色。不使用不穩定包色轉換、不改 Pi 本體或加模型背景。自動亮暗配對、專案固定主題或缺失原紀錄時拒絕不完整還原。256 色終端會近似，不控制終端機整體背景。

## 資料仍在原位置

- ACM：Pi `<agent-dir>/settings.json` 的 `acm`／`compaction`，與原 session entries。
- Webhook：`<agent-dir>/config/webhook-notifier/` 的 config、preferences、events／receipts。
- Theme：`<agent-dir>/themes/pi-theme-user.json`、`<agent-dir>/config/pi-theme/toggle.json` 與原 theme 選擇。

不搬移、清除或提交資料。設定由執行時檔案／session policy 決定，套件副本不充當 credential store。Windows chmod 不等於 ACL 證明。

## 已裝三個舊插件：只遷移一次

**不要同時載入整合套件與舊 ACM／Webhook／Theme。** 安裝新套件不會自動替你移除其他來源。

先完成安裝但不要重新啟動／`/reload`，照 `docs/MIGRATION.md` 的唯讀預覽與備份切換流程，或用 `pi remove` 移除原三個來源。舊資料不刪；遷移原篩選選擇，ACM 半套會依安全契約改成主體＋guard 一起載入。

舊三個倉庫／標籤保留歷史；後續只在本倉庫維護，避免四份程式碼同步。第一版先保持已驗證功能，不加統一大選單、對話目錄或其他新功能。

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
