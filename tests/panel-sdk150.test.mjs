import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {join} from 'node:path';import {pathToFileURL} from 'node:url';
import {fromHost,host} from './runtime.mjs';import {makePanel} from '../src/panel_v0.15.0.mjs';
const Native=await fromHost('dist/index.js'),Tui=await import(pathToFileURL(createRequire(join(host,'package.json')).resolve('@earendil-works/pi-tui')).href);Native.initTheme('dark',false);const theme={fg:(_k,s)=>s};
function fixture({rows=24,lines=100,copy,input}={}){let revision=0,reads=0,closed=0,renders=0,valid=true;const text=Array.from({length:lines},(_,i)=>`原生文字第 ${i} 行`),source={render:()=>{reads++;return text;},invalidate(){}};const tui={terminal:{rows},requestRender:()=>renders++};const panel=makePanel({tui,theme,done:()=>closed++,title:'共用詳情',source,deps:Tui,revision:()=>revision,copy,input,valid:()=>valid});return{panel,tui,text,closed:()=>closed,reads:()=>reads,renders:()=>renders,change:()=>revision++,invalidate:()=>{valid=false;}};}
const click=(width,height,x,y)=>({type:'click',button:'left',x,y,width,height});
test('fixed close survives scroll/resize/tiny heights and Unicode widths; repeated scroll frames reuse source cache',()=>{
 const h=fixture();h.panel.focused=true;let lines=h.panel.render(60);assert(lines[0].includes('[關閉]'));const initial=h.reads();h.panel.handleInput('\x1b[6~');assert(h.panel.status().scrollTop>1,'Native PageDown binding');lines=h.panel.render(60);assert(lines[0].includes('[關閉]'));assert.equal(h.reads(),initial);h.panel.handleInput('\x1b[F');h.panel.render(60);assert(h.panel.status().scrollTop>0);
 for(const width of [1,5,9,20,80]){h.tui.terminal.rows=2;lines=h.panel.render(width);assert.equal(lines.length,1);for(const line of lines)assert(Tui.visibleWidth(line)<=width);}
 h.panel.handleMouse(click(80,1,79,0));assert.equal(h.closed(),1);assert.equal(h.panel.status().closed,true);
});
test('Ctrl+C only closes focused view; copy has separate Ctrl+Y/button and never touches real clipboard',async()=>{
 const copied=[],h=fixture({copy:async text=>copied.push(text)});h.panel.render(80);h.panel.handleInput('\x03');assert.equal(h.closed(),0);h.panel.focused=true;h.panel.handleInput('\x19');await new Promise(resolve=>setImmediate(resolve));assert.equal(copied.length,1);assert(copied[0].includes('原生文字第 99 行'));assert.equal(h.closed(),0);
 h.panel.handleInput('\x03');assert.equal(h.closed(),1);assert.equal(copied.length,1);h.panel.dispose();assert.equal(h.closed(),1);
});
test('native mouse wheel/selection and invalid scope are bounded; no drag-to-close or offscreen interception',()=>{
 const h=fixture();const lines=h.panel.render(50);assert.equal(h.panel.handleMouse({...click(50,lines.length,49,0),type:'drag'}),undefined);assert.equal(h.closed(),0);assert.equal(h.panel.handleMouse(click(50,lines.length,60,0)),undefined);
 assert(h.panel.handleMouse({...click(50,lines.length,2,5),type:'wheel',button:'none',wheelDelta:7})?.handled);assert.equal(h.panel.status().scrollTop,7);h.invalidate();assert.deepEqual(h.panel.render(50),[]);assert.equal(h.closed(),1);
});
test('image protocols stay in original source, never truncated or copied into text popup',async()=>{
 const copied=[],h=fixture({copy:async text=>copied.push(text)});const image='\x1b_Ga=T;fixture-image-data\x1b\\';h.text[0]=image;const lines=h.panel.render(80);assert(h.panel.status().sourceImages);assert(!lines.join('').includes('fixture-image-data'));assert.equal(h.text[0],image);h.panel.focused=true;h.panel.handleInput('\x19');await new Promise(resolve=>setImmediate(resolve));assert.equal(copied.length,0);
});
test('choice handler and native body mouse stay delegated, but close/copy shortcuts remain panel-owned',()=>{
 const keys=[],h=fixture({input:key=>keys.push(key)});h.panel.focused=true;h.panel.render(50);h.panel.handleInput('\r');assert.deepEqual(keys,['\r']);assert.equal(h.closed(),0);h.panel.handleInput('\x03');assert.equal(h.closed(),1);assert.deepEqual(keys,['\r']);
});
// Real public TUI routers, but a strictly in-memory terminal and clipboard.
class MemoryTerminal{
 columns=80;rows=24;kittyProtocolActive=false;writes=[];input;
 start(input){this.input=input;}stop(){}async drainInput(){}write(s){this.writes.push(s);}moveBy(){}hideCursor(){}showCursor(){}clearLine(){}clearFromCursor(){}clearScreen(){}setTitle(){}setProgress(){}setProgramStatus(){}
}
test('public regular/fullscreen overlay focus routes Ctrl+C to the view, restores draft focus and leaves background job untouched',()=>{
 assert.equal(typeof Tui.TuiMainScreen,'function');assert.equal(typeof Tui.TuiAltScreen,'function');
 for(const Kind of [Tui.TuiMainScreen,Tui.TuiAltScreen]){
  const terminal=new MemoryTerminal(),tui=new Kind(terminal),job={aborted:false},background={focused:false,draft:'未送出的原草稿',render:()=>['Fixture editor'],invalidate(){},handleInput:key=>{if(key==='\x03')job.aborted=true;}};
  let handle,closed=0;const panel=makePanel({tui,theme,done:()=>{closed++;handle.hide();},title:'工具詳情',source:{render:()=>['Readonly tool result'],invalidate(){}},deps:Tui,revision:()=>0});
  try{tui.addChild(background);tui.setFocus(background);tui.start();handle=tui.showOverlay(panel,{width:60,maxHeight:20});panel.render(60);assert.equal(tui.getFocusedComponent(),panel);assert.equal(panel.focused,true);terminal.input('\x03');assert.equal(closed,1);assert.equal(job.aborted,false);assert.equal(background.draft,'未送出的原草稿');assert.equal(tui.getFocusedComponent(),background);
   const next=makePanel({tui,theme,done:()=>{throw new Error('Unfocused popup must not take Ctrl+C');},title:'Unfocused',source:{render:()=>[],invalidate(){}},deps:Tui,revision:()=>0});const un=tui.showOverlay(next,{width:40});un.unfocus();terminal.input('\x03');assert.equal(job.aborted,true,'Main screen retains its own interrupt action when view is unfocused');un.hide();
  }finally{tui.stop();}
 }
});
