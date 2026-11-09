import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {fromHost,host} from './runtime.mjs';import {createUserPreview} from '../src/user-preview_v0.15.0.mjs';
const Native=await fromHost('dist/index.js'),Tui=await import(pathToFileURL(createRequire(join(host,'package.json')).resolve('@earendil-works/pi-tui')).href);Native.initTheme('dark',false);const deps={...Native,...Tui},text='中文測試 source stays complete. '.repeat(150);
const mouse=(width,height,y,type='click')=>({type,button:'left',x:1,y,width,height});
test('default preview contains ten native visual content lines plus its independent control and native padding/zones',()=>{
 const node=new Native.UserMessageComponent(text),original=node.children,full=node.render(40),view=createUserPreview(node,deps),result=view.render(40);assert(full.length>13);assert.equal(result.length,13);assert(result[0].startsWith('\x1b]133;A\x07'));assert(result.at(-1).startsWith('\x1b]133;B\x07\x1b]133;C\x07'));assert.deepEqual(result.slice(1,11),full.slice(1,11));assert(result[11].includes('[展開全部訊息'));assert.equal(node.children,original);assert.equal(view.status().previewLimit,10);assert.equal(view.status().sourceRenders,1);
 for(let i=0;i<20;i++)assert.deepEqual(view.render(40),result);assert.equal(view.status().sourceRenders,1,'No full native Markdown render on ordinary repaint');view.stop();assert.deepEqual(view.render(40),full);
});
test('each user message expands/collapses in place independently; drag cannot expand and control does not focus editor',()=>{
 let changed=0;const a=new Native.UserMessageComponent(text),b=new Native.UserMessageComponent(text+' other'),va=createUserPreview(a,deps,{changed:()=>changed++}),vb=createUserPreview(b,deps);const rows=va.render(40);vb.render(40);assert.equal(va.handleMouse(mouse(40,rows.length,11,'drag')),undefined);assert.equal(va.status().expanded,false);
 assert(va.handleMouse(mouse(40,rows.length,11))?.handled);assert.equal(changed,1);assert.equal(va.status().expanded,true);assert.equal(vb.status().expanded,false);const expanded=va.render(40);assert(expanded.length>rows.length);assert(expanded.some(s=>s.includes('[收合訊息')));assert(va.handleMouse(mouse(40,expanded.length,expanded.length-2))?.handled);assert.equal(va.status().expanded,false);
});
test('resize recomputes native wrapping/content count, retaining preview limit and explicit expansion state',()=>{
 const node=new Native.UserMessageComponent(text),view=createUserPreview(node,deps);view.render(30);const narrow=view.status().contentRows;view.render(90);assert(view.status().contentRows<narrow);assert.equal(view.status().sourceRenders,2);assert.equal(view.render(90).length,13);view.toggle(true);assert(view.render(90).length>13);view.render(50);assert.equal(view.status().expanded,true);assert.equal(view.status().sourceRenders,3);
});
test('line budget changes and disabling restore full native bytes, without rewriting original child or user text',()=>{
 let limit=10,enabled=true;const node=new Native.UserMessageComponent(text),before=node.children,full=node.render(60),view=createUserPreview(node,deps,{limit:()=>limit,enabled:()=>enabled});view.render(60);limit=5;assert.equal(view.render(60).length,8);assert.equal(view.status().sourceRenders,1);enabled=false;assert.deepEqual(view.render(60),full);assert.equal(node.children,before);enabled=true;limit=0;assert.equal(view.render(60).length,13);assert.equal(view.status().previewLimit,10);
});
test('short user messages and unknown/interactive layouts are byte-identical native fallback',()=>{
 const short=new Native.UserMessageComponent('好'),view=createUserPreview(short,deps);assert.deepEqual(view.render(40),short.render(40));const unknown=new Native.UserMessageComponent(text);unknown.addChild({render:()=>['Permission question'],invalidate(){},handleInput(){}});const full=unknown.render(40),safe=createUserPreview(unknown,deps);assert.deepEqual(safe.render(40),full);assert(full.some(s=>s.includes('Permission question')));
});
test('public native output-pad rebuild and theme invalidation refresh backing without reading private properties',()=>{
 const node=new Native.UserMessageComponent(text),view=createUserPreview(node,deps);view.render(50);node.setOutputPad(2);const current=node.children;assert.equal(view.render(50).length,13);assert.equal(node.children,current);assert.equal(view.status().sourceRenders,2);view.invalidate();view.render(50);assert.equal(view.status().sourceRenders,3);view.stop();assert.deepEqual(view.render(50),node.render(50));
});
