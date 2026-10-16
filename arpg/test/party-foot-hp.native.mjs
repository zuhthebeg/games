import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const base=process.env.ARPG_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8892';
const server=(process.env.ARPG_BASE_URL || process.env.BASE_URL) ? null : spawn('python3',['-m','http.server','8892','--bind','127.0.0.1'],{cwd:new URL('../../',import.meta.url).pathname,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox']});
const errors=[];
try {for(let i=0;i<30;i++){try{if((await fetch(`${base}/arpg/`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
for(const width of [1280,390]){
 const page=await browser.newPage({viewport:{width,height:844}});page.on('pageerror',e=>errors.push(e.message));await page.goto(`${base}/arpg/test/feel-fixture.html`);
 const result=await page.evaluate(async()=>{
 const [{Application},{ArenaRenderer},{createWorld,addPlayer,spawnMonster}]=await Promise.all([import('../vendor/pixi-8.22.0.min.mjs'),import('../js/render/renderer.js'),import('../js/sim/world.js')]);
 const app=new Application();await app.init({width:innerWidth,height:844,preference:'webgl'});document.body.append(app.canvas);
 const world=createWorld();const local=addPlayer(world,{pid:'host',x:500,y:400}),ally=addPlayer(world,{pid:'guest',x:550,y:400});ally.hp=42;spawnMonster(world,'ghoul',650,400);
 const renderer=new ArenaRenderer(app);renderer.snapshot(world);renderer.render(world,.5,1/60);
 const view=renderer.views.get(ally.id),foot=view.footHp;
 if(!foot)return {exists:false};
 const initial=foot.label.text==='42/100'&&foot.container.visible&&foot.container.y>view.y+ally.r*.48;
 const screenSize=foot.label.style.fontSize*foot.container.scale.x*renderer.scale;
 const node=foot.label;ally.x+=40;ally.hp=72;renderer.render(world,.5,1/60);
 const follow=foot.container.x===view.x&&foot.container.y>view.y&&foot.label===node&&foot.label.text==='72/100';
 ally.dead=true;ally.hp=0;renderer.render(world,.5,1/60);const dead=foot.label.text.includes('쓰러짐')&&foot.label.text.includes('0/100');
 const onlyAlly=!renderer.views.get(local.id).footHp.container.visible&&[...renderer.views.values()].filter(v=>v.footHp?.container.visible).length===1;
 world.entities=[local];renderer.render(world,1,1/60);const removed=!renderer.views.has(ally.id)&&foot.container.destroyed;
 app.destroy(true,{children:true});return {exists:true,initial,follow,dead,onlyAlly,removed,readable:screenSize>=11};
 });assert.deepEqual(result,{exists:true,initial:true,follow:true,dead:true,onlyAlly:true,removed:true,readable:true});console.log(`${width} foot HP PASS`);await page.close();}
assert.deepEqual(errors,[]);
}finally{await browser.close();server?.kill();}
