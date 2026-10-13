// Stable entrypoint; historical factories remain immutable for provenance.
import producer from './index_v1.11.0.js';
import {namespaceAPI} from '../../../src/commands_v0.11.0.mjs';
import {captureCommands,registerAcmMenu} from '../../../src/menu_v0.11.0.mjs';
export default function acmMenu(pi:any){
 const captured=captureCommands(pi);producer(captured.api);
 // Producer registers through namespaceAPI; translate names for direct routing.
 const commands=new Map([...captured.commands].map(([name,options])=>[name.replace(/\((?:piecd100|peicd100)\)$/,''),options]));
 registerAcmMenu(namespaceAPI(pi),commands);
}
