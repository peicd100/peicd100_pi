import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBranch as original} from '../modules/acm/src/analysis_window_v1.8.2.mjs';
import {analyzeBranch,formatAnalysis,displayWidth} from '../modules/acm/src/analysis_v1.8.2.mjs';
const percentages={triggerPercent:55,targetPercent:50};
const row=(file,reads=1,repeated_reads=0,post_slide_repeats=0)=>({file,reads,repeated_reads,post_slide_repeats,write_followup_repeats:0,recovery_path_candidates:0,unverified_outputs:0});
function report(rows){const r=analyzeBranch([]);r.recent_reads.rows=rows;r.recent_reads.observed_slides=40;return r;}
const within=(text,width)=>text.split('\n').forEach(line=>assert(displayWidth(line)<=width,JSON.stringify(line)));
test('display-only analyzer is the original function and formatting does not mutate JSON/assessment',()=>{
 assert.equal(analyzeBranch,original);const r=report([row('peicd100_pi/modules/acm/src/presentation_v1.8.0.mjs',1,1,1)]),before=JSON.stringify(r);
 const text=formatAnalysis(r,percentages);assert.equal(JSON.stringify(r),before);assert(text.indexOf('presentation_v1.8.0.mjs')<text.indexOf('縮減判讀'));assert.match(text,/目前 55% → 50%/);assert.match(text,/窗口內讀取 1 次也可能是重讀/);assert.match(text,/統計範圍不同/);assert.match(text,/同模型／比例範圍：0 次縮減/);assert.match(text,/不能相加/);assert.equal(r.recent_reads.rows[0].post_slide_repeats,1);
});
test('wide table aligns Unicode numeric columns and extracts the common path once',()=>{
 const r=report([row('專案/src/讀取.ts',12,3,2),row('專案/src/分析工具.ts',1,0,0)]),text=formatAnalysis(r,percentages,{width:100});within(text,100);
 assert.equal(text.split('專案/src/').length-1,1);assert.match(text,/表列共用路徑：專案\/src\//);
 const table=text.split('\n').filter(s=>s.startsWith('檔案')||s.startsWith('讀取.ts')||s.startsWith('分析工具.ts'));assert.equal(table.length,3);assert.equal(displayWidth(table[0]),displayWidth(table[1]));assert.equal(displayWidth(table[1]),displayWidth(table[2]));
});
test('Windows paths, duplicate basenames, masked outside-project labels and truncated collisions stay distinguishable',()=>{
 const r=report([row('src\\one\\index.ts'),row('src\\two\\index.ts'),row('[專案外]/private.ts'),row('prefix'.repeat(10)+'one.ts'),row('prefix'.repeat(10)+'two.ts')]);
 const text=formatAnalysis(r,percentages,{width:60});within(text,60);assert.match(text,/one\/index.ts/);assert.match(text,/two\/index.ts/);assert.match(text,/\[專案外\]\/private.ts/);assert.match(text,/4\. prefix/);assert.match(text,/5\. prefix/);
});
test('narrow cards, ANSI/control sanitization, emoji/CJK and tiny terminals never overflow',()=>{
 const r=report([row('專案/🧑‍💻工具.ts',100,12,3),row('src/\x1b[31mfile\n.ts')]);
 for(const width of [1,2,15,40,55,56,80,120]){const text=formatAnalysis(r,percentages,{width});within(text,width);assert(!text.includes('\x1b'));}
 const cards=formatAnalysis(r,percentages,{width:40});assert.match(cards,/1\. 🧑‍💻工具.ts/);assert.match(cards,/讀取 100 · 重讀 12 · 縮減後 3/);assert(!cards.includes('檔案  '));
 assert.equal(displayWidth('中文'),4);assert.equal(displayWidth('🧑‍💻'),2);assert.equal(displayWidth('e\u0301'),1);
});
test('no data, incomplete baseline, top20 cap, write/recovery qualifiers and JSON details survive',()=>{
 const empty=report([]);assert.match(formatAnalysis(empty,percentages),/沒有成功 read/);empty.recent_reads.window_complete=false;assert.match(formatAnalysis(empty,percentages),/不能判定沒有讀取/);
 const r=report(Array.from({length:22},(_,i)=>row(`src/file${i}.ts`)));r.recent_reads.baseline_complete=false;r.recent_reads.rows[0].write_followup_repeats=1;
 const text=formatAnalysis(r,percentages);assert.match(text,/另 2 個檔案/);assert.match(text,/0 不代表確定沒有重讀/);assert.match(text,/寫入後驗證／恢復檔案/);assert.match(text,/\/acm-analysis\(piecd100\) json/);assert(!text.includes('file20.ts'));assert.equal(r.recent_reads.rows.length,22);
});
