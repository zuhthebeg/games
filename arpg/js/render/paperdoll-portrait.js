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
    }).catch(()=>{ if(node.isConnected) {node.dataset.paperdollFailed='true';node.style.backgroundImage=`url("${node.dataset.paperdollFallback}")`;} });
  }
}
