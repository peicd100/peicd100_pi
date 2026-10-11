import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';import https from 'node:https';import {syncBuiltinESMExports} from 'node:module';
import {fromHost} from './runtime.mjs';import {Store,DEFAULT_GOAL_NOTIFY} from '../src/core_v1.3.0.mjs';
const {loadExtensions}=await fromHost('dist/core/extensions/loader.js');
const config={version:1,enabled:false,url:'https://notify.example.invalid/fixture',key:'dummy-only',format:'generic',notifyOn:['completed','error','aborted'],goalNotifyOn:[]};
async function fixture(t,run){const root=await mkdtemp(join(tmpdir(),'notify defaults ')),old=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;
 t.mock.method(https,'request',()=>assert.fail('No POST for preference commands'));syncBuiltinESMExports();
 try{const store=new Store(join(root,'config/webhook-notifier'));await store.writeConfig(config);await store.writeDefault(false);const branch=[{type:'custom',id:'choice',customType:'webhook:session-policy',data:{version:1,enabled:false}}],notices=[];
 const ctx={mode:'sdk',cwd:root,isIdle:()=>true,hasPendingMessages:()=>false,sessionManager:{getSessionId:()=> 'fixture',getSessionFile:()=>undefined,getBranch:()=>branch},ui:{notify:s=>notices.push(s)}};
 const loaded=await loadExtensions([fileURLToPath(new URL('../extensions/index.ts',import.meta.url))],root);assert.deepEqual(loaded.errors,[]);const extension=loaded.extensions[0];await run({store,ctx,branch,notices,extension,command:name=>extension.commands.get('webhook-'+name).handler('',ctx)});
 }finally{t.mock.restoreAll();syncBuiltinESMExports();if(old===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=old;await rm(root,{recursive:true,force:true});}}
test('explicit on restores complete-only/Goal four defaults without changing endpoint/key/session/global new-dialog choice or sending',t=>fixture(t,async f=>{
 const branch=JSON.stringify(f.branch),prefs=await readFile(f.store.preferencesPath);await f.command('on');const saved=await f.store.readConfig();assert.equal(saved.enabled,true);assert.deepEqual(saved.notifyOn,['completed']);assert.deepEqual(saved.goalNotifyOn,DEFAULT_GOAL_NOTIFY);for(const key of ['url','key','format'])assert.equal(saved[key],config[key]);assert.equal(JSON.stringify(f.branch),branch);assert.deepEqual(await readFile(f.store.preferencesPath),prefs);assert.match(f.notices.at(-1),/回到預設/);
}));
test('off retains custom event preferences, loading/updating alone never opens or rewrites configuration',t=>fixture(t,async f=>{
 const before=await readFile(f.store.configPath);for(const h of f.extension.handlers.get('session_start'))await h({},f.ctx);assert.deepEqual(await readFile(f.store.configPath),before);await f.command('off');const saved=await f.store.readConfig();assert.equal(saved.enabled,false);assert.deepEqual(saved.notifyOn,config.notifyOn);assert.deepEqual(saved.goalNotifyOn,[]);
}));
