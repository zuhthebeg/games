import { spawn } from 'node:child_process'; import fs from 'node:fs';
const BASE = process.argv[2] || 'http://127.0.0.1:8768/spudsquad/';
const port=19151; const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-gpu',`--remote-debugging-port=${port}`,'--user-data-dir=/tmp/spud-cam-'+Date.now(),'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let t; for(let i=0;i<80;i++){try{t=await(await fetch(`http://127.0.0.1:${port}/json`)).json();if(t[0]?.webSocketDebuggerUrl)break;}catch{}await sleep(100);}
const ws=new WebSocket(t[0].webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r); let id=0; const pend=new Map(), errs=[];
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id){pend.get(m.id)?.(m);pend.delete(m.id);} else if(m.method==='Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description?.slice(0,160));};
const cmd=(method,params={})=>new Promise(r=>{const n=++id;pend.set(n,r);ws.send(JSON.stringify({id:n,method,params}));});
const ev=async x=>(await cmd('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true})).result.result?.value;
await cmd('Runtime.enable');
const measure = `(() => { const r = window.__r || null; return null; })()`;
const out = {};
for (const [w,h,char] of [[390,844,'muscle'],[1280,800,'muscle'],[390,844,'gunslinger']]) {
  await cmd('Emulation.setDeviceMetricsOverride',{width:w,height:h,deviceScaleFactor:1,mobile:w<500});
  await cmd('Page.navigate',{url:BASE+'?cb='+Date.now()}); await sleep(2500);
  await ev("localStorage.removeItem('spud_mode'); document.querySelector('[data-act=solo]').click()"); await sleep(300);
  await ev(`document.querySelector('[data-act=${char}]').click()`); await sleep(2500);
  const frac = async () => ev(`(() => { const R = SPUD.render.Renderer.prototype; const cv = document.querySelector('#canvas');
    const rend = window.__spudRenderer; return null; })()`);
  // 렌더러 인스턴스 접근: sprite 훅으로 this 캡처
  await ev(`(() => { const o = SPUD.render.Renderer.prototype.sprite; SPUD.render.Renderer.prototype.sprite = function (...a) { window.__rr = this; return o.apply(this, a); }; })()`);
  await sleep(1500);
  const solo = await ev(`(() => { const r = window.__rr, cv = document.querySelector('#canvas'); const W = SPUD.data.W, H = SPUD.data.H;
    const vw = Math.min(W, cv.clientWidth / r.zoom), vh = Math.min(H, cv.clientHeight / r.zoom);
    return { zoom: +r.zoom.toFixed(3), visible: +(vw * vh / (W * H)).toFixed(3), canvas: [cv.clientWidth, cv.clientHeight] }; })()`);
  // 2인: 양 끝 배치
  await ev(`(() => { const w = SPUD.main.session.world; const p2 = SPUD.sim.createPlayer('p2', 'basic'); p2.x = 1540; p2.y = 1140; p2.immune = 1e9;
    w.players.p2 = p2; const p = w.players.solo; p.x = 60; p.y = 60; p.immune = 1e9; w.enemies.length = 0; w.spawnClock = -1e9; })()`);
  await sleep(2500);
  const duo = await ev(`(() => { const r = window.__rr, cv = document.querySelector('#canvas'); const W = SPUD.data.W, H = SPUD.data.H;
    const vw = cv.clientWidth / r.zoom, vh = cv.clientHeight / r.zoom;
    const x0 = r.cam.x, y0 = r.cam.y; const full = x0 <= 0.5 && y0 <= 0.5 && x0 + vw >= W - .5 && y0 + vh >= H - .5;
    return { zoom: +r.zoom.toFixed(3), fullMapVisible: full, cam: [Math.round(x0), Math.round(y0), Math.round(vw), Math.round(vh)] }; })()`);
  const s = await cmd('Page.captureScreenshot',{format:'jpeg',quality:55}); fs.writeFileSync(`/tmp/spud-cam-${w}-${char}.jpg`, Buffer.from(s.result.data,'base64'));
  out[`${w}x${h}-${char}`] = { solo, duo };
}
console.log(JSON.stringify({ out, errs }, null, 1)); ws.close(); chrome.kill();
