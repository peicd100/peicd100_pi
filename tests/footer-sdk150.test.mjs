import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fromHost,host} from './runtime.mjs';
import {createFooterProjection} from '../src/footer_v0.15.0.mjs';
const Native=await fromHost('dist/index.js'),Tui=await import(pathToFileURL(createRequire(join(host,'package.json')).resolve('@earendil-works/pi-tui')).href);Native.initTheme('dark',false);
const plain=s=>s.replace(/\x1b\[[0-9;:]*m/g,'');
function fixture(){
 let leaf='fixture-leaf',calls=0,reads=0,revision=0;const statuses=new Map([['acm','ACM fixture'],['other','Other status retained']]);
 const model={id:'fixture-reasoning-model',provider:'fixture-provider',reasoning:true,contextWindow:1000000};
 const usage={input:11000000,output:665000,cacheRead:74000000,cacheWrite:20,totalTokens:85665020,cost:{input:1,output:2,cacheRead:0,cacheWrite:0,total:3}};
 const entries=[{type:'message',message:{role:'assistant',usage}}];
 const session={state:{model,thinkingLevel:'medium'},model,routedModel:undefined,modelRuntime:{isUsingSubscription:()=>true},getContextUsage:()=>({tokens:162000,percent:16.2,contextWindow:1000000}),sessionManager:{getEntries:()=>{reads++;return entries;},getEntryCount:()=>entries.length,getBranch:()=>{reads++;return entries;},getSessionId:()=> 'fixture-session',getLeafId:()=>leaf,getCwd:()=> 'fixture-project',getSessionName:()=> 'Fixture'}};
 const data={getGitBranch:()=> 'fixture-branch',getAvailableProviderCount:()=>2,getExtensionStatuses:()=>statuses};const native=new Native.FooterComponent(session,data);
 const counted={render:w=>{calls++;return native.render(w);},invalidate:()=>native.invalidate()};
 const controller=createFooterProjection(counted,{...Tui,styleModel:s=>s},()=>revision);
 return{session,native,controller,statuses,calls:()=>calls,reads:()=>reads,change:()=>{revision++;leaf+='-changed';}};
}
test('real native Footer: original usage retained, full model/reasoning on independent next row, statuses preserved',()=>{
 const h=fixture(),lines=h.controller.render(120).map(plain);assert.equal(h.controller.status().layout,'native-stats-model-separate');
 assert.match(lines[1],/↑11M/);assert.match(lines[1],/↓665k/);assert.match(lines[1],/R74M/);assert.match(lines[1],/\$3\.000 \(sub\)/);assert.match(lines[1],/16\.2%\/1\.0M/);
 assert.doesNotMatch(lines[1],/fixture-reasoning-model/);assert.match(lines[2],/\(fixture-provider\) fixture-reasoning-model • medium/);assert.match(lines.at(-1),/ACM fixture Other status retained/);
 const nativeWide=h.native.render(1144).map(plain);assert.equal(lines[1].trim(),nativeWide[1].split(/ {2,}/)[0].trim());
});
test('real native Footer: narrow widths wrap entire model/reasoning without replacing native statistics',()=>{
 const h=fixture();for(const width of [1,5,12,25,80]){const lines=h.controller.render(width);for(const line of lines)assert(Tui.visibleWidth(line)<=width,`Width ${width}`);const joined=lines.slice(2,-1).map(plain).join('').replace(/\s/g,'');assert(joined.includes('fixture-reasoning-model'));assert(joined.includes('medium'));}
});
test('footer cached by supplied data revision/width; ordinary frames never rescan native session',()=>{
 const h=fixture();h.controller.render(80);const initial=h.reads();for(let i=0;i<30;i++)h.controller.render(80);assert.equal(h.calls(),1);assert.equal(h.reads(),initial);
 h.change();h.controller.render(80);assert.equal(h.calls(),2);assert(h.reads()>initial);h.controller.invalidate();h.controller.render(80);assert.equal(h.calls(),3);
 h.statuses.set('other','Updated status');h.change();assert.match(plain(h.controller.render(80).at(-1)),/Updated status/);
});
test('route, thinking/model change and zero width do not mutate actual session or invent native model metadata',()=>{
 const h=fixture(),model=h.session.model;h.session.routedModel={model:{...model,id:'physical-fixture'},thinkingLevel:'high'};h.change();assert.match(h.controller.render(100).map(plain).join(''),/physical-fixture • high/);
 h.session.state.thinkingLevel='off';h.change();assert.match(h.controller.render(100).map(plain).join(''),/thinking off/);assert.equal(h.session.model,model);assert.deepEqual(h.controller.render(0),[]);
});
test('unknown footer layout returns native output instead of guessing a statistics/model split',()=>{
 const calls=[];const native={render:w=>{calls.push(w);return ['unchanged native path','Unknown single native status'];}};
 const controller=createFooterProjection(native,Tui,()=>0);assert.deepEqual(controller.render(25),['unchanged native path','Unknown single native status']);assert.equal(controller.status().layout,'unverified-native-fallback');assert.deepEqual(calls,[1049,25]);
});
