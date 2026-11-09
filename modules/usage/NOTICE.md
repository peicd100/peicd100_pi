# Usage 來源與安全邊界

- 上游固定為 `@specode/pi-subscription-usage@1.5.0`，來源：<https://github.com/specode/pi-subscription-usage>。
- `vendor/specode-1.5.0/` 保留上游 `src/`、套件 metadata、MIT `LICENSE` 與 `THIRD_PARTY_NOTICES.md` 原始位元組；逐檔 SHA-256 見 `UPSTREAM_MANIFEST.json`。未修改使用者安裝的第三方套件。
- 上游另適配的 MIT 來源與著作權，依該資料夾的授權與第三方聲明保留；本模組不得刪除或取代這些聲明。
- 自有 UI、嚴格額度判定及防重帳本在 vendor 以外維護。上游顯示用 normalizer 可能 clamp／略過不完整欄位，因此不作自動恢復或用卡依據。
- 機器證據僅代表受控程式依來源契約嚴驗當次回應，不等於對真實帳戶、API 可用性或服務端行為的測試認證。一般驗證不查真憑證、不發真 provider 請求、不消耗真卡。
