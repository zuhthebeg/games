import {chromium} from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=Number(process.env.ARPG_EQUIPMENT_PORT||8933),base=`http://127.0.0.1:${port}`;
const server=spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader']});
const report={head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),base,rows:[],errors:[],screenshots:0,worldWrites:0,existingUserSessions:0,sourceBinding:{}};
const out=process.env.ARPG_EQUIPMENT_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-equipment-ux-native.json';
try {
  for(let i=0;i<40;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.equal(server.exitCode,null,'unique test port must be owned by this harness');
  for(const path of ['arpg/js/meta/compare.js','arpg/js/ui/gear-view.js','arpg/js/ui/hub.js','arpg/css/game.css']){
    const local=await readFile(root+'/'+path),served=Buffer.from(await(await fetch(base+'/'+path)).arrayBuffer());
    assert.deepEqual(served,local);report.sourceBinding[path]=createHash('sha256').update(local).digest('hex');
  }
  for(const width of [1280,390]){
    const mobile=width===390,context=await browser.newContext({viewport:{width,height:844},isMobile:mobile,hasTouch:mobile});
    const page=await context.newPage();page.setDefaultTimeout(8000);page.on('pageerror',e=>report.errors.push(e.message));
    const press=async selector=>{const n=page.locator(selector).first();await n.scrollIntoViewIfNeeded();if(mobile)await n.tap();else{await n.focus();await page.keyboard.press((await n.getAttribute('type'))==='checkbox'?'Space':'Enter');}};
    const close=()=>press('dialog[open] [data-action="close-sheet"]');
    const state=()=>page.evaluate(()=>({raw:fixture.raw(),save:JSON.stringify(fixture.hub.save),commits:probe.commits}));
    const layout=async()=>{const l=await page.evaluate(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return{width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,dialogOverflow:d.scrollWidth>d.clientWidth,footer:d.querySelector('footer').getBoundingClientRect().bottom<=innerHeight+1,bad:[...d.querySelectorAll('button,input,table')].filter(n=>{const b=n.getBoundingClientRect();return b.left<r.left-1||b.right>r.right+1}).map(n=>n.textContent)}});assert.equal(l.overflow,false);assert.equal(l.dialogOverflow,false);assert.equal(l.footer,true);assert.deepEqual(l.bad,[]);return l;};
    await page.goto(base+'/arpg/test/equipment-compare-ux-native.html');await page.waitForFunction(()=>window.ready);
    await press('[data-action="socket"][data-slot="weapon"]');
    assert.equal(await page.locator('dialog[open] footer>.item-enhance-action [data-action="socket-forge"]').getAttribute('data-uid'),'bow');
    await press('[data-action="open-item"][data-uid="bow2"]');
    const initial=await state(),actualAttack=await page.locator('[data-line="attack"]').first().getAttribute('data-from'),layouts=[await layout()];
    assert.equal(await page.locator('#compare-ignore-enhancement').isChecked(),false);
    await press('.compare-more.own-details>summary');
    await press('[data-comparison-group="affixes"]>summary');
    await press('#compare-ignore-enhancement');
    assert.match(await page.locator('.compare-mode').innerText(),/강화 제외/);
    assert.equal(await page.locator('#compare-ignore-enhancement').isChecked(),true);
    assert.equal(await page.locator('#compare-ignore-enhancement').evaluate(n=>n===document.activeElement),true);
    assert.notEqual(await page.locator('[data-line="attack"]').first().getAttribute('data-from'),actualAttack);
    assert.equal(await page.locator('.own-details').getAttribute('open'),'');assert.equal(await page.locator('[data-comparison-group="affixes"]').getAttribute('open'),'');
    assert.deepEqual(await state(),initial);assert.match(await page.locator('.p2-weight-after').innerText(),/실제 장착 후 소지/);
    await press('#compare-ignore-enhancement');assert.equal(await page.locator('[data-line="attack"]').first().getAttribute('data-from'),actualAttack);assert.deepEqual(await state(),initial);
    layouts.push(await layout());
    await press('dialog[open] footer>.item-enhance-action [data-action="socket-forge"]');
    assert.equal(await page.evaluate(()=>fixture.hub.selectedUid),'bow2');assert.equal(await page.evaluate(()=>fixture.hub.forgeTab),'enhance');assert.deepEqual(await state(),initial);
    assert.match(await page.locator('.action-footer').innerText(),/주문서 부족/);
    // Bag and seller owned details use the same footer slot; maximum is disabled with reason.
    await press('[data-action="inn"]');await press('[data-action="inventory"]');await press('[data-action="open-item"][data-uid="staff"]');
    assert.equal(await page.locator('.item-enhance-action button').isDisabled(),true);assert.match(await page.locator('#item-enhance-reason').innerText(),/최대 강화 \+12/);await close();
    await press('[data-action="inn"]');await press('[data-action="merchant"]');await press('[data-action="merchant-tab"][data-tab="sell"]');await press('[data-action="open-item"][data-uid="bow2"]');
    assert.equal(await page.locator('footer>.item-enhance-action button').getAttribute('data-uid'),'bow2');await close();
    await press('[data-action="merchant-tab"][data-tab="weapon"]');const stock=await page.evaluate(()=>fixture.stock);await press(`[data-action="open-item"][data-uid="${stock}"]`);
    assert.equal(await page.locator('dialog[open] .item-enhance-action').count(),0);const ledger=await page.locator('#shop-total').innerText();await press('#compare-ignore-enhancement');assert.equal(await page.locator('#shop-total').innerText(),ledger);assert.deepEqual(await state(),initial);
    const gold=await page.evaluate(()=>fixture.hub.save.gold);await press('[data-action="buy-equip"]');assert.equal(await page.locator('[data-action="weapon-confirm"]').count(),0);assert.equal((await state()).commits,initial.commits+1);assert.ok(await page.evaluate(()=>fixture.hub.save.gold)<gold);
    // Actual receipt renderer and its owned-item detail, then native equip with no skill modal.
    await page.evaluate(()=>fixture.receipt());await press('[data-action="open-item"][data-uid="bow2"]');assert.equal(await page.locator('footer>.item-enhance-action button').getAttribute('data-uid'),'bow2');
    const before=await state();await press('[data-action="equip"][data-uid="bow2"]');assert.equal(await page.locator('[data-action="weapon-confirm"]').count(),0);
    assert.equal(await page.evaluate(()=>fixture.hub.save.equipped.weapon),'bow2');assert.equal((await state()).commits,before.commits+1);assert.deepEqual(await page.evaluate(()=>fixture.hub.save.loadout),['volley',null,'pierce_shot']);
    // Different forms still confirm, native cancel restores exact source, shield clear warns.
    await press('[data-action="result-inn"]');await press('[data-action="socket"][data-slot="weapon"]');await press('[data-action="open-item"][data-uid="sword"]');await press('#compare-ignore-enhancement');const cancelChecked=await page.locator('#compare-ignore-enhancement').isChecked();await press('[data-action="equip"]');
    const cancelState=await state();assert.equal(await page.locator('[data-action="weapon-confirm"]').count(),2);await press('[data-action="weapon-cancel"]');assert.deepEqual(await state(),cancelState);assert.equal(await page.locator('#compare-ignore-enhancement').isChecked(),cancelChecked);
    await press('[data-action="equip"]');await press('[data-action="weapon-confirm"].primary');await press('[data-action="socket"][data-slot="offhand"]');await press('[data-action="open-item"][data-uid="shield"]');await press('[data-action="equip"]');
    await press('[data-action="socket"][data-slot="weapon"]');await press('[data-action="open-item"][data-uid="bow2"]');await press('[data-action="equip"]');assert.match(await page.locator('dialog[open]').innerText(),/방패는 해제/);layouts.push(await layout());await press('[data-action="weapon-cancel"]');
    report.rows.push({width,nativeInput:mobile?'touch':'keyboard Enter/Space',compareFocusAndExpandedState:true,compareNoSaveWrites:true,sameFormPurchaseAndReceiptAtomic:true,ownedSocketBagSellReceiptEnhance:true,maxReason:true,forgeNoSpend:true,shieldWarningAndCancel:true,layouts});await context.close();
  }
  assert.deepEqual(report.errors,[]);report.status='PASS';console.log(JSON.stringify(report));
}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(out,JSON.stringify(report,null,2)+'\n');await browser.close();server.kill();}
