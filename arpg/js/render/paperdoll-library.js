// One selected kit/head/weapon only. Bitmaps live for one serial composition;
// output cache holds at most two atlases (old live sprite + new gear).
export class PaperdollLibrary {
  constructor({ compose, dispose }) {
    this.compose = compose; this.dispose = dispose;
    this.entries = new Map(); this.tail = Promise.resolve(); this.serial = 0;
    this.metrics = { compositions: 0, peakOutputs: 0, last: null };
  }
  async acquire(descriptor, signal) {
    const key = descriptor.key;
    let record = this.entries.get(key);
    if (!record) {
      record = { refs: 0, asset: null, promise: null, age: ++this.serial };
      this.entries.set(key, record);
      record.promise = this.tail.then(async () => {
        if (signal?.aborted && record.refs === 1) throw new Error('Paperdoll superseded');
        this.trim(1);
        if ([...this.entries.values()].filter(r => r.asset).length >= 2)
          throw new Error('Paperdoll live-output budget exceeded');
        record.asset = await this.compose(descriptor);
        this.metrics.compositions++;
        this.metrics.last = record.asset.metrics;
        this.metrics.peakOutputs = Math.max(this.metrics.peakOutputs,
          [...this.entries.values()].filter(r => r.asset).length);
        return record.asset;
      }).catch(error => { this.entries.delete(key); throw error; });
      this.tail = record.promise.catch(() => {});
    }
    // Reserve ownership before await; a later request cannot evict this result
    // in the promise handoff between compose and the caller attaching its sprite.
    record.refs++;
    try {
      const asset = await record.promise;
      if (signal?.aborted) throw new Error('Paperdoll superseded');
      let released = false;
      return { asset, release: () => {
        if (released) return; released = true; record.refs--; this.trim(1);
      } };
    } catch (error) { record.refs--; this.trim(1); throw error; }
  }
  trim(limit) {
    const loaded = [...this.entries].filter(([, r]) => r.asset).sort((a,b) => a[1].age-b[1].age);
    let count = loaded.length;
    for (const [key, record] of loaded) {
      if (count <= limit) break;
      if (record.refs) continue;
      this.entries.delete(key); this.dispose(record.asset); count--;
    }
  }
  status() {
    return { ...this.metrics, outputs: [...this.entries.values()].filter(r => r.asset).length,
      references: [...this.entries.values()].reduce((sum,r) => sum+r.refs,0),
      outputRGBABytes: [...this.entries.values()].reduce((sum,r) => sum+(r.asset?.metrics.outputRGBABytes || 0),0) };
  }
}

