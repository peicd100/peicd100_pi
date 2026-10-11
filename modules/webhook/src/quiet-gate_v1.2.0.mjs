export const QUIET_MS = 3000;
// A debounce, not a completion detector. Eligibility must be proven separately.
export class QuietGate {
  constructor({delayMs=QUIET_MS,setTimer=setTimeout,clearTimer=clearTimeout}={}) {
    this.delayMs=delayMs;this.setTimer=setTimer;this.clearTimer=clearTimer;this.epoch=0;this.pending=false;
  }
  cancel() { this.epoch++;if(this.timer!==undefined)this.clearTimer(this.timer);this.timer=undefined;this.pending=false; }
  schedule(callback) {
    this.cancel();const epoch=this.epoch;this.pending=true;
    this.timer=this.setTimer(()=>{
      this.timer=undefined;
      const work=Promise.resolve().then(()=>this.current(epoch)?callback(epoch):undefined);
      this.work=work;
      void work.catch(()=>{}).finally(()=>{if(this.current(epoch)){this.pending=false;this.work=undefined;}});
    },this.delayMs);
    this.timer?.unref?.();
  }
  current(epoch) {return this.epoch===epoch;}
}
