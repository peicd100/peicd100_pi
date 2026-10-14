# ACM 1.12.0：設定權威與恢復

## 唯一 owner

| 範圍 | 唯一來源 | 何時更新 |
| --- | --- | --- |
| 本對話開關／比例 | active branch 最新合法 `peicd100:acm-session-policy` custom entry | 首次初始化快照、明確閒置修改本分支 |
| 新對話預設 | private `config/acm/defaults.json` | 主選單明確改預設；不自動建立 |
| 未存新版預設的初值 | legacy `settings.acm`／`compaction.enabled`，缺省 70／55、enabled true | 只 initial fallback；private 存在後不復權 |
| 模型容量 | Pi 活躍 ModelRuntime 的 `contextWindow`，正式覆寫在 models.json | 獨立 `/context(peicd100)` 雙檔交易＋fresh reload |
| Pi 原生 compaction 共用基準 | raw Pi global／project merged settings 的 ordinary／modelOverrides | ACM 主選單明確「共用原生設定同步」；Context 改容量時同步 |
| 真正送出的 ACM 請求預算 | active branch policy＋當前真 Pi 模型窗口衍生，producer／guard 同 fingerprint | 每次 context_with_system，沒有並存的另一套百分比 |

Pi 1.1.0 沒有 session-scoped compaction budget setter。不得用合成 `getSettings()` clone 宣稱修改了原生 session 設定，也不得為切換本對話比例覆寫全域模型預算。共用 native threshold 可能比本對話門檻早／晚，它只能觸發被取消的原生摘要流程；真正下一次請求先由 ACM selector＋one-shot approval 驗證。

## Schema

Private 預設（只有這四個欄位）：

```json
{"version":1,"enabled":true,"triggerPercent":70,"targetPercent":55}
```

Session custom entry（不參與模型上下文）：

```json
{
  "type":"custom",
  "customType":"peicd100:acm-session-policy",
  "data":{
    "version":1,
    "enabled":true,
    "triggerPercent":95,
    "targetPercent":90,
    "origin":"explicit",
    "defaultSnapshot":{"version":1,"enabled":true,"triggerPercent":70,"targetPercent":55}
  }
}
```

`origin=default|explicit`，修改本對話不改初始 `defaultSnapshot`。`getBranch()` 才是權威，`getEntries()` 包含的 abandoned branch 不得採用。最新 malformed 記錄不能跳過去復活舊 policy，也不能 fallback global；未初始化且 private default 壞掉同樣 fail closed。已有合法 branch policy 不因 private default 之後損壞而改變。狀態讀 private default 失敗可提示，但不能取代既有 branch。

新預設保存只改 defaults；已初始化對話與分支不變，未存設定的分支首次使用會初始化當時預設。恢復／reload 沿用目前分支快照，早於 policy 記錄的分支點沒有該記錄，不從 abandoned leaf 偷帶。

## 命令與併發

ACM 只註冊 `/acm(piecd100)`，Context 仍獨立 `/context(peicd100)`。主選單第一項是本對話比例。內部 status／analysis／native setup callback 擷取後直接呼叫，不註冊 `/acm-*`、不 fake user message、不模型工具；精確的舊裸／namespaced shortcut 輸入只顯示主入口提示並 handled，不進 model queue。

設定前後驗 idle／queued work、session ID/file、active leaf、lifecycle epoch、model identity/API/endpoint/capacity、runtime settings、branch policy 及 default bytes Hash。取消／同值不保存，跨 await 改值拒絕舊候選。不 reload 後使用 stale context。共用 native setup 有額外明確提示／原 fingerprint 與磁碟 CAS，不把對話比例當全域 owner。

Defaults：4 KiB JSON／嚴格 schema、symlink／非 regular 拒絕，讀取不建檔；private 0700 目錄、0600 temp／鎖／設定，same-directory exclusive lock、Hash compare-and-swap、atomic replace。Windows transient share-lock 只重試同一次本機 rename，非 HTTP retry；未知鎖不依 age 接管。Windows chmod 不當 ACL 證明，鎖／磁碟錯誤不覆寫。

## 開關與安全

`enabled=false`：不執行 selectWindow、不做較舊工具結果的預覽裁短，不提交新 cursor。模型已看過的健康 crop cursor 仍用於下一次輸入，不能把 full raw transcript 自動復活。未超本分支觸發比例安全門檻的完整輸入可照常送；超過則取消／abort，在 transport 看到 aborted signal 時不發 HTTP，不退回 AI summary。

Producer 與 guard 都對 native/manual/overflow compaction、tree summary 取消，guard 不依賴 tokenizer。Guard 檢查批准 message array 身分、一次性 token 預算、本分支 policy＋模型 fingerprint；沒有 producer、陣列替換、批准重用、policy／model變更即 abort。停用縮減不撤掉以上護欄。

`enabled=true`：原配對／whole batch／current user/system/anchors／signatures／calibration／模型 route 隔離保留；共用 native baseline 不一致仍阻請求。只有同一 Main response、healthy stop/toolUse、相同 boundary 與 policy/model key 才 commit candidate cursor，失敗／ESC／branch 或 policy異動不 promotion。比例／容量變更只影響下一次請求，不直接改 raw history。

## 驗證與限制

Current suite `tests/acm-session120.test.mjs` 使用真正 Pi 1.1.0 loader／AgentSession／SessionManager／branch restore／私密磁碟 defaults，mock 只取代模型 wire；會遵守 pre-aborted signal，不能讓忽略 signal 的 mock 假裝已送出網路。

驗兩對話 95／90 vs 60／50 的實際 wire／健康 cursor 差異，global native budgets 相同；future-only 預設與磁碟 reopen；off under/oversafe/crop後不復活；malformed latest／private／one-shot／policy/model漂移；六入口／零工具、舊快捷22種handled不LLM；比例確認／取消／stale branch/defaultCAS、共用 native callback；真 models.json 500K／1M／native usage 與 fresh reload 另由 `pi-context-sdk100.test.mjs` 覆蓋。

舊 shared-config／auto-init 行為固定在 immutable 1.11 factories 回歸，不能當成 1.12 每對話原生預算 attestation。沒有 real provider／Notify POST、現場強制 reload、人工 TUI pixels、Codex服務上限或所有 Pi版本支援保證。exact SHA／終態／三OS CI／發布以 task artifacts 為準。
