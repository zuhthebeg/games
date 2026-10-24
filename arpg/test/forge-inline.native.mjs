// Native, isolated raw CDP replay; never attaches to a user's browser/storage.
// ARPG_BASE_URL=https://game.cocy.io ARPG_CACHEBURST=<exact-commit> node arpg/test/forge-inline.native.mjs
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,rm,mkdir,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createSave,validateSave,SAVE_KEY} from '../js/meta/save.js';
import {ITEMS,RECIPES,instance,craft,dismantle} from '../js/meta/items.js';
import {noteMaterials} from '../js/meta/recipe-discovery.js';
import {enchant,enchantPreview} from '../js/meta/enchant.js';
const root=fileURLToPath(new URL('../..',import.meta.url));
const remote=!!process.env.ARPG_BASE_URL,mode=remote?'production':'local';
const httpPort=Number(process.env.ARPG_HTTP_PORT||8993),port=Number(process.env.ARPG_CDP_PORT||19203);
const base=(process.env.ARPG_BASE_URL||'http://127.0.0.1:'+httpPort).replace(/\/$/,'').replace(/\/arpg$/,'');
const output='/home/cocy/.openclaw/workspace/tmp/arpg-forge-ux';
await mkdir(output,{recursive:true});
const report={status:'RUNNING',mode,base,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),rows:[],failures:[],errors:[],httpErrors:[],sourceBinding:{},screenshots:[],existingUserStorage:0,runtimeSaveInjection:0};
let server,chrome,socket,sequence=0;const pending=new Map();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const profile=await mkdtemp(join(tmpdir(),'arpg-forge-inline-'));
const check=(value,message)=>{if(!value)report.failures.push(message);};
const seedSave=()=>{let s=createSave({name:'대장장이 검증',answers:[0,0,0,0,0],createdAt:1});s.gold=100000;
 for(const recipe of Object.values(RECIPES))for(const id of Object.keys(recipe))if(id!=='gold'&&id!=='enhance_stone_3')s.stacks[id]=1000;
 Object.assign(s.stacks,{enhance_stone_1:100,enhance_stone_blessed:10,enhance_stone_cursed:10});
 s.items.push({...instance('forge:spare9','iron_sword',1,[]),enhance:9});
 for(const [id]of Object.entries(ITEMS).filter(([,d])=>d.slot).slice(0,24))s.items.push(instance('forge:rack:'+id,id,1,[]));
 s=noteMaterials(s);assert.equal(validateSave(s),true);assert.ok(!('enhance_stone_3'in s.stacks));return s;};
