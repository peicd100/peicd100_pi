import { readFileSync, writeFileSync, mkdirSync, lstatSync, statSync, openSync, closeSync,
  fsyncSync, renameSync, unlinkSync, rmdirSync } from 'node:fs';
import { dirname, join, resolve, basename, matchesGlob } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

export const BUNDLE_SOURCE = 'git:github.com/peicd100/peicd100_pi';
export const ENTRIES = ['extensions/acm.ts', 'extensions/webhook.ts', 'extensions/theme.ts'];
export const THEME = 'modules/theme/themes/pi-theme-docker-look.json';
const MODULES = ['acm', 'webhook', 'theme'];
const REPOS = ['pi_acm', 'pi_webhook', 'pi_theme'];
const OLD_PATHS = [['extensions/index.ts', 'extensions/no-summary-guard.ts'], ['extensions/index.ts'], ['extensions/index.ts']];
const slash = s => s.replaceAll('\\', '/');
export const hash = b => createHash('sha256').update(b).digest('hex');
const plain = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const sourceOf = x => typeof x === 'string' ? x : x?.source;
function gitRepo(s) {
  if (typeof s !== 'string') return null;
  const match = /^git:(?:https:\/\/)?github\.com\/peicd100\/([^/@]+?)(?:\.git)?(?:@[^\s]+)?\/?$/i.exec(s);
  return match?.[1]?.toLowerCase() ?? null;
}
function sameSource(a, b, base) {
  if (gitRepo(a) || gitRepo(b)) return gitRepo(a) !== null && gitRepo(a) === gitRepo(b);
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const key = s => slash(resolve(base, s));
  return process.platform === 'win32' ? key(a).toLowerCase() === key(b).toLowerCase() : key(a) === key(b);
}
function selected(path, patterns, root) {
  if (patterns === undefined) return true;
  if (!Array.isArray(patterns) || patterns.some(p => typeof p !== 'string')) throw new Error('資源篩選格式無效；未變更。');
  if (patterns.length === 0) return false;
  const normalized = patterns.map(slash), exact = p => p.replace(/^\.\//, '') === path || p === slash(join(root, path));
  const glob = p => [path, basename(path), slash(join(root, path))].some(s => matchesGlob(s, p));
  const includes = normalized.filter(p => !/^[!+-]/.test(p));
  let enabled = includes.length === 0 || includes.some(glob);
  if (normalized.filter(p => p.startsWith('!')).some(p => glob(p.slice(1)))) enabled = false;
  if (normalized.filter(p => p.startsWith('+')).some(p => exact(p.slice(1)))) enabled = true;
  if (normalized.filter(p => p.startsWith('-')).some(p => exact(p.slice(1)))) enabled = false;
  return enabled;
}
function legacyIndex(entry, workspace, settingsDir) {
  const s = sourceOf(entry), repo = gitRepo(s);
  if (repo) return REPOS.indexOf(repo);
  return ['acm', 'pi_webhook', 'pi_theme'].findIndex(name => sameSource(s, join(workspace, name), settingsDir));
}
export function planMigration(settings, { workspace, settingsDir, targetSource = BUNDLE_SOURCE } = {}) {
  if (!plain(settings) || !Array.isArray(settings.packages ?? []) || !workspace || !settingsDir || typeof targetSource !== 'string' || !targetSource)
    throw new Error('遷移輸入無效；未修改設定。');
  const packages = settings.packages ?? [], old = new Map(), bundles = [], notes = [];
  for (const entry of packages) {
    const i = legacyIndex(entry, workspace, settingsDir);
    if (i >= 0) {
      if (old.has(i)) throw new Error('舊模組有重複來源；請先確認各來源的資源選擇。');
      if (plain(entry) && (entry.autoload === false || Object.keys(entry).some(k => !['source', 'extensions', 'themes', 'skills', 'prompts'].includes(k))))
        throw new Error('舊來源包含無法安全合併的篩選；請先用 pi config 處理。');
      old.set(i, entry);
    } else if (sameSource(sourceOf(entry), targetSource, settingsDir) || gitRepo(sourceOf(entry)) === 'peicd100_pi') bundles.push(entry);
  }
  if (bundles.length > 1) throw new Error('整合套件有重複來源；未猜測或覆寫。');
  if (old.size === 0) return { changed: false, settings, modules: null, notes: ['沒有舊來源需要遷移；不重写已選擇的整合套件設定。'] };
  const bundle = bundles[0];
  if (plain(bundle) && (bundle.autoload === false || Object.keys(bundle).some(k => !['source', 'extensions', 'themes', 'skills', 'prompts'].includes(k))))
    throw new Error('整合來源含無法安全合併的篩選；未修改。');
  const enabled = MODULES.map((_, i) => {
    const entry = old.get(i); if (!entry) return false;
    const root = join(workspace, ['acm', 'pi_webhook', 'pi_theme'][i]);
    const picked = OLD_PATHS[i].map(p => selected(p, plain(entry) ? entry.extensions : undefined, root));
    if (i === 0 && picked[0] !== picked[1]) notes.push('舊 ACM 只選了半套；依整合安全契約，主體與 guard 會一起載入。');
    return picked.some(Boolean) && selected(ENTRIES[i], plain(bundle) ? bundle.extensions : undefined, workspace);
  });
  const themeEntry = old.get(2), preset = !!themeEntry && selected('themes/pi-theme-docker-look.json', plain(themeEntry) ? themeEntry.themes : undefined, join(workspace, 'pi_theme'))
    && selected(THEME, plain(bundle) ? bundle.themes : undefined, workspace);
  const target = { source: targetSource, extensions: ENTRIES.filter((_, i) => enabled[i]), themes: preset ? [THEME] : [] };
  const nextPackages = []; let inserted = false;
  for (const entry of packages) {
    if (legacyIndex(entry, workspace, settingsDir) >= 0 || bundles.includes(entry)) {
      if (!inserted) { nextPackages.push(target); inserted = true; }
    } else nextPackages.push(entry);
  }
  return { changed: true, settings: { ...settings, packages: nextPackages }, modules: Object.fromEntries(MODULES.map((m, i) => [m, enabled[i]])), preset, notes, removed: old.size };
}
function read(path) {
  const s = lstatSync(path);
  if (!s.isFile() || s.isSymbolicLink() || s.size > 1024 * 1024) throw new Error('設定／備份必須是普通檔案且小於 1 MiB。');
  return readFileSync(path);
}
function parse(bytes) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text).equals(bytes)) throw new Error('設定不是有效 UTF-8；未修改。');
  try { const value = JSON.parse(text.replace(/^\uFEFF/, '')); if (!plain(value)) throw new Error(); return value; }
  catch { throw new Error('設定 JSON 無效；未修改。'); }
}
function privateDir(path) {
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const s = lstatSync(path);
  if (!s.isDirectory() || s.isSymbolicLink() || (process.platform !== 'win32' && (s.mode & 0o077)))
    throw new Error('備份目錄不是私人的普通目錄；未保存敏感設定。');
}
function safeBackupRoot(agentDir) {
  const config = join(agentDir, 'config');
  // Existing Pi config may have other modules; do not chmod or change their ACL.
  mkdirSync(config, { recursive: true, mode: 0o700 });
  if (!lstatSync(config).isDirectory() || lstatSync(config).isSymbolicLink()) throw new Error('config 目錄不安全。');
  const root = join(config, 'peicd100-pi'); privateDir(root);
  const migrations = join(root, 'migrations'); privateDir(migrations); return migrations;
}
function withLock(path, fn) {
  const lock = path + '.lock';
  try { mkdirSync(lock); } catch { throw new Error('Pi 設定正在使用或留下未知鎖定；未自動接管。'); }
  const identity = statSync(lock);
  try { return fn(); }
  finally {
    const s = statSync(lock);
    if (s.ino === identity.ino && s.birthtimeMs === identity.birthtimeMs) rmdirSync(lock);
  }
}
function replace(path, data, expected) {
  const temp = join(dirname(path), '.peicd100-' + randomUUID() + '.tmp'); let fd;
  try {
    fd = openSync(temp, 'wx', 0o600); writeFileSync(fd, data); fsyncSync(fd); closeSync(fd); fd = undefined;
    if (hash(read(path)) !== expected) throw new Error('設定已由其他操作變更；未覆寫。');
    renameSync(temp, path);
  } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
}
export function inspectMigration({ agentDir, workspace, targetSource = BUNDLE_SOURCE }) {
  const path = join(agentDir, 'settings.json'), bytes = read(path), plan = planMigration(parse(bytes), { workspace, settingsDir: agentDir, targetSource });
  return { ...plan, beforeHash: hash(bytes) };
}
export function migrate({ agentDir, workspace, targetSource = BUNDLE_SOURCE, expectedHash, beforeWrite = () => {} }) {
  const path = join(agentDir, 'settings.json');
  return withLock(path, () => {
    const before = read(path), beforeHash = hash(before);
    if (expectedHash !== beforeHash) throw new Error('預覽後設定已變更；請重新檢查，不覆寫。');
    const plan = planMigration(parse(before), { workspace, settingsDir: agentDir, targetSource });
    if (!plan.changed) return { status: 'NOOP', ...plan };
    const after = Buffer.from(JSON.stringify(plan.settings, null, 2) + '\n'), afterHash = hash(after);
    const backupDir = join(safeBackupRoot(agentDir), randomUUID()); privateDir(backupDir);
    writeFileSync(join(backupDir, 'settings.before.json'), before, { flag: 'wx', mode: 0o600 });
    const receiptPath = join(backupDir, 'receipt.json');
    const receipt = { version: 1, state: 'PREPARED', beforeHash, afterHash, modules: plan.modules, preset: plan.preset };
    writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    beforeWrite(); replace(path, after, beforeHash);
    // PREPARED + current==afterHash is recoverably committed even if this final
    // receipt write is interrupted. Never blindly replay or roll back foreign bytes.
    writeFileSync(receiptPath, JSON.stringify({ ...receipt, state: 'COMMITTED' }, null, 2) + '\n', { mode: 0o600 });
    return { status: 'PASS', backupDir, beforeHash, afterHash, modules: plan.modules, preset: plan.preset, notes: plan.notes, removed: plan.removed };
  });
}
export function restore({ agentDir, backupDir }) {
  const root = resolve(safeBackupRoot(agentDir)), dir = resolve(backupDir);
  if (dirname(dir) !== root || !/^[a-f0-9-]{36}$/.test(basename(dir))) throw new Error('只接受本 agent 的遷移備份。');
  privateDir(dir);
  const receipt = parse(read(join(dir, 'receipt.json'))), before = read(join(dir, 'settings.before.json'));
  if (receipt.version !== 1 || !['PREPARED', 'COMMITTED'].includes(receipt.state) || hash(before) !== receipt.beforeHash || !/^[a-f0-9]{64}$/.test(receipt.afterHash))
    throw new Error('備份與收據無法驗證；不還原。');
  const path = join(agentDir, 'settings.json');
  return withLock(path, () => {
    if (hash(read(path)) !== receipt.afterHash) throw new Error('遷移後設定已有新修改；不以舊備份覆寫。');
    replace(path, before, receipt.afterHash);
    writeFileSync(join(dir, 'receipt.json'), JSON.stringify({ ...receipt, state: 'RESTORED' }, null, 2) + '\n', { mode: 0o600 });
    return { status: 'RESTORED', beforeHash: receipt.beforeHash };
  });
}
