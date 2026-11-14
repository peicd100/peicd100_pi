// Read-compatible legacy display schema, using the bounded/deep-CAS successor
// helper. Focus imports it READONLY; future changes belong to its new timeline.
import {PrivatePreference} from './preferences_v0.17.0.mjs';
import {controlFields,controlValues} from './control-defaults_v0.17.0.mjs';
export const DISPLAY_FIELDS=controlFields({window:{kind:'boolean'},preview:{kind:'boolean'},lines:{kind:'integer',min:1,max:200},limit:{kind:'integer',min:1,max:2000}});
export const DISPLAY_DEFAULTS=Object.freeze({window:true,preview:true,lines:10,limit:100});
export class DisplayPreferences extends PrivatePreference{
 constructor(root){super(root,{defaults:()=>({schema:1,revision:'implicit',...DISPLAY_DEFAULTS}),validate:value=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==6||value.schema!==1||typeof value.revision!=='string'||!/^(?:implicit|[a-f0-9-]{36})$/u.test(value.revision)||Object.keys(value).some(key=>!['schema','revision',...Object.keys(DISPLAY_FIELDS)].includes(key)))throw Error('Unverified legacy display preferences');const values=controlValues(DISPLAY_FIELDS,Object.fromEntries(Object.keys(DISPLAY_FIELDS).map(key=>[key,value[key]])));return Object.freeze({schema:1,revision:value.revision,...values});},patchFields:Object.keys(DISPLAY_FIELDS)});}
}
