import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {fileURLToPath} from 'node:url';import {stripVTControlCharacters} from 'node:util';import {visibleWidth,parseColor} from '@earendil-works/pi-tui';import {fromHost} from './runtime.mjs';
const palette=JSON.parse(await readFile(new URL('../themes/pi-theme-docker-look.json',import.meta.url))),tm=await fromHost('dist/modes/interactive/theme/theme.js'),{AssistantMessageComponent}=await fromHost('dist/modes/interactive/components/assistant-message.js');
test('穩定fallback只改四個role；正文、使用者訊息與語法配色保留',()=>{
 assert.equal(palette.colors.mdHeading,'#C7A0E8');assert.equal(palette.colors.mdLink,'#C7A0E8');assert.equal(palette.colors.error,'#E07A86');assert.equal(palette.colors.toolErrorBg,'#3A2329');assert.equal(palette.colors.text,'#CCCCCC');assert.equal(palette.colors.userMessageText,'#000000');assert.equal(palette.colors.userMessageBg,'#FFFFFF');assert.equal(palette.colors.syntaxKeyword,'#AF87AF');assert.equal(palette.colors.mdCode,'#87AFAF');assert.equal(palette.colors.mdCodeBlock,'#CCCCCC');
});
test('真正assistant renderer無轉換器：串流/換行/窄欄/標題連結正常，原訊息不改',()=>{
 const theme=tm.loadThemeFromPath(fileURLToPath(new URL('../themes/pi-theme-docker-look.json',import.meta.url)));tm.setThemeInstance(theme);
 const text='第一段文字。\n\n## 標題\n\n[連結](https://example.invalid)\n\n**粗體**與`程式碼`\n\n```js\nconst x = 1;\n```\n\n最後一段文字。',message={role:'assistant',content:[{type:'text',text}],stopReason:'stop'},before=JSON.stringify(message),component=new AssistantMessageComponent(undefined,false,tm.getMarkdownTheme(),'思考',1,[]),purple=theme.fg('mdHeading','X').split('X')[0];
 for(const width of[12,40,80]){
  for(const n of[8,30,text.length]){component.updateContent({...message,content:[{type:'text',text:text.slice(0,n)}]},n<text.length);for(const line of component.render(width))assert(visibleWidth(line)<=width);}
  const lines=component.render(width);assert(lines.some(s=>stripVTControlCharacters(s).includes('標題')&&s.includes(purple)));assert(lines.some(s=>stripVTControlCharacters(s).includes('連結')&&s.includes(purple)));const body=lines.find(s=>stripVTControlCharacters(s).trim().startsWith('最後'));assert(body);assert(!body.includes(purple));
 }assert.equal(JSON.stringify(message),before);
});
test('簡單官方Markdown包色在串流結束後仍無法保持後續正文紫色，因此不採用',()=>{
 const theme=tm.loadThemeFromPath(fileURLToPath(new URL('../themes/pi-theme-docker-look.json',import.meta.url)));tm.setThemeInstance(theme);const text='第一段文字。\n\n第二段文字。',fg=parseColor('#C7A0E8'),prefix=theme.style('X',{fg}).split('X')[0],transform=(s,c)=>c.messageType==='assistant'?theme.style(s,{fg}):s,component=new AssistantMessageComponent(undefined,false,tm.getMarkdownTheme(),'思考',1,[transform]);assert.equal(transform(text,{messageType:'user'}),text);assert.equal(transform(text,{messageType:'assistant-thinking'}),text);for(const n of[8,text.length])component.updateContent({content:[{type:'text',text:text.slice(0,n)}]},n<text.length);const last=component.render(40).find(s=>stripVTControlCharacters(s).trim()==='第二段文字。');assert(last);assert(!last.includes(prefix));
});
