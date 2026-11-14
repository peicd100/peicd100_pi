import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,plain} from './focus040-fixture.mjs';
const text=f=>f.render().map(plain);
test('collapsed thinking-only members add no linear blank rows while all interleaved body stays in main order',()=>{
 const f=fixture({limit:2000});try{
  f.assistant([{type:'thinking',thinking:'hidden first'}]);f.render();const before=text(f).length;
  for(let i=0;i<60;i++)f.assistant([{type:'thinking',thinking:'hidden '+i}]);
  const compact=text(f);assert.equal(compact.length,before,'Each suppressed native leading Spacer must disappear with its thinking, not accumulate a blank row');
  for(let i=0;i<15;i++){f.assistant([{type:'thinking',thinking:'hidden before '+i},{type:'text',text:'BODY_'+i},{type:'thinking',thinking:'hidden after '+i}]);f.tool('HIDDEN TOOL '+i);}
  const lines=text(f),bodies=lines.filter(s=>s.includes('BODY_')).map(s=>s.trim());assert.deepEqual(bodies,Array.from({length:15},(_,i)=>'BODY_'+i));assert(!lines.some(s=>s.includes('HIDDEN TOOL')));
  for(const width of[19,65,120]){const output=f.display.window.view.render(width).map(plain).join('\n');for(let i=0;i<15;i++)assert(output.includes('BODY_'+i));}
 }finally{f.close();}
});
test('streaming hidden thoughts do not increase collapsed height and finished short正文 stays visible',()=>{
 const f=fixture({limit:2000});try{
  f.assistant([{type:'thinking',thinking:'first'}]);const node=f.assistant([{type:'thinking',thinking:'second'}]);text(f);const height=text(f).length;
  for(let i=1;i<=6;i++){const message={role:'assistant',content:[{type:'thinking',thinking:'long thought\n'.repeat(i*50)}],stopReason:'stop'};node.updateContent(message);f.emit('message_update',{message,assistantMessageEvent:{type:'thinking_delta'}});assert.equal(text(f).length,height);}
  const message={role:'assistant',content:[{type:'thinking',thinking:'long thought\n'.repeat(100)},{type:'text',text:'好'}],stopReason:'stop'};node.updateContent(message);f.emit('message_end',{message});assert(text(f).some(s=>s.trim()==='好'));
 }finally{f.close();}
});
