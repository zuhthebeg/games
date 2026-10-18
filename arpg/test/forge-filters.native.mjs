// Fresh fixture saves in isolated contexts; no existing user storage/world writes/screenshots.
// ARPG_BASE_URL=https://game.cocy.io ARPG_FORGE_EVIDENCE=/absolute/report.json node arpg/test/forge-filters.native.mjs
import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createSave,validateSave,SAVE_KEY} from '../js/meta/save.js';
import {forgeRecipeSet} from '../js/ui/hub.js';
import {ITEMS,RECIPES,craft} from '../js/meta/items.js';
import {noteMaterials,recipeRevealed} from '../js/meta/recipe-discovery.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const remote=!!process.env.ARPG_BASE_URL,port=Number(process.env.ARPG_FORGE_PORT||8973);
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const out=process.env.ARPG_FORGE_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-forge-filters-native.json';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={status:'RUNNING',base,localOnly:!remote,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rows:[],errors:[],networkMutations:[],sourceBinding:{},screenshots:0,existingUserSessions:0,worldWrites:0,fixtureUse:'Synthetic known saves seeded before ordinary app entry in fresh isolated browser contexts; not live player progress.'};
let browser,server;
const fixture=name=>{
 let save=createSave({name:'Forge test',answers:[0,0,0,0,0],createdAt:1});
 save.gold=name==='goldpoor'?0:1000;save.stacks=name==='undiscovered'?{}:{scrap:8,fang:3,wood:8};save=noteMaterials(save);
 if(name==='history')save.stacks={};assert.equal(validateSave(save),true);return save;
};
const held=(save,key)=>key==='gold'?save.gold:save.stacks[key]||0;
const expected=(save,mode,kind='all')=>Object.keys(RECIPES).filter(id=>recipeRevealed(save,id)&&(kind==='all'||(ITEMS[id].slot?(['weapon','offhand'].includes(ITEMS[id].slot)?ITEMS[id].slot:'armor'):'material')===kind)&&(mode==='all'||(mode==='owned'?Object.keys(RECIPES[id]).some(k=>k!=='gold'&&held(save,k)>0):Object.entries(RECIPES[id]).every(([k,n])=>held(save,k)>=n))));
try{
 if(!remote){server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}assert.equal(server.exitCode,null);}
 const html=await(await fetch(base+'/arpg/')).text(),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const path of ['arpg/js/ui/hub.js','arpg/css/game.css']){
  const mapped=path.endsWith('.js')?map['./'+path.slice(5)]:html.match(/href="([^"<>]*css\/game\.css[^"<>]*)"/)[1],url=new URL(mapped,base+'/arpg/');
  const response=await fetch(url),actual=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200);assert.deepEqual(actual,await readFile(root+'/'+path),'served source bytes '+path);report.sourceBinding[path]={url:url.href,bytes:actual.length,sha256:sha(actual)};
 }
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 for(const width of [1280,390])for(const name of ['balanced','goldpoor','history','undiscovered']){
  const mobile=width===390,seed=fixture(name),context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile});
  await context.addInitScript(({key,seed})=>{localStorage.setItem(key,JSON.stringify(seed));window.__forgeWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){window.__forgeWrites.push(k);return set.call(this,k,v)};},{key:SAVE_KEY,seed});
  await context.route('**/*',route=>{const req=route.request(),url=new URL(req.url());if(url.origin!==new URL(base).origin)return route.abort();if(!['GET','HEAD'].includes(req.method())){report.networkMutations.push(req.url());return route.abort();}return route.continue();});
  const page=await context.newPage(),requests=new Set();page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>requests.add(r.url()));page.setDefaultTimeout(15000);
  const press=async selector=>{const n=page.locator(selector).first();assert.equal(await n.isVisible(),true,selector);await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press('Enter');}};
  const state=()=>page.evaluate(key=>({save:JSON.parse(localStorage.getItem(key)),world:window.__arpg.world,writes:window.__forgeWrites.filter(k=>k.startsWith('arpg.save.'))}),SAVE_KEY);
  const actualIds=()=>page.locator('.craft-list [data-action="craft"]').evaluateAll(ns=>ns.map(n=>n.dataset.id));
  const mode=m=>press(`[data-action="forge-recipe-mode"][data-mode="${m}"]`);
  const set=s=>press(`[data-action="forge-recipe-set"][data-set="${s}"]`);
  const kind=k=>press(`[data-action="forge-recipe-kind"][data-kind="${k}"]`);
  const fit=async()=>{const result=await page.evaluate(()=>{const c=document.querySelector('.inn-shell>.content');return {documentWidth:document.documentElement.scrollWidth,viewport:innerWidth,contentWidth:c.clientWidth,contentScroll:c.scrollWidth,controls:[...document.querySelectorAll('.recipe-filters button')].map(n=>{const r=n.getBoundingClientRect();return {label:n.textContent,w:r.width,h:r.height};})};});assert.ok(result.documentWidth<=result.viewport);assert.ok(result.contentScroll<=result.contentWidth);for(const b of result.controls)assert.ok(b.w>=44&&b.h>=44,b.label);return result;};
  await page.goto(base+'/arpg/',{waitUntil:'domcontentloaded'});await press('[data-action="choose-human"]');await page.waitForSelector('.inn-fire');
  const baseline=await state();assert.deepEqual(baseline.save,seed);assert.equal(baseline.world,null);assert.equal(baseline.writes.length,0);
  await press('[data-action="forge"]');assert.equal(await page.locator('.craft-list').count(),0);await press('[data-action="forge-tab"][data-tab="salvage"]');
  assert.deepEqual(await actualIds(),expected(seed,'craftable'));const defaultCount=(await actualIds()).length;assert.equal(await page.locator('[data-mode="craftable"]').getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.recipe-count').innerText(),new RegExp(`표시 ${defaultCount} / 공개 ${expected(seed,'all').length}`));
  if(!defaultCount){assert.equal(await page.locator('.recipe-empty').isVisible(),true);await press('[data-action="forge-show-all"]');assert.deepEqual(await actualIds(),expected(seed,'all'));}
  await mode('owned');assert.deepEqual(await actualIds(),expected(seed,'owned'));if(name==='history')assert.deepEqual(await actualIds(),[]);
  await mode('all');assert.deepEqual(await actualIds(),expected(seed,'all'));const allCount=(await actualIds()).length;assert.ok(allCount<Object.keys(RECIPES).length,'undiscovered never exposed');
  const kinds=await page.locator('[data-action="forge-recipe-kind"]').evaluateAll(ns=>ns.map(n=>n.dataset.kind));
  for(const k of kinds){await kind(k);assert.deepEqual(await actualIds(),expected(seed,'all',k));}
  await kind('all');
  const revealedSets=new Map(expected(seed,'all').flatMap(id=>{const s=forgeRecipeSet(id);return s?[[`set:${s.id}`,s]]:[]}));
  assert.deepEqual(await page.locator('[data-action="forge-recipe-set"]').evaluateAll(ns=>ns.map(n=>n.dataset.set)),['all','none',...revealedSets.keys()]);
  for(const [value,metadata]of revealedSets){await set(value);assert.deepEqual(await actualIds(),expected(seed,'all').filter(id=>forgeRecipeSet(id)?.id===metadata.id));assert.ok((await page.locator('.recipe-set').allTextContents()).every(text=>text.includes(metadata.name)));}
  await set('none');assert.deepEqual(await actualIds(),expected(seed,'all').filter(id=>!forgeRecipeSet(id)));await set('all');
  await kind('weapon');await mode('craftable');assert.deepEqual(await actualIds(),expected(seed,'craftable','weapon'));
  // Armor is unaffordable for these known fixtures. CTA must clear category AND mode.
  await kind('armor');if(revealedSets.has('set:warden'))await set('set:warden');assert.deepEqual(await actualIds(),[]);await press('[data-action="forge-show-all"]');assert.equal(await page.locator('[data-set="all"]').getAttribute('aria-pressed'),'true');assert.deepEqual(await actualIds(),expected(seed,'all'));assert.equal(await page.locator('[data-kind="all"]').getAttribute('aria-pressed'),'true');
  await kind('weapon');if(revealedSets.has('set:warden'))await set('set:warden');await press('[data-action="forge-tab"][data-tab="stones"]');await press('[data-action="forge-tab"][data-tab="salvage"]');assert.equal(await page.locator('[data-kind="weapon"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-mode="all"]').getAttribute('aria-pressed'),'true');
  const geometry=await fit();assert.deepEqual(await state(),baseline,'filters do not persist or spend');
  if(revealedSets.has('set:warden'))assert.equal(await page.locator('[data-set="set:warden"]').getAttribute('aria-pressed'),'true');
  await kind('all');await set('all');
  if(name==='balanced'||name==='goldpoor'){
   const parts=await page.locator('[data-id="iron_sword"][data-action="craft"]').locator('..').locator('.recipe-parts').innerText();for(const [k,n]of Object.entries(RECIPES.iron_sword))assert.ok(parts.includes(`${k==='gold'?'G':ITEMS[k].name}: ${held(seed,k)} / ${n}`));
   const blocked=page.locator('[data-id="warden_maul"][data-action="craft"]');assert.equal(await blocked.isDisabled(),true);await blocked.scrollIntoViewIfNeeded();const r=await blocked.boundingBox();if(mobile)await page.touchscreen.tap(r.x+r.width/2,r.y+r.height/2);else await page.mouse.click(r.x+r.width/2,r.y+r.height/2);assert.deepEqual(await state(),baseline,'disabled craft protection');
  }
  await press('[data-action="inn"]');await press('[data-action="forge"]');await press('[data-action="forge-tab"][data-tab="salvage"]');assert.deepEqual(await actualIds(),expected(seed,'craftable'));assert.equal(await page.locator('[data-kind="all"]').getAttribute('aria-pressed'),'true');assert.equal(await page.locator('[data-set="all"]').getAttribute('aria-pressed'),'true');
  if(name==='balanced'){
   await press('[data-action="craft"][data-id="iron_sword"]');assert.equal(await page.locator('[data-forge-tab="enhance"]').isVisible(),true);const after=await state();assert.deepEqual(after.save,craft(seed,'iron_sword'));assert.equal(after.writes.length,1);assert.equal(after.world,null);assert.match(await page.locator('.craft-notice').innerText(),/제작 완료/);
  }else assert.deepEqual(await state(),baseline);
  for(const [path,binding]of Object.entries(report.sourceBinding))assert.ok(requests.has(binding.url),'ordinary page requested '+path);
  report.rows.push({width,fixture:name,input:mobile?'native touch':'keyboard Enter',defaultCount,allCount,categoryModes:true,emptyCtaClearsAllThree:true,setFilterRevealedOnly:true,tabRetained:true,reopeningReset:true,noFilterSaveWrites:true,exactCraftRoute:name==='balanced',geometry});await context.close();
 }
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkMutations,[]);report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{await browser?.close();server?.kill();await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,rows:report.rows.length,out,failure:report.failure}));}
