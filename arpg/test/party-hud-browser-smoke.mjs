// Real DOM/HUD regression checks. npm install playwright, or set ARPG_PLAYWRIGHT_MODULE.
const { chromium } = await import(process.env.ARPG_PLAYWRIGHT_MODULE || 'playwright');
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
const root = new URL('../../', import.meta.url).pathname;
const port = Number(process.env.ARPG_HTTP_PORT || 8879);
const origin = process.env.ARPG_BASE_URL || `http://127.0.0.1:${port}`;
const server = process.env.ARPG_BASE_URL ? null : spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'], {cwd:root, stdio:'ignore'});
const browser = await chromium.launch({executablePath:process.env.ARPG_CHROMIUM || '/home/cocy/bin/chromium',headless:true,args:['--no-sandbox']});
const errors = [];
try {
  for (let i=0; i<40; i++) { try { if ((await fetch(`${origin}/arpg/icon.svg`)).ok) break; } catch {} await new Promise(r=>setTimeout(r,100)); }
  const html = process.env.ARPG_BASE_URL ? await (await fetch(`${origin}/arpg/`)).text() : readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const importMap = html.match(/<script type="importmap">[\s\S]*?<\/script>/)?.[0] || '';
  const css = html.match(/href="(css\/game\.css[^"]*)"/)[1];
  const hud = html.match(/<section id="hud"[\s\S]*?<\/section>/)[0];
  for (const width of [1280,390]) {
    const page = await browser.newPage({viewport:{width,height:844}});
    page.on('pageerror',error=>errors.push(error.message));
    await page.route(`${origin}/arpg/test/hud-fixture.html`, route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
    await page.goto(`${origin}/arpg/test/hud-fixture.html`);
    await page.setContent(`<base href="${origin}/arpg/">${importMap}<link rel="stylesheet" href="${css}">${hud}<div id="pause"></div>`);
    await page.evaluate(async origin => {
      const [{HUD},{createWorld,addPlayer},{skillIcon}] = await Promise.all([
        import(`${origin}/arpg/js/ui/hud.js`),import(`${origin}/arpg/js/sim/world.js`),import(`${origin}/arpg/js/ui/skill-view.js`)]);
      const world=createWorld();
      const p=addPlayer(world,{pid:'local',weapon:'focus',x:200,y:200,mods:{skills:['healing_light','ember_bolt','frost_lance']}});
      window.fixture={hud:new HUD(),world,p,addPlayer,skillIcon};
      fixture.hud.begin(world);
    },origin);
    await test(`${width}: slots reuse academy icons; preserve cooldowns, blocked slots and re-entry`,async()=>{
      const result=await page.evaluate(()=>{
        const {hud,world,p,skillIcon}=fixture;
        const ids=['skill','skill2','skill3'];
        const icons=ids.map((id,i)=>{ const template=document.createElement('template');template.innerHTML=skillIcon(p.skills[i]);return document.querySelector(`#${id} .skill-icon`)?.isEqualNode(template.content.firstElementChild); });
        p.cds.healing_light=30; hud.update(world,0);
        const cooldown=document.querySelector('#skill').disabled && document.querySelector('#skill small').textContent==='1.0';
        p.skills=['lunge',null,null];hud.begin(world,['lunge','volley']);
        const blocked=document.querySelector('#skill2').classList.contains('blocked') && !!document.querySelector('#skill2 [data-skill-icon="volley"]') && document.querySelector('#skill2').disabled;
        p.skills=['healing_light','ember_bolt','frost_lance'];p.cds={};hud.begin(world);
        return {icons,cooldown,blocked,count:document.querySelectorAll('#actions .skill-icon').length,legacy:document.querySelectorAll('.skill-slot > .icon').length,key:document.querySelector('#skill kbd').textContent};
      });
      assert.deepEqual(result,{icons:[true,true,true],cooldown:true,blocked:true,count:3,legacy:0,key:'K'});
    });
    await test(`${width}: party HP follows damage/heal, safe names, state/removal and guest ordering`,async()=>{
      const result=await page.evaluate(()=>{
        const {hud,world,p,addPlayer}=fixture;
        const ally=addPlayer(world,{pid:'ally',weapon:'blade',x:240,y:200});
        ally.name='<img src=x onerror=alert(1)>';ally.hp=40;ally.maxHp=100;
        const foe=addPlayer(world,{pid:'foe',weapon:'blade',x:250,y:200});foe.team=999;
        hud.update(world,0);
        const panel=document.querySelector('#party-vitals');
        const initial=!!panel && !panel.hidden && panel.querySelectorAll('.party-member').length===1 && panel?.textContent.includes('40/100') && panel?.textContent.includes(ally.name) && !panel?.querySelector('img');
        const row=panel?.firstElementChild;
        ally.hp=75;hud.update(world,0);
        const healed=row===panel?.firstElementChild && panel?.textContent.includes('75/100') && panel?.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')==='75';
        ally.hp=0;ally.dead=true;ally.terminal='death';hud.update(world,0);
        const dead=panel?.textContent.includes('쓰러짐') && panel?.textContent.includes('0/100');
        ally.dead=false;ally.hp=25;ally.terminal='return_scroll';hud.update(world,0);
        const returned=panel?.textContent.includes('귀환');
        ally.terminal=null;world.entities=[ally,p];p.name='방장';p.hp=50;p.maxHp=200;hud.update(world,0);
        const guest=panel?.querySelectorAll('.party-member').length===1 && panel?.textContent.includes('방장') && panel?.textContent.includes('50/200') && !panel?.textContent.includes(ally.name);
        world.entities=[p];hud.begin(world);
        return {initial,healed,dead,returned,guest,soloHidden:panel?.hidden && panel.children.length===0};
      });
      assert.deepEqual(result,{initial:true,healed:true,dead:true,returned:true,guest:true,soloHidden:true});
    });
    await page.close();
  }
  assert.deepEqual(errors,[]);
} finally { await browser.close();server?.kill(); }
