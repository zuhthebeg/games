// Fresh isolated profiles: seed validated synthetic saves before boot; only native UI input thereafter.
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn,execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createSave,validateSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {trained} from './fixtures/trained.js';
import {BOOKS} from '../js/meta/skills.js';
import {ABILITIES} from '../js/content/combat.js';
import {skillWeaponNames} from '../js/ui/skill-view.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=8995,base=process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`;
const out=process.env.ARPG_ACADEMY_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-academy-local.json';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const report={status:'RUNNING',base,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rows:[],errors:[],worldWrites:0,screenshots:0};
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
try{
 for(let n=0;n<30;n++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 for(const width of [1280,390])for(const kind of ['human','skeleton','evolved']){
  const bone=kind!=='human',s=trained(bone?createSkeletonSave({lineage:'skeleton_knight',name:'academy',answers:[0,0,0,0,0],createdAt:1}):createSave({name:'academy',answers:[0,0,0,0,0],createdAt:1}),30);s.gold=10000;if(kind==='evolved')s.permanentDeathKnight=true;
  const wrong=Object.keys(BOOKS).filter(id=>bone?ABILITIES[id].requiresHuman:ABILITIES[id].requiresSkeleton);s.learned=[...wrong];s.loadout=[wrong[0],null,null];assert.ok(validateSave(s));
  const ctx=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390,reducedMotion:'reduce'});
  await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));await ctx.addInitScript(({s,bone})=>{if(location.protocol!=='http:'&&location.protocol!=='https:')return;if(localStorage.getItem('academy-seeded'))return;localStorage.setItem(bone?'arpg.save.v1.slots.skeleton_knight':'arpg.save.v1',JSON.stringify(s));localStorage.setItem('academy-seeded','1');},{s,bone});
  const page=await ctx.newPage();page.on('pageerror',e=>report.errors.push(e.message));page.setDefaultTimeout(15000);
  const press=async selector=>{const el=page.locator(selector).first();await el.scrollIntoViewIfNeeded();if(width===390)await el.tap();else{await el.focus();await page.keyboard.press('Enter');}};
  await page.goto(base+'/arpg/?character='+(bone?'skeleton_knight':'human'));await page.locator('#inn-name').waitFor();await press('[data-action="trainer"]');
  const row={width,kind,schools:[],status:'RUNNING'};report.rows.push(row);
  for(const family of ['blade','focus','bow']){
   await press(`[data-action="academy-tab"][data-family="${family}"]`);
   const cards=await page.locator('.academy-panel .skill-card').evaluateAll(ns=>ns.map(n=>({id:n.dataset.skill,label:n.querySelector('.skill-weapons')?.textContent,accessible:n.querySelector('.skill-weapons')?.getAttribute('aria-label')})));
   assert.ok(cards.length);for(const c of cards){assert.ok(!wrong.includes(c.id));assert.equal(c.label,skillWeaponNames(c.id,s));assert.equal(c.accessible,'사용 가능 무기: '+c.label);await page.locator(`[data-skill="${c.id}"] .skill-weapons`).scrollIntoViewIfNeeded();assert.equal(await page.locator(`[data-skill="${c.id}"] .skill-weapons`).evaluate(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.left>=0&&r.right<=innerWidth+1&&n.scrollWidth<=n.clientWidth+1;}),true,c.id);}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);row.schools.push({family,cards});
  }
  await press('[data-action="academy-tab"][data-family="blade"]');const before=await page.evaluate(()=>({gold:__arpg.save.gold,learned:[...__arpg.save.learned]}));assert.deepEqual(before,{gold:s.gold,learned:s.learned});
  await press('[data-action="skill-book-info"][data-id="berserk"]');assert.equal(await page.locator('dialog .skill-weapons').innerText(),bone?'모든 무기':'양손 검 · 양손 둔기');await press('[data-action="close-sheet"]');
  await press('[data-action="learn-skill"][data-id="berserk"]');const after=await page.evaluate(()=>({gold:__arpg.save.gold,learned:[...__arpg.save.learned],loadout:[...__arpg.save.loadout]}));assert.equal(after.gold,s.gold-BOOKS.berserk.price);assert.deepEqual(after.learned,[...wrong,'berserk']);assert.ok(after.loadout.includes('berserk'));row.after=after;await press('[data-action="inn"]');await press('[data-action="character"]');await press('[data-action="character-tab"][data-tab="skills"]');row.characterSkills=await page.locator('.skill-card').evaluateAll(ns=>ns.map(n=>n.dataset.id||n.dataset.skill));assert.ok(row.characterSkills.every(id=>!wrong.includes(id)));assert.ok(row.characterSkills.includes('berserk'));row.status='PASS';await ctx.close();console.log(JSON.stringify({width,kind,status:'PASS'}));
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2));await browser.close();server?.kill();}
