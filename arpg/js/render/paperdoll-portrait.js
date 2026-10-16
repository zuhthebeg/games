import { paperdolls } from './paperdoll-library.js';

export const PORTRAIT_DIRECTIONS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
export const PORTRAIT_FRAMES = [[0,0], [1408,0], [768,128], [128,256], [1536,256], [896,384], [256,512], [1664,512]];

export function setPortraitDirection(node, direction) {
  const index = PORTRAIT_DIRECTIONS.indexOf(direction);
  if (!node || index < 0) return;
  node.dataset.direction = direction;
  const [x,y] = PORTRAIT_FRAMES[index];
  node.style.backgroundPosition = `-${x}px -${y}px`;
  const asset = portraits.get(node)?.lease?.asset;
  if (!asset) return;
  const canvas = node.querySelector('canvas'), ctx = canvas.getContext('2d');
  const {rect,trim} = asset.manifest.layout.frames[`idle_${direction}_000`];
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0,0,128,128);
  ctx.drawImage(asset.canvas,...rect,...trim);
  drawPortraitGlow(node, asset, `idle_${direction}_000`);
}

const HALO = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
// Enhancement glow traced from the same frame's weapon silhouette, so it sits on the weapon.
function drawPortraitGlow(node, asset, name) {
  const glow = node.querySelector('.portrait-weapon-glow'), mask = asset.weaponMask;
  const target = glow?.querySelector('canvas');
  if (!glow || !target || !mask?.canvas) return;
  const frame = mask.layer.frames[name], g = target.getContext('2d');
  g.clearRect(0,0,128,128);
  delete glow.dataset.pending; glow.dataset.anchored = 'true';
  glow.hidden = !frame;
  if (!frame) return;
  const [x,y,w,h] = mask.layer.rects[frame.index], [ox,oy] = frame.offset;
  g.save(); g.imageSmoothingEnabled = false;
  for (const [dx,dy] of HALO) g.drawImage(mask.canvas,x,y,w,h,ox+dx,oy+dy,w,h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = getComputedStyle(glow).getPropertyValue('--enhance-color').trim() || '#cde8ee';
  g.fillRect(0,0,128,128);
  // Keep the weapon's own pixels readable: only a light tint over them, full halo around.
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = .6;
  g.drawImage(mask.canvas,x,y,w,h,ox,oy,w,h);
  g.restore();
  glow.style.setProperty('--cx', `${(ox + w/2) / 1.28}%`);
  glow.style.setProperty('--cy', `${(oy + h/2) / 1.28}%`);
}

let observer;
const portraits = new Map();
// Only the portrait seam changes: keep P2's original div, dimensions and fallback.
export function installPaperdollPortraits() {
  if (!globalThis.document) return;
  if (!observer) {
    observer = new MutationObserver(scan);
    observer.observe(document.documentElement,{childList:true,subtree:true});
  }
  queueMicrotask(scan);
}
function scan() {
  for (const [node, record] of portraits) if (!node.isConnected) {
    record.controller.abort(); record.lease?.release(); portraits.delete(node);
  }
  for (const node of document.querySelectorAll('[data-paperdoll]')) {
    if (portraits.has(node)) continue;
    const record={controller:new AbortController(),lease:null}; portraits.set(node,record);
    const descriptor=JSON.parse(node.dataset.paperdoll);
    paperdolls.acquire(descriptor,record.controller.signal).then(lease=>{
      if (!node.isConnected || record.controller.signal.aborted) {lease.release();return;}
      record.lease=lease;
      const canvas=node.querySelector('canvas');
      setPortraitDirection(node, node.dataset.direction || 'SW');
      canvas.hidden=false;node.style.backgroundImage='none';node.dataset.paperdollReady=descriptor.key;
    }).catch(()=>{ if(node.isConnected) {node.dataset.paperdollFailed='true';node.style.backgroundImage=descriptor.kit === 'skeleton' ? 'none' : `url("${node.dataset.paperdollFallback}")`;
      if (descriptor.kit === 'skeleton') node.setAttribute('aria-label','캐릭터 외형 로드 실패');
      const glow=node.querySelector('.portrait-weapon-glow');if(glow) delete glow.dataset.pending;} });
  }
}
