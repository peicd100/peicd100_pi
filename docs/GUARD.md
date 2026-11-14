# Guard 0.1.0：只防大災難

工具箱 0.18.0 新增的獨立模組，預設開啟。Pi 插件（`extensions/guard.ts`）和 Claude Code 的 PreToolUse hook
（`modules/guard/bin/peicd100-guard.mjs claude-hook`）共用同一份檢查程式 `modules/guard/src/guard_v0.1.0.mjs`。

## 擋什麼

只擋主流災情，其他指令一律放行。擋下時回一段短說明：原因、建議改寫、「這個 session 之後都適用」。不跳視窗。

1. **遞迴刪除重要位置或它的上層**。重要位置自動計算：所有磁碟根目錄、家目錄和其中的桌面／文件／下載、
   Windows 與 Program Files、ProgramData、目前專案根（由工作目錄往上找 `.git`，找不到再找 `package.json`、`sf.py`、`AGENTS.md` 等）和它的上層。
   額外位置寫在設定檔 `extra_protected`。
2. **格式化或清除磁碟類**指令。
3. **路徑要到執行時才決定的遞迴刪除**：含變數、`~`、命令替換，或以萬用字元開頭；前面的 `cd` 用了變數之後的相對路徑；
   路徑來自前一個指令輸出（xargs、管線）。暫存資料夾變數開頭的路徑除外。
4. **包在另一層 shell 裡的遞迴刪除**（bash／PowerShell／cmd 互相包裝、eval、Invoke-Expression、EncodedCommand）。
5. **目標本身或底下有 junction／symlink 的遞迴刪除**（PowerShell 5.1 的遞迴刪除會跟著 junction）。掃描有上限，超過就放行並記錄。
6. **防竄改**：刪除、搬移或覆寫檢查程式、插件入口、Guard 設定檔、`~/.claude/settings.json`、`~/.pi/agent/settings.json`；
   編輯 Claude 設定時拿掉 Guard hook 或加入 `disableAllHooks`；編輯 Pi 設定時拿掉工具箱；把 Guard 設定改成關閉。

寫法變體都會辨識：bash、PowerShell、cmd 的刪除指令與別名，find／robocopy／rsync 的刪除模式，
以及 python／node 內嵌程式碼或腳本檔裡、路徑是字面值的遞迴刪除。路徑先正規化再比對（`/d/x`、`D:\x`、`D:/x`、`\\?\D:\x` 視為同一個，不分大小寫，相對路徑依工作目錄）。

## 不擋什麼

一般刪除（非遞迴、專案內的 build／dist／node_modules／暫存），以及腳本裡用變數組出的路徑（交給腳本作者）。

## 設定與紀錄

- 設定：`~/.pi/agent/config/peicd100-guard/config.json`，`{"enabled": true, "extra_protected": []}`。不存在就用預設值。
- 擋下紀錄：同資料夾 `blocks.jsonl`；檢查程式錯誤：`errors.jsonl`。檢查程式出錯時一律放行（fail open）並記錄。
- 看紀錄摘要：`node modules/guard/bin/peicd100-guard.mjs report`。
- 手動試一條指令：`node modules/guard/bin/peicd100-guard.mjs check --shell bash --cwd <資料夾> -- <指令>`。

## 提示詞

Pi 插件在 `before_agent_start` 把 3 行正面寫法加進 `promptGuidelines`（不改整份 system prompt，不破壞快取）。
不寫危險指令範例。

## 已知限制

- 比對指令文字，擋不完所有寫法；沒有作業系統層沙箱。
- 直接用編輯工具改檢查程式本身不擋（維護需要）；git 還原類操作不擋。
- 腳本內用變數組出的刪除路徑不檢查。
