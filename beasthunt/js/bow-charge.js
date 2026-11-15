import { WTYPES } from 'bh/data';
import { GSChargeFX } from './gs-charge.js?v=20261114r11';
export function bowChargeVisualState(p){
 const active=p.weapon==='bow'&&p.state==='charge';
 const ratio=active?Math.max(0,Math.min(1,(p.t||0)/WTYPES.bow.heavy.charge)):0;
 return {active,ratio,stage:active?Math.min(3,Math.floor(ratio*3+1e-5)):-1};
}
export class BowChargeFX extends GSChargeFX {
 constructor(scene,low=false,mobile=false,color=0xe8c86c,reduced=false){super(scene,low,mobile,color);this.reduced=reduced;this.group.name='bow-charge-fx';this.ring.scale.setScalar(.7);}
 clearArrow(){if(this.arrowMaterial){this.arrowMaterial.emissive.copy(this.arrowOriginal.color);this.arrowMaterial.emissiveIntensity=this.arrowOriginal.intensity;this.arrowMaterial=null;}}
 update(p,H,dt,clock){
  const state=bowChargeVisualState(p);
  // Reuse the GS geometry, not its timer. 1.2s is the actual BOW contract.
  const out=super.update({...p,weapon:state.active?'gs':'bow',t:state.ratio*1.5},H,dt,this.reduced?0:clock);
  const material=H.bow?.nockArrow?.material;
  if(this.arrowMaterial!==material)this.clearArrow();
  if(state.active&&material){
   if(!this.arrowMaterial){this.arrowMaterial=material;this.arrowOriginal={color:material.emissive.clone(),intensity:material.emissiveIntensity};}
   material.emissive.copy(this.uniforms.tint.value);material.emissiveIntensity=.25+state.ratio*.85+(this.reduced||this.low?0:(out.strength||0)*.35);
  }else this.clearArrow();
  if(this.reduced){this.uniforms.pulse.value=0;if(this.particles)this.particles.visible=false;}
  return {...out,...state};
 }
 dispose(){this.clearArrow();super.dispose();}
}
export function attachBowChargePresentation(hunt){
 const low=/[?&]lowfx=1/.test(location.search),reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const effects=new Map(),sync=hunt.syncHunter.bind(hunt),dispose=hunt.dispose.bind(hunt);
 hunt.bowChargeEffects=effects;
 hunt.syncHunter=function(p,H,dt,cache=this){
  sync(p,H,dt,cache);
  for(const [actor,fx]of effects)if(actor.root.parent!==hunt.scene){fx.dispose();effects.delete(actor);}
  if(p.weapon!=='bow'){const fx=effects.get(H);if(fx){fx.dispose();effects.delete(H);}return;}
  let fx=effects.get(H);if(!fx){fx=new BowChargeFX(hunt.scene,low,hunt.in.isTouch,H.weaponColor,reduced);effects.set(H,fx);}
  fx.update(p,H,dt,hunt.clock);
 };
 hunt.dispose=function(){for(const fx of effects.values())fx.dispose();effects.clear();dispose();};
}
