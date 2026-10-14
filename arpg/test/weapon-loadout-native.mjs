import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.ARPG_UI_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-weapon-loadout-native.json';

const port=Number(process.env.ARPG_CDP_PORT||19607),httpPort=Number(process.env.ARPG_HTTP_PORT||9007),profile=await mkdtemp(join(tmpdir(),'arpg-sl1-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map(),errors=[];
try {
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}if(targets?.some(t=>t.type==='page'))break;await sleep(100);}
 assert.equal(server.exitCode,null);socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
 socket.onmessage=({data})=>{const d=JSON.parse(data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}else if(d.method==='Runtime.exceptionThrown'||d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'||d.method==='Log.entryAdded'&&d.params.entry.level==='error')errors.push(d);};
 const cmd=(method,params={})=>new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);rej(Error('timeout '+method));},120000);pending.set(id,d=>{clearTimeout(t);d.error?rej(Error(JSON.stringify(d.error))):res(d.result);});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(expression,timeout=20000)=>{const at=Date.now();while(Date.now()-at<timeout){if(await ev(expression))return;await sleep(100);}throw Error('timeout '+expression);};
 const key=async(key,code=key)=>{await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code, ...(key==='Enter'?{windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'}:key==='Escape'?{windowsVirtualKeyCode:27}:{})});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
 const activate=async(selector,mobile)=>{
  const pt=await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not accessible '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if(mobile){await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await sleep(40);await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await key('Enter');await sleep(100);
 };
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Log.enable');await cmd('Emulation.setFocusEmulationEnabled',{enabled:true});
 const origin=`http://127.0.0.1:${httpPort}`;

 const rows=[];
 const state=()=>ev(`JSON.stringify(fixture.hub.save)`);
 const slots=()=>ev('fixture.hub.save.loadout');
 const modal=()=>ev(`!!document.querySelector('dialog[open] [data-action="weapon-confirm"]')`);
 const layout=()=>ev(`(()=>{const d=document.querySelector('dialog[open]');const bad=[...d.querySelectorAll('dt,dd,button')].filter(n=>{const r=n.getBoundingClientRect(),p=d.getBoundingClientRect();return r.left<p.left-1||r.right>p.right+1});return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:d.scrollWidth>d.clientWidth,bad:bad.map(n=>n.textContent)}})()`);
 for(const width of [1280,320]) {
  const mobile=width<500;
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:mobile?844:800,deviceScaleFactor:1,mobile});
  await cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});
  await cmd('Page.navigate',{url:origin+'/arpg/test/weapon-loadout-native.html'});await wait('window.ready');
  assert.deepEqual(await ev('({valid:probe.oldValid,missing:probe.oldMissing})'),{valid:true,missing:true});
  const baseline=await state();
  const open=uid=>activate(`[data-action="open-item"][data-uid="${uid}"]`,mobile);
  await open('blunt');await activate('dialog[open] [data-action="equip"]',mobile);
  assert.equal(await modal(),true);assert.equal(await state(),baseline);assert.equal(await ev('probe.commits'),0);
  const layouts=[await layout()];
  // Native Escape/close returns to the original comparison and focused equip control.
  if(!mobile)await key('Escape');else await activate('dialog[open] [data-action="close-sheet"]',mobile);
  await wait(`!fixture.hub.pendingEquipment`);
  assert.equal(await state(),baseline);assert.equal(await ev('document.activeElement.dataset.action'),'equip');
  await activate('dialog[open] [data-action="equip"]',mobile);
  assert.match(await ev(`document.querySelector('dialog[open]').textContent`),/첫 형태/);
  await activate('[data-action="weapon-confirm"].primary',mobile);
  assert.equal(await ev('fixture.hub.save.equipped.weapon'),'blunt');assert.deepEqual(await slots(),['lunge',null,'whirl']);
  // Real academy slot buttons establish a distinct blunt set. No save/world mutation.
  await ev('fixture.hub.showTrainer()');
  await activate('[data-action="skill-slot"][data-id="ground_slam"][data-slot="0"]',mobile);
  await activate('[data-action="skill-slot"][data-id="armor_break"][data-slot="2"]',mobile);
  assert.deepEqual(await slots(),['ground_slam',null,'armor_break']);
  await ev('fixture.hub.showInventory()');await open('sword');await activate('dialog[open] [data-action="equip"]',mobile);
  assert.match(await ev(`document.querySelector('dialog[open]').textContent`),/이전 세트 복원/);
  assert.match(await ev(`document.querySelector('dialog[open]').textContent`),/사용 불가/);
  await activate('[data-action="weapon-confirm"].primary',mobile);assert.deepEqual(await slots(),['lunge',null,'whirl']);
  await ev('fixture.hub.showInventory()');await open('blunt');await activate('dialog[open] [data-action="equip"]',mobile);await activate('[data-action="weapon-confirm"].primary',mobile);
  assert.deepEqual(await slots(),['ground_slam',null,'armor_break']);
  // Persist/reload both exact histories through the actual SaveStore, not direct fixture edits.
  assert.deepEqual(await ev('fixture.store.load().weaponLoadouts'),await ev('fixture.hub.save.weaponLoadouts'));
  const remembered=await ev('fixture.hub.save.weaponLoadouts');
  assert.deepEqual(remembered['blade:sword'],['lunge',null,'whirl']);assert.deepEqual(remembered['blade:blunt'],['ground_slam',null,'armor_break']);
  // Merchant buy-equip boundary: preview/cancel is byte-identical and costs zero.
  await ev('fixture.hub.showMerchant()');const stock=await ev('fixture.stock');await open(stock);await activate('dialog[open] [data-action="buy-equip"]',mobile);
  const beforeBuy=await state(),count=await ev('probe.commits');assert.match(await ev(`document.querySelector('dialog[open]').textContent`),/확인 시 결제/);
  layouts.push(await layout());await activate('[data-action="weapon-cancel"]',mobile);assert.equal(await state(),beforeBuy);assert.equal(await ev('probe.commits'),count);assert.equal(await ev('document.activeElement.dataset.action'),'buy-equip');
  await activate('dialog[open] [data-action="buy-equip"]',mobile);
  await activate('[data-action="weapon-confirm"][data-current="true"]',mobile);assert.equal(await ev('probe.commits'),count+1);assert.deepEqual(await slots(),['ground_slam',null,'armor_break']);
  assert.deepEqual(await ev('fixture.hub.save.shopBought'),[stock]);assert.ok(JSON.parse(await state()).gold<JSON.parse(beforeBuy).gold);
  // Actual receipt reveal entry point restores remembered sword in one commit.
  await ev('fixture.receipt()');const beforeLoot=await state(),lootCount=await ev('probe.commits');
  await activate('[data-action="loot-equip"][data-uid="sword"]',mobile);assert.equal(await state(),beforeLoot);layouts.push(await layout());
  await activate('[data-action="weapon-cancel"]',mobile);assert.equal(await state(),beforeLoot);assert.equal(await ev('document.activeElement.dataset.action'),'loot-equip');
  await activate('[data-action="loot-equip"][data-uid="sword"]',mobile);await activate('[data-action="weapon-confirm"].primary',mobile);
  assert.deepEqual(await slots(),['lunge',null,'whirl']);assert.equal(await ev('probe.commits'),lootCount+1);assert.equal(await ev('fixture.hub.save.equipped.weapon'),'sword');
  // Close and navigation drop drafts without mutations. Token guard is also unit-tested.
  await ev('fixture.hub.showInventory()');await open('blunt');await activate('dialog[open] [data-action="equip"]',mobile);const beforeNav=await state();
  await ev('fixture.hub.showInn()');assert.equal(await state(),beforeNav);assert.equal(await ev('fixture.hub.pendingEquipment'),null);assert.equal(await modal(),false);
  if(mobile){await cmd('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await ev('fixture.hub.showInventory()');await open('blunt');await activate('dialog[open] [data-action="equip"]',mobile);layouts.push(await layout());await activate('[data-action="weapon-cancel"]',mobile);}
  for(const l of layouts){assert.equal(l.overflow,false,JSON.stringify(l));assert.equal(l.dialogOverflow,false,JSON.stringify(l));assert.deepEqual(l.bad,[],JSON.stringify(l));}
  assert.deepEqual(await ev('fixture.store.load().skillMastery'),{lunge:1500,ground_slam:932,whirl:501});
  rows.push({width,mode:mobile?'native CDP touch':'native Enter/Escape',oldPersistedLoaded:true,threeEntrypoints:true,swordBluntHistories:remembered,layouts,commits:await ev('probe.commits')});
  await writeFile(out,JSON.stringify({status:'running',rows,errors,screenshots:0},null,2)+'\n');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 await writeFile(out,JSON.stringify({status:'PASS',cases:2,rows,errors,screenshots:0,scope:'actual HubUI and SaveStore transaction boundary; no world, hunt, physical phone, multiplayer or production claim'},null,2)+'\n');
 console.log(JSON.stringify({cases:2,errors:errors.length,screenshots:0,evidence:out}));
} finally {socket?.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});}
