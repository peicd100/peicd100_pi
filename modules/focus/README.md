# 1. Focus 0.15：長對話與型別群組

長對話窗口預設On可關；舊完成元件退出即時渲染，歷史按需看，不裁掉session或模型上下文。使用者訊息預設10畫面行，可調／縮放重算／獨立原位展開。thinking與工具各按型別同組、預設收合；正文一律保留，不以長短決定隱藏。共用可捲彈窗有固定關閉／Ctrl+C／Esc／滑鼠與焦點保護；圖片、權限、互動、錯誤例外維持，未知布局回原生。

顯示偏好及能力狀態從同一入口查詢；正文純黑是Theme的獨立偏好。Footer、模型行、Activity由共享owner協調，不替換原生統計。當前規則以[套件契約](../../docs/SUITE.md)為準。

以下保留0.14工具群組設計與歷史測試範圍，不能當作0.15全部新功能已驗證。

同一套件的獨立資源 `extensions/focus.ts`。正式版本及發布狀態依套件 tag／Gate 證據，不以此文件冒稱已安裝或當前對話已重載。

## 1.1 操作

- 單一入口 `/focus(piecd100)`，選單內同一項切換；沿用共用鍵盤／滑鼠選單。
- 偏好只保存 schema／revision／enabled；不寫入模型對話或額外狀態訊息。
- 連續工具預設只有一個折疊標題。點選標題可展開；既有原生全部工具展開控制仍有效，不新增專用快捷鍵。
- 執行中的同一行顯示真實工具種類；平行顯示主要動作及另幾項執行中，不猜測命令用途、不顯示路徑、命令或結果摘要。
- 失敗指示放最前面；一欄文字顯示也保留 `!`。工具完成僅稱「執行結束」，不代表 Goal 驗收。
- `/focus(piecd100) json` 顯示能力、偏好與當前 layout 狀態，不輸出參數、工具結果或私人路徑。

---

# 2. 非破壞性顯示邊界

- 不改工具執行、參數、結果、歷史、模型輸入、原始圖片或 Pi 核心／第三方程式碼，不額外呼叫模型。
- 依公開 `Container.children` 中實際呈現的非工具元件判斷可見邊界，不猜測 assistant role 或只以 tool-result 事件分組。
- 保留文字、Pi 實際收到且顯示的 thinking、隱藏 thinking 的可見標籤、錯誤及第三方提示。真正無可見文字的訊息與空白不會切組。
- 只忽略色彩碼及原生 OSC133 prompt markers；未知終端協定與 image-only 元件保守視為邊界，避免誤藏圖片。
- 展開沿用原有 renderer。純文字的原生 read／bash 展開本體及關閉後的原生文字顯示有逐行 byte 比對；不宣稱所有第三方／圖片呈現逐像素相同。
- 使用者自訂 self-renderer 的滑鼠 focus／capture／座標及原 handler 保留；有互動或超出檢查上限的元件群組強制保持展開。權限對話不由本模組接管。
- 無法確認公開樹形排列、同時存在多個工具父容器或能力不支援時保留完整原生顯示，不憑推測合組。

## 2.1 已確認的圖片與互動例外

圖片由宿主在工具 renderer 外附加，純 renderer 無法把它移入群組或完全折起。本實作保留宿主原本的圖片設定與外層圖片，群組內不重繪該附加圖片通道；部分原生 fallback 可能顯示圖片文字標記。原始圖片及結果不變，自訂 renderer 仍收到原本的 `showImages` 設定。圖片留在外層、含互動元件的群組保持展開是已確認的設計例外；不得自行改宿主繞過。

---

# 3. 歷史0.14驗證範圍

0.15當前驗證另見 display/transcript/assistant/footer/focus-unified/candidate-bundle等150 tests與公開bundle/package Gate；需要當前source Hash、terminal結果與同SHA三OS，不以歷史測試冒充。

`tests/focus140.test.mjs` 使用 genuine SDK 的公開 ToolExecutionComponent、AssistantMessageComponent、Container 及實際第一方 renderer，涵蓋群組、串流、thinking／安全邊界、展開、錯誤、窄寬、互動與圖片限制。

`tests/focus-sdk140.test.mjs` 使用 genuine extension loader／AgentSession 驗單入口、偏好保存、scope 取消、八個工廠共存及零模型／對話寫入。測試在隔離目錄，不產生真模型請求或 Notify POST。

這些不是實體終端手動視覺驗收、完整套件安裝或三系統 CI 的替代品；實際結果依 exact-SHA CI／發布 Gate，不把單項測試當所有終端機的視覺保證。
