# 1. 工具箱 0.17 本機候選

本版本未發布。磁碟版本、安裝來源、目前 loaded、實體畫面、服務端接受與訂閱實扣是不同證據，不因 metadata 或測試檔名就宣稱完成。仍為九個可選 Native resources、三個模型工具；加上總入口後為十二個指令。

## 1.1. 入口與作用域

- `/peicd100`：控制中心；各模組自己的入口仍存在。保留原輸入、焦點、選字、返回／取消與未存草稿保護。
- 本對話設定、新對話預設、電腦／使用者共用 Context 分開。新預設採可驗證時間線，不把今天的值回寫舊對話；時間未確認時只顯示 pending，不默啟。
- 只選 ACM、ACM＋Goal 或 ACM＋Usage，不會額外啟用被省略的資源。刻意省略協調 ACM resource 時，其他八資源保留原 legacy embedding；這不是完整跨帳號 Context 模式。只想停用自動縮減，請在本對話關 ACM，而不是移除整個協調資源。
- Native loader 每資源可有隔離 Jiti cache。選中 Goal／Usage 的 facade 只以有限 construction enrollment 將自己的公開註冊 API 交給同 root；固定 factory 在 root 內建構私有依賴。訊號不傳 Context、policy、route、receipt、credentials、任意 factory 或金融／送出／Goal 權限回調，回覆只有完成布林值；相同 Native UI-registry instance 才能加入。沒有 process-wide policy singleton。
- UI16 相容端點是同一 UI17 display 的 contract proxy，不是第二個 transcript coordinator；沒有把兩套渲染器疊在一起。

---

# 2. 共用 Context

`/context(peicd100)` 或控制中心「ACM／本機共用 Context 完整設定」進入彈窗。

1. **設定共用目標**：輸入正整數或 K／M（十進位），確認後原子 CAS 保存。沒有 250K 或其他猜測預設；非互動環境只允許唯讀。
2. **套用到目前原生模型**：另外確認。保存 bounded `models.json` 並公開 refresh/readback，再以 public `setModel` 選回完全相同 provider/model；不登入、不換帳號／模型／thinking、不發探測模型請求、不自動 reload。
3. 其他支援的帳號／模型沿同一 target/revision 在安全邊界核對；忙碌、佇列、tree／scope／revision 漂移、無法確定原生能力時先阻擋，不靜默縮小、截斷或另作摘要。數值不受原模型覆寫值不同而變成每帳號設定。

範圍為同一 Pi agent-dir 與作業系統使用者，私有設定在 `config/peicd100-context/<user-scope>/machine.json`。不同 agent-dir／OS 使用者不共用；不是跨電腦雲端同步。設定只保存 target/revision，不存 credentials。

## 2.1. 能力與送出界線

- 不提升來源原生目錄宣告。已知不足／未知實作／無法證明最後 payload callback 的 provider，不先呼叫其方法碰運氣；保留原 auth/catalog。
- 未設定時普通原生路徑維持舊行為，managed alias 不得借普通 legacy passthrough。
- 每次實際送出重新從當下 messages/system/tools 估算，輸出預算與實際 payload 上界核對；不拿 ACM 縮減前的舊 usage 當現在輸入。
- Managed request 只有精確 options object 的私有票才可進入；JSON／複製物件／UI metadata 不是許可。最後 `onPayload` 後再讀原 account CAS 與 scope、Off、abort、共用 revision；任何漂移就零模型送出，不重播。
- 本地 estimator、原生 catalog、已選模型 metadata 是本地證據，**不是服務端 tokenizer、真容量、接受請求或訂閱實扣證明**；服務端保持 `UNKNOWN`，不為測試送真請求。

---

# 3. ACM 1.19 控制整合，演算法仍為 1.18

[ACM 1.18](ACM_1_18.md) 的選窗、source rows／normalize／boundary、request window／mask／marker／candidate 區塊逐 byte 保持；`window_v1.6.0.mjs` 與 `threshold_v1.18.0.mjs` 不改。1.19 只是將新設定控制與 root 整合，不能把版本號當重新設計演算法。

