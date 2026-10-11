// Self-contained raw CDP smoke: own static server and fresh browser profile, cleaned up in finally.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = resolve(process.env.ARPG_ROOT || fileURLToPath(new URL('../../', import.meta.url)));
const port = Number(process.env.ARPG_CDP_PORT || 19107);
const httpPort = Number(process.env.ARPG_HTTP_PORT || 8741);
const profile = await mkdtemp(join(tmpdir(), 'arpg-item-art-'));
const server = spawn('python3', ['-m', 'http.server', String(httpPort), '--bind', '127.0.0.1'], {
  cwd: root, stdio: 'ignore',
});
const chrome = spawn('/home/cocy/bin/chromium', [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let socket;
let sequence = 0;
const pending = new Map();
const events = [];

try {
  let targets;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      if (targets[0]?.webSocketDebuggerUrl) break;
    } catch {
      // Chromium is still starting.
    }
    await sleep(100);
  }
  assert.ok(targets?.[0]?.webSocketDebuggerUrl, 'Chromium CDP unavailable');
  assert.equal(server.exitCode, null, `static server could not bind (${httpPort} already occupied?)`);
  socket = new WebSocket(targets[0].webSocketDebuggerUrl);
  await new Promise((resolveOpen, reject) => {
    socket.onopen = resolveOpen;
    socket.onerror = reject;
  });
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id) {
      pending.get(message.id)?.(message);
      pending.delete(message.id);
    } else events.push(message);
  };
  const command = (method, params = {}) => new Promise((resolveCommand, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`CDP timeout: ${method}`));
    }, 15000);
    pending.set(id, (message) => {
      clearTimeout(timer);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result.value;
  };
  const waitFor = async (expression, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(expression)) return;
      await sleep(150);
    }
    throw new Error(`Timed out waiting for ${expression}`);
  };
  const click = async (selector) => {
    await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node || node.disabled) throw new Error('missing/disabled: ' + ${JSON.stringify(selector)});
      node.click();
    })()`);
  };
  const page = (name) => `document.querySelector('#meta-screen')?.dataset.page===${JSON.stringify(name)}
    && !document.querySelector('#meta-screen').hidden`;
  const key = (code, type = 'keyDown') => command('Input.dispatchKeyEvent', {
    type, code,
    ...(code==='Enter'&&type==='keyDown'?{text:'\r',unmodifiedText:'\r'}:{}),
    key: { KeyD: 'd', KeyJ: 'j', KeyR: 'r', KeyK: 'k', KeyE: 'e', Space: ' ' }[code] || code,
    windowsVirtualKeyCode: { KeyD: 68, KeyJ: 74, KeyR: 82, KeyK: 75, KeyE: 69, Space: 32, Enter: 13, Escape: 27 }[code] || 0,
  });
  const touch = (type, points) => command('Input.dispatchTouchEvent', { type, touchPoints: points });
  await command('Runtime.enable'); await command('Page.enable'); await command('Log.enable'); await command('Network.enable');
  const imageStates=[];
  const audit = async () => {
    const images=await evaluate(`(async()=>{
      const imgs=[...document.querySelectorAll('#meta-screen img.item-art-image')];
      for(const im of imgs){im.loading='eager';await im.decode();if(!im.closest('.item-art').classList.contains('art-ready'))await new Promise(resolve=>im.addEventListener('load',resolve,{once:true}));}
      return imgs.map(im=>({src:im.getAttribute('src'),width:im.naturalWidth,ready:im.closest('.item-art').classList.contains('art-ready'),fallback:getComputedStyle(im.closest('.item-art').querySelector('svg')).visibility}));
    })()`);
    for(const im of images){assert.equal(im.width,96);assert.equal(im.ready,true,JSON.stringify(im));assert.equal(im.fallback,'hidden');}
    imageStates.push({count:images.length});
    const result = await evaluate(`(() => {
      const root=document.querySelector('#meta-screen'); const shell=root.querySelector('.inn-shell');
      const content=shell.querySelector('.content'); const footer=shell.querySelector('.action-footer');
      const r=shell.getBoundingClientRect(); const c=content.getBoundingClientRect();
      const dialog=root.querySelector('dialog[open]'); const d=dialog?.getBoundingClientRect();
      const tiny=[...root.querySelectorAll('button')].filter(n=>n.checkVisibility()).filter(n=>{const b=n.getBoundingClientRect();return b.width<43.5||b.height<43.5}).map(n=>n.dataset.action);
      const buttons=[...root.querySelectorAll('button')].filter(n=>n.checkVisibility()&&(!dialog||dialog.contains(n))).map(n=>{const r=n.getBoundingClientRect();const clip=dialog?dialog.getBoundingClientRect():content.contains(n)?c:shell.getBoundingClientRect();return {n,b:{left:Math.max(r.left,clip.left),right:Math.min(r.right,clip.right),top:Math.max(r.top,clip.top),bottom:Math.min(r.bottom,clip.bottom)}};}).filter(({b})=>b.bottom>b.top&&b.right>b.left);
      const overlaps=[];for(let i=0;i<buttons.length;i++)for(let j=i+1;j<buttons.length;j++){const a=buttons[i].b,b=buttons[j].b;if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([buttons[i].n.dataset.action,buttons[j].n.dataset.action]);}
      return {overlaps,width:innerWidth,height:innerHeight,right:r.right,left:r.left,bottom:r.bottom,overflow:content.scrollWidth>content.clientWidth+1,tiny,
        footerOverlap:footer ? c.bottom>footer.getBoundingClientRect().top+1:false,dialog:d?{left:d.left,right:d.right,top:d.top,bottom:d.bottom}:null};
    })()`);
    assert.ok(result.left>=-1&&result.right<=result.width+1&&result.bottom<=result.height+1,JSON.stringify(result));
    assert.equal(result.overflow,false,JSON.stringify(result)); assert.equal(result.footerOverlap,false);
    assert.deepEqual(result.tiny,[]); assert.deepEqual(result.overlaps,[]); if(result.dialog) assert.ok(result.dialog.left>=-1&&result.dialog.right<=result.width+1&&result.dialog.top>=-1&&result.dialog.bottom<=result.height+1,JSON.stringify(result));
  };
  const coverageAudit = async () => {
    const coverage=await evaluate(`(async()=>{
      const {ITEMS}=await import('./js/meta/items.js');const {itemIcon}=await import('./js/ui/icons.js');
      const paths=new Set();let wood;
      for(const [id,d] of Object.entries(ITEMS)){
        const h=document.createElement('div');h.innerHTML=itemIcon(id,d);
        const src=h.querySelector('img')?.getAttribute('src');if(!src)throw Error('uncovered item '+id);
        paths.add(src);if(id==='wood')wood={id,src};
      }
      for(const src of paths){const im=new Image();im.src=src;await im.decode();if(im.naturalWidth!==96||im.naturalHeight!==96)throw Error(src);}
      return {ids:Object.keys(ITEMS).length,paths:paths.size,wood:{...wood,decoded:true}};
    })()`);
    assert.equal(coverage.paths,36);
    assert.deepEqual(coverage.wood,{id:'wood',src:'assets/items/wood.webp',decoded:true});
    return coverage;
  };
  const states=[];
  for(const [width,height] of [[360,640],[390,844],[1280,900]]) {
    await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<600});
    await command('Page.navigate',{url:process.env.ARPG_TEST_URL || `http://127.0.0.1:${httpPort}/arpg/?dev=1`});
    await waitFor('window.__arpg');
    await evaluate(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js'); const {addXp}=await import('./js/meta/progression.js'); const {craft}=await import('./js/meta/items.js');
      let s=(await import('./test/fixtures/trained.js')).trained(addXp(createSave({name:'장비 UI 시험',answers:[0,0,0,0,0],createdAt:1}),451));s={...s,gold:10000,stacks:{...s.stacks,scrap:100,hide:100,fang:100,wood:3,enhance_stone_1:10,scroll_enchant_weapon:10}};s=craft(s,'iron_sword');s.cleared=Object.fromEntries(Object.keys(s.cleared).map(k=>[k,true]));new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload'); await waitFor(page('inn')); await audit();
    assert.equal(await evaluate("document.querySelectorAll('.p2-socket').length"),5);
    await click('[data-action="socket"][data-slot="weapon"]'); await audit();
    await click('[data-action="open-item"][data-uid="craft:iron_sword:1"]'); await audit();
    assert.ok(await evaluate("document.querySelectorAll('dialog[open] [data-line]').length>=3"));
    await click('[data-action="equip"][data-uid="craft:iron_sword:1"]');assert.equal(await evaluate('__arpg.save.equipped.weapon'),'craft:iron_sword:1');
    await click('[data-action="inventory"]');await audit();await click('[data-action="filter"][data-slot="weapon"]');await audit();
    await click('[data-action="open-item"][data-uid="starter:weapon"]');await audit();await click('[data-action="close-sheet"]');
    await click('[data-action="inn"]');await click('[data-action="merchant"]');await audit();
    const offer=await evaluate("document.querySelector('[data-action=\"open-item\"]').dataset.uid");await click(`[data-action="open-item"][data-uid="${offer}"]`);await audit();
    const gold=await evaluate('__arpg.save.gold'); await click(`[data-action="buy-gear"][data-uid="${offer}"]`);assert.ok(await evaluate('__arpg.save.gold')<gold);
    await click('[data-action="inn"]');await click('[data-action="forge"]');await audit();
    await click('[data-action="enhance"][data-uid="craft:iron_sword:1"]');await waitFor("!document.querySelector('[data-enchant-fx]')");assert.equal(await evaluate("__arpg.save.items.find(i=>i.uid==='craft:iron_sword:1').enhance"),1);
    await click('[data-action="forge-tab"][data-tab="salvage"]');await audit();
    await click('[data-action="select-gear"][data-uid="starter:weapon"]');await click('[data-action="dismantle"][data-uid="starter:weapon"]');await audit();
    await click('[data-action="close-sheet"]');assert.ok(await evaluate("__arpg.save.items.some(i=>i.uid==='starter:weapon')"));
    await click('[data-action="inn"]');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.npc-grid strong')].map(n=>n.textContent)"),['만물상','장비상','대장장이','아카데미','창고','가방']);
    assert.equal(await evaluate("!!document.querySelector('[data-action=\"owner\"]')"),false);
    // Fixture is a trained Lv15 (skill books need 힘 30); the badge shows exactly the unspent points.
    assert.ok(await evaluate("document.querySelector('[data-action=\"character\"] .badge').textContent===String(__arpg.save.statPoints)&&__arpg.save.statPoints>0"));
    await click('[data-action="character"]');await audit();
    assert.ok(await evaluate("document.querySelector('.character-summary').textContent.includes('공격 속도')"));
    const pointsBefore=await evaluate('__arpg.save.statPoints');
    await click('[data-action="stat-plus"][data-key="str"]:not([data-step])');await audit();
    await click('#allocation-confirm');assert.equal(await evaluate('__arpg.save.statPoints'),pointsBefore-1);
    await click('[data-action="inn"]');await click('[data-action="trainer"]');await audit();
    assert.equal(await evaluate("document.querySelectorAll('.academy-tabs [role=tab]').length"),3);
    await click('[data-action="learn-skill"][data-id="whirl"]');await audit();
    // K2: a learned book drops into the first empty slot.
    assert.equal(await evaluate("document.querySelector('[data-action=\"equip-skill\"][data-id=\"whirl\"]').getAttribute('aria-pressed')"),'true');
    await click('[data-action="academy-tab"][data-family="focus"]');await click('[data-action="learn-skill"][data-id="frost_lance"]');
    await audit();
    assert.equal(await evaluate("__arpg.save.loadout.includes('whirl')&&__arpg.save.loadout.includes('frost_lance')"),true);
    await click('[data-action="inn"]');await click('[data-action="bag"]');await audit();
    assert.equal(await evaluate("document.querySelectorAll('.bag-equipped').length"),5);
    await click('[data-action="move-stack"][data-id="potion"][data-count="1"]');await audit();
    assert.equal(await evaluate('__arpg.save.stacks.potion'),2);
    assert.equal(await evaluate('__arpg.save.stash.stacks.potion'),1);
    await click('[data-action="inn"]');await click('[data-action="inventory"]');
    assert.equal(await evaluate("document.querySelectorAll('.p2-grid [data-uid=\"craft:iron_sword:1\"]').length"),0);
    // Activate the real material tab with native touch / keyboard, not DOM click.
    const materialSelector='[data-action="stash-tab"][data-tab="material"]';
    const materialPoint=await evaluate(`(()=>{const n=document.querySelector('${materialSelector}');n.scrollIntoView({block:'center'});n.focus();const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
    if(width<600){await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await touch('touchStart',[{...materialPoint,radiusX:2,radiusY:2}]);await touch('touchEnd',[]);}
    else {await key('Enter');await key('Enter','keyUp');}
    await waitFor("document.querySelector('[data-action=\"stash-tab\"][data-tab=\"material\"]').getAttribute('aria-pressed')==='true'");
    await audit();
    const woodRow=await evaluate(`(()=>{const im=document.querySelector('#meta-screen img[src="assets/items/wood.webp"]');if(!im)throw Error('wood missing in material UI');return {label:im.closest('.stack-row').querySelector('strong').textContent,width:im.naturalWidth,ready:im.closest('.item-art').classList.contains('art-ready'),fallback:getComputedStyle(im.closest('.item-art').querySelector('svg')).visibility}})()`);
    assert.deepEqual(woodRow,{label:'목재',width:96,ready:true,fallback:'hidden'});
    assert.ok(await evaluate("document.querySelector('.stack-list').textContent.includes('강화석')"));
    await click('[data-action="stash-tab"][data-tab="consumable"]');await audit();
    await click('[data-action="move-stack"][data-id="potion"][data-count="1"]');
    assert.equal(await evaluate('__arpg.save.stacks.potion'),3);
    // Move five/all through UI, then sell stored supplies and materials.
    await click('[data-action="inn"]');await click('[data-action="shop"]');await audit();
    await click('[data-action="shop-tab"][data-tab="buy"]');await click('[data-action="shop-select"][data-id="potion"]');
    await evaluate("document.querySelector('#shop-count').value=5;document.querySelector('#shop-count').dispatchEvent(new Event('change',{bubbles:true}))");
    await click('#shop-buy');
    await click('[data-action="inn"]');await click('[data-action="bag"]');
    await click('[data-action="move-stack"][data-id="potion"][data-count="5"]');
    assert.equal(await evaluate('__arpg.save.stash.stacks.potion'),5);
    await click('[data-action="inn"]');await click('[data-action="shop"]');
    await click('[data-action="shop-tab"][data-tab="sell"]');await audit();
    await click('[data-action="sell-stack"][data-source="stash"][data-id="potion"][data-count="5"]');
    assert.equal(await evaluate('__arpg.save.stash.stacks.potion'),0);
    const materialGold=await evaluate('__arpg.save.gold');
    await click('[data-action="sell-stack"][data-id="enhance_stone_1"][data-count="5"]');
    assert.equal(await evaluate('__arpg.save.gold'),materialGold+await evaluate("(async()=>{const {stackSellPrice}=await import('./js/meta/shop.js');return stackSellPrice('enhance_stone_1')*5;})()"));
    await click('[data-action="sell-stack"][data-id="scrap"]:last-child');await audit();
    assert.equal(await evaluate('__arpg.save.stacks.scrap'),0);
    await click('[data-action="shop-tab"][data-tab="buy"]');
    // A valid legacy-overweight bag must refuse both purchase and withdrawal at 100%.
    await evaluate(`(async()=>{const {SaveStore}=await import('./js/meta/save.js');const {capacity,carriedWeight}=await import('./js/meta/items.js');const s=JSON.parse(JSON.stringify(__arpg.save));s.stacks.potion=0;while(carriedWeight(s)<capacity(s))s.stacks.potion++;s.stash.stacks.potion=1;new SaveStore(localStorage).save(s);})()`);
    await command('Page.reload');await waitFor(page('inn'));
    await click('[data-action="shop"]');await click('[data-action="shop-select"][data-id="potion"]');await audit();
    assert.equal(await evaluate("document.querySelector('#shop-buy').disabled"),true);
    assert.ok(await evaluate("document.querySelector('#purchase-reason').textContent.includes('무게 초과')"));
    await click('[data-action="inn"]');await click('[data-action="inventory"]');
    await click('[data-action="stash-tab"][data-tab="consumable"]');
    await click('[data-action="move-stack"][data-id="potion"][data-count="1"]');
    assert.ok(await evaluate("document.querySelector('#meta-error').textContent.includes('100%')"));await audit();
    await click('[data-action="inn"]');await click('[data-action="bag"]');
    await click('[data-action="move-stack"][data-id="potion"]:last-child');await audit();
    assert.equal(await evaluate('__arpg.save.stacks.potion'),0);
    await click('[data-action="inn"]');await click('[data-action="inventory"]');
    await click('[data-action="stash-tab"][data-tab="gear"]');
    await click('[data-action="inn"]');await click('[data-action="board"]');await audit();assert.equal(await evaluate("document.querySelectorAll('[data-action=\"sortie\"]').length"),20);
    await click('[data-action="sortie"][data-stage="S20"]');await audit();states.push({width,height,ok:true,woodRow,nativeMaterialTab:true,coverage:await coverageAudit()});
  }
  const coverage=states.at(-1).coverage;
  // Use real invalid image bytes (not a synthetic error event) to exercise decode failure.
  await click('[data-action="board"]');await click('[data-action="inn"]');await audit();
  await evaluate(`(()=>{const im=document.querySelector('img.item-art-image');im.dataset.goodSrc=im.src;im.src='data:image/webp;base64,AAAA';})()`);
  await waitFor("document.querySelector('img.item-art-image').hidden");
  assert.equal(await evaluate("getComputedStyle(document.querySelector('img.item-art-image').closest('.item-art').querySelector('svg')).visibility"),'visible');
  await evaluate(`(()=>{const im=document.querySelector('img.item-art-image');im.src=im.dataset.goodSrc;})()`);
  await waitFor("document.querySelector('img.item-art-image').closest('.item-art').classList.contains('art-ready')");
  // Existing keyboard/touch navigation still reaches labelled inventory/comparison.
  const tapPoint=await evaluate(`(()=>{const r=document.querySelector('[data-action="inventory"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await touch('touchStart',[{...tapPoint,radiusX:2,radiusY:2}]);await touch('touchEnd',[]);
  await waitFor(page('inventory'));await audit();
  await evaluate("document.querySelector('[data-action=\"open-item\"]').focus()");
  await key('Enter');await key('Enter','keyUp');await waitFor("!!document.querySelector('dialog[open]')");await audit();
  await key('Escape');await key('Escape','keyUp');await waitFor("!document.querySelector('dialog[open]')");
  await click('[data-action="inn"]');await audit();
  // Render the existing receipt/reveal builders, without changing settlement or saves.
  const rewards=await evaluate(`(async()=>{
    const {HubUI}=await import('./js/ui/hub.js');const h=Object.create(HubUI.prototype);h.save=JSON.parse(JSON.stringify(__arpg.save));h.revealed=1;h.lootState={};
    const r={lootKept:{items:[h.save.items[0]],stacks:{enhance_stone_1:1,potion:1,wood:1},gold:2},lootLost:{items:[],stacks:{},gold:0},xpGained:0,xpLost:0,used:{},restored:{},levelsGained:0,statPointsGained:0};
    const node=document.createElement('div');node.innerHTML=h.receiptHtml(r,false)+h.revealHtml(r);document.body.append(node);
    const imgs=[...node.querySelectorAll('img.item-art-image')];for(const im of imgs){im.loading='eager';await im.decode();if(!im.closest('.item-art').classList.contains('art-ready'))await new Promise(resolve=>im.addEventListener('load',resolve,{once:true}));}
    const wood=imgs.find(im=>im.getAttribute('src')==='assets/items/wood.webp');
    if(!wood||wood.naturalWidth!==96||!wood.closest('.item-art').classList.contains('art-ready'))throw Error('receipt/reveal wood missing');
    const count=imgs.length;node.remove();return count;
  })()`);
  assert.ok(rewards>=3);
  const failedHTTP=events.filter(e=>e.method==='Network.responseReceived'&&e.params.response.status>=400);
  assert.deepEqual(failedHTTP,[]);
  const errors=events.filter(e=>e.method==='Runtime.exceptionThrown'||e.method==='Log.entryAdded'&&e.params.entry.level==='error'||e.method==='Runtime.consoleAPICalled'&&e.params.type==='error');
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));console.log(JSON.stringify({ok:true,states,equipment:5,stages:20,purchase:true,enhance:true,dismantleCancel:true,consoleErrors:errors.length,imageAudits:imageStates.length,coverage,rewards,decodeFailureFallback:true,touchKeyboard:true,httpErrors:failedHTTP.length,screenshots:0}));
} finally {
  socket?.close();
  const stopped = [chrome, server].map(async (child) => {
    if (child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([new Promise((resolveExit) => child.once('exit', resolveExit)), sleep(2500)]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  });
  await Promise.all(stopped);
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
