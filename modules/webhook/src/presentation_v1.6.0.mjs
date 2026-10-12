import {formatStatus as legacy,stateLabel,onOff,outcomeLabel} from './presentation_v1.5.0.mjs';
export {stateLabel,onOff,outcomeLabel};
export function formatStatus(s){return legacy({...s,master_enabled:s.endpoint_authorized}).replace(`端點權限：`, `全域總開關：${onOff(s.master_enabled)}（所有對話與明確測試）\n端點權限：`).replace('開關只有：設定新對話預設／當前對話開／當前對話關；不重設事件。端點未授權不送出，開啟時明確提示。','全域總開關、新對話預設、當前對話選擇互相獨立；不重設事件。總開關關閉／端點未授權／本對話關閉，皆不自動通知。');}
