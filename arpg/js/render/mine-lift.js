import {Texture,Rectangle,Sprite} from '../../vendor/pixi-8.22.0.min.mjs';
import {LIFT,MineLiftState} from './mine-lift-state.js';
// Own decoded images directly: no Assets cache race on rapid exit/reentry.
export function createMineLift(layer) {
  const sprite=new Sprite();sprite.visible=false;sprite.eventMode='none';sprite.anchor.set(LIFT.anchorX,LIFT.anchorY);sprite.position.set(LIFT.x,LIFT.y);layer.addChild(sprite);
  const state=new MineLiftState(async()=>{
    const image=new Image();image.src=new URL('../../assets/sprites/scenery/mine-lift/lift.webp',import.meta.url).href;await image.decode();
    if(image.naturalWidth!==1536||image.naturalHeight!==768)throw Error('lift atlas dimensions');
    const base=Texture.from(image);const frames=Array.from({length:LIFT.count},(_,i)=>new Texture({source:base.source,frame:new Rectangle(i%8*192,Math.floor(i/8)*192,192,192)}));return {base,frames};
  },asset=>{for(const frame of asset.frames)frame.destroy();asset.base.destroy(true);},(asset,index)=>{sprite.visible=!!asset;if(asset)sprite.texture=asset.frames[index];});
  return {state,sprite,reset:stage=>state.reset(stage),update:(dt,reduced)=>state.update(dt,reduced)};
}
