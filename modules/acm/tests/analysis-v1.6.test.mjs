import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeBranch,formatAnalysis} from '../src/analysis_v1.6.0.mjs';
const percentages={triggerPercent:70,targetPercent:55},route=['fixture','fixture','model-a'];
const assistant=(id,calls=[],model='model-a')=>({id,type:'message',message:{role:'assistant',provider:'fixture',api:'fixture',model,stopReason:calls.length?'toolUse':'stop',content:calls}});
const call=id=>({type:'toolCall',name:'read',id,arguments:{path:'src/a.ts',offset:1,limit:10}});
const result=(id,toolCallId)=>({id,type:'message',message:{role:'toolResult',toolName:'read',toolCallId,content:[{type:'text',text:'PRIVATE_BODY_NEVER_IN_REPORT'}]}});
function cycles(count,{known=true,repeat=true,tail=5,model='model-a',settings=percentages,prefix=''}={}) {
 const rows=[];
 for(let i=0;i<count;i++) {
  const k=`${prefix}${i}`;
  rows.push(assistant(`before${k}`,[call(`c${k}`)],model),result(`r${k}`,`c${k}`),assistant(`owner${k}`,repeat?[call(`again${k}`)]:[],model));
  if(repeat)rows.push(result(`rr${k}`,`again${k}`));
  rows.push({id:`cal${k}`,type:'custom',customType:'acm-passive-calibration',data:{responseEntryId:`owner${k}`}},
   {id:`slide${k}`,type:'custom',customType:'acm-passive',data:{cursorId:`owner${k}`,carriedIds:[],anchorIds:[],
    ...(known?{analysisPolicy:{version:1,route:['fixture','fixture',model],percentages:settings}}:{})}});
  for(let j=0;j<tail;j++)rows.push(assistant(`tail${k}-${j}`,[],model));
 }
 return rows;
}
test('最近五次縮減判讀；舊讀取仍作前置證據，歷史累計與範圍分開且不洩漏內容',()=>{
 const b=cycles(7);const original=JSON.stringify(b),r=analyzeBranch(b,{currentRoute:route,currentPercentages:percentages});
 assert.equal(r.successful_slides,5);assert.equal(r.total_successful_slides,7);assert.equal(r.post_slide_repeats,5);
 assert.deepEqual(r.scope.selected_slide_ids,['slide2','slide3','slide4','slide5','slide6']);assert.equal(r.assessment.code,'REVIEW_CANDIDATES');
 assert.equal(JSON.stringify(b),original);assert(!JSON.stringify(r).includes('PRIVATE_BODY'));assert(!formatAnalysis(r,percentages).includes('owner'));assert.match(formatAnalysis(r,percentages),/判讀：.*不代表浪費/);
 assert.match(formatAnalysis(r,percentages),/建議：/);assert.match(formatAnalysis(r,percentages),/5 次模型回應/);
});
test('少於三次、歷史比例未知、觀察尚未完成或掃描受限均不提供數值調參',()=>{
 for(const [rows,options,code] of [[cycles(2),{},'INSUFFICIENT'],[cycles(3,{known:false}),{},'UNKNOWN_SETTINGS'],[cycles(3,{tail:2}),{},'OBSERVING'],[cycles(4),{maxEntries:20},'INCOMPLETE']]) {
  const r=analyzeBranch(rows,options);assert.equal(r.assessment.code,code);assert(!r.assessment.advice.includes('5 個百分點'));
 }
});
test('模型與已知比例只取最近連續epoch，不跨過不同設定挑舊有利樣本',()=>{
 const old=cycles(4,{prefix:'old'}),newer=cycles(2,{prefix:'new',settings:{triggerPercent:75,targetPercent:60}});
 const r=analyzeBranch([...old,...newer],{currentPercentages:{triggerPercent:75,targetPercent:60},currentRoute:route});
 assert.equal(r.successful_slides,2);assert.equal(r.post_slide_repeats,2);assert.equal(r.scope.mixed_epoch_excluded,true);
 const switched=analyzeBranch([...old,...cycles(1,{prefix:'b',model:'model-b'})],{currentRoute:['fixture','fixture','model-b']});assert.equal(switched.successful_slides,1);
 const mismatch=analyzeBranch(old,{currentRoute:['fixture','fixture','model-b']});assert.equal(mismatch.successful_slides,0);
 const returned=analyzeBranch([...old,assistant('other-route',[],'model-b'),...cycles(1,{prefix:'returned'})],{currentRoute:route});assert.equal(returned.successful_slides,1,'Returning to the same model does not resurrect its earlier epoch');
});
test('不同回應路由的工具讀取不能當成同模型縮減後重讀',()=>{
 const b=cycles(1,{repeat:false,tail:0});b.push(assistant('b',[call('bc')],'model-b'),result('br','bc'));
 assert.equal(analyzeBranch(b,{currentRoute:route}).post_slide_repeats,0);
});
test('完整三次同設定範圍沒有候選，只說無調整依據、不聲稱零成本',()=>{
 const r=analyzeBranch(cycles(3,{repeat:false}));assert.equal(r.assessment.code,'NO_ADJUSTMENT_EVIDENCE');assert.match(r.assessment.advice,/不代表沒有其他成本/);
});
test('未知邊界及非法範圍明確處理',()=>{
 const b=cycles(3);b.push({id:'bad',type:'custom',customType:'acm-passive',data:{cursorId:'missing'}});
 assert.equal(analyzeBranch(b).assessment.code,'INCOMPLETE');
 for(const options of [{recentSlides:0},{postSlideResponses:0},{recentSlides:101}])assert.throws(()=>analyzeBranch(b,options));
});
