// Isolated synthetic saves. Ordinary native UI, real deployed WebSocket relay only.
import { chromium } from '/home/cocy/.openclaw/workspace/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {trained} from './fixtures/trained.js';
import {learnSkill,setSlot} from '../js/meta/skills.js';
import { createSave, validateSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
const root=fileURLToPath(new URL('../..',import.meta.url)),port=Number(process.env.ARPG_HTTP_PORT||8979);
const base=(process.env.ARPG_BASE_URL||`http://127.0.0.1:${port}`).replace(/\/$/,'');
const output=process.env.ARPG_RELAY_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-four-real-relay.json';
const spellFamily=process.env.ARPG_REAL_SPELL_FAMILY==='bow'?'bow':'focus';
const spellIds=spellFamily==='bow'?['rain_arrow','spinning_shot']:['meteor','firewall'];
const localRelay=process.env.ARPG_USE_LOCAL_RELAY==='1';
const localQuery=localRelay?'&dev=1&coopRelayTest=1':'';
const server=process.env.ARPG_BASE_URL?null:spawn('python3',['-m','http.server',String(port),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const browser=await chromium.launch({executablePath:'/home/cocy/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
const report={base,head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),transport:localRelay?'LOCAL patched RoomDO, not deployed proof':'REAL deployed relay connection',status:'RUNNING',screenshots:0,worldWrites:0,rows:[],errors:[],sourceBinding:{}};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const contexts=[];
function fixture(lineage){let s=lineage==='human'?createSave({name:'Relay Hunter',answers:[0,0,0,0,0],createdAt:123,weapon:spellFamily}):createSkeletonSave({lineage,name:'Relay Bones',answers:[0,0,0,0,0],createdAt:321});if(lineage==='human'){s=trained(s);s.gold=2000;for(let i=0;i<spellIds.length;i++)s=setSlot(learnSkill(s,spellIds[i]),spellFamily,i,spellIds[i]);}s.cleared.S1=true;s.items[0].enhance=6;s.autoUse={potion:false,hp:50,mp:50,recall:false};assert.ok(validateSave(s));return s;}
async function client(lineage,width,{emptySlot=false,foreignHuman=false}={}){const ctx=await browser.newContext({viewport:{width,height:844},isMobile:width===390,hasTouch:width===390});contexts.push(ctx);await ctx.route('**/www.googletagmanager.com/**',r=>r.fulfill({body:''}));await ctx.route('**/api.qrserver.com/**',r=>r.abort());await ctx.addInitScript(({human,bone,emptySlot,foreignHuman})=>{if(location.protocol!=='http:'&&location.protocol!=='https:')return;if(!localStorage.getItem('relay-fixture')){if(!emptySlot){localStorage.setItem('arpg.save.v1',foreignHuman?'{foreign human bytes':JSON.stringify(human));localStorage.setItem('arpg.save.v1.slots.skeleton_knight',JSON.stringify(bone));}localStorage.setItem('arpg.autoAttack','0');localStorage.setItem('relay-fixture','1');}},{human:fixture('human'),bone:fixture('skeleton_knight'),emptySlot,foreignHuman});const page=await ctx.newPage();page.setDefaultTimeout(20000);const wire=[];page.on('pageerror',e=>report.errors.push(e.message));page.on('websocket',ws=>{const row={url:ws.url(),sent:[],received:[],hits:[],errors:[]};wire.push(row);ws.on('framesent',e=>{try{const d=JSON.parse(e.payload);row.sent.push({type:d.type,config:d.config,rt:d.data?.t});}catch{}});ws.on('framereceived',e=>{try{const d=JSON.parse(e.payload);row.received.push({type:d.type,config:d.config,players:d.players,reason:d.reason,rt:d.data?.t});for(const event of d.data?.events||[])if(event.event.type==='hit'&&!row.hits.some(h=>h.seq===event.seq))row.hits.push(event);}catch{}});ws.on('socketerror',e=>row.errors.push(e));});const press=async selector=>{const b=page.locator(selector).first();await b.scrollIntoViewIfNeeded();if(width===390)await b.tap();else{await b.focus();await page.keyboard.press('Enter');}};return{ctx,page,wire,press,lineage};}
async function enter(c,url=''){await c.page.goto(base+'/arpg/'+(url||`?character=${c.lineage}${localQuery}`));await c.page.locator('#inn-name').waitFor();}
async function consent(c,invasion){await c.press('[data-action="board"]');await c.press(`[data-action="${invasion?'invasion':'coop'}"]`);if(invasion)await c.press('[data-action="invasion-accept"]');}
try{for(let i=0;i<60;i++){try{if((await fetch(base+'/arpg/')).ok)break;}catch{}await pause(100);}
const entryHtml=await(await fetch(base+'/arpg/',{cache:'no-store'})).text();
const imports=JSON.parse(entryHtml.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
for(const f of ['arpg/js/net/lobby.js','arpg/js/main.js','arpg/js/net/session.js','arpg/js/ui/hub.js','lib/mp-lobby.js','lib/multiplayer.js']){
 const key='./'+f.replace(/^arpg\//,'');
 const src=f.startsWith('arpg/')?imports[key]:entryHtml.match(new RegExp('src="(/'+f.replaceAll('.','\\.')+'[^" ]*)"'))?.[1];
 assert.ok(src,'actual served entry URL for '+f);const url=new URL(src,base+'/arpg/').href;
 const local=await readFile(root+'/'+f),served=Buffer.from(await(await fetch(url,{cache:'no-store'})).arrayBuffer());assert.deepEqual(served,local,f);report.sourceBinding[f]={url,sha256:createHash('sha256').update(local).digest('hex')};
}
const cases=[1280,390].map(width=>({mode:'coop',width,hostLineage:'human'}));
for(const {mode,width,hostLineage} of cases){
 if(process.env.ARPG_RELAY_MODES&&!process.env.ARPG_RELAY_MODES.split(',').includes(mode))continue;
 const invasion=mode==='invasion',host=await client(hostLineage,width),guest=await client(invasion?(hostLineage==='human'?'skeleton_knight':'human'):'human',width),row={mode,width,hostLineage,hostWire:host.wire,guestWire:guest.wire};report.rows.push(row);
 await enter(host);await consent(host,invasion);await host.press('#mpl-create');await host.page.waitForFunction(()=>document.querySelectorAll('#mpl-list .mpl-pl').length===1);row.room=await host.page.locator('.mpl-room b').innerText();row.invite=decodeURIComponent(await host.page.locator('img[alt="입장 QR"]').getAttribute('src')).split('&data=')[1];
 const invite=new URL(row.invite);assert.equal(invite.searchParams.get('room'),row.room);assert.equal(invite.searchParams.get('invasion'),invasion?'1':null);if(invasion)assert.equal(invite.searchParams.has('character'),false);
 const inviteQuery=new URL(invite);if(localRelay){inviteQuery.searchParams.set('dev','1');inviteQuery.searchParams.set('coopRelayTest','1');}
 // Ordinary copied link, fresh isolated local slots. Invasion link cannot connect before consent.
 await guest.page.goto(inviteQuery.href);
 if(invasion){await guest.press(`[data-action="choose-${guest.lineage==='human'?'human':'skeleton'}"]`);await guest.page.locator('[data-action="invasion-accept"]').waitFor();assert.equal(guest.wire.length,0,'no relay join before explicit consent');assert.match(await guest.page.locator('#meta-screen').innerText(),guest.lineage==='human'?/인간 · 사냥꾼 편/:/해골 · 몬스터 편/);await guest.press('[data-action="invasion-accept"]');}
 await guest.page.waitForFunction(()=>document.querySelectorAll('#mpl-list .mpl-pl').length===2);await guest.press('#mpl-ready');await host.page.waitForFunction(()=>!document.querySelector('#mpl-start').disabled);
 await host.page.locator('#arpg-party-stage').selectOption('S1');await host.press('#mpl-start');
 try{await host.page.waitForFunction(()=>__arpg.multi?.phase==='running',null,{timeout:10000});await guest.page.waitForFunction(()=>__arpg.multi?.phase==='running',null,{timeout:10000});row.started=true;}catch{row.started=false;row.hostStatus=await host.page.locator('#mpl-status').innerText().catch(()=>null);row.guestStatus=await guest.page.locator('#mpl-status').innerText().catch(()=>null);if(!process.env.ARPG_RELAY_EXPECT_BLOCKED)throw Error('real relay did not start: '+JSON.stringify({mode,width,hostLineage}));}
 if(row.started){
  await guest.page.waitForFunction(()=>__arpg.world?.entities.filter(p=>p.kind==='player').length===2);
  const hostUid=await host.page.evaluate(()=>__arpg.multi.uid),guestUid=await guest.page.evaluate(()=>__arpg.multi.uid);
  assert.equal(await host.page.evaluate(()=>__arpg.multi.ownsSim),true);assert.equal(await guest.page.evaluate(()=>__arpg.multi.ownsSim),false);
  const observe=async()=>host.page.evaluate(()=>__arpg.world.entities.filter(p=>p.kind==='player').map(p=>({pid:p.pid,id:p.id,x:p.x,y:p.y,hp:p.hp,team:p.team,invasionRole:p.invasionRole,terminal:p.terminal})));
  row.initial=await observe();assert.equal(new Set(row.initial.map(p=>p.team)).size,invasion?2:1);
  const cdpSessions=new Map();
  async function move(c,dx,dy,ms){await c.page.bringToFront();if(width===390){let cdp=cdpSessions.get(c);if(!cdp){cdp=await c.ctx.newCDPSession(c.page);cdpSessions.set(c,cdp);}const x=50,y=500;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*40,y:y+dy*40}]});await pause(ms);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else{const keys=[...(dx>.2?['KeyD']:dx<-.2?['KeyA']:[]),...(dy>.2?['KeyS']:dy<-.2?['KeyW']:[])];for(const key of keys)await c.page.keyboard.down(key);await pause(ms);for(const key of keys)await c.page.keyboard.up(key);}}
  for(const [c,uid] of [[host,hostUid],[guest,guestUid]]){const start=(await observe()).find(p=>p.pid===uid);await move(c,0,1,250);await host.page.waitForFunction(({uid,y})=>__arpg.world.entities.find(p=>p.pid===uid).y>y+15,{uid,y:start.y});}
  row.movement=await observe();row.spells=[];
  for(let slot=0;slot<spellIds.length;slot++){
   const id=spellIds[slot],selector=slot===0?'#skill':'#skill2';await guest.page.bringToFront();
   const before=await guest.page.evaluate(()=>__arpg.world.entities[0].mp);await guest.press(selector);
   await host.page.waitForFunction(({id,uid})=>{const w=__arpg.world;return [...(w.zones||[]),...w.projectiles].some(z=>z.abilityId===id&&w.entities.find(p=>p.id===z.ownerId)?.pid===uid);},{id,uid:guestUid},{polling:30});
   await guest.page.waitForFunction(id=>[...(__arpg.world.zones||[]),...__arpg.world.projectiles].some(z=>z.abilityId===id),id,{polling:30});
   await guest.page.waitForFunction(id=>(__arpg.world.entities[0].cds[id]||0)>0,id);
   const after=await guest.page.evaluate(()=>__arpg.world.entities[0].mp);assert.ok(after<before-12);row.spells.push({id,guestOwnsSim:false,hostConfirmed:true,guestSnapshot:true,mpBefore:before,mpAfter:after});
  }
  if(invasion){const bone=hostLineage==='skeleton_knight'?host:guest,human=bone===host?guest:host,boneUid=bone===host?hostUid:guestUid,humanUid=human===host?hostUid:guestUid;
   // Native input only; approach the opposing pawn. Wire hit journal proves source and target.
   for(let i=0;i<60;i++){const players=await observe(),b=players.find(p=>p.pid===boneUid),h=players.find(p=>p.pid===humanUid);assert.ok(!b.terminal&&!h.terminal,'players alive before hostile hit');const dx=h.x-b.x,dy=h.y-b.y,d=Math.hypot(dx,dy);if(d<45)break;await move(bone,dx/d,dy/d,Math.min(250,Math.max(50,(d-35)/200*1000)));}
   await bone.press('[data-battle-settings]');await bone.press('#battle-auto-on');await bone.press('[data-battle-settings]');
   const players=await observe(),boneId=players.find(p=>p.pid===boneUid).id,humanId=players.find(p=>p.pid===humanUid).id;
   for(let i=0;i<80&&!row.hostileHit;i++){row.hostileHit=[...host.wire,...guest.wire].flatMap(w=>w.hits).find(h=>h.event.src===boneId&&h.event.dst===humanId&&h.event.dmg>0);await pause(100);}
   assert.ok(row.hostileHit,'actual relay sender-bound hostile hit');row.afterHit=await observe();
  }
  // Normal tab navigation dispatches pagehide -> intentional leave; host sees guest removal.
  await guest.page.goto('about:blank');await host.page.waitForFunction(uid=>!__arpg.world.entities.some(p=>p.pid===uid),guestUid);row.guestLeave=true;await host.page.goto('about:blank');row.hostLeave=true;
 }
 row.hostState=await host.page.evaluate(()=>window.__arpg?({mode:__arpg.mode,multi:__arpg.multi,round:__arpg.world?.round}):null);row.guestState=await guest.page.evaluate(()=>window.__arpg?({mode:__arpg.mode,multi:__arpg.multi,round:__arpg.world?.round}):null);
 for(const c of [guest,host]){if(await c.page.locator('#mpl-leave').isVisible())await c.press('#mpl-leave');await c.ctx.close();}
 assert.ok(row.hostWire.every(w=>localRelay?w.url.startsWith('ws://127.0.0.1:8792/'):w.url.startsWith('wss://relay-do-poc.zuhejbeg.workers.dev/')));console.log(JSON.stringify({mode,width,hostLineage,started:row.started,room:row.room,hostileHit:row.hostileHit?.event}));
}
for(const width of (process.env.ARPG_RELAY_WIDTHS||'1280,390').split(',').map(Number))for(const lineage of ['human','skeleton_knight']){
 const c=await client(lineage,width,{emptySlot:true});await c.page.goto(base+'/arpg/?room=entry-'+Date.now()+'&invasion=1');await c.press(`[data-action="choose-${lineage==='human'?'human':'skeleton'}"]`);
 if(lineage==='human')await c.press('[data-action="name"]');await c.page.locator('#hero-name').fill('Fresh Relay');await c.press('#name-next');for(let i=0;i<5;i++)await c.press('[data-action="answer"][data-choice="0"]');await c.press('[data-action="create"]');
 await c.page.locator('[data-action="invasion-accept"]').waitFor();assert.equal(c.wire.length,0);assert.equal(await c.page.evaluate(()=>!!__arpg.world),false);const save=await c.page.evaluate(()=>JSON.parse(JSON.stringify(__arpg.save)));assert.ok(validateSave(save));assert.equal(save.lineage||'human',lineage);assert.equal(save.activeInvasion,undefined);report.rows.push({case:'fresh local slot creates directly into explicit consent, no tutorial or relay join',lineage,width});await c.ctx.close();
}
const isolated=await client('skeleton_knight',1280,{foreignHuman:true});await isolated.page.goto(base+'/arpg/?room=entry-foreign-'+Date.now()+'&invasion=1&character=skeleton_knight');await isolated.page.locator('[data-action="invasion-accept"]').waitFor();assert.equal(await isolated.page.evaluate(()=>localStorage.getItem('arpg.save.v1')),'{foreign human bytes');assert.equal(await isolated.page.evaluate(()=>__arpg.mode),'skeleton_knight');assert.equal(isolated.wire.length,0);report.rows.push({case:'skeleton invite never loads/quarantines mismatched human save bytes'});await isolated.ctx.close();
assert.deepEqual(report.errors,[]);report.status=process.env.ARPG_RELAY_EXPECT_BLOCKED?'CAPTURED':'PASS';}catch(e){report.status='FAIL';report.failure=e.stack;throw e;}finally{await writeFile(output,JSON.stringify(report,null,2)+'\n');await browser.close();server?.kill();}
