// Isolated native Pixi render; no saves/world injection. Actual gameplay QA belongs to parent.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const repo=process.cwd(),out=repo+'/arpg/tools/art/player-death-knight/review/gravitas',server=spawn('python3',['-m','http.server','8927','--bind','127.0.0.1'],{cwd:repo,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
const rows=[];
try{for(const width of [1280,390]){
 const ctx=await browser.newContext({viewport:{width,height:width===390?844:800},hasTouch:width===390,isMobile:width===390});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8927/');
 await page.evaluate(()=>{let m=document.querySelector('meta[name=viewport]');if(!m){m=document.createElement('meta');m.name='viewport';document.head.append(m)}m.content='width=device-width,initial-scale=1';});
 const r=await page.evaluate(async()=>{
  const {Application,Assets,Sprite,Graphics,Container}=await import('/arpg/vendor/pixi-8.22.0.min.mjs');
  document.body.innerHTML='';document.body.style.margin='0';const app=new Application();await app.init({width:innerWidth,height:innerHeight,background:0x26302d,preference:'webgl',resolution:1});document.body.append(app.canvas);
  const kit=await (await fetch('/arpg/assets/sprites/player-death-knight/kit-descriptor.json')).json();const animations={};
  for(const file of kit.sheets){const sh=await Assets.load('/arpg/assets/sprites/player-death-knight/'+file);Object.assign(animations,sh.animations)}
  const directions=['E','SE','S','SW','W','NW','N','NE'],states=['idle','attack','magic'];let tested=0;const bounds=[];
  for(let row=0;row<3;row++)for(let col=0;col<8;col++){
   const state=states[row],di=directions[col],seq=animations[state+'_'+di],frame=state==='idle'?0:6;
   const s=new Sprite(seq[frame]);s.anchor.set(kit.anchor.x,kit.anchor.y);s.scale.set(.5);s.x=innerWidth===390?55+(col%4)*90:100+col*150;s.y=innerWidth===390?90+(row*2+Math.floor(col/4))*110:170+row*220;app.stage.addChild(s);bounds.push({state,di,w:s.width,h:s.height});
   for(const tex of seq){s.texture=tex;app.renderer.render(app.stage);tested++}s.texture=seq[frame];
  }
  app.renderer.render(app.stage);return {tested,groups:Object.keys(animations).length,bounds,renderer:app.renderer.name,canvas:[app.canvas.width,app.canvas.height],simulationWrites:0};
 });assert.equal(r.groups,56);assert.equal(r.tested,312);assert.deepEqual(errors,[]);await page.screenshot({path:out+'/native-'+width+'.png'});rows.push({width,...r,errors,scope:'isolated actual-size native sprite canvas, NOT gameplay scene/shield acceptance'});await ctx.close();
}fs.writeFileSync(out+'/native-proof.json',JSON.stringify({pass:true,rows},null,2));console.log('NATIVE_ART_PASS');}finally{await browser.close();server.kill()}
