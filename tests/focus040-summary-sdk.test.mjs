import test from 'node:test';import assert from 'node:assert/strict';import {deps,fixture,plain} from './focus040-fixture.mjs';import {summaryLine,tailHint} from '../modules/focus/src/summary_v0.4.0.mjs';
test('path summary preserves filename and directory tail using native columns, never terminal controls',()=>{
 for(const path of ['D:\\project\\'+'deep\\'.repeat(20)+'src\\target.test.mjs','/工作專案/'+ '很深的目錄/'.repeat(20)+'原始碼/測試結果.json','/combining/a\u0301/'.repeat(20)+'file.json']){
  const filename=path.split(/[\\/]/u).at(-1);
  for(const width of[0,1,2,7,19,40,80,120]){const row=summaryLine('> [+] ','read｜完成','\x1b[2J'+path,width,deps);assert(deps.visibleWidth(row)<=width);assert(!row.includes('\x1b'));if(width>=deps.visibleWidth(filename)+6)assert(row.endsWith(filename));}
  assert.equal(tailHint(path,10000,deps),path);
 }
});
test('tool details render truncated tail in collapsed title without changing the full original arguments',()=>{
 const f=fixture();try{const path='D:\\very-long\\'+'directory\\'.repeat(25)+'report-final.json',args={path},raw=JSON.stringify(args),row=f.tool('original output',{name:'read',args});f.render();const view=f.renderer.lookup(row),group=f.renderer.model.groupFor(view.anchor),source=f.renderer.source(group),title=plain(source.render(60)[0]);assert(title.endsWith('report-final.json'));assert.equal(JSON.stringify(args),raw);source.navigateKey('\r');const expanded=source.render(60).map(plain);assert(expanded.join('\n').includes('original output'));assert(expanded.map(s=>s.trim()).join('').includes(path),'Expanded item keeps complete original path, not just the tail');}finally{f.close();}
});
