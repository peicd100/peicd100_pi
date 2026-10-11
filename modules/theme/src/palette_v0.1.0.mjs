export const VERSION='0.1.0';
export const OWN_NAME='pi-theme-user';
export const LABELS={accent:'主要強調色',border:'一般邊框',borderAccent:'強調邊框',borderMuted:'次要邊框',success:'成功文字',error:'錯誤文字',warning:'警告文字',muted:'次要文字',dim:'淡色文字',text:'一般文字',thinkingText:'思考文字',selectedBg:'選取背景',scrollbarTrack:'捲軸軌道',scrollbarThumb:'捲軸滑塊',searchMatchBg:'搜尋命中背景',searchMatchText:'搜尋命中文字',userMessageBg:'使用者訊息背景',userMessageText:'使用者訊息文字',customMessageBg:'自訂訊息背景',customMessageText:'自訂訊息文字',customMessageLabel:'自訂訊息標籤',toolPendingBg:'工具執行中背景',toolSuccessBg:'工具成功背景',toolErrorBg:'工具錯誤背景',toolTitle:'工具標題',toolOutput:'工具輸出',mdHeading:'標題文字',mdLink:'連結文字',mdLinkUrl:'連結網址',mdCode:'行內程式碼',mdCodeBlock:'程式碼區塊文字',mdCodeBlockBorder:'程式碼區塊邊框',mdQuote:'引用文字',mdQuoteBorder:'引用邊框',mdHr:'水平分隔線',mdListBullet:'清單符號',toolDiffAdded:'差異新增文字',toolDiffRemoved:'差異刪除文字',toolDiffContext:'差異上下文',syntaxComment:'語法註解',syntaxKeyword:'語法關鍵字',syntaxFunction:'語法函式',syntaxVariable:'語法變數',syntaxString:'語法字串',syntaxNumber:'語法數字',syntaxType:'語法型別',syntaxOperator:'語法運算子',syntaxPunctuation:'語法標點',thinkingOff:'不思考邊框',thinkingMinimal:'最低思考邊框',thinkingLow:'低思考邊框',thinkingMedium:'中思考邊框',thinkingHigh:'高思考邊框',thinkingXhigh:'極高思考邊框',thinkingMax:'最高思考邊框',bashMode:'終端指令模式',pageBg:'HTML 頁面背景',cardBg:'HTML 卡片背景',infoBg:'HTML 資訊背景'};
export const BG_KEYS=new Set(['selectedBg','searchMatchBg','userMessageBg','customMessageBg','toolPendingBg','toolSuccessBg','toolErrorBg']);
const OPTIONAL={scrollbarTrack:'muted',scrollbarThumb:'text',searchMatchBg:'selectedBg',searchMatchText:'text',thinkingMax:'thinkingXhigh'};
export function hex(value){if(typeof value!=='string'||!/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()))throw new Error('請輸入 #RGB 或 #RRGGBB 色碼。');let s=value.trim().slice(1);if(s.length===3)s=[...s].map(c=>c+c).join('');return '#'+s.toUpperCase();}
export function validatePalette(input,{name=OWN_NAME}={}) {
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['$schema','name','appearance','colors','export'].includes(k))||typeof input.name!=='string'||!input.name||input.name==='system'||/[\/\\\x00-\x1f\x7f]/.test(input.name)||input.name.length>100||!['dark','light'].includes(input.appearance??'dark'))throw new Error('主題格式無效；第一版支援完整 HEX 配色，不支援變數或其他色彩語法。');
 const keys=Object.keys(LABELS).filter(k=>!['pageBg','cardBg','infoBg'].includes(k)),colors={};
 if(!input.colors||typeof input.colors!=='object'||Array.isArray(input.colors)||Object.keys(input.colors).some(k=>!keys.includes(k)))throw new Error('主題含未知配色欄位。');
 for(const k of keys)if(!OPTIONAL[k])colors[k]=hex(input.colors[k]);
 for(const k of Object.keys(OPTIONAL))colors[k]=hex(input.colors[k]??colors[OPTIONAL[k]]);
 if(input.export!==undefined&&(!input.export||typeof input.export!=='object'||Array.isArray(input.export)||Object.keys(input.export).some(k=>!['pageBg','cardBg','infoBg'].includes(k))))throw new Error('HTML 匯出配色欄位無效。');
 const defaults=input.appearance==='light'?['#FFFFFF','#F5F5F5','#E5E5E5']:['#1E1E1E','#262626','#333038'];
 const exported=Object.fromEntries(['pageBg','cardBg','infoBg'].map((k,i)=>[k,hex(input.export?.[k]??defaults[i])]));
 return {$schema:'https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json',name,appearance:input.appearance??'dark',colors,export:exported};
}
export function editColor(input,key,value){const draft=validatePalette(input);if(!(key in LABELS))throw new Error('未知配色項目。');(key in draft.colors?draft.colors:draft.export)[key]=hex(value);return draft;}
export function themeParts(input){const data=validatePalette(input),fg={},bg={};for(const[k,v]of Object.entries(data.colors))(BG_KEYS.has(k)?bg:fg)[k]=v;return {data,fg,bg};}
