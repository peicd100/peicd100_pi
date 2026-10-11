import test from'node:test';import assert from'node:assert/strict';import{mkdtemp,rm,readFile,writeFile,mkdir,symlink}from'node:fs/promises';import{join}from'node:path';import{tmpdir}from'node:os';import{fileURLToPath}from'node:url';import{validatePalette,editColor,hex,themeParts}from'../src/palette_v0.1.0.mjs';import{ThemeStore}from'../src/store_v0.1.0.mjs';import{fromHost}from'./runtime.mjs';
const {Theme}=await fromHost('dist/index.js');const preset=JSON.parse(await readFile(fileURLToPath(new URL('../themes/pi-theme-docker-look.json',import.meta.url))));
async function fixture(run){const root=await mkdtemp(join(tmpdir(),'theme 安全 '));try{await run(new ThemeStore(root),root);}finally{await rm(root,{recursive:true,force:true});}}
test('完整角色與中文範本可由官方 Theme 建構，HEX 正規化不更動來源',()=>{
 const original=JSON.stringify(preset),p=validatePalette(preset);assert.equal(Object.keys(p.colors).length,56);assert.equal(Object.keys(p.export).length,3);assert.equal(hex('#a0f'),'#AA00FF');assert.equal(editColor(p,'accent','#abc').colors.accent,'#AABBCC');assert.equal(JSON.stringify(preset),original);const parts=themeParts(p);const theme=new Theme(parts.fg,parts.bg,'truecolor',{name:p.name,appearance:p.appearance});assert.match(theme.fg('error','錯誤'),/錯誤/);assert.match(theme.bg('userMessageBg','白底'),/白底/);
});
test('未知欄位、不完整、變數與無效色碼都不默默接受',()=>{
 for(const value of['red','#1234','#12345678',';shell'])assert.throws(()=>hex(value));for(const value of[{...preset,vars:{}},{...preset,colors:{...preset.colors,bad:'#fff'}},{...preset,colors:{accent:'#fff'}},{...preset,name:'system'},{...preset,name:'../x'}])assert.throws(()=>validatePalette(value));
 const without=structuredClone(preset);delete without.colors.scrollbarThumb;assert.equal(validatePalette(without).colors.scrollbarThumb,without.colors.text);assert.throws(()=>editColor(preset,'bad','#fff'));
});
test('保存、重新讀取與專用使用者檔案保持穩定',()=>fixture(async store=>{
 assert.equal((await store.read()).palette,null);let applied=0;await store.save(preset,null,async p=>{applied++;assert.equal(p.name,'pi-theme-user');});assert.equal(applied,1);assert.equal((await store.read()).palette.colors.userMessageBg,'#FFFFFF');assert.equal((await new ThemeStore(store.agent).read()).palette.colors.toolDiffAdded,'#A8C8AD');
}));
test('套用失敗回退，外部後續修改不得被舊回退覆蓋',()=>fixture(async store=>{
 await store.save(preset,null,()=>{});const before=await store.snapshot();await assert.rejects(store.save(editColor(preset,'accent','#111'),before.hash,()=>{throw new Error('套用失敗');}));assert.deepEqual((await store.snapshot()).raw,before.raw);
 await assert.rejects(store.save(editColor(preset,'accent','#222'),before.hash,async()=>{await writeFile(store.path,'external edit\n');throw new Error('之後失敗');}));assert.equal(await readFile(store.path,'utf8'),'external edit\n');
}));
test('雜湊不同、忙碌切換及既有鎖定都拒絕保存',()=>fixture(async store=>{
 await assert.rejects(store.save(preset,'bad',()=>{}));assert.equal((await store.snapshot()).hash,null);await assert.rejects(store.save(preset,null,()=>{},()=>false));await mkdir(store.lock);await assert.rejects(store.save(preset,null,()=>{}),/鎖定/);await rm(store.lock,{recursive:true});
}));
test('匯出只建立新檔案，匯入 UTF-8／大小／格式驗證及來源不變',()=>fixture(async(store,root)=>{
 const path=join(root,'輸出 配色.json');await store.export(path,preset);const before=await readFile(path);assert.equal((await store.import(path)).colors.error,preset.colors.error);await assert.rejects(store.export(path,editColor(preset,'error','#111')));assert.deepEqual(await readFile(path),before);await assert.rejects(store.export(store.path,preset));await writeFile(path,'\uFEFF{}');await assert.rejects(store.import(path),/BOM/);await writeFile(path,'x'.repeat(65537));await assert.rejects(store.import(path),/64 KiB/);
}));
test('連結與目錄不可冒充配色檔案',()=>fixture(async(store,root)=>{
 await assert.rejects(store.import(root));if(process.platform!=='win32'){const real=join(root,'real.json'),link=join(root,'link.json');await writeFile(real,JSON.stringify(preset));await symlink(real,link);await assert.rejects(store.import(link),/連結/);}
}));
