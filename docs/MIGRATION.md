# 一次性來源遷移

遷移只更改 Pi settings 的 `packages`，不執行任何插件 lifecycle，不搬移／清除通知、配色、收據、session 或其他設定，不自動重新載入。

## 先預覽，確認後切換

新使用者只需正常 `pi install git:github.com/peicd100/peicd100_pi`，沒有舊來源時不需遷移。

已有舊 Git 套件的使用者：先安裝整合套件，**暫時不要 /reload／重啟或開新對話**。找到安裝目錄（`pi list` 可查），使用該套件的 `scripts/migrate.mjs`。

以下 `<bundle-dir>` 指整合套件目錄；不要把尖括號原樣輸入：

```sh
node "<bundle-dir>/scripts/migrate.mjs"
node "<bundle-dir>/scripts/migrate.mjs" --apply
```

預設目標為不固定版本 Git 來源。已安裝的整合套件篩選不會被擅自重新啟用；與舊模組選擇合併採更保守的交集。

本機工作區（舊三套在同一層）：從工作區根執行：

```sh
node peicd100_pi/scripts/migrate.mjs --source ./peicd100_pi
node peicd100_pi/scripts/migrate.mjs --source ./peicd100_pi --apply
```

本機 source 請傳絕對路徑，或使用 `--source` 的 cwd-relative 路徑（CLI 會解析為絕對路徑）。已安裝執行依賴後才掛載本機來源。

自訂 agent-dir 用 `--agent-dir`，舊本機插件不在目前工作區用 `--workspace`。支援三個舊公開 Git URL（可帶版本）及指定工作區的 `acm/`、`pi_webhook/`、`pi_theme/`；不以資料夾名字猜測其他位置的插件。

## 篩選與安全

- 保留其他 packages、theme／ACM budgets、通知資料與所有非 packages 欄位。
- 各舊模組的資源選擇映射到三個新入口；明確關閉不重新打開，缺少的舊模組不自動啟用。
- ACM 若只啟用主體或只啟用 guard，整合視為一項，兩者一起載入，預覽明確提示。
- `autoload:false` 等不能安全合併的複雜 scope／重複來源先拒絕，請用 `pi config` 人工處理。
- 遷移只處理指定個人 settings。若專案 `.pi/settings.json` 仍宣告舊來源，必須另外確認專案設定；不能只遷移個人來源就保證沒有跨 scope 重複。
- 獨占 Pi-compatible `settings.json.lock`，以預覽 SHA-256／寫前 CAS 防止覆寫較新設定。
- 每次有變更都在 `<agent-dir>/config/peicd100-pi/migrations/<id>/` 保存原始 bytes 與收據，POSIX 0700／0600；Windows 不宣稱 ACL 驗證。不要提交或分享備份。
- `PREPARED` 收據搭配目前 settings 等於 `afterHash` 表示更動已提交，即使最後寫收據中斷也不得重跑。
- 本工具不下載／更新 Git checkout；Git 套件先 `pi install`，本機來源先安裝依賴。source 切換前確保新套件存在。

遷移後 `pi list`／`pi config` 確認只有一份整合功能，再等閒置與佇列清空後 `/reload` 或重啟。

## 有條件回復

```sh
node "<bundle-dir>/scripts/migrate.mjs" --restore "<backup-dir>"
```

只有目前 settings 仍等於這次遷移的 `afterHash` 才可還原。已有任何後續設定修改時拒絕整份回復；先人工對帳來源，不得用舊備份覆蓋新資料。回復只恢復設定，不重裝曾移除的 Git checkout；必要時依原來源重新安裝後才 reload。

如果你在遷移前先安裝整合套件，備份包含那個已安裝來源；回復可能還原成整合＋舊來源並存，請先用 `pi config`／`pi remove` 整理，不要直接 reload。備份是 bytes 證據，不代表備份內來源一定適合重新載入。
