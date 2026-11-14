# Focus 0.3.1 候選修復

## 1. 修復範圍

- 原生長 write 的唯讀 call renderer 與 Text／Markdown／TruncatedText 可收合。原生 write 只信任公開 createWriteToolDefinition 的 reference-equal renderCall，不按工具名或 constructor.name 白名單。未知滑鼠、輸入、權限與錯誤仍保留；不讀 MouseRegion 的 private child。
- 標準 PNG 結果在主畫面使用一個原生 Image 元件，不收進文字詳情。透過外層工具的公開 setShowImages 關閉該工具重複圖槽，原有文字 delegate 仍不繪圖。關閉／卸載時恢復工具的原生圖片偏好；不改全域設定、結果內容、session 或模型上下文。
- 只取有效 Pi terminal.showImages 與公開終端 capabilities，不強迫 Kitty、不改環境、不另讀檔或產圖。偏好 Off 或圖片協定不可用就說明原因。非 PNG、自訂圖片、未知偏好或缺少公開 setter，保守交還原生路徑。
- 原生 Image 已建立／協定 bytes 已輸出，不等使用者實際看見。群組標題不再聲稱「圖片留主畫面」已成功；狀態 diagnostics 只有工具名／分類原因／預覽路徑，physicalVisible 永遠 UNVERIFIED，不含路徑、正文或圖片 payload。

## 2. 測試及實體驗收

本地回歸使用明確提供的既有 PNG 及 SHA，不生成或覆寫。包含長 write 收合與顯式展開、原生設定 On／Off、外層原生圖槽 On／Off 單 owner、無協定提示、實際 factory、重畫／捲回／停止恢復、真輸入與未知滑鼠不誤藏、錯誤仍可見。測試不對外呼叫模型、授權或通知。

手動 reload 後確認 `/focus(piecd100) json` 的 version 為 0.3.1，再讀同一張既有圖片確認像素；確認長 write 預設收入群組，點查看或明確展開仍可讀完整原序，確認／輸入不被藏。原 0.3.0 截圖中的空白屬未通過後驗，不能因新回歸通過就改稱原本成功。

若仍無圖，請回報狀態 diagnostics 及畫面。先核對 preview 是 disabled、protocol-unavailable、native-outer-fallback 或 native-image-component；最後一個只代表建立元件，仍須查實際傳輸／重繪與終端。不要改 metadata 假 PASS、不自動重載、不強改終端協定。
