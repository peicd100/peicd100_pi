# 發布流程

1. 開發／實驗先在開發分支或 staging，通過 Gate 才發布穩定 main。一般使用者指令不固定版本，標籤用於追查與回退。
2. 原模組初始 runtime Hash 與不可變版本檔不就地改；實質改動新增版本路徑／同步入口，避免 ESM cache 復權。
3. 先 `npm run test:target`，再完整回歸、`check:package`、`test:install` 與 `npm pack --dry-run`；測試不接觸個人設定或真實模型／端點。
4. 按允許清單核對公開 tree：不含私有設定、URL／key、備份／收據、AGENTS／PEICD、node_modules 或大型 logs。不能默認 MIT，保留 UNLICENSED 與原模組聲明。
5. 明確授權後才 commit／一般快轉 push／新標籤；不 force、不移動舊標籤、不變更原三個倉庫。不 npm publish。
6. exact main／tag SHA、`test:remote` 與 Linux／Windows／macOS CI success 後才交付。
7. 新功能不因更新自動開啟高風險行為；原個人設定為權威。本機遷移另行 backup／CAS／驗證，仍由使用者閒置 reload，不能替正在執行的 Windows／Docker 對話操作。

Source 與 migration receipts 是恢復證據；未知 commit／push／設定更動要先對帳，不盲目重跑。
