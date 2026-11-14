// Preserve exact legacy embedding when the coordinating root is omitted.
import legacy from './index_v0.3.0.ts';
import current from './index_v0.4.0.ts';
import {localFocusGoalActive} from '../../../src/local-focus-goal-bridge_20261112.ts';
// 2026-11-12: the model-facing text of update_progress is shortened; details and behaviour are unchanged.
import {installWithCompactResults,compactProgressText} from '../../../src/compact-tool-result_20261112.ts';
export default function progress(pi:any){return installWithCompactResults(pi,localFocusGoalActive(pi)?current:legacy,{update_progress:compactProgressText});}
