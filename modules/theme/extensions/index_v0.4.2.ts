import {namespaceAPI} from '../../../src/commands_v0.7.0.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getAgentDir, type ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { ToggleStore, TEMPLATE } from '../src/toggle_v0.2.0.mjs';
const VERSION='0.4.2';

export default function themeToggle(pi: ExtensionAPI) {
 pi=namespaceAPI(pi);
 const store = new ToggleStore(getAgentDir());
 let active: AbortController | undefined, epoch = 0;
 const invalidate = () => { epoch++; active?.abort(); };
 pi.on('session_start', invalidate); pi.on('session_tree', invalidate); pi.on('session_shutdown', invalidate);
 pi.registerCommand('pi-theme', {
  description: '中文模板開關：啟用我的模板，或停用並還原原本主題；不呼叫模型',
  handler: async (args, ctx) => {
   const notify = (text: string, kind: 'info' | 'warning' | 'error' = 'info') => ctx.ui.notify(text, kind);
   if (args.trim()) { notify('用法：/pi-theme；只以選單啟用或停用模板，不接受參數。', 'warning'); return; }
   if (ctx.mode !== 'tui') { notify('模板開關需要 Pi 互動式 TUI；未修改設定。', 'warning'); return; }
   if (active || !ctx.isIdle() || ctx.hasPendingMessages()) { notify('請等工作與訊息佇列完成；一次只能操作一個模板開關。', 'warning'); return; }
   const controller = new AbortController(); active = controller;
   const startEpoch = epoch, key = JSON.stringify([ctx.sessionManager.getSessionId(), ctx.sessionManager.getSessionFile() ?? ctx.cwd]);
   const live = () => !controller.signal.aborted && epoch === startEpoch && ctx.isIdle() && !ctx.hasPendingMessages() && JSON.stringify([ctx.sessionManager.getSessionId(), ctx.sessionManager.getSessionFile() ?? ctx.cwd]) === key;
   const guard = () => { if (!live()) throw new Error('對話或工作已變更；已取消模板操作。'); };
   const original = ctx.ui.theme; let applied: typeof original | undefined, committed=false, reload=false;
   const selection = (pi.getSettings() as any).theme ?? original.name ?? 'system';
   try {
    const saved = await store.read(); guard();
    const enabled = original.name === TEMPLATE;
    const labels=[`啟用我的模板（目前：${enabled?'已啟用':'未啟用'}）`,`停用並還原原本主題（目前：${enabled?'已啟用':'未啟用'}）`,'查看目前設定','取消'];
    const choice = await ctx.ui.select(`我的模板 ${VERSION}\n目前實際主題：${original.name??'未知'}；執行中設定：${selection}\n模板保存紀錄：${saved.state?(saved.state.enabled?'已啟用':'已停用'):'尚無紀錄'}；可還原主題：${saved.state?.previousTheme??'未知'}\n成功變更後保存並 reload；取消不改設定。`, labels, { signal: controller.signal });
    guard(); if (!choice) { notify('已取消；主題與設定不變。'); return; }
    if (ctx.ui.theme !== original) throw new Error('目前主題已由其他操作變更；未覆寫。');
    if(choice===labels[3])return;
    if(choice===labels[2]){notify(`目前主題：${original.name??'未知'}；保存選擇：${selection}；還原目標：${saved.state?.previousTheme??'尚無紀錄'}`);return;}
    const on = choice === labels[0];
    if (!on && choice !== labels[1]) throw new Error('未知模板選項；未修改設定。');
    if (on && enabled) { notify(saved.state ? '我的模板已啟用；未重寫設定。' : '我的模板已啟用，但沒有啟用前主題紀錄；可用 /settings 手動選回原主題。'); return; }
    if (!on && !enabled) { notify('目前未使用我的模板；保留你目前選擇的主題。'); return; }
    // Public setTheme(name) supports individual names, not light/dark pairs.
    // Never silently convert an automatic selection into a fixed theme.
    if (typeof selection !== 'string' || selection.includes('/')) throw new Error('目前是自動配對主題，官方開關接口無法完整還原此模式；請先在 /settings 選單一主題，未更改設定。');
    if (ctx.isProjectTrusted()) {
     try {
      const project = JSON.parse(readFileSync(join(ctx.cwd, '.pi', 'settings.json'), 'utf8'));
      if (Object.hasOwn(project, 'theme')) throw new Error('專案固定了主題；請先處理專案的 theme 覆蓋，未更改全域設定。');
     } catch (e: any) { if (e.code !== 'ENOENT') throw e; }
    }
    if (!on && !saved.state) throw new Error('找不到啟用前的主題紀錄；未猜測或更改，請用 /settings 選回原主題。');
    const target = on ? TEMPLATE : saved.state!.previousTheme;
    if (!ctx.ui.getTheme(target)) throw new Error(on ? '模板尚未載入；請確認安裝後，在閒置時 /reload 再試。' : '原本主題已不在可用清單；未更改，請用 /settings 選擇。');
    await store.save({ version: 1, enabled: on, previousTheme: on ? selection : saved.state!.previousTheme }, saved.hash, () => {
     guard(); if (ctx.ui.theme !== original) throw new Error('套用前主題已變更；未覆寫。');
     const result = ctx.ui.setTheme(target); applied = ctx.ui.theme;
     if (!result.success) throw new Error('官方主題接口套用失敗；模板紀錄已回退。');
    }, live);
    committed=true;
    if(!live()||ctx.ui.theme!==applied)return;
    reload=typeof ctx.reload==='function';
    notify(on ? '我的模板已啟用並保存；正文維持原色，標題與連結為淡紫色。' : '已停用我的模板，並保存還原啟用前的主題。');
    if(!reload)notify('目前接口不支援自動 reload；主題已保存，請在閒置時手動 /reload。','warning');
   } catch (e: any) {
    if(committed)return; // do not roll back a successful setter on later drift
    // Undo only our own visible selection, never a later change by another actor.
    if (applied && ctx.ui.theme === applied && live()) {
     const restored = ctx.ui.setTheme(selection);
     if (!restored.success) { ctx.ui.setTheme(original); notify('原主題檔案已變更，僅還原畫面；請用 /settings 核對保存選擇。', 'warning'); }
    }
    notify(e instanceof Error && !e.code && /[\u3400-\u9fff]/.test(e.message) ? e.message : '模板操作失敗；請檢查檔案、格式與權限，未記錄私人內容。', 'error');
   } finally { if (active === controller) active = undefined; controller.abort(); }
   // Release the store lock/controller before reload. Never use this context
   // after awaiting reload: it may be invalid even when reload rejects.
   if(reload){
    if(epoch!==startEpoch||!ctx.isIdle()||ctx.hasPendingMessages()||JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile()??ctx.cwd])!==key||ctx.ui.theme!==applied){
     notify('主題已保存；工作、佇列或對話已變更，未自動 reload。請稍後手動 /reload。','warning');return;
    }
    try{await ctx.reload();}catch{throw new Error('主題已保存，但自動 reload 未成功；請等閒置後手動 /reload。');}
    return;
   }
  },
 });
}
