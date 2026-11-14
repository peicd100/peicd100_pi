// Own read-only Retry-After transport. Bounded-reader pattern adapted from
// bundled specode1.5 query.ts (MIT); upstream and financial POST stay unchanged.
import{fetchProviderJson}from'../vendor/specode-1.5.0/src/query.ts';import{retryAfterMs}from'./refresh_v0.3.0.mjs';
const allowed=new Set(['https://chatgpt.com/backend-api/wham/usage','https://chatgpt.com/backend-api/wham/usage/chatpass/apps','https://chatgpt.com/backend-api/wham/rate-limit-reset-credits']);
export async function fetchUsageJson(url,auth,signal,timeoutMs,description,request={}){
 if(request.method==='POST')return fetchProviderJson(url,auth,signal,timeoutMs,description,request);
 if(!allowed.has(url)||request.method&&request.method!=='GET'||request.body!==undefined)throw Error('Usage read route unverified');
 const controller=new AbortController(),abort=()=>controller.abort();if(signal?.aborted)controller.abort();else signal?.addEventListener('abort',abort,{once:true});const timer=setTimeout(abort,timeoutMs);let reader;
 try{const response=await fetch(url,{method:'GET',headers:{Accept:'application/json','User-Agent':'peicd100-usage/0.3.0',...auth.headers,...request.headers},redirect:'error',signal:controller.signal});if(!response.ok){void response.body?.cancel?.().catch(()=>{});throw Object.assign(Error('Usage read endpoint rejected request'),{status:response.status,retryAfterMs:retryAfterMs(response.headers.get('retry-after'))});}
  if(!response.body)throw Error('Usage read response empty');reader=response.body.getReader();const chunks=[];let bytes=0;for(;;){const{done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>64*1024){await reader.cancel();throw Error('Usage read response exceeded64KiB');}chunks.push(value);}const body=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.byteLength;}const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(body));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Usage read response not an object');return value;
 }catch(error){if(controller.signal.aborted)throw Object.assign(Error('Usage read aborted or deadline reached'),{name:'AbortError'});throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);reader?.releaseLock();}
}
