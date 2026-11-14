# 發布流程

## 1. 0.17 本機候選 Gate（不等於發布）

先本機 Source／前像SHA、隔離core與移植Gate，再metadata／歷史Hash／1.1完整／1.5.2當前全功能／必要1.2／TGZ閉包／local Git install-update-remove及資料CAS。`refresh-runtime-manifest.mjs` 預設唯讀，只有明確 `--write` 更新候選metadata，不改歷史versioned檔。舊candidate active聲明保存為superseded evidence，不偽稱正式release。

未發布、未CI或未手驗各自明示；工程完成不代替原Goal全部criteria／真容量／實扣或人類reload。沒有因此授權remote install、commit/push/tag/PR、CI dispatch、真登入／金融／模型。以下保留原流程細節，不得用舊0.16／1.5.0結果宣稱本版通過。

### 1.1. 原0.16候選流程（歷史）

先隔離開發／前像／manifest Hash，再最小相關SDK、完整Pi1.1歷史與target、Pi1.5完整當前0.16及保全0.15斷言、package／pack／隔離install。Pi1.5 runner以公用ESM test hook對齊同一host實例，不修改宿主或第三方。完整媒體Gate須明確提供 `PI_EXISTING_PNG_FIXTURE` 與 `PI_EXISTING_PNG_SHA256`，缺少就拒絕，不生圖、不以skip算全過。

本機候選與遠端main／tag／正式CURRENT_RELEASE分開。可重載驗收時保存候選／前像／Hash與未驗項，正式pause同Goal並通知後停止；不可自動reload／restart／換Goal或靠額度恢復越過。人類已reload且明確同意，才核真正loaded與後置實體回饋，不以磁碟版號／mock／metadata當真機PASS。沒有因此授權commit／push／CI dispatch／發布或額外真服務模型測試。

## 2. 正式發布（另需有效授權）

1. 開發／實驗先在開發分支或 staging，通過 Gate 才發布穩定 main。若開發與目前安裝共用目錄，先在隔離同repo worktree改入口／metadata並驗pack，避免新session提前載未驗版本；promotion以已核Hash/備份/CAS對帳代理owned候選與使用者變更，不整目錄reset或清除。一般使用者指令不固定版本，標籤用於追查與回退。
2. 原模組初始 runtime Hash 與不可變版本檔不就地改；實質改動新增版本路徑／同步入口，避免 ESM cache 復權。
3. 先 `npm run test:target`，再完整 Pi1.1.0 歷史回歸、`test:pi120` 明確1.13歷史 ACM／Context與當前公開入口、`test:pi150` 新套件／九資源十一入口三工具契約、`check:package`、`test:install` 與 `npm pack --dry-run`；測試不接觸個人設定或真實模型／端點。
4. 按允許清單核對公開 tree：不含私有設定、URL／key、備份／收據、AGENTS／PEICD、node_modules 或大型 logs。不能默認 MIT，保留 UNLICENSED 與原模組聲明。
5. 明確授權後才 commit／一般快轉 push／新標籤；不 force、不移動舊標籤、不變更原三個倉庫。不 npm publish。
6. 先開發分支單次 workflow_dispatch exactSHA Linux／Windows／macOS完整 CI success，才同一SHA快轉 main／新tag；可用官方 `[skip ci]` 只省略相同SHA promotion的重複pushCI，不跳過manual驗證。exact main／tag SHA、`test:remote` 後才交付。
7. 發布完成後依使用者授權，順便更新目前工作環境同一已安裝套件：先核對來源／worktree 乾淨，私人備份 settings／必要資料並記 Hash，再 `pi update git:github.com/peicd100/peicd100_pi`，驗 HEAD／版本／loader、原設定篩選與資料保持。若當次明確授權切換自有Goal/Progress，須自有驗證成功，後置CAS/備份/短鎖/原子修改指定package filters（自有source無篩選、對應第三方extensions=[]），只停用載入且保留套件與資料，不整檔回滾他人變更。只更新本套件，不全面升級 npm，不強制 `/reload`；更新失敗需回報，不宣稱已載入新 runtime。local 或 pin 來源須先確認，不自動改成 Git。
8. `/pi-theme(piecd100)` 自動 reload 是使用者成功改變主題後的command-only流程，不是發布/update過程強制reload；活動widget只TUI/readonly，沒有模型或通知自動動作。新功能不因更新自動開啟高風險行為；原個人設定為權威。本機遷移另行 backup／CAS／驗證，仍由使用者閒置 reload，不能替正在執行的 Windows／Docker 對話操作。

Source 與 migration receipts 是恢復證據；未知 commit／push／設定更動要先對帳，不盲目重跑。