const seed=seedSave();
try{
 if(!remote){server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});for(let i=0;i<60;i++){try{if((await fetch(base+'/arpg/'+(process.env.ARPG_CACHEBURST?'?v='+encodeURIComponent(process.env.ARPG_CACHEBURST):''))).ok)break;}catch{}await sleep(100);}assert.equal(server.exitCode,null,'own unique HTTP port');}
 const html=await(await fetch(base+'/arpg/'+(process.env.ARPG_CACHEBURST?'?v='+encodeURIComponent(process.env.ARPG_CACHEBURST):''))).text(),map=JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
 for(const path of ['arpg/js/ui/hub.js','arpg/js/ui/enchant-fx.js','arpg/js/meta/enchant.js','arpg/js/meta/items.js','arpg/js/meta/save.js','arpg/css/game.css']){
  const mapped=path.endsWith('.js')?map['./'+path.slice(5)]:html.match(/href="([^"<>]*css\/game\.css[^"<>]*)"/)[1];
  const url=new URL(mapped,base+'/arpg/');if(process.env.ARPG_CACHEBURST)url.searchParams.set('verify',process.env.ARPG_CACHEBURST);
  const response=await fetch(url),bytes=Buffer.from(await response.arrayBuffer());assert.equal(response.status,200,'stamped URL '+url);assert.deepEqual(bytes,await readFile(root+'/'+path),'served exact current source '+path);report.sourceBinding[path]={url:url.href,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--remote-debugging-port='+port,'--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch('http://127.0.0.1:'+port+'/json')).json();if(targets[0]?.webSocketDebuggerUrl)break;}catch{}await sleep(100);}assert.ok(targets?.[0]?.webSocketDebuggerUrl);
 socket=new WebSocket(targets[0].webSocketDebuggerUrl);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
 socket.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){pending.get(m.id)?.(m);pending.delete(m.id);}else if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Runtime.consoleAPICalled'&&m.params.type==='error')report.errors.push(m.params.args.map(a=>a.value||a.description).join(' '));else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')report.errors.push(m.params.entry.text);else if(m.method==='Network.responseReceived'&&m.params.response.status>=400)report.httpErrors.push({url:m.params.response.url,status:m.params.response.status});};
 const cmd=(method,params={})=>new Promise((r,j)=>{const id=++sequence,t=setTimeout(()=>{pending.delete(id);j(Error('CDP timeout '+method));},20000);pending.set(id,m=>{clearTimeout(t);m.error?j(Error(JSON.stringify(m.error))):r(m.result);});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async expression=>{for(let i=0;i<100;i++){if(await ev(expression))return;await sleep(60);}throw Error('Timed out '+expression+' '+JSON.stringify(await ev('({page:document.querySelector("#meta-screen")?.dataset.page,text:document.body.innerText.slice(0,300),stored:!!localStorage.getItem("arpg.save.v1"),seeded:sessionStorage.getItem("forge-seeded")})')));};
 const key=async(code='Enter',vk=13)=>{await cmd('Input.dispatchKeyEvent',{type:'keyDown',key:code,code,windowsVirtualKeyCode:vk,text:code==='Enter'?'\r':'',unmodifiedText:code==='Enter'?'\r':''});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key:code,code,windowsVirtualKeyCode:vk});};
 let mobile=false;
 const press=async selector=>{const p=await ev('(()=>{const n=document.querySelector('+JSON.stringify(selector)+');if(!n||n.disabled)throw Error("missing/disabled "+'+JSON.stringify(selector)+');n.scrollIntoView({block:"nearest",inline:"nearest"});'+(!mobile?'n.focus({preventScroll:true});':'')+'const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
  if(mobile){await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,radiusX:1,radiusY:1,force:1,id:1}]});await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await key();};
 const state=()=>ev('JSON.parse(localStorage.getItem('+JSON.stringify(SAVE_KEY)+'))');
 const noDialog=()=>ev('document.querySelectorAll("dialog[open]").length===0');
 const shot=async name=>{if(process.env.ARPG_SCREENSHOTS==='0')return;const p=join(output,(remote?name.replace(/^local-/, 'production-'):name)+'.png');const r=await cmd('Page.captureScreenshot',{format:'png'});await writeFile(p,Buffer.from(r.data,'base64'));report.screenshots.push(p);};
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Log.enable');await cmd('Network.enable');await cmd('Network.setCacheDisabled',{cacheDisabled:true});
 // One preboot fixture only per fresh navigation. Subsequent user operations persist normally.
 const init=await cmd('Page.addScriptToEvaluateOnNewDocument',{source:'if(location.pathname.startsWith("/arpg/")){if(!sessionStorage.getItem("forge-seeded")){localStorage.setItem('+JSON.stringify(SAVE_KEY)+','+JSON.stringify(JSON.stringify(seed))+');sessionStorage.setItem("forge-seeded","1");}window.__forgeWrites=[];const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='+JSON.stringify(SAVE_KEY)+')window.__forgeWrites.push(JSON.parse(v));return set.call(this,k,v);};window.__forgeFx=[];new MutationObserver(()=>{const d=document.querySelector("[data-enchant-fx]");if(d)window.__forgeFx.push({phase:d.dataset.phase,kind:d.dataset.enchantFx,persisted:JSON.parse(localStorage.getItem('+JSON.stringify(SAVE_KEY)+')).enchantCount});}).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:["data-phase"]});}'});
 for(const [width,height]of [[390,844],[1280,800]]){
  mobile=width===390;
  await cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:5});
  if(width===1280)await ev('sessionStorage.clear()');
  await cmd('Network.clearBrowserCookies');await cmd('Page.navigate',{url:'about:blank'});await sleep(80);
  // Clear only this harness profile's synthetic origin storage before a new viewport replay.
  await cmd('Storage.clearDataForOrigin',{origin:new URL(base).origin,storageTypes:'all'});
  await cmd('Page.navigate',{url:base+'/arpg/'+(process.env.ARPG_CACHEBURST?'?v='+encodeURIComponent(process.env.ARPG_CACHEBURST):'')});
  await wait('window.__arpg&&document.querySelector("[data-action=choose-human]")');await press('[data-action="choose-human"]');await wait('document.querySelector(".inn-fire")');
  assert.deepEqual(await state(),seed);await press('[data-action="bag"]');await press('[data-action="socket"][data-slot="weapon"]');await press('[data-action="socket-forge"]');assert.ok(await noDialog(),'socket-forge closes original sheet');assert.equal(await ev('document.querySelector("[data-forge-tab]").dataset.forgeTab'),'enhance');await press('[data-action="inn"]');await press('[data-action="forge"]');
  const row={width,height,input:mobile?'native touch':'keyboard Enter'};report.rows.push(row);
  row.open=await ev('(()=>{const box=s=>{const n=document.querySelector(s),r=n.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};};return{selected:document.querySelector(".forge-picker [aria-pressed=true]").dataset.uid,title:box(".forge-item-title"),odds:box(".forge-probabilities"),stones:box(".stone-picker"),cta:box("[data-action=enhance]"),content:box(".inn-shell>.content"),tabs:[...document.querySelectorAll("[data-action=forge-tab]")].map(n=>[n.dataset.tab,n.textContent]),details:document.querySelector(".forge-probabilities").closest("details")!==null,overflow:document.documentElement.scrollWidth-innerWidth};})()');
  assert.deepEqual(row.open.tabs,[['enhance','강화'],['craft','제작'],['salvage','분해']]);check(await noDialog(),width+' opening no dialog');
  for(const [name,r]of Object.entries(row.open).filter(([,v])=>v&&typeof v==='object'&&'top'in v))check(r.top>=0&&r.bottom<=height,width+' opening '+name+' visible '+JSON.stringify(r));
  check(row.open.stones.bottom<=row.open.content.bottom,width+' all stone cost/effects visible above clipped content bottom '+row.open.content.bottom);check(!row.open.details,width+' odds outside details');check(row.open.overflow===0,width+' overflow0');assert.equal(await ev('document.querySelectorAll(".stone-picker button").length'),3);
  assert.equal(await ev('document.querySelectorAll(".forge-work .forge-preview:not([open])").length'),1);assert.equal(await ev('!!document.querySelector(".forge-probabilities").closest("details")'),false);
  await shot('local-enhance-'+width);
  // Last-card native activation scrolls into view; rerender must preserve offset/focus.
  await press('.forge-picker [data-action="select-gear"]:last-child');
  row.selection=await ev('({scroll:document.querySelector(".forge-picker").scrollLeft,focus:document.activeElement.dataset.uid,selected:document.querySelector(".forge-picker [aria-pressed=true]").dataset.uid})');
  check(row.selection.scroll>0,width+' horizontal picker scroll');check(row.selection.focus===row.selection.selected,width+' selected focus');check(await noDialog(),width+' selection no dialog');
  await press('[data-action="pick-stone"][data-id="enhance_stone_blessed"]');
  assert.equal(await ev('document.querySelector(".forge-picker").scrollLeft'),row.selection.scroll,'stone change keeps rack scroll');
  for(const stone of ['enhance_stone_1','enhance_stone_blessed','enhance_stone_cursed']){await press('[data-action="pick-stone"][data-id="'+stone+'"]');const p=enchantPreview(await state(),row.selection.selected,stone);const text=await ev('document.querySelector(".forge-probabilities").textContent');for(const r of p.probabilities.filter(r=>r.chance>0))assert.ok(text.includes((r.to===null?'파괴':'+'+r.to)+' '+Number((r.chance*100).toFixed(3))+'%'));}

  await press('[data-action="pick-stone"][data-id="enhance_stone_cursed"]');assert.equal(await ev('document.querySelector("[data-action=pick-stone][aria-pressed=true]").dataset.id'),'enhance_stone_cursed');
  await press('[data-action="select-gear"][data-uid="'+seed.equipped.weapon+'"]');await press('[data-action="pick-stone"][data-id="enhance_stone_1"]');
  const expected=enchant(seed,seed.equipped.weapon,'enhance_stone_1');await press('[data-action="enhance"]');
  row.persistBeforeFx=await state();assert.deepEqual(row.persistBeforeFx,expected.save);
  await wait('document.querySelector("[data-enchant-fx]")?.dataset.phase==="result"');row.fx=await ev('({phase:document.querySelector("[data-enchant-fx]").dataset.phase,kind:document.querySelector("[data-enchant-fx]").dataset.enchantFx,text:document.querySelector(".enchant-result").textContent,notice:document.querySelectorAll(".enchant-notice").length})');
  assert.equal(row.fx.kind,'success');assert.equal(row.fx.notice,1);await wait('!document.querySelector("[data-enchant-fx]")');assert.equal(await ev('document.querySelectorAll(".enchant-fx,.enchant-particles").length'),0);assert.deepEqual(await state(),expected.save);row.fxPhases=await ev('window.__forgeFx');check(row.fxPhases.some(x=>x.phase==='charge'&&x.persisted===1)&&row.fxPhases.some(x=>x.phase==='result'),width+' FX phase persisted');
  // Recipe comparison opens only on explicit compare, and crafting never redirects to enhance.
  await press('[data-action="forge-tab"][data-tab="craft"]');await press('[data-action="craft-compare"][data-id="iron_sword"]');await wait('document.querySelector("dialog[open]")');await press('dialog[open] [data-action="close-sheet"]');
  const beforeCraft=await state();await press('[data-action="craft"][data-id="iron_sword"]');await wait('!document.querySelector(".craft-fx")');
  assert.deepEqual(await state(),craft(beforeCraft,'iron_sword'));assert.equal(await ev('document.querySelector("[data-forge-tab]").dataset.forgeTab'),'craft');await press('.craft-result [data-action="craft-compare"]');await wait('document.querySelector("dialog[open]")');await press('dialog[open] [data-action="close-sheet"]');row.craft={exact:true,tab:'craft',recipeAndResultComparison:true};
  await press('[data-action="forge-tab"][data-tab="salvage"]');await press('[data-action="select-gear"][data-uid="'+seed.equipped.weapon+'"]');
  assert.equal(await ev('[...document.querySelectorAll(".forge-salvage button")].every(n=>n.disabled)'),true);assert.equal(await ev('!!document.querySelector(".forge-salvage [data-action=equip]")'),false);
  await press('[data-action="select-gear"][data-uid="forge:spare9"]');row.salvageText=await ev('document.querySelector(".forge-salvage").textContent');assert.match(row.salvageText,/강화석: 94/);assert.doesNotMatch(row.salvageText,/상급/);if(mobile)await shot('local-salvage-390');
  const beforeSalvage=await state();await press('.forge-salvage [data-action="dismantle"]');assert.ok(!(await noDialog()));assert.deepEqual(await state(),beforeSalvage);await press('[data-action="confirm-dismantle"]');const afterSalvage=await state();assert.deepEqual(afterSalvage,dismantle(beforeSalvage,'forge:spare9'));assert.equal(afterSalvage.stacks.enhance_stone_1-beforeSalvage.stacks.enhance_stone_1,94);row.salvage={plain:94,confirm:true,wornDisabled:true,noEquip:true};
  // Consume all ten specials by actual safe native attempts; depleted stone stays selectable.
  await press('[data-action="forge-tab"][data-tab="enhance"]');await press('[data-action="pick-stone"][data-id="enhance_stone_blessed"]');
  for(let n=0;n<10;n++){await press('[data-action="select-gear"][data-uid="forge:rack:'+Object.entries(ITEMS).filter(([,d])=>d.slot)[n][0]+'"]');await press('[data-action="enhance"]');await wait('!document.querySelector("[data-enchant-fx]")');}
  await press('[data-action="pick-stone"][data-id="enhance_stone_blessed"]');row.insufficient=await ev('({stoneDisabled:document.querySelector("[data-action=pick-stone][data-id=enhance_stone_blessed]").disabled,ctaDisabled:document.querySelector("[data-action=enhance]").disabled,probabilities:document.querySelector(".forge-probabilities").textContent})');assert.equal(row.insufficient.stoneDisabled,false);assert.equal(row.insufficient.ctaDisabled,true);assert.ok(row.insufficient.probabilities.includes('%'));
  check(await noDialog(),width+' ending no dialog');check(await ev('document.documentElement.scrollWidth===innerWidth'),width+' final overflow0');
 }
 await cmd('Page.removeScriptToEvaluateOnNewDocument',{identifier:init.identifier});
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);assert.deepEqual(report.failures,[]);report.status='PASS';
}catch(e){report.status='BLOCKED';report.failure=e.stack;process.exitCode=1;}finally{socket?.close();chrome?.kill();server?.kill();if(chrome)await new Promise(r=>chrome.exitCode!==null?r():chrome.once('exit',r));await rm(profile,{recursive:true,force:true});await writeFile(join(output,mode+'.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,viewports:report.rows.length,errors:report.errors.length,httpErrors:report.httpErrors.length,failures:report.failures,failure:report.failure,out:join(output,mode+'.json')}));}
