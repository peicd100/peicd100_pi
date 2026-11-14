// Local preview is latched by the first resource; no marker mid-load race.
import legacy from './index_v0.5.0.ts';
import local from './index_v0.7.0.ts';
import {localFocusGoalActive} from '../../../src/local-focus-goal-bridge_20261112.ts';
// 2026-11-12: the model-facing text of peicd100_goal is shortened; details and behaviour are unchanged.
import {installWithCompactResults,compactGoalText} from '../../../src/compact-tool-result_20261112.ts';
export default function goal(pi:any){return installWithCompactResults(pi,localFocusGoalActive(pi)?local:legacy,{peicd100_goal:compactGoalText});}
