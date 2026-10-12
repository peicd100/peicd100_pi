import {lstat} from 'node:fs/promises';
import {Store} from '../../webhook/src/core_v1.4.0.mjs';
// Reuse audited secret-free preferences I/O, no endpoints/receipts are written.
export class VisibilityStore {
 constructor(root){this.store=new Store(root);}
 async read(){try{await lstat(this.store.preferencesPath);}catch(e){if(e.code==='ENOENT')return false;throw e;}return this.store.readDefault();}
 async save(visible){if(typeof visible!=='boolean')throw new Error('Invalid visibility.');await this.store.writeDefault(visible);}
}
