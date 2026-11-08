import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {join} from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {stripVTControlCharacters as plain} from 'node:util';
import {host,fromHost} from './runtime.mjs';
import {ToolGroups} from '../modules/focus/src/groups_v0.1.0.mjs';
import {FocusRenderer,probeNative} from '../modules/focus/src/render_v0.1.0.mjs';
const oldAgent=process.env.PI_CODING_AGENT_DIR,agent=await mkdtemp(join(tmpdir(),'focus-native-'));process.env.PI_CODING_AGENT_DIR=agent;
after(async()=>{if(oldAgent===undefined)delete process.env.PI_CODING_AGENT_DIR;else process.env.PI_CODING_AGENT_DIR=oldAgent;await rm(agent,{recursive:true,force:true});});
const req=createRequire(join(host,'package.json')),tui=await import(pathToFileURL(req.resolve('@earendil-works/pi-tui')).href),core=await fromHost('dist/index.js');core.initTheme('dark',false);
const deps={...tui,ToolExecutionComponent:core.ToolExecutionComponent},tick=()=>new Promise(resolve=>queueMicrotask(resolve));
function fixture(){const root=new tui.Container();let requests=0;root.requestRender=()=>{requests++;};const c=new FocusRenderer(deps);c.setRoot(root);c.setEnabled(true);return {root,c,requests:()=>requests,
 tool(name,id,args={},original,wrapped=true){const node=new core.ToolExecutionComponent(name,id,args,{showImages:false},wrapped?c.wrap(name,original):original,root,agent);root.addChild(node);node.setArgsComplete();node.markExecutionStarted();return node;},
 text(text){const node=new tui.Text(text,0,0);root.addChild(node);return node;},lines(width=80){return root.render(width).map(plain);},headers(width=80){return this.lines(width).filter(line=>line.includes('工具紀錄'));},close(){c.stop();}};}
const result=(text,isError=false)=>({content:[{type:'text',text}],details:{marker:'unchanged'},isError});
const click=(node,y,width=80)=>node.handleMouse({type:'click',button:'left',x:2,y,screenX:2,screenY:y,width,height:1000});

