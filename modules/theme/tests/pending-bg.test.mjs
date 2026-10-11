import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {fromHost} from './runtime.mjs';import {themeParts} from '../src/palette_v0.1.0.mjs';
const load=async name=>JSON.parse(await readFile(new URL('../themes/'+name,import.meta.url),'utf8'));
test('palette changes exactly pending background; all error/success/other roles remain byte-value equivalent',async()=>{
 const current=await load('pi-theme-docker-look.json'),old=await load('pi-theme-docker-look_v0.3.0.json');assert.equal(current.colors.toolPendingBg,'#1A1A1A');assert.equal(old.colors.toolPendingBg,'#000000');const normalized=structuredClone(current);normalized.colors.toolPendingBg=old.colors.toolPendingBg;assert.deepEqual(normalized,old);assert.equal(current.colors.toolSuccessBg,'#000000');assert.equal(current.colors.toolErrorBg,'#3A2329');assert.equal(current.colors.error,'#E07A86');
});
test('native Pi Theme renders pending RGB26,26,26 with no error/success palette changes',async()=>{
 const {Theme}=await fromHost('dist/index.js');const p=await load('pi-theme-docker-look.json'),{fg,bg}=themeParts(p),theme=new Theme(fg,bg,'truecolor',{name:p.name});assert.match(theme.bg('toolPendingBg','fixture'),/48;2;26;26;26/);assert.match(theme.bg('toolSuccessBg','fixture'),/48;2;0;0;0/);assert.match(theme.bg('toolErrorBg','fixture'),/48;2;58;35;41/);
});
