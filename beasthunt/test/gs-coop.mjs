import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
const require=createRequire('/home/cocy/.openclaw/workspace/');const {chromium}=require('playwright');
const base=process.argv[2]||'http://127.0.0.1:8791/beasthunt/';
const out='/home/cocy/.openclaw/workspace/tmp/beasthunt-r5/shots';await mkdir(out,{recursive:true});
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

await Promise.all(pages.map(p=>p.evaluate(async()=>{await __bh.hunt.H.ready;if(!__bh.hunt.H.gs)throw Error('local GS not skinned');})));
await pages[1].waitForFunction(()=>[...__bh.coop.remotes.values()].some(r=>r.H.gs),null,{timeout:15000});
const before=await pages[1].evaluate(()=>{const r=[...__bh.coop.remotes.values()][0];return {key:r.H.gs.key,hip:r.H.gs.bones.Hips.quaternion.toArray(),hand:r.H.gs.bones.RightHand.quaternion.toArray()};});
await pages[0].evaluate(()=>{__bh.input.sample=()=>({aimYaw:0,light:__bh.hunt.sim.tick%60===0});});
await pages[1].waitForFunction(()=>[...__bh.coop.remotes.values()].some(r=>r.H.gs?.key==='v'),null,{timeout:15000});
const first=await pages[1].evaluate(()=>{const g=[...__bh.coop.remotes.values()][0].H.gs;return {key:g.key,time:g.clipTime,hand:g.bones.RightHand.quaternion.toArray()};});
await sleep(170);
const second=await pages[1].evaluate(()=>{const g=[...__bh.coop.remotes.values()][0].H.gs;return {key:g.key,time:g.clipTime,hand:g.bones.RightHand.quaternion.toArray(),localIndependent:g.mixer!==__bh.hunt.H.gs.mixer};});
const moved=first.hand.some((v,i)=>Math.abs(v-second.hand[i])>.0001);
await pages[1].screenshot({path:out+'/coop-guest.png'});
const result={before,first,second,moved,errors};await writeFile('/home/cocy/.openclaw/workspace/tmp/beasthunt-r5/coop-gs.json',JSON.stringify(result,null,2));
if(!moved||!second.localIndependent||errors.length)throw Error('remote GS did not animate '+JSON.stringify(result));
console.log('PASS remote GS animation '+JSON.stringify(result));
} finally { for(const p of pages)await p.evaluate(()=>window.__bh?.coop?.close()).catch(()=>{});await browser.close(); }
