// TEST ONLY: native TS factory imports resolve the same public TypeBox peer
// as the selected SDK loader. No host files/prototypes/API/exports replaced.
import'./account-host-import-hook.mjs';import{registerHooks}from'node:module';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
const parentURL=pathToFileURL(join(resolve(process.env.PI_TEST_HOST),'package.json')).href;registerHooks({resolve(specifier,context,next){return specifier==='typebox'?next(specifier,{...context,parentURL}):next(specifier,context);}});
