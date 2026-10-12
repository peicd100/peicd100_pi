import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,rm,readFile,access} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {fromHost} from '../../../tests/runtime.mjs';
import {VisibilityStore} from '../src/visibility_v0.3.1.mjs';
const {loadExtensions}=await fromHost('dist/core/extensions/loader.js'),{visibleWidth}=await fromHost('../pi-tui/dist/index.js').catch(()=>import('@earendil-works/pi-tui'));
const path=fileURLToPath(new URL('../extensions/index.ts',import.meta.url));
async function fixture(t,run){
 const root=await mkdtemp(join(tmpdir(),'activity widget '));t.mock.timers.enable({apis:['setInterval']});
 const previous=process.env.PI_CODING_AGENT_DIR;process.env.PI_CODING_AGENT_DIR=root;
 try{
  const loaded=await loadExtensions([path],root);assert.deepEqual(loaded.errors,[]);const extension=loaded.extensions[0],widgets=[],notices=[];let renders=0,id='a',leaf='first',idle=true,branch=[];
  const ctx={mode:'tui',cwd:root,isIdle:()=>idle,hasPendingMessages:()=>false,sessionManager:{getSessionId:()=>id,getSessionFile:()=>undefined,getLeafId:()=>leaf,getBranch:()=>branch},ui:{notify:s=>notices.push(s),theme:{fg:(_c,s)=>s},setWidget:(key,factory,options)=>{widgets.push({key,factory,options,component:factory?.({requestRender:()=>renders++},ctx.ui.theme)});}}};
  const emit=async(name,event={})=>{for(const h of extension.handlers.get(name)??[])await h(event,ctx);};
  await run({root,ctx,loaded,extension,widgets,notices,emit,render:width=>widgets.at(-1).component.render(width),renders:()=>renders,setId:v=>id=v,setIdle:v=>idle=v,setBranch:v=>{branch=v;leaf=String(Number(leaf)||0)+'next';},command:args=>extension.commands.get('pi-activity(piecd100)').handler(args,ctx)});
  await emit('session_shutdown');
 }finally{if(previous===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=previous;t.mock.timers.reset();await rm(root,{recursive:true,force:true});}
}
test('fresh TUI defaults off/no ticker; explicit on creates exactly one resize-safe belowEditor line',t=>fixture(t,async f=>{
 assert.equal(f.widgets.length,0);assert.equal(f.extension.tools.size,0);assert.equal(f.extension.footerFactory,undefined);t.mock.timers.tick(3000);assert.equal(f.renders(),0);
 await f.emit('session_start');await assert.rejects(access(join(f.root,'config/activity-display/preferences.json')),{code:'ENOENT'});await f.command('json');assert.equal(JSON.parse(f.notices.at(-1)).enabled,false);assert.equal(JSON.parse(f.notices.at(-1)).timer_active,false);t.mock.timers.tick(1000);assert.equal(f.renders(),0);await f.command('on');assert.equal(f.widgets.at(-1).options.placement,'belowEditor');
 for(const width of [0,1,2,12,40,100,200]){const lines=f.render(width);assert.equal(lines.length,1);assert(visibleWidth(lines[0])<=width,`${width}: ${lines[0]}`);}
 f.ctx.ui.theme={fg:(_color,text)=>`\u001b[31m${text}\u001b[0m`};assert(visibleWidth(f.render(25)[0])<=25);assert(f.render(120)[0].includes('\u001b[31m'));
 const before=f.renders();t.mock.timers.tick(1000);assert(f.renders()>before);
 await f.emit('session_shutdown');const after=f.renders();t.mock.timers.tick(9000);assert.equal(f.renders(),after);assert.equal(f.widgets.at(-1).factory,undefined);
}));
test('off/on/tree/new session are isolated, cleanup is idempotent; events never append messages or call tools',t=>fixture(t,async f=>{
 await f.emit('session_start');f.setIdle(false);await f.emit('agent_start');await f.emit('tool_execution_start',{toolCallId:'a',toolName:'bash',args:{command:'SECRET'}});await f.command('json');assert.equal(JSON.parse(f.notices.at(-1)).tool_count,1);
 await f.command('off');const count=f.renders();t.mock.timers.tick(5000);assert.equal(f.renders(),count);
 await f.command('on');await f.command('json');assert.equal(JSON.parse(f.notices.at(-1)).timer_active,true);assert.equal(JSON.parse(f.notices.at(-1)).tool_count,1);assert.equal(f.ctx.isIdle(),false);assert.equal(f.extension.tools.size,0);assert.equal(f.widgets.at(-1).options.placement,'belowEditor');await f.emit('session_tree');await f.command('json');assert.equal(JSON.parse(f.notices.at(-1)).last_activity_ago_ms,null);
 f.setId('b');await f.emit('session_start');await f.command('json');assert.equal(JSON.parse(f.notices.at(-1)).tool_count,0);await f.command('private-do-not-echo');assert(!f.notices.at(-1).includes('private-do-not-echo'));
}));
test('saved true remains authoritative across session starts and repeated reads do not rewrite it',t=>fixture(t,async f=>{
 const store=new VisibilityStore(join(f.root,'config/activity-display'));assert.equal(await store.read(),false);await store.save(true);const path=join(f.root,'config/activity-display/preferences.json'),raw=await readFile(path);await f.emit('session_start');await f.command('json');assert.equal(JSON.parse(f.notices.at(-1)).visible,true);await f.emit('session_shutdown');await f.emit('session_start');await f.command('json');assert.equal(JSON.parse(f.notices.at(-1)).visible,true);assert.deepEqual(await readFile(path),raw);
}));
for(const mode of ['sdk','print','json','rpc'])test(`${mode} never starts timer/widget or auto writes`,t=>fixture(t,async f=>{
 f.ctx.mode=mode;await f.emit('session_start');await f.emit('agent_start');await f.command('on');t.mock.timers.tick(5000);assert.equal(f.widgets.length,0);assert.equal(f.renders(),0);
}));
test('explicit Goal wait is read-only and private objective is never rendered or returned',t=>fixture(t,async f=>{
 await f.emit('session_start');await f.command('on');f.setBranch([{id:'g',type:'custom',customType:'goal-state',data:{goal:{id:'goal-id',text:'PRIVATE_GOAL',status:'active',startedAt:1,updatedAt:1,iteration:0,tokensUsed:0,timeUsedSeconds:0,baselineTokens:0,waiting:{reason:'PRIVATE_REASON'}}}}]);await f.command('json');const s=JSON.parse(f.notices.at(-1));assert.equal(s.mode,'waiting');assert.equal(s.warning,false);assert(!f.notices.at(-1).includes('PRIVATE'));assert.match(f.render(160)[0],/Goal 等待/);
}));
