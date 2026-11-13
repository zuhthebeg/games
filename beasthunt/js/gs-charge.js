import * as THREE from 'three';
import { WPN_COL } from 'bh/models';
import { chargeVisualState } from 'bh/gs-phase';
export { chargeVisualState };
const clamp=x=>Math.max(0,Math.min(1,x));
// Two draws per charging hunter (one in lowfx), independent of particle count.
// Effects live in the scene, not in the model triangle budget.
export class GSChargeFX {
 constructor(scene,low=false,mobile=false,color=WPN_COL[0]){
  this.low=low;this.group=new THREE.Group();this.group.name='gs-charge-fx';scene.add(this.group);
  this.uniforms={ratio:{value:0},pulse:{value:0},phase:{value:0},tint:{value:new THREE.Color(color)}};
  const material=new THREE.ShaderMaterial({uniforms:this.uniforms,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,
   vertexShader:'varying vec2 q;void main(){q=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
   fragmentShader:'uniform float ratio,pulse,phase;uniform vec3 tint;varying vec2 q;void main(){float r=length(q);float a=mod(atan(q.y,q.x)+6.2831853,6.2831853)/6.2831853;float ring=(1.-smoothstep(.008,.021,abs(r-.69)))*mix(.16,1.,step(a,ratio));float inner=(1.-smoothstep(.004,.014,abs(r-(.5+.025*sin(phase*3.)))))*(.15+ratio*.35);float runes=step(.78,fract(a*12.))*step(.56,r)*step(r,.63)*(.25+ratio*.55);float wave=(1.-smoothstep(.012,.035,abs(r-(.70+(1.-pulse)*.25))))*pulse;float alpha=(ring+inner+runes+wave)*(.42+ratio*.5);if(alpha<.01)discard;gl_FragColor=vec4(tint*(1.+pulse*.7),alpha);}'});
  this.ring=new THREE.Mesh(new THREE.PlaneGeometry(4.3,4.3),material);this.ring.rotation.x=-Math.PI/2;this.ring.renderOrder=3;this.group.add(this.ring);
  this.count=low?0:mobile?24:48;
  if(this.count){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(new Float32Array(this.count*3),3));const colors=new Float32Array(this.count*3),c=new THREE.Color(color);for(let i=0;i<this.count;i++){const v=i<this.count*.67?c:new THREE.Color(0xaba18b);colors.set([v.r,v.g,v.b],i*3);}geo.setAttribute('color',new THREE.BufferAttribute(colors,3));
   this.particles=new THREE.Points(geo,new THREE.PointsMaterial({size:.065,vertexColors:true,transparent:true,opacity:.8,depthWrite:false,blending:THREE.AdditiveBlending}));this.particles.material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_particle_fragment>','#include <map_particle_fragment>\nvec2 sparkUV=gl_PointCoord*2.-1.;float sparkR=length(sparkUV);if(sparkR>1.)discard;diffuseColor.a*=pow(1.-sparkR,.65);');};this.particles.material.customProgramCacheKey=()=> 'gs-charge-soft-sparks';this.particles.frustumCulled=false;this.group.add(this.particles);
  }
  this.stage=-1;this.age=1;this.pulseCount=0;this.v=new THREE.Vector3();this.group.visible=false;
 }
 update(p,H,dt,clock){
  const state=chargeVisualState(p);this.group.visible=state.active&&H.root.visible;
  if(!state.active){this.stage=-1;this.age=1;return {pulse:false,...state};}
  const pulse=state.stage>this.stage&&state.stage>0;
  if(pulse){this.age=0;this.pulseCount++;}else this.age+=Math.max(0,dt);
  this.stage=state.stage;
  const strength=clamp(1-this.age/.32);
  this.uniforms.ratio.value=state.ratio;this.uniforms.pulse.value=strength;this.uniforms.phase.value=clock;
  this.ring.position.set(p.x||0,.055,p.z||0);
  if(this.particles){const pos=this.particles.geometry.attributes.position,blade=H.gs?.sword.getObjectByName('hunter-blade');H.root.updateWorldMatrix(true,true);
   for(let i=0;i<this.count;i++){const f=(clock*(.7+state.ratio*.65)+i*.61803398875)%1,a=i*2.399963+clock*.35;
    if(i<this.count*.67&&blade){this.v.set(Math.cos(a)*.055,Math.sin(a)*.055,.22+f*1.9);blade.localToWorld(this.v);}
    else {const r=(1-f)*(1.1+state.ratio*.8);this.v.set((p.x||0)+Math.cos(a)*r,.08+f*.65,(p.z||0)+Math.sin(a)*r);}
    pos.setXYZ(i,this.v.x,this.v.y,this.v.z);
   }pos.needsUpdate=true;this.particles.material.size=.045+state.ratio*.045;this.particles.material.opacity=.45+state.ratio*.4;
  }
  return {pulse,strength,...state};
 }
 dispose(){this.group.removeFromParent();this.group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
}
// Adapter installed by main.js; game.js/audio and simulation stay byte-identical.
export function attachGSChargePresentation(hunt){
 const low=/[?&]lowfx=1/.test(location.search),mobile=hunt.in.isTouch,reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const effects=new Map(),sync=hunt.syncHunter.bind(hunt),dispose=hunt.dispose.bind(hunt);
 const vignette=document.createElement('div');vignette.setAttribute('aria-hidden','true');vignette.className='gs-charge-vignette';vignette.style='position:absolute;inset:0;pointer-events:none;z-index:1;opacity:0;background:radial-gradient(ellipse,transparent 48%,rgba(10,14,22,.55) 100%)';document.getElementById('stage')?.append(vignette);
 hunt.gsChargeEffects=effects;
 hunt.syncHunter=function(p,H,dt,cache=this){
  sync(p,H,dt,cache);
  for(const [actor,fx] of effects)if(actor.root.parent!==hunt.scene){fx.dispose();effects.delete(actor);}
  if(p.weapon!=='gs')return;
  let fx=effects.get(H);if(!fx){fx=new GSChargeFX(hunt.scene,low,mobile,H.weaponColor??WPN_COL[(p.wTier||hunt.save.w.gs||1)-1]);effects.set(H,fx);}
  const state=fx.update(p,H,dt,hunt.clock);
  if(p.id===hunt.localId){
   if(state.pulse&&!low&&!reduced)hunt.fovPunch=Math.max(hunt.fovPunch||0,Math.min(1.8,.6+state.stage*.4));
   vignette.style.opacity=state.active&&!low?String((state.strength||0)*.65):'0';
  }
 };
 hunt.dispose=function(){for(const fx of effects.values())fx.dispose();effects.clear();vignette.remove();dispose();};
}
