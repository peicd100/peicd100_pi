import test from 'node:test';import assert from 'node:assert/strict';import {analyzeBranch,formatAnalysis} from '../src/analysis_v1.7.0.mjs';
const p={triggerPercent:95,targetPercent:90};
const a=(id,calls=[])=>({id,type:'message',message:{role:'assistant',provider:'fixture',api:'fixture',model:'m',stopReason:calls.length?'toolUse':'stop',content:calls}});
const call=id=>({type:'toolCall',name:'read',id,arguments:{path:'src/x.ts',offset:1,limit:5}});
function cycles(n){const b=[];for(let i=0;i<n;i++){b.push(a('a'+i,[call('c'+i)]),{id:'r'+i,type:'message',message:{role:'toolResult',toolCallId:'c'+i,toolName:'read',content:[{type:'text',text:'SECRET'}]}},a('owner'+i),{id:'cal'+i,type:'custom',customType:'acm-passive-calibration',data:{responseEntryId:'owner'+i}},{id:'s'+i,type:'custom',customType:'acm-passive',data:{cursorId:'owner'+i,carriedIds:[],anchorIds:[],analysisPolicy:{version:1,route:['fixture','fixture','m'],percentages:p}}});for(let j=0;j<5;j++)b.push(a(`tail${i}-${j}`));}return b;}
test('unrelated old metadata omitted does not make five verified cuts incomplete; no body leaks or mutation',()=>{
 const prefix=Array.from({length:19668},(_,i)=>({id:'unused'+i,type:'custom',customType:'irrelevant'})),b=[...prefix,...cycles(7)],before=JSON.stringify(b),r=analyzeBranch(b,{maxEntries:20});assert.equal(r.successful_slides,5);assert.equal(r.scope.complete,true);assert(r.omitted_entries>0);assert.equal(r.assessment.code,'NO_ADJUSTMENT_EVIDENCE');assert.equal(JSON.stringify(b),before);assert(!JSON.stringify(r).includes('SECRET'));assert.match(formatAnalysis(r,p),/未納入；不影響/);assert.equal(r.scope.percentages.targetPercent,90);
});
test('dependencies outside initial window are supplemented within explicit budgets',()=>{
 const b=cycles(7);const r=analyzeBranch(b,{maxEntries:10});assert.equal(r.scope.complete,true);assert(r.scope.expanded_entries>0);assert.equal(r.successful_slides,5);
});
test('genuinely absent cursor and body/discovery budget remain incomplete, not zero-reread claims',()=>{
 const b=cycles(7);b.push({id:'bad',type:'custom',customType:'acm-passive',data:{cursorId:'MISSING'}});const r=analyzeBranch(b);assert.equal(r.scope.complete,false);assert(r.scope.missing_dependency_ids>0);assert.match(formatAnalysis(r,p),/必要證據尚不完整/);
 assert.equal(analyzeBranch(cycles(7),{maxEntries:10,bodyLimit:10}).scope.complete,false);assert.equal(analyzeBranch(cycles(7),{maxEntries:10,metadataLimit:10}).scope.complete,false);
});
test('invalid budgets cannot enable unlimited history, scarce settings/observations remain conservative',()=>{
 for(const opts of [{metadataLimit:100001},{bodyLimit:100001},{maxEntries:0},{recentSlides:0}])assert.throws(()=>analyzeBranch(cycles(3),opts));assert.equal(analyzeBranch(cycles(2)).assessment.code,'INSUFFICIENT');const b=cycles(3);for(const e of b)if(e.customType==='acm-passive')delete e.data.analysisPolicy;assert.equal(analyzeBranch(b).assessment.code,'UNKNOWN_SETTINGS');
});
