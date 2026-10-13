import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('Theme0.4.1 changes only pending background from303030 to404040, historical0.4.0 preserved',async()=>{
 const load=async name=>JSON.parse(await readFile(new URL('../modules/theme/themes/'+name,import.meta.url),'utf8'));
 const old=await load('pi-theme-docker-look_v0.4.0.json'),current=await load('pi-theme-docker-look.json');assert.equal(old.colors.toolPendingBg,'#303030');assert.equal(current.colors.toolPendingBg,'#404040');current.colors.toolPendingBg=old.colors.toolPendingBg;assert.deepEqual(current,old);
});