const baseUrl = new URL('../../assets/sprites/paperdoll/', import.meta.url);
const manifests = new Map();
async function manifestFor(kit) {
  if (!['blade','bow','focus'].includes(kit)) throw new Error('Unknown paperdoll kit');
  if (!manifests.has(kit)) manifests.set(kit, fetch(new URL(`${kit}/manifest.json`, baseUrl)).then(async response => {
    if (!response.ok) throw new Error(`Paperdoll manifest HTTP ${response.status}`);
    const manifest = await response.json();
    if (manifest.version !== 'b1' || manifest.kit !== kit || manifest.size !== 128
      || manifest.layout.size[0] > 2048 || manifest.layout.size[1] > 4096
      || Object.keys(manifest.animations).length !== 48) throw new Error('Invalid paperdoll manifest');
    for (const layer of Object.values(manifest.layers)) if (Array.isArray(layer.frames)) {
      layer.frames=Object.fromEntries(manifest.frames.map((name,index)=>{
        const f=layer.frames[index];return [name,f ? {index:f[0],offset:[f[1],f[2]]} : null];
      }));
    }
    return manifest;
  }).catch(error => { manifests.delete(kit); throw error; }));
  return manifests.get(kit);
}
const canvas = (width,height) => {
  const c = document.createElement('canvas'); c.width=width; c.height=height; return c;
};
function drawLayer(ctx, bitmap, layer, name, x, y) {
  const frame = layer.frames[name]; if (!frame) return;
  const [sx,sy,w,h] = layer.rects[frame.index];
  ctx.drawImage(bitmap,sx,sy,w,h,x+frame.offset[0],y+frame.offset[1],w,h);
}
async function compose(descriptor) {
  if (descriptor.id === 'player-death-knight') return (await import('./skeleton-equipment-compose.js')).composeDeathKnightPortrait(descriptor);
  if (descriptor.id === 'player-skeleton-equipment') return (await import('./skeleton-equipment-compose.js')).composeSkeleton(descriptor);
  const started = performance.now(), manifest = await manifestFor(descriptor.kit);
  const weaponKey = `weapon-${descriptor.weapon}-${descriptor.head}`;
  const keys = ['base', ...(descriptor.colours.some(Boolean) ? ['mask'] : []),
    ...(descriptor.head !== 'none' ? [`head-${descriptor.head}`] : []), weaponKey];
  const bitmaps = {}; let output, weaponCanvas, weaponMask, sourceRGBABytes = 0, stagingRGBABytes = 0;
  try {
    // Serial decoding also bounds transient fetch/blob ownership.
    for (const key of keys) {
      const layer = manifest.layers[key];
      if (!layer || layer.size[0] > 2048 || layer.size[1] > 4096) throw new Error('Invalid paperdoll layer');
      const response = await fetch(new URL(`${descriptor.kit}/${layer.image}`,baseUrl));
      if (!response.ok) throw new Error(`Paperdoll image HTTP ${response.status}`);
      bitmaps[key] = await createImageBitmap(await response.blob());
      sourceRGBABytes += bitmaps[key].width*bitmaps[key].height*4;
    }
    const decodedMs = performance.now()-started;
    if (descriptor.weaponColour) {
      const bitmap=bitmaps[weaponKey];weaponCanvas=canvas(bitmap.width,bitmap.height);
      const context=weaponCanvas.getContext('2d');context.drawImage(bitmap,0,0);
      context.globalCompositeOperation='multiply';context.fillStyle=`rgb(${descriptor.weaponColour.join(',')})`;
      context.fillRect(0,0,weaponCanvas.width,weaponCanvas.height);
      context.globalCompositeOperation='destination-in';context.drawImage(bitmap,0,0);
      stagingRGBABytes+=weaponCanvas.width*weaponCanvas.height*4;
    }
    // White weapon-only silhouette in the packed layer space. Enhancement glow is
    // drawn from this per frame, so it follows the drawn weapon (not a guessed offset).
    const weaponBitmap=bitmaps[weaponKey];weaponMask=canvas(weaponBitmap.width,weaponBitmap.height);
    const maskContext=weaponMask.getContext('2d');maskContext.drawImage(weaponBitmap,0,0);
    maskContext.globalCompositeOperation='source-in';maskContext.fillStyle='#fff';
    maskContext.fillRect(0,0,weaponMask.width,weaponMask.height);
    const frameCanvas = canvas(128,128), ctx = frameCanvas.getContext('2d',{willReadFrequently:true});
    ctx.imageSmoothingEnabled=false;
    let basePixels, maskPixels;
    const readPixels = key => {
      const b=bitmaps[key], c=canvas(b.width,b.height), context=c.getContext('2d',{willReadFrequently:true});
      context.drawImage(b,0,0); const data=context.getImageData(0,0,c.width,c.height);
      stagingRGBABytes += data.data.byteLength; c.width=c.height=1; return data;
    };
    if (bitmaps.mask) { basePixels=readPixels('base'); maskPixels=readPixels('mask'); }
    output=canvas(...manifest.layout.size); const target=output.getContext('2d');target.imageSmoothingEnabled=false;
    for (const name of manifest.frames) {
      ctx.clearRect(0,0,128,128);
      if (!maskPixels) drawLayer(ctx,bitmaps.base,manifest.layers.base,name,0,0);
      else {
        const b=manifest.layers.base.frames[name], m=manifest.layers.mask.frames[name];
        const [bx,by,bw,bh]=manifest.layers.base.rects[b.index];
        const mr=m && manifest.layers.mask.rects[m.index];
        const pixels=ctx.createImageData(bw,bh);
        for (let y=0;y<bh;y++) for(let x=0;x<bw;x++) {
          const dest=(y*bw+x)*4, src=((by+y)*basePixels.width+bx+x)*4;
          let colour;
          if (mr) {
            const mx=x+b.offset[0]-m.offset[0], my=y+b.offset[1]-m.offset[1];
            if(mx>=0&&my>=0&&mx<mr[2]&&my<mr[3]) {
              const p=((mr[1]+my)*maskPixels.width+mr[0]+mx)*4;
              const slot=maskPixels.data[p]>128 ? 0 : maskPixels.data[p+1]>128 ? 1 : maskPixels.data[p+2]>128 ? 2 : -1;
              colour=slot < 0 ? null : descriptor.colours[slot];
            }
          }
          const grey=basePixels.data[src]*.2126+basePixels.data[src+1]*.7152+basePixels.data[src+2]*.0722;
          for(let c=0;c<3;c++) pixels.data[dest+c]=colour ? Math.min(255,grey*colour[c]/190) : basePixels.data[src+c];
          pixels.data[dest+3]=basePixels.data[src+3];
        }
        ctx.putImageData(pixels,b.offset[0],b.offset[1]);
      }
      for (const key of keys.filter(k=>k!=='base'&&k!=='mask')) drawLayer(ctx,key===weaponKey && weaponCanvas ? weaponCanvas : bitmaps[key],manifest.layers[key],name,0,0);
      const {rect,trim}=manifest.layout.frames[name];
      target.drawImage(frameCanvas,...trim,...rect);
    }
    // Force raster completion; report readback-inclusive time, not just draw enqueue.
    target.getImageData(0,0,output.width,output.height);
    frameCanvas.width=frameCanvas.height=1;
    const totalMs=performance.now()-started;
    return { id:`paperdoll-${descriptor.kit}`, descriptor, manifest, canvas:output,
      weaponMask:{canvas:weaponMask,layer:manifest.layers[weaponKey]},
      metrics:{totalMs,decodeMs:decodedMs,composeMs:totalMs-decodedMs,sourceRGBABytes,
        stagingRGBABytes,readbackRGBABytes:output.width*output.height*4,
        outputRGBABytes:output.width*output.height*4+weaponMask.width*weaponMask.height*4,frames:manifest.frames.length,
        sourceImages:keys.length,phoneEvidence:false} };
  } catch(error) { if(output) output.width=output.height=1; if(weaponMask) weaponMask.width=weaponMask.height=1; throw error; }
  finally { if(weaponCanvas) weaponCanvas.width=weaponCanvas.height=1; Object.values(bitmaps).forEach(bitmap=>bitmap.close()); }
}
export const paperdolls = new PaperdollLibrary({compose,dispose:asset=>{
  asset.disposeTextures?.(); asset.canvas.width=asset.canvas.height=1;
  if (asset.weaponMask?.canvas) asset.weaponMask.canvas.width=asset.weaponMask.canvas.height=1;
}});
