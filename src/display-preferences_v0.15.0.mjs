import {PrivatePreference} from './preferences_v0.15.0.mjs';
const fields=['schema','revision','window','preview','lines','limit'],defaults=()=>({schema:1,revision:'implicit',window:true,preview:true,lines:10,limit:100});
const validate=value=>{if(!value||value.schema!==1||typeof value.revision!=='string'||!(/^(?:implicit|[a-f0-9-]{36})$/).test(value.revision)||typeof value.window!=='boolean'||typeof value.preview!=='boolean'||!Number.isSafeInteger(value.lines)||value.lines<1||value.lines>200||!Number.isSafeInteger(value.limit)||value.limit<1||value.limit>2000||Object.keys(value).some(k=>!fields.includes(k)))throw new Error('顯示偏好格式無法驗證，保留原生顯示');return value;};
export class DisplayPreferences extends PrivatePreference{
 constructor(root){super(root,{defaults,validate,patchFields:['window','preview','lines','limit']});}
}
