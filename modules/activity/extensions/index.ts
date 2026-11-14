// Preserve exact legacy embedding when the coordinating root is omitted.
import legacy from './index_v0.7.0.ts';
import current from './index_v0.8.0.ts';
import {localFocusGoalActive} from '../../../src/local-focus-goal-bridge_20261112.ts';
export default function activity(pi:any){return(localFocusGoalActive(pi)?current:legacy)(pi);}
