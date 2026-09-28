import { spawn } from 'node:child_process';
const BASE = process.argv[2] || 'http://127.0.0.1:8768/spudsquad/';
const port=19161; const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,'--user-data-dir=/tmp/spud-sold-'+Date.now(),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let t; for(let i=0;i<80;i++){try{t=await(await fetch(`http://127.0.0.1:${port}/json`)).json();if(t[0]?.webSocketDebuggerUrl)break;}catch{}await sleep(100);}
const ws=new WebSocket(t[0].webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r); let id=0; const pend=new Map(), errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id){pend.get(m.id)?.(m);pend.delete(m.id);} else if(m.method==='Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description?.slice(0,160));};
const cmd=(method,params={})=>new Promise(r=>{const n=++id;pend.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
const ev=async x=>(await cmd('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result.result?.value;
await cmd('Runtime.enable'); await cmd('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
await cmd('Page.navigate',{url:BASE+'?cb='+Date.now()}); await sleep(2500);
await ev("document.querySelector('[data-act=solo]').click()"); await sleep(300);
await ev("document.querySelector('[data-act=basic]').click()"); await sleep(800);
await ev("(() => { const w = SPUD.main.session.world; w.players.solo.immune = 1e9; w.players.solo.mats = 999; w.tm = 0; })()"); await sleep(1500);
for (let i=0;i<10;i++){ if(await ev("!!document.querySelector('.shop-screen')")) break; await ev("(document.querySelector('[data-act=take]')||document.querySelector('[data-act=pick0]'))?.click()"); await sleep(300); }
const state = () => ev("[...document.querySelectorAll('.shop-card')].map(c => c.classList.contains('sold') ? 'SOLD' : c.querySelector('strong')?.textContent.split(' ·')[0])");
const before = await state();
await ev("SPUD.main.session.world.players.solo.mats = 999; document.querySelector('[data-act=buy0]').click()"); await sleep(300);
await ev("document.querySelector('[data-act=buy2]')?.click()"); await sleep(300);
const afterBuy = await state();
await ev("document.querySelectorAll('.shop-card')[0].click()"); await sleep(200);
const detailOnSold = await ev("!!document.querySelector('.detail-sheet')");
await ev("document.querySelector('[data-act=buy0]')?.click()"); await sleep(200);
const afterSecondClick = await state();
await ev("document.querySelector('[data-act=roll]').click()"); await sleep(300);
const afterRoll = await state();
console.log(JSON.stringify({before, afterBuy, detailOnSold, afterSecondClick, afterRoll, errs})); ws.close(); chrome.kill();
