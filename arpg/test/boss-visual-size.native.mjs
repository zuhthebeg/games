// Screenshot-free, synthetic scene only. ARPG_BASE_URL enables post-release replay.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base=process.env.ARPG_BASE_URL || 'http://127.0.0.1:8897';
const server=process.env.ARPG_BASE_URL ? null : spawn('python3',['-m','http.server','8897','--bind','127.0.0.1'],{cwd:new URL('../../',import.meta.url).pathname,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
const failAtlas=process.env.ARPG_ATLAS_FAILURE === '1';
try {
  for(let i=0;i<40;i++){try{if((await fetch(`${base}/arpg/test/feel-fixture.html`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:844}});
    page.on('pageerror',e=>errors.push(e.message));
    let release; const gate=new Promise(resolve=>{release=resolve;});
    await page.route('**/assets/sprites/manifest.json',async route=>{await gate;if(failAtlas) await route.fulfill({status:503,body:'isolated offline-art fixture'});else await route.continue();});
    await page.goto(`${base}/arpg/test/feel-fixture.html`);
    await page.evaluate(async()=>{
      const [{Application},{ArenaRenderer},{VisualProvider},{createWorld,addPlayer,spawnMonster},{FEEL}]=await Promise.all([
        import('../vendor/pixi-8.22.0.min.mjs'),import('../js/render/renderer.js'),import('../js/render/visual-provider.js'),import('../js/sim/world.js'),import('../js/render/feel.js')]);
      const app=new Application();await app.init({width:innerWidth,height:844,preference:'webgl'});document.body.append(app.canvas);
      const world=createWorld({seed:15});addPlayer(world,{pid:'local',weapon:'blade',x:400,y:400});
      for(const type of ['goblin_chief','necropolis_lord','throne_dragon','wolf','rune_guardian','training_dragon']) spawnMonster(world,type,600,400,{stageId:'S15'});
      const elite=spawnMonster(world,'wolf',650,400,{stageId:'S15'});elite.eliteVariant=true;elite.heavyPoise=true;
      const renderer=new ArenaRenderer(app,new VisualProvider());renderer.snapshot(world);renderer.render(world,1,1/60);
      const before=JSON.stringify(world);
      const freeze=o=>{if(o&&typeof o==='object'&&!Object.isFrozen(o)){Object.values(o).forEach(freeze);Object.freeze(o);}};freeze(world);
      globalThis.fixture={app,world,renderer,before,FEEL};
    });
    const inspect=async(mode)=>page.evaluate(mode=>{
      const {app,world,renderer,before,FEEL}=globalThis.fixture;
      const failures=[],metrics=[];
      const check=(ok,label)=>{if(!ok)failures.push(label);};
      const near=(a,b)=>Math.abs(a-b)<.001;
      for(const reduced of [false,true]) for(const frozen of [false,true]) {
        renderer.reduced=reduced;
        for(const view of renderer.views.values()) {view.stopLeft=frozen?1:0;view.kickAge=FEEL.kick.life;}
        for(let frame=0;frame<12;frame++) renderer.render(world,1,1/60);
        app.render();
        for(const entity of world.entities) {
          const view=renderer.views.get(entity.id),node=view.visual.container;
          const boss=entity.kind==='monster'&&['goblin_chief','necropolis_lord','throne_dragon'].includes(entity.type),factor=boss?2:1;
          check(node.scale.x===factor&&node.scale.y===factor,`${entity.type} scale ${mode}/${reduced}/${frozen}`);
          const actual=node.getBounds();const doubled={x:actual.x,y:actual.y,width:actual.width,height:actual.height};
          // Reconstruct pre-change presentation on this isolated render node, never the simulation.
          node.scale.set(1);const original=node.getBounds();
          const old={x:original.x,y:original.y,width:original.width,height:original.height};node.scale.set(factor);
          const anchor=node.toGlobal({x:0,y:0}),shadow=view.shadow.toGlobal({x:0,y:0});
          check(near(doubled.width,old.width*factor)&&near(doubled.height,old.height*factor),`${entity.type} bounds`);
          check(near(anchor.x,shadow.x)&&near(anchor.y,shadow.y),`${entity.type} foot anchor`);
          check(near(doubled.x-anchor.x,(old.x-anchor.x)*factor)&&near(doubled.y-anchor.y,(old.y-anchor.y)*factor),`${entity.type} anchor-relative bounds`);
          check(view.shadow.scale.x===1&&view.shadow.scale.y===1,`${entity.type} shadow`);
          check(node.zIndex===entity.y,`${entity.type} depth`);
          const debug=view.visual.debug;
          check(debug.mode===mode,`${entity.type} expected ${mode}, got ${debug.mode}: ${debug.loadFailure}`);
          if(!reduced&&!frozen) metrics.push({type:entity.type||entity.weapon,elite:!!entity.eliteVariant,factor,mode:debug.mode,bounds:doubled,anchor:{x:anchor.x,y:anchor.y}});
        }
      }
      check(JSON.stringify(world)===before,'world mutation');return {failures,metrics};
    },mode);
    const fallback=await inspect('procedural');assert.deepEqual(fallback.failures,[]);
    release();
    await page.waitForFunction(failed=>failed
      ? fixture.renderer.provider.atlases.failed.size>0 && fixture.renderer.provider.atlases.entries.size===0
      : [...fixture.renderer.views.values()].every(v=>v.visual.debug.mode==='atlas'),failAtlas,{timeout:60000});
    const ready=await inspect(failAtlas ? 'procedural' : 'atlas');assert.deepEqual(ready.failures,[]);
    console.log(JSON.stringify({width,fallback:fallback.metrics,ready:ready.metrics,result:'PASS'}));
    await page.evaluate(()=>fixture.app.destroy(true,{children:true}));await page.close();
  }
  assert.deepEqual(errors,[]);console.log('boss visual 2x native PC/touch PASS; screenshots not taken');
} finally {await browser.close();server?.kill();}
