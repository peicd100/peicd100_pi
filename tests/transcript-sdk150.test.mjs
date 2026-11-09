import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fromHost,host} from './runtime.mjs';
import {discoverTranscript,mountTranscript} from '../src/transcript_v0.15.0.mjs';
const Native=await fromHost('dist/index.js'),Tui=await import(pathToFileURL(createRequire(join(host,'package.json')).resolve('@earendil-works/pi-tui')).href);Native.initTheme('dark',false);
const deps={...Native,...Tui};
function fixture(count=1000){const root=new Tui.Container(),document=new Tui.Container(),backing=new Tui.Container();let calls=0;class Row extends Native.UserMessageComponent{render(w){calls++;return super.render(w);}}root.addChild(document);document.addChild(backing);for(let i=0;i<count;i++)backing.addChild(new Row('Original native row '+i));return{root,document,backing,Row,calls:()=>calls,reset:()=>{calls=0;}};}
const safe=()=>true;
test('genuine native rows: automatic unique-parent discovery, 1000->100 rendering, no keypress history scan, native bytes/backing preserved',()=>{
 const h=fixture(),before=[...h.backing.children],sourceArray=h.backing.children;let checks=0;const native=h.root.render(80);h.reset();
 const found=discoverTranscript(h.root,deps);assert.equal(found.reason,'ready');assert.equal(found.backing,h.backing);
 const controller=mountTranscript(h.root,deps,{limit:100,allowArchive:()=>{checks++;return true;}});assert(controller.mounted);let projected;
 for(let i=0;i<3;i++)projected=h.root.render(80);
 assert.equal(h.calls(),300);assert.equal(checks,1000,'Initial topology check only, no repeated historical walk');
 assert.equal(controller.status().archived,900);assert.equal(controller.status().projected,100);
 assert.deepEqual(projected.slice(1),native.slice(-projected.length+1));assert.equal(h.backing.children,sourceArray);assert.deepEqual(h.backing.children,before);
 h.backing.addChild(new h.Row('Native append retained'));h.root.render(80);assert.equal(checks,1001,'Only appended row checked');assert.equal(h.backing.children.length,1001);
 assert.equal(mountTranscript(h.root,deps,{allowArchive:safe}).mounted,false,'No second window owner');
 const history=controller.historyPage(0,100);assert.equal(history.length,100);assert.equal(history[0],before[801]);
 assert(controller.stop());assert.equal(h.document.children[0],h.backing);assert.equal(h.backing.children.length,1001);
});
test('genuine native current turn stays entirely visible even when longer than configured history window',()=>{
 const h=fixture(20);for(let i=0;i<200;i++)h.backing.addChild(new Native.AssistantMessageComponent({content:[{type:'text',text:'Current turn item '+i}],stopReason:'stop'}));
 const controller=mountTranscript(h.root,deps,{limit:10,allowArchive:safe});h.root.render(80);
 assert.equal(controller.status().archived,19);assert.equal(controller.status().projected,201,'Keep latest user plus all following current-turn work');assert(controller.stop());
});
test('interactive/unknown rows pinned by integration; explicit refresh rechecks changed capability without touching editor',()=>{
 const h=fixture(200),draft={text:'未送出的草稿',render:()=>[],handleInput(){}};h.root.addChild(draft);const unknown={render:()=>['Permission pending'],invalidate(){},handleInput(){}};h.backing.children.unshift(unknown);let pin=true,checks=0;
 const controller=mountTranscript(h.root,deps,{limit:10,allowArchive:row=>{checks++;return row!==unknown||!pin;}});h.root.render(80);assert.equal(controller.status().archived,0);const first=checks;h.root.render(80);assert.equal(checks,first);
 pin=false;controller.refresh();h.root.render(80);assert(controller.status().archived>0);assert.equal(draft.text,'未送出的草稿');assert.equal(h.root.children.at(-1),draft);assert(controller.stop());
});
test('ambiguous roots, duplicate rows, missing safety policy and unknown component APIs fail open before mutation',()=>{
 const h=fixture(2),original=h.document.children[0];assert.equal(mountTranscript(h.root,deps).reason,'archive-safety-policy-required');assert.equal(h.document.children[0],original);
 const other=new Tui.Container();other.addChild(new Native.UserMessageComponent('Other transcript'));h.root.addChild(other);assert.equal(discoverTranscript(h.root,deps).reason,'multiple-transcript-parents');assert.equal(mountTranscript(h.root,deps,{allowArchive:safe}).mounted,false);assert.equal(h.document.children[0],original);
 const a=fixture(2);a.backing.addChild(a.backing.children[0]);assert.equal(discoverTranscript(a.root,deps).reason,'ambiguous-or-over-budget');
 assert.equal(discoverTranscript({},deps).reason,'unsupported-public-components');assert.equal(discoverTranscript(a.root,{Container:Tui.Container}).reason,'unsupported-public-components');
});
test('foreign slot changes are not overwritten; shifted owned slot restores only our own view',()=>{
 const h=fixture(20),controller=mountTranscript(h.root,deps,{limit:10,allowArchive:safe});h.root.render(80);const foreign=new Tui.Container();h.document.children[0]=foreign;assert.equal(controller.stop(),false);assert.equal(h.document.children[0],foreign);
 const b=fixture(20),owned=mountTranscript(b.root,deps,{limit:10,allowArchive:safe});b.root.render(80);const label=new Tui.Text('Foreign prefix',0,0);b.document.children.unshift(label);assert.equal(owned.owned(),false);assert(owned.stop());assert.equal(b.document.children[0],label);assert.equal(b.document.children[1],b.backing);
});
test('unverified row projections revert the whole render to native and retain all original data',()=>{
 const h=fixture(20),before=[...h.backing.children],native=h.root.render(80);const controller=mountTranscript(h.root,deps,{limit:10,allowArchive:safe,project:()=>undefined});const result=h.root.render(80);assert.deepEqual(result,native);assert.equal(controller.status().archived,0);assert.deepEqual(h.backing.children,before);assert(controller.stop());
});
