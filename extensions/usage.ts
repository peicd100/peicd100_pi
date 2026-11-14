import legacy from '../modules/usage/extensions/index.ts';
import {joinRuntimeCoordinator} from '../src/runtime-coordinator_v0.17.0.ts';
export default async function usage(pi:any){if(!await joinRuntimeCoordinator(pi,'usage'))return legacy(pi);}
