# 1. 工具箱 0.16 歷史候選範圍

現行候選見 [0.17](TOOLBOX_0_17.md)。以下 n−1／舊入口數與預設顯示只是歷史，不覆蓋現行 n/2、共用Context或Progress單行。

本機候選，不代表遠端已發布、目前對話已 loaded，或實體終端／真服務已驗收。仍為九資源、十一個指令入口、三個模型工具，既有命名與安全授權不變。所有新元件共用0.16顯示owner，不混掛0.15顯示owner；歷史不可變檔與原斷言另保留。

## 1.1. 共用介面與閱讀

最新收尾為 [Focus 0.3.2／Usage 0.3.1](FOCUS_0_3_2.md)：普通唯讀錯誤收到紅色群組；詳情逐項預設單行、點擊原位展開、每次從清單底部開啟。原生圖片／真正互動與錯誤安全pin不改。

可控彈窗有外框、內距、標題／正文／操作區、短內容自適應；公開fullscreen mouse下外點只取消最上層並消耗事件，拖曳選字／滾輪／右鍵不誤關。確認外點不是Yes，未存表單有草稿保護；宿主認證、第三方及不支援布局保留原生，不強切終端模式。

助手正文裝飾保留原文／語法色，可靠折行與選字無法維持時回原生。使用者長訊息前N/M畫面行、隨寬重算、同背景留白與清楚展收，不改送模型的原話。Fullscreen長歷史依視野附近有界渲染、必要pin／錨點，讀舊訊息不拉底、不阻止agent工作；regular／未知布局保原生與歷史browser。不是所有模式逐行虛擬化或現場提速保證。

圖片仍由原生外層顯示，不被裝飾裁切。圖片／正文回報是Focus群組邊界，圖後新增思考／工具不回加舊組；只看實際來源，不以metadata宣稱圖片可見。測試使用明確授權的既有PNG，不生成／覆寫；記憶體終端傳輸和實體Herdr像素分開。

---

# 2. Goal、Progress 與帳目

Goal依狀態將暫停／繼續置頂，固定action IDs與提交前CAS；本對話控制與新對話預設分開，功能On不恢復已停Goal，人工停止／restore／完成barrier不變。Goal驗收完成與Progress非空全完成各自隱藏常駐控件但不刪資料；異常／受阻仍提示，不能靠勾完清單偽造Goal完成。

Progress直接展收、完整清單入口，更新不推翻本對話閱讀選擇。Goal accounting在請求前綁Goal/run/role，真正開始時間與可觀測執行／等待／暫停／gap分開，並行不重加歷時；SDK usage去重，reasoning為output子項，nested工具合計與child不雙算，建立Goal前／未綁／外部未驗receipt不補0或session totals。provider回報與目錄估算分開，都不冒充訂閱實扣。

---

# 3. Usage、卡與Footer

每分鐘single-flight刷新，使用原始checkedAt，過期／未知／429／Retry-After與錯誤暫緩不冒充fresh；render不加HTTP。可信bucket有剩餘條／重設時間；逐卡框／效期／詳情／明確使用按鈕，卡面點擊不提交，保留二次確認。

自動用卡預設Off，once／each與明確本對話有限N上限分開，不預選N或自動啟用。N受session/branch/account/model與持久ledger防重，UNKNOWN先對帳、不補送或換卡；每次須真恢復後又新耗盡，達N即關。首次有限grant前保存原schema前像，舊reader遇新版欄位fail closed；UI提示其他仍載舊版的對話相容限制。Goal額度恢復續跑不是用卡授權。

Footer沿原單owner重組，例如 `ACM 22%/25% 222K/250K  │  額度 7 天剩 54%`。本分支有真自動用卡grant時另接 `  │  已啟用自動重置 N 次`，N為既有帳本limit-used-held，不是卡庫存或原設定上限；Off隱藏，處理中／未知／待查明示，顯示本身不產生授權或POST。22%是原生目前tokens／真容量，25%是trigger，不改成相對已用89%；額度只有可信當前快照才有百分比，未知不當0。窄窗拆行，保留原生費用、模型reasoning、其他狀態與Activity。

---

# 4. ACM 與維護CLI

ACM工作中保存pending，在下一安全請求邊界套用，不中斷工具、不改本請求快照；n→n−1、舊pair／批次配對／錨點／真容量／校準／獨立guard不變。本機credential snapshot HMAC不是server帳號證明，unknown不猜、漂移不套舊pending。完整說明見 [ACM研究](acm-research_v1.16.0.md)。

```sh
node scripts/ref-query.mjs build --root PATH --out NEW-index.json
node scripts/acm-shadow.mjs --input snapshot.jsonl --out NEW-report.json
```

引用CLI僅確定性靜態source／Hash／EXTRACTED／DECLARED／UNKNOWN，不是loaded證明，不取代最後Gate。離線研究只被動資料，明確快照、有界讀取、報表不覆寫；品質固定未獨立驗證／不排名、不真A/B、不自動選K，不改作者必要閱讀或生圖授權。

---

# 5. 驗收、重載與發布分開

相關測試、完整Pi1.1歷史回歸／Pi1.5當前suite、package Hash／privacy／pack／隔離install是各自Gate；既有服務／終端／模型回應若被mock，不能宣稱真服務或實體通過。沒有擅自發布／推送、真卡／通知POST、額外模型A/B、Computer use或自動reload。

可重載驗收點先保存候選／前像／Hash／未驗清單並正式pause同Goal，通知後停止。只有使用者已reload且明確同意繼續，才讀回Memory、核實際loaded版本、恢復同Goal做後置驗收；磁碟package字串與測試fixture不是loaded證據。正式發布另依 [發布流程](RELEASING.md)，不能拿本機候選假稱遠端已更新。
