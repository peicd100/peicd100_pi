import { promises as fs, constants } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
export const VERSION = '0.2.0';
export const TEMPLATE = 'pi-theme-docker-look';
const digest = b => createHash('sha256').update(b).digest('hex');
export function validateState(value) {
 if (!value || Array.isArray(value) || value.version !== 1 || typeof value.enabled !== 'boolean' ||
  typeof value.previousTheme !== 'string' || !value.previousTheme || value.previousTheme.length > 255 ||
  /[\x00-\x1f\x7f/\\]/.test(value.previousTheme) || value.previousTheme === TEMPLATE ||
  Object.keys(value).some(k => !['version', 'enabled', 'previousTheme'].includes(k)))
  throw new Error('模板開關紀錄無效；不猜測或覆寫原本主題。');
 return { version: 1, enabled: value.enabled, previousTheme: value.previousTheme };
}
async function directory(path) {
 await fs.mkdir(path, { recursive: true, mode: 0o700 });
 const s = await fs.lstat(path);
 if (!s.isDirectory() || s.isSymbolicLink()) throw new Error('模板紀錄目錄不是安全的普通目錄。');
}
async function bytes(path) {
 let f;
 try {
  const s = await fs.lstat(path);
  if (!s.isFile() || s.isSymbolicLink()) throw new Error('模板紀錄不可為連結或特殊檔案。');
  f = await fs.open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  if ((await f.stat()).size > 4096) throw new Error('模板紀錄超過大小限制。');
  return await f.readFile();
 } catch (e) { if (e.code === 'ENOENT') return null; throw e; }
 finally { await f?.close(); }
}
async function stage(path, data) {
 const temp = path + '.' + randomUUID() + '.tmp'; let f;
 try { f = await fs.open(temp, 'wx', 0o600); await f.writeFile(data); await f.sync(); await f.close(); return temp; }
 catch (e) { await f?.close(); await fs.unlink(temp).catch(() => {}); throw e; }
}
export class ToggleStore {
 constructor(agent) { this.config = join(agent, 'config'); this.root = join(this.config, 'pi-theme'); this.path = join(this.root, 'toggle.json'); this.lock = join(this.root, 'toggle.lock'); }
 async snapshot() { const raw = await bytes(this.path); return { raw, hash: raw ? digest(raw) : null }; }
 async read() {
  const s = await this.snapshot(); if (!s.raw) return { ...s, state: null };
  const text = s.raw.toString('utf8');
  if (!Buffer.from(text).equals(s.raw) || text.startsWith('\uFEFF')) throw new Error('模板紀錄必須為 UTF-8 無 BOM。');
  try { return { ...s, state: validateState(JSON.parse(text)) }; }
  catch { throw new Error('模板紀錄無法驗證；未覆寫，請檢查 config/pi-theme/toggle.json。'); }
 }
 async save(input, expectedHash, apply, live = () => true) {
  const state = validateState(input), data = Buffer.from(JSON.stringify(state, null, 2) + '\n');
  await directory(this.config); await directory(this.root);
  try { await fs.mkdir(this.lock); } catch (e) { if (e.code === 'EEXIST') throw new Error('另一個模板開關作業持有鎖定；未自動接管。'); throw e; }
  const token = randomUUID(); let old, temp, written = false;
  try {
   await fs.writeFile(join(this.lock, 'owner.json'), JSON.stringify({ pid: process.pid, token }));
   old = await this.snapshot(); if (old.hash !== expectedHash || !live()) throw new Error('模板紀錄或對話已變更；未套用。');
   temp = await stage(this.path, data);
   if ((await this.snapshot()).hash !== expectedHash || !live()) throw new Error('模板紀錄或對話已變更；未覆寫。');
   await fs.rename(temp, this.path); temp = null; written = true;
   if (!live()) throw new Error('對話已變更；未套用。');
   await apply(state);
   // The synchronous, guarded official setter is the commit boundary. A later
   // session switch must not erase a successfully committed restoration record.
   if ((await this.snapshot()).hash !== digest(data)) throw new Error('套用期間紀錄已變更；不覆寫後續修改。');
   return { hash: digest(data) };
  } catch (e) {
   if (written && (await this.snapshot()).hash === digest(data)) {
    if (old.raw) { const undo = await stage(this.path, old.raw); await fs.rename(undo, this.path); }
    else await fs.unlink(this.path);
   }
   throw e;
  } finally {
   if (temp) await fs.unlink(temp).catch(() => {});
   const owner = await fs.readFile(join(this.lock, 'owner.json'), 'utf8').then(JSON.parse).catch(() => null);
   if (owner?.token === token) await fs.rm(this.lock, { recursive: true });
  }
 }
}
