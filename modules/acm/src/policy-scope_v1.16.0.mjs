import{createHash,createHmac,randomBytes,randomUUID}from'node:crypto';
// Local SDK credential snapshot, NOT a server-verified account ID. Never invokes
// getProviderAuth/login/refresh/network. Unknown auth blocks delayed application;
// explicit idle confirmation retains the existing session-setting behavior.
export function createPolicyScope({readCredential,getSettings}={}){
 if(typeof readCredential!=='function'||typeof getSettings!=='function')throw Error('ACM scope requires local public SDK reader/settings');const salt=randomBytes(32),digest=x=>createHmac('sha256',salt).update(JSON.stringify(x)).digest('hex');let branchNonce=randomUUID();
 return Object.freeze({reset(){branchNonce=randomUUID();},capture(ctx){const m=ctx.model;let accountBinding=null;try{const credential=typeof m?.provider==='string'&&m.provider?readCredential(m.provider):undefined;if(credential&&typeof credential==='object'&&typeof credential.then!=='function'&&['key','apiKey','access','accessToken','refresh','refreshToken','token'].some(k=>typeof credential[k]==='string'&&credential[k].length>0)){const text=JSON.stringify(credential);if(Buffer.byteLength(text)<=65536)accountBinding=digest([m?.provider,text]);}}catch{/* Explicit unverified identity, never fall through to credential resolution. */}
  return{sessionId:ctx.sessionManager.getSessionId(),fileBinding:createHash('sha256').update(JSON.stringify([ctx.sessionManager.getSessionId(),ctx.sessionManager.getSessionFile?.()??ctx.cwd])).digest('hex'),branchNonce,anchorId:ctx.sessionManager.getLeafId?.()??null,routeBinding:digest([m?.provider,m?.api,m?.id,m?.baseUrl,m?.contextWindow,m?.maxTokens,m?.inputLimits,m?.headers]),accountBinding,settingsBinding:digest(getSettings())};
 }});
}
export function scopeIdentity(scope){const{anchorId,...stable}=scope;return JSON.stringify(stable);}
