import test from 'node:test';import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';import { join } from 'node:path';
import { planMigration, inspectMigration, migrate, restore, hash, BUNDLE_SOURCE, ENTRIES, THEME } from '../src/migration_v0.1.0.mjs';
import { fromHost } from './runtime.mjs';
const { DefaultPackageManager } = await fromHost('dist/core/package-manager.js');
const oldSources = ['pi_acm', 'pi_webhook', 'pi_theme'].map(n => 'git:github.com/peicd100/' + n);
const options = { workspace: '/workspace', settingsDir: '/agent' };
function fixture(fn) {
 const root = mkdtempSync(join(tmpdir(), '整合 遷移 ')), agentDir = join(root, 'agent'), workspace = join(root, 'workspace');mkdirSync(agentDir);mkdirSync(workspace);
 const path = join(agentDir, 'settings.json'), settings = { packages: ['npm:other', ...oldSources], theme: 'pi-theme-user', acm: {triggerPercent:95,targetPercent:90}, custom:{keep:true} };
 writeFileSync(path,JSON.stringify(settings,null,2)+'\n');try{return fn({root,agentDir,workspace,path,settings});}finally{rmSync(root,{recursive:true,force:true});}
}
test('預覽純函式、原指令資料/其他source保持，三來源變一個非固定來源',()=>{
 const settings={packages:['npm:other',oldSources[0]+'@v1.5.1',oldSources[1],oldSources[2]],theme:'pi-theme-user',acm:{triggerPercent:95,targetPercent:90}},before=JSON.stringify(settings),p=planMigration(settings,options);
 assert.equal(JSON.stringify(settings),before);assert.equal(p.removed,3);assert.equal(p.settings.packages.length,2);assert.equal(p.settings.packages[1].source,BUNDLE_SOURCE);assert.deepEqual(p.settings.packages[1].extensions,ENTRIES);assert.deepEqual(p.settings.acm,settings.acm);assert.equal(p.settings.theme,settings.theme);
});
test('明確off/缺失模組保持off；ACM半套一起載入，preset獨立保存',()=>{
 const p=planMigration({packages:[{source:oldSources[0],extensions:['!extensions/*','+extensions/index.ts']},{source:oldSources[1],extensions:[]},{source:oldSources[2],extensions:[],themes:['+themes/pi-theme-docker-look.json']}]},options);
 assert.deepEqual(p.modules,{acm:true,webhook:false,theme:false});assert.deepEqual(p.settings.packages[0].extensions,[ENTRIES[0]]);assert.equal(p.notes.length,1);assert.equal(p.preset,true);
 const only=planMigration({packages:[oldSources[1]]},options);assert.deepEqual(only.modules,{acm:false,webhook:true,theme:false});
});
test('plus是override不是whitelist；已選整合resource採更保守交集',()=>{
 const p=planMigration({packages:[{source:oldSources[0],extensions:['+extensions/index.ts']},oldSources[1],oldSources[2],{source:BUNDLE_SOURCE,extensions:['extensions/theme.ts'],themes:[]}]},options);
 assert.deepEqual(p.modules,{acm:false,webhook:false,theme:true});assert.equal(p.preset,false);assert.equal(p.settings.packages.length,1);
});
test('來源identity可辨Git tag/https、本機只接受明確workspace，不猜其他位置',()=>{
 const local=planMigration({packages:[join(options.workspace,'acm'),join(options.workspace,'pi_webhook'),join(options.workspace,'pi_theme'),'/elsewhere/acm']},options);
 assert.equal(local.removed,3);assert.equal(local.settings.packages.at(-1),'/elsewhere/acm');
 const git=planMigration({packages:['git:https://github.com/peicd100/pi_acm.git@v1.5.1']},options);assert.equal(git.removed,1);
});
test('重複來源/未知scope/invalidschema拒絕；無舊來源不重寫新bundle的flags',()=>{
 assert.throws(()=>planMigration({packages:[oldSources[0],oldSources[0]+'@v1']},options),/重複/);
 assert.throws(()=>planMigration({packages:[{source:oldSources[0],autoload:false}]},options),/無法/);
 assert.throws(()=>planMigration({packages:[{source:oldSources[0],extensions:'bad'}]},options),/篩選/);
 const s={packages:[{source:BUNDLE_SOURCE,extensions:[]}]};assert.equal(planMigration(s,options).settings,s);assert.equal(planMigration(s,options).changed,false);
});
test('篩選與Pi1.1.0原生package manager differential，包含backslashes/glob/override/empty',()=>fixture(({workspace,agentDir})=>{
 const root=join(workspace,'acm');mkdirSync(join(root,'extensions'),{recursive:true});writeFileSync(join(root,'package.json'),JSON.stringify({pi:{extensions:['./extensions/index.ts','./extensions/no-summary-guard.ts']}}));for(const p of['index.ts','no-summary-guard.ts'])writeFileSync(join(root,'extensions',p),'export default function(){}');
 const manager=new DefaultPackageManager({cwd:workspace,agentDir,settingsManager:{}});
 for(const patterns of[[],['+extensions\\index.ts'],['extensions/index.ts'],['!extensions/*','+extensions/index.ts'],['extensions/*.ts','-extensions/index.ts'],['**/*.ts','!**/*guard*'],['-extensions/no-summary-guard.ts'],['!**/*.ts']]){
  const map=new Map();manager.applyPackageFilter(root,patterns,'extensions',map,{});const native=[...map.values()].some(x=>x.enabled);
  const p=planMigration({packages:[{source:root,extensions:patterns}]},{workspace,settingsDir:agentDir});assert.equal(p.modules.acm,native,JSON.stringify(patterns));
 }
 // Plain includes are intentional: +only would leave the other bundle entries on.
 const all=new Map();manager.collectManifestFiles=()=>({allFiles:ENTRIES.map(p=>join(workspace,p))});manager.applyPackageFilter(workspace,[ENTRIES[0]],'extensions',all,{});assert.equal([...all.values()].filter(x=>x.enabled).length,1);
}));
test('備份原始bytes、CAS/唯一來源、idempotence、有效restore且不改資料',()=>fixture(({agentDir,workspace,path})=>{
 const before=readFileSync(path),data=join(agentDir,'private-existing');writeFileSync(data,'dummy private data');const preview=inspectMigration({agentDir,workspace}),done=migrate({agentDir,workspace,expectedHash:preview.beforeHash});assert.equal(done.status,'PASS');assert.equal(hash(readFileSync(join(done.backupDir,'settings.before.json'))),hash(before));assert.equal(readFileSync(data,'utf8'),'dummy private data');
 assert.equal(inspectMigration({agentDir,workspace}).changed,false);assert.equal(migrate({agentDir,workspace,expectedHash:done.afterHash}).status,'NOOP');
 assert.equal(restore({agentDir,backupDir:done.backupDir}).status,'RESTORED');assert.equal(hash(readFileSync(path)),hash(before));assert.equal(readFileSync(data,'utf8'),'dummy private data');
}));
test('foreign變更/stale預覽/busylock拒絕，不以舊backup覆寫',()=>fixture(({agentDir,workspace,path})=>{
 const expected=hash(readFileSync(path));writeFileSync(path,JSON.stringify({packages:oldSources,custom:'new'}));assert.throws(()=>migrate({agentDir,workspace,expectedHash:expected}),/變更/);
 mkdirSync(path+'.lock');assert.throws(()=>migrate({agentDir,workspace,expectedHash:hash(readFileSync(path))}),/鎖定/);rmSync(path+'.lock',{recursive:true});
 const newer=readFileSync(path);assert.throws(()=>migrate({agentDir,workspace,expectedHash:hash(newer),beforeWrite:()=>writeFileSync(path,'{"external":true}')}),/變更/);assert.equal(readFileSync(path,'utf8'),'{"external":true}');
 writeFileSync(path,newer);const done=migrate({agentDir,workspace,expectedHash:hash(newer)});writeFileSync(path,'{"later":true}');assert.throws(()=>restore({agentDir,backupDir:done.backupDir}),/新修改/);assert.equal(readFileSync(path,'utf8'),'{"later":true}');
}));
test('無效UTF8/JSON/特殊來源文件或backup link failclosed，不洩漏private內容',()=>fixture(({agentDir,workspace,path,root})=>{
 for(const bytes of[Buffer.from([255]),Buffer.from('PRIVATE_BAD_JSON')]){writeFileSync(path,bytes);assert.throws(()=>inspectMigration({agentDir,workspace}),e=>!e.message.includes('PRIVATE_BAD_JSON'));}
 rmSync(path);const target=join(root,'target');writeFileSync(target,'{"packages":[]}');try{symlinkSync(target,path);}catch(e){if(['EPERM','EACCES'].includes(e.code))return;throw e;}assert.throws(()=>inspectMigration({agentDir,workspace}),/普通檔案/);assert.equal(readFileSync(target,'utf8'),'{"packages":[]}');
}));
