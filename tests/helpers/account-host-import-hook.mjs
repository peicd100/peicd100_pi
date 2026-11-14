// TEST-ONLY additive public-subpath resolver. The historical bootstrap stays
// byte-identical. Node's own ESM exports/import conditions validate each subpath;
// no provider/auth/model API is replaced and no private SDK path is bypassed.
import'./host-import-hook.mjs';import{registerHooks}from'node:module';import{join,resolve}from'node:path';import{pathToFileURL}from'node:url';
const host=process.env.PI_TEST_HOST;if(!host)throw Error('Explicit PI_TEST_HOST required');const parentURL=pathToFileURL(join(resolve(host),'package.json')).href;registerHooks({resolve(specifier,context,next){if(specifier.startsWith('@earendil-works/pi-ai/'))return next(specifier,{...context,parentURL});return next(specifier,context);}});
