import test, { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fromHost } from './runtime.mjs';
const { loadExtensions } = await fromHost('dist/core/extensions/loader.js');
const { createEventBus } = await fromHost('dist/core/event-bus.js');
const path = fileURLToPath(new URL('../extensions/no-summary-guard.ts', import.meta.url));
// Guard fixtures intentionally have no model identity/override. Never read the
// real user's models.json when exercising that contract.
const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
const isolatedAgentDir = mkdtempSync(join(tmpdir(), 'pi-guard-agent-'));
process.env.PI_CODING_AGENT_DIR = isolatedAgentDir;
after(() => {
  if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
  else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
  rmSync(isolatedAgentDir, { recursive: true, force: true });
});

test('dependency-free guard alone cancels automatic/overflow/manual compaction and tree summaries', async () => {
  const loaded = await loadExtensions([path], '/tmp');
  assert.deepEqual(loaded.errors, []);
  const handlers = loaded.extensions[0].handlers;
  for (const reason of ['threshold', 'overflow', 'manual']) {
    const callback = handlers.get('session_before_compact')[0];
    assert.deepEqual(await callback({ reason }), { cancel: true });
  }
  assert.deepEqual(await handlers.get('session_before_tree')[0]({ preparation: { userWantsSummary: true } }), { cancel: true });
  assert.equal(await handlers.get('session_before_tree')[0]({ preparation: { userWantsSummary: false } }), undefined);
});

test('quiet blocked request aborts exact array once and is never a reusable approval',async()=>{
 const bus=createEventBus(),loaded=await loadExtensions([path],'/tmp',bus);loaded.runtime.getSettings=()=>({});
 const callback=loaded.extensions[0].handlers.get('context_with_system')[0],messages=[{role:'user',content:'blocked fixture'}];let aborts=0;const ctx={model:{contextWindow:272000},abort:()=>aborts++};
 bus.emit('acm-passive:request-ready',{messages,estimatedTokens:1});bus.emit('acm-passive:request-blocked',{messages});assert.equal(callback({messages},ctx),undefined);assert.equal(aborts,1);
 assert.throws(()=>callback({messages},ctx),/取消/);assert.equal(aborts,2);
});

test('dependency-free guard blocks request when producer is absent and when verification is malformed', async () => {
  const bus = createEventBus();
  const loaded = await loadExtensions([path], '/tmp', bus);
  loaded.runtime.getSettings = () => ({});
  const callback = loaded.extensions[0].handlers.get('context_with_system')[0];
  let aborts = 0;
  const ctx = { model: { contextWindow: 272000 }, abort: () => { aborts++; } };
  const messages = [{ role: 'user', content: 'test' }];
  assert.throws(() => callback({ messages }, ctx), /取消/);
  bus.emit('acm-passive:request-ready', { messages, estimatedTokens: NaN });
  assert.throws(() => callback({ messages }, ctx), /取消/);
  bus.emit('acm-passive:request-ready', { messages, estimatedTokens: 190401 });
  assert.throws(() => callback({ messages }, ctx), /取消/);
  assert.equal(aborts, 3);
  bus.emit('acm-passive:request-ready', { messages, estimatedTokens: 149600 });
  assert.equal(callback({ messages }, ctx), undefined);
  assert.throws(() => callback({ messages }, ctx), /取消/, 'approval cannot be replayed');
  const event = { reason: 'overflow' };
  bus.emit('acm-passive:checkpoint-ready', { event, compaction: { summary: 'Invented AI summary', firstKeptEntryId: 'x', tokensBefore: 240000,
    usage: { input: 100 }, details: { acmPassive: { version: 1, noModelCalls: true } } } });
  assert.deepEqual(loaded.extensions[0].handlers.get('session_before_compact')[0](event), { cancel: true });
});

test('independent guard rejects non-finite or non-integer model capacity even with approved messages', async () => {
  const bus = createEventBus();
  const loaded = await loadExtensions([path], '/tmp', bus);
  loaded.runtime.getSettings = () => ({});
  const callback = loaded.extensions[0].handlers.get('context_with_system')[0];
  const messages = [{ role: 'user', content: 'Offline capacity validation.' }];
  for (const contextWindow of [NaN, Infinity, 1.5, 0, -1]) {
    bus.emit('acm-passive:request-ready', { messages, estimatedTokens: 1 });
    assert.throws(() => callback({ messages }, { model: { contextWindow }, abort: () => {} }), /取消/);
  }
});
