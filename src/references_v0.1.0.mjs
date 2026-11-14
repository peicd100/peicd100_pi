// Developer-only reference projection. Source compilation is NOT execution.
import {readFileSync,readdirSync,lstatSync,realpathSync,existsSync,mkdirSync,writeFileSync,renameSync,unlinkSync,rmdirSync} from 'node:fs';
import {resolve,join,relative,dirname,posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
export const REFERENCE_VERSION='0.1.0';
const HERE=dirname(fileURLToPath(import.meta.url)),WORKER=resolve(HERE,'../scripts/reference-parser.mjs');
const EXCLUDED=new Set(['.git','.peicd100','node_modules','private','artifacts','archive','dist','build','coverage','.cache','.env']);
const hash=b=>createHash('sha256').update(b).digest('hex');
const relativePath=p=>typeof p==='string'&&p.length>0&&p.length<1024&&!p.includes('\\')&&!p.includes(':')&&!p.includes('\0')&&!p.startsWith('/')&&p.split('/').every(x=>x&&x!=='.'&&x!=='..');
const canonical=o=>JSON.stringify(o);
const fingerprint=()=>hash(canonical({version:REFERENCE_VERSION,node:process.version,v8:process.versions.v8,self:hash(readFileSync(fileURLToPath(import.meta.url))),worker:hash(readFileSync(WORKER)),policy:[...EXCLUDED].sort()}));
const sourcePath=p=>/\.(?:mjs|cjs|js|ts|tsx)$/u.test(p);
function inventory(root){
 root=realpathSync(root);const files=[],notes=[];let bytes=0;
 function walk(dir){
  for(const item of readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
   if(EXCLUDED.has(item.name)||item.name.startsWith('.'))continue;
   const full=join(dir,item.name),path=relative(root,full).replaceAll('\\','/'),stat=lstatSync(full);
   if(stat.isSymbolicLink()){notes.push({path,evidence:'UNKNOWN',reason:'symlink-not-followed'});continue;}
   if(stat.isDirectory()){walk(full);continue;}
   if(!stat.isFile()||!sourcePath(path)&&!['package.json','MODULES.json'].includes(path))continue;
   if(!relativePath(path))throw Error('Unsafe source path');
   if(stat.size>524288)throw Error('Source file budget exceeded: '+path);
   const data=readFileSync(full);bytes+=data.length;if(bytes>16777216||files.length>=2048)throw Error('Source inventory budget exceeded');
   files.push({path,sha256:hash(data),bytes:data.length,source:data.toString('utf8')});
  }
 }
 walk(root);files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
 const digest=hash(canonical(files.map(({path,sha256})=>[path,sha256])));
 return{root,files,notes,digest,bytes};
}
function assertIndex(index){
 if(!index||index.schema!==1||index.version!==REFERENCE_VERSION||typeof index.root!=='string'||!Array.isArray(index.files)||index.files.length>2048||!Array.isArray(index.edges)||!Array.isArray(index.symbols)||!Array.isArray(index.active))throw Error('Invalid reference index');
 for(const f of index.files)if(!relativePath(f?.path)||typeof f.sha256!=='string'||!/^[a-f0-9]{64}$/u.test(f.sha256))throw Error('Unsafe reference file');
 const copy={...index};delete copy.integrity;
 if(index.integrity!==hash(canonical(copy)))throw Error('Reference index integrity mismatch');
 return index;
}
function compile(files){
 if(!files.length)return[];
 const child=spawnSync(process.execPath,['--no-warnings','--max-old-space-size=256','--experimental-vm-modules',WORKER],{input:canonical(files.map(({path,source})=>({path,source}))),encoding:'utf8',maxBuffer:16777216,timeout:20000,windowsHide:true});
 if(child.error||child.status!==0)throw Error('Reference compiler unavailable; no partial index committed');
 let result;try{result=JSON.parse(child.stdout);}catch{throw Error('Unverified reference compiler response');}
 if(!Array.isArray(result)||result.length!==files.length||result.some((r,i)=>r.path!==files[i].path||!['compiled-not-executed','UNKNOWN'].includes(r.status)||r.status!=='UNKNOWN'&&(!Array.isArray(r.dependencies)||r.dependencies.some(s=>typeof s!=='string'))))throw Error('Unverified reference compiler response');
 return result;
}
const lineAt=(source,index)=>1+(source.slice(0,index).match(/\n/gu)?.length??0);
const escaped=s=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
function location(source,specifier){
 const re=new RegExp(String.raw`(?:\bfrom\s*|\bimport\s*)(['"])`+escaped(specifier)+String.raw`\1`,'gu');
 const matches=[...source.matchAll(re)];
 return matches.length===1?{line:lineAt(source,matches[0].index),locationEvidence:'DECLARED'}:{line:null,locationEvidence:'UNKNOWN',locationReason:matches.length?'ambiguous-source-location':'escaped-or-unavailable-source-location'};
}
function declarations(file){
 const found=[],patterns=[['command',/\bregisterCommand\s*\(\s*(['"])([^'"\r\n]{1,100})\1/gu],['event',/\.on\s*\(\s*(['"])([^'"\r\n]{1,100})\1/gu],['symbol',/\b(?:class|function)\s+([A-Za-z_$][\w$]*)/gu],['export',/\bexport\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gu],['tool',/\bregisterTool\s*\(\s*\{\s*name\s*:\s*(['"])([^'"\r\n]{1,100})\1/gu]];
 for(const[kind,re]of patterns)for(const match of file.source.matchAll(re)){
  if(found.length>=256)return{found,truncated:true};
  found.push({file:file.path,line:lineAt(file.source,match.index),kind,name:kind==='symbol'||kind==='export'?match[1]:match[2],evidence:'DECLARED',note:'lexical declaration candidate; not runtime registration attestation',sha256:file.sha256});
 }
 return{found,truncated:false};
}
function resolveImport(from,specifier,known){
 if(!specifier.startsWith('.'))return{to:null,resolution:specifier.startsWith('node:')?'builtin':'external-binding-not-followed'};
 const target=posix.normalize(posix.join(posix.dirname(from),specifier));
 if(!relativePath(target))return{to:null,resolution:'outside-root-not-followed'};
 const choices=[target,...(/\.js$/u.test(target)?[target.slice(0,-3)+'.ts',target.slice(0,-3)+'.tsx']:[]),...(!posix.extname(target)?['.mjs','.js','.ts','/index.mjs','/index.js','/index.ts'].map(s=>target+s):[])];
 const matched=choices.filter(p=>known.has(p));
 if(matched[0]===target)return{to:target,resolution:'exact-file'};
 return matched.length===1?{to:matched[0],resolution:'DECLARED-source-fallback-not-loader-attestation'}:{to:null,resolution:matched.length?'ambiguous-source-fallback':'unresolved'};
}
const metadata=(files,name)=>{const f=files.find(x=>x.path===name);if(!f)return{};try{return JSON.parse(f.source);}catch{throw Error('Invalid public metadata: '+name);}};
function entryPaths(pkg){
 const result=[];
 for(const value of pkg.pi?.extensions??[]){const path=typeof value==='string'?value:value?.source;if(typeof path!=='string')continue;const normalized=path.replace(/^\.\//u,'');if(relativePath(normalized))result.push(normalized);}
 return [...new Set(result)].sort();
}
function manifestRoles(nodes,manifest,unknown){
 const byPath=new Map(nodes.map(n=>[n.path,n])),bindings=[];
 const mark=(files,prefix,role,moved={})=>{
  if(!files||typeof files!=='object'||Array.isArray(files))return;
  for(const [original,sha256]of Object.entries(files)){
   if(typeof sha256!=='string'||!/^[a-f0-9]{64}$/u.test(sha256))continue;
   const local=typeof moved[original]==='string'?moved[original]:original,path=prefix+local;
   if(!relativePath(path)){unknown.push({file:path,line:null,evidence:'UNKNOWN',reason:'unsafe-manifest-reference'});continue;}
   const node=byPath.get(path),matched=node?.sha256===sha256,mapped=local!==original;
   const selectedRole=role==='origin-hash-matched'&&mapped?'published-preserved':role;
   const replaced=['historical-hash-matched','origin-hash-matched'].includes(role)&&!mapped&&!/_v\d/u.test(path);
   const status=matched?'source-hash-matched':!node?'not-in-source-inventory':replaced?'historical-or-origin-reference-not-selected':'hash-mismatch';
   bindings.push({path,role:selectedRole,status,sha256});
   if(matched&&!node.roles.includes(selectedRole))node.roles.push(selectedRole);
   if(status==='hash-mismatch')unknown.push({file:path,line:null,evidence:'UNKNOWN',reason:'manifest-hash-mismatch'});
  }
 };
 mark(manifest.shared_runtime,'','published-preserved');
 mark(manifest.active_runtime?.files,'','manifest-active-hash-matched');
 for(const module of manifest.modules??[]){
  if(typeof module.module!=='string'||!/^[a-z0-9_-]+$/u.test(module.module))continue;
  const prefix='modules/'+module.module+'/';
  mark(module.files,prefix,'origin-hash-matched',module.preserved_paths);
  mark(module.active?.files,prefix,'manifest-active-hash-matched');
  for(const release of module.historical_releases??[])mark(release.files,prefix,'historical-hash-matched',release.preserved_paths);
 }
 return bindings;
}
export function buildReferenceIndex(root,{previous}={}){
 const scan=inventory(root),toolFingerprint=fingerprint(),old=previous?assertIndex(previous):undefined;
 const reusable=old&&old.root===scan.root&&old.toolFingerprint===toolFingerprint?new Map(old.files.map(f=>[f.path,f])):new Map();
 const changed=scan.files.filter(f=>sourcePath(f.path)&&reusable.get(f.path)?.sha256!==f.sha256),parsed=new Map(compile(changed).map(r=>[r.path,r]));
 const nodes=scan.files.map(f=>({path:f.path,sha256:f.sha256,bytes:f.bytes,parser:sourcePath(f.path)?parsed.get(f.path)??reusable.get(f.path)?.parser:{status:'public-metadata'}}));
 const edges=[],symbols=[],unknown=[...scan.notes],known=new Set(nodes.map(f=>f.path));
 for(const file of scan.files){
  const parser=nodes.find(n=>n.path===file.path).parser;if(!sourcePath(file.path))continue;
  if(parser?.status!=='compiled-not-executed')unknown.push({file:file.path,line:null,evidence:'UNKNOWN',reason:parser?.reason??'no-parser-evidence'});
  else for(const specifier of parser.dependencies)edges.push({from:file.path,specifier,kind:'static-import',evidence:'EXTRACTED',...location(file.source,specifier),...resolveImport(file.path,specifier,known),sha256:file.sha256});
  const declared=declarations(file);symbols.push(...declared.found);
  if(declared.truncated)unknown.push({file:file.path,line:null,evidence:'UNKNOWN',reason:'declaration-budget-exceeded'});
  // A conservative hint, never a claimed executable edge. Strings/comments can match.
  for(const match of file.source.matchAll(/\b(?:import|require)\s*\(/gu))unknown.push({file:file.path,line:lineAt(file.source,match.index),evidence:'UNKNOWN',reason:'possible-dynamic-import-or-require-lexical-hint-not-runtime-proof'});
  for(const match of file.source.matchAll(/\bimport\s+type\b[^;]*?\bfrom\s*(['"])([^'"\r\n]+)\1/gu))edges.push({from:file.path,specifier:match[2],kind:'type-reference',evidence:'DECLARED',line:lineAt(file.source,match.index),...resolveImport(file.path,match[2],known),sha256:file.sha256});
 }
 const pkg=metadata(scan.files,'package.json'),manifest=metadata(scan.files,'MODULES.json'),entries=entryPaths(pkg),active=new Set(),pending=[...entries];
 while(pending.length){const path=pending.pop();if(active.has(path))continue;if(!known.has(path)){unknown.push({file:path,line:null,evidence:'UNKNOWN',reason:'manifest-entry-not-in-inventory'});continue;}active.add(path);for(const edge of edges)if(edge.from===path&&edge.kind==='static-import'&&edge.to)pending.push(edge.to);}
 for(const node of nodes){node.roles=[];if(active.has(node.path))node.roles.push('active-runtime');if(/\.(?:test|spec)\.[cm]?[jt]s$/u.test(node.path))node.roles.push('test');else if(/(?:^|\/)tests?\//u.test(node.path))node.roles.push('test-support-not-runnable-test');}
 const manifestBindings=manifestRoles(nodes,manifest,unknown);
 for(const node of nodes)if(!node.roles.length)node.roles.push('unreachable-or-development-not-proven-obsolete');
 if(inventory(root).digest!==scan.digest)throw Error('Source changed while compiling; index not committed');
 const index={schema:1,version:REFERENCE_VERSION,toolFingerprint,root:scan.root,builtAt:new Date().toISOString(),inventoryDigest:scan.digest,manifestVersion:manifest.active_runtime?.bundle_version??null,manifestBindings,entries,active:[...active].sort(),files:nodes,edges,symbols,unknown,work:{compiled:changed.length,reused:scan.files.filter(f=>sourcePath(f.path)).length-changed.length},limitations:['Static source projection, not loaded/runtime attestation.','DECLARED symbols and dynamic hints may be lexical mentions, never proof of execution.','External packages, private data and symlinks are not followed.','Unknown relations require conservative tests; final full Gate is mandatory.']};
 index.integrity=hash(canonical(index));return index;
}
export function verifyReferenceIndex(root,index){
 assertIndex(index);const scan=inventory(root),changed=[];
 if(index.root!==scan.root)changed.push('root');if(index.toolFingerprint!==fingerprint())changed.push('tool-or-node-version');
 const previous=new Map(index.files.map(f=>[f.path,f.sha256])),current=new Set(scan.files.map(f=>f.path));
 for(const file of scan.files)if(previous.get(file.path)!==file.sha256)changed.push(file.path);
 for(const file of index.files)if(!current.has(file.path))changed.push(file.path);
 return{fresh:changed.length===0&&scan.digest===index.inventoryDigest,changed:[...new Set(changed)],inventoryDigest:scan.digest};
}
function fresh(root,index){const status=verifyReferenceIndex(root,index);if(!status.fresh)throw Error('Stale reference index; rebuild before query: '+status.changed.slice(0,5).join(', '));}
export function queryReferences(root,index,text,{all=false,limit=40}={}){
 fresh(root,index);if(typeof text!=='string'||!text||text.length>256||!Number.isInteger(limit)||limit<1||limit>200)throw Error('Invalid reference query');const needle=text.toLowerCase(),active=new Set(index.active),included=file=>all||active.has(file),files=index.files.filter(f=>included(f.path)&&f.path.toLowerCase().includes(needle)),symbols=index.symbols.filter(s=>included(s.file)&&s.name.toLowerCase().includes(needle)),edges=index.edges.filter(e=>included(e.from)&&[e.from,e.to??'',e.specifier].some(s=>s.toLowerCase().includes(needle)));
 return{scope:all?'all-public-source':'active-runtime-only',query:text,totals:{files:files.length,symbols:symbols.length,edges:edges.length},files:files.slice(0,limit),symbols:symbols.slice(0,limit),edges:edges.slice(0,limit),truncated:files.length>limit||symbols.length>limit||edges.length>limit,limitations:index.limitations};
}
export function referenceImpact(root,index,file){
 fresh(root,index);if(!relativePath(file)||!index.files.some(f=>f.path===file))throw Error('Unknown/unsafe impact target');
 const reached=new Set([file]),queue=[file];while(queue.length){const to=queue.pop();for(const edge of index.edges)if(edge.to===to&&!reached.has(edge.from)){reached.add(edge.from);queue.push(edge.from);}}
 const affected=index.files.filter(f=>reached.has(f.path)),tests=affected.filter(f=>f.roles.includes('test')).map(f=>f.path),uncertainTests=[...new Set(index.unknown.filter(x=>index.files.some(f=>f.path===x.file&&f.roles.includes('test'))).map(x=>x.file))];
 const uncertainSupport=[...new Set(index.unknown.filter(x=>index.files.some(f=>f.path===x.file&&f.roles.includes('test-support-not-runnable-test'))).map(x=>x.file))];
 return{file,affected:affected.map(({path,roles,sha256})=>({path,roles,sha256})),tests,testSupport:affected.filter(f=>f.roles.includes('test-support-not-runnable-test')).map(f=>f.path),conservativeUnknownTests:uncertainTests,conservativeUnknownSupport:uncertainSupport,unknownRelations:index.unknown.length,complete:false,warning:'Candidate impact only. Dynamic/event/host relationships may be missing; do not skip final full Gate.'};
}
export function readReferenceIndex(path){const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>16777216)throw Error('Unsafe index input');return assertIndex(JSON.parse(readFileSync(path,'utf8')));}
export function saveReferenceIndex(path,index,{expectedHash=null}={}){
 assertIndex(index);const dir=dirname(resolve(path));mkdirSync(dir,{recursive:true});const lock=path+'.lock';mkdirSync(lock);const temporary=path+'.'+randomUUID()+'.new';
 try{
  if(existsSync(path)&&lstatSync(path).isSymbolicLink())throw Error('Unsafe index output');
  const old=existsSync(path)?readFileSync(path):undefined;
  if(old&&expectedHash!==hash(old)||!old&&expectedHash!==null)throw Error('Index output CAS conflict');
  if(old)assertIndex(JSON.parse(old.toString('utf8')));
  writeFileSync(temporary,JSON.stringify(index,null,2)+'\n',{flag:'wx',mode:0o600});renameSync(temporary,path);
 }finally{if(existsSync(temporary))unlinkSync(temporary);rmdirSync(lock);}
}
export const referenceFileHash=path=>{if(!existsSync(path))return null;const stat=lstatSync(path);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>16777216)throw Error('Unsafe index input');return hash(readFileSync(path));};
