import {Application, Graphics, Container, Assets} from '../../../vendor/pixi-8.22.0.min.mjs';
import {SkillVfx, SKILL_VFX, VFX_BAKED as VFX_ATLASES} from '../../../js/render/skill-vfx.js';
import {ABILITIES} from '../../../js/content/combat.js';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
const actor=(id,skill,phase='windup',elapsed=4)=>({id,kind:'player',x:180,y:190,r:18,act:{id:skill,def:ABILITIES[skill],phase,elapsed,total:24,facing:.35}});
const deepFreeze=obj=>{if(obj&&typeof obj==='object'){Object.values(obj).forEach(deepFreeze);Object.freeze(obj);}return obj;};
export async function setup() {
  const viewport=document.createElement('meta');viewport.name='viewport';viewport.content='width=device-width,initial-scale=1';document.head.appendChild(viewport);
  await new Promise(requestAnimationFrame);
  const app=new Application();await app.init({width:innerWidth,height:400,preference:'webgl',autoStart:false});
  document.body.appendChild(app.canvas);
  const layer=new Container();app.stage.addChild(layer);const vfx=new SkillVfx(Graphics,layer,{atlases:VFX_ATLASES});
  window.fx2={app,layer,vfx,clicks:0};
  check(vfx.fxLoads.size===0,'constructor is not lazy');
  const button=document.createElement('button');button.id='fx2-fire';button.textContent='FX2';
  button.style='position:fixed;left:12px;top:420px;width:120px;height:50px';document.body.appendChild(button);
  button.onclick=()=>{fx2.clicks++;fx2.result=runSmoke().catch(e=>({error:e.stack}));};
  return {requested:vfx.fxRequested,initialLoads:0};
}
export async function runSmoke() {
  const {app,layer,vfx}=window.fx2,proof=[];
  const reduced=new SkillVfx(Graphics,new Container(),{atlases:VFX_ATLASES});
  for(const skill of Object.keys(SKILL_VFX))reduced.update({tick:1,entities:[actor(1,skill)],projectiles:[]},1,.016,true);
  check(reduced.fxLoads.size===0,'reduced-motion loaded textures');
  for(const skill of Object.keys(SKILL_VFX)) {
    vfx.reset();
    let world={tick:50,entities:[actor(1,skill)],projectiles:[]};
    deepFreeze(world);const before=JSON.stringify(world);
    vfx.update(world,1,.016,false);
    const load=vfx.fxLoads.get(skill);
    if(vfx.fxRequested)check(await load===true,`${skill} load failed ${vfx.fxError}`);
    check(JSON.stringify(world)===before,`${skill} mutated windup state`);
    vfx.update(world,1,.016,false);app.render();
    const windup=!!vfx.actors[0].baked?.visible;
    const def=ABILITIES[skill],pr=def.projectile;
    world={tick:54,entities:[actor(1,skill,'active',8)],projectiles:pr?[{id:77,abilityId:skill,x:230,y:200,r:pr.radius,vx:Math.cos(.35)*pr.speed,vy:Math.sin(.35)*pr.speed}]:[]};
    vfx.update(world,1,.05,false);
    if(skill==='lunge')vfx.update({...world,tick:55,entities:[{...world.entities[0],x:210,act:{...world.entities[0].act,elapsed:9}}]},1,.05,false);
    if(pr?.explode)vfx.event({type:'explode',ability:skill,x:240,y:210,radius:pr.explode.radius},world,false);
    else if(def.heal)vfx.event({type:'healCast',ability:skill,x:180,y:190,radius:def.heal.radius},world,false);
    else if(pr)vfx.event({type:'hit',ability:skill,x:240,y:210,src:1},world,false);
    vfx.update(world,1,.05,false);app.render();
    const baked=[...vfx.effects,...vfx.actors,...vfx.projectiles].filter(s=>s.baked?.visible);
    check(!vfx.fxRequested||baked.length>0,`${skill} no native sprite activated`);
    const projectile=vfx.projectiles.find(s=>s.id===77);
    if(pr&&vfx.fxRequested) {
      check(projectile?.baked?.visible&&projectile.node.visible,`${skill} baked flight must overlay the vector body`);
      check(Math.abs(projectile.baked.scale.x-pr.radius/(vfx.fxAssets.get(skill).clips.projectile.support))<1e-6,`${skill} radius mismatch`);
      check(Math.abs(projectile.baked.rotation-.35)<1e-6,`${skill} facing mismatch`);
    }
    const textures=baked.map(s=>s.baked.texture);
    vfx.update(world,1,.1,false);app.render();
    const advanced=baked.some((s,i)=>s.baked.texture!==textures[i]);
    const count=layer.children.length;
    for(let i=0;i<80;i++)vfx.effect(SKILL_VFX[skill],'active',180,190,.35,def.heal?.radius||def.shape?.radius||pr?.explode?.radius||pr?.radius||20,def.shape,false);
    check(layer.children.length===count,`${skill} unbounded pool`);
    vfx.update(world,1,.01,true);app.render();
    check([...vfx.effects,...vfx.actors,...vfx.projectiles].every(s=>!s.baked?.visible),`${skill} reduced baked visible`);
    if(pr)check(projectile.node.visible,`${skill} reduced projectile fallback missing`);
    vfx.reset();check([...vfx.effects,...vfx.actors,...vfx.projectiles].every(s=>!s.baked?.visible),`${skill} reset leaked sprite`);
    proof.push({skill,windup,bakedSprites:baked.length,advanced,lazyLoad:!!load,poolBounded:true,reduced:true,reset:true});
  }
  if(vfx.fxRequested) {
    check(vfx.fxLoads.size===10&&vfx.fxAssets.size===10,'not all skill assets loaded');
    check(layer.children.length===512,'shared pool grew per skill');
  } else check(vfx.fxLoads.size===0&&layer.children.length===432,'classic allocated/fetched');
  const nativeResources=performance.getEntriesByType('resource').filter(e=>e.name.includes('/assets/vfx/')&&e.name.includes('/atlas.json')).map(e=>e.name);
  const decoded=[...vfx.fxAssets].map(([skill,{meta,clips}])=>({skill,size:meta.size,sourceSize:[clips.impact.textures[0].source.width,clips.impact.textures[0].source.height]}));
  for(const item of decoded)check(item.size[0]===item.sourceSize[0]&&item.size[1]===item.sourceSize[1],`${item.skill} atlas not decoded`);
  const originalFetch=window.fetch;window.fetch=async()=>({ok:false,status:503});
  const failed=new SkillVfx(Graphics,new Container(),{effekseer:true});
  check(await failed.requestSkill('ember_bolt')===false,'metadata fallback did not settle');
  window.fetch=originalFetch;
  failed.event({type:'explode',ability:'ember_bolt',x:100,y:100,radius:78},{},false);
  check(failed.effects.some(s=>s.node.visible),'metadata fallback invisible');
  const load=Assets.load;Assets.load=async()=>{throw new Error('test decoder failure');};
  const decoder=new SkillVfx(Graphics,new Container(),{effekseer:true,atlases:VFX_ATLASES});
  check(await decoder.requestSkill('healing_light')===false,'decoder fallback did not settle');Assets.load=load;
  decoder.event({type:'healCast',ability:'healing_light',x:100,y:100,radius:160},{},false);
  check(decoder.effects.some(s=>s.node.visible),'decoder fallback invisible');
  return {proof,nativeResources,decoded,clicks:fx2.clicks,loaded:vfx.fxLoads.size,children:layer.children.length,metadataFallback:true,decoderFallback:true,reducedZeroFetch:true};
}
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
export async function benchmark() {
  let source=await (await fetch(new URL('baseline-skill-vfx.mjs',import.meta.url))).text();
  source=source.replace(/from '(\/[^']+)'/g,(_,path)=>`from '${location.origin}${path}'`);
  const {SkillVfx:Baseline}=await import('data:text/javascript;base64,'+btoa(source));
  const {app}=window.fx2;
  const results=[];
  for(const [mode,Type,enabled] of [['baseline74a6237',Baseline,false],['fx2',SkillVfx,true]]) {
    const layer=new Container();app.stage.addChild(layer);const vfx=new Type(Graphics,layer,{effekseer:enabled});
    if(enabled)await Promise.all(Object.keys(VFX_ATLASES).map(id=>vfx.requestSkill(id)));
    const skills=['whirl','flame_ring','heavy_cleave','healing_light'];
    const bullets=['volley','pierce_shot','frost_lance','ember_bolt','blast_arrow'];
    const world={tick:1,entities:skills.map((id,i)=>({...actor(i+1,id,'active',9),x:60+i*75,y:130+i%2*90})),projectiles:Array.from({length:20},(_,i)=>({id:100+i,abilityId:bullets[i%5],x:40+i*15,y:280+(i%3)*12,r:ABILITIES[bullets[i%5]].projectile.radius,vx:300,vy:80}))};
    const elapsed=[],intervals=[];let last;
    for(let frame=0;frame<150;frame++) {
      const timestamp=await new Promise(requestAnimationFrame);
      if(frame>=30&&last!==undefined)intervals.push(timestamp-last);last=timestamp;
      const start=performance.now();
      world.tick++;
      if(frame%8===0) {
        for(const id of ['ember_bolt','blast_arrow'])vfx.event({type:'explode',ability:id,x:180,y:220,radius:ABILITIES[id].projectile.explode.radius},world,false);
        vfx.event({type:'healCast',ability:'healing_light',x:180,y:180,radius:160},world,false);
      }
      vfx.update(world,1,1/60,false);app.render();app.renderer.gl.finish();
      if(frame>=30)elapsed.push(performance.now()-start);
    }
    results.push({mode,samples:elapsed.length,players:4,projectiles:20,renderGpuFinishMs:{p50:percentile(elapsed,.5),p95:percentile(elapsed,.95)},rafIntervalMs:{p50:percentile(intervals,.5),p95:percentile(intervals,.95)},sprites:layer.children.length});
    app.stage.removeChild(layer);layer.destroy({children:true});
  }
  return {renderer:'Chromium WebGL / headless SwiftShader; not physical mobile',canvas:[app.screen.width,app.screen.height],results,p95Ratio:results[1].renderGpuFinishMs.p95/results[0].renderGpuFinishMs.p95};
}
