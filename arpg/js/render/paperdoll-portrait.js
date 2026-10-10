import { paperdolls } from './paperdoll-library.js';

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
      const {asset}=lease, canvas=node.querySelector('canvas'), ctx=canvas.getContext('2d');
      const {rect,trim}=asset.manifest.layout.frames.idle_SW_000;
      ctx.imageSmoothingEnabled=false;ctx.clearRect(0,0,128,128);ctx.drawImage(asset.canvas,...rect,...trim);
      canvas.hidden=false;node.style.backgroundImage='none';node.dataset.paperdollReady=descriptor.key;
    }).catch(()=>{ if(node.isConnected) node.dataset.paperdollFailed='true'; });
  }
}
