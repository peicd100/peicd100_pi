// Factory-private capability channel, never registered as a tool/event/UI API.
// Matching values/JSON, a copied options object, or a generic true flag cannot
// reproduce a binding. The account factory receives bind; provider gets read.
export function createOwnedRequestAdmissionChannel(){
  const requests=new WeakMap();
  return Object.freeze({
    bind(options,ticket){
      if(!options||typeof options!=='object'||requests.has(options)||typeof ticket?.valid!=='function'||ticket.valid()!==true)throw Error('Owned native request admission unavailable');
      requests.set(options,ticket);
    },
    read(options){const ticket=requests.get(options);if(!ticket)return undefined;const valid=()=>{try{return ticket.valid()===true;}catch{return false;}};valid.fresh=async()=>{try{return valid()&&(typeof ticket.fresh!=='function'||await ticket.fresh()===true)&&valid();}catch{return false;}};return valid;}
  });
}
