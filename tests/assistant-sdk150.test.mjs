import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {fromHost,host} from './runtime.mjs';import {assistantParts,probeAssistantParts,createAssistantProjection} from '../src/assistant_v0.15.0.mjs';
const Native=await fromHost('dist/index.js'),Tui=await import(pathToFileURL(createRequire(join(host,'package.json')).resolve('@earendil-works/pi-tui')).href);Native.initTheme('dark',false);const deps={...Native,...Tui};
const clean=s=>s.replace(/\x1b\[[0-9;:]*m/g,'').replace(/\x1b\]133;[ABC]\x07/g,'').trimEnd();
const msg=()=>({content:[{type:'thinking',thinking:'THOUGHT_ALPHA ordinary report words'},{type:'text',text:'好\n\n```js\nconst value = 42;\n```\n\n工具 thinking is ordinary body text.'},{type:'thinking',thinking:'THOUGHT_BETA'},{type:'text',text:'最短正文：是'}],stopReason:'stop'});
const mouse=(width,height,y)=>({type:'click',button:'left',x:1,y,width,height});
test('native assistant type probe separates thinking from arbitrary ordinary body language and one-character body',()=>{
 assert.equal(probeAssistantParts(deps),true);const node=new Native.AssistantMessageComponent(msg()),parts=assistantParts(node,deps);assert(parts.supported);assert.deepEqual(parts.parts.filter(p=>p.kind!=='spacing').map(p=>p.kind),['thinking','body','thinking','body']);
 const short=new Native.AssistantMessageComponent({content:[{type:'text',text:'好'}],stopReason:'stop'});assert.equal(assistantParts(short,deps).parts.filter(p=>p.kind==='body').length,1);
});
test('identity projection preserves every native byte/semantic zone, raw message and exact children-array identity',()=>{
 const message=msg(),raw=JSON.stringify(message),node=new Native.AssistantMessageComponent(message),content=node.children[0],before=content.children,native=node.render(80),view=createAssistantProjection(node,deps,p=>p.node);
 assert.deepEqual(view.render(80),native);assert.equal(content.children,before);assert.equal(JSON.stringify(message),raw);assert.equal(view.status().layout,'ready');view.stop();assert.deepEqual(view.render(80),native);
});
test('body-only true #000000 native Box preserves text/syntax and leaves thinking unpainted',()=>{
 const message=msg(),raw=JSON.stringify(message),node=new Native.AssistantMessageComponent(message),before=node.render(90),boxes=new WeakMap(),black=Tui.parseColor('#000000');assert.equal(Tui.colorToHex(black),'#000000');
 const view=createAssistantProjection(node,deps,p=>{if(p.kind!=='body')return p.node;let box=boxes.get(p.node);if(!box){box=new Tui.Box(0,0,text=>Tui.styleText(text,{bg:black},'truecolor'));box.addChild(p.node);boxes.set(p.node,box);}return box;});
 const result=view.render(90);assert.deepEqual(result.map(clean),before.map(clean));for(const line of result.filter(s=>s.includes('THOUGHT_')))assert(!line.includes('\x1b[48;2;0;0;0m'),'Thinking must remain native');assert(result.some(s=>s.includes('\x1b[48;2;0;0;0m')));assert(result.some(s=>s.includes('42')&&s.includes('\x1b[')),'Native syntax/color codes retained');assert.equal(JSON.stringify(message),raw);
});
test('thinking header mouse routing remains projected across resize, without changing raw thinking/body or pausing any job',()=>{
 const message=msg(),raw=JSON.stringify(message),node=new Native.AssistantMessageComponent(message),content=node.children[0],original=content.children;let clicks=0;
 const header={render:()=>['THINKING GROUP'],invalidate(){},handleMouse:()=>{clicks++;return{handled:true};}};
 const view=createAssistantProjection(node,deps,p=>p.kind==='thinking'?header:p.node),lines=view.render(80),y=lines.findIndex(s=>s.includes('THINKING GROUP'));assert(y>=0);assert(!lines.some(s=>s.includes('THOUGHT_ALPHA')));assert(lines.some(s=>s.includes('最短正文')));
 assert(view.handleMouse(mouse(80,lines.length,y))?.handled);assert.equal(clicks,1);assert.equal(content.children,original);
 // Resize before another render: public native mouse fallback sees our projection.
 assert(view.handleMouse(mouse(60,lines.length,y))?.handled);assert.equal(clicks,2);assert.equal(content.children,original);assert.equal(JSON.stringify(message),raw);
});
test('native thinking click may rebuild its own children; never restore the previous array over that update',()=>{
 const node=new Native.AssistantMessageComponent(msg()),view=createAssistantProjection(node,deps,p=>p.node),content=node.children[0],before=content.children,lines=view.render(80),y=lines.findIndex(s=>s.includes('THOUGHT_ALPHA'));
 assert(y>=0);assert(view.handleMouse(mouse(80,lines.length,y))?.handled);assert.notEqual(content.children,before);assert.equal(view.status().layout,'native-update-preserved');assert(!view.render(80).some(s=>s.includes('THOUGHT_ALPHA')));
});
test('short body and error notices cannot be filtered by a thinking projector; unknown/custom child falls back fully native',()=>{
 const node=new Native.AssistantMessageComponent({...msg(),stopReason:'error',errorMessage:'Permission decision required'}),native=node.render(80),empty={render:()=>[],invalidate(){}};
 const cannotHide=createAssistantProjection(node,deps,()=>empty);assert.deepEqual(cannotHide.render(80),native);assert.equal(cannotHide.status().layout,'unverified-projection-native-fallback');
 const thinkingOnly=createAssistantProjection(node,deps,p=>p.kind==='thinking'?empty:p.node);assert(thinkingOnly.render(80).some(s=>s.includes('Permission decision required')));
 node.children[0].addChild({render:()=>['Custom permission UI'],invalidate(){},handleInput(){}});const unknown=createAssistantProjection(node,deps,()=>empty);assert(unknown.render(80).some(s=>s.includes('Custom permission UI')));assert.match(unknown.status().layout,/native-fallback/);
});
