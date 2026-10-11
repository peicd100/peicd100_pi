import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import acm from '../modules/acm/extensions/index.ts';
import noSummaryGuard from '../modules/acm/extensions/no-summary-guard.ts';

// One public resource: enabling/disabling ACM always includes its independent
// no-summary guard. The producer must register before the guard.
export default function acmModule(pi: ExtensionAPI) {
  acm(pi);
  noSummaryGuard(pi);
}
