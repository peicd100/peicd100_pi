// Full-Gate safety boundary, test process ONLY. Before loading SDK/modules,
// every Node test worker gets its own disposable default agent-dir. Individual
// fixtures may temporarily choose their own dirs; restoring env stays isolated.
import'./default-local-host.mjs';import{mkdtempSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
const directory=mkdtempSync(join(tmpdir(),'peicd100-full-test-default-'));
process.env.PI_CODING_AGENT_DIR=directory;
// Never let a forgotten mock authenticate against a real ambient provider.
// Inspect variable NAMES only; no values are logged/copied into fixtures.
for(const name of Object.keys(process.env))if(/(?:API_KEY|ACCESS_TOKEN|REFRESH_TOKEN|AUTH_TOKEN|CLIENT_SECRET|PASSWORD|PRIVATE_KEY)$/iu.test(name))delete process.env[name];
process.once('exit',()=>{try{rmSync(directory,{recursive:true,force:true});}catch{}});
await import('./account-host-import-hook.mjs');
