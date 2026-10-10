import {Container,Graphics,Text} from '../../vendor/pixi-8.22.0.min.mjs';
import {getTelegraphs} from '../sim/world.js';
import {shapePath,pattern} from './shapes.js';
import {VisualProvider} from './visual-provider.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export class ArenaRenderer {
  constructor(app,provider=new VisualProvider()) {
    this.app=app;this.provider=provider;this.root=new Container();this.root.eventMode='none';
    this.layers={};for(const name of ['ground','telegraphs','shadows','entities','projectiles','fx','numbers']){const c=new Container();this.layers[name]=c;this.root.addChild(c);}
    this.layers.entities.sortableChildren=true;app.stage.addChild(this.root);
    this.warning=new Graphics();app.stage.addChild(this.warning);
    this.views=new Map();this.projectiles=new Map();this.projectilePool=new Map();this.telegraphs=[];this.tgs=[];this.numbers=[];this.effects=[];
    this.camera={x:308,y:430};this.scale=1;this.time=0;this.stopLeft=0;this.trauma=0;this.reduced=false;
    this.ground=new Graphics();this.layers.ground.addChild(this.ground);
    for(let i=0;i<32;i++) {const node=new Text({text:'',style:{fontFamily:'sans-serif',fontSize:18,fontWeight:'bold',fill:0xffffff,stroke:{color:0x151814,width:3}}});node.anchor.set(.5);node.visible=false;this.layers.numbers.addChild(node);this.numbers.push({node,left:0,x:0,y:0});}
    for(let i=0;i<40;i++){const node=new Graphics();node.visible=false;this.layers.fx.addChild(node);this.effects.push({node,left:0,total:0,kind:'ring'});}
  }
  reset(world,reduced=false){
    for(const v of this.views.values()){v.visual.destroy();v.shadow.destroy();v.portal.destroy();}this.views.clear();
    for(const g of this.projectiles.values())g.destroy();this.projectiles.clear();
    for(const pool of this.projectilePool.values())for(const g of pool)g.destroy();this.projectilePool.clear();this.telegraphs=getTelegraphs(world);
    for(const tg of this.tgs)tg.visible=false;
    for(const p of this.numbers){p.left=0;p.node.visible=false;}for(const f of this.effects){f.left=0;f.node.visible=false;}
    this.reduced=reduced;this.stopLeft=this.trauma=0;this.camera.x=world.entities[0].x;this.camera.y=world.entities[0].y;
    const {w,h}=world.arena,g=this.ground;g.clear().rect(0,0,w,h).fill(0x202923);
    for(let y=0;y<h;y+=64)for(let x=0;x<w;x+=64)g.rect(x+1,y+1,62,62).fill((x/64+y/64)%2?0x222b25:0x1e2722);
    for(let i=0;i<100;i++){const x=(i*431)%w,y=(i*167)%h;g.moveTo(x,y).lineTo(x+8,y+3).stroke({color:0x394034,width:1});}
    g.rect(5,5,w-10,h-10).stroke({color:0x716447,width:10}).rect(18,18,w-36,h-36).stroke({color:0x3e493b,width:2});
    for(let x=42;x<w;x+=120)g.circle(x,26,3).circle(x,h-26,3).fill(0xae8545);
    this.snapshot(world);
  }
  ensure(e){
    let v=this.views.get(e.id);if(v)return v;
    const visual=this.provider.createVisual(e),shadow=new Graphics().ellipse(0,0,e.r*1.15,e.r*.48).fill({color:0x030807,alpha:.5});
    const portal=new Graphics().ellipse(0,0,e.r+12,(e.r+12)*.65).stroke({color:0x99dac0,width:2}).ellipse(0,0,e.r+5,(e.r+5)*.65).stroke({color:0x627fba,width:1});
    this.layers.entities.addChild(visual.container);this.layers.shadows.addChild(shadow);this.layers.fx.addChild(portal);
    v={visual,shadow,portal,prevX:e.x,prevY:e.y,x:e.x,y:e.y,anim:{age:0,deadAge:0,hurt:0,reduced:this.reduced},lastAct:null};this.views.set(e.id,v);return v;
  }
  snapshot(world){
    for(const e of world.entities){const v=this.ensure(e);v.prevX=e.x;v.prevY=e.y;}
    for(const p of world.projectiles){const g=this.projectiles.get(p.id);if(g){g.prevX=p.x;g.prevY=p.y;}}
  }
  number(text,x,y,color=0xffffff,big=false){const p=this.numbers.find(p=>p.left<=0)||this.numbers[0];p.left=.8;p.x=x;p.y=y-42;p.node.text=String(text);p.node.style.fill=color;p.node.scale.set(big?1.25:1);p.node.visible=true;}
  effect(x,y,r,color,life=.3,kind='ring',shape=null,facing=0){
    const f=this.effects.find(f=>f.left<=0);if(!f)return;
    f.node.clear();if(shape)shapePath(f.node,shape).fill({color,alpha:.13}).stroke({color,width:2});
    else if(kind==='trail')f.node.ellipse(0,-17,r*.8,r*1.1).fill({color,alpha:.28});
    else f.node.circle(0,0,r).stroke({color,width:2});
    f.node.position.set(x,y);f.node.rotation=facing;f.node.visible=true;f.left=f.total=life;f.kind=kind;
  }
  events(world,events){
    this.telegraphs=getTelegraphs(world);
    for(const ev of events){const ent=world.entities.find(e=>e.id===(ev.dst??ev.id));
      if(ev.type==='hit'){
        this.ensure(ent).anim.hurt=.08;this.number(ev.dmg,ev.x,ev.y,ev.exposed?0xffd16b:0xffffff,ev.exposed);
        this.effect(ev.x,ev.y-18,12,0xffeac1,.16);
        if(ev.dmg>=20||ev.exposed){this.stopLeft=Math.max(this.stopLeft,.05);this.trauma=Math.min(1,this.trauma+.28);}
      }else if(ev.type==='kill'){this.stopLeft=Math.max(this.stopLeft,.065);this.trauma=Math.min(1,this.trauma+.35);this.effect(ev.x,ev.y,28,0xd3b878);}
      else if(ev.type==='explode')this.effect(ev.x,ev.y,ev.radius,0xffaf56,.4);
      else if(ev.type==='perfectDodge'){this.number('완벽 회피',ent.x,ent.y,0xa9ffef,true);this.effect(ent.x,ent.y,30,0xbcffee,.25);}
      else if(ev.type==='potion')this.number(`+${ev.heal}`,ent.x,ent.y,0xa5d894);
    }
  }
  aim(x,y,out){const p=this.local;if(!p)return;out.aimX=(x-this.root.x)/this.scale-p.x;out.aimY=(y-this.root.y)/this.scale-p.y;}
  render(world,alpha,dt){
    this.local=world.entities[0];this.time+=dt;
    const frozen=this.stopLeft>0&&!this.reduced;this.stopLeft=Math.max(0,this.stopLeft-dt);this.trauma=Math.max(0,this.trauma-dt*2.7);
    const sw=this.app.screen.width,sh=this.app.screen.height;
    this.scale=sw<600?.72:Math.min(1,sh/700);this.root.scale.set(this.scale);
    const halfW=sw/this.scale/2,halfH=sh/this.scale/2;
    const targetX=world.arena.w<halfW*2?world.arena.w/2:clamp(this.local.x,halfW,world.arena.w-halfW);
    const targetY=world.arena.h<halfH*2?world.arena.h/2:clamp(this.local.y,halfH,world.arena.h-halfH);
    this.camera.x+=(targetX-this.camera.x)*(1-Math.exp(-dt*9));this.camera.y+=(targetY-this.camera.y)*(1-Math.exp(-dt*9));
    this.camera.x=world.arena.w<halfW*2?world.arena.w/2:clamp(this.camera.x,halfW,world.arena.w-halfW);
    this.camera.y=world.arena.h<halfH*2?world.arena.h/2:clamp(this.camera.y,halfH,world.arena.h-halfH);
    const shake=this.reduced?0:4*this.trauma*this.trauma;
    this.root.position.set(sw/2-this.camera.x*this.scale+Math.sin(this.time*61)*shake,sh/2-this.camera.y*this.scale+Math.sin(this.time*79)*shake);
    for(const e of world.entities){
      const v=this.ensure(e);if(!frozen){v.x=v.prevX+(e.x-v.prevX)*alpha;v.y=v.prevY+(e.y-v.prevY)*alpha;}
      v.visual.container.position.set(v.x,v.y);v.visual.container.zIndex=v.y;v.shadow.position.set(v.x,v.y);v.shadow.alpha=e.dead?Math.max(0,1-v.anim.deadAge/.7):1;
      v.anim.hurt=Math.max(0,v.anim.hurt-dt);v.visual.update(e,v.anim,frozen?0:dt);
      v.portal.position.set(e.x,e.y);v.portal.visible=e.spawnLeft>0;v.portal.alpha=(e.spawnLeft||0)/21;v.portal.scale.set(1+(21-(e.spawnLeft||0))*.02);
      if(e.kind==='player'&&e.dodge.dashLeft>0&&!frozen)this.effect(v.x,v.y,e.r,0x9dd4cd,.14,'trail');
      const active=e.act?.phase==='active';
      if(e.kind==='player'&&active&&e.act.def.shape&&v.lastAct!==e.act){this.effect(e.x,e.y,0,0xc9ece3,.14,'slash',e.act.def.shape,e.act.facing);v.lastAct=e.act;}
      if(!e.act)v.lastAct=null;
    }
    // Telegraph origin remains authoritative (no camera/animation lunge baked into geometry).
    const tgs=this.telegraphs;this.warning.clear();
    for(let i=0;i<tgs.length;i++){
      const t=tgs[i];let g=this.tgs[i];if(!g){g=new Graphics();this.layers.telegraphs.addChild(g);this.tgs.push(g);}
      g.visible=true;g.clear().position.set(t.ox,t.oy);g.rotation=t.facing;
      const locked=t.phase!=='windup',color=locked?0xf0655e:0xe7ad47;
      shapePath(g,t.shape).fill({color,alpha:locked?.27:.07}).stroke({color,width:t.major?4:2,alpha:1});
      if(!locked&&t.progress>0)shapePath(g,t.shape,t.progress).fill({color,alpha:.24});
      pattern(g,t.shape,color,locked);
      const x=t.ox*this.scale+this.root.x,y=t.oy*this.scale+this.root.y;
      if(x<20||x>sw-20||y<90||y>sh-160){
        const a=Math.atan2(y-sh/2,x-sw/2),px=clamp(x,22,sw-22),py=clamp(y,95,sh-170);
        this.warning.save().translateTransform(px,py).rotateTransform(a).poly([10,0,-7,-7,-7,7]).fill(color).stroke({color:0x111711,width:2}).restore();
      }
    }
    for(let i=tgs.length;i<this.tgs.length;i++)this.tgs[i].visible=false;
    for(const [id,g] of this.projectiles)g.visible=false;
    for(const p of world.projectiles){let g=this.projectiles.get(p.id);
      if(!g){const pool=this.projectilePool.get(p.abilityId);g=pool?.pop();
        if(!g){g=new Graphics();const k=p.abilityId;
        if(k==='arrow'||k==='volley')g.moveTo(-16,0).lineTo(7,0).stroke({color:0xe5d4a0,width:2}).poly([7,0,1,-4,1,4]).fill(0xe6e5ce);
        else if(k==='sling_stone')g.circle(0,0,p.r).fill(0xa29c86).circle(-2,-2,2).fill(0xc9c5b3);
        else {const c=k==='ember_bolt'?0xff9856:0xa5e8ef;g.circle(0,0,p.r*1.8).fill({color:c,alpha:.15}).circle(0,0,p.r).fill({color:c,alpha:.7}).circle(-2,-2,p.r*.4).fill(0xfff5dc);g.blendMode='add';}
        g.ability=p.abilityId;this.layers.projectiles.addChild(g);}
        g.prevX=p.x;g.prevY=p.y;g.position.set(p.x,p.y);this.projectiles.set(p.id,g);
      }g.visible=true;if(!frozen)g.position.set(g.prevX+(p.x-g.prevX)*alpha,g.prevY+(p.y-g.prevY)*alpha);g.rotation=Math.atan2(p.vy,p.vx);
    }
    for(const [id,g] of this.projectiles)if(!g.visible){let pool=this.projectilePool.get(g.ability);if(!pool){pool=[];this.projectilePool.set(g.ability,pool);}pool.push(g);this.projectiles.delete(id);}
    for(const p of this.numbers){if(p.left<=0)continue;p.left-=dt;p.node.visible=p.left>0;p.node.position.set(p.x,p.y-(1-p.left/.8)*34);p.node.alpha=Math.min(1,p.left*4);}
    for(const f of this.effects){if(f.left<=0)continue;f.left-=dt;f.node.visible=f.left>0;f.node.alpha=Math.max(0,f.left/f.total)*(this.reduced?.5:1);f.node.scale.set(f.kind==='ring'?1+(1-f.left/f.total)*.35:1);}
  }
}
