import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../../',import.meta.url)));
const port=Number(process.env.ARPG_CDP_PORT||19561), httpPort=Number(process.env.ARPG_HTTP_PORT||8986);
const profile=await mkdtemp(join(tmpdir(),'arpg-b1-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader',
  '--disable-background-timer-throttling','--disable-renderer-backgrounding',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const errors=[], clients=[];
class CDP {
  constructor(url) {
    this.ws=new WebSocket(url);this.seq=0;this.pending=new Map();
    this.open=new Promise((resolve,reject)=>{this.ws.onopen=resolve;this.ws.onerror=reject;});
    this.ws.onmessage=({data})=>{
      const d=JSON.parse(data);
      if(d.id){this.pending.get(d.id)?.(d);this.pending.delete(d.id);}
      else if(d.method==='Runtime.exceptionThrown'||d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'||d.method==='Log.entryAdded'&&d.params.entry.level==='error') errors.push(d);
    };
  }
  async cmd(method,params={}) {
    await this.open;const id=++this.seq;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(Error(`CDP timeout ${method}`));},180000);
      this.pending.set(id,d=>{clearTimeout(timer);d.error?reject(Error(`${method}: ${JSON.stringify(d.error)}`)):resolve(d.result);});
      this.ws.send(JSON.stringify({id,method,params}));
    });
  }
  async eval(expression) {
    const r=await this.cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);
    return r.result.value;
  }
  async wait(expression,timeout=20000) {
    const started=Date.now();while(Date.now()-started<timeout){if(await this.eval(expression))return;await sleep(100);}
    throw Error(`timeout ${expression}`);
  }
  async navigate(url) { await this.cmd('Page.navigate',{url}); }
}
try {
  let targets;for(let i=0;i<80;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}if(targets?.some(t=>t.type==='page'))break;await sleep(100);}
  assert.equal(server.exitCode,null);
  const origin=`http://127.0.0.1:${httpPort}`,host=new CDP(targets.find(t=>t.type==='page').webSocketDebuggerUrl);clients.push(host);
  const results=[];
  const activate=async(selector,mobile=false)=>{
    const p=await host.eval(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not actionable '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,checkbox:n.type==='checkbox'};})()`);
    if(mobile){await host.cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});await sleep(60);await host.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else{const key=p.checkbox?' ':'Enter',code=p.checkbox?'Space':'Enter';await host.cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code,windowsVirtualKeyCode:p.checkbox?32:13,...(p.checkbox?{}:{text:'\r'})});await host.cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code,windowsVirtualKeyCode:p.checkbox?32:13});}
    await sleep(120);
  };
  for(const width of [1280,390])for(const mode of ['default','classic-reduced']){
    const mobile=width<600,height=mobile?844:800;
    await host.cmd('Emulation.setFocusEmulationEnabled',{enabled:true});await host.cmd('Runtime.enable');await host.cmd('Page.enable');await host.cmd('Log.enable');
    await host.cmd('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile});await host.cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile});
    const url=`${origin}/arpg/?debug=0${mode==='classic-reduced'?'&fx=classic':''}`;
    await host.navigate(url);await host.wait('window.__arpg');
    await host.eval(`(async()=>{const {createSave,SaveStore}=await import('./js/meta/save.js');const{statBudget,BASE_STATS,STAT_KEYS}=await import('./js/meta/stats.js');
      const s=createSave({name:'B1 smoke',weapon:'blade',answers:[0,0,0,0,0],createdAt:1});s.level=30;s.stats={...BASE_STATS,str:90};s.statPoints=statBudget(30)-STAT_KEYS.reduce((n,k)=>n+s.stats[k]-BASE_STATS[k],0);
      s.gold=5000;s.cleared.S1=true;s.flags.chiefPity=true;s.autoUse={potion:false,hp:50,mp:50,recall:false};s.stacks={potion:1,mana_potion:0,return_scroll:1,rune_shard:50,scrap:60,fang:20,frost_shard:20};s.loadout=[null,null,null];
      new SaveStore(localStorage).save(s);localStorage.setItem('arpg.autoAttack','0');})()`);
    await host.cmd('Page.reload');await host.wait(`document.querySelector('#meta-screen').dataset.page==='inn'`);
    await activate('[data-action="trainer"]',mobile);
    for(const[id,req]of [['ground_slam',30],['armor_break',45]]) {
      assert.match(await host.eval(`document.querySelector('[data-skill="${id}"]').textContent`),new RegExp(`요구 힘 ${req}`));
      assert.equal(await host.eval(`!!document.querySelector('[data-skill="${id}"] .slot-blocked')`),true);
      await activate(`[data-action="learn-skill"][data-id="${id}"]`,mobile);
    }
    assert.equal(await host.eval('__arpg.save.gold'),4570);
    assert.deepEqual(await host.eval('[...__arpg.save.loadout]'),['ground_slam','armor_break',null]);
    const blocked=await host.eval(`[...document.querySelectorAll('.loadout-slot.blocked')].map(n=>({id:n.dataset.id,x:!!n.querySelector('.slot-blocked')}))`);
    assert.equal(blocked.length,2);assert.ok(blocked.every(n=>n.x));
    await activate('[data-action="inn"]',mobile);await activate('[data-action="forge"]',mobile);
    for(const id of ['rune_maul','warden_maul']) {
      await activate('[data-action="forge-tab"][data-tab="craft"]',mobile);
      await activate(`[data-action="craft"][data-id="${id}"]`,mobile);
      assert.equal(await host.eval(`__arpg.save.items.at(-1).id`),id);await host.wait('!document.querySelector(".craft-fx")');
    }
    const uid=await host.eval(`__arpg.save.items.find(i=>i.id==='rune_maul').uid`);
    await activate('[data-action="inn"]',mobile);await activate('[data-action="inventory"]',mobile);await activate(`[data-action="open-item"][data-uid="${uid}"]`,mobile);await activate(`dialog[open] [data-action="equip"][data-uid="${uid}"]`,mobile);
    assert.equal(await host.eval(`__arpg.save.equipped.weapon`),uid);
    await activate('[data-action="inn"]',mobile);await activate('[data-action="character"]',mobile);
    await activate('[data-action="character-tab"][data-tab="skills"]',mobile);
    assert.equal(await host.eval(`document.querySelectorAll('.loadout-slot.blocked').length`),0);
    assert.equal(await host.eval(`document.querySelectorAll('.character-skill.use-blocked').length`),0);
    await activate('[data-action="inn"]',mobile);await activate('[data-action="board"]',mobile);
    await activate('[data-action="sortie"][data-stage="S1"]',mobile);
    if(mode==='classic-reduced'){await activate('.help:has(#sortie-reduced) summary',mobile);await activate('#sortie-reduced',mobile);assert.equal(await host.eval('document.querySelector("#sortie-reduced").checked'),true);}
    // Read-only observations of native app events/vector output. Never change the world.
    await host.eval(`(async()=>{const{ArenaRenderer}=await import('./js/render/renderer.js');
      window.b1Events=[];window.b1Visual={charges:[],active:[],sunder:false,readonly:true,newAtlasRequested:false};
      const events=ArenaRenderer.prototype.events,render=ArenaRenderer.prototype.render;
      if(!window.b1Original){window.b1Original={events,render};ArenaRenderer.prototype.events=function(w,j){b1Events.push(...JSON.parse(JSON.stringify(j)));return events.call(this,w,j);};
      ArenaRenderer.prototype.render=function(w,...args){const before=JSON.stringify(w);const result=render.call(this,w,...args);b1Visual.readonly&&=before===JSON.stringify(w);b1Visual.newAtlasRequested ||= this.skillVfx.fxLoads.has('ground_slam')||this.skillVfx.fxLoads.has('armor_break');
        for(const e of w.entities){const v=this.views.get(e.id);if(v?.bluntCharge.visible&&!b1Visual.charges.some(n=>n.id===e.act.id))b1Visual.charges.push({id:e.act.id,rotation:v.bluntCharge.rotation,x:v.bluntCharge.x,y:v.bluntCharge.y,path:v.bluntCharge.context.instructions[0]?.data.path.instructions});
          if(v?.sunder.visible)b1Visual.sunder=true;if(e.act?.def.requiresForm==='blunt'&&e.act.phase==='active'&&!b1Visual.active.includes(e.act.id))b1Visual.active.push(e.act.id);}
        return result;};}})()`);
    await activate('[data-action="launch"]',mobile);await host.wait('__arpg.world?.round.stageId==="S1" && __arpg.world.entities.some(e=>e.type==="scarecrow")');
    assert.equal(await host.eval('__arpg.world.entities[0].weaponForm'),'blunt');
    assert.deepEqual(await host.eval('[...__arpg.world.entities[0].skills]'),['ground_slam','armor_break',null]);
    const hud=await host.eval(`['skill','skill2'].map(id=>({id,label:document.querySelector('#'+id).getAttribute('aria-label'),blocked:document.querySelector('#'+id).classList.contains('blocked')}))`);
    assert.deepEqual(hud.map(n=>n.label),['대지 강타','갑옷 부수기']);assert.ok(hud.every(n=>!n.blocked));
    let held=[],touching=false;const deadline=Date.now()+15000;
    while(Date.now()<deadline){
      const state=await host.eval(`(()=>{const w=__arpg.world,p=w.entities[0],t=w.entities.find(e=>e.type==='scarecrow');return {dx:t.x-65-p.x,dy:t.y-p.y};})()`);
      const d=Math.hypot(state.dx,state.dy);if(d<12)break;
      if(mobile){if(!touching){await host.cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:70,y:480}]});touching=true;}await host.cmd('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:70+state.dx/d*42,y:480+state.dy/d*42}]});}
      else {const want=[...(state.dx>8?['KeyD']:state.dx<-8?['KeyA']:[]),...(state.dy>8?['KeyS']:state.dy<-8?['KeyW']:[])];for(const code of held)if(!want.includes(code))await host.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});for(const code of want)if(!held.includes(code))await host.cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key:code.slice(3).toLowerCase()});held=want;}
      await sleep(60);
    }
    if(touching)await host.cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});for(const code of held)await host.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key:code.slice(3).toLowerCase()});
    const cast=async(code,key,node)=>{if(mobile)await activate('#'+node,true);else{await host.cmd('Input.dispatchKeyEvent',{type:'keyDown',code,key});await sleep(70);await host.cmd('Input.dispatchKeyEvent',{type:'keyUp',code,key});}};
    await cast('KeyL','l','skill2');await host.wait('b1Events.some(e=>e.type==="hit"&&e.ability==="armor_break")');
    await host.wait('b1Visual.sunder && __arpg.world.entities.find(e=>e.type==="scarecrow").sunder.expiresTick>__arpg.world.tick');
    await host.wait('!__arpg.world.entities[0].act');
    await cast('KeyK','k','skill');await host.wait('b1Events.some(e=>e.type==="hit"&&e.ability==="ground_slam")');
    // Render a decoded authoritative snapshot: guest state marker uses transmitted sunder,
    // not a predicted debuff. This is a separate renderer, with no sim writes.
    const guest=await host.eval(`(async()=>{const{Container}=await import('./vendor/pixi-8.22.0.min.mjs');const{ArenaRenderer}=await import('./js/render/renderer.js');const{encodeSnapshot,decodeSnapshot}=await import('./js/net/protocol.js');
      const w=decodeSnapshot(JSON.parse(JSON.stringify(encodeSnapshot(__arpg.world))),'local'),stage=new Container(),r=new ArenaRenderer({stage,screen:{width:${width},height:${height}}});r.reset(w,${mode==='classic-reduced'});r.render(w,1,1/30);const m=w.entities.find(e=>e.type==='scarecrow');const proof={sunder:m.sunder,visible:r.views.get(m.id).sunder.visible,form:w.entities[0].weaponForm};stage.destroy({children:true});return proof;})()`);
    assert.ok(guest.visible);assert.equal(guest.form,'blunt');
    await host.wait('b1Visual.active.includes("ground_slam")');
    const proof=await host.eval(`JSON.parse(JSON.stringify({hits:b1Events.filter(e=>e.type==='hit'&&['ground_slam','armor_break'].includes(e.ability)),visual:b1Visual,mp:__arpg.world.entities[0].mp,dmgMult:__arpg.world.entities[0].dmgMult.blade,fxRequested:__arpg.feedback.fxRequested}))`);
    assert.ok(proof.hits.some(e=>e.ability==='ground_slam'&&e.dmg===Math.round(64*proof.dmgMult*1.15)));
    assert.ok(proof.visual.readonly);assert.equal(proof.visual.charges.length,2);assert.ok(proof.visual.active.includes('armor_break'));
    const slam=proof.visual.charges.find(n=>n.id==='ground_slam');assert.ok(slam.path.some(n=>n.action==='circle'&&n.data[0]===40&&n.data[2]===128));
    const armor=proof.visual.charges.find(n=>n.id==='armor_break');assert.ok(armor.path.some(n=>n.action==='arc'&&n.data[2]===110));
    assert.equal(proof.visual.newAtlasRequested,false);
    const boxes=await host.eval(`[...document.querySelectorAll('#actions button')].filter(n=>!n.hidden).map(n=>{const r=n.getBoundingClientRect();return {id:n.id,l:r.left,t:r.top,r:r.right,b:r.bottom}})`);
    for(const b of boxes)assert.ok(b.l>=0&&b.t>=0&&b.r<=width&&b.b<=height,JSON.stringify(b));
    results.push({viewport:[width,height],mode,input:mobile?'native touch joystick/skills':'native keyboard movement/L/K',academyPurchase:true,craftBoth:true,equip:true,blockedBefore:true,hud,guest,...proof});
  }
  assert.equal(errors.length,0,JSON.stringify(errors.slice(0,3)));
  console.log(JSON.stringify({ok:true,results,consoleErrors:0,screenshots:0,physicalPhone:false},null,2));
}finally{for(const c of clients)c.ws.close();chrome.kill('SIGTERM');server.kill('SIGTERM');await sleep(500);await rm(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
