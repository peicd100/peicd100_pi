import test from 'node:test';import assert from 'node:assert/strict';
import {parseThreshold,effectivePercentages,effectiveTarget,TARGET_SHARE} from '../modules/acm/src/threshold_v1.18.0.mjs';
import {parseThreshold as oldParse} from '../modules/acm/src/threshold_v1.12.1.mjs';
import {MARKER,DEFAULT_POLICY,createCounter,selectWindow,selectWindowMasked,stubMessage,userDigest,buildMarker,digestBudget,
  assertPairing,STUB_KEEP_TOKENS,FULL_SHARE} from '../modules/acm/src/window_v1.6.0.mjs';

for(const [input,n] of [['31',31],[' 31% ',31],['30.5',30.5],['99.9%',99.9],['1.1',1.1],['25',25]])
  test(`threshold ${input} maps n to n/2`,()=>assert.deepEqual(parseThreshold(input),{triggerPercent:n,targetPercent:n/2}));
for(const input of [undefined,null,'','0','1','100','101','NaN','Infinity','-1','+31','30 29','30,29','30/15','30x','1e2','0x20','3'.repeat(33)])
  test(`invalid threshold ${String(input).slice(0,40)} rejects`,()=>assert.throws(()=>parseThreshold(input)));
test('effective target ignores a stored legacy target; the old immutable parser is untouched',()=>{
  assert.equal(TARGET_SHARE,0.5);
  assert.deepEqual(effectivePercentages({triggerPercent:25,targetPercent:24}),{triggerPercent:25,targetPercent:12.5});
  assert.deepEqual(effectivePercentages({triggerPercent:70,targetPercent:55}),{triggerPercent:70,targetPercent:35});
  assert.throws(()=>effectiveTarget(0));assert.throws(()=>effectiveTarget(100));assert.throws(()=>effectivePercentages({}));
  assert.deepEqual(oldParse('31'),{triggerPercent:31,targetPercent:30});
});

const policy=(trigger,target,cap=40000)=>({...DEFAULT_POLICY,contextCap:cap,triggerRatio:trigger,targetRatio:target});
const words=(tag,n)=>Array.from({length:n},(_,i)=>`${tag}-w${i}`).join(' ');
let clock=1794000000000;
const user=(id,text)=>({id,message:{role:'user',content:[{type:'text',text}],timestamp:clock+=60000}});
const turn=(i,n=120)=>[
  {id:`a${i}`,message:{role:'assistant',content:[{type:'text',text:`step ${i} reasoning`},{type:'toolCall',id:`c${i}`,name:'read',arguments:{path:`f${i}.txt`}}],timestamp:clock+=1000}},
  {id:`r${i}`,message:{role:'toolResult',toolCallId:`c${i}`,toolName:'read',content:[{type:'text',text:words(`f${i}`,n)}],timestamp:clock+=1000}}];

test('stub keeps small results, shortens large ones deterministically and drops images',()=>{
  const counter=createCounter(DEFAULT_POLICY);
  const small={role:'toolResult',toolCallId:'c',content:[{type:'text',text:'ok'}]};
  assert.equal(stubMessage(small,counter),small);
  const big={role:'toolResult',toolCallId:'c',isError:true,content:[{type:'text',text:words('x',400)},{type:'image',data:'AAAA',mimeType:'image/png'}]};
  const a=stubMessage(big,counter),b=stubMessage(big,counter);
  assert.deepEqual(a,b);assert.equal(a.toolCallId,'c');assert.equal(a.isError,true);assert.equal(a.content.length,1);
  assert.match(a.content[0].text,/^x-w0 x-w1/);assert.match(a.content[0].text,/ACM：此工具結果已移出上下文（原約 \d+ token，含 1 張圖片）/);
  assert(counter.tokens(a)<STUB_KEEP_TOKENS*2);assert(counter.tokens(big)>4096);
  const assistant={role:'assistant',content:[{type:'text',text:words('y',400)}]};assert.equal(stubMessage(assistant,counter),assistant);
  assert.equal(big.content.length,2,'raw record is never mutated');
});

