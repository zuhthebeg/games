import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),out=process.env.ARPG_UI_EVIDENCE||'/home/cocy/.openclaw/workspace/tmp/arpg-ui-0050-native.json';

const port=Number(process.env.ARPG_CDP_PORT||19587),httpPort=Number(process.env.ARPG_HTTP_PORT||8987),profile=await mkdtemp(join(tmpdir(),'arpg-sl1-'));
const server=spawn('python3',['-m','http.server',String(httpPort),'--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});
const chrome=spawn('/home/cocy/bin/chromium',['--headless=new','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-swiftshader','--disable-background-timer-throttling',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let socket,seq=0;const pending=new Map(),errors=[];
try {
 let targets;for(let i=0;i<80;i++){try{targets=await(await fetch(`http://127.0.0.1:${port}/json`)).json();}catch{}if(targets?.some(t=>t.type==='page'))break;await sleep(100);}
 assert.equal(server.exitCode,null);socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);
 socket.onmessage=({data})=>{const d=JSON.parse(data);if(d.id){pending.get(d.id)?.(d);pending.delete(d.id);}else if(d.method==='Runtime.exceptionThrown'||d.method==='Runtime.consoleAPICalled'&&d.params.type==='error'||d.method==='Log.entryAdded'&&d.params.entry.level==='error')errors.push(d);};
 const cmd=(method,params={})=>new Promise((res,rej)=>{const id=++seq,t=setTimeout(()=>{pending.delete(id);rej(Error('timeout '+method));},120000);pending.set(id,d=>{clearTimeout(t);d.error?rej(Error(JSON.stringify(d.error))):res(d.result);});socket.send(JSON.stringify({id,method,params}));});
 const ev=async expression=>{const r=await cmd('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=async(expression,timeout=20000)=>{const at=Date.now();while(Date.now()-at<timeout){if(await ev(expression))return;await sleep(100);}throw Error('timeout '+expression);};
 const key=async(key,code=key)=>{await cmd('Input.dispatchKeyEvent',{type:'keyDown',key,code, ...(key==='Enter'?{windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'}:{})});await cmd('Input.dispatchKeyEvent',{type:'keyUp',key,code});};
 const activate=async(selector,mobile)=>{
  const pt=await ev(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n||n.disabled||!n.checkVisibility())throw Error('not accessible '+${JSON.stringify(selector)});n.scrollIntoView({block:'center'});n.focus({preventScroll:true});const r=n.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  if(mobile){await cmd('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[pt]});await sleep(40);await cmd('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}else await key('Enter');await sleep(100);
 };
 await cmd('Runtime.enable');await cmd('Page.enable');await cmd('Log.enable');await cmd('Emulation.setFocusEmulationEnabled',{enabled:true});
 const origin=`http://127.0.0.1:${httpPort}`;

 const rows=[];
 for(const width of [320,390,1280]) {
  const mobile=width<500;
  await cmd('Emulation.setDeviceMetricsOverride',{width,height:mobile?844:800,deviceScaleFactor:1,mobile});
  await cmd('Emulation.setTouchEmulationEnabled',{enabled:mobile,maxTouchPoints:1});
  await cmd('Page.navigate',{url:origin+'/arpg/test/ui-0050-native.html'});await wait('window.ready');
  const gap=await ev(`(()=>{const t=document.querySelector('.threat-choices').getBoundingClientRect(),b=document.querySelector('.threat-choices + button[data-action="coop"]').getBoundingClientRect();return b.top-t.bottom})()`);
  assert.equal(gap,12);
  const headerOverlap=await ev(`(()=>{const a=document.querySelector('.game-header').getBoundingClientRect(),b=document.querySelector('.threat-choices + button[data-action="coop"]').getBoundingClientRect();return Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top));})()`);assert.equal(headerOverlap,0);
  await activate('.threat-choices + button[data-action="coop"]',mobile);
  assert.deepEqual(await ev('probe.coop'),[{stage:'S1',threat:1}]);
  await activate('[data-action="launch"]',mobile);assert.equal(await ev('probe.launch'),1);
  const layout=await ev(`(()=>{
   const rect=n=>{let r;if(n.id==='temp-loot'){const range=document.createRange();range.selectNodeContents(n);r=range.getBoundingClientRect();}else r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};
   const overlap=(a,b)=>Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
   const weight=document.querySelector('#hud .bar.load'),text=document.querySelector('#load-text');
   const toolbar=['.vrow','#hud .bar.load','.stage','.battle-settings','#temp-loot','#coop-status'].map(s=>({s,r:rect(document.querySelector(s))}));
   const collisions=[];for(let i=0;i<toolbar.length;i++)for(let j=i+1;j<toolbar.length;j++)if(overlap(toolbar[i].r,toolbar[j].r))collisions.push([toolbar[i].s,toolbar[j].s]);
   return {weight:rect(weight),font:getComputedStyle(text).fontSize,text:text.textContent,color:getComputedStyle(weight).color,fill:getComputedStyle(document.querySelector('#load-fill')).display,label:weight.getAttribute('aria-label'),toolbar,collisions,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  assert.ok(layout.weight.width>18 && layout.weight.width<=110,JSON.stringify(layout));assert.equal(layout.font,'12px');assert.equal(layout.fill,'none');assert.equal(layout.color,'rgb(189, 97, 87)');assert.ok(layout.label.includes('과중량'));assert.equal(layout.overflow,false);assert.deepEqual(layout.collisions,[]);
  await ev(`fixture.hub.showBoard()`);
  const otherMargin=await ev(`getComputedStyle(document.querySelector('[data-action="coop"]')).marginTop`);assert.equal(otherMargin,'0px');
  rows.push({width,gap,headerOverlap,operation:mobile?'native touch':'native Enter',layout,otherMargin});
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 await writeFile(out,JSON.stringify({cases:3,rows,errors,screenshots:0,mode:'actual HubUI/HUD fixture, no renderer hunt or WAN multiplayer'},null,2)+'\n');
 console.log(JSON.stringify({cases:3,errors:errors.length,screenshots:0,evidence:out}));
} finally {socket?.close();chrome.kill('SIGKILL');server.kill('SIGKILL');await sleep(250);await rm(profile,{recursive:true,force:true});}
