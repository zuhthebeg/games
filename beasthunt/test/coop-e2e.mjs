import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire('/home/cocy/.openclaw/workspace/');const {chromium}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:8791/beasthunt/';
const out='/home/cocy/.openclaw/workspace/tmp/beasthunt-r4b';await mkdir(out,{recursive:true});
const browser=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
const errors=[],wire=[],pages=[],traffic=[];
const peers=Number(process.env.BH_PEERS||2);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
try{
for(const [i,vp]of Array.from({length:peers},(_,i)=>i?{width:390,height:780}:{width:1280,height:720}).entries()){
 const ctx=await browser.newContext({viewport:vp,hasTouch:i===1,isMobile:i===1,locale:'ko-KR'});
 // Third-party analytics/fonts/QR are not game or relay traffic.
 await ctx.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===new URL(base).origin||['relay.cocy.io','relay-do-poc.zuhejbeg.workers.dev'].includes(u.hostname)?route.continue():route.abort();});
 await ctx.addInitScript(()=>{try{localStorage.setItem('beasthunt_lang','ko');}catch{}});
 const p=await ctx.newPage();pages.push(p);p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|ERR_|favicon/i.test(m.text()))errors.push(m.text());});
 p.on('websocket',ws=>{ws.on('framesent',e=>traffic.push({peer:i,at:Date.now(),bytes:Buffer.byteLength(e.payload)}));wire.push({url:ws.url()});ws.on('framereceived',e=>{try{const d=JSON.parse(e.payload);if(d.type!=='rt' && !(d.type==='event' && d.event?.data?.payload?.type==='hunterAction'))wire.push({peer:i,...d});}catch{}});ws.on('socketerror',e=>errors.push('WS '+e));});
 const url=new URL(base);url.searchParams.set('lowfx','1');if(process.env.BH_RELAY==='pages')url.searchParams.set('bhRelay','pages');await p.goto(url.href);await p.waitForFunction(()=>window.__bh);
 await p.evaluate(()=>{const s=window.__bh.save;s.w={gs:5,db:5,bow:5};s.armor=5;window.__goldCalls=0;const add=SharedWallet.addGold.bind(SharedWallet);SharedWallet.addGold=n=>{window.__goldCalls++;return add(n);};});
 if(process.env.BH_ENTRY_ONLY&&i===0)await p.evaluate(()=>window.__bh.save.clears.q1={n:1,best:99});
 await p.screenshot({path:out+'/hub-'+vp.width+'.png'});
 await p.click('#coop');await p.waitForSelector('#mpl-mode');
}
await pages[0].evaluate(()=>window.__bh.coop.lobby._enterRoom());
await pages[0].waitForFunction(()=>window.__bh.coop?.roster.players.length===1,{},{timeout:20000});
const room=await pages[0].evaluate(()=>window.__bh.coop.lobby.room);
for(const p of pages.slice(1))await p.evaluate(room=>window.__bh.coop.lobby._enterRoom(room),room);
await Promise.all(pages.map(p=>p.waitForFunction(n=>window.__bh.coop.roster.players.length===n,peers,{timeout:20000})));
await pages.at(-1).evaluate(()=>{const c=window.__bh.coop;const value=c.profile();c.profile=()=>({...value,v:999});});
await pages[0].waitForFunction(()=>document.querySelector('#mpl-status')?.textContent.includes('불일치'),null,{timeout:10000});
await pages.at(-1).evaluate(()=>delete window.__bh.coop.profile);console.log('VERSION mismatch blocked');
for(const p of pages.slice(1))await p.click('#mpl-ready');await pages[0].waitForFunction(()=>!document.querySelector('#mpl-start').disabled,null,{timeout:15000});
for(let i=0;i<2;i++)await pages[i].screenshot({path:out+'/lobby-'+(i?390:1280)+'.png'});
if(process.env.BH_ENTRY_ONLY)await pages[0].selectOption('#bh-quest','q2');
await pages[0].click('#mpl-start');
await Promise.all(pages.map(p=>p.waitForFunction(()=>window.__bh.hunt?.session?.initialized,null,{timeout:20000})));
if(process.env.BH_ENTRY_ONLY){const ids=await Promise.all(pages.map(p=>p.evaluate(()=>window.__bh.hunt.q.id)));if(ids.some(id=>id!=='q2'))throw new Error('host quest mismatch '+ids);if(await pages[1].evaluate(()=>!!window.__bh.save.clears.q1))throw new Error('guest fixture unlocked');console.log('PASS host q2 / locked guest entry');}else{
const outsider=await browser.newContext({viewport:{width:390,height:780}});await outsider.route('**/*',r=>{const u=new URL(r.request().url());return u.origin===new URL(base).origin||u.hostname==='relay-do-poc.zuhejbeg.workers.dev'?r.continue():r.abort();});
const late=await outsider.newPage();await late.goto(base+'?room='+room+'&lowfx=1');await late.waitForFunction(()=>window.__bh.coop?.locked,null,{timeout:15000});if(await late.evaluate(()=>!!window.__bh.hunt))throw new Error('late join entered live hunt');await late.evaluate(()=>window.__bh.coop.close());await outsider.close();console.log('LATE_JOIN blocked');
const bot=()=>{const B=window.__bh;B.input.sample=()=>{const h=B.hunt;if(!h)return {};const s=h.sim,p=h.p,k=s.tick,head=s.mParts().find(p=>p.n==='head'),dx=head.x-p.x,dz=head.z-p.z,d=Math.hypot(dx,dz);h.cy=Math.atan2(dx,dz);return {aimYaw:h.cy,moveZ:d>3.5?127:0,light:k%20===0,heavy:k%300===150,heavyHeld:k%300>=150&&k%300<250,dodge:k%420===400,potion:p.hp<70&&k%60===0};};};
if(peers===3){
 for(let n=0;n<2;n++){await pages[2].evaluate(()=>{const h=window.__bh.hunt;h.p.hp=1;h.p.inv=0;h.p.state='idle';h.sim.hurt(999,0,0,true);});await sleep(6500);}
 const carts=await Promise.all(pages.map(p=>p.evaluate(()=>window.__bh.hunt.carts)));if(carts.some(n=>n!==2))throw new Error('shared carts '+JSON.stringify(carts));console.log('CARTS',JSON.stringify(carts));
}
await Promise.all(pages.map(p=>p.evaluate(bot)));
await sleep(4000);
for(let i=0;i<2;i++)await pages[i].screenshot({path:out+'/hunt-'+(i?390:1280)+'.png'});
// Worker ticking with the host document hidden and its main timers clamped to 1Hz.
const before=await pages[1].evaluate(()=>({tick:window.__bh.hunt.session.rep.world.tick,x:window.__bh.hunt.m.x,z:window.__bh.hunt.m.z}));
await pages[0].evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));window.__oldInterval=window.setInterval;window.setInterval=(fn,ms,...args)=>window.__oldInterval(fn,Math.max(ms,1000),...args);const c=window.__bh.coop;clearInterval(c.timer);c.timer=setInterval(()=>c.service(),200);window.__oldRAF=window.requestAnimationFrame;let last=0;window.requestAnimationFrame=cb=>window.__oldRAF(function slow(now){if(now-last>=1000){last=now;cb(now);}else window.__oldRAF(slow);});});
await pages[1].bringToFront();await sleep(2500);
const after=await pages[1].evaluate(()=>({tick:window.__bh.hunt.session.rep.world.tick,x:window.__bh.hunt.m.x,z:window.__bh.hunt.m.z}));
if(after.tick-before.tick<90)throw new Error('hidden host worker stalled');
console.log('HIDDEN',JSON.stringify({before,after}));
await pages[0].evaluate(()=>{delete document.hidden;window.setInterval=window.__oldInterval;window.requestAnimationFrame=window.__oldRAF;const c=window.__bh.coop;clearInterval(c.timer);c.timer=setInterval(()=>c.service(),200);document.getElementById('resume').click();});
await Promise.all(pages.map(p=>p.waitForFunction(()=>window.__bh.hunt?.ended,null,{timeout:180000})));
await Promise.all(pages.map(p=>p.evaluate(()=>{const h=window.__bh.hunt;h.presentEvents([{type:'result',result:h.sim.result()}]);if(window.__goldCalls!==1)throw new Error('wallet credits '+window.__goldCalls);})));console.log('REWARD replay once');
const results=await Promise.all(pages.map(p=>p.evaluate(()=>({win:window.__bh.hunt.win,carts:window.__bh.hunt.carts,save:JSON.parse(localStorage.getItem('beasthunt_save_v1')),goldCalls:window.__goldCalls,ownerCorrections:window.__bh.hunt.session.positionCorrections,frames:window.__bh.coop.frames}))));
if(results.some(r=>!r.win||r.save.clears.q1.n!==1||r.save.shards!==400))throw new Error('reward/result mismatch '+JSON.stringify(results.map(r=>({...r,frames:undefined}))));
for(let i=0;i<2;i++)await pages[i].screenshot({path:out+'/result-'+(i?390:1280)+'.png'});
const workerStats=await pages[0].evaluate(()=>new Promise(resolve=>{const w=window.__bh.coop.world.worker;const cb=({data})=>{if(data.type==='snapshot'){w.removeEventListener('message',cb);resolve(data.metrics);}};w.addEventListener('message',cb);w.postMessage({type:'snapshot'});}));
const metrics=results.map((r,i)=>{const speeds=[],jumps=[];for(let j=1;j<r.frames.length;j++){const a=r.frames[j-1],b=r.frames[j],d=Math.hypot(a.x-b.x,a.z-b.z);jumps.push(d);const dt=(b.at-a.at)/1000;if(dt>0)speeds.push(d/dt);}const avg=speeds.reduce((a,b)=>a+b,0)/speeds.length;const cv=Math.sqrt(speeds.reduce((a,b)=>a+(b-avg)**2,0)/speeds.length)/avg;const sent=traffic.filter(t=>t.peer===i);return {peer:i,frames:r.frames.length,cv,maxJump:Math.max(...jumps),jumpsOver1:jumps.filter(x=>x>1).length,bytesPerSecond:sent.reduce((a,b)=>a+b.bytes,0)/((sent.at(-1).at-sent[0].at)/1000),ownerCorrections:r.ownerCorrections};});
await writeFile(out+'/metrics-'+peers+'.json',JSON.stringify({metrics,workerStats,hidden:{before,after},results:results.map(r=>({...r,frames:undefined}))},null,2));
for(const p of pages)await p.click('#resBack');
for(const p of pages.slice(1))await p.click('#mpl-ready');await pages[0].waitForFunction(()=>!document.querySelector('#mpl-start').disabled);await pages[0].click('#mpl-start');
await Promise.all(pages.map(p=>p.waitForFunction(()=>window.__bh.hunt?.session?.initialized,null,{timeout:20000})));
console.log('REMATCH started');
await pages[1].reload();await pages[1].waitForFunction(()=>window.__bh.hunt?.session?.initialized,null,{timeout:20000});console.log('RECONNECT initialized');
await pages[0].evaluate(()=>window.__bh.coop.close());await pages[1].waitForFunction(()=>window.__bh.hunt?.ended,null,{timeout:12000});console.log('HOST_LEAVE guest result');
if(errors.length)throw new Error('browser errors '+JSON.stringify(errors));
console.log('FLOW PASS real DO coop '+peers+' peers '+JSON.stringify({room,metrics,workerStats,errors}));
const eligible=workerStats.accepted/(workerStats.accepted+workerStats.rejected-(workerStats.reasons.dead||0));if(eligible<.99||metrics.some(m=>m.jumpsOver1)){console.error('BLOCKED render/claim quality '+JSON.stringify({eligible,metrics}));process.exitCode=1;}
}
} catch(e){console.error('BLOCKED',e.message);console.log('states',JSON.stringify(await Promise.all(pages.map(p=>p.evaluate(()=>({profiles:[...window.__bh.coop.profiles],lobby:window.__bh?.coop?.lobby?._roster,text:document.body.innerText.slice(-1500)})).catch(()=>null)))));process.exitCode=1;}
finally{await writeFile(out+'/relay-wire-'+peers+'.json',JSON.stringify({wire,errors},null,2));await browser.close();}
