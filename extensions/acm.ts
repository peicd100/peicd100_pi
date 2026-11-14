import {bootstrapLocalFocusGoalDisplay} from '../src/local-focus-goal-bridge_20261112.ts';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {createAcmExtension} from '../modules/acm/extensions/index_v1.19.0.ts';
import {createRuntimeCoordinator} from '../src/runtime-coordinator_v0.17.0.ts';
import noSummaryGuard from '../modules/acm/extensions/no-summary-guard.ts';

// One public resource: enabling/disabling ACM always includes its independent
// no-summary guard. The producer must register before the guard.
export default async function acmModule(pi: ExtensionAPI) {
  bootstrapLocalFocusGoalDisplay(pi);
  // Factory-local Context/account/Goal graph: no capability singleton or event
  // handoff. Other resource facades observe readonly presence and do not repeat.
  await createRuntimeCoordinator(pi,{modules:[],installACM:(raw:any,context:any)=>createAcmExtension(raw,context)});
  noSummaryGuard(pi);
}
