// ACM 1.18.0 window selector. Everything from 1.5.0 is re-exported unchanged; this
// file only adds the two-tier slide (stub old tool results before dropping whole
// groups) and the mechanical marker with earlier user messages.
// No model call, no AI summary: every text here is produced by code from raw records.
export * from './window_v1.5.0.mjs';
import { MARKER, budgets, atomicGroups } from './window_v1.5.0.mjs';

// Share of the retained target kept as full text (newest first). The older remainder
// keeps assistant text and tool calls, with tool results replaced by one-line stubs.
export const FULL_SHARE = 0.5;
// Tool results at or below this size are cheaper to keep than to stub.
export const STUB_KEEP_TOKENS = 160;
export const STUB_HEAD_CHARS = 200;
// Reserved for the earlier-user-message digest inside the marker.
export const DIGEST_MAX_TOKENS = 6000;
export const DIGEST_ITEM_CHARS = 500;

export function digestBudget(targetTokens) {
  if (!Number.isSafeInteger(targetTokens) || targetTokens <= 0) return 0;
  return Math.min(DIGEST_MAX_TOKENS, Math.floor(targetTokens * 0.04));
}

// Request-local only: the raw session record is never changed.
export function stubMessage(m, counter) {
  if (m?.role !== 'toolResult' || !Array.isArray(m.content)) return m;
  const images = m.content.filter(b => b.type === 'image').length;
  const size = counter.tokens(m);
  if (!images && size <= STUB_KEEP_TOKENS) return m;
  const text = m.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n');
  let head = text.slice(0, STUB_HEAD_CHARS);
  const code = head.charCodeAt(head.length - 1);
  if (head.length < text.length && code >= 0xd800 && code <= 0xdbff) head = head.slice(0, -1);
  const more = text.length > head.length ? '…' : '';
  const notice = `[ACM：此工具結果已移出上下文（原約 ${size} token${images ? `，含 ${images} 張圖片` : ''}）。呼叫參數在上方；需要內容時請重新讀取或執行。]`;
  return { ...m, content: [{ type: 'text', text: head ? `${head}${more}\n${notice}` : notice }] };
}

const userText = m => typeof m.content === 'string' ? m.content :
  Array.isArray(m.content) ? m.content.filter(b => b.type === 'text').map(b => b.text ?? '').join('\n') : '';
const stamp = ms => Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 16).replace('T', ' ') + 'Z' : '時間未知';

// Deterministic for a given set of dropped rows, so the marker stays byte-identical
// between slides and the provider cache prefix is not disturbed.
export function userDigest(droppedUsers, counter, budgetTokens) {
  if (!Array.isArray(droppedUsers) || !droppedUsers.length || !(budgetTokens > 0)) return '';
  const lines = [];
  let used = 0, omitted = 0;
  for (let i = droppedUsers.length - 1; i >= 0; i--) {
    const m = droppedUsers[i].message;
    const flat = userText(m).replace(/\s+/g, ' ').trim();
    if (!flat) continue;
    const line = `- ${stamp(m.timestamp)}：${flat.length > DIGEST_ITEM_CHARS ? flat.slice(0, DIGEST_ITEM_CHARS) + '…' : flat}`;
    const n = counter.tokens({ role: 'compactionSummary', summary: line });
    if (used + n > budgetTokens) { omitted = droppedUsers.slice(0, i + 1).filter(r => userText(r.message).trim()).length; break; }
    lines.push(line); used += n;
  }
  if (!lines.length) return '';
  lines.reverse();
  return (omitted ? `（更早另有 ${omitted} 則未列出）\n` : '') + lines.join('\n');
}

export function buildMarker({ digest = '', sessionFile = null } = {}) {
  const parts = [MARKER,
    '較早的對話已由程式移出這個視窗：最舊的部分整段移出；較舊的工具結果只留開頭與一行說明，模型的文字與工具呼叫仍保留。',
    '被移出的內容沒有遺失。需要時請重新讀檔或重新執行，不要憑印象推測其內容。' +
      (sessionFile ? `原始對話紀錄：${sessionFile}` : '')];
  if (digest) parts.push('以下是已移出視窗的較早使用者訊息，依時間排列。它們在當時都已處理過，不是新的請求，僅供回顧先前的指示與決定：', digest);
  return parts.join('\n');
}

