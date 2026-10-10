// node arpg/ui-mock/verify.mjs. Local server + installed Playwright only.
// Screenshots are optional validation artifacts: MOCK_SCREENSHOTS=/absolute/tmp/path.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '../..');
const server = spawn('python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
const ready = new Promise((resolve, reject) => {
  server.stdout.on('data', chunk => { const m = String(chunk).match(/port (\d+)/); if (m) resolve(Number(m[1])); });
  server.on('error', reject); server.on('exit', code => reject(new Error(`server exit ${code}`)));
});
const views = ['inn','shop','forge','board','combat','result','equipment','inventory','merchant','comparison','reveal','upgrade'];
const report = { viewports: [{width:390,height:844},{width:360,height:640},{width:1280,height:900}], errors:[], networkErrors:[], states:[], checks:[], screenshots:[] };
let browser;
try {
  const port = await ready, origin = `http://127.0.0.1:${port}`;
  browser = await chromium.launch({headless:true}); report.chromium = browser.version();
  const shotDir = process.env.MOCK_SCREENSHOTS;
  if (shotDir) { assert(path.isAbsolute(shotDir) && shotDir.includes('/tmp/'), 'Validation images must live under tmp'); await mkdir(shotDir, {recursive:true}); }
  for (const viewport of report.viewports) {
    const page = await browser.newPage({viewport, hasTouch:true});
    const prefix = `${viewport.width}x${viewport.height}`;
    page.on('pageerror', e => report.errors.push(`${prefix} ${e.message}`));
    page.on('console', e => { if(e.type()==='error') report.errors.push(`${prefix} ${e.text()}`); });
    page.on('response', r => { if(r.status()>=400) report.networkErrors.push(`${prefix} ${r.status()} ${r.url()}`); });
    const external=[]; page.on('request', r => { if(!r.url().startsWith(origin+'/')) external.push(r.url()); });
    await page.goto(origin+'/arpg/ui-mock/');
    async function audit(name) {
      const metrics=await page.evaluate(() => {
        const modal=document.querySelector('dialog[open]');
        const scope=modal || document;
        const nodes=[...scope.querySelectorAll('button,summary')].filter(el=>el.getClientRects().length);
        const raw=nodes.map(el=>{const r=el.getBoundingClientRect();return {name:el.getAttribute('aria-label')||el.innerText.replaceAll('\n',' '),x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,el};});
        const undersized=raw.filter(r=>r.width<43.9||r.height<43.9).map(({el,...r})=>r);
        const visible=raw.map(({el,...r})=>{
          let clip={x:0,y:0,right:innerWidth,bottom:innerHeight};
          for(let parent=el.parentElement;parent;parent=parent.parentElement){const css=getComputedStyle(parent);if(/auto|scroll|hidden/.test(css.overflowY+css.overflowX)){const b=parent.getBoundingClientRect();clip={x:Math.max(clip.x,b.x),y:Math.max(clip.y,b.y),right:Math.min(clip.right,b.right),bottom:Math.min(clip.bottom,b.bottom)};}}
          return {...r,x:Math.max(r.x,clip.x),y:Math.max(r.y,clip.y),right:Math.min(r.right,clip.right),bottom:Math.min(r.bottom,clip.bottom)};
        }).filter(r=>r.right-r.x>1&&r.bottom-r.y>1);
        const overlaps=[];
        for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j];if(Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1)overlaps.push([a.name,b.name]);}
        const horizontal=[];
        for(const el of [document.documentElement,...document.querySelectorAll('.screen:not([hidden]) .content,.p2-sheet[open] .p2-sheet-body')])if(el.scrollWidth>el.clientWidth+1)horizontal.push({node:el.className||el.tagName,scroll:el.scrollWidth,width:el.clientWidth});
        const fixed=modal?[...modal.querySelectorAll('header button,footer button')]:[...document.querySelectorAll('.review-bar button,.screen:not([hidden]) .action-footer button')];
        const outside=fixed.map(el=>el.getBoundingClientRect()).filter(r=>r.x<-.1||r.y<-.1||r.right>innerWidth+.1||r.bottom>innerHeight+.1).map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom}));
        return {controls:raw.length,visibleControls:visible.length,undersized,overlaps,horizontal,outside};
      });
      report.states.push({viewport:prefix,name,...metrics});
      for(const field of ['undersized','overlaps','horizontal','outside'])assert.deepEqual(metrics[field],[],`${prefix}/${name} ${field}`);
    }
    async function tab(view){ await page.locator(`[data-screen="${view}"]`).click(); await audit(view); }
    async function scrollAudit(selector,name){
      const locator=page.locator(selector); const max=await locator.evaluate(el=>el.scrollHeight-el.clientHeight);
      if(max>0){for(const [tag,fraction] of [['middle',.5],['bottom',1]]){await locator.evaluate((el,f)=>el.scrollTop=(el.scrollHeight-el.clientHeight)*f,fraction);await audit(name+'/'+tag);}await locator.evaluate(el=>el.scrollTop=0);}
    }
    for(const view of views){await tab(view);if(await page.locator(`#screen-${view} .content`).count())await scrollAudit(`#screen-${view} .content`,view);}
    // Existing six screens remain functional, including legacy gear/consumable rules.
    await tab('shop'); for(const i of ['potion','mana','scroll']){await page.locator(`[data-item="${i}"]`).click();await audit('legacy-shop/'+i);}
    assert.equal(await page.locator('#shop-total').innerText(),'6 G');assert(await page.locator('[data-count="1"]').isDisabled());
    await page.locator('[data-buy]').click();await audit('legacy-confirm');await page.keyboard.press('Escape');
    await tab('forge');for(const i of ['iron','bow','staff']){await page.locator(`[data-gear="${i}"]`).click();await audit('legacy-gear/'+i);}
    await tab('combat');const anchors=[];
    for(const i of ['blade','bow','focus']){await page.locator(`button[data-kit="${i}"]`).click();await audit('combat/'+i);anchors.push(await page.locator('.battle-vitals,.common-supplies button,.fixed-dodge').evaluateAll(nodes=>nodes.map(el=>{const r=el.getBoundingClientRect();return [r.x,r.y,r.width,r.height];})));}
    assert.deepEqual(anchors[0],anchors[1]);assert.deepEqual(anchors[0],anchors[2]);
    await tab('result');for(const i of ['clear','death']){await page.locator(`button[data-terminal="${i}"]`).click();await audit('result/'+i);}
    // Schema and sample invariants: five slots, four grades, affix counts, shop cap.
    const data=await page.evaluate(()=>{
      const {compareItems,save,equipped,bag,stock}=window.P2Mock;
      return {slotCount:Object.keys(equipped).length,stock:stock.map(i=>({rarity:i.rarity,affixes:i.affixes.length})),affixes:bag.map(i=>({rarity:i.rarity,count:i.affixes.length})),cases:['iron','heavy','locked'].map(id=>compareItems(equipped[bag.find(i=>i.uid===id).slot],bag.find(i=>i.uid===id),save))};
    });
    assert.equal(data.slotCount,5);assert.equal(data.stock.length,8);assert(data.stock.every(i=>['common','fine'].includes(i.rarity)));
    assert(data.affixes.every(i=>i.count==={common:0,fine:1,rare:2,epic:3}[i.rarity]));
    data.cases.forEach(c=>{assert.deepEqual(Object.keys(c).sort(),['lines','locked','weightAfter']);c.lines.forEach(l=>assert.deepEqual(Object.keys(l).sort(),['delta','from','good','label','to']));});
    assert(data.cases[0].lines.every(l=>l.good));assert.equal(data.cases[1].lines[0].good,true);assert.equal(data.cases[1].lines[1].good,false);assert.equal(data.cases[1].lines[2].good,false);assert.equal(data.cases[2].locked,true);
    await tab('equipment');for(const slot of ['weapon','head','body','hands','feet']){await page.locator(`[data-p2-slot="${slot}"]`).click();await audit('socket/'+slot);await scrollAudit('.p2-sheet-body','socket/'+slot);await page.keyboard.press('Escape');}
    await tab('inventory');for(const f of ['all','weapon','head','body','hands','feet']){await page.locator(`[data-p2-filter="${f}"]`).click();await audit('inventory/'+f);}
    await page.locator('[data-p2-filter="all"]').click();for(let i=0;i<3;i++){await page.locator('[data-p2-sort]').click();await audit('inventory/sort'+i);}
    // Long press and regular tap both open the same dialog.
    await page.locator('#p2-grid [data-p2-item]').first().dispatchEvent('pointerdown',{pointerType:'touch'});
    await page.waitForSelector('#compare-sheet[open]');await audit('inventory/longpress');await page.locator('#p2-grid [data-p2-item]').first().dispatchEvent('pointercancel');await page.keyboard.press('Escape');
    await page.locator('#p2-grid [data-p2-item]').first().click();await audit('inventory/tap');await page.keyboard.press('Escape');
    await page.locator('.p2-icon-catalog summary').click();await scrollAudit('#screen-inventory .content','icon-catalog');await page.locator('.p2-icon-catalog summary').click();
    await tab('merchant');for(const kind of ['weapon','armor','sell']){await page.locator(`[data-p2-shop="${kind}"]`).click();await audit('merchant/'+kind);await scrollAudit('#screen-merchant .content','merchant/'+kind);await page.locator('#p2-stock button').first().click();await audit('merchant/'+kind+'/sheet');await scrollAudit('.p2-sheet-body','merchant/'+kind+'/sheet');assert.match(await page.locator('#p2-sheet-footer').innerText(),kind==='sell'?/销售|판매/:/구매/);await page.keyboard.press('Escape');}
    await page.locator('[data-p2-shop="weapon"]').click();const stockBefore = await page.locator('#p2-stock button').first().getAttribute('data-p2-item');await page.locator('[data-p2-refresh]').click();assert.match(await page.locator('#p2-refresh').innerText(),/40G/);assert.notEqual(await page.locator('#p2-stock button').first().getAttribute('data-p2-item'),stockBefore);await page.locator('[data-p2-refresh]').click();assert.match(await page.locator('#p2-refresh').innerText(),/80G/);await page.locator('#p2-stock button').first().click();await audit('merchant/refreshed-sheet');await page.keyboard.press('Escape');
    await tab('comparison');for(const id of ['iron','heavy','locked']){await page.locator(`[data-p2-case="${id}"]`).click();await audit('comparison/'+id);await scrollAudit('.p2-sheet-body','comparison/'+id);assert.match(await page.locator('.p2-sheet-body').innerText(),/장착 후 무게/);if(id==='heavy')assert.match(await page.locator('.p2-sheet-body').innerText(),/손해/);if(id==='locked'){assert(await page.locator('[data-p2-confirm]').isDisabled());assert.match(await page.locator('.p2-lock').innerText(),/필요 Lv.7, 현재 Lv.4/);}assert.equal(await page.locator('.p2-sheet footer .primary').evaluate(el=>el.getBoundingClientRect().height),52);await page.keyboard.press('Escape');assert.equal(await page.locator(`[data-p2-case="${id}"]`).evaluate(el=>el===document.activeElement),true);}
    await tab('upgrade');for(const target of ['iron','staff','locked']){await page.locator(`[data-p2-target="${target}"]`).click();for(const state of ['missing','ready']){await page.locator(`[data-p2-stones="${state}"]`).click();await audit('upgrade/'+target+'/'+state);await scrollAudit('#screen-upgrade .content','upgrade/'+target+'/'+state);assert.equal(await page.locator('#p2-upgrade-action').isDisabled(),state==='missing');if(state==='missing')assert.match(await page.locator('#p2-upgrade-detail').innerText(),/몬스터 드랍으로 획득/);}}
    await page.locator('[data-p2-upgrade]').click();await audit('upgrade/confirm');await page.keyboard.press('Escape');
    await tab('reveal');for(let i=1;i<=3;i++){await page.locator('[data-p2-reveal]').click();assert.equal(await page.locator('.p2-loot-card').count(),i);await audit('reveal/'+i);await scrollAudit('#screen-reveal .content','reveal/'+i);}
    assert(await page.locator('[data-p2-reveal]').isDisabled());assert.equal(await page.locator('.p2-loot-card.sheen').count(),2);
    await page.locator('[data-p2-loot-action="보관"]').first().click();assert.match(await page.locator('.p2-loot-status').first().innerText(),/보관 선택/);
    await page.locator('[data-p2-loot-action="분해"]').first().click();assert.match(await page.locator('.p2-sheet-body').innerText(),/고철 \+12/);await audit('reveal/dismantle-confirm');await page.keyboard.press('Escape');
    await tab('inn');await page.locator('[data-screen="inn"]').focus();await page.keyboard.press('End');assert.equal(await page.locator('[data-screen="upgrade"]').getAttribute('aria-selected'),'true');await page.keyboard.press('Home');assert.equal(await page.locator('[data-screen="inn"]').getAttribute('aria-selected'),'true');
    assert.equal(await page.locator('[data-screen="inn"]').evaluate(el=>getComputedStyle(el).outlineStyle),'solid');
    await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('[data-screen="inn"]').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);assert.deepEqual(external,[]);assert.deepEqual(await page.evaluate(()=>[localStorage.length,sessionStorage.length]),[0,0]);
    // All SVG symbols and hero atlas decode locally; missing symbols cannot hide as empty requests.
    const symbols=await page.evaluate(async()=>{const xml=await(await fetch('icons.svg')).text();return [...new DOMParser().parseFromString(xml,'image/svg+xml').querySelectorAll('symbol')].map(n=>n.id);});assert.equal(symbols.length,14);
    const decoded=await page.evaluate(async()=>{const image=new Image();image.src='../assets/sprites/hero-sword/atlas-0.webp';await image.decode();return image.naturalWidth;});assert.equal(decoded,2048);
    if(shotDir){for(const view of views.slice(6)){await tab(view);await page.emulateMedia({reducedMotion:'reduce'});const file=path.join(shotDir,`${prefix}-${view}.png`);await page.screenshot({path:file});report.screenshots.push(file);}await tab('comparison');await page.locator('[data-p2-case="heavy"]').click();const file=path.join(shotDir,`${prefix}-tradeoff-sheet.png`);await page.screenshot({path:file});report.screenshots.push(file);}
    await page.close();
    report.checks.push(`${prefix}: 12 screens + scroll reachability, legacy variants, 5 sockets, filters/sort/long press, 8 stock + buy/sell, 3 comparison states, 3 stone tiers × 2 availability states, 3 sequential reveals, keyboard focus/reduced-motion/local assets/storage`);
  }
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.networkErrors,[]);
  report.passed=true;report.limitations=['DOM geometry and local Chromium, not real-device thumb reach or aesthetic approval','Scroll containers are intentional; visible clipped intersections audited at top/middle/bottom','Gameplay formulas and stock rolls are fixtures, not production implementations'];
  await writeFile(path.join(dir,'verification.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:true,chromium:report.chromium,viewports:report.viewports,states:report.states.length,consoleErrors:report.errors.length,networkErrors:report.networkErrors.length,overlap:0,undersized:0,horizontalOverflow:0,screenshots:report.screenshots.length,checks:report.checks},null,2));
} finally {if(browser)await browser.close();server.kill('SIGTERM');if(server.exitCode===null)await once(server,'exit').catch(()=>{});}
