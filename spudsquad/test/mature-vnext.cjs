// Controlled mature T6 bots, not real players/devices. No network/write APIs.
const fs=require('node:fs'),Module=require('node:module'),cp=require('node:child_process');
const variant=process.argv[2]||'after',out=process.argv[3],cap=Number(process.env.SPUD_COMBAT_CAP||120);
const D=require('../js/data.js');let S;
if(variant==='before'){
 const m=new Module(__filename+'-baseline',module);m.filename=__filename;m.paths=module.paths;
 const original=m.require.bind(m);m.require=id=>id==='./data.js'?D:original(id);
 m._compile(cp.execFileSync('git',['show','4e5c052:spudsquad/js/sim.js'],{encoding:'utf8'}),__filename);S=m.exports;
}else S=require('../js/sim.js');
const rng=seed=>()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
const rows=[];
for(const n of [1,4])for(const wave of [18,20,21,25,30])for(const durable of [false,true]){
 const results=[];
 for(let seed=0;seed<20;seed++){
  const stats={...D.stats,maxHp:durable?1000:120,regen:durable?200:25,atkSpd:60,dmg:100,crit:20,ranged:30,elemental:30,armor:15,lifesteal:10,speed:10};
  const players=Object.fromEntries(Array.from({length:n},(_,i)=>['p'+i,{char:'gunslinger',stats,weapons:[['smg',6],['shotgun',6],['laser',6],['pistol',6],['crossbow',6],['potato_cannon',6]]}]));
  const w=S.createWorld({wave,endless:true,players,rng:rng(1001+seed*9173)});w.spawnClock=-1e9;w.bossSpawned=true;w.looterRolled=true;w.tm=cap;
  const b=S.spawn(w,'boss_2',800,250);b.summon=-1e9; // isolate boss TTK, same disabled summons both variants
  const initialBossHp=b.hp;Object.values(w.players).forEach((p,i)=>{p.x=700+i*60;p.y=580;});
  let killAt=null,deadAt=null;
  for(let tick=0;tick<cap*30&&!w.ended;tick++){
   for(const p of Object.values(w.players))if(p.alive){
    const nearest=w.enemies.reduce((best,e)=>Math.hypot(p.x-e.x,p.y-e.y)<best.d?{e,d:Math.hypot(p.x-e.x,p.y-e.y)}:best,{e:null,d:Infinity});
    let dx=0,dy=0;if(nearest.e){const away=nearest.d<340?1:nearest.d>400?-1:0;dx=(p.x-nearest.e.x)*away;dy=(p.y-nearest.e.y)*away;}
    if(p.x<120)dx+=300;if(p.x>1480)dx-=300;if(p.y<120)dy+=300;if(p.y>1080)dy-=300;
    const len=Math.hypot(dx,dy);if(len){p.x=S.clamp(p.x+dx/len*220/30,0,1600);p.y=S.clamp(p.y+dy/len*220/30,0,1200);}
   }
   S.step(w);w.fx.length=0;
   if(b.hp<=0){killAt=(tick+1)/30;break;}
   if(!Object.values(w.players).some(p=>p.alive)){deadAt=(tick+1)/30;break;}
  }
  results.push({seed:1001+seed*9173,killAt,deadAt,bossHp:Math.max(0,b.hp),initialBossHp,hp:Object.values(w.players).map(p=>p.hp),tick:w.tick});
 }
 const kills=results.filter(r=>r.killAt!=null),deaths=results.filter(r=>r.deadAt!=null);
 rows.push({wave,n,durable,killCount:kills.length,deathCount:deaths.length,censored:20-kills.length-deaths.length,meanTTK:kills.length?kills.reduce((s,r)=>s+r.killAt,0)/kills.length:null,results});
 console.log(JSON.stringify({...rows.at(-1),results:undefined}));
}
if(out)fs.writeFileSync(out,JSON.stringify({variant,controlledBot:true,summons:false,durationCap:cap,rows},null,2));