test('one slide stubs the older half before dropping whole groups, keeps pairing and stays under target',()=>{
  const counter=createCounter(DEFAULT_POLICY),p=policy(0.5,0.25);
  const rows=[user('u0','first instruction')];for(let i=0;i<40;i++)rows.push(...turn(i));rows.push(user('u1','latest instruction'));
  const before=selectWindowMasked(rows,counter,40000,policy(0.99,0.495));assert.equal(before.changed,false);assert.equal(before.rows,rows);
  const plan=selectWindowMasked(rows,counter,40000,p);
  assert.equal(plan.changed,true);assert(plan.after<=10000,`after ${plan.after}`);assert(plan.before>20000);
  assertPairing(plan.rows.map(r=>r.message));
  const ids=plan.rows.map(r=>r.id),firstFull=ids.indexOf(plan.fullFromId);assert(firstFull>0);
  const stubbed=plan.rows.filter(r=>r.message.role==='toolResult'&&/ACM：此工具結果已移出上下文/.test(r.message.content[0].text));
  const fullResults=plan.rows.filter(r=>r.message.role==='toolResult'&&!/ACM：此工具結果已移出上下文/.test(r.message.content[0].text));
  assert(stubbed.length>fullResults.length,'the stubbed trail is longer than the full zone');
  assert(stubbed.every(r=>ids.indexOf(r.id)<firstFull));assert(fullResults.every(r=>ids.indexOf(r.id)>=firstFull));
  // every stubbed result still has its assistant text and tool call in front of it
  for(const r of stubbed){const a=plan.rows[ids.indexOf(r.id)-1].message;assert.equal(a.role,'assistant');assert.match(a.content[0].text,/reasoning/);assert.equal(a.content[1].id,r.message.toolCallId);}
  assert.equal(ids.at(-1),'u1');assert(!ids.includes('u0'),'the first user message is no longer pinned');
  // the old selector keeps far fewer turns for the same target
  const old=selectWindow(rows,counter,40000,p);assert(plan.rows.length>old.rows.length*2,`${plan.rows.length} vs ${old.rows.length}`);
  assert(Math.abs(FULL_SHARE-0.5)<1e-9);
});

test('already stubbed rows stay stubbed and the full boundary only moves forward',()=>{
  const counter=createCounter(DEFAULT_POLICY),p=policy(0.5,0.25);
  let rows=[user('u0','first')];for(let i=0;i<40;i++)rows.push(...turn(i));
  const first=selectWindowMasked(rows,counter,40000,p);
  const order=new Map(rows.map((r,i)=>[r.id,i]));
  const cut=order.get(first.fullFromId);
  // rebuild what the caller sends next: masked flag for rows before the committed boundary
  const raw=new Map(rows.map(r=>[r.id,r.message]));
  let next=first.rows.map(r=>order.get(r.id)<cut?{...r,raw:raw.get(r.id),masked:true}:{...r,raw:raw.get(r.id)});
  assert.deepEqual(next.map(r=>r.message),first.rows.map(r=>r.message),'the request after a slide is byte-identical to the slide request');
  for(let i=40;i<70;i++){const t=turn(i);t.forEach(r=>{order.set(r.id,order.size);raw.set(r.id,r.message);});next.push(...t.map(r=>({...r,raw:r.message})));}
  const second=selectWindowMasked(next,counter,40000,p,[],0,false,{isMasked:r=>r.masked===true,toStub:r=>stubMessage(r.raw??r.message,counter),fullFromId:first.fullFromId});
  assert.equal(second.changed,true);assert(order.get(second.fullFromId)>cut);assertPairing(second.rows.map(r=>r.message));
  assert(second.after<=10000);
});

