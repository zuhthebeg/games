// Synthetic valid saves are installed before boot; all learning/equipping/casting uses native input.
// No screenshots, private profiles, live-world writes or injected combat inputs.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave} from '../js/meta/save.js';
import {trained} from './fixtures/trained.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=8987;
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const bow=process.env.ARPG_BOW_FLOW==='1';
const pairs=bow ? [['rain_arrow',0],['spinning_shot',1]] : [['meteor',0],['firewall',1]];
const output=process.env.ARPG_FIRE_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-meteor-firewall-native.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
const report={status:'RUNNING',base,rows:[],errors:[],sourceBinding:{},screenshots:0,worldWrites:0,privateProfiles:0,transport:'BroadcastChannel loopback (not production relay)',family:bow?'bow':'focus'};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
let lastPage;
function save(){const s=trained(createSave({name:'Fire',answers:[0,0,0,0,0],weapon:bow?'bow':'focus',createdAt:123}));s.gold=2000;s.autoUse={potion:false,hp:50,mp:50,recall:false};assert.ok(validateSave(s));return s;}
async function setup(width,urls=['?dev=1']){
 const mobile=width===390,ctx=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile,reducedMotion:process.env.ARPG_FIRE_NORMAL==='1'?'no-preference':'reduce'});const pages=[];
 await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));
 await ctx.addInitScript(s=>{if(!localStorage.getItem('fire-fixture')){localStorage.setItem('arpg.save.v1',JSON.stringify(s));localStorage.setItem('fire-fixture','1');localStorage.setItem('arpg.autoAttack','0');}},save());
 for(const url of urls){const page=await ctx.newPage();lastPage=page;page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));await page.goto(base+'/arpg/'+url);await page.waitForFunction(()=>window.__arpg);await page.locator('#inn-name').waitFor();
 const press=async selector=>{await page.bringToFront();const node=page.locator(selector).first();await node.scrollIntoViewIfNeeded();if(mobile)await node.tap();else{await node.focus();await page.keyboard.press('Enter');}};
 pages.push({page,press});}
 return{ctx,pages};
}
async function learn(p){await p.press('[data-action="trainer"]');for(const[id,slot]of pairs){await p.page.locator(`[data-skill="${id}"]`).waitFor();await p.press(`[data-action="learn-skill"][data-id="${id}"]`);await p.press(`[data-action="skill-slot"][data-id="${id}"][data-slot="${slot}"]`);assert.equal(await p.page.locator(`[data-action="skill-slot"][data-id="${id}"][data-slot="${slot}"]`).getAttribute('aria-pressed'),'true');}await p.press('[data-action="inn"]');const s=await p.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.save)));assert.ok(validateSave(s));assert.equal(s.gold,bow?1420:1340);assert.deepEqual(s.loadout.slice(0,2),pairs.map(([id])=>id));}
async function board(p){await p.press('[data-action="board"]');await p.press('[data-action="sortie"][data-stage="S1"]');}
async function casts(p,host=p){
 for(const[id,selector]of pairs.map(([id,slot])=>[id,slot===0?'#skill':'#skill2'])){
  await p.page.waitForFunction(selector=>!document.querySelector(selector)?.disabled,selector);const before=await p.page.evaluate(()=>__arpg.world.entities[0].mp);await p.press(selector);
  await host.page.waitForFunction(id=>(__arpg.world.zones?.some(z=>z.abilityId===id)||__arpg.world.projectiles.some(z=>z.abilityId===id)),id,{polling:50});
  const active=await host.page.evaluate(id=>({tick:__arpg.world.tick,zone:(__arpg.world.zones?.find(z=>z.abilityId===id)||__arpg.world.projectiles.find(z=>z.abilityId===id)),owner:__arpg.world.entities.find(e=>e.id===(__arpg.world.zones?.find(z=>z.abilityId===id)||__arpg.world.projectiles.find(z=>z.abilityId===id)).ownerId)}),id);
  assert.equal(active.owner.pid,host===p?active.owner.pid:'guest');
  await p.page.waitForFunction(id=>(__arpg.world.entities[0].cds[id]||0)>0,id);
  const after=await p.page.evaluate(()=>__arpg.world.entities[0].mp);assert.ok(after<before-15,`${id} cost paid`);
  if(host!==p){await p.page.waitForFunction(id=>(__arpg.world.zones?.some(z=>z.abilityId===id)||__arpg.world.projectiles.some(z=>z.abilityId===id)),id,{polling:50});assert.equal(await p.page.evaluate(()=>__arpg.multi.ownsSim),false);}
  report.rows.push({case:'native cast authoritative zone/projectile + MP/CD',width:await p.page.evaluate(()=>innerWidth),id,role:host===p?'solo':'guest',active});
 }
}
try{
 for(let i=0;i<60;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await pause(100);}
 const files=[...new Set([...execFileSync('git',['diff','817eada','--name-only'],{cwd:root,encoding:'utf8'}).trim().split('\n'), 'arpg/js/sim/spell-zones.js','arpg/js/render/spell-zones.js'])].filter(f=>f.startsWith('arpg/js/')&&f.endsWith('.js'));
 for(const f of files){const local=await readFile(root+'/'+f),served=Buffer.from(await(await fetch(base+'/'+f,{cache:'no-store'})).arrayBuffer());assert.deepEqual(served,local,f);report.sourceBinding[f]=createHash('sha256').update(local).digest('hex');}
 for(const width of [1280,390]){
  const{ctx,pages:[p]}=await setup(width);await learn(p);await board(p);await p.press('#sortie-confirm');await p.page.waitForSelector(`#skill [data-skill-icon="${pairs[0][0]}"]`);await casts(p);assert.equal(await p.page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await ctx.close();console.log('native solo learn/equip/cast PASS',width);
 }
 for(const width of [1280,390]){
  const{ctx,pages:[host,guest]}=await setup(width,['?dev=1&coopTest=host','?dev=1&coopTest=guest']);await learn(host);
  // Both pages share synthetic character storage; reload guest before its ordinary UI launch.
  await guest.page.reload();await guest.page.locator('#inn-name').waitFor();for(const p of [host,guest]){await board(p);await p.press('[data-action="coop"]');}
  await host.page.waitForFunction(()=>__arpg.multi?.phase==='running');await guest.page.waitForFunction(()=>__arpg.world?.entities.length>=2);await casts(guest,host);assert.equal(await guest.page.evaluate(()=>__arpg.multi.ownsSim),false);await ctx.close();console.log('native two-client guest cast PASS',width);
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.failure=error.stack;if(lastPage&&!lastPage.isClosed())report.diagnostic=await lastPage.evaluate(()=>({world:__arpg.world,text:document.querySelector('#meta-screen')?.innerText,boot:document.querySelector('#boot-error')?.textContent})).catch(()=>null);throw error;}finally{await writeFile(output,JSON.stringify(report,null,2)+'\n');await browser.close();server?.kill();}
