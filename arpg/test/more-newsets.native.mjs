// Fresh isolated ordinary-entry fixtures only; no screenshots, live saves, runtime world edits or network mutations.
// ARPG_BASE_URL=https://game.cocy.io ARPG_NEWSETS_EVIDENCE=/absolute/evidence.json node arpg/test/more-newsets.native.mjs
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave,SAVE_KEY} from '../js/meta/save.js';
import {ITEMS,RECIPES,instance,equip,capacity} from '../js/meta/items.js';
import {deriveMods,equippedSets} from '../js/meta/stats.js';
import {compareItems} from '../js/meta/compare.js';
import {trained} from './fixtures/trained.js';
import {noteMaterials,recipeRevealed} from '../js/meta/recipe-discovery.js';
import {forgeRecipeSet} from '../js/ui/hub.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const port=Number(process.env.ARPG_NEWSETS_PORT||8978),remote=!!process.env.ARPG_BASE_URL,base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const out=process.env.ARPG_NEWSETS_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-more-sets-native.json';
const report={status:'RUNNING',head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),base,localOnly:!remote,rows:[],sourceBinding:{},errors:[],networkMutations:[],screenshots:0,existingUserSessions:0,worldWrites:0,fixtureUse:'Synthetic valid saves seeded before ordinary entry in fresh isolated contexts; not real player progress.'};
const pairs=[['hunter','hunter_bow','leather_vest'],['ossuary','ossuary_maul','ossuary_plate'],['soulfire','soulfire_wand','shroud_robe'],['soulfire','gravekeeper_staff','shroud_robe'],['dragon','dragonfang_blade','dragon_scale_armor']];
const fixture=(weapon,body)=>{let s=trained(createSave({name:'Set test',answers:[0,0,0,0,0],createdAt:1}),30);s.stats.str=100;s.statPoints-=55;s.gold=10000;s.stacks=Object.fromEntries(Object.entries(ITEMS).filter(([,d])=>d.kind==='material').map(([k])=>[k,1]));s=noteMaterials(s);s.stacks={};s.items.push(instance('set-weapon',weapon,1,[]),instance('set-body',body,1,[]));s.equipped.weapon='set-weapon';assert.ok(validateSave(s));return s;};
let browser,server;
try{
 if(!remote){server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(server.exitCode,null);}
 const html=await(await fetch(base+'/arpg/')).text(),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const path of ['arpg/js/content/equipment-sets.js','arpg/js/meta/items.js','arpg/js/meta/stats.js','arpg/js/meta/compare.js','arpg/js/ui/hub.js']){const url=new URL(map['./'+path.slice(5)],base+'/arpg/'),response=await fetch(url),actual=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);assert.deepEqual(actual,await readFile(root+'/'+path),'served source '+path);report.sourceBinding[path]={url:url.href,bytes:actual.length,sha256:createHash('sha256').update(actual).digest('hex')};}
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const width of [1280,390])for(const[id,weapon,body]of pairs){const mobile=width===390,seed=fixture(weapon,body),originalBody=seed.equipped.body,active=equip(seed,'set-body'),context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile});
 await context.addInitScript(({key,seed})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(seed));window.__setWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){window.__setWrites.push(k);return set.call(this,k,v)};},{key:SAVE_KEY,seed});
 await context.route('**/*',route=>{const r=route.request(),url=new URL(r.url());if(url.origin!==new URL(base).origin)return route.abort();if(!['GET','HEAD'].includes(r.method())){report.networkMutations.push(r.url());return route.abort();}return route.continue();});
 const page=await context.newPage(),requests=new Set();page.setDefaultTimeout(15000);page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>requests.add(r.url()));
 const press=async selector=>{const n=page.locator(selector).first();assert.ok(await n.isVisible(),selector);await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
 const state=()=>page.evaluate(key=>({save:JSON.parse(localStorage.getItem(key)),world:window.__arpg.world,writes:window.__setWrites.filter(k=>k.startsWith('arpg.save.'))}),SAVE_KEY);
 const sets=()=>page.locator(`p[data-set="${id}"]`).first();
 const fit=async()=>{const r=await page.evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,dialogs:[...document.querySelectorAll('dialog[open]')].map(d=>({width:d.clientWidth,scroll:d.scrollWidth}))}));assert.ok(r.width<=r.viewport);for(const d of r.dialogs)assert.ok(d.scroll<=d.width);return r;};
 await page.goto(base+'/arpg/',{waitUntil:'domcontentloaded'});await press('[data-action="choose-human"]');await page.waitForSelector('.inn-fire');assert.deepEqual((await state()).save,seed);assert.equal((await state()).writes.length,0);assert.equal((await state()).world,null);
 await press('[data-action="bag"]');assert.match(await sets().innerText(),/1\/2.*비활성/);await press('[data-action="socket"][data-slot="body"]');await press('[data-action="open-item"][data-uid="set-body"]');assert.match(await sets().innerText(),/1\/2.*비활성/);
 const expected=compareItems(seed.items.find(i=>i.uid===originalBody),seed.items.find(i=>i.uid==='set-body'),seed),lines={};for(const key of ['attack','maxHp','totalAc','capacity','moveSpeed','manaRegen']){const n=page.locator(`[data-line="${key}"]`).first(),line=expected.lines.find(l=>l.key===key);if(!await n.count()){assert.equal(line.delta,0,'only unchanged non-primary rows may be omitted');continue;}assert.equal(Number(await n.getAttribute('data-from')),line.from);assert.equal(Number(await n.getAttribute('data-to')),line.to);lines[key]={from:line.from,to:line.to};}
 assert.deepEqual((await state()).save,seed);const geometry=[await fit()];await press('[data-action="equip"][data-uid="set-body"]');assert.deepEqual((await state()).save,active);assert.match(await sets().innerText(),/2\/2.*활성/);assert.doesNotMatch(await sets().innerText(),/비활성/);assert.equal((await state()).world,null);assert.equal(capacity(active),deriveMods(active).capacity);
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForSelector('.inn-fire');await press('[data-action="bag"]');assert.match(await sets().innerText(),/2\/2.*활성/);assert.deepEqual((await state()).save,active);
 await press('[data-action="socket"][data-slot="body"]');await press(`[data-action="open-item"][data-uid="${originalBody}"]`);await press(`[data-action="equip"][data-uid="${originalBody}"]`);const restored=equip(active,originalBody);assert.deepEqual((await state()).save,restored);assert.match(await sets().innerText(),/1\/2.*비활성/);geometry.push(await fit());
 await press('[data-action="inn"]');await press('[data-action="forge"]');await press('[data-action="forge-tab"][data-tab="craft"]');await press('[data-action="forge-recipe-mode"][data-mode="all"]');
 const revealed=Object.keys(RECIPES).filter(k=>recipeRevealed(restored,k)),setIds=[...new Set(revealed.map(k=>forgeRecipeSet(k)?.id).filter(Boolean))];assert.deepEqual(await page.locator('[data-action="forge-recipe-set"]').evaluateAll(ns=>ns.map(n=>n.dataset.set)),['all','none',...setIds.map(x=>'set:'+x)]);assert.ok(!setIds.includes('dragon'),'drop-only dragon has no forge option');
 for(const group of ['hunter','ossuary','soulfire']){assert.ok(setIds.includes(group));await press(`[data-action="forge-recipe-set"][data-set="set:${group}"]`);const ids=await page.locator('.craft-list [data-action="craft"]').evaluateAll(ns=>ns.map(n=>n.dataset.id));assert.deepEqual(ids,revealed.filter(k=>ITEMS[k].setId===group));}
 assert.deepEqual((await state()).save,restored);assert.equal((await state()).world,null);geometry.push(await fit());for(const[path,binding]of Object.entries(report.sourceBinding))assert.ok(requests.has(binding.url),'ordinary entry requested '+path);
 report.rows.push({width,id,weapon,input:mobile?'native touch':'keyboard Enter',inactiveActiveReloadRemove:true,comparisonExact:lines,capacity:deriveMods(active).capacity,setCount:equippedSets(active).find(x=>x.id===id).count,forgeRevealedOnly:true,dragonDropOnly:true,geometry});await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkMutations,[]);report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();server?.kill();await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:report.rows.length,out,failure:report.failure}));}
