// Isolated preboot fixture; native keys/CDP touch; read-only art observer. No world writes or production captures.
import{chromium}from'/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from'node:assert/strict';import{spawn,execFileSync}from'node:child_process';import{readFile,writeFile}from'node:fs/promises';import{fileURLToPath}from'node:url';
import{createSave,SaveStore,validateSave}from'../js/meta/save.js';import{trained}from'./fixtures/trained.js';import{instance}from'../js/meta/items.js';
import{createSkeletonSave}from'../js/meta/character-creation.js';
import{SHIELD_HAND_ANCHORS}from'../js/render/shield-hand-anchors.js';
const evolvedSheet=JSON.parse(await readFile(new URL('../assets/sprites/player-death-knight/atlas-0.webp.json',import.meta.url),'utf8'));
const root=fileURLToPath(new URL('../..',import.meta.url)),base=process.env.ARPG_BASE_URL||'http://127.0.0.1:8997',out=process.env.ARPG_SHIELD_MODEL_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-all-skills-shield-combat.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server','8997','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
let save=trained(createSave({name:'방패 검증',weapon:'blade',answers:[0,0,0,0,0],createdAt:1}),30);save.items.push(instance('fixture:shield','round_shield',0,[]));save.equipped.offhand='fixture:shield';save.stacks.potion=30;
assert.ok(validateSave(save));const storage={};new SaveStore({setItem:(k,v)=>storage[k]=v}).save(save);
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={status:'RUNNING',base,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rows:[],errors:[],screenshots:0,worldWrites:0,liveSaveReads:0};
try{
 for(let n=0;n<30;n++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const width of [1280,390])for(const kind of ['human','skeleton','evolved']){
 save=trained(kind==='human'?createSave({name:'shield',answers:[0,0,0,0,0],createdAt:1}):createSkeletonSave({lineage:'skeleton_knight',name:'shield',answers:[0,0,0,0,0],createdAt:1}),30);if(kind==='evolved')save.permanentDeathKnight=true;save.items.push(instance('fixture:shield','bone_shield',0,[]));save.equipped.offhand='fixture:shield';save.stacks.potion=99;
 const storage={[(kind==='human'?'arpg.save.v1':'arpg.save.v1.slots.skeleton_knight')]:JSON.stringify(save)};
  const mobile=width===390,ctx=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile}),page=await ctx.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));await ctx.addInitScript(storage=>{if(!sessionStorage.getItem('shieldFixtureBoot')){for(const[k,v]of Object.entries(storage))localStorage.setItem(k,v);sessionStorage.setItem('shieldFixtureBoot','1');}},storage);
  await page.goto(base+'/arpg/?character='+(kind==='human'?'human':'skeleton_knight'));await page.waitForFunction(()=>window.__arpg);
  const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();mobile?await n.tap():await n.click();};
  await page.locator('[data-action="board"]').waitFor();await press('[data-action="board"]');await press('[data-action="map-region"][data-region="outskirts"]');await press('[data-action="sortie"][data-stage="S1"]');await press('#sortie-confirm');
  await page.waitForFunction(()=>__arpg.world?.round?.stageId==='S1'&&__arpg.art.visuals.some(v=>v.physicalShield&&v.direction&&['paperdoll','atlas'].includes(v.mode)));
  const samples=[],cdp=await ctx.newCDPSession(page),keys=[['KeyD'],['KeyD','KeyS'],['KeyS'],['KeyA','KeyS'],['KeyA'],['KeyA','KeyW'],['KeyW'],['KeyD','KeyW']];
  const sample=async label=>{await page.waitForFunction(()=>__arpg.art.visuals.some(v=>v.physicalShield&&v.direction));samples.push({label,...await page.evaluate(()=>{const p=__arpg.world.entities.find(e=>e.kind==='player'),v=__arpg.art.visuals.find(v=>v.id&&v.physicalShield&&v.direction);return{tick:__arpg.world.tick,pawnFacing:p.facing,visual:v};})});};
  for(let d=0;d<8;d++){
   if(mobile){const x=85,y=410;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:7}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+38*Math.cos(d*Math.PI/4),y:y+38*Math.sin(d*Math.PI/4),id:7}]});}
   else for(const key of keys[d])await page.keyboard.down(key);
   await page.waitForTimeout(200);await sample('move'+d);
   if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else for(const key of keys[d])await page.keyboard.up(key);
   await page.waitForTimeout(100);await sample('idle'+d);
  }
  if(mobile){const b=await page.locator('#dodge').boundingBox();await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:8}]});}else await page.keyboard.down('Space');
  await page.waitForTimeout(200);await sample('guard');if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});else await page.keyboard.up('Space');
  await press('#attack');await page.waitForTimeout(120);await sample('attack');
  const directions=new Set();let maxGrip=0,maxBoneError=0;
  for(const s of samples){const v=s.visual;assert.ok(v?.physicalShield,'rendered shield visible');directions.add(v.direction);const p=v.physicalShield,sockets=SHIELD_HAND_ANCHORS[v.id==='player-skeleton-equipment'?'skeleton':v.id==='paperdoll-focus'?'focus':'blade'][v.state+'_'+v.direction],h=sockets[v.id==='player-death-knight'?Math.min(sockets.length-1,Math.floor(v.frame*sockets.length/evolvedSheet.animations[v.state+'_'+v.direction].length)):v.frame];
   const equipmentScale=v.id==='player-death-knight'?v.scale*2:v.scale;const error=h?Math.hypot(p.handX-h[0]*equipmentScale,p.handY-h[1]*equipmentScale):0,grip=Math.hypot(p.x-p.handX,p.y-p.handY);maxBoneError=Math.max(maxBoneError,error);maxGrip=Math.max(maxGrip,grip);assert.ok(error<.02,'actual displayed frame/bone binding');assert.ok(grip<=6,'no detached shield');assert.equal(p.shape,'bone');assert.ok(p.height>=16,'no half-sized evolved shield');
  }
  assert.equal(directions.size,8,'native full rotation sweep');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  report.rows.push({width,kind,input:mobile?'native CDP touch':'native keyboard',directions:[...directions],maxGrip,maxBoneError,samples});await cdp.detach();await ctx.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify({status:report.status,rows:report.rows.map(({width,directions,maxGrip,maxBoneError})=>({width,directions,maxGrip,maxBoneError}))}));
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2));await browser.close();server?.kill();}