test('metrics: parallel current action, stable primary, failure and completed wording; header never includes args/results',()=>{
 const s=new ToolGroups();const a=s.ensure('a','read',{path:'test-only-private.txt'}),b=s.ensure('b','bash',{command:'NEVER_IN_HEADER_TOKEN'});s.applyLayout([['a','b']]);s.sync(a.id,{argsComplete:true,started:true});s.sync(b.id,{argsComplete:true,started:true});let g=s.group(a);assert.match(s.header(g),/正在讀取檔案＋另1項執行中/);
 s.result(a.id,result('NEVER_IN_HEADER_TOKEN'),true);assert.match(s.header(g),/正在讀取檔案＋另1項執行中/);s.result(a.id,result('failed',true),false,true);assert.match(s.header(g),/^! 1項失敗.*正在執行指令/);s.result(b.id,result('done'));assert.match(s.header(g),/^! 1項失敗.*執行結束/);assert.doesNotMatch(s.header(g),/驗收|Goal|NEVER_IN_HEADER_TOKEN|private/);
});
test('layout mutation rejects unknown/duplicate rows atomically; final results never regress to late partials',()=>{
 const s=new ToolGroups(),r=s.ensure('a','read',{});s.applyLayout([['a']]);const g=s.group(r),key=s.layoutKey;s.result(r.id,result('final'));s.result(r.id,result('late'),true);assert.equal(r.result.content[0].text,'final');
 for(const invalid of [[['missing']],[['a','a']],[['a'],['a']],null])assert.throws(()=>s.applyLayout(invalid));assert.equal(s.layoutKey,key);assert.equal(s.group(r),g);
});
test('public native self-shell capability is measured rather than inferred from a version number',()=>{assert.equal(probeNative(deps),true);assert.equal(probeNative({Container:tui.Container}),false);});
test('genuine native component: single default-folded group, live header, zero nonleader rows and ordered original expansion',async()=>{
 const f=fixture();try{f.text('狀態回報A');const args=Object.freeze({path:'test-only-private.txt'}),raw=Object.freeze({content:Object.freeze([Object.freeze({type:'text',text:'ORIGINAL_READ_OUTPUT'})]),details:Object.freeze({marker:'not-rewritten'}),isError:false}),before=JSON.stringify({args,raw});
 const a=f.tool('read','call-a',args);f.root.addChild(new tui.Spacer(1));const b=f.tool('bash','call-b',{command:'test-fixture'});f.text('狀態回報B');assert.equal(f.headers().length,1);assert.match(f.headers()[0],/2項.*正在讀取檔案＋另1項執行中/);assert.deepEqual(b.render(80),[]);assert.ok(f.lines().some(line=>line.trim()==='狀態回報A'));assert.ok(f.lines().some(line=>line.trim()==='狀態回報B'));
 a.updateResult(raw);b.updateResult(result('ORIGINAL_BASH_FAILURE',true));await tick();assert.match(f.headers()[0],/^! 1項失敗.*執行結束/);assert.doesNotMatch(f.lines().join('\n'),/ORIGINAL_READ_OUTPUT|ORIGINAL_BASH_FAILURE/);
 a.render(80);assert.equal(click(a,1)?.handled,true);await tick();const expanded=f.lines().join('\n');assert.ok(expanded.indexOf('ORIGINAL_READ_OUTPUT')<expanded.indexOf('ORIGINAL_BASH_FAILURE'));assert.ok(expanded.includes('ORIGINAL_READ_OUTPUT'));assert.equal(JSON.stringify({args,raw}),before);assert.deepEqual(b.render(80),[]);
 }finally{f.close();}
});
test('actual visible text, native hidden-thinking label and safety/third-party notices remain group boundaries',async()=>{
 const f=fixture();try{f.tool('read','a');const thinking=new core.AssistantMessageComponent({role:'assistant',content:[{type:'thinking',thinking:'已收到的 thinking'}],stopReason:'stop',timestamp:1},true,undefined,'Thinking...',0);f.root.addChild(thinking);f.tool('bash','b');assert.equal(f.headers().length,2);assert.ok(f.lines().some(line=>line.includes('Thinking...')));
 thinking.setHiddenThinkingLabel('');await tick();assert.equal(f.headers().length,1,'An actually invisible thinking run is not a visible boundary');thinking.setHideThinkingBlock(false);await tick();assert.equal(f.headers().length,2);assert.ok(f.lines().some(line=>line.includes('已收到的 thinking')));
 f.text('Error: native safety notice');f.tool('read','c');await tick();assert.equal(f.headers().length,3);assert.ok(f.lines().some(line=>line.includes('Error: native safety notice')));
 }finally{f.close();}
});
test('native expand flag and user header click are reversible without a private shortcut or editing logs',async()=>{
 const f=fixture();try{const a=f.tool('read','a');a.updateResult(result('FULL_A'));const b=f.tool('bash','b');b.updateResult(result('FULL_B'));assert.equal(f.headers().length,1);a.setExpanded(true);b.setExpanded(true);await tick();assert.match(f.lines().join('\n'),/FULL_A/);a.setExpanded(false);b.setExpanded(false);await tick();assert.doesNotMatch(f.lines().join('\n'),/FULL_A/);a.render(80);click(a,1);await tick();assert.match(f.lines().join('\n'),/FULL_A/);a.render(80);click(a,1);await tick();assert.doesNotMatch(f.lines().join('\n'),/FULL_A/);
 }finally{f.close();}
});
test('third-party interactive tool output stays visible and its original mouse handler remains operable',async()=>{
 const f=fixture();let clicks=0;const seen=[];const original={renderCall:(_args,_theme,ctx)=>{seen.push(ctx.toolCallId);return new tui.Text('Original custom tool',0,0);},renderResult:()=>({render:()=>['核准按鈕'],invalidate(){},handleMouse:event=>{if(event.type==='click'&&event.button==='left'){clicks++;return {handled:true};}}})};
 try{const a=f.tool('custom','interactive',{},original);a.updateResult(result('raw custom result'));const lines=f.lines();assert.ok(lines.some(line=>line.includes('互動介面保留展開')));const own=a.render(80).map(plain),button=own.findIndex(line=>line.includes('核准按鈕'));assert.ok(button>=0);assert.equal(click(a,button)?.handled,true);assert.equal(clicks,1);click(a,1);await tick();assert.ok(f.lines().some(line=>line.includes('核准按鈕')));assert.ok(seen.every(id=>id==='interactive'));
 }finally{f.close();}
});
test('native mouse focus/capture targets and keyboard input survive original self-rendered interactive controls',()=>{
 const f=fixture(),inputs=[],events=[],control={capturesViewportInput:true,render:()=>['FOCUS_CONTROL'],invalidate(){},handleInput:data=>inputs.push(data),handleMouse:event=>{events.push(event);return {handled:true,focus:true,capture:true};}},original={renderShell:'self',renderCall:()=>control};try{f.tool('custom','focus',{},original);const lines=f.root.render(80).map(plain),y=lines.findIndex(line=>line.includes('FOCUS_CONTROL'));assert.ok(y>=0);const event={type:'press',button:'left',x:2,y,screenX:12,screenY:100+y,width:80,height:lines.length},hit=f.root.handleMouse(event);assert.equal(hit.target.component,control);assert.equal(hit.focusTarget,control);assert.equal(hit.capture,true);assert.equal(hit.target.originY,100+y);hit.focusTarget.handleInput('fixture-key');assert.deepEqual(inputs,['fixture-key']);assert.equal(events.at(-1).y,0);assert.equal(events.at(-1).x,2);
 }finally{f.close();}
});
test('disabled display is byte-identical to native text tools; unwrapped third-party renderers are not hidden or merged',async()=>{
 const f=fixture();try{f.c.setEnabled(false);const args={path:'fixture.txt'},raw=result('native-original'),a=f.tool('read','a',args);a.updateResult(raw);const baseline=new core.ToolExecutionComponent('read','a',args,{showImages:false},undefined,f.root,agent);baseline.setArgsComplete();baseline.markExecutionStarted();baseline.updateResult(raw);assert.deepEqual(a.render(80),baseline.render(80));
 f.c.setEnabled(true);f.tool('bash','third-party',{},undefined,false).updateResult(result('UNWRAPPED_OUTPUT'));f.tool('read','c').updateResult(result('WRAPPED_C'));await tick();assert.equal(f.headers().length,2);assert.match(f.lines().join('\n'),/UNWRAPPED_OUTPUT/);assert.doesNotMatch(f.lines().join('\n'),/WRAPPED_C/);
 }finally{f.close();}
});
test('history-style native reconstruction counts only current views; removed/reinserted view and shutdown stay readable',async()=>{
 const f=fixture();try{const old=f.tool('read','a');old.updateResult(result('RESTORED_A'));f.headers();f.root.clear();const fresh=f.tool('read','a');fresh.updateResult(result('RESTORED_A'));await tick();assert.equal(f.headers().length,1);assert.match(f.headers()[0],/1項/);assert.equal(f.c.status().wrapped_records,1);f.root.clear();f.root.addChild(old);await tick();assert.equal(f.headers().length,1);f.c.stop();assert.match(f.lines().join('\n'),/RESTORED_A/);
 }finally{f.close();}
});
test('native image channel remains visible outside the fold without changing the original image result',async()=>{
 const f=fixture(),caps=tui.getCapabilities(),seen=[];tui.setCapabilities({...caps,images:'kitty'});try{f.tool('read','text').updateResult(result('hidden text'));const original={renderResult:(raw,_opts,_theme,ctx)=>{seen.push(ctx.showImages);return new tui.Text(raw.content[0].text,0,0);}},b=new core.ToolExecutionComponent('image','image',{}, {showImages:true},f.c.wrap('image',original),f.root,agent);f.root.addChild(b);b.setArgsComplete();b.markExecutionStarted();
 const raw={content:[{type:'text',text:'ORIGINAL_IMAGE_TEXT'},{type:'image',data:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aC1sAAAAASUVORK5CYII=',mimeType:'image/png'}],details:{fixture:true}},before=JSON.stringify(raw);b.updateResult(raw);assert.equal(f.headers().length,1);assert.ok(f.headers()[0].includes('圖片沿用原生設定'));assert.ok(b.render(80).length>0,'The native image is NOT falsely claimed to be folded');assert.doesNotMatch(f.lines().join('\n'),/ORIGINAL_IMAGE_TEXT/);b.setExpanded(true);assert.match(f.lines().join('\n'),/ORIGINAL_IMAGE_TEXT/);assert.ok(seen.length>0&&seen.every(Boolean),'Custom renderer keeps the actual outer-native showImages setting');assert.equal(JSON.stringify(raw),before);
 }finally{f.close();tui.setCapabilities(caps);}
});
test('ambiguous multiple native tool parents fail open to the complete original presentation',async()=>{
 const f=fixture();try{f.tool('read','main').updateResult(result('MAIN_ORIGINAL'));const panel=new tui.Container();f.root.addChild(panel);const b=new core.ToolExecutionComponent('bash','panel',{}, {showImages:false},f.c.wrap('bash',undefined),f.root,agent);panel.addChild(b);b.setArgsComplete();b.markExecutionStarted();b.updateResult(result('PANEL_ORIGINAL'));assert.equal(f.headers().length,0);assert.match(f.lines().join('\n'),/MAIN_ORIGINAL/);assert.match(f.lines().join('\n'),/PANEL_ORIGINAL/);assert.equal(f.c.status().layout,'multiple-native-tool-parents');
 }finally{f.close();}
});
test('opaque terminal/image controls are conservatively visible message boundaries',()=>{
 const f=fixture();try{f.tool('read','a');f.root.addChild({render:()=>['\x1b]1337;File=inline=1:fixture\x07'],invalidate(){}});f.tool('bash','b');assert.equal(f.headers().length,2);}finally{f.close();}
});
test('pending args, waiting, live partial and final status update on the same native row',async()=>{
 const f=fixture();try{const node=new core.ToolExecutionComponent('read','pending',{}, {showImages:false},f.c.wrap('read',undefined),f.root,agent);f.root.addChild(node);assert.match(f.headers()[0],/工具參數準備中/);node.setArgsComplete();await tick();assert.match(f.headers()[0],/等待執行/);node.markExecutionStarted();await tick();assert.match(f.headers()[0],/正在讀取檔案/);node.updateResult(result('partial'),true);await tick();assert.match(f.headers()[0],/正在讀取檔案/);node.updateResult(result('final'));await tick();assert.match(f.headers()[0],/執行結束/);assert.equal(f.root.children.length,1);
 }finally{f.close();}
});
test('complex third-party component trees fail open rather than hide an uninspected interactive control',()=>{
 const f=fixture(),original={renderResult:()=>{const c=new tui.Container();for(let i=0;i<520;i++)c.addChild(new tui.Text('fixture '+i,0,0));c.addChild({render:()=>['UNINSPECTED_BUTTON'],invalidate(){},handleMouse:()=>({handled:true})});return c;}};try{f.tool('custom','large',{},original).updateResult(result('raw'));const lines=f.lines();assert.ok(lines.some(line=>line.includes('互動介面保留展開')));assert.ok(lines.some(line=>line.includes('UNINSPECTED_BUTTON')));}finally{f.close();}
});
test('genuine first-party read/bash renderers remain folded by default and expand to byte-identical native bodies',async()=>{
 const {createAllToolRenderers}=await fromHost('dist/core/tools/renderers/index.js'),renderers=createAllToolRenderers(),f=fixture();try{const specs=[['read','read-native',{path:'fixture.txt'},result('FULL_NATIVE_READ\nsecond line')],['bash','bash-native',{command:'fixture-only'}, {...result('FULL_NATIVE_BASH\nnext line'),durationMs:42}]],nodes=[],expected=[];
 for(const [name,id,args,raw] of specs){const node=f.tool(name,id,args,renderers[name]);node.updateResult(raw);nodes.push(node);const baseline=new core.ToolExecutionComponent(name,id,args,{showImages:false},renderers[name],f.root,agent);baseline.setArgsComplete();baseline.markExecutionStarted();baseline.updateResult(raw);baseline.setExpanded(true);expected.push(...baseline.render(80));}
 assert.equal(f.headers().length,1);assert.doesNotMatch(f.lines().join('\n'),/FULL_NATIVE_READ|FULL_NATIVE_BASH/);for(const node of nodes)node.setExpanded(true);await tick();assert.deepEqual(nodes[0].render(80).slice(2),expected);assert.deepEqual(nodes[1].render(80),[]);
 }finally{f.close();}
});
test('narrow/wide grouped rows remain bounded; live errors survive truncation through native expand',async()=>{
 const f=fixture();try{const a=f.tool('read','a');a.updateResult(result('ORIGINAL_FAILURE',true));f.tool('bash','b');for(const width of [0,1,2,8,15,40,80,160]){await tick();const lines=f.root.render(width);for(const line of lines)assert.ok(tui.visibleWidth(line)<=width,`width ${width}`);if(width>0)assert.ok(lines.map(plain).find(line=>line.trim())?.startsWith('!'),'Failure indicator must survive even a one-column text view');}a.setExpanded(true);await tick();assert.match(f.lines().join('\n'),/ORIGINAL_FAILURE/);
 }finally{f.close();}
});
