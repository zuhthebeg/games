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
    this.system={worldSpace:true};this.emitters=new Map();this.lastTick=-1;this.eventTick=-1;this.events=new Set();
  }
  reset(){for(const s of this.slots){s.live=false;s.node.visible=false;}this.emitters.clear();this.lastTick=-1;this.eventTick=-1;this.events.clear();}
  event(event,world){
    if(this.eventTick!==world.tick){this.events.clear();this.eventTick=world.tick;}
    const key=[event.type,event.ability,event.src,event.dst,event.id,event.x,event.y].join(':');
    if(this.events.has(key)||this.events.size>=128)return;this.events.add(key);
    if(event.ability==='blood_spear'&&event.type==='hit')this.burst('blood',event.x,event.y,20,20);
    if(event.ability==='cursed_hands'&&event.type==='handsBurst'){this.burst('smoke',event.x,event.y,event.radius,16);this.burst('bone',event.x,event.y,event.radius,8);}
  }
  burst(kind,x,y,radius=20,count=16,owner=null) {
    if(!Number.isFinite(x)||!Number.isFinite(y))return 0;
    let n=0;
    for(const s of this.slots){if(n>=Math.min(count,QUARKS_CAPS.perBurst))break;if(s.live)continue;
      const i=n++,a=i*2.399963,p=s.p;p.reset();p.age=0;p.life=kind==='mist'? .85:kind==='smoke'?.7:.5;
      const fog=kind==='mist'||kind==='smoke',bone=kind==='bone';
      const r=fog?radius*Math.sqrt((i+.5)/Math.max(1,count))*.65:bone?radius*.35:0;
      p.position.set(x+Math.cos(a)*r,y+Math.sin(a)*r,0);
      p.velocity.set(Math.cos(a)*(fog?8:45+i*3),fog?-8-i%4:Math.sin(a)*60-30,0);
      const size=fog?10+i%4*2:bone?3.5:2.5+i%3;
      p.startSize.set(size,size,1);p.size.copy(p.startSize);p.rotation=a;
      s.kind=kind;s.live=true;s.owner=owner;s.originX=x;s.originY=y;s.radius=radius;
      s.size=fog?this.grow:this.shrink;s.force=fog?this.lift:this.gravity;
      s.size.initialize(p);s.force.initialize(p,this.system);this.spin.initialize(p);
      const g=s.node;g.clear();
      if(fog){g.circle(0,0,1).fill({color:0xffffff,alpha:.035}).circle(-.22,.07,.8).fill({color:0xffffff,alpha:.055}).circle(.18,-.12,.6).fill({color:0xffffff,alpha:.08}).circle(-.1,0,.4).fill({color:0xffffff,alpha:.09});}
      else if(bone){g.rect(-1,-.3,2,.6).circle(-.85,-.2,.4).circle(.85,.2,.4).fill(0xffffff);}
      else g.ellipse(0,0,.6,1).fill(0xffffff);
      g.tint=kind==='mist'?(i%2?0x7ba953:0xc1df81):kind==='smoke'?(i%2?0x77518e:0x405339):bone?0xd5d0af:i%2?0xe13b61:0x7d1936;
      g.visible=true;g.position.set(p.position.x,p.position.y);g.scale.set(size);g.alpha=fog?.65:.9;
    }return n;
  }
  pulse(key,kind,x,y,radius,tick,count,owner=null){
    let e=this.emitters.get(key);if(!e){if(this.emitters.size>=QUARKS_CAPS.emitters)return;e={tick:-Infinity,seen:true};this.emitters.set(key,e);}
    e.seen=true;if(tick-e.tick<5)return;e.tick=tick;this.burst(kind,x,y,radius,count,owner);
  }
  update(world,dt,enabled=true){
    if(!enabled||world.round?.state&&world.round.state!=='running'||world.tick<this.lastTick){this.reset();return;}
    this.lastTick=world.tick;for(const e of this.emitters.values())e.seen=false;
    for(const z of world.zones||[])if(z.abilityId==='poison_field'&&world.tick>=z.activeTick&&world.tick<z.endTick)this.pulse('z'+z.id,'mist',z.x,z.y,z.radius||100,world.tick,5,'z'+z.id);
    for(const p of world.projectiles||[])if(p.abilityId==='blood_spear')this.pulse('p'+p.id,'blood',p.x,p.y,5,world.tick,3);
    for(const [k,e]of this.emitters)if(!e.seen){this.emitters.delete(k);for(const s of this.slots)if(s.owner===k){s.live=false;s.node.visible=false;}}
    // Tab-resume drops stale particles, never runs an accumulated emission backlog.
    if(!Number.isFinite(dt)||dt>.25){for(const s of this.slots){s.live=false;s.node.visible=false;}return;}
    dt=Math.max(0,Math.min(QUARKS_CAPS.dt,dt));
    for(const s of this.slots){if(!s.live)continue;const p=s.p;p.age+=dt;
      if(p.died){s.live=false;s.node.visible=false;continue;}
      s.force.update(p,dt);s.size.update(p);this.spin.update(p,dt);p.position.addScaledVector(p.velocity,dt);
      if(s.kind==='mist'){const dx=p.position.x-s.originX,dy=p.position.y-s.originY,d=Math.hypot(dx,dy),limit=Math.max(0,s.radius-p.size.x);if(d>limit&&d>0)p.position.set(s.originX+dx/d*limit,s.originY+dy/d*limit,0);}
      s.node.position.set(p.position.x,p.position.y);s.node.rotation=p.rotation;
      s.node.scale.set(p.size.x,p.size.y*(s.kind==='blood'?1.6:1));s.node.alpha=(1-p.age/p.life)*(s.kind==='mist'||s.kind==='smoke'?.65:.9);
    }
  }
}
