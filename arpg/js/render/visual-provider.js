import {Container, Graphics} from '../../vendor/pixi-8.22.0.min.mjs';
const COLORS={blade:0x7c9fa2,bow:0x819768,focus:0x8573ab,goblin_grunt:0x73934c,goblin_slinger:0x547c50,iron_boar:0x79573f,goblin_chief:0x577447,scarecrow:0xae8e53};
// Atlas providers can register the same key and return this contract unchanged.
// update(entityState, animState, dt) never writes to the simulation.
export class VisualProvider {
  constructor({palette={}}={}){this.palette=palette;this.factories=new Map();}
  register(key,factory){this.factories.set(key,factory);}
  createVisual(entity){
    const key=entity.kind==='player'?entity.weapon:entity.type;
    const color=this.palette[key]??COLORS[key];
    return this.factories.has(key)?this.factories.get(key)(entity,{color}):procedural(entity,{color});
  }
}
function procedural(e,{color}) {
  const container=new Container(),body=new Container(),silhouette=new Graphics(),weapon=new Graphics(),face=new Graphics(),stars=new Graphics(),bar=new Graphics(),health=new Graphics(),flash=new Graphics();
  const r=e.r,k=e.kind==='player'?e.weapon:e.type;
  silhouette.ellipse(-6,-2,6,4).ellipse(7,-2,6,4).fill(0x242722);
  if(k==='iron_boar') {
    silhouette.ellipse(0,-16,r+7,r*.7).fill(color).ellipse(18,-15,12,10).fill(0x3a3027);
    silhouette.poly([23,-12,33,-23,28,-8]).poly([18,-8,25,0,22,-12]).fill(0xe7d4aa);
    silhouette.moveTo(-16,-29).lineTo(12,-29).stroke({color:0x999b91,width:5});
  } else if(k==='scarecrow') {
    silhouette.rect(-3,-42,6,42).rect(-30,-30,60,6).fill(0x745639);
    silhouette.poly([-17,-32,17,-32,11,-4,-11,-4]).fill(color);
    silhouette.circle(0,-41,10).fill(0xd5b66b).poly([-15,-45,15,-45,5,-57,-6,-57]).fill(0x574430);
    silhouette.moveTo(-6,-40).lineTo(-2,-37).moveTo(2,-37).lineTo(6,-40).stroke({color:0x26241b,width:2});
  } else {
    silhouette.poly([-r*.75,-6,-r*.65,-26,0,-34,r*.65,-26,r*.75,-6]).fill(color).stroke({color:0x1a231c,width:2});
    silhouette.circle(0,-36,r*.58).fill(e.kind==='player'?0xc4b29a:color);
    if(e.kind==='player')silhouette.poly([-13,-42,0,-51,13,-42,11,-31,0,-37,-11,-31]).fill(0x343b3b);
    else silhouette.poly([-8,-39,-24,-44,-14,-29]).poly([8,-39,24,-44,14,-29]).fill(color);
    if(k==='goblin_chief')silhouette.poly([-15,-46,-17,-58,-7,-52,0,-63,7,-52,17,-58,15,-46]).fill(0xc5a24d);
    silhouette.circle(-5,-36,2).circle(5,-36,2).fill(0xf4d18c);
  }
  if(k==='blade'||k==='goblin_grunt')weapon.poly([9,-3,13,-3,14,-39,11,-48,8,-39]).fill(0xc8d1c9).rect(4,-15,16,4).fill(0x927850);
  if(k==='bow')weapon.moveTo(12,-43).quadraticCurveTo(38,-24,12,-6).stroke({color:0xba9863,width:4}).moveTo(12,-43).lineTo(12,-6).stroke({color:0xc5c1a5,width:1});
  if(k==='focus')weapon.circle(19,-29,12).fill({color:0x8ddfe9,alpha:.15}).circle(19,-29,6).fill(0xb4ebf5).circle(17,-32,2).fill(0xffffff);
  if(k==='goblin_slinger')weapon.moveTo(12,-20).lineTo(29,-40).lineTo(34,-26).lineTo(12,-20).stroke({color:0xc7b18d,width:2}).circle(29,-38,4).fill(0xaba795);
  if(k==='goblin_chief')weapon.rect(13,-43,6,42).fill(0x796047).roundRect(8,-50,16,23,3).fill(0x9b9b87);
  face.poly([r+3,0,r+11,0,r+5,-4]).fill(e.kind==='player'?0xb2e5df:0xc3af87);
  for(let i=0;i<3;i++)stars.star((i-1)*14,-62-(i%2)*6,4,4,2).fill(0xffd57a);
  bar.rect(-r,-66,r*2,4).fill(0x1b1b18);health.rect(-r,-66,r*2,4).fill(0xb26d50);
  flash.ellipse(0,-20,r*.8,16).circle(0,-36,r*.58).fill(0xffffff);
  flash.visible=false;body.addChild(silhouette,weapon,flash,stars);container.addChild(body,face,bar,health);
  return {container,update(state,a,dt){
    a.age+=dt;if(state.dead)a.deadAge+=dt;
    const phase=state.act?.phase,lean=phase==='windup'?-3:phase==='active'?7:0;
    const bob=state.moving?Math.sin(a.age*15)*2:Math.sin(a.age*3)*.6;
    body.position.set(Math.cos(state.facing)*lean,-bob+Math.min(14,a.deadAge*20));
    body.rotation=state.staggerLeft>0?Math.sin(a.age*25)*.12:0;
    weapon.rotation=Math.cos(state.facing)*(phase==='windup'?-.3:phase==='active'?.45:.1);
    face.rotation=state.facing;stars.visible=state.staggerLeft>0;stars.rotation=Math.sin(a.age*6)*.05;
    body.alpha=state.spawnLeft>0?.45:.95;
    flash.visible=a.hurt>0;flash.alpha=a.reduced?.25:.85;
    container.alpha=state.dead?Math.max(0,1-a.deadAge/.7):state.terminal==='return_scroll'?.35:1;
    bar.visible=health.visible=state.kind==='monster'&&!state.dead&&state.type!=='scarecrow';
    health.scale.x=Math.max(0,state.hp/state.maxHp);
  },destroy(){container.removeFromParent();container.destroy({children:true});}};
}
