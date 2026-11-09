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
 const files=['acm-k140','goal-progress140','goal-sdk140','goal-retry150','goal-retry-sdk150','goal-control150','goal-control-sdk150','goal-quota-core150','goal-quota-service150','agent-notify-core150','agent-notify-sdk150','notify-coordination-policy150','notify-coordination-sdk150','candidate-bundle-sdk150','goal-quota-sdk150','goal-runtime4-regression150','usage-ui2-sdk150','usage-safety150','usage-client-engine150','usage-presentation150','usage-ui-sdk150','transcript-sdk150','transcript-live-sdk150','footer-sdk150','footer-owner-sdk150','assistant-sdk150','panel-sdk150','menu-sdk150','display-sdk150','display-bridge-sdk150','display-preferences150','focus-groups150','focus-unified-sdk150','focus-factory-sdk150','display-modules150','display-modules-factory-sdk150','user-preview-sdk150','notify-own-goal-sdk140','notify-own-goal140','menus140','preferences140','focus140','focus-sdk140','bundle'].map(name=>'tests/'+name+'.test.mjs');
 console.log('Pi SDK 1.5.0 suite and public entries; isolated fixtures, mock provider/POST only.');run(['--test',...files],{...process.env,PI_TEST_HOST:host});
}finally{if(temporary)rmSync(temporary,{recursive:true,force:true});}
