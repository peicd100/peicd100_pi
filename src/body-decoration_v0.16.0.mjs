// Only actual native Box + SAME native Markdown is permitted by the assistant
// projection. No body rewrite, private text access, native method override or
// per-stream-token tree rebuild. Markdown's own cache services the second same-
// width render inside Box after our capability/protocol check.
export function createBodyDecoration(node,deps,{color}={}){
 let lastWidth,last=node,mode='native-not-rendered',unsafe=false;
 const available=typeof deps.Box==='function'&&typeof deps.Markdown==='function'&&node?.constructor===deps.Markdown&&['parseColor','styleText','visibleWidth'].every(key=>typeof deps[key]==='function');
 const background=available?(color??deps.parseColor('#000000')):undefined;
 const box=available?new deps.Box(2,1,text=>deps.styleText(text,{bg:background},'truecolor')):undefined;box?.addChild(node);
 const image=line=>(typeof deps.isImageLine==='function'&&deps.isImageLine(line))||/\x1b(?:_G|\]1337;File=)/u.test(line);
 return{
  pick(width,{phase='render'}={}){
   // Mouse must target the last painted layout, not measure a streaming update
   // before the user has actually seen its new geometry.
   if(phase==='mouse')return width===lastWidth?last:node;
   lastWidth=width;last=node;
   if(!available){mode='native-unsupported';return last;}
   if(!Number.isSafeInteger(width)||width<12){mode='native-narrow';return last;}
   if(unsafe){mode='native-image-or-cursor';return last;}
   let rows;try{rows=node.render(width-4);}catch{mode='native-unmeasured';return last;}
   if(!Array.isArray(rows)||!rows.length||rows.some(s=>typeof s!=='string')){mode='native-empty-or-opaque';return last;}
   if(rows.some(s=>image(s)||(typeof deps.CURSOR_MARKER==='string'&&s.includes(deps.CURSOR_MARKER)))){unsafe=true;mode='native-image-or-cursor';return last;}
   if(rows.some(s=>deps.visibleWidth(s)>width-4)){mode='native-overflow';return last;}
   last=box;mode='padded';return last;
  },
  status:()=>({mode,paddingX:2,paddingY:1}),box,
 };
}
