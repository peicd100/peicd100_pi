import test from 'node:test';
import assert from 'node:assert/strict';
import {promises as fs} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {replaceFile} from '../src/atomic-file_v1.2.2.mjs';
const fault=code=>Object.assign(new Error('Injected local filesystem error'),{code});
test('Windows temporary sharing errors retry only the same atomic rename, with bounded delay and no destination gap',async()=>{
 const root=await fs.mkdtemp(join(tmpdir(),'atomic webhook ')),source=join(root,'new.tmp'),target=join(root,'receipt.json');
 try {
  await fs.writeFile(source,'new');await fs.writeFile(target,'old');let attempts=0;const delays=[];
  await replaceFile(source,target,{platform:'win32',sleep:async ms=>delays.push(ms),rename:async(a,b)=>{
   assert.equal(a,source);assert.equal(b,target);assert.equal(await fs.readFile(target,'utf8'),'old');
   if(++attempts<3)throw fault('EPERM');await fs.rename(a,b);
  }});
  assert.equal(attempts,3);assert.deepEqual(delays,[10,20]);assert.equal(await fs.readFile(target,'utf8'),'new');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('persistent sharing/permission error stops after seven attempts and preserves caller-owned source/target',async()=>{
 let attempts=0;const delays=[];
 await assert.rejects(replaceFile('source','target',{platform:'win32',rename:async()=>{attempts++;throw fault('EACCES');},sleep:async ms=>delays.push(ms)}),{code:'EACCES'});
 assert.equal(attempts,7);assert.deepEqual(delays,[10,20,40,80,160,320]);assert.equal(delays.reduce((a,b)=>a+b),630);
});
test('non-Windows permissions and non-sharing errors never retry or hide failure',async()=>{
 for(const [platform,code] of [['linux','EPERM'],['win32','ENOENT'],['win32','ENOSPC']]){
  let attempts=0;await assert.rejects(replaceFile('s','t',{platform,rename:async()=>{attempts++;throw fault(code);},sleep:async()=>assert.fail('No retry expected')}),{code});assert.equal(attempts,1);
 }
});
