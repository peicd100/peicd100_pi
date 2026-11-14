// TEST BOOTSTRAP ONLY. When PI_TEST_HOST is not given, point it at the Pi SDK
// already installed on this machine (the version named by install/current-version).
// An explicit PI_TEST_HOST always wins. No download, no install, no symlink.
import{readFileSync,existsSync}from'node:fs';import{join}from'node:path';import{homedir}from'node:os';
if(!process.env.PI_TEST_HOST){
  const install=join(homedir(),'.pi','agent','install');let version;
  try{version=readFileSync(join(install,'current-version'),'utf8').trim();}catch{}
  const host=version&&/^[0-9A-Za-z.+-]+$/.test(version)?join(install,'releases',version,'node_modules','@earendil-works','pi-coding-agent'):undefined;
  if(host&&existsSync(join(host,'package.json'))){process.env.PI_TEST_HOST=host;process.stderr.write('[test] PI_TEST_HOST not set; using installed Pi SDK '+version+'\n');}
  else throw Error('PI_TEST_HOST is not set and no installed Pi SDK was found under ~/.pi/agent/install. Set PI_TEST_HOST to the @earendil-works/pi-coding-agent package folder.');
}
