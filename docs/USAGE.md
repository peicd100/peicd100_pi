# 1. Usage：查詢與明確支出界線

唯一入口 `/usage(piecd100)`。以宿主目前模型／已授權的適用OpenAI／Codex訂閱路由查詢，顯示繁中額度、卡數、效期UTC+8；不要求把token貼到對話，不把token／headers／完整HTTP錯誤回傳模型。未知／不適用／付費billing不冒充訂閱額度，不換帳號或端點尋找可用卡。

## 1.1 手動

返回／否是預設；使用者明確選卡後，再次確認才送一次兌換。UI、分支、模型／帳號路由、授權或卡revision變動使候選失效。忙碌／排隊／未知金融狀態不重入，不藉查詢重新發出POST。

## 1.2 自動

預設Off，限目前對話，支援一次成功即關與每次新耗盡最多一張。只選適用、已知有效且最早到期的卡；未知效期不自動用。只有嚴格證據證明耗盡才可保留／支出，不以Footer、猜測百分比或認證成功當作可花卡證據。

同帳號的episode／reservation／receipt使用持久短鎖協調，卡片操作單次dispatch，任何回應遺失／timeout／落盤失敗一律UNKNOWN hold。不得盲重送、補卡、換卡或在未恢復時連續耗卡；此時需人工對帳，不靠重啟／切分支／改偏好釋放。手動取消和原工作／UI優先。

# 2. Goal 額度恢復不是重新兌卡

Goal預設可核實額度恢復續跑，但原請求前native headers錨定、當前OAuth路由、新且嚴格的窗口額度證據都須吻合；不得以auth-only、其他帳號或未錨定的後來查詢重綁。重啟／分支／手動pause／interrupt／Off優先。

即使卡片兌換收據UNKNOWN，若之後原帳號額度已確實恢復，可繼續同Goal而不再花卡。反之，HTTP成功或端點接受也不是額度已恢復／Goal已完成的證據。

# 3. 限制與儲存

金融收據／鎖只協調同一agent-dir/account binding；不同獨立安裝沒有跨OS全域鎖。秘密只在可信宿主／本機client內使用，不在一般收據、模型工具回應或通知中保存。Windows ACL、服務實際接收與所有未來provider版本不因fixture測試而attested。

查詢／UI與金融引擎是分層的；功能以當前路由、權限、schema與嚴格證據為準，不保證任何模型／帳戶都有卡可兌。套件／原始碼採UNLICENSED；少量vendor協定解析程式的MIT與來源commit見 `modules/usage/NOTICE.md`，不是整包改MIT。
