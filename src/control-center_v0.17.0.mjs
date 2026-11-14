// Immutable public overview; an optional explicit primitive editor stays in
// this same native canvas. Rendering never reads files/auth/network or acts.
import {createControlEditor} from './control-editor_v0.17.0.mjs';
export const CONTROL_SECTIONS=Object.freeze([
 ['accounts','帳號'],['usage','Usage'],['reset','重置'],['goal','Goal'],['progress','Progress'],['notify','通知'],['focus','Focus'],['acm','ACM'],['context','Context'],['appearance','外觀'],['diagnostics','診斷'],
].map(([id,label])=>Object.freeze({id,label})));
const publicText=(value,deps)=>deps.stripTerminalSequences(String(value??'')).replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/gu,' ').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu,'<隱藏信箱>').slice(0,1024);
export function controlSnapshot(input,deps){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Control snapshot unavailable');
 const result={};for(const {id}of CONTROL_SECTIONS){const value=input[id];if(!value){result[id]=Object.freeze({loaded:undefined,enabled:undefined,version:'未知',scope:'未提供作用範圍',fields:Object.freeze([])});continue;}
  const fields=Array.isArray(value.fields)?value.fields.slice(0,64).map(item=>Object.freeze({label:publicText(item?.label,deps),value:item?.classification==='public'&&!/(?:token|cookie|password|secret|credential|密碼|憑證)/iu.test(item?.label??'')?publicText(item.value,deps):'不顯示未分類或敏感資料'})):[];
  result[id]=Object.freeze({loaded:typeof value.loaded==='boolean'?value.loaded:undefined,enabled:typeof value.enabled==='boolean'?value.enabled:undefined,version:publicText(value.version??'未知',deps),scope:publicText(value.scope??'未提供作用範圍',deps),fields:Object.freeze(fields)});
 }return Object.freeze(result);
}
export function createControlCenterSource({tui,theme,deps,snapshot,controls,initialSection}){
 let frozen=controlSnapshot(snapshot,deps),editor,ownerChoices,ownerIndex=0,actionChoices,actionIndex=0,openingPresentation=false,closed=false,notice='';const sideWidth=17,mainSource={render:width=>editor?.status().active?editor.render(width):new deps.Text(actionChoices?['視圖／原生操作頁（開頁不授權、不提交）',...actionChoices.map((item,i)=>(i===actionIndex?'> ':'  ')+item.module+'｜'+item.label),'↑↓選擇、Enter開啟；V返回'].join('\n'):ownerChoices?['選擇設定模組',...ownerChoices.map((id,i)=>(i===ownerIndex?'> ':'  ')+id),'↑↓選擇、Enter進入；E返回'].join('\n'):content(),0,0).render(width),invalidate(){}};
 const main=new deps.ScrollView(mainSource,{follow:'none',overscroll:'contain',scrollbar:'hidden'}),sidebar=new deps.ScrollView({render:()=>[],invalidate(){}},{follow:'none',overscroll:'contain',scrollbar:'hidden'});
 let selected=Math.max(0,CONTROL_SECTIONS.findIndex(item=>item.id===initialSection)),version=0,viewport={width:1,maxHeight:1},layout,dragged=false,revealSidebar=true,revealEditor=false;
 const fg=(kind,text)=>typeof theme?.fg==='function'?theme.fg(kind,text):text;
 const content=()=>{const {id,label}=CONTROL_SECTIONS[selected],value=frozen[id],loaded=value.loaded===undefined?'未知（尚無可驗證的模組狀態）':value.loaded?'已載入':'未載入',enabled=value.enabled===undefined?'未知':value.enabled?'已啟用':'已關閉';return[
  label+(controls?'｜控制中心':'｜唯讀快照'),`載入：${loaded}`,`功能：${enabled}`,`版本：${value.version}`,`作用範圍：${value.scope}`,'',...value.fields.map(field=>field.label+'：'+field.value),'',controls?'E本頁設定；V視圖／原生頁。E只套用單一設定；登入／切帳號／用卡不在通用套用內。':'此原型不套用設定、不登入、不切帳號、不用卡。',notice,'未知不代表關閉或額度為零；重新查看不重送工作。',
 ].join('\n');};
 const repaint=()=>{version++;tui.requestRender();};
 if(controls)editor=createControlEditor({deps,controls,repaint:()=>{revealEditor=true;repaint();},canApply:()=>!!layout&&layout.mainWidth>=24&&main.scrollTop===0&&layout.height>=editor.requiredRows(layout.mainWidth),exit:()=>{main.scrollToStart();repaint();},onSettled:()=>{if(controls.snapshot)frozen=controlSnapshot(controls.snapshot(),deps);main.scrollToStart();}});
 const select=index=>{const next=Math.max(0,Math.min(CONTROL_SECTIONS.length-1,index));if(next===selected)return;selected=next;revealSidebar=true;main.scrollToStart();repaint();};
 const pad=(line,width)=>deps.truncateToWidth(line,width,'')+' '.repeat(Math.max(0,width-deps.visibleWidth(deps.truncateToWidth(line,width,''))));
 return{
  preserveScrollOnNavigate:true,
  revision:()=>version,
  setViewport(value){if(value.width!==viewport.width||value.maxHeight!==viewport.maxHeight){viewport=value;revealSidebar=true;revealEditor=true;version++;}},
  render(width){
   layout=undefined;
   if(!Number.isSafeInteger(width)||width<1||viewport.maxHeight<1){layout=undefined;return[];}
   const wide=width>=72&&viewport.maxHeight>=5,mainWidth=Math.max(1,width-(wide?sideWidth+2:0)),all=mainSource.render(mainWidth),header=wide?0:1,available=Math.max(0,viewport.maxHeight-header),height=Math.min(available,Math.max(wide?CONTROL_SECTIONS.length:0,all.length));
   main.updateLayout(all.length,height,repaint);sidebar.updateLayout(CONTROL_SECTIONS.length,height,repaint);
   if(revealEditor&&editor?.status().active){const state=editor.status(),caret=typeof deps.CURSOR_MARKER==='string'?all.findIndex(row=>row.includes(deps.CURSOR_MARKER)):-1,selectedRow=all.findIndex(row=>deps.stripTerminalSequences(row).trimStart().startsWith('> ')),row=state.attention?0:state.editing?(mainWidth<24||height<editor.requiredRows(mainWidth)?Math.max(0,caret):0):Math.max(0,selectedRow);if(row<main.scrollTop)main.scrollTo(row);else if(row>=main.scrollTop+height&&height>0)main.scrollTo(row-height+1);revealEditor=false;}
   if(revealSidebar){if(selected<sidebar.scrollTop)sidebar.scrollTo(selected);else if(selected>=sidebar.scrollTop+height&&height>0)sidebar.scrollTo(selected-height+1);revealSidebar=false;}
   const body=all.slice(main.scrollTop,main.scrollTop+height);while(body.length<height)body.push('');
   layout={wide,width,height,header,mainWidth,mainRows:all.length,sideTop:sidebar.scrollTop};
   if(!wide)return[fg('accent',deps.truncateToWidth(`‹ ${CONTROL_SECTIONS[selected].label} › ${selected+1}/${CONTROL_SECTIONS.length}｜←→分類`,width,'')),...body.map(s=>deps.truncateToWidth(s,width,''))].slice(0,viewport.maxHeight);
   return body.map((line,i)=>{const index=i+sidebar.scrollTop,item=CONTROL_SECTIONS[index],left=item?(index===selected?'> ':'  ')+item.label:'';return pad(fg(index===selected?'accent':'muted',left),sideWidth)+fg('border','│ ')+deps.truncateToWidth(line,mainWidth,'');});
  },
  navigateKey(key){
   const match=name=>deps.matchesKey(key,name);if(editor?.status().active){editor.handleInput(key);repaint();return true;}
   if(actionChoices){
    if(match('up'))actionIndex=Math.max(0,actionIndex-1);else if(match('down'))actionIndex=Math.min(actionChoices.length-1,actionIndex+1);
    else if(key==='v'||key==='V')actionChoices=undefined;
    else if(match('return')&&!openingPresentation){const action=actionChoices[actionIndex];actionChoices=undefined;openingPresentation=true;notice='開啟所選視圖／確認頁；尚未由此選單套用任何設定。';const settled=error=>{openingPresentation=false;if(closed)return;notice=error?'所選介面未能安全開啟，未由此選單重送操作。':'';try{if(controls.snapshot)frozen=controlSnapshot(controls.snapshot(),deps);}catch{}main.scrollToStart();repaint();};try{void Promise.resolve(controls.openPresentation(action.module,action.id)).then(()=>settled(false),()=>settled(true));}catch{settled(true);}}
    if(actionChoices){const row=actionIndex+1,height=layout?.height??1;if(row<main.scrollTop)main.scrollTo(row);else if(row>=main.scrollTop+height)main.scrollTo(Math.max(0,row-height+1));}repaint();return true;
   }
   if(ownerChoices){if(match('up'))ownerIndex=Math.max(0,ownerIndex-1);else if(match('down'))ownerIndex=Math.min(ownerChoices.length-1,ownerIndex+1);else if(match('return')){editor.open(ownerChoices[ownerIndex]);ownerChoices=undefined;}else if(key==='e'||key==='E')ownerChoices=undefined;repaint();return true;}
   if(controls&&(key==='v'||key==='V')){if(!openingPresentation){actionChoices=controls.presentationActions?.(CONTROL_SECTIONS[selected].id)??[];actionIndex=0;if(!actionChoices.length){actionChoices=undefined;notice='本頁沒有已註冊的安全視圖／初始化入口。';}}main.scrollToStart();repaint();return true;}
   if(controls&&(key==='e'||key==='E')){const ids=controls.modules(CONTROL_SECTIONS[selected].id);if(ids.length===1)editor.open(ids[0]);else if(ids.length){ownerChoices=ids;ownerIndex=0;}else notice='本頁目前沒有可安全編輯的設定接口。';main.scrollToStart();repaint();return true;}
   if(match('tab')||match('right'))select((selected+1)%CONTROL_SECTIONS.length);else if(match('shift+tab')||match('left'))select((selected-1+CONTROL_SECTIONS.length)%CONTROL_SECTIONS.length);else if(match('up'))main.scrollBy(-1);else if(match('down'))main.scrollBy(1);else if(match('pageUp'))main.scrollBy(-Math.max(1,layout?.height??1));else if(match('pageDown'))main.scrollBy(Math.max(1,layout?.height??1));else if(match('home'))main.scrollToStart();else if(match('end'))main.scrollToEnd();else if(match('return')){/* No implicit mutation outside the explicit editor/review. */}else return false;repaint();return true;
  },
  handleMouse(event){
   if(event.type==='press')dragged=false;if(event.type==='drag')dragged=true;if(!layout)return;
   if(editor?.status().active&&event.x>=(layout.wide?sideWidth+2:0)){const result=editor.handleMouse({...event,x:event.x-(layout.wide?sideWidth+2:0),y:event.y-layout.header+main.scrollTop,dragged});if(result?.handled){repaint();return result;}}
   if(event.type==='drag')return;
   if(event.type==='wheel'&&event.wheelDelta){if(layout.wide&&event.x<sideWidth)sidebar.scrollBy(event.wheelDelta);else main.scrollBy(event.wheelDelta);repaint();return{handled:true};}
   if(event.type!=='click'||event.button!=='left'||dragged||event.shift||event.alt||event.ctrl)return;
   if(editor?.status().active||ownerChoices||actionChoices)return;
   if(layout.wide&&event.x<sideWidth&&event.y>=0&&event.y<layout.height){select(sidebar.scrollTop+event.y);return{handled:true};}
   if(!layout.wide&&event.y===0){select((selected+1)%CONTROL_SECTIONS.length);return{handled:true};}
  },
  invalidate(){version++;},close(){closed=true;editor?.close();},
  status:()=>({presentationChoices:actionChoices?.length??0,presentationIndex:actionIndex,openingPresentation,selected:CONTROL_SECTIONS[selected].id,index:selected,readonly:!editor?.status().active,snapshot:true,editor:editor?.status(),layout:layout?{...layout}:undefined,scrollTop:main.scrollTop}),
 };
}
