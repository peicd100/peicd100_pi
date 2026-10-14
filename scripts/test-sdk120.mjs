// Explicit verification command; never used by extension runtime/startup.
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';import {spawnSync} from 'node:child_process';
let temporary,host=process.env.PI_TEST_HOST;
function run(args,env=process.env){const r=spawnSync(process.execPath,args,{stdio:'inherit',env});if(r.error)throw r.error;if(r.status!==0)throw new Error('SDK Gate failed: '+r.status);}
try{
 if(!host){if(!process.env.npm_execpath)throw new Error('Run npm run test:pi120, or provide PI_TEST_HOST for an already installed Pi 1.2.0 SDK.');temporary=mkdtempSync(join(tmpdir(),'acm-sdk120-'));run([process.env.npm_execpath,'install','--prefix',temporary,'--ignore-scripts','--no-audit','--no-fund','@earendil-works/pi-coding-agent@1.2.0','@earendil-works/pi-ai@1.2.0','@earendil-works/pi-tui@1.2.0']);host=join(temporary,'node_modules/@earendil-works/pi-coding-agent');}
 host=resolve(host);const pkg=JSON.parse(readFileSync(join(host,'package.json')));if(pkg.name!=='@earendil-works/pi-coding-agent'||pkg.version!=='1.2.0')throw new Error('Expected exact Pi SDK 1.2.0.');
 // Historical 1.11 wire/counter attestations are deliberately scoped to Pi 1.1.0.
 // Verify all current ACM/public entry/context contracts against 1.2.0 instead.
 const files=['tests/acm-native130.test.mjs','tests/acm-session120.test.mjs','tests/acm-single121.test.mjs','tests/pi-context-sdk100.test.mjs','tests/pi-context-flow100.test.mjs','tests/bundle.test.mjs'];
 console.log('Pi SDK 1.2.0 current-contract regression:',files.length,'test files; isolated fixtures, no real provider/POST.');run(['--test',...files],{...process.env,PI_TEST_HOST:host});
}finally{if(temporary)rmSync(temporary,{recursive:true,force:true});}
