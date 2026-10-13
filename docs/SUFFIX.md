# 後綴提示詞與中文主選單（0.11.0）

## 入口

- `/suffix(peicd100)`：本對話開關（第一項）、編輯共用後綴、新對話預設、預覽、查看設定、取消。快捷 `[on|off|status|json]` 保留互動管理，不接受提示內容作為指令參數。
- `/notify(piecd100)`：第一項切換本對話通知，再選方式、設定目前方式、新對話預設、狀態、明確測試、清除、取消。原權限／授權與固定停止事件規則不變；快捷指令保留。
- `/acm(piecd100)`：中文主選單整合狀態、觸發／保留比例、Pi模型容量、讀檔／縮減分析、原生同步。直接分派原指令，不製造user提示，不新增關閉安全保護功能；既有acm/context快捷全部保留。
- `/pi-theme(piecd100)`、`/pi-activity(piecd100)`：既有中文主選單加查看設定／取消；設定與原功能不變。

歷史指令拼字保留：Suffix和Context使用`peicd100`，其它使用`piecd100`，沒有裸別名。

## 後綴範圍

新裝預設停用。共用後綴設定在 agent-dir 的 `config/suffix/config.json`，UTF-8、32 KiB內容限制；POSIX0600/目錄0700、原子rename、exclusive lock、UI snapshot CAS。不是Secret Store，勿放入密碼／token；不把內容寫入執行log或版本庫。鎖存在不猜測過期、不自行接管；崩潰後須人工確認owner終止再處理。

每個對話／active branch在非模型context的custom entry `peicd100:suffix-policy` 記開關及初始化時預設快照。首次載入模組的既有對話視為尚未初始化，採當時預設一次；恢復舊對話沿用其開關。分支繼承分支點已有的開關；不同分支後續開關互不覆蓋。不讀abandoned branch作目前狀態。改新對話預設不改已初始化對話；全域後綴文字修改影響已啟用對話的後續提交。

只在Pi原生input事件對interactive/RPC一般使用者提示追加 `原提示 + \n\n + 後綴`，images保留；保持user role，不升格為system。轉換後提示由Pi正常保存並計入ACM容量。斜線管理指令、bash、空提示、extension注入的自動訊息不追加；模型回覆、工具結果、重試／自動續跑無input事件，不重複追加。不靠字尾相同判去重：使用者原文即使包含後綴，仍算新input追加一次。

工作中的人工steer/follow-up仍是新提示，於提交時追加一次；佇列保留提交時後綴，不因之後全域修改而重寫或再追加。舊history完全不改。空後綴不能新啟用；若共用內容清空或設定壞掉，已啟用對話下一次一般提示會被攔下並提醒設定／關閉，不偷偷送缺後綴的提示。停用對話不受後綴檔壞掉影響。

取消UI不寫入。對話／branch／設定在選單期間改變則拒绝提交，不用舊snapshot覆寫。成功設定不強制reload、不中止工作；第一次安裝新版本後閒置 `/reload` 載入資源。

## 資源／相容性

第五個root資源 `extensions/suffix.ts` 在同一套件 `pi.extensions` 明確掛載。可獨立停用Suffix，不影響ACM producer/guard配對。ACM容量、原native比例、footer不額外Pi窗口、通知HTTP與Goal policy、Theme正文色／404040 pending、Activity背景觀察均保持。
