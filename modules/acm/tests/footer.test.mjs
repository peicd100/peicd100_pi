import test from 'node:test'; import assert from 'node:assert/strict';
import { formatFooter } from '../src/presentation_v1.5.1.mjs';
test('門檻標籤沿用有效設定，不硬編碼或顯示即時使用率', () => {
 assert.equal(formatFooter({acm:{triggerPercent:95,targetPercent:90}}),'ACM 95%→90%');
 assert.equal(formatFooter({acm:{triggerPercent:80.5,targetPercent:70.25}}),'ACM 80.5%→70.25%');
 assert.equal(formatFooter({}),'ACM 70%→55%');
 assert.equal(formatFooter({acm:{triggerPercent:95,targetPercent:95}}),'ACM 設定無效');
 assert.equal(formatFooter({compaction:{enabled:false},acm:{triggerPercent:95,targetPercent:90}}),'ACM 關閉');
});
