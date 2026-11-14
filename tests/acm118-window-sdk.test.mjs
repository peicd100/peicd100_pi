// ACM 1.18.0 through the real Pi SDK session/extension loader. Only the model wire is a fixture.
import test from'node:test';import assert from'node:assert/strict';import{join}from'node:path';import{copyFile,mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';
import{sdk,policy,setThreshold,core}from'./acm118-sdk-fixture.mjs';import{sdk as sdk116}from'./acm116-sdk-fixture.mjs';
const NOTICE='ACM：此工具結果已移出上下文',MARK='ACM token window moved';
const key=m=>JSON.stringify([m.role,m.content,m.toolCallId??null]);
const text=m=>typeof m.content==='string'?m.content:(m.content??[]).map(b=>b.text??'').join('\n');
const isPrefix=(a,b)=>a.length<=b.length&&a.every((m,i)=>key(m)===key(b[i]));
const breaks=wires=>{let n=0;for(let i=1;i<wires.length;i++)if(!isPrefix(wires[i-1].messages,wires[i].messages))n++;return n;};
const slides=s=>s.sessionManager.getBranch().filter(e=>e.type==='custom'&&e.customType==='acm-passive'&&e.data?.analysisPolicy).length;
const state=s=>s.sessionManager.getBranch().filter(e=>e.type==='custom'&&e.customType==='acm-passive').at(-1)?.data;
async function work(a,prompts){for(const[promptText,calls]of prompts){a.control.bigCalls=calls;await a.s.prompt(promptText);}}
const script=[['ALPHA first instruction keep the report in Traditional Chinese',20],['BETA second instruction do not touch release files',20],['GAMMA third instruction',20],['DELTA fourth instruction',20]];

test('a long tool run slides rarely, each slide is the only prefix change, old results are stubbed and user messages move into the marker',{timeout:120000},()=>sdk(async f=>{
 const a=await f.make({window:30000});a.control.bigWords=100;await work(a,script);
 assert.deepEqual(f.errors,[]);assert.equal(f.wires.length,84);
 const n=slides(a.s);assert(n>=2&&n<=12,`slides ${n}`);
 assert.equal(breaks(f.wires),n,'every request between two slides only appends to the previous request');
 const last=f.wires.at(-1).messages,marker=last.find(m=>text(m).includes(MARK));
 assert(marker,'marker present');assert.match(text(marker),/不是新的請求/);assert.match(text(marker),/ALPHA first instruction keep the report in Traditional Chinese/);
 assert(!last.some(m=>m.role==='user'&&m!==marker&&text(m).includes('ALPHA first instruction')),'the first user message is not replayed as a live request');
 assert(last.some(m=>m.role==='user'&&m!==marker&&text(m).includes('DELTA fourth instruction')),'the latest user message stays a real message');
 const results=last.filter(m=>m.role==='toolResult'),stubbed=results.filter(m=>text(m).includes(NOTICE)),full=results.filter(m=>!text(m).includes(NOTICE));
 assert(stubbed.length>=full.length&&full.length>=2,`stubbed ${stubbed.length} full ${full.length}`);
 const calls=new Set(last.filter(m=>m.role==='assistant').flatMap(m=>m.content.filter(b=>b.type==='toolCall').map(b=>b.id)));
 assert(results.every(m=>calls.has(m.toolCallId)),'every kept result still has its tool call');
 assert(last.filter(m=>m.role==='assistant'&&/reasoning kept/.test(text(m))).length>=stubbed.length,'assistant text survives for stubbed turns');
 assert(results.indexOf(stubbed.at(-1))<results.indexOf(full[0]),'stubs are older than the full zone');
 const s=state(a.s);assert(s.cursorId&&s.fullFromId);assert.deepEqual(s.analysisPolicy.percentages,{triggerPercent:80,targetPercent:40});
 assert.equal(policy(a.s).targetPercent,70,'stored legacy target bytes are not rewritten');
 await a.s.prompt('/acm(piecd100) json');const status=JSON.parse(f.notices.at(-1));assert.equal(status.version,'1.18.0');assert.deepEqual(status.config,{triggerPercent:80,targetPercent:40});assert.equal(status.policy.targetRatio,0.4);
}));

test('restart from the saved session file sends the same prefix, so reload does not disturb the cache',{timeout:120000},()=>sdk(async f=>{
 const manager=core.SessionManager.create(f.dir,join(f.dir,'saved')),a=await f.make({window:30000,manager});a.control.bigWords=100;await work(a,script.slice(0,3));
 assert(slides(a.s)>=2);const before=f.wires.at(-1).messages,path=join(f.dir,'reopened.jsonl');await copyFile(manager.getSessionFile(),path);
 const b=await f.make({window:30000,manager:core.SessionManager.open(path)});b.control.bigCalls=0;await b.s.prompt('EPSILON after restart');
 const after=f.wires.at(-1).messages;assert.deepEqual(f.errors,[]);
 // the marker names the session file, which differs for the copied file; everything else must match
 const file=/原始對話紀錄：.*/u,strip=ms=>ms.map(m=>key({...m,content:typeof m.content==='string'?m.content.replace(file,''):m.content.map(b=>typeof b.text==='string'?{...b,text:b.text.replace(file,'')}:b)}));
 const x=strip(before),y=strip(after);assert(x.every((m,i)=>m===y[i]),'restored request starts with the exact previous request');
}));

test('disabled conversation never slides again but keeps what the model already saw',{timeout:120000},()=>sdk(async f=>{
 const a=await f.make({window:30000});a.control.bigWords=100;await work(a,script.slice(0,2));const n=slides(a.s);assert(n>=1);
 f.select(1);f.select(2);await a.s.prompt('/acm(piecd100)');assert.equal(policy(a.s).enabled,false);
 const count=f.wires.length;a.control.bigCalls=3;await a.s.prompt('ZETA while disabled');
 assert.equal(slides(a.s),n);assert.equal(breaks(f.wires.slice(count-1)),0);assert(f.wires.at(-1).messages.some(m=>text(m).includes(NOTICE)));assert.deepEqual(f.errors,[]);
}));

test('explicit n stores n/2; n−1 conversations slide on the wide gap without re-entering the number',{timeout:120000},()=>sdk(async f=>{
 const a=await f.make({window:30000,settingsOverride:{acm:{triggerPercent:60,targetPercent:59}}});assert.equal(policy(a.s).targetPercent,59);
 a.control.bigWords=100;await work(a,script.slice(0,2));assert.equal(policy(a.s).targetPercent,59);
 const n=slides(a.s);assert(n>=1&&n<=6,`slides ${n}`);assert.equal(breaks(f.wires),n);assert.deepEqual(state(a.s).analysisPolicy.percentages,{triggerPercent:60,targetPercent:30});
 await setThreshold(f,a.s,'50');assert.deepEqual([policy(a.s).triggerPercent,policy(a.s).targetPercent],[50,25]);
 assert.match(f.inputs.at(-1).title,/保留目標固定為n的一半/);assert.match(f.confirmations.at(-1).text,/60%／30% → 50%／25%/);assert.deepEqual(f.errors,[]);
}));

test('a conversation slid by 1.16 continues under 1.18: no failure, pinned first message leaves at the next slide',{timeout:120000},async()=>{
 const keep=await mkdtemp(join(tmpdir(),'acm118 upgrade '));try{
  const path=join(keep,'from116.jsonl');const filler=' filler'.repeat(350);
  await sdk116(async f=>{const manager=core.SessionManager.create(f.dir,join(f.dir,'saved')),a=await f.make({window:30000,manager});
   for(let i=0;i<60;i++)await a.s.prompt(`OLD${i} instruction`+filler);assert.deepEqual(f.errors,[]);
   const s=state(a.s);assert(s.cursorId,'1.16 slid');assert(s.taskAnchorId);assert.equal(s.fullFromId,undefined);
   assert(f.wires.at(-1).messages.some(m=>m.role==='user'&&text(m).startsWith('OLD0 instruction')),'1.16 pins the first message');
   await copyFile(manager.getSessionFile(),path);});
  await sdk(async f=>{const a=await f.make({window:30000,manager:core.SessionManager.open(path)});a.control.bigWords=100;
   a.control.bigCalls=0;await a.s.prompt('NEW0 after upgrade');assert.deepEqual(f.errors,[]);
   const before=slides(a.s);await work(a,[['NEW1 instruction',25],['NEW2 instruction',25]]);assert.deepEqual(f.errors,[]);assert(slides(a.s)>before);
   const last=f.wires.at(-1).messages,marker=last.find(m=>text(m).includes(MARK));
   assert(!last.some(m=>m!==marker&&m.role==='user'&&text(m).startsWith('OLD0 instruction')),'old pinned message no longer replayed');
   assert.match(text(marker),/OLD\d+ instruction/);assert(state(a.s).fullFromId);});
 }finally{await rm(keep,{recursive:true,force:true});}
});
