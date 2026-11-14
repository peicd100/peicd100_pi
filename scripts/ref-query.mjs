#!/usr/bin/env node
// Explicit developer CLI. Never loaded as a Pi extension or automatic timer.
import{resolve}from'node:path';
import{buildReferenceIndex,readReferenceIndex,saveReferenceIndex,verifyReferenceIndex,queryReferences,referenceImpact,referenceFileHash}from'../src/references_v0.1.0.mjs';
const help=`輕量來源引用／影響查詢（不呼叫模型、不執行被檢查的程式）
  node scripts/ref-query.mjs build [--root DIR] [--out INDEX]
  node scripts/ref-query.mjs query TEXT [--root DIR] [--index INDEX] [--all] [--limit 40] [--json]
  node scripts/ref-query.mjs impact RELATIVE_FILE [--root DIR] [--index INDEX] [--json]
  node scripts/ref-query.mjs verify --index INDEX [--root DIR]
預設只查manifest的靜態runtime閉包；--all包含測試／歷史／開發檔。
索引過期會拒絕查詢；build --out明確重建，既有合法索引按Hash增量。
DECLARED僅詞法候選，UNKNOWN不是無依賴；不得因此省略正式完整測試。`;
try{
 const args=process.argv.slice(2),command=args.shift();if(!command||['help','--help','-h'].includes(command)){console.log(help);process.exitCode=0;}
 else{
  if(!['build','query','impact','verify'].includes(command))throw Error('未知子命令，請用--help');
  const options={},positional=[];
  while(args.length){const key=args.shift();if(['--all','--json'].includes(key)){options[key.slice(2)]=true;continue;}if(['--root','--index','--out','--limit'].includes(key)){const value=args.shift();if(!value||value.startsWith('--'))throw Error('缺少參數：'+key);options[key.slice(2)]=value;continue;}if(key.startsWith('-'))throw Error('未知參數：'+key);positional.push(key);}
  if(positional.length>(['query','impact'].includes(command)?1:0))throw Error('位置參數過多');
  const root=resolve(options.root??process.cwd()),indexPath=options.index?resolve(options.index):undefined,out=options.out?resolve(options.out):undefined;
  if(command!=='build'&&out)throw Error('--out僅適用build');
  if(command==='build'){
   const expectedHash=out?referenceFileHash(out):null,previous=expectedHash?readReferenceIndex(out):undefined,index=buildReferenceIndex(root,{previous});
   if(out)saveReferenceIndex(out,index,{expectedHash});
   console.log(JSON.stringify({version:index.version,scope:'compiled source only, not runtime',files:index.files.length,active:index.active.length,edges:index.edges.length,symbols:index.symbols.length,unknown:index.unknown.length,work:index.work,inventoryDigest:index.inventoryDigest,saved:!!out},null,2));
  }else{
   if(command==='verify'&&!indexPath)throw Error('verify需要--index');
   const index=indexPath?readReferenceIndex(indexPath):buildReferenceIndex(root);
   const result=command==='verify'?verifyReferenceIndex(root,index):command==='query'?queryReferences(root,index,positional[0],{all:!!options.all,limit:options.limit===undefined?40:Number(options.limit)}):referenceImpact(root,index,positional[0]);
   if(command==='verify'&&!result.fresh)process.exitCode=2;
   if(options.json||command!=='query')console.log(JSON.stringify(result,null,2));
   else{
    console.log(`範圍：${result.scope}；檔案${result.totals.files}／聲明候選${result.totals.symbols}／引用${result.totals.edges}`);
    for(const file of result.files)console.log(`${file.path} [${file.roles.join(',')}] ${file.sha256.slice(0,12)}`);
    for(const s of result.symbols)console.log(`${s.file}:${s.line} [${s.evidence}/${s.kind}] ${s.name}`);
    for(const e of result.edges)console.log(`${e.from}:${e.line??'?'} [${e.evidence}/${e.resolution}] ${e.specifier} -> ${e.to??'UNKNOWN/external'}`);
    console.log(result.truncated?'結果已截短，可縮小查詢或調整--limit。':'查詢結束。');console.log('候選影響並非完整呼叫圖；不得跳過最後完整Gate。');
   }
  }
 }
}catch(error){console.error('引用查詢未完成：'+error.message);process.exitCode=1;}
