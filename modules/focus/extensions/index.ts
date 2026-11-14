// Local preview is latched by the first resource; no marker mid-load race.
import legacy from './index_v0.3.2.ts';
import local from './index_local_dynamic_20261112.ts';
import {localFocusGoalActive} from '../../../src/local-focus-goal-bridge_20261112.ts';
export default function focus(pi:any){return(localFocusGoalActive(pi)?local:legacy)(pi);}
