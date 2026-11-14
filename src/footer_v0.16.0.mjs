import{createFooterProjection as originalProjection}from'./footer_v0.15.0.mjs';
const sanitize=s=>s.replace(/[\r\n\t]/gu,' ').replace(/ +/gu,' ').trim();
// Keep exact native costs/context/model rendering. Only recompose a PROVEN
// public extension-status row; never parse numbers or synthesize quota/capacity.
export function createFooterProjection(native,deps,revision,statuses=()=>null){
 let wide,wideWidth,cached,statusLayout='not-rendered';const proxy={render:w=>{wideWidth=w;return wide=native.render(w);},invalidate:()=>native.invalidate?.()},base=originalProjection(proxy,deps,revision);
 return{
  render(width){if(width<=0)return[];const key=revision();if(cached?.width===width&&cached.key===key)return cached.lines;const original=base.render(width);let lines=original;statusLayout='native-status-retained';
   try{const map=statuses();if(width>=2&&base.status().layout==='native-stats-model-separate'&&Array.isArray(wide)&&wide.length===3&&map instanceof Map&&(map.has('acm-passive')||map.has('subscription-usage'))&&typeof deps.visibleWidth==='function'&&typeof deps.wrapTextWithAnsi==='function'){
     const entries=[...map.entries()].sort(([a],[b])=>a.localeCompare(b));if(entries.some(([k,v])=>typeof k!=='string'||typeof v!=='string'))throw Error('Status map not verified');const expected=entries.map(([,v])=>sanitize(v)).join(' ');
     if(deps.visibleWidth(expected)>wideWidth||wide[2]!==expected)throw Error('Native status row differs from public map');
     const known=['acm-passive','subscription-usage'].filter(k=>map.has(k)).map(k=>sanitize(map.get(k))),combined=known.join('  │  '),own=deps.visibleWidth(combined)<=width?[combined]:known.flatMap(s=>deps.wrapTextWithAnsi(s,width));if(own.some(s=>deps.visibleWidth(s)>width))throw Error('Wide glyph cannot fit');
     const others=entries.filter(([k])=>!['acm-passive','subscription-usage'].includes(k)).map(([,v])=>sanitize(v)).join(' ');lines=[...original.slice(0,-1),...own,...(others?[deps.truncateToWidth(others,width,'...')]:[])];statusLayout='verified-shared-acm-quota';
    }
   }catch{statusLayout='unverified-status-map-native-fallback';}
   cached={width,key,lines};return lines;
  },
  invalidate(){cached=undefined;base.invalidate();},status:()=>({...base.status(),statusLayout}),
 };
}
