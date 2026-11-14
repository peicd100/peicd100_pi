// Preserve exact legacy embedding when the coordinating root is omitted.
import legacy from './index_v0.4.0.ts';
import current from './index_v0.5.0.ts';
import {localFocusGoalActive} from '../../../src/local-focus-goal-bridge_20261112.ts';
export default function suffix(pi:any){return(localFocusGoalActive(pi)?current:legacy)(pi);}
