# 1. 現行 ACM：1.19 控制整合／1.18 演算法

現行依 [0.17](TOOLBOX_0_17.md#3-acm-119-控制整合演算法仍為-118) 與 [Claude 1.18](ACM_1_18.md)。保留目標固定 n/2，所有對話自動生效；舊保存 targetPercent bytes 不參與執行。先遮舊工具結果／圖片、再整組移出，較早 user 進程式標記，不再釘首則或舊任務錨點；原 session／配對／健康 cursor 保持。三演算法區塊逐byte不改，沒有要求代理機械回憶或AI摘要。

控制中心 Current／新預設／共用 Context 分開。新預設時間線不覆寫原 defaults；共用 Context 單 target/revision、同原生模型另確認套用，不切帳號、不試送；metadata 不授權金融／送出或證明服務容量。未知／drift先hold。

---

# 2. 以下為 1.16 歷史候選：設定權威與恢復

以下保留原觀測／pending安全細節；n−1／首則任務錨點等舊演算法描述已被1.18取代，不可復權。

Legacy active policy schema維持；新增pending／每請求快照／四scope與被動離線觀測詳見 [1.16研究](acm-research_v1.16.0.md)。本頁是候選行為契約，不是loaded／實體或真服務PASS。原0.15文件保留於 [歷史](history/ACM_SESSION_0.15.0.md)。

## 唯一 owner

| 範圍 | 唯一來源 | 何時更新 |
| --- | --- | --- |
| 本對話開關／比例 | active branch 最新合法 `peicd100:acm-session-policy` custom entry | 首次初始化快照、閒置明確修改或pending在安全請求邊界CAS |
| 新對話預設 | private `config/acm/defaults.json` | 主選單明確改預設；不自動建立 |
| 未存新版預設的初值 | legacy `settings.acm` 比例，缺省 70／55、enabled true；不讀 native enabled | 只 initial fallback；private 存在後不復權 |
| 模型容量 | Pi 活躍 ModelRuntime 的 `contextWindow`，正式覆寫在 models.json | 獨立 `/context(peicd100)` 只改 models 容量＋joint lock/CAS/journal＋fresh reload |
| Pi 原生 compaction 設定 | Pi global／project merged ordinary／modelOverrides | ACM／Context 不同步；只允許選單明確、有管理證據的遺留修復 |
| 真正送出的 ACM 請求預算 | active branch policy＋當前真 Pi 模型窗口衍生，producer／guard 同 fingerprint | 每次 context_with_system，沒有並存的另一套百分比 |

Pi 1.1.0／1.2.0 沒有 session-scoped compaction budget setter。不得用合成 `getSettings()` clone 宣稱修改了原生 session 設定，也不得為切換本對話比例覆寫全域模型預算。共用 native threshold 可能比本對話門檻早／晚，它只能觸發被取消的原生摘要流程；真正下一次請求先由 ACM selector＋one-shot approval 驗證。

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

ACM 主選單 `/acm(piecd100)`＋獨立 `/acm-analysis(piecd100)`（同callback唯讀，可json），Context 仍獨立 `/context(peicd100)`。主選單第一項是本對話比例。內部 status／analysis／native repair callback 擷取後直接呼叫，只恢復 `/acm-analysis(piecd100)`，其他 `/acm-*` 不註冊、不 fake user message、不模型工具；除復原的 namespaced analysis 外，精確的舊裸／namespaced shortcut 輸入只顯示主入口提示並 handled，不進 model queue。

工作／佇列中只保存pending，不改當前私有深拷freeze policy、不abort工具；下一安全模型請求context才CAS，當前工具結果與批次配對完整。擷取session ID/file、branch epoch與保存時祖先、model identity/API/endpoint/capacity、runtime settings、branch policy／default bytes Hash與本機credential snapshotHMAC，漂移或保存收據不完整不重放舊候選。本機HMAC不是server帳號證明，unknown/env/ambient/async延後套用受阻，不額外login／refresh／resolve auth；閒置人類可重新明確確認。取消／同值不保存，跨await改值拒絕舊候選。不 reload 後使用 stale context。遺留 native repair 有額外預覽、明確確認、fingerprint／磁碟 CAS／原始備份與有條件 rollback；不把對話比例當全域 owner。

Defaults：4 KiB JSON／嚴格 schema、symlink／非 regular 拒絕，讀取不建檔；private 0700 目錄、0600 temp／鎖／設定，same-directory exclusive lock、Hash compare-and-swap、atomic replace。Windows transient share-lock 只重試同一次本機 rename，非 HTTP retry；未知鎖不依 age 接管。Windows chmod 不當 ACL 證明，鎖／磁碟錯誤不覆寫。

## 開關與安全

`enabled=false`：不執行 selectWindow、不做較舊工具結果的預覽裁短，不提交新 cursor。模型已看過的健康 crop cursor 仍用於下一次輸入，不能把 full raw transcript 自動復活。未超本分支觸發比例安全門檻的完整輸入可照常送；超過則取消／abort，在 transport 看到 aborted signal 時不發 HTTP，不退回 AI summary。

Producer 與 guard 都對 native/manual/overflow compaction、tree summary 取消，guard 不依賴 tokenizer。Guard 檢查批准 message array 身分、一次性 token 預算、本分支 policy＋模型 fingerprint；沒有 producer、陣列替換、批准重用、policy／model變更即 abort。停用縮減不撤掉以上護欄。

`enabled=true`：原配對／whole batch／current user/system/anchors／signatures／calibration／模型 route 隔離保留；native budget 不必匹配 ACM，不作 request approval prerequisite；Pi 自己仍檢查 native 格式。只有同一 Main response、healthy stop/toolUse、相同 boundary 與 policy/model key 才 commit candidate cursor，失敗／ESC／branch 或 policy異動不 promotion。比例／容量變更只影響下一次請求，不直接改 raw history。

## 驗證與限制

歷史schema／行為回歸 `tests/acm-session120.test.mjs`／`tests/acm-native130.test.mjs` 使用真正 Pi 1.1.0／1.2.0 loader／AgentSession／SessionManager／branch restore／私密磁碟 defaults，mock 只取代模型 wire；會遵守 pre-aborted signal，不能讓忽略 signal 的 mock 假裝已送出網路。

驗兩對話單輸入 95→95／94 vs 60→60／59 的實際 wire／健康 cursor 差異，global native budgets 相同；future-only 預設與磁碟 reopen；off under/oversafe/crop後不復活；malformed latest／private／one-shot／policy/model漂移；七入口／零工具、其餘舊快捷handled不LLM，裸analysis提示完整拼法；比例確認／取消／stale branch/defaultCAS、遺留 native repair／cancel／owned-vs-user-modified／backup／CAS／lock／rollback；真 models.json 500K／1M／native usage 與 fresh reload 另由 `pi-context-sdk100.test.mjs` 覆蓋。

舊 shared-config／auto-init 行為固定在 immutable 1.11 factories 回歸，不能當成 1.13 每對話原生預算或 Pi 1.2.0 歷史 wire attestation。沒有 real provider／Notify POST、現場強制 reload、人工 TUI pixels、Codex服務上限或所有 Pi版本支援保證。exact SHA／終態／三OS CI／發布以 task artifacts 為準。

## 保留 1.12.1 單數字與工具欄

本對話／新對話預設輸入n（可decimal／%），1<n<100，explicit寫trigger=n,target=n-1。保留1個百分點非1 Token；不保證實際選窗恰好target，也不保證不頻繁縮減。舊stored/custom/legacy比例不因reload/update/read自動改；相同trigger但舊target不同，確認後仍保存n-1；完整同值/取消/staledrift/CASfail不寫。

Footer沿原生值顯示 `ACM current%/trigger% currentK/triggerK │ 額度 7 天剩 N%`，目前值除以真容量，trigger來自本分支，不改容量或校準，未知明示；完整開關／pending留main/status。獨立analysis只使用既有analysis callback，main選項保留、[json]只讀無model/no summary/不改raw branch。目前整包九資源／十一入口／三模型工具；ACM本資源三入口／零模型工具，其餘已移除shortcut不恢復。
