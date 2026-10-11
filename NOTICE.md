# 來源與第三方說明

本套件整合維護者三個既有插件：ACM 1.5.1、Webhook 1.1.1、Theme 0.2.0。來源 commit 與初始檔案 SHA-256 見 `MODULES.json`；各模組的原有 LICENSE／NOTICE 保留。

整合不因此取得或授予新的上游一般授權。ACM／Webhook 原始完整上游來源尚未獨立確認；不能從其他同名套件推斷 MIT。本套件仍為 UNLICENSED。

執行時依賴 `gpt-tokenizer@3.4.0`（該套件宣告 MIT），保留其自身授權。Pi API 由使用者的 Pi 宿主提供，以 peerDependencies 宣告，不作為正式依賴捆綁。開發依賴保留其自身授權。

Theme 使用參考 Docker 風格配色，不代表 Docker 或 Pi 官方背書。