- 保留目標固定為觸發 `n` 的一半，所有對話自動適用。舊保存 `targetPercent` 位元組可保持，但不參與執行；明確在原生比例設定輸入 `n` 後保存 `n/n÷2`。
- 先遮舊工具結果／圖片，再整組移出；較早的使用者訊息由程式放進標記，不再釘住首則。原 session 不刪；可在完整歷史看原文。
- 停用 ACM 不新增滑動／遮罩，也不恢復已提交的游標；安全 guard 仍在。不改成 AI 摘要或機械要求代理先回憶。
- Current 與 new-default、原生進階設定、待套用取消、分析各有明確意圖邊界；工作中只存 pending，不 abort 工具或改當前已批准請求。
- Context 導航不需要先拿到帳號送出權限。頁面 cached metadata 不讀 credentials，也不因「已套用」字樣授予金融／模型權限。

---

# 4. 多帳號 Usage／原生模型路由

Usage 頂端可選帳號；查看帳號與當前實際模型 provider／route 分開顯示，不因看另一個分頁就換登入或模型。

- Plus／Pro 的來源 plan 與五小時窗口分開。沒有五小時 bucket 不代表零使用或自動證明 unlimited；只有可驗證來源宣告才顯示無此限制，其他情況 UNKNOWN。
- OAuth 交給 Native public scoped provider/auth 流程，不手改 auth.json／複製 token／讀瀏覽器 cookies。Slot、allowlist、專案、route、model、thinking 與 switch grant 各自核對。
- Root 優先核對允許的免費帳號／路由，再到原有有限卡機制；不因 Goal 恢復、UI 欄位或已知容量而授權用卡。不擴充 paid fallback／每帳號 fake engine／平行金融出口。
- 卡與授權 ledger、episode、reservation、UNKNOWN hold、at-most-once、既有 CAS 及原生關卡仍為唯一 owner。Timeout／UNKNOWN 不補卡、不改 ID／帳號盲重送；Off 與人工停止優先。
- 額度 render 僅用既有 checkedAt 快照；不因重繪多發 HTTP。

真登入、plus/pro 真額度、卡與實扣仍需獨立授權的人類／真服務驗收；fixture PASS 不能替代。

---

# 5. Focus／Goal／Progress

- 保留已核對的長路徑尾檔名、工具折疊後高度、圖片顯示比例與不遮擋；不重新生成／轉碼原圖。
- 完整歷史為自動視野感知、分頁／有界載入與錨點保留，不再以點擊作為舊正文載入的必要條件；不改 SessionManager 原內容、使用者訊息或 ACM 模型窗口。未知布局回原生。
- Thinking／工具標題用可驗證的目前動作、進行中及實際耗時；不把缺證據值寫成「已知耗時」。
- Progress 預設單行，點該行展收，沒有最右側獨立按鈕；更新不強制重置閱讀狀態，完成清單不等於 Goal 驗收。
- Goal complete 不再為了「完成」額外 abort 正常 Native tool/model loop，代理可依上下文給最後報告；不硬塞保持沉默或必講特定文案。完成狀態不再自動續跑，人工停止／restore／restart 仍不能復活。
- 最後 Main 報告可以被 ACM 觀察，但已關閉 Goal run 不會被重新借用作結算；observed Main 與 matched native Goal settlement 分開。

---

# 6. 驗證與未完成邊界

以 `docs/VERIFICATION.md`、exact SHA、terminal log 為準，不在本頁硬寫易過時測試數。

- 1.1.0 完整歷史與當前相關；現用 1.5.2 當前功能／真正九公開入口；必要 1.2.0 歷史／入口；不可用舊 frozen PASS 充當新行為證明。
- package／lock／MODULES active dependency inventory、歷史 runtime Hash、UTF-8、TGZ 隱私閉包、隔離 install/list/update/remove/migrate。
- 沒有 Computer use、真 provider／通知／金融 POST、實體像素、服務端容量、Windows ACL 或三 OS CI 的隱含保證；未做者明說。
- 本機來源接線後仍須人類閒置 reload／重新啟動，再看實際 loaded 與畫面；不自動 reload 正在執行的對話。不 commit／push／tag／PR／發布。
