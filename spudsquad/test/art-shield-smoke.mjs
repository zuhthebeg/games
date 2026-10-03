// Local-only DOM, decoded raster/matrix tests. No screenshots or remote writes.
import assert from 'node:assert/strict';
const {chromium}=await import('/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs');
const base=process.argv[2]||'http://127.0.0.1:8874/spudsquad/';
const browser=await chromium.launch({headless:true,executablePath:'/home/cocy/bin/chromium',args:['--no-sandbox','--disable-gpu']});
const report={screenshots:0,errors:[],viewports:[],rasterMatrices:0,assets:0,ads:[],blockedWrites:0};
try{
 for(const [width,height] of [[390,844],[844,390],[320,568]]){
  const ctx=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:true});
  await ctx.route('**/*',r=>{const q=r.request();if(q.method()!=='GET'){report.blockedWrites++;return r.abort();}if(!q.url().startsWith('http://127.0.0.1:8874/'))return r.abort();if(/adsbygoogle|googletagmanager/.test(q.url()))report.ads.push(q.url());return r.continue();});
  await ctx.addInitScript(()=>{window.realRAF=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>realRAF(t=>{if(!window.pauseRAF)cb(t)});});
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'?debug=1');await page.waitForFunction(()=>window.SPUD?.main&&document.querySelector('[data-act=solo]'));
  await page.waitForFunction(()=>Object.values(SPUD.render.images).every(i=>i.complete));const assets=await page.evaluate(()=>Object.entries(SPUD.render.images).map(([id,i])=>({id,ok:i.ok,w:i.naturalWidth})));assert.ok(assets.every(i=>i.ok&&i.w));report.assets=assets.length;
  assert.equal(await page.locator('#settingsBtn').isVisible(),true);await page.locator('#settingsBtn').click();assert.equal(await page.locator('#settingsPanel').isVisible(),true);await page.keyboard.press('Escape');
  await page.locator('[data-act=solo]').click();await page.locator('[data-act=basic]').click();await page.waitForFunction(()=>SPUD.main.mode==='wave');
  await page.evaluate(()=>{const w=SPUD.main.session.world;w.tm=999;w.spawnClock=-1e9;w.players.solo.immune=1e9;});
  const rects=await page.evaluate(()=>{const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};return {stats:rect('statsBtn'),settings:rect('settingsBtn'),hud:rect('hud'),canvas:rect('canvas'),field:rect('field'),padding:parseFloat(getComputedStyle(document.getElementById('game')).paddingTop),scroll:document.body.scrollWidth};});
  assert.equal(rects.settings.w,44);assert.equal(rects.settings.h,44);assert.ok(Math.abs(rects.settings.y-rects.stats.y)<1);assert.ok(rects.settings.x>=rects.stats.right);assert.ok(rects.settings.right<=width);assert.equal(rects.hud.h,width>height?44:56);assert.equal(rects.canvas.h,height-56-(width>height?0:rects.hud.h));assert.ok(rects.scroll<=width);assert.equal(rects.padding,56);
  const hit=await page.locator('#settingsBtn').evaluate(n=>{const r=n.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2).id;});assert.equal(hit,'settingsBtn');
  await page.locator('#settingsBtn').click();assert.equal(await page.locator('#settingsPanel').isVisible(),true);const panel=await page.locator('#settingsPanel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=width);assert.ok(panel.y>=rects.field.y&&panel.y+panel.height<=height);
  await page.locator('#volume').fill('62');await page.locator('#volume').dispatchEvent('input');await page.locator('#music').click();const pref=await page.evaluate(()=>({volume:localStorage.getItem('spud_volume'),music:localStorage.getItem('spud_music')}));await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'settingsBtn');
  await page.reload();await page.waitForFunction(()=>SPUD.main?.mode==='wave');assert.deepEqual(await page.evaluate(()=>({volume:localStorage.getItem('spud_volume'),music:localStorage.getItem('spud_music')})),pref);
  await page.evaluate(()=>{const w=SPUD.main.session.world,p=w.players.solo;p.weapons=[['shield',5],['shield',5]];p.mats=1000;p.immune=1e9;w.tm=0;w.spawnClock=-1e9;w.enemies=[];});
  await page.waitForFunction(()=>SPUD.main.mode==='shop');await page.locator('[data-act=slot0]').click();await page.locator('[data-act=merge]').click();assert.deepEqual(await page.evaluate(()=>SPUD.main.session.world.players.solo.weapons),[['shield',6]]);
  await page.locator('#statsBtn').click();assert.equal(await page.locator('[data-stat=armor] .v').innerText().then(s=>s.split('\n')[0]),'+8');assert.ok((await page.locator('.weapon-row').innerText()).includes('+8'));await page.keyboard.press('Escape');
  await page.evaluate(()=>SPUD.main.offers[0]={id:'shield',weapon:true,tier:1,price:30,locked:true});await page.locator('[data-act=roll]').click();const mats=await page.evaluate(()=>SPUD.main.session.world.players.solo.mats);await page.locator('[data-act=buy0]').click();assert.equal(await page.evaluate(()=>SPUD.main.session.world.players.solo.mats),mats-30);
  await page.reload();await page.waitForFunction(()=>SPUD.main.mode==='shop');assert.deepEqual(await page.evaluate(()=>SPUD.main.session.world.players.solo.weapons),[['shield',6],['shield',1]]);assert.equal(await page.evaluate(()=>SPUD.sim.effectiveStats(SPUD.main.session.world.players.solo).armor),11);
  await page.locator('[data-act=ready]').click();await page.waitForFunction(()=>SPUD.main.mode==='wave');
  const matrix=await page.evaluate(()=>{
   window.pauseRAF=true;const S=SPUD.sim,D=SPUD.data;let count=0,maxError=0,boreError=0;const canvas=document.createElement('canvas');canvas.style.width='800px';canvas.style.height='600px';document.body.append(canvas);const r=new SPUD.render.Renderer(canvas),c=r.c,original=c.drawImage.bind(c);let draws=[];
   c.drawImage=(im,...args)=>{if(im.src?.includes('weapon_'))draws.push({im,args,m:c.getTransform()});return original(im,...args);};
   const ids=['pistol','smg','shotgun','rocket','potato_cannon','crossbow','laser','flamethrower'];
   for(const id of ids)for(let tier=1;tier<=6;tier++)for(const angle of [0,Math.PI/4,Math.PI/2,Math.PI,-Math.PI/2,-3*Math.PI/4]){
    const w=S.createWorld({players:{hero:{char:'basic',weapons:Array.from({length:6},()=>[id,tier])}}}),p=w.players.hero;const art=D.weapons[id].art[Math.min(4,tier)-1];
    r.effects.motions.clear();for(let slot=0;slot<6;slot++)r.effects.motions.set('hero:'+slot,{angle,at:1000,action:'projectile',reach:0});
    draws=[];r.effects.shake=0;r.draw(w,'hero',1000);
    const image=SPUD.render.images['weapon_'+id+(tier===1?'':'_t'+Math.min(4,tier))];const selected=draws.filter(d=>d.im===image);if(selected.length!==(tier===1?6:12))throw Error(id+' draw count '+selected.length);
    for(let slot=0;slot<6;slot++){
     const draw=selected[slot*(tier===1?1:2)],pose=S.weaponPose(p,id,slot,angle,tier),[x,y,sz]=draw.args;const point=(px,py)=>draw.m.transformPoint(new DOMPoint(x+px/256*sz,y+py/256*sz));
     const muzzle=point(...art.muzzle),ex=(pose.muzzleX-r.cam.x)*r.zoom*r.dpr,ey=(pose.muzzleY-r.cam.y)*r.zoom*r.dpr;maxError=Math.max(maxError,Math.hypot(muzzle.x-ex,muzzle.y-ey));
     const back=point(art.muzzle[0]-20*Math.cos(art.axis),art.muzzle[1]-20*Math.sin(art.axis)),a=Math.atan2(muzzle.y-back.y,muzzle.x-back.x);boreError=Math.max(boreError,Math.abs(Math.atan2(Math.sin(a-angle),Math.cos(a-angle))));count++;
    }
   }
   const decoded=Object.entries(SPUD.render.images).filter(([id])=>/weapon_(stick|shield)/.test(id)).map(([id,im])=>{const q=document.createElement('canvas');q.width=q.height=256;const qx=q.getContext('2d');qx.drawImage(im,0,0);const data=qx.getImageData(0,0,256,256).data;return {id,pixels:Array.from({length:256*256},(_,i)=>data[i*4+3]).filter(v=>v>200).length};});canvas.remove();return {count,maxError,boreError,decoded};
  });
  assert.equal(matrix.count,1728);assert.ok(matrix.maxError<1e-3,JSON.stringify(matrix));assert.ok(matrix.boreError<1e-6);assert.equal(matrix.decoded.length,8);assert.ok(matrix.decoded.every(i=>i.pixels>3000));report.rasterMatrices+=matrix.count;
  report.viewports.push({width,height,rects,panel,pref,matrix});await ctx.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.ads,[]);report.passed=true;
}finally{await browser.close();console.log(JSON.stringify(report,null,2));}
