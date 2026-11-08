import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {host} from './runtime.mjs';
import {makeMenu,mouseMenuAPI} from '../src/menu_v0.14.0.mjs';
const require=createRequire(join(host,'package.json')),tui=await import(pathToFileURL(require.resolve('@earendil-works/pi-tui')).href);
const theme={fg:(_k,s)=>s},mouse=typeof tui.SelectList.prototype.handleMouse==='function';
const kb={matches:(data,action)=>data===action};
function menu(items=Array.from({length:30},(_,i)=>'項目'+i),title='測試選單'){
 const chosen=[];let renders=0;const component=makeMenu({tui:{requestRender(){renders++;}},theme,keybindings:kb,done:value=>chosen.push(value),title,items,deps:tui});return {component,chosen,renders:()=>renders};
}
test('shared menu respects configured action bindings, wraps arrows, pages, Enter and Esc',()=>{
 const h=menu();h.component.handleInput('tui.select.down');h.component.handleInput('tui.select.confirm');assert.equal(h.chosen.at(-1),'項目1');h.component.handleInput('tui.select.pageDown');h.component.handleInput('tui.select.confirm');assert.equal(h.chosen.at(-1),'項目13');h.component.handleInput('tui.select.pageUp');h.component.handleInput('tui.select.up');h.component.handleInput('tui.select.up');h.component.handleInput('tui.select.confirm');assert.equal(h.chosen.at(-1),'項目29');h.component.handleInput('tui.select.cancel');assert.equal(h.chosen.at(-1),undefined);
});
test('shared menu bounds every rendered line in narrow/wide columns including CJK headings',()=>{
 const h=menu(undefined,'中文標題\n有兩行說明');for(const width of [0,1,2,5,15,40,80,160])for(const line of h.component.render(width))assert.ok(tui.visibleWidth(line)<=width,`overflow at ${width}`);
});
test('shared menu native mouse press/click confirms the correct item after multi-line title; wheel scrolls long list',{skip:!mouse},()=>{
 const h=menu(undefined,'第一行\n第二行');const lines=h.component.render(80);const selected=lines.findIndex(x=>x.includes('項目0'));assert.ok(selected>=2);
 const event=(type,y,extra={})=>({type,button:'left',x:2,y,screenX:2,screenY:y,width:80,height:lines.length,...extra});
 assert.equal(h.component.handleMouse(event('press',selected+1))?.handled,true);assert.equal(h.chosen.length,0);h.component.handleMouse(event('click',selected+1));assert.equal(h.chosen.at(-1),'項目1');
 for(let i=0;i<20;i++)h.component.handleMouse(event('wheel',selected,{wheelDelta:1}));h.component.render(80);h.component.handleInput('tui.select.confirm');assert.equal(h.chosen.at(-1),'項目21');assert.ok(h.renders()>0);
});
test('API adapter preserves native RPC/print/timed selection and does not touch unrelated methods',async()=>{
 const registrations=new Map();const api={registerCommand:(name,options)=>registrations.set(name,options),on(){},registerTool(){}};const wrapped=mouseMenuAPI(api,tui);
 const ctx={mode:'rpc',ui:{marker:42,async select(){assert.equal(this.marker,42);return 'native';},notify(){return this.marker;}}};
 wrapped.registerCommand('fixture',{handler:async(_args,context)=>[await context.ui.select('Title',['a']),context.ui.notify()]});assert.deepEqual(await registrations.get('fixture').handler('',ctx),['native',42]);
 ctx.mode='tui';wrapped.registerCommand('timed',{handler:async(_args,context)=>context.ui.select('Title',['a'],{timeout:1})});assert.equal(await registrations.get('timed').handler('',ctx),'native');
});
test('partial embedded/SDK TUI context keeps native selection instead of calling an unimplemented custom wrapper',async()=>{
 let handler;const api=mouseMenuAPI({registerCommand:(_n,o)=>handler=o.handler},tui);api.registerCommand('fixture',{handler:(_args,ctx)=>ctx.ui.select('Title',['a'])});assert.equal(await handler('',{mode:'tui',ui:{select:async()=> 'native',custom:async()=>{throw new Error('Incomplete UI custom must not be called');}}}),'native');
});
test('mouse-capable menu preserves Theme AbortSignal cancellation, including already-aborted scope',{skip:!mouse},async()=>{
 let handler,opened=0,finished=0;const api=mouseMenuAPI({registerCommand:(_n,o)=>handler=o.handler},tui);api.registerCommand('fixture',{handler:(_args,ctx)=>ctx.ui.select('Theme',['a','b'],{signal:ctx.signal})});
 const controller=new AbortController(),ctx={mode:'tui',signal:controller.signal,ui:{onTerminalInput:()=>()=>{},select:async()=>{throw new Error('Signal-only TUI selection must use mouse menu');},custom:async factory=>new Promise(resolve=>{opened++;factory({requestRender(){}},theme,kb,value=>{finished++;resolve(value);});})}};
 const pending=handler('',ctx);controller.abort();assert.equal(await pending,undefined);assert.equal(opened,1);assert.equal(finished,1);assert.equal(await handler('',ctx),undefined);assert.equal(opened,1);
});
test('signal/selection race completes a mouse menu only once; mixed timed options keep native semantics',{skip:!mouse},async()=>{
 let handler,finished=0,native=0;const controller=new AbortController(),api=mouseMenuAPI({registerCommand:(_n,o)=>handler=o.handler},tui);api.registerCommand('fixture',{handler:(args,ctx)=>ctx.ui.select('Theme',['a'],args?{signal:controller.signal,timeout:1}:{signal:controller.signal})});
 const ctx={mode:'tui',ui:{onTerminalInput:()=>()=>{},select:async()=>{native++;return 'native';},custom:async factory=>new Promise(resolve=>{const c=factory({requestRender(){}},theme,kb,value=>{finished++;resolve(value);});c.handleInput('tui.select.confirm');controller.abort();})}};
 assert.equal(await handler('',ctx),'a');assert.equal(finished,1);assert.equal(await handler('timed',ctx),'native');assert.equal(native,1);
});
test('API adapter uses one custom keyboard/mouse confirmation only on a mouse-capable TUI',{skip:!mouse},async()=>{
 let handler,customCount=0,nativeCount=0;const api=mouseMenuAPI({registerCommand:(_n,o)=>handler=o.handler},tui);
 api.registerCommand('fixture',{handler:(_args,ctx)=>ctx.ui.confirm('確認','確認破壞性操作？')});
 const accepted=await handler('',{mode:'tui',ui:{onTerminalInput:()=>()=>{},confirm:async()=>{nativeCount++;return false;},custom:async factory=>new Promise(resolve=>{customCount++;const c=factory({requestRender(){}},theme,kb,resolve);c.handleInput('tui.select.confirm');})}});
 assert.equal(accepted,true);assert.equal(customCount,1);assert.equal(nativeCount,0);
});
