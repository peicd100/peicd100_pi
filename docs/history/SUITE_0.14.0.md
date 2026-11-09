# 1. 自有 Goal／Progress／Focus

套件 0.14 的三個獨立資源，操作入口分別是 `/goal(piecd100)`、`/progress(piecd100)`、`/focus(piecd100)`。每個入口的同一選單項切換功能，無專用快捷鍵或額外 on/off 指令。共用選單保留方向鍵／Enter／Esc；可用的 fullscreen 公開 API 支援點選、滾輪與可見焦點，regular／未知宿主回退原生選單。

---

## 1.1 Goal 與授權

- 每對話單一目標；模型工具 `peicd100_goal` 的 `get` 唯讀。建立／編輯／刪除／恢復需要使用者確認，變更綁目前 ID/revision。建立即啟動，`draft` 例外；不是將一般聊天當開工。
- 驗收項目與具體 evidence 由 Goal 的 complete 提交；完成 Progress 清單不會完成 Goal。
- Goal 管理不 abort 正在執行的代理或工具；暫停／刪除取消尚未送出的後續排程。編輯於安全邊界採新版本；手動中斷同步暫停，不立刻復活。
- 原生 retry／compaction／queue 未終結不平行續跑；等待使用者／外部事件不忙迴圈。沒有回應數、執行時間、Token 或無進展次數的自訂停止上限，仍遵守宿主／服務／授權限制。
- 暫時連線故障於前一輪與原生 retry 結束後固定等待 5000ms，不限次、不退避；原生耗時與限流可讓實際發送間隔更長。手動打斷／暫停／刪除會取消未送出的重試，不盲重跑已完成副作用。
- 只有明確額度耗盡才 quota_exhausted；明確認證／權限／無效請求等不能原樣重試的永久錯誤也暫停。未知標 UNKNOWN，不輪詢額度或換帳戶／模型；修復後需明確恢復。
- 分支可讀快照但先暫停；reload／讀回不等於恢復授權。不同對話互不控制，不因讀回自動發模型請求。

## 1.2 Progress

模型工具 `update_progress` 不帶 `steps` 為查詢；替換現有清單需 `expected_revision`，最多 50 項、每項 503 字元、最多一個 in_progress。空陣列是明確清除。可填 `goal_id` 連結本對話 Goal，也可獨立用；清除／勾完不完成或刪除 Goal。狀態必須依實際證據回報。

## 1.3 儲存與原有套件

工作狀態只在本分支 custom entries（`peicd100:goal`／`peicd100:progress` 命名空間）；不改歷史訊息／工具結果或第三方資料。`config/peicd100-goal/`、`config/peicd100-progress/`、`config/peicd100-focus/` 的 preferences 只存 schema／enabled／revision；保存採 CAS、專用短鎖與原子替換，未知版本／鎖／symlink 保留、不猜修復。

新模組不依賴第三方 Goal runtime。使用前停用對應第三方 extensions 以免同名 progress 或雙重自動續跑，但保留套件／資料；套件安裝本身不偷偷修改其他 package filters。更新設定與實際 live runtime 不相同，閒置後自行 reload。

---

# 2. Focus 與 ACM

Focus 依實際可見文字／thinking／安全提示切組，預設一行；點選或原生工具展開控制可查看原序工具紀錄。標題用真實動作和狀態、不猜命令、不輸出路徑或結果摘要、不額外叫模型。工具執行結束不代表 Goal 驗收完成。**圖片依原設定留在群組外，含互動元件的群組維持展開。** 公開元件能力／排列不可驗時保留原生顯示；詳見 [Focus](../modules/focus/README.md)。

ACM footer 為 `ACM n% currentK/triggerK`，1K=1000、四捨五入整數、未知 ?K。分子重用 Pi native context estimate，分母為同一有效模型容量 × 本分支觸發比例；不是保留目標，且不等於 ACM 校準後 request-local 的精確觸發保證。顯示不重新掃歷史、不更改 selector／guard／native settings。

# 3. Notify

新 Goal adapter 優先處理自有目標的真實停止／完成；無自有狀態時保留舊 Goal 相容性。沿用 profiles、授權、開關、quiet、receipt 與去重，不自動開通知或改端點。等待／續跑／原生或五秒連線 retry 安靜；停止也須代理真 idle／queue clear 後才通知，同一 episode 一次。startup／reload 不補送，刪除不假稱完成，UNKNOWN 傳送不盲重送。固定安全文案，不含 objective、原始錯誤或秘密。
