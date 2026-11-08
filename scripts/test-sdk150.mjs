// Explicit, isolated current-suite Gate. Never run by extension startup.
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
let temporary,host=process.env.PI_TEST_HOST;
function run(args,env=process.env){const result=spawnSync(process.execPath,args,{stdio:'inherit',env});if(result.error)throw result.error;if(result.status!==0)throw new Error('Pi 1.5.0 Gate failed: '+result.status);}
try{
 if(!host){if(!process.env.npm_execpath)throw new Error('Use npm run test:pi150 or PI_TEST_HOST for an installed exact 1.5.0 SDK.');temporary=mkdtempSync(join(tmpdir(),'pi-sdk150-'));run([process.env.npm_execpath,'install','--prefix',temporary,'--ignore-scripts','--no-audit','--no-fund','@earendil-works/pi-coding-agent@1.5.0','@earendil-works/pi-ai@1.5.0','@earendil-works/pi-tui@1.5.0']);host=join(temporary,'node_modules/@earendil-works/pi-coding-agent');}
 host=resolve(host);const pkg=JSON.parse(readFileSync(join(host,'package.json')));if(pkg.name!=='@earendil-works/pi-coding-agent'||pkg.version!=='1.5.0')throw new Error('Expected exact Pi SDK 1.5.0.');
 const files=['acm-k140','goal-progress140','goal-sdk140','notify-own-goal-sdk140','notify-own-goal140','menus140','preferences140','focus140','focus-sdk140','bundle'].map(name=>'tests/'+name+'.test.mjs');
 console.log('Pi SDK 1.5.0 suite and public entries; isolated fixtures, mock provider/POST only.');run(['--test',...files],{...process.env,PI_TEST_HOST:host});
}finally{if(temporary)rmSync(temporary,{recursive:true,force:true});}
