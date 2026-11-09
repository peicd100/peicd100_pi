// Candidate next runtime. Keep the published v0.1.0 implementation immutable.
export * from './state_v0.1.0.mjs';
import {classifyFailure as historicalFailure} from './state_v0.1.0.mjs';

// Retain permanent-error precedence and the historical transient vocabulary.
// OpenAI-compatible transports can expose ONLY this literal after Pi exhausts
// native retries. Do not classify arbitrary text containing "connection" as a
// transient failure (e.g. invalid TLS configuration or quoted tool output).
export function classifyFailure(message){
 const raw=typeof message==='string'?message:typeof message?.errorMessage==='string'?message.errorMessage:'';
 const value=raw.slice(0,16384),known=historicalFailure(value);
 if(known!=='unknown')return known;
 const terminal=value.trim();
 return /^(?:(?:Error|APIConnectionError):\s*)?(?:Retry failed after [1-9]\d{0,5} attempts:\s*)?(?:(?:Error|APIConnectionError):\s*)?Connection error\.?$/i.test(terminal)?'transient':'unknown';
}
