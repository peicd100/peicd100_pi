// Frozen 0.13 ACM resource contract: historical exact-footer/native tests.
// Current public eight-resource behavior is tested by bundle.test and *140.
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import acm from '../../modules/acm/extensions/index_v1.13.0.ts';
import guard from '../../modules/acm/extensions/no-summary-guard_v1.13.0.ts';
export default function historical130(pi: ExtensionAPI) { acm(pi); guard(pi); }