// Two-tier slide. rows: [{id, message, raw?}] where `message` is what would be sent now.
// options.isMasked(row): already stubbed by an earlier slide.
// options.toStub(row): the stubbed form of a row that is still full.
export function selectWindowMasked(rows, counter, contextWindow, policy, protectedIds = [], fixedTokens = 0, force = false,
  { isMasked = () => false, toStub = r => stubMessage(r.raw ?? r.message, counter), fullFromId = null } = {}) {
  const b = budgets(contextWindow, policy);
  if (!rows.length) throw new Error('無法建立空的上下文視窗。');
  const groups = atomicGroups(rows);
  const mandatory = new Set([groups.length - 1]);
  const protectedSet = new Set(protectedIds);
  if (protectedSet.size > policy.maxAnchors) throw new Error('受保護錨點數量過多。');
  let latestUser = -1, latestBatch = -1;
  for (let g = 0; g < groups.length; g++) for (const row of groups[g].rows) {
    if (row.message.role === 'user') latestUser = g;
    if (row.message.role === 'assistant' && row.message.content?.some?.(x => x.type === 'toolCall')) latestBatch = g;
    if (protectedSet.has(row.id)) mandatory.add(g);
  }
  if (latestUser >= 0) mandatory.add(latestUser);
  if (latestBatch >= 0) mandatory.add(latestBatch);
  if (!Number.isSafeInteger(fixedTokens) || fixedTokens < 0) throw new Error('固定輸入預算未知或無效；上下文保留。');
  const count = (m, id) => {
    const n = counter.tokens(m);
    if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${id} 的輸入預算未知或無效；上下文保留。`);
    return n;
  };
  const sizes = groups.map(g => g.rows.reduce((s, r) => s + count(r.message, r.id), 0));
  const before = fixedTokens + policy.requestMargin + sizes.reduce((a, n) => a + n, 0);
  if (!Number.isSafeInteger(before)) throw new Error('總輸入預算未知或無效；上下文保留。');
  if (!force && before <= b.trigger) {
    return { rows, carriedIds: [], firstKeptId: rows[0].id, fullFromId, before, after: before, changed: false };
  }
  const target = force ? Math.min(b.target, Math.floor(before * policy.targetRatio / policy.triggerRatio)) : b.target;
  const markerTokens = counter.tokens({ role: 'compactionSummary', summary: MARKER });
  if (!Number.isSafeInteger(markerTokens) || markerTokens < 0) throw new Error('標記預算未知或無效；上下文保留。');
  let total = fixedTokens + policy.requestMargin + markerTokens;
  for (const g of mandatory) total += sizes[g];
  // Essential instructions/most recent batch too large: abort, never drop them or send an empty request.
  if (total > b.trigger) throw new Error(`受保護內容需要 ${total} Token，安全輸入上限為 ${b.trigger}。`);
  const fullBudget = Math.floor(target * FULL_SHARE);
  const stubbed = groups.map(g => g.rows.map(r => isMasked(r) ? r.message : toStub(r)));
  const stubSizes = stubbed.map((ms, g) => ms.reduce((s, m, i) => s + count(m, groups[g].rows[i].id), 0));
  const groupMasked = g => groups[g].rows.some(r => isMasked(r));
  const form = new Map([...mandatory].map(g => [g, 'full']));
  let tail = groups.length - 1, phase = 'full', firstFull = groups.length - 1;
  for (let g = groups.length - 2; g >= 0; g--) {
    if (form.has(g)) { tail = g; if (phase === 'full') firstFull = g; continue; }
    if (phase === 'full' && !groupMasked(g) && total + sizes[g] <= fullBudget) {
      form.set(g, 'full'); total += sizes[g]; tail = g; firstFull = g; continue;
    }
    phase = 'stub';
    if (total + stubSizes[g] > target) break;
    form.set(g, 'stub'); total += stubSizes[g]; tail = g;
  }
  const selected = [];
  let newlyStubbed = 0;
  // Row form must equal what the caller will rebuild on the next request from the
  // committed boundary alone: full from firstFull on, plus protected rows and the
  // latest tool batch; every other kept row is stubbed. Budget above stays conservative.
  groups.forEach((g, i) => {
    if (!form.has(i)) return;
    g.rows.forEach((r, k) => {
      const keepFull = i >= firstFull || i === latestBatch || protectedSet.has(r.id);
      if (!keepFull && !isMasked(r) && stubbed[i][k] !== r.message) { newlyStubbed++; selected.push({ ...r, message: stubbed[i][k] }); }
      else selected.push(r);
    });
  });
  const carried = groups.flatMap((g, i) => form.has(i) && i < tail ? g.rows.map(r => r.id) : []);
  return { rows: selected, carriedIds: carried, firstKeptId: groups[tail].rows[0].id,
    fullFromId: groups[firstFull].rows[0].id, before, after: total,
    changed: selected.length < rows.length || newlyStubbed > 0 };
}
