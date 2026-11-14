# 輕量引用／依賴與影響查詢

這是開發期 CLI，不是常駐 Pi 擴充、不加入模型提示，也不呼叫 LLM、雲端或額外服務。使用目前套件支援的 Node.js；不需額外安裝解析套件。

## 1. 使用

```bash
# 先在套件根目錄執行。--out 請指定私密／忽略的衍生索引位置。
node scripts/ref-query.mjs build --out /path/to/private/references-index.json
node scripts/ref-query.mjs query panel --index /path/to/private/references-index.json
node scripts/ref-query.mjs query goal --all --index /path/to/private/references-index.json --json
node scripts/ref-query.mjs impact src/panel_v0.15.0.mjs --index /path/to/private/references-index.json
node scripts/ref-query.mjs verify --index /path/to/private/references-index.json
```

可用 `--root DIR` 指定來源根、`--limit 1..200` 限制查詢結果。未指定索引時 query/impact 在記憶體建立，不自動留下檔案。`verify` 發現過期回傳 exit 2；查詢過期索引會拒絕，請明確重新 build。`build --out` 對合法舊索引做 Hash 增量解析，輸出有短鎖／CAS／原子替換；不覆寫未知／損壞資料。

## 2. 證據等級與 active

- `EXTRACTED`：隔離 Node/V8 編譯器確認的靜態 module specifier。**不 link、不 evaluate、不載入被查程式，也不執行它的頂層副作用。** TypeScript 先用 Node 內建 strip 模式，無法處理即 UNKNOWN。
- `DECLARED`：詞法上的函式／指令／事件／工具名稱候選、type reference 或來源 fallback，不保證實際執行／註冊。字串中的例子也可能被列為候選，不得當 runtime 清單。
- `UNKNOWN`：動態 import／require 線索、無法編譯、歧義位置、未解相依、外部 binding、未跟隨 symlink 或 manifest 不符。不代表沒有相依。

預設 active 是 `package.json` Pi 入口的靜態依賴閉包，不靠最新檔名或 mtime。`--all` 包含測試、歷史與開發檔；未到達的檔案只叫「未證明到達／開發」，不自動判定廢棄。

`MODULES.json` 的 module-relative `preserved_paths`、歷史 files、shared_runtime 與 active_runtime 另外按來源 Hash 比對角色；保全／歷史與 active 可以同時成立。原始來源與歷史 facade 的舊 Hash 不復活成當前保全規則，已維護的未映射測試檔只標來源未被選用；明確保全／active Hash 不符則列 UNKNOWN。manifest 宣告不能覆蓋目前 facade 的靜態閉包。磁碟／manifest 資訊不是現在已安裝或正在執行版本的證明。

每筆帶來源 Hash；可確定的定位帶行號。遇重複字串或 escaped specifier 無法唯一定位時行號為 null 並說明，不猜第一個位置。顯示行號不是執行證明。

## 3. 新鮮度與邊界

索引綁來源完整內容 Hash、工具／解析器程式 Hash、Node/V8 版本與排除政策。增量只重編變動來源；查詢仍驗來源清單與 Hash，不只信時間戳。編譯期間來源變動會拒絕提交。

不遍歷 `.git`、`.peicd100`、node_modules、private、artifacts、archive、dist/build、coverage、隱藏目錄或 symlink。來源每檔 512 KiB、總 16 MiB、最多 2048 檔；只讀 JS/TS 來源和根 package/MODULES metadata，**不是完整素材／資料檔索引**。輸出沒有原始碼內文，仍含本機來源資訊，請勿把私密索引提交公開庫。

影響查詢回傳反向靜態引用、相關可執行測試，以及帶未知動態關係的保守測試候選；fixtures／helpers 另列 test support，不把它們冒充可直接執行的測試。事件匯流排、host 注入與真正 runtime 關係可能不完整，所以 `complete` 固定 false；**不能憑它跳過最後完整 Gate**。這是借用 Graphify 概念的輕量工具，不聲稱 vendor 任何同名上游套件。
