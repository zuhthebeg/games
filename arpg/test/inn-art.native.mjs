// Real ordinary-entry browser journey. Fresh contexts only; no screenshots or world overrides.
// Replay after parent publication:
// ARPG_BASE_URL=https://game.cocy.io ARPG_INN_EVIDENCE=/absolute/evidence.json node arpg/test/inn-art.native.mjs
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave,SAVE_KEY} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {SLOT_SAVE_KEYS} from '../js/meta/character-slots.js';
import {noteMaterials} from '../js/meta/recipe-discovery.js';
import {craft,dismantle} from '../js/meta/items.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const remote=!!process.env.ARPG_BASE_URL,port=Number(process.env.ARPG_INN_PORT||8958);
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const out=process.env.ARPG_INN_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-inn-art-local.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={status:'RUNNING',base,localOnly:!remote,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rows:[],errors:[],networkMutations:[],screenshots:0,existingUserSessions:0,worldWrites:0,sourceBinding:{}};
let browser,server;
const fresh=(lineage)=>{let s=lineage==='human'?createSave({name:'Inn art',answers:[0,0,0,0,0],createdAt:1}):createSkeletonSave({lineage:'skeleton_knight',name:'Inn bones',answers:[0,0,0,0,0],createdAt:1});s.gold=1000;s.stacks={...s.stacks,scrap:100,wood:100,hide:100,fang:100};s=noteMaterials(s);assert.equal(validateSave(s),true);return s;};
try{
 if(!remote){server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(server.exitCode,null,'unique local server port');}
 const html=await(await fetch(base+'/arpg/')).text(),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const path of ['arpg/js/ui/hub.js','arpg/css/game.css',...['inn-room','hearth','storage','merchant','smith','supplies','bag','academy','map'].map(s=>`arpg/assets/inn/${s}.webp`)]){
  const mapped=path.endsWith('.js')?map['./'+path.slice(5)]:path.endsWith('.css')?html.match(/href="([^"<>]*css\/game\.css[^"<>]*)"/)[1]:'/'+path;
  const url=new URL(mapped,base+'/arpg/'),r=await fetch(url),actual=Buffer.from(await r.arrayBuffer()),local=await readFile(root+'/'+path);assert.equal(r.status,200);assert.deepEqual(actual,local,'served source bytes '+path);report.sourceBinding[path]={url:url.href,bytes:actual.length,sha256:sha(actual)};
 }
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const width of [1280,390])for(const lineage of ['human','skeleton_knight']){
  const mobile=width===390,seed=fresh(lineage),human=fresh('human'),key=SLOT_SAVE_KEYS[lineage];
  const context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:'no-preference'});
  await context.addInitScript(({key,seed,human,humanKey})=>{localStorage.setItem(humanKey,JSON.stringify(human));localStorage.setItem(key,JSON.stringify(seed));window.__innStorageWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){window.__innStorageWrites.push(k);return set.call(this,k,v)};},{key,seed,human,humanKey:SAVE_KEY});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==new URL(base).origin)return route.abort();if(!['GET','HEAD'].includes(req.method())){report.networkMutations.push(req.url());return route.abort();}return route.continue();});
  const page=await context.newPage(),requests=new Set();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>requests.add(r.url()));page.setDefaultTimeout(20000);
  const press=async selector=>{const n=page.locator(selector).first();assert.equal(await n.isVisible(),true,'visible native input '+selector);await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  const state=()=>page.evaluate(key=>({save:JSON.parse(localStorage.getItem(key)),human:localStorage.getItem('arpg.save.v1'),world:window.__arpg.world,writes:window.__innStorageWrites.filter(k=>k.startsWith('arpg.save.'))}),key);
  const back=()=>press('[data-action="inn"]');
  const layout=async()=>page.evaluate(()=>{const content=document.querySelector('.inn-shell>.content'),buttons=[...document.querySelectorAll('.npc-grid button,.action-footer [data-action="board"]')];return {overflow:document.documentElement.scrollWidth>innerWidth||content.scrollWidth>content.clientWidth,buttons:buttons.map(b=>{const r=b.getBoundingClientRect(),label=b.querySelector('strong,span'),range=document.createRange();range.selectNodeContents(label);const t=range.getBoundingClientRect(),style=getComputedStyle(label);return {action:b.dataset.action,w:r.width,h:r.height,inkW:t.width,inkH:t.height,clip:t.left<r.left-1||t.right>r.right+1||t.top<r.top-1||t.bottom>r.bottom+1,color:style.color,opacity:style.opacity,text:label.textContent};})};});
  await page.goto(base+'/arpg/',{waitUntil:'domcontentloaded'});await press(`[data-action="choose-${lineage==='human'?'human':'skeleton'}"]`);await page.waitForSelector('.inn-fire');
  assert.equal(await page.locator('[data-action="craft-hub"]').count(),0);assert.equal(await page.locator('.npc-grid button').count(),6);assert.equal(await page.locator('#meta-screen').getAttribute('data-page'),'inn');
  assert.equal(await page.evaluate(()=>document.body.dataset.theme||'human'),lineage==='human'?'human':'graveyard');
  assert.equal(await page.locator('.inn-recovery,.content>.p2-weight').count(),0);
  const fit=await page.evaluate(()=>{const c=document.querySelector('.inn-shell>.content');return {height:c.clientHeight,scroll:c.scrollHeight};});
  if(lineage==='human')assert.ok(fit.scroll<=fit.height+1,JSON.stringify(fit));
  const baseline=await state();assert.deepEqual(baseline.save,seed);assert.equal(baseline.world,null);assert.equal(baseline.writes.length,0);
  const images=await page.locator('img[src*="assets/inn/"]').evaluateAll(async ns=>{const rows=[];for(const n of ns){await n.decode();const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const cx=canvas.getContext('2d');cx.drawImage(n,0,0,32,32);const px=cx.getImageData(0,0,32,32).data;let min=255,max=0,opaque=0;for(let i=0;i<px.length;i+=4){const v=px[i]+px[i+1]+px[i+2];min=Math.min(min,v);max=Math.max(max,v);if(px[i+3]>0)opaque++;}rows.push({src:n.getAttribute('src'),w:n.naturalWidth,h:n.naturalHeight,variation:max-min,opaque,alt:n.alt});}return rows;});
  assert.equal(images.length,9);for(const im of images){assert.ok(im.w>=160&&im.h>=160);assert.ok(im.variation>30&&im.opaque>900);assert.equal(im.alt,'');}
  const geometry=await layout();assert.equal(geometry.overflow,false);assert.equal(geometry.buttons.length,7);for(const b of geometry.buttons){assert.ok(b.w>=44&&b.h>=44,b.action+' touch area');assert.ok(b.inkW>0&&b.inkH>0&&!b.clip,b.action+' visible nonclipped label ink');assert.equal(b.opacity,'1');}
  const sample=()=>page.locator('.inn-flame').evaluateAll(ns=>ns.map(n=>({transform:getComputedStyle(n).transform,opacity:getComputedStyle(n).opacity,animations:n.getAnimations().map(a=>({time:a.currentTime,state:a.playState}))})));
  assert.equal(await page.locator('.inn-flame').count(),3);const fireA=await sample();await page.waitForTimeout(180);const fireB=await sample();assert.notDeepEqual(fireA,fireB,'normal fire advances');
  // Controlled Page Visibility API signal tests the actual installed event listener,
  // not application/world state. Headless Chromium keeps real targets visible.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  assert.equal(await page.locator('#meta-screen').getAttribute('data-inn-fire-paused'),'true');await page.waitForTimeout(50);const hiddenA=await sample();await page.waitForTimeout(180);assert.deepEqual(await sample(),hiddenA,'hidden-document handler pauses time');
  await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});await page.waitForTimeout(120);assert.notDeepEqual(await sample(),hiddenA,'foreground handler resumes');
  await page.emulateMedia({reducedMotion:'reduce'});const reducedA=await sample();await page.waitForTimeout(180);assert.deepEqual(await sample(),reducedA,'reduced motion static burning frame');assert.ok(reducedA.every(n=>Number(n.opacity)>.6&&n.animations.length===0));await page.emulateMedia({reducedMotion:'no-preference'});
  const pointer=await page.locator('.inn-fire').evaluate(n=>({own:getComputedStyle(n).pointerEvents,children:[...n.children].every(c=>getComputedStyle(c).pointerEvents==='none')}));assert.equal(pointer.own,'none');assert.equal(pointer.children,true);
  const routes=[];for(const action of ['inventory','bag','merchant','shop','trainer','board']){await press(`[data-action="${action}"]`);assert.equal(await page.locator('#meta-screen').getAttribute('data-page'),action==='trainer'?'trainer':action==='shop'?'shop':action==='board'?'board':action);routes.push(action);await back();}
  assert.deepEqual(await state(),baseline,'facility navigation no spend or writes');await press('[data-action="forge"]');await press('[data-action="forge-tab"][data-tab="salvage"]');assert.equal(await page.locator('[data-forge-tab="salvage"]').isVisible(),true);
  const craftButton=page.locator('[data-action="craft"][data-id="iron_sword"]');assert.equal(await craftButton.isDisabled(),false);await press('[data-action="craft"][data-id="iron_sword"]');const made=await state(),expected=craft(seed,'iron_sword');assert.deepEqual(made.save,expected);assert.equal(made.world,null);assert.equal(made.writes.length,1);const uid=made.save.items.at(-1).uid;
  await press('[data-action="forge-tab"][data-tab="salvage"]');await press(`.forge-salvage [data-action="dismantle"][data-uid="${uid}"]`);await press('[data-action="confirm-dismantle"]');const salvaged=await state();assert.deepEqual(salvaged.save,dismantle(expected,uid));assert.equal(salvaged.writes.length,2);assert.equal(salvaged.world,null);
  if(lineage==='skeleton_knight')assert.equal(salvaged.human,baseline.human,'other lineage raw bytes preserved');
  await back();for(const [path,binding]of Object.entries(report.sourceBinding))assert.ok(requests.has(binding.url),`actual ordinary page requested ${path}`);
  report.rows.push({width,lineage,url:page.url(),input:mobile?'native touch tap':'native keyboard Enter',images,geometry,routes,craftPrice:seed.gold-expected.gold,craftAndSalvageExactModel:true,otherLineageUnchanged:true,worldWrites:0,normalFireAdvanced:true,reducedMotionStaticBurning:true,hiddenHandlerPaused:true,hiddenSignalMethod:'controlled document.hidden + visibilitychange in fresh native page; headless real background visibility unavailable',pointer});await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkMutations,[]);report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();server?.kill();await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:report.rows.length,out,failure:report.failure}));}
