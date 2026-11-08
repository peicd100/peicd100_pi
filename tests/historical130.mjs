// Explicit old release scope, not an attestation of current public factories.
import {join} from 'node:path';
const entries={acm:'tests/fixtures/acm130.ts',webhook:'modules/webhook/extensions/entry_v2.2.0.ts',theme:'modules/theme/extensions/entry_v0.4.2.ts',activity:'modules/activity/extensions/entry_v0.3.2.ts',suffix:'modules/suffix/extensions/entry_v0.1.0.ts'};
export const historical130Entries=(root,names=['acm','webhook','theme','activity','suffix'])=>names.map(name=>{if(!entries[name])throw new Error('Unknown historical resource');return join(root,entries[name]);});
