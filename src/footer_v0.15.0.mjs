// Display-only composition of the public native FooterComponent output.
// Never reconstruct usage, route/model names, subscription costs or context.
export function createFooterProjection(native,deps,revision){
 if(!native||typeof native.render!=='function'||typeof revision!=='function'||!['truncateToWidth','wrapTextWithAnsi'].every(k=>typeof deps[k]==='function'))throw new Error('Footer public API unavailable');
 let cached,layout='not-rendered';
 return {
  render(width){
   if(width<=0)return[];
   const key=revision();if(cached?.width===width&&cached.key===key)return cached.lines;
   const wide=native.render(width+1024);let lines;
   if(!Array.isArray(wide)||wide.length<2||typeof wide[1]!=='string'){layout='unverified-native-fallback';lines=native.render(width);}
   else{
    // Native footer separates statistics/model with >=2 padding columns. A
    // strictly larger gap proves the model was not right-truncated at wide.
    const padding=/ {3,}/u.exec(wide[1]);
    if(!padding){layout='unverified-native-fallback';lines=native.render(width);}
    else{
     const stats=wide[1].slice(0,padding.index)+'\x1b[0m',model=wide[1].slice(padding.index+padding[0].length);
     const color=deps.styleModel??(s=>s);
     lines=[deps.truncateToWidth(wide[0],width,'...'),deps.truncateToWidth(stats,width,'...'),...deps.wrapTextWithAnsi(color(model),width),...wide.slice(2).map(s=>deps.truncateToWidth(s,width,'...'))];
     layout='native-stats-model-separate';
    }
   }
   cached={key,width,lines};return lines;
  },
  invalidate(){cached=undefined;native.invalidate?.();},
  status:()=>({layout}),
 };
}
