import {createHash} from 'node:crypto';import {validateSessionPolicy as legacy,initialSessionPolicy as initial,SESSION_POLICY_TYPE} from './session-policy_v1.1.0.mjs';export {SESSION_POLICY_TYPE};
export const endpointFingerprint=url=>createHash('sha256').update(new URL(url).href).digest('hex');
export function validateSessionPolicy(p){
 if(p?.version!==2)return legacy(p);
 if(Object.keys(p).sort().join()!=='authorizedEndpoint,defaultEnabled,mode,origin,version'||typeof p.authorizedEndpoint!=='string'||p.authorizedEndpoint!==''&&!/^[0-9a-f]{64}$/.test(p.authorizedEndpoint))throw new Error('Invalid endpoint consent.');
 const base=legacy({version:1,mode:p.mode,origin:p.origin,defaultEnabled:p.defaultEnabled});return{...base,version:2,authorizedEndpoint:p.authorizedEndpoint};
}
export function readSessionPolicy(branch){let p=null;for(const e of branch)if(e.type==='custom'&&e.customType===SESSION_POLICY_TYPE)p=validateSessionPolicy(e.data);return p;}
export function initialSessionPolicy(branch,defaults,enabled){return readSessionPolicy(branch)??initial(branch,defaults,enabled);}
export function sessionEnabled(p){p=validateSessionPolicy(p);return p.mode==='on'||p.mode==='default'&&p.defaultEnabled;}
export function authorizedConfig(config,policy){if(!config)return null;const allowed=config.enabled||policy?.version===2&&policy.authorizedEndpoint===endpointFingerprint(config.url);return {...config,enabled:!!allowed};}
