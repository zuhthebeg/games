// Independent animated 3D layers with camera-Z occlusion. Only selected parts decode.
const base = new URL('../../assets/sprites/player-skeleton-equipment/', import.meta.url);
let pendingManifest;
const canvas = (w,h) => { const c=document.createElement('canvas'); c.width=w;c.height=h;return c; };
async function manifest() {
  pendingManifest ||= fetch(new URL('manifest.json',base)).then(async r=>{
    if(!r.ok) throw new Error(`Skeleton manifest ${r.status}`);
    const m=await r.json();if(m.id!=='player-skeleton-equipment'||Object.keys(m.animations).length!==48)throw new Error('Incomplete skeleton kit');return m;
  }).catch(e=>{pendingManifest=null;throw e;});return pendingManifest;
}
// Nearest camera-distance fragment wins, with real alpha edge coverage, not slot order.
export function overFragments(fragments) {
  fragments.sort((a,b)=>b.z-a.z);
  let r=0,g=0,b=0,a=0;
  for(const f of fragments){const v=f.rgba,alpha=v[3]/255,aa=alpha+a*(1-alpha);if(!aa)continue;
    r=(v[0]*alpha+r*a*(1-alpha))/aa;g=(v[1]*alpha+g*a*(1-alpha))/aa;b=(v[2]*alpha+b*a*(1-alpha))/aa;a=aa;}
  return [Math.round(r),Math.round(g),Math.round(b),Math.round(a*255)];
}
export async function composeSkeleton(descriptor) {
  const start=performance.now(),m=await manifest(),sources={};let decoded=0,transfer=0;
  const read=async file=>{const r=await fetch(new URL(file,base));if(!r.ok)throw new Error(`Skeleton layer ${r.status}`);const blob=await r.blob();transfer+=blob.size;
    const bitmap=await createImageBitmap(blob,{premultiplyAlpha:'none',colorSpaceConversion:'none'});const c=canvas(bitmap.width,bitmap.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(bitmap,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height);decoded+=pixels.data.byteLength;bitmap.close();c.width=c.height=1;return pixels;};
  for(const key of descriptor.layers){const layer=m.layers[key];if(!layer)throw new Error(`Missing skeleton layer ${key}`);sources[key]={color:await read(layer.image),depth:await read(layer.depth),layer};}
  const decodeMs=performance.now()-start,out=canvas(...m.layout.size),target=out.getContext('2d'), weaponKey=descriptor.layers.find(k=>k==='sword'||k==='blunt'), weaponCanvas=weaponKey?canvas(...m.layout.size):null, weaponTarget=weaponCanvas?.getContext('2d'), weaponFrames={}, weaponRects=[];
  for(const name of m.frames){const trim=m.layout.frames[name].trim,rect=m.layout.frames[name].rect,pixels=target.createImageData(rect[2],rect[3]), mask=weaponTarget?.createImageData(rect[2],rect[3]);
    const active=descriptor.layers.filter(k=>sources[k].layer.frames[name]).map(k=>{const s=sources[k],f=s.layer.frames[name];return {...s,key:k,offset:f.offset,rect:s.layer.rects[f.index]};});
    for(let y=0;y<rect[3];y++)for(let x=0;x<rect[2];x++){
      const fragments=[];
      for(const s of active){const xx=x+trim[0]-s.offset[0],yy=y+trim[1]-s.offset[1];if(xx<0||yy<0||xx>=s.rect[2]||yy>=s.rect[3])continue;
        const p=((s.rect[1]+yy)*s.color.width+s.rect[0]+xx)*4;if(!s.color.data[p+3])continue;
        fragments.push({key:s.key,z:s.depth.data[p]+256*s.depth.data[p+1],rgba:s.color.data.subarray(p,p+4)});}
      pixels.data.set(overFragments(fragments),(y*rect[2]+x)*4);
      const nearest=fragments.at(-1);if(mask && nearest?.key===weaponKey)mask.data.set([255,255,255,nearest.rgba[3]],(y*rect[2]+x)*4);
    }
    target.putImageData(pixels,rect[0],rect[1]);
    if(mask){weaponTarget.putImageData(mask,rect[0],rect[1]);weaponFrames[name]={index:weaponRects.length,offset:trim.slice(0,2)};weaponRects.push(rect);}
  }
  target.getImageData(0,0,out.width,out.height);
  return {id:m.id,descriptor,manifest:m,canvas:out,weaponMask:weaponCanvas?{canvas:weaponCanvas,layer:{frames:weaponFrames,rects:weaponRects}}:null,metrics:{sourceRGBABytes:decoded,transferBytes:transfer,outputRGBABytes:out.width*out.height*4*(weaponCanvas?2:1),decodeMs,composeMs:performance.now()-start-decodeMs,totalMs:performance.now()-start,frames:m.frames.length,sourceImages:descriptor.layers.length*2,depthOcclusion:true}};
}

export async function composeDeathKnightPortrait(descriptor) {
  const url=new URL('../../assets/sprites/player-death-knight/',import.meta.url);
  const r=await fetch(new URL('atlas-0.webp.json',url));if(!r.ok)throw new Error('DeathKnight portrait metadata missing');const sheet=await r.json();
  const image=await fetch(new URL(sheet.meta.image,url));if(!image.ok)throw new Error('DeathKnight portrait image missing');const blob=await image.blob(),bitmap=await createImageBitmap(blob);
  const out=canvas(bitmap.width,bitmap.height);out.getContext('2d').drawImage(bitmap,0,0);bitmap.close();
  const frames=Object.keys(sheet.frames),layout={size:[out.width,out.height],frames:{}};
  for(const name of frames){const f=sheet.frames[name],a=f.frame,b=f.spriteSourceSize;layout.frames[name]={rect:[a.x,a.y,a.w,a.h],trim:[b.x,b.y,b.w,b.h]};}
  return {id:'player-death-knight',descriptor,canvas:out,manifest:{frames,animations:sheet.animations,layout,anchor:sheet.frames[frames[0]].anchor,fps:12},metrics:{sourceRGBABytes:out.width*out.height*4,outputRGBABytes:out.width*out.height*4,transferBytes:blob.size}};
}
