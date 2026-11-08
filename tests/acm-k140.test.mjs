import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {formatK,formatFooter,formatStatus} from '../modules/acm/src/presentation_v1.14.0.mjs';
import {nativeBudget} from '../modules/acm/src/config_v1.10.0.mjs';
const settings={acm:{triggerPercent:30,targetPercent:29}};
test('ACM 1K=1000 and rounds to integer K, including known zero',()=>{
 for(const [input,expected] of [[0,'0K'],[1,'0K'],[499,'0K'],[500,'1K'],[1499,'1K'],[1500,'2K'],[1000000,'1000K']])assert.equal(formatK(input),expected);
 for(const input of [undefined,null,NaN,Infinity,-1,'5000'])assert.equal(formatK(input),'?K');
});
test('ACM footer means trigger percentage + Pi native estimate / trigger threshold, not capacity or retained target',()=>{
 const usage={tokens:5000,contextWindow:50000,percent:10};assert.equal(formatFooter(settings,usage),'ACM 30% 5K/15K');assert.equal(formatFooter({acm:{triggerPercent:30,targetPercent:15}},usage),'ACM 30% 5K/15K');
 assert.equal(formatFooter(settings,{...usage,tokens:null}),'ACM 30% ?K/15K');assert.equal(formatFooter(settings,{tokens:5000,contextWindow:null}),'ACM 30% 5K/?K');assert.equal(formatFooter(settings),'ACM 30% ?K/?K');
});
test('ACM displayed trigger uses exactly nativeBudget arithmetic, and display mutates neither settings nor native estimate',()=>{
 const frozen=Object.freeze({acm:Object.freeze({...settings.acm})}),usage=Object.freeze({tokens:5049,contextWindow:512000});assert.equal(formatFooter(frozen,usage),'ACM 30% 5K/154K');
 for(const capacity of [1,15000,128000,512000,1048576,999999])for(const ratio of [2.5,30,80.5,95]){const config={acm:{triggerPercent:ratio,targetPercent:ratio-1}},expected=nativeBudget({contextWindow:capacity},{triggerRatio:ratio/100,targetRatio:(ratio-1)/100}).trigger;assert.equal(formatFooter(config,{tokens:0,contextWindow:capacity}),`ACM ${ratio}% 0K/${formatK(expected)}`);}
 assert.throws(()=>formatFooter({acm:{triggerPercent:30,targetPercent:30}},usage));
});
test('ACM detailed status explains mixed estimation and rounding rather than claiming exact trigger timing',()=>{
 const text=formatStatus({version:'1.14.0',config:settings.acm,calibration:{samples:0,factor:1,offset:0},boundary:{cursorId:null,anchorIds:[]}});assert.ok(text.includes('1K=1000'));assert.ok(text.includes('Pi目前上下文估計／ACM觸發門檻'));assert.ok(text.includes('不能用整數顯示判定精確裁切時點'));
});
test('ACM request-local selector implementation is byte-identical to 1.13.0; display adds no history recount',async()=>{
 const read=name=>readFile(new URL('../modules/acm/extensions/'+name,import.meta.url),'utf8'),old=await read('index_v1.13.0.ts'),next=await read('index_v1.14.0.ts');const selector=s=>s.slice(s.indexOf("  pi.on('context_with_system'"),s.indexOf('  registerSessionMenu'));assert.equal(selector(next),selector(old));
 const display=next.slice(next.indexOf('  const renderNativeStatus'),next.indexOf('  // Only audited'));assert.ok(!/getBranch|counter\.total|calibrated\(/.test(display));assert.equal((display.match(/getContextUsage\(/g)??[]).length,1);
});
