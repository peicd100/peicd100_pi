// Read-only compiler worker. Never link/evaluate/import the inspected modules.
// Kept out of the Pi extension runtime; no model, network or dependency install.
import {readFileSync} from 'node:fs';
import {SourceTextModule} from 'node:vm';
import {stripTypeScriptTypes} from 'node:module';
const request=JSON.parse(readFileSync(0,'utf8'));
if(!Array.isArray(request)||request.length>2048)throw Error('Invalid parser request');
const results=[];
for(const file of request){
 if(!file||typeof file.path!=='string'||typeof file.source!=='string'||Buffer.byteLength(file.source)>524288)throw Error('Invalid source budget');
 try{
  const source=/\.tsx?$/u.test(file.path)?stripTypeScriptTypes(file.source,{mode:'strip'}):file.source;
  const module=new SourceTextModule(source,{identifier:file.path});
  results.push({path:file.path,status:'compiled-not-executed',dependencies:[...module.dependencySpecifiers]});
 }catch(error){results.push({path:file.path,status:'UNKNOWN',reason:typeof error.code==='string'?error.code:'unsupported-or-invalid-module'});}
}
process.stdout.write(JSON.stringify(results));
