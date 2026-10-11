import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { inspectMigration, migrate, restore, BUNDLE_SOURCE } from '../src/migration_v0.1.0.mjs';

const args = process.argv.slice(2), options = {
  agentDir: process.env.PI_CODING_AGENT_DIR ?? join(homedir(), '.pi', 'agent'),
  workspace: process.cwd(), targetSource: BUNDLE_SOURCE,
};
let apply = false, backup;
try {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--apply') { apply = true; continue; }
    if (!['--agent-dir', '--workspace', '--source', '--restore'].includes(args[i]) || !args[i + 1])
      throw new Error('用法：migrate.mjs [--apply] [--source 來源] [--workspace 舊本機插件根目錄] [--agent-dir 目錄]，或 --restore 備份目錄。');
    const flag = args[i++], value = args[i];
    if (flag === '--agent-dir') options.agentDir = resolve(value);
    if (flag === '--workspace') options.workspace = resolve(value);
    if (flag === '--source') options.targetSource = /^(git:|https:\/\/)/.test(value) ? value : resolve(value);
    if (flag === '--restore') backup = value;
  }
  if (backup) {
    if (apply) throw new Error('--restore 不可與 --apply 並用。');
    const result = restore({ agentDir: options.agentDir, backupDir: backup });
    console.log('已按 Hash 核對還原來源設定；資料未搬移。請等閒置後 /reload。');
    console.log(JSON.stringify(result));
  } else {
    const preview = inspectMigration(options);
    if (!apply) {
      console.log('唯讀預覽；沒有修改設定。確認整合套件已安裝且沒有其他操作寫設定，再加 --apply。');
      console.log(JSON.stringify({ changed: preview.changed, removed: preview.removed ?? 0, modules: preview.modules, preset: preview.preset, notes: preview.notes }, null, 2));
    } else {
      const result = migrate({ ...options, expectedHash: preview.beforeHash });
      console.log(result.status === 'NOOP' ? '沒有舊來源需要遷移；未改設定。' : '來源已一次切換；其他設定與套件外資料不變，不自動重新載入或切換主題。');
      if (result.backupDir) console.log('私人備份（不要提交或分享）：' + result.backupDir);
      console.log(JSON.stringify({ status: result.status, modules: result.modules, preset: result.preset, notes: result.notes }));
    }
  }
} catch (e) {
  // Never echo settings bodies, endpoint URLs, credentials, or arbitrary args.
  console.error(e instanceof Error && /[\u3400-\u9fff]/.test(e.message) ? e.message : '遷移未完成；請檢查設定、檔案與鎖定。不得盲目重跑，先核對目前來源與備份收據。');
  process.exitCode = 1;
}
