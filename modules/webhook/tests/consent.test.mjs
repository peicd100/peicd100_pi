import test from 'node:test';import assert from 'node:assert/strict';import {authorizedConfig,endpointFingerprint,validateSessionPolicy,sessionEnabled} from '../src/session-policy_v1.5.0.mjs';
const cfg={version:1,enabled:false,url:'https://notify.example.invalid/fixture',key:'private-key',format:'generic',notifyOn:['completed']},old={version:1,mode:'on',defaultEnabled:true,origin:'explicit'};
test('legacy on policy alone cannot unlock endpoint; current v2 consent does not alter raw config or siblings, changed endpoint invalidates consent',()=>{
 const p={...old,version:2,authorizedEndpoint:endpointFingerprint(cfg.url)};assert.equal(authorizedConfig(cfg,old).enabled,false);assert(authorizedConfig(cfg,p).enabled);assert.equal(cfg.enabled,false);assert(!authorizedConfig({...cfg,url:'https://other.example.invalid/x'},p).enabled);assert(sessionEnabled(p));assert(!JSON.stringify(p).includes('private-key'));assert(!JSON.stringify(p).includes('https://'));assert(authorizedConfig(cfg,{...p,mode:'off'}).enabled,'explicit test may bypass session off, not endpoint permission');
});
test('unknown consent schema fails closed; legacy snapshots still read unchanged',()=>{
 assert.deepEqual(validateSessionPolicy(old),old);for(const authorizedEndpoint of ['not a hash',null,1])assert.throws(()=>validateSessionPolicy({...old,version:2,authorizedEndpoint}));assert.throws(()=>validateSessionPolicy({...old,version:2,authorizedEndpoint:'',secret:'no'}));
});
