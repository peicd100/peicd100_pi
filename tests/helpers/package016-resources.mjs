// Exact former0.16 resource versions: genuine Native loader regression, not
// current0.17 evidence and not a reason to force its abort-on-complete behavior.
import{fileURLToPath}from'node:url';
export const entryPaths=['./package016-acm.ts','../../modules/webhook/extensions/index_v2.6.0.ts','../../modules/theme/extensions/index_v0.7.0.ts','../../modules/activity/extensions/index_v0.7.0.ts','../../modules/suffix/extensions/index_v0.4.0.ts','../../modules/goal/extensions/index_v0.5.0.ts','../../modules/progress/extensions/index_v0.3.0.ts','../../modules/focus/extensions/index_v0.3.2.ts','../../modules/usage/extensions/index_v0.3.1.ts'].map(p=>fileURLToPath(new URL(p,import.meta.url)));
