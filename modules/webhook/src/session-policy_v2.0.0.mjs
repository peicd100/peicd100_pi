import {readSessionPolicy as readLegacy,sessionEnabled as legacyEnabled,endpointFingerprint} from './session-policy_v1.5.0.mjs';
import {profileFingerprint} from './core_v2.0.0.mjs';
export const SESSION_POLICY_TYPE='notify-session-policy';
export function validateSessionPolicy(p){
 if(!p||p.version!==3||!['on','off','default'].includes(p.mode)||typeof p.defaultEnabled!=='boolean'||!['explicit','default','legacy'].includes(p.origin)||typeof p.authorizedEndpoint!=='string'||p.authorizedEndpoint!==''&&!/^[a-f0-9]{64}$/.test(p.authorizedEndpoint))throw new Error('Invalid Notify session choice.');
 return {version:3,mode:p.mode,defaultEnabled:p.defaultEnabled,origin:p.origin,authorizedEndpoint:p.authorizedEndpoint};
}
export function readSessionPolicy(branch){let p=null;for(const e of branch)if(e.type==='custom'&&e.customType===SESSION_POLICY_TYPE)p=validateSessionPolicy(e.data);return p;}
export function initialSessionPolicy(branch,defaults,config){
 const current=readSessionPolicy(branch);if(current)return current;
 const old=readLegacy(branch);if(old){
  // Legacy global-off is permission history, never a hidden new global switch.
  // Keep that branch off until explicit new on/setup consent, even if another
  // session configures a new channel before this branch is first loaded.
  const blocked=config?.legacyConsentAllowed===false;
  const consent=!blocked&&old.version===2&&old.authorizedEndpoint&&config?.format!=='telegram'&&old.authorizedEndpoint===endpointFingerprint(config.url)?profileFingerprint(config):'';
  return {version:3,mode:blocked?'off':legacyEnabled(old)?'on':'off',defaultEnabled:old.defaultEnabled,origin:'legacy',authorizedEndpoint:consent};
 }
 return {version:3,mode:'default',defaultEnabled:defaults,origin:'default',authorizedEndpoint:''};
}
export function sessionEnabled(p){p=validateSessionPolicy(p);return p.mode==='on'||p.mode==='default'&&p.defaultEnabled;}
export function authorizedConfig(config,policy){return config?{...config,sourcePermission:config.enabled,enabled:config.enabled||!!policy?.authorizedEndpoint&&policy.authorizedEndpoint===profileFingerprint(config)}:null;}
