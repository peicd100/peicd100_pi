# Goal／Progress 工具回傳精簡（2026-11-12）

由 Claude 依使用者直接授權實作。只改「模型讀到的文字」，`details`（介面、帳本、session 紀錄）與所有行為不變。

## 為什麼

一個長時間製作用的 Pi session（990 次模型呼叫）裡，`peicd100_goal` 被呼叫 32 次、`update_progress` 19 次。
goal 每次回傳 2,700 到 7,500 字，progress 每次 2,000 到 3,000 字，內容大多是模型用不到的帳務欄位，
或是模型剛寫進去的步驟原文。這些文字會留在上下文裡，之後每次呼叫都要再付一次。

## 現在回傳什麼

- `peicd100_goal`：`enabled`、`revision`、`automationBlocked`、`goal`（`id`、`revision`、`objective`、`criteria`、
  `status`、`reason`、`waiting`、`retry`、`verification`）、`controls`（`autonomousManagement`、`quotaRecovery`、
  `barrier.reason`、`barrier.goalId`）。完成時的結算只回一句「已記錄」，完整結算仍在 `details` 與 Goal 選單。
- `update_progress` 更新時：`revision`、`goalId`、步驟數、各狀態數量、進行中那一步的文字。
- `update_progress` 查詢時（不帶 `steps`）：仍回每一步的 `text` 與 `status`。
- 錯誤訊息原樣回傳。

## 檔案

新增：
- `src/compact-tool-result_20261112.ts`
- `tests/compact-tool-result.test.mjs`
- `docs/COMPACT_TOOL_RESULT_20261112.md`

修改（各一到兩行）：
- `modules/goal/extensions/index.ts`、`modules/progress/extensions/index.ts`：安裝時包一層。
- `src/runtime-coordinator_v0.17.0.ts`：協調器建立 Goal 的那一行包同一層，並多一行 import。

做法是在模組同步安裝期間暫時換掉同一個 `pi` 物件的 `registerTool`，裝完立刻還原，
所以模組裡依物件身分查表的地方看到的仍是原本的 `pi`。換不掉時（例如物件被凍結）就照原樣安裝。

## 驗證

- 新測試 6 項、既有 goal／progress／notify-goal 等 278 項，在本機安裝的 Pi SDK 1.5.2 通過。
- 沒有驗證的事：真實對話裡省下多少 token，要等下一集的 session 紀錄。

## 還原

把上面三個修改的檔案改回原本那一行，閒置時 reload。
