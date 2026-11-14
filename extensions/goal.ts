import legacy from '../modules/goal/extensions/index.ts';
import {joinRuntimeCoordinator} from '../src/runtime-coordinator_v0.17.0.ts';
export default async function goal(pi:any){if(!await joinRuntimeCoordinator(pi,'goal'))return legacy(pi);}
