import { SKILL_SIGNATURES } from './skill-signatures.js';
// Presentation adapter: actual quarks.core particles/behaviors, rendered by the existing Pixi context.
import { SpriteParticle, SizeOverLife, PiecewiseBezier, Bezier, ForceOverLife, ConstantValue, RotationOverLife } from '../../vendor/quarks-core-0.17.1.mjs';
export const QUARKS_CAPS = Object.freeze({particles:144, emitters:16, perBurst:24, dt:.05});
const curve=(a,b,c,d)=>new SizeOverLife(new PiecewiseBezier([[new Bezier(a,b,c,d),0]]));
export class QuarksVfx {
  constructor(Graphics, layer) {
    this.slots=Array.from({length:QUARKS_CAPS.particles},()=>{
      const node=new Graphics();node.visible=false;layer.addChild(node);
      return {node,p:new SpriteParticle(),live:false,kind:''};
    });
    this.grow=curve(.6,1.1,1.8,2.3);this.shrink=curve(1,1,.6,.1);
    this.gravity=new ForceOverLife(new ConstantValue(0),new ConstantValue(110),new ConstantValue(0));
    this.lift=new ForceOverLife(new ConstantValue(5),new ConstantValue(-12),new ConstantValue(0));
    this.spin=new RotationOverLife(new ConstantValue(2.8));
    this.casts=new Map();this.system={worldSpace:true};this.emitters=new Map();this.lastTick=-1;this.eventTick=-1;this.events=new Set();
  }
  reset(){for(const s of this.slots){s.live=false;s.node.visible=false;}this.emitters.clear();this.casts.clear();this.lastTick=-1;this.eventTick=-1;this.events.clear();}
  event(event,world){
    if(this.eventTick!==world.tick){this.events.clear();this.eventTick=world.tick;}
    const key=[event.type,event.ability,event.src,event.dst,event.id,event.x,event.y].join(':');
    if(this.events.has(key)||this.events.size>=128)return;this.events.add(key);
    const signature=SKILL_SIGNATURES[event.ability];
    if(signature && !['blood_spear','cursed_hands'].includes(event.ability) && ['hit','explode','heal','healCast'].includes(event.type))this.burst(signature.motif,event.x,event.y,Math.min(90,event.radius||20),8,null,signature);
    if(event.ability==='blood_spear'&&event.type==='hit')this.burst('blood',event.x,event.y,20,20);
    if(event.ability==='cursed_hands'&&event.type==='handsBurst'){this.burst('smoke',event.x,event.y,event.radius,16);this.burst('bone',event.x,event.y,event.radius,8);}
  }
  burst(kind,x,y,radius=20,count=16,owner=null,signature=null,facing=0) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return 0;
    let n=0,sourceCount=0,recurringCount=0;
    if(owner)for(const s of this.slots)if(s.live&&s.owner){recurringCount++;if(s.owner===owner)sourceCount++;}
    const allowed=Math.min(count,QUARKS_CAPS.perBurst,owner?Math.max(0,8-sourceCount):24,owner?Math.max(0,96-recurringCount):24);
    for(const s of this.slots){if(n>=allowed)break;if(s.live)continue;
      const i=n++,a=i*2.399963,p=s.p;p.reset();p.age=0;p.life=kind==='mist'? .85:kind==='smoke'?.8:signature?.65:.5;
      const fog=kind==='mist'||kind==='smoke',bone=kind==='bone';
      const r=fog?radius*Math.sqrt((i+.5)/Math.max(1,count))*.65:bone?radius*.35:0;
      p.position.set(x+Math.cos(a)*r,y+Math.sin(a)*r,0);
      p.velocity.set(Math.cos(a)*(fog?8:45+i*3),fog?-8-i%4:Math.sin(a)*60-30,0);
      const size=fog?14+i%4*3:signature?7+i%3*2:bone?4.5:3.5+i%3;
      p.startSize.set(size,size,1);p.size.copy(p.startSize);p.rotation=a;
      s.signature=signature;
      if(signature){const pattern=signature.pattern,spread=pattern==='fan'?(i%5-2)*.2:pattern==='triple'?(i%3-1)*.1:0,angle=facing+spread;
        if(['jet','fan','triple','back'].includes(pattern)){const dir=pattern==='back'?-1:1;p.position.set(x+Math.cos(angle)*i*3,y+Math.sin(angle)*i*3-8,0);p.velocity.set(Math.cos(angle)*dir*(45+i*5),Math.sin(angle)*dir*45-12,0);p.rotation=angle;}
        if(pattern==='orbit'){p.position.set(x+Math.cos(a)*radius*.65,y+Math.sin(a)*radius*.65,0);p.velocity.set(-Math.sin(a)*35,Math.cos(a)*35-12,0);p.rotation=a+Math.PI/2;}
        if(pattern==='rise'&&kind!=='mist'){p.position.set(x+Math.cos(a)*radius*.5,y+Math.sin(a)*radius*.25-6,0);p.velocity.set(Math.cos(a)*10,-30-i*3,0);}
        if(pattern==='down'){p.position.set(x+Math.cos(a)*radius*.45,y-50-i*3,0);p.velocity.set(10,90+i*3,0);p.rotation=1.3;}
      }
      s.kind=kind;s.live=true;s.owner=owner;s.originX=x;s.originY=y;s.radius=radius;
      s.size=fog?this.grow:this.shrink;s.force=fog||["heal","holy","rune","flame"].includes(kind)?this.lift:this.gravity;
      s.size.initialize(p);s.force.initialize(p,this.system);this.spin.initialize(p);
      const g=s.node;g.clear();
      if(fog){g.circle(0,0,1).fill({color:0xffffff,alpha:.07}).circle(-.22,.07,.8).fill({color:0xffffff,alpha:.1}).circle(.18,-.12,.6).fill({color:0xffffff,alpha:.12}).circle(-.1,0,.4).fill({color:0xffffff,alpha:.16});}
      else if(bone){g.rect(-1,-.3,2,.6).circle(-.85,-.2,.4).circle(.85,.2,.4).fill(0xffffff);}
      else if(kind==='blade')g.arc(0,0,1,-.9,.9).stroke({width:.22,color:0xffffff});
      else if(kind==='heal')g.rect(-.22,-1,.44,2).rect(-1,-.22,2,.44).fill(0xffffff);
      else if(kind==='facet')g.poly([0,-1,.8,-.5,.8,.5,0,1,-.8,.5,-.8,-.5]).stroke({width:.18,color:0xffffff});
      else if(kind==='rune')g.moveTo(-.8,-1).lineTo(.6,-.4).lineTo(-.4,.3).lineTo(.8,1).stroke({width:.2,color:0xffffff});
      else if(kind==='crystal')g.poly([0,-1,.4,-.2,1,0,.4,.2,0,1,-.4,.2,-1,0,-.4,-.2]).fill(0xffffff);
      else if(kind==='feather'||kind==='holy')g.poly([-1,0,.7,-.35,1,0,.7,.35]).fill(0xffffff).moveTo(-.8,0).lineTo(.8,0).stroke({width:.12,color:0xffffff});
      else if(kind==='needle')g.poly([-2,0,1,-.18,2,0,1,.18]).fill(0xffffff);
      else if(kind==='debris')g.poly([-1,-.4,.5,-.8,1,.4,-.3,1]).fill(0xffffff);
      else if(kind==='flame')g.poly([-.5,.6,0,-1,.35,-.2,.7,.8]).fill(0xffffff);
      else g.ellipse(0,0,.6,1).fill(0xffffff);
      g.tint=kind==='mist'?(i%2?0x7ba953:0xc1df81):kind==='smoke'?(i%2?0x77518e:0x405339):bone?0xd5d0af:i%2?0xe13b61:0x7d1936;
      if(signature)g.tint=i%3?signature.color:signature.accent;
      g.visible=true;g.position.set(p.position.x,p.position.y);g.scale.set(size);g.alpha=fog?.8:1;
    }return n;
  }
  pulse(key,kind,x,y,radius,tick,count,owner=null,signature=null,facing=0){
    let e=this.emitters.get(key);if(!e){if(this.emitters.size>=QUARKS_CAPS.emitters)return;e={tick:-Infinity,seen:true};this.emitters.set(key,e);}
    e.seen=true;if(tick-e.tick<5)return;e.tick=tick;this.burst(kind,x,y,radius,count,owner,signature,facing);
  }
  update(world,dt,enabled=true){
    if(!enabled||world.round?.state&&world.round.state!=='running'||world.tick<this.lastTick){this.reset();return;}
    this.lastTick=world.tick;for(const e of this.emitters.values())e.seen=false;
    this.seenCasts ||= new Set();const seen=this.seenCasts;seen.clear();
    for(const e of world.entities||[]){const act=e.act,signature=SKILL_SIGNATURES[act?.id];if(e.kind!=='player'||e.dead||!signature||!Number.isFinite(act.elapsed))continue;
      const key=e.id+':'+act.id+':'+(world.tick-act.elapsed);seen.add(key);
      if(!this.casts.has(key)&&!['windup','lock'].includes(act.phase)){if(this.casts.size<32){this.casts.set(key,true);const def=act.def||{},r=Math.min(100,act.growth?.radius||def.shape?.radius||def.zone?.radius||32);const point=act.zonePoint||act.groundPoint||e;this.burst(signature.motif,point.x,point.y,r,12,null,signature,act.facing||0);}}
    }
    for(const key of this.casts.keys())if(!seen.has(key))this.casts.delete(key);
    for(const z of world.zones||[]){const signature=SKILL_SIGNATURES[z.abilityId];if(!signature||world.tick<z.activeTick||world.tick>=z.endTick)continue;
      const offset=z.abilityId==='firewall'?Math.sin(world.tick*.7)*90:0,facing=z.facing||0;
      this.pulse('z'+z.id,signature.motif,z.x-Math.sin(facing)*offset,z.y+Math.cos(facing)*offset,z.radius||30,world.tick,3,'z'+z.id,signature,facing);
    }
    for(const p of world.projectiles||[]){const signature=SKILL_SIGNATURES[p.abilityId];if(signature)this.pulse('p'+p.id,signature.motif,p.x,p.y,5,world.tick,2,'p'+p.id,signature,Math.atan2(p.vy||0,p.vx||1));}
    for(const [k,e]of this.emitters)if(!e.seen){this.emitters.delete(k);for(const s of this.slots)if(s.owner===k){s.live=false;s.node.visible=false;}}
    // Tab-resume drops stale particles, never runs an accumulated emission backlog.
    if(!Number.isFinite(dt)||dt>.25){for(const s of this.slots){s.live=false;s.node.visible=false;}return;}
    dt=Math.max(0,Math.min(QUARKS_CAPS.dt,dt));
    for(const s of this.slots){if(!s.live)continue;const p=s.p;p.age+=dt;
      if(p.died){s.live=false;s.node.visible=false;continue;}
      s.force.update(p,dt);s.size.update(p);this.spin.update(p,dt);p.position.addScaledVector(p.velocity,dt);
      if(s.kind==='mist'){const dx=p.position.x-s.originX,dy=p.position.y-s.originY,d=Math.hypot(dx,dy),limit=Math.max(0,s.radius-p.size.x);if(d>limit&&d>0)p.position.set(s.originX+dx/d*limit,s.originY+dy/d*limit,0);}
      s.node.position.set(p.position.x,p.position.y);s.node.rotation=p.rotation;
      s.node.scale.set(p.size.x,p.size.y*(s.kind==='blood'?1.6:1));s.node.alpha=(1-p.age/p.life)*(s.kind==='mist'||s.kind==='smoke'?.8:1);
    }
  }
}
