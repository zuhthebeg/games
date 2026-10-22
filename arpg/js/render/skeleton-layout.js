// Pure per-selection sparse layout: independent source pages, never combination image atlases.
export function skeletonLayout(manifest, layers) {
  if (!Array.isArray(layers) || layers[0] !== 'base' || new Set(layers).size !== layers.length) throw new Error('Invalid skeleton layer selection');
  for (const key of layers) if (!manifest.layers[key]) throw new Error('Missing skeleton layer '+key);
  const bounds = {};
  for (const name of manifest.frames) {
    const boxes = layers.flatMap(key => {
      const layer=manifest.layers[key], f=layer.frames[name];
      if (!f) return [];
      const r=layer.rects[f.index];
      return [[f.offset[0],f.offset[1],f.offset[0]+r[2],f.offset[1]+r[3]]];
    });
    if (!boxes.length) throw new Error('Empty skeleton source frame '+name);
    bounds[name]=[Math.min(...boxes.map(b=>b[0])),Math.min(...boxes.map(b=>b[1])),Math.max(...boxes.map(b=>b[2])),Math.max(...boxes.map(b=>b[3]))];
  }
  let best;
  const ordered=manifest.frames.map(name=>({name,w:bounds[name][2]-bounds[name][0],h:bounds[name][3]-bounds[name][1]})).sort((a,b)=>b.h-a.h||b.w-a.w);
  for (const width of [512,640,768,896,1024,1280,1536,1792,2048]) {
    const shelves=[], rects={}; let height=0, valid=true;
    for (const {name,w,h} of ordered) {
      if (w>width) {valid=false;break;}
      let chosen=-1, slack=Infinity, horizontal=Infinity;
      for(let i=0;i<shelves.length;i++){const s=shelves[i],v=s.h-h,x=width-s.x-w;if(x>=0&&v>=0&&(v<slack||v===slack&&x<horizontal)){chosen=i;slack=v;horizontal=x;}}
      if(chosen<0){chosen=shelves.length;shelves.push({x:0,y:height,h});height+=h;}
      const s=shelves[chosen];rects[name]=[s.x,s.y,w,h];s.x+=w;
    }
    if(valid&&height<=4096&&(!best||width*height<best.area))best={area:width*height,size:[width,height],rects};
  }
  if(!best)throw new Error('Skeleton output exceeds page budget');
  return {size:best.size,frames:Object.fromEntries(manifest.frames.map(name=>[name,{rect:best.rects[name],trim:[bounds[name][0],bounds[name][1],best.rects[name][2],best.rects[name][3]]}]))};
}
