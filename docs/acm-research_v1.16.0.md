# 1. ACM 研究觀測：被動收集與離線影子

這是 **觀測工具，不是自動調參、真實 A/B、品質裁判或訂閱扣款帳單**。預設不額外呼叫模型、不呼叫供應商 API、不解析或刷新登入，也不改 Claude 作者的必要閱讀、圖片或故事素材。

## 1.1. 工作中修改設定

本對話正在請求、執行工具或仍有佇列時，ACM 選單只保存 pending。當前請求使用自己的私有深拷／freeze policy snapshot，不因輸入新值而改變。下一個安全的 `context_with_system` 邊界，確認沒有尚在處理的 Main 請求後，才 CAS 套用。

單一觸發值 n 沿用 n→n−1；舊資料80/70或70/55在讀取、開關及還原時不自動改成相差1。新對話預設與本對話設定分開。取消 pending 不撤回已完成工作、不恢復已縮減的歷史、不 abort 工具。部分保存收據無法核實時不宣稱 rollback，會阻擋舊期望值重放。

session／檔案、branch epoch與保存時祖先、模型／真容量／headers、設定及本機登入資料漂移時，不套舊 pending。登入綁定僅是 **public `readStoredCredential` 的本機 credential snapshot HMAC**，不是服務端帳號身分證明。任何憑證輪替會保守阻擋。env、ambient、空白、非同步或無法識別的本機登入資料不猜身分，延後套用受阻並提示；使用者可於閒置時重新明確確認設定，沿用既有即時保存／下一請求採用行為。ACM 不為此額外呼叫 `getProviderAuth`、login、refresh 或服務。

---

# 2. 實際紀錄與不能推論的事

所有新紀錄是 native session 的 `peicd100:acm-research` custom entry，不是給模型的訊息。原 session、模型輸入、headers、payload、Goal 與成功素材不被回寫或取代。

## 2.1. 請求、Goal 與 run

- 在 ACM 選定請求內容時凍結 request ID、Goal id/revision/status、policy key、版本、真容量與計數規則。
- `dataHash` 是既有 ACM `messageKey` 所涵蓋的**選定訊息內容／簽章等欄位**之雜湊；不是最終 HTTP payload 雜湊，也不是 cache-hit 證據。
- `codeHash` 綁定 producer 內明列的16項 ACM source／policy／package.json來源集合，包含觀測器、選擇器、校準、設定、pending、獨立 guard 等；不是整個 Pi／所有 UI、SDK 或外部供應商實作的完整雜湊。bundle tag為候選工作版本，SDK版本另列；正式發布仍須完整 package Gate 與 release Hash。
- 以 turn-start 邊界之後、同 native accounting scope／檔案、同凍結 Goal/revision/route 的**唯一 Main model operation**，綁原 Goal05 run/op。零個或多個候選均標 missing／ambiguous，不猜最新 run，不以 session totals 補值。
- 建立 Goal 之前的請求不因後來建立 Goal 而回填。晚到、未收到、被分支還原隔離、沒有可綁定 Goal/run 的資料均保留未知；缺失不當0。

## 2.2. 使用量、cache、重讀與完成

- 只讀實際 SDK assistant 結束訊息的 usage。input/cacheRead/cacheWrite/output/total分開；reasoning為output子項，不另加。
- provider回報費用與catalog估算分開，**訂閱實扣不可觀測**。failed/aborted預設全0視為未核實；response ID重複不雙計。
- provider callback／warming不會憑空產生研究請求、Goal operation或費用；callback次數不是HTTP或模型呼叫次數證明。
- 僅觀測已發生的 native `read`／`functions.read`。雜湊路徑與offset/limit，最多1MiB的純文字結果才做完整「工具文字結果」Hash；非原始檔案byte Hash。圖片、超限、失敗、缺失明示未知。其他工具／作者閱讀未觀測不等於0。
- 相同read key及文字結果Hash重複，僅表示觀測到相同結果；不證明 cache命中、可以省掉作者閱讀或真的省錢。
- Goal完成只存驗證條目數與Hash，不存完整驗證文字；它是**回報完成聲明**，不是獨立品質驗收。

每scope最多5000筆、每筆16KiB；read併發64、Main綁定4、tool owner快取256、完成聲明去重256。超限、無法保存或格式未核實時僅標觀測不完整／警告，不中斷原工作，不自動新增模型請求修補資料。觀測器不讀回故事檔案、不存訊息正文／簽章／credential／headers。

---

# 3. 離線使用

先取得**穩定、明確指定的本機JSONL快照**，不要拿還在變動的檔案冒充完整快照：

```sh
node scripts/acm-shadow.mjs --input path/to/snapshot.jsonl
node scripts/acm-shadow.mjs --input path/to/snapshot.jsonl --goal GOAL-ID --out NEW-report.json
```

- 只讀明確輸入；限制32MiB、200000行、一般非symlink檔案、有界fd讀取、UTF8／JSONL／schema檢查、讀取中異動拒絕。
- `--out` 僅建立新檔，拒絕覆寫。沒有 model、A/B、服務、調參或自動選K參數。
- 報表依scope／Goal／native run（未歸屬另組）／policy／codeHash分組，列已回報usage、缺失、矛盾、去重、晚到、read重複與完成聲明。
- 有明確native run綁定時，另外回讀**同run**的原Goal05 accounting投影，列Main／工具合計等已驗receipt角色、缺失與完整性。這是**另一份核對視圖**，不可再加到研究Main總數上，不能把外部Claude未驗明細、未提供usage的工具或訂閱實扣當0。
- `qualityGate`固定未獨立驗證、`costComparisonReady=false`、`ranking=null`。不同policy／dataHash並不構成相同工作量的配對比較；這個階段不做完整成本排名或推薦K。

若要做真實額外配對 A/B，仍需另外明確授權成本上限、工作量、品質門檻及停止條件。本工具不產生那份授權。
