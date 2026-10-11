import test from 'node:test'; import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile,mkdir} from 'node:fs/promises'; import {tmpdir} from 'node:os'; import {join} from 'node:path'; import {fileURLToPath} from 'node:url';
import {fromHost} from './runtime.mjs'; import {themeParts} from '../src/palette_v0.1.0.mjs'; import {ToggleStore,TEMPLATE} from '../src/toggle_v0.2.0.mjs';
const {loadExtensions}=await fromHost('dist/core/extensions/loader.js'),{Theme}=await fromHost('dist/index.js');
const path=fileURLToPath(new URL('../extensions/index.ts',import.meta.url)),preset=JSON.parse(await readFile(fileURLToPath(new URL('../themes/pi-theme-docker-look.json',import.meta.url))));
async function fixture(run){
 const root=await mkdtemp(join(tmpdir(),'theme 中文開關 ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;
 try{
  const result=await loadExtensions([path],root);assert.deepEqual(result.errors,[]);const extension=result.extensions[0],store=new ToggleStore(root),choices=[],notices=[],setCalls=[],menus=[],settings={theme:'system'};
  const {fg,bg}=themeParts(preset),build=name=>new Theme(fg,bg,'truecolor',{name}),themes=new Map(['system','dark',TEMPLATE,'pi-theme-user'].map(n=>[n,build(n)]));let theme=themes.get('system');result.runtime.getSettings=()=>structuredClone(settings);
  const ctx={mode:'tui',cwd:root,isIdle:()=>true,hasPendingMessages:()=>false,isProjectTrusted:()=>false,sessionManager:{getSessionId:()=> 'fixture',getSessionFile:()=> '/fixture.jsonl'},ui:{notify:t=>notices.push(t),get theme(){return theme;},getTheme:n=>themes.get(n),setTheme:value=>{setCalls.push(value);if(typeof value==='string'){if(!themes.has(value))return {success:false};settings.theme=value;theme=themes.get(value);}else theme=value;return {success:true};},select:async(title,options)=>{menus.push({title,options});return choices.shift();}}};
  await run({root,extension,result,store,ctx,choices,notices,setCalls,menus,settings,themes,setCurrent:n=>{settings.theme=n;theme=themes.get(n);},get theme(){return theme;},command:args=>extension.commands.get('pi-theme').handler(args??'',ctx)});
 }finally{if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}
}
test('只註冊兩項中文開關，啟動不套用或呼叫模型，也不註冊不穩定文字轉換',()=>fixture(async f=>{
 assert.deepEqual([...f.extension.commands.keys()],['pi-theme']);assert.equal(f.extension.tools.size,0);assert.equal(f.extension.markdownTransformer,undefined);
 for(const h of f.extension.handlers.get('session_start'))await h({},f.ctx);assert.equal(f.setCalls.length,0);await f.command();assert.deepEqual(f.menus[0].options,['啟用我的模板','停用並還原原本主題']);assert.equal((await f.store.read()).state,null);
}));
test('啟用保存、重開／重啟紀錄仍在，停用還原啟用前選擇',()=>fixture(async f=>{
 f.setCurrent('dark');f.choices.push('啟用我的模板');await f.command();assert.equal(f.theme.name,TEMPLATE);assert.equal(f.settings.theme,TEMPLATE);assert.equal((await new ToggleStore(f.root).read()).state.previousTheme,'dark');
 f.choices.push('啟用我的模板');await f.command();assert.equal(f.setCalls.length,1);
 f.choices.push('停用並還原原本主題');await f.command();assert.equal(f.settings.theme,'dark');assert.equal((await f.store.read()).state.enabled,false);assert.equal(f.setCalls.length,2);
}));
test('取消、非TUI、busy、queue、參數都不更改設定',()=>fixture(async f=>{
 await f.command();assert.equal(f.setCalls.length,0);f.ctx.mode='sdk';await f.command();assert.match(f.notices.at(-1),/TUI/);f.ctx.mode='tui';f.ctx.isIdle=()=>false;await f.command();assert.match(f.notices.at(-1),/佇列/);f.ctx.isIdle=()=>true;f.ctx.hasPendingMessages=()=>true;await f.command();assert.equal(f.setCalls.length,0);await f.command('private-do-not-echo');assert(!f.notices.at(-1).includes('private-do-not-echo'));assert.equal((await f.store.read()).state,null);
}));
test('等待選單時切換對話或其他操作改主題，不覆寫',()=>fixture(async f=>{
 f.ctx.ui.select=async()=>{await f.extension.handlers.get('session_tree')[0]({},f.ctx);return '啟用我的模板';};await f.command();assert.equal(f.setCalls.length,0);assert.equal((await f.store.read()).state,null);
 f.ctx.ui.select=async()=>{f.setCurrent('dark');return '啟用我的模板';};await f.command();assert.equal(f.setCalls.length,0);assert.equal(f.settings.theme,'dark');
}));
test('停用不還原較新的主題；重新啟用記錄新的原本選擇',()=>fixture(async f=>{
 f.choices.push('啟用我的模板');await f.command();f.setCurrent('dark');f.choices.push('停用並還原原本主題');await f.command();assert.equal(f.settings.theme,'dark');assert.equal(f.setCalls.length,1);f.choices.push('啟用我的模板','停用並還原原本主題');await f.command();await f.command();assert.equal(f.settings.theme,'dark');
}));
test('舊自訂主題／資料不遷移或刪除，還原原本自訂主題',()=>fixture(async f=>{
 await mkdir(join(f.root,'themes'));const p=join(f.root,'themes/pi-theme-user.json');await writeFile(p,'{"unchanged":"legacy"}\n');f.setCurrent('pi-theme-user');f.choices.push('啟用我的模板','停用並還原原本主題');await f.command();await f.command();assert.equal(f.settings.theme,'pi-theme-user');assert.equal(await readFile(p,'utf8'),'{"unchanged":"legacy"}\n');
}));
test('自動亮暗配對與專案固定主題先拒絕，不偷偷改成單一主題',()=>fixture(async f=>{
 f.settings.theme='light/dark';f.choices.push('啟用我的模板');await f.command();assert.match(f.notices.at(-1),/自動配對/);assert.equal(f.setCalls.length,0);
 f.settings.theme='system';f.ctx.isProjectTrusted=()=>true;await mkdir(join(f.root,'.pi'));await writeFile(join(f.root,'.pi/settings.json'),' {"theme":"dark"}');f.choices.push('啟用我的模板');await f.command();assert.match(f.notices.at(-1),/專案固定/);assert.equal(f.setCalls.length,0);
}));
test('沒有原紀錄或主題已消失時不猜測；官方setter失敗回退紀錄',()=>fixture(async f=>{
 f.setCurrent(TEMPLATE);f.choices.push('停用並還原原本主題');await f.command();assert.match(f.notices.at(-1),/找不到/);assert.equal(f.setCalls.length,0);
 f.setCurrent('system');f.ctx.ui.setTheme=()=>({success:false});f.choices.push('啟用我的模板');await f.command();assert.equal((await f.store.read()).state,null);assert.equal(f.settings.theme,'system');
}));
