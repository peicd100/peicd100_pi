// Only derived RAM preview pixels. No SDK globals, originals or model content writes.
export function previewGeometry(source,canvas,grid,cell){
 const w=grid.columns*cell.widthPx,h=grid.rows*cell.heightPx,scale=Math.min(w/source.widthPx,h/source.heightPx);
 const innerWidth=Math.max(1,Math.min(canvas.widthPx,Math.round(canvas.widthPx*source.widthPx*scale/w))),innerHeight=Math.max(1,Math.min(canvas.heightPx,Math.round(canvas.heightPx*source.heightPx*scale/h)));
 const physicalWidth=innerWidth/canvas.widthPx*w,physicalHeight=innerHeight/canvas.heightPx*h;
 return{sourcePixels:{...source},previewPixels:{...canvas},placementCells:{...grid},assumedBoxPixels:{width:w,height:h},innerPixels:{width:innerWidth,height:innerHeight,x:Math.floor((canvas.widthPx-innerWidth)/2),y:Math.floor((canvas.heightPx-innerHeight)/2)},assumedContentPixels:{width:physicalWidth,height:physicalHeight},relativeAspectError:Math.abs((physicalWidth/physicalHeight)/(source.widthPx/source.heightPx)-1)};
}
export function installDisplayCalibration(renderer,{Tui,Photon,profile,terminalProgram='unknown',cacheItems=16,cacheBytes=8*1024*1024}={}){
 const adapters=new WeakMap(),cache=new Map();let usedBytes=0,builds=0,lastFallback=null;
 const originalSurface=renderer.imageSurface,originalStatus=renderer.status,originalRestart=renderer.restart,originalMetadata=renderer.imageMetadata;
 const sdkCells=()=>{try{const v=Tui.getCellDimensions();return{widthPx:v.widthPx,heightPx:v.heightPx};}catch{return null;}};
 const profileReason=()=>{const c=sdkCells(),e=profile?.expectedSdkCellPixels,d=profile?.assumedDisplayCellPixels;
  if(profile?.enabled!==true)return'disabled';if(terminalProgram!==profile.terminalProgram)return'terminal-mismatch';if(!e||!d||![e.widthPx,e.heightPx,d.widthPx,d.heightPx].every(n=>Number.isFinite(n)&&n>0&&n<=512))return'invalid-profile';if(c?.widthPx!==e.widthPx||c?.heightPx!==e.heightPx)return'sdk-cell-mismatch';if(Tui.getCapabilities()?.images!=='kitty')return'non-kitty';return null;};
 const remove=adapter=>{const item=cache.get(adapter);if(item){usedBytes-=item.bytes;cache.delete(adapter);}};
 const clear=()=>{cache.clear();usedBytes=0;lastFallback=null;};
 function build(block,columns,maxRows){
  const source=Tui.getPngDimensions(block.data.slice(0,96)),sdk=sdkCells(),display=profile.assumedDisplayCellPixels;
  if(!source||source.widthPx*source.heightPx>16*1024*1024||block.data.length>24*1024*1024)throw Error('preview-limit');
  let cw=Math.max(1,Math.min(source.widthPx,1024,Math.round(columns*display.widthPx))),ch=Math.max(1,Math.round(cw*source.heightPx/source.widthPx*(display.widthPx/display.heightPx)/(sdk.widthPx/sdk.heightPx)));
  if(ch>4096||cw*ch>2*1024*1024)throw Error('preview-limit');
  const canvas={widthPx:cw,heightPx:ch};let blank,decoded,resized,final;
  try{
   blank=new Photon.PhotonImage(new Uint8Array(cw*ch*4),cw,ch);
   // Probe the public API with a REAL transparent PNG of these dimensions. No drawing,
   // no false metadata, no imageId/registry mutation or private SDK imports.
   const probe=Tui.renderImage(Buffer.from(blank.get_bytes()).toString('base64'),canvas,{maxWidthCells:columns,maxHeightCells:maxRows,moveCursor:false});
   if(!probe?.columns||!probe?.rows)throw Error('preview-layout');
   const geometry=previewGeometry(source,canvas,{columns:probe.columns,rows:probe.rows},display);
   if(!Number.isFinite(geometry.relativeAspectError)||geometry.relativeAspectError>0.01)throw Error('preview-resolution');
   decoded=Photon.PhotonImage.new_from_byteslice(Buffer.from(block.data,'base64'));
   if(decoded.get_width()!==source.widthPx||decoded.get_height()!==source.heightPx)throw Error('preview-source');
   const {width,height,x,y}=geometry.innerPixels;resized=Photon.resize(decoded,width,height,Photon.SamplingFilter.Lanczos3);
   const pixels=resized.get_raw_pixels(),raw=new Uint8Array(cw*ch*4);
   for(let row=0;row<height;row++)raw.set(pixels.subarray(row*width*4,(row+1)*width*4),((row+y)*cw+x)*4);
   final=new Photon.PhotonImage(raw,cw,ch);return{data:Buffer.from(final.get_bytes()).toString('base64'),geometry};
  }finally{final?.free();resized?.free();decoded?.free();blank?.free();}
 }
 class PreviewAdapter{
  constructor(original,block){this.original=original;this.block=block;this.imageId=undefined;}
  invalidate(){cache.get(this)?.native.invalidate();this.original.invalidate?.();}
  getImageId(){return cache.get(this)?.native.getImageId()??this.original.getImageId?.();}
  render(width){
   const reason=profileReason();if(reason||width<4||this.block?.mimeType!=='image/png'){remove(this);lastFallback=reason??'unsupported-image';return this.original.render(width);}
   const columns=Math.max(1,Math.min(width-2,60)),c=sdkCells(),maxRows=Math.ceil(columns*c.widthPx/c.heightPx),key=columns+':'+maxRows+':'+c.widthPx+':'+c.heightPx+':'+profile.assumedDisplayCellPixels.widthPx+':'+profile.assumedDisplayCellPixels.heightPx;
   let item=cache.get(this);if(item?.key!==key){remove(this);try{const prepared=build(this.block,columns,maxRows),bytes=Buffer.byteLength(prepared.data);if(bytes>cacheBytes)throw Error('preview-cache-limit');this.imageId??=Tui.allocateImageId();const native=new Tui.Image(prepared.data,'image/png',{fallbackColor:s=>renderer.deps?.theme?.fg?.('dim',s)??s},{maxWidthCells:60,imageId:this.imageId},prepared.geometry.previewPixels);item={key,bytes,native,geometry:prepared.geometry};cache.set(this,item);usedBytes+=bytes;builds++;while(cache.size>cacheItems||usedBytes>cacheBytes)remove(cache.keys().next().value);}catch{lastFallback='preview-unavailable';return this.original.render(width);}}
   // LRU, retaining at most the documented RAM budget. Native IDs remain stable.
   cache.delete(this);cache.set(this,item);lastFallback=null;return item.native.render(width);
  }
 }
 if(typeof originalMetadata==='function')renderer.imageMetadata=function(view){const text=originalMetadata.call(this,view);return profileReason()===null&&view.result?.content?.some(b=>b.type==='image'&&b.mimeType==='image/png')?text+'｜本機校正模式':text;};
 renderer.imageSurface=function(image,view){let adapter=adapters.get(image);if(!adapter){const index=view.imageNodes?.indexOf(image)??-1;adapter=new PreviewAdapter(image,view.imageBlocks?.[index]);adapters.set(image,adapter);}return originalSurface.call(this,adapter,view);};
 renderer.status=function(...args){const value=originalStatus.apply(this,args);return{...value,imageCalibration:{schema:1,kind:'manual-provisional-display-preview',enabled:profile?.enabled===true,decoderAvailable:typeof Photon?.PhotonImage==='function'&&typeof Photon?.resize==='function',eligible:profileReason()===null,profileId:profile?.profileId??null,expectedSdkCellPixels:profile?.expectedSdkCellPixels??null,assumedDisplayCellPixels:profile?.assumedDisplayCellPixels??null,provenance:profile?.provenance??null,physicalPixelsVerified:false,originalsAndModelImages:'unchanged',fontZoomDpiChange:'requires-recalibration',fallback:lastFallback??profileReason(),builds,cache:{items:cache.size,bytes:usedBytes,maxItems:cacheItems,maxBytes:cacheBytes},samples:[...cache.values()].map(v=>v.geometry)}};};
 renderer.restart=function(...args){clear();return originalRestart.apply(this,args);};return{clear,status:()=>renderer.status().imageCalibration};
}
