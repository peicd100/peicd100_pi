# 發布流程

1. 開發／實驗先在開發分支或 staging，通過 Gate 才發布穩定 main。一般使用者指令不固定版本，標籤用於追查與回退。
2. 原模組初始 runtime Hash 與不可變版本檔不就地改；實質改動新增版本路徑／同步入口，避免 ESM cache 復權。
3. 先 `npm run test:target`，再完整回歸、`check:package`、`test:install` 與 `npm pack --dry-run`；測試不接觸個人設定或真實模型／端點。
4. 按允許清單核對公開 tree：不含私有設定、URL／key、備份／收據、AGENTS／PEICD、node_modules 或大型 logs。不能默認 MIT，保留 UNLICENSED 與原模組聲明。
5. 明確授權後才 commit／一般快轉 push／新標籤；不 force、不移動舊標籤、不變更原三個倉庫。不 npm publish。
6. 先開發分支單次 workflow_dispatch exactSHA Linux／Windows／macOS完整 CI success，才同一SHA快轉 main／新tag；可用官方 `[skip ci]` 只省略相同SHA promotion的重複pushCI，不跳過manual驗證。exact main／tag SHA、`test:remote` 後才交付。
7. 發布完成後依使用者授權，順便更新目前工作環境同一已安裝套件：先核對來源／worktree 乾淨，私人備份 settings／必要資料並記 Hash，再 `pi update git:github.com/peicd100/peicd100_pi`，驗 HEAD／版本／loader、原設定篩選與資料保持。只更新本套件，不全面升級 npm，不強制 `/reload`；更新失敗需回報，不宣稱已載入新 runtime。local 或 pin 來源須先確認，不自動改成 Git。
8. `/pi-theme(piecd100)` 自動 reload 是使用者成功改變主題後的command-only流程，不是發布/update過程強制reload；活動widget只TUI/readonly，沒有模型或通知自動動作。新功能不因更新自動開啟高風險行為；原個人設定為權威。本機遷移另行 backup／CAS／驗證，仍由使用者閒置 reload，不能替正在執行的 Windows／Docker 對話操作。

Source 與 migration receipts 是恢復證據；未知 commit／push／設定更動要先對帳，不盲目重跑。
