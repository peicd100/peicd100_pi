# 1. 0.16 候選自有套件契約

新增行為／未驗界線以 [0.16更新](TOOLBOX_0_16.md) 為準；原0.15契約完整保留在 [歷史](history/SUITE_0.15.0.md)，不與現行並列執行。候選不是遠端發布、實載或實體驗收證據。

九資源、十一個命名指令入口、三個獨立模型工具。`MODULES.json.active_runtime` 是目前公開入口 import-closure 的 Hash／選用集合；歷史 release／shared Hash 僅為保全證據，不是平行的 active runtime。歷史 0.14 說明見 [原文](history/SUITE_0.14.0.md)，不得覆蓋本版。

---

## 1.1 Goal：授權與額度恢復

`peicd100_goal` 的 get 唯讀，單一Goal、ID/revision/CAS、驗收證據與稽核保留。免逐次管理確認預設On可關，僅限新的使用者已交辦範圍；不擴張外部操作／發布／支出授權。人工pause／interrupt／Off／restore／branch優先，不得以edit/delete/create換掉同一人工停止邊界。管理不abort目前工作，建立啟動、draft例外。

沒有自設回應／Token／時間／無進展停止上限；暫時連線在原生retry終結後固定等待5000ms，不限次、不平行重入。額度恢復預設On可關，但必須是可辨識訂閱窗口、原請求前由native callback錨定的account/model/route、pause後新嚴格額度證據與當前授權同時吻合。不以display、auth-only或後來換帳號的健康額度冒充原請求證據。未知／付費billing／無錨定不猜恢復。

使用者等待／外部等待／原生與自有連線retry、已錨定且可自動核實的quota wait保持安靜。重啟／分支先暫停且清除錨定，不默啟；通知投影也不把這種讀回當新停止。卡片UNKNOWN依然hold，即使額度已恢復可續同Goal，也不補卡。

## 1.2 Progress

`update_progress` 不帶steps是查詢，替換清單須expected_revision，最多50項／每項503字元／最多一個in_progress。空清單是明確清除，可填本對話goal_id，但勾完清單不是Goal驗收。輸入框上方直接展收與完整清單入口，依高度保護輸入區；手動本對話選擇不因更新強展開。非空全完成後只隱藏常駐控件，資料與回報保留；受阻／關聯Goal不一致仍提示，不搶焦點或重掃歷史。

## 1.3 顯示、Footer 與 ACM

長對話窗口預設On可關，舊完成元件退出即時渲染，按需查看歷史；使用者訊息預設10畫面行，可調、縮放重算及獨立原位展開。thinking／工具依型別各組收合，正文一律保留；圖片、互動、權限、安全與錯誤保留，未知布局回原生。共用可捲彈窗固定關閉、Ctrl+C／Esc／滑鼠與焦點保護。正文純黑背景是獨立偏好，不改文字或宿主主題其他色彩。

單一display／Footer owner保留原生統計、其他狀態與Activity；模型reasoning在用量下一行、窄窗可換行。`ACM current%/trigger% currentK/triggerK │ 額度 7 天剩 N%` 的目前百分比用未取整native tokens／有效完整contextWindow四捨五入整數，未知?%；K未知?K。不從K反推、不掃歷史、不改ACM觸發、校準、窗口selector、guard或native budget。

## 1.4 Usage 與 Notify

Usage是單入口，不是可直接花卡的模型工具。返回／否預設，明選卡、二次確認；自動Off、同帳號持久防重、未知hold與限制見 [Usage](USAGE.md)。

`peicd100_notify` 僅title/body，介面預設On可關，必須既有已配置／已授權profile與本對話On，舊branch-only同意不提升停用profile。正常已授權發送不逐次確認；不能由模型換目的地、取得憑證或改設定，也不自動附prompt/history/error/cwd/objective。文字UTF8 bytes限制title160/body2048/wire4096，平台純文／轉義／提及中和與有限敏感檢查；不是保證語意DLP。

同目的地跨對話30s間隔、每600s最多3則；同對話／目的地之相同輸出內容永久保守去重。UNKNOWN不得換ID／改寫／換通道／curl盲重送；ACCEPTED只表示端點接受，不保證人已讀，也不是Goal驗收。主動與自動終態事件分離，agent-interface Off不自動改其他通知開關。

---

# 2. 儲存、界線與驗證

Goal正式驗收complete後隱藏常駐控件但保留完成回報／結算；本對話控制與future defaults分開，On不自動resume。結算只取request前已綁Goal/run/role的真SDK receipt，去重與reasoning子項不雙算，不以session totals／缺失0補值；來源估算／provider回報與訂閱實扣分開，外部角色未核實明示未知。

Goal／Progress使用本分支custom entries，不改訊息／第三方資料。偏好／收據在agent-dir的各自config子目錄，以revision/CAS／短鎖／原子替換保護；未配置的唯讀偏好不建立檔，未知schema／symlink／owner不猜修復。Usage與agent outbox收據只留必要hash／白名單狀態，不把秘密或原始自訂內文存入收據。

同一agent-dir／store-root的程序可協調；不同安裝不是跨OS全域鎖，Windows ACL／斷電／所有第三方終端像素不在已驗保證。這些extension與Pi相同OS權限，不是沙盒。

套件更新不自動刪除第三方包／資料，明確授權且自有驗通才停對應extensions；設定變更不等live runtime已reload。產品完成須目前公開入口、完整歷史／target／三SDK、實際pack／隔離安裝與同SHA三OS的terminal evidence；不以本文件或工廠fixture宣稱通過。詳見 [驗證](VERIFICATION.md)／[發布](RELEASING.md)。
