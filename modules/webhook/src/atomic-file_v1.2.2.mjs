import {promises as fs} from 'node:fs';
import {setTimeout as timer} from 'node:timers';
// Capture the real local-I/O timer, independent of Goal/notification debounce
// clocks. Test injection can supply a deterministic sleep without real delays.
const localTimer=timer;
const localSleep=ms=>new Promise(resolve=>localTimer(resolve,ms));
export async function replaceFile(source,target,{platform=process.platform,rename=(a,b)=>fs.rename(a,b),sleep=localSleep}={}) {
  for(let attempt=0;;attempt++) {
    try {await rename(source,target);return;}
    catch(error) {
      // Windows readers/AV can hold the old destination briefly. Retry only
      // the same atomic local rename, never unlink the destination or resend
      // a POST. Persistent permission/sharing errors remain a hard failure.
      if(platform!=='win32'||!['EPERM','EACCES','EBUSY'].includes(error?.code)||attempt>=6)throw error;
      await sleep(10*2**attempt);
    }
  }
}