test('n/2 slides far less often than n−1 over the same conversation',()=>{
  const counter=createCounter(DEFAULT_POLICY);
  const run=(p,select)=>{let rows=[user('u0','go')],slides=0;const raw=new Map(),order=new Map();let fullFrom=null;
    for(let i=0;i<300;i++){for(const r of turn(i,60)){raw.set(r.id,r.message);order.set(r.id,order.size);rows.push({...r,raw:r.message});}
      const plan=select(rows,p,fullFrom);if(plan.changed){slides++;fullFrom=plan.fullFromId??null;const cut=fullFrom?order.get(fullFrom):-1;
        rows=plan.rows.map(r=>({...r,masked:order.has(r.id)&&order.get(r.id)<cut}));}}
    return slides;};
  const narrow=run(policy(0.5,0.49),(rows,p)=>selectWindow(rows,counter,40000,p));
  const wide=run(policy(0.5,0.25),(rows,p,fullFromId)=>selectWindowMasked(rows,counter,40000,p,[],0,false,{isMasked:r=>r.masked===true,toStub:r=>stubMessage(r.raw??r.message,counter),fullFromId}));
  assert(narrow>=wide*8,`n−1 slid ${narrow} times, n/2 slid ${wide} times`);assert(wide>=1);
});

test('protected rows stay full; an oversized mandatory batch still fails closed',()=>{
  const counter=createCounter(DEFAULT_POLICY),p=policy(0.5,0.25);
  const rows=[user('u0','first')];for(let i=0;i<40;i++)rows.push(...turn(i));
  const plan=selectWindowMasked(rows,counter,40000,p,['r3']);
  const kept=plan.rows.find(r=>r.id==='r3');assert(kept);assert.doesNotMatch(kept.message.content[0].text,/ACM：/);assert(plan.carriedIds.includes('r3'));
  assertPairing(plan.rows.map(r=>r.message));
  const huge=[user('u0','x'),...turn(0,9000)];
  assert.throws(()=>selectWindowMasked(huge,counter,40000,p),/受保護內容需要/);
  assert.throws(()=>selectWindowMasked([],counter,40000,p));
});

test('user digest is chronological, bounded, deterministic and labelled as already handled',()=>{
  const counter=createCounter(DEFAULT_POLICY);
  const dropped=[];for(let i=0;i<50;i++)dropped.push(user(`u${i}`,`instruction number ${i} `+'detail '.repeat(40)));
  dropped.push({id:'blank',message:{role:'user',content:[{type:'image',data:'A',mimeType:'image/png'}],timestamp:1}});
  const d=userDigest(dropped,counter,600),again=userDigest(dropped,counter,600);
  assert.equal(d,again);assert.match(d,/^（更早另有 \d+ 則未列出）\n- \d{4}-\d\d-\d\d \d\d:\d\dZ：instruction number \d+/);
  const numbers=[...d.matchAll(/instruction number (\d+)/g)].map(m=>Number(m[1]));
  assert.deepEqual(numbers,[...numbers].sort((a,b)=>a-b));assert.equal(numbers.at(-1),49);assert(numbers.length<50);
  assert(counter.tokens({role:'compactionSummary',summary:d})<=700);
  assert.equal(userDigest([],counter,600),'');assert.equal(userDigest(dropped,counter,0),'');
  const long=userDigest([user('L','長'.repeat(2000))],counter,6000);assert(long.length<700);assert.match(long,/…$/);
  const marker=buildMarker({digest:d,sessionFile:'C:/x/session.jsonl'});
  assert(marker.startsWith(MARKER));assert.match(marker,/不是新的請求/);assert.match(marker,/原始對話紀錄：C:\/x\/session\.jsonl/);
  assert.equal(buildMarker(),buildMarker({digest:''}));assert.doesNotMatch(buildMarker(),/不是新的請求/);
  assert.equal(digestBudget(500000),6000);assert.equal(digestBudget(10000),400);assert.equal(digestBudget(0),0);
});
