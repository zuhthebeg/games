import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import {spawn} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {trained} from './weapon-loadout-fixture.js';
import {ITEMS,RECIPES,equip,craft} from '../js/meta/items.js';
import {validateSave,SAVE_KEY} from '../js/meta/save.js';
import {noteMaterials} from '../js/meta/recipe-discovery.js';
import {statBudget,setStatus} from '../js/meta/stats.js';
const base=process.env.ARPG_BASE_URL||'http://127.0.0.1:8981';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server','8981','--bind','127.0.0.1'],{cwd:new URL('../..',import.meta.url).pathname,stdio:'ignore'});
const report={base,rows:[],errors:[],screenshots:[],sourceBinding:{}};
const fixture=()=>{const s=trained();s.stats.str=100;s.statPoints=statBudget(s.level)-Object.values(s.stats).reduce((n,v)=>n+v-10,0);s.gold=100000;s.stacks=Object.fromEntries([...new Set(Object.values(RECIPES).flatMap(r=>Object.keys(r)))].filter(k=>k!=='gold').map(k=>[k,100]));s.loadout=['berserk',null,null];return noteMaterials(s)};
let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break}catch{}await new Promise(r=>setTimeout(r,100))}
 const html=await(await fetch(base+'/arpg/')).text(),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const path of ['js/ui/hub.js','js/ui/craft-fx.js']){const url=new URL(map['./'+path],base+'/arpg/').href,bytes=Buffer.from(await(await fetch(url)).arrayBuffer());assert.deepEqual(bytes,await readFile(new URL('../'+path,import.meta.url)));report.sourceBinding[path]={url};}
 const cssUrl=new URL(html.match(/href="(css\/game\.css[^"]*)"/)[1],base+'/arpg/').href;assert.deepEqual(Buffer.from(await(await fetch(cssUrl)).arrayBuffer()),await readFile(new URL('../css/game.css',import.meta.url)));report.sourceBinding.css={url:cssUrl};
 browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
 async function open(seed,width=390,lineage='human'){
 assert.equal(validateSave(seed),true,`${lineage} valid synthetic seed`);
 const context=await browser.newContext({viewport:{width,height:844},hasTouch:width===390,isMobile:width===390,reducedMotion:width===390?'reduce':'no-preference'});
 const key=lineage==='human'?SAVE_KEY:'arpg.save.v1.slots.skeleton_knight';
 await context.addInitScript(({key,seed})=>localStorage.setItem(key,JSON.stringify(seed)),{key,seed});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin&&['GET','HEAD'].includes(r.request().method())?r.continue():r.abort());
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(base+'/arpg/');await page.locator(`[data-action="${lineage==='human'?'choose-human':'choose-skeleton'}"]`).click();await page.waitForSelector('.inn-fire');
 return {context,page,press:async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(width===390)await n.tap();else await n.click()}};
 }
 // Real app boot, each rarity/enhancement/affix, both playable lineages.
 for(const lineage of (process.env.ARPG_UI_ONLY ? [] : ['human','skeleton_knight']))for(const id of ['warden_blade','warden_blade_common','warden_blade_rare','warden_blade_epic'])for(const kind of ['plain','enhanced','affixed']){
 const seed=fixture();if(lineage!=='human')seed.lineage=lineage;
 seed.items.push({uid:'target',id,enhance:kind==='enhanced'?5:0,affixes:kind==='affixed'?[{k:'hp_flat',v:2}]:[],rolledAt:0});
 // common base rarity has no affix slots; skip impossible synthetic inventory.
 if(!validateSave(seed)){report.rows.push({lineage,id,kind,unsupported:'item rarity does not permit this affix count'});continue}
 const {page,context,press}=await open(seed,390,lineage);
 await press('[data-action="trainer"]');assert.equal(await page.locator('[data-skill="berserk"] .slot-blocked').count(),1,'one hand correctly blocked');
 await press('[data-action="inn"]');await press('[data-action="inventory"]');await press('[data-action="open-item"][data-uid="target"]');
 await press('[data-action="equip"][data-uid="target"]');
 if(await page.locator('[data-action="weapon-confirm"]').count())await press('[data-action="weapon-confirm"]');
 await press('[data-action="inn"]');await press('[data-action="trainer"]');assert.equal(await page.locator('[data-skill="berserk"] .slot-blocked').count(),0);
 await press('[data-action="inn"]');await press('[data-action="trainer"]');assert.equal(await page.locator('[data-skill="berserk"] .slot-blocked').count(),0);
 await press('[data-action="inn"]');await press('[data-action="character"]');await press('[data-action="character-tab"][data-tab="skills"]');assert.equal(await page.locator('.character-skill[data-id="berserk"] .skill-warn').count(),0);
 report.rows.push({lineage,id,kind,realInventoryEquip:true,academyReopen:true,character:true});await context.close();
 }
 for(const width of [1280,390])for(const count of [0,1,2]){
 let seed=fixture();for(const id of ['warden_blade_rare','warden_plate'].slice(0,count)){seed.items.push({uid:id,id,enhance:3,affixes:[],rolledAt:0});seed.equipped[ITEMS[id].slot]=id}
 const {page,context,press}=await open(seed,width);
 await press('[data-action="forge"]');await press('[data-action="forge-tab"][data-tab="salvage"]');await press('[data-action="forge-recipe-set"][data-set="set:warden"]');
 const panel=page.locator('[data-craft-set="warden"]');assert.ok((await panel.textContent()).includes(`${count} / 2 보유`));assert.ok((await panel.textContent()).includes(`${count} / 2 착용`));assert.equal(await panel.locator('.forge-set-tier[data-active="true"]').count(),count===2?1:0);assert.equal(await panel.locator('[data-action="craft"]').count(),1);
 await press('[data-action="forge-piece"][data-id="warden_blade"]');assert.equal(await panel.locator('[data-action="craft"]').getAttribute('data-id'),'warden_blade');
 const fit=await page.evaluate(()=>{const n=document.querySelector('.inn-shell>.content');return {viewport:innerWidth,doc:document.documentElement.scrollWidth,content:n.clientWidth,scroll:n.scrollWidth}});assert.ok(fit.doc<=fit.viewport&&fit.scroll<=fit.content,JSON.stringify(fit));
 if(count===0){
 const before=await page.evaluate(()=>({gold:JSON.parse(localStorage.getItem("arpg.save.v1")).gold,count:(JSON.parse(localStorage.getItem("arpg.save.v1")).craftCount||0),items:JSON.parse(localStorage.getItem("arpg.save.v1")).items.length}));
 await press('[data-action="craft"][data-id="warden_blade"]');
 await page.waitForSelector('.craft-fx[open]');
 assert.match(await page.locator('.craft-reveal').innerText(),/제작 완료/);
 const after=await page.evaluate(()=>({gold:JSON.parse(localStorage.getItem("arpg.save.v1")).gold,count:(JSON.parse(localStorage.getItem("arpg.save.v1")).craftCount||0),items:JSON.parse(localStorage.getItem("arpg.save.v1")).items.length}));
 assert.equal(after.count,before.count+1);assert.equal(after.items,before.items+1);assert.equal(before.gold-after.gold,RECIPES.warden_blade.gold);
 if(width===390){assert.equal(await page.locator('.craft-reveal>.icon').evaluate(n=>getComputedStyle(n).animationName),'none');await page.keyboard.press('Escape');}
 await page.waitForSelector('.craft-fx',{state:'detached'});
 await press('.craft-result [data-action="craft-compare"]');assert.equal(await page.locator('dialog[open] .compare-sheet').count(),1);
 await page.locator('#compare-ignore-enhancement').check();assert.equal(await page.locator('#compare-ignore-enhancement').isChecked(),true);await press('[data-action="close-sheet"]');
 await press('[data-action="forge-tab"][data-tab="enhance"]');
 await press('.forge-picker [data-action="select-gear"]');
 assert.equal(await page.locator('.forge-sheet[open]').count(),1);
 const layout=await page.evaluate(()=>{const d=document.querySelector('.forge-sheet'),art=d.querySelector('.forge-hero-art').getBoundingClientRect(),ritual=d.querySelector('.forge-ritual').getBoundingClientRect(),stone=d.querySelector('.stone-picker [aria-pressed=true]').getBoundingClientRect(),n=d.querySelector('[data-action="enhance"]'),t=d.querySelector('.forge-item-title'),r=n.getBoundingClientRect(),h=t.getBoundingClientRect();return {buttonBottom:r.bottom,titleTop:h.top,height:innerHeight,bodyScroll:d.querySelector('.p2-sheet-body').scrollTop,overflow:d.scrollWidth>d.clientWidth,costBottom:stone.bottom,footerTop:d.querySelector('footer').getBoundingClientRect().top,artCenter:art.x+art.width/2,ritualCenter:ritual.x+ritual.width/2}});
 assert.ok(layout.buttonBottom<=layout.height&&layout.titleTop>=0&&!layout.overflow&&layout.bodyScroll===0&&layout.costBottom<=layout.footerTop&&Math.abs(layout.artCenter-layout.ritualCenter)<1,JSON.stringify(layout));
 await press('[data-action="close-sheet"]');
 }
 report.rows.push({width,count,counts:true,tiers:true,singleCraft:true,fit,realCraft:count===0});await context.close();
 }
 assert.deepEqual(report.errors,[]);report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1}finally{await browser?.close();server?.kill();const path=process.env.ARPG_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-berserk-setcraft-native.json';await writeFile(path,JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,rows:report.rows.length,failure:report.failure,path}))}
