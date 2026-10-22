import {ITEMS,equippedItem,permitsShield} from '../meta/items.js';
import {DEATH_KNIGHT_SOCKETS} from './death-knight-sockets.js';
import {SHIELD_HAND_ANCHORS} from './shield-hand-anchors.js';
import {physicalShieldPose,drawPhysicalShield} from './physical-shield.js';

// Portraits use the original 128px frame, before combat's entity scale/translation.
export function portraitShieldDescriptor(save, portrait, composed=true) {
  if(composed && portrait.appearance?.id==='player-skeleton-equipment')return null; // Shield is already in the exact-source composed portrait.
  const weapon=ITEMS[equippedItem(save,'weapon')?.id],shield=ITEMS[equippedItem(save,'offhand')?.id];
  if(!permitsShield(weapon)||shield?.form!=='shield')return null;
  const skeleton=save.lineage==='skeleton_knight';
  return {weapon:weapon.family,weaponForm:weapon.form,handedness:weapon.handedness,
    shieldModel:shield.shieldType?{v:1,type:shield.shieldType}:null,
    source:skeleton?(portrait.appearance.id==='player-skeleton-equipment'?'skeleton':'death-knight'):
      `${composed?'':'atlas-'}${weapon.family==='focus'?'focus':'blade'}`,
    anchor:portrait.anchor||{x:.5,y:.6202935874462128}};
}

// Small SVG backend for the same Graphics commands as the combat shield, not an item icon.
function svgGraphics() {
  let path='',parts=[],painted=false;
  const color=n=>'#'+n.toString(16).padStart(6,'0');
  const g={clear(){path='';parts=[];return g;},
    moveTo(x,y){if(painted){path='';painted=false;}path+=`M${x} ${y}`;return g;},lineTo(x,y){path+=`L${x} ${y}`;return g;},
    poly(points){path=points.reduce((s,v,i)=>s+(i%2?' '+v:(i?'L':'M')+v),'')+'Z';return g;},
    ellipse(x,y,rx,ry){path=`M${x-rx} ${y}a${rx} ${ry} 0 1 0 ${rx*2} 0a${rx} ${ry} 0 1 0 ${-rx*2} 0`;return g;},
    circle(x,y,r){return g.ellipse(x,y,r,r);},
    roundRect(x,y,w,h,r){path=`M${x+r} ${y}h${w-2*r}q${r} 0 ${r} ${r}v${h-2*r}q0 ${r} ${-r} ${r}h${-w+2*r}q${-r} 0 ${-r} ${-r}v${-h+2*r}q0 ${-r} ${r} ${-r}Z`;return g;},
    fill(c){painted=true;parts.push(`<path d="${path}" fill="${color(c)}"/>`);return g;},
    stroke({color:c,width}){parts.push(`<path d="${path}" fill="none" stroke="${color(c)}" stroke-width="${width}"/>`);path='';return g;},
    html(){return parts.join('');}};
  return g;
}
export function portraitShieldHtml(descriptor,direction='SW') {
  if(!descriptor)return '';
  const dirs=['E','SE','S','SW','W','NW','N','NE'],index=dirs.indexOf(direction);
  if(index<0)return '';
  const [x,y]=(descriptor.source==='death-knight'?DEATH_KNIGHT_SOCKETS:SHIELD_HAND_ANCHORS[descriptor.source])[`idle_${direction}`][0];
  const facing=index*Math.PI/4,behind=['E','NE','N','NW'].includes(direction);
  const p=physicalShieldPose({kind:'player',offhand:'shield',...descriptor,facing},0,{x,y,facing,behind,scale:1});
  if(!p)return '';
  const g=svgGraphics();drawPhysicalShield(g,p);
  return `<svg class="portrait-shield" viewBox="0 0 128 128" data-shield-type="${descriptor.shieldModel?.type||'round_shield'}" data-shape="${p.shape}" data-behind="${behind}" data-hand-x="${x}" data-hand-y="${y}" aria-hidden="true"><g transform="translate(${descriptor.anchor.x*128+p.x} ${descriptor.anchor.y*128+p.y})">${g.html()}</g></svg>`;
}
export function rotatePortraitShield(node,direction) {
  if(!node.dataset.portraitShield)return;
  const html=portraitShieldHtml(JSON.parse(node.dataset.portraitShield),direction);
  const previous=node.querySelector('.portrait-shield');
  if(previous)previous.outerHTML=html;
}
