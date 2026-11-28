// Offline 390px Chromium, using the actual page and controls. Optional argv[2] is a
// directory containing downloaded voicematch/{locale/}index.html for release replay.
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const vmDir=fileURLToPath(new URL('../',import.meta.url));
const htmlDir=process.argv[2]?join(resolve(process.argv[2]),'voicematch'):vmDir;
const origin='https://fixture.invalid';
const i18n=await readFile(join(vmDir,'i18n.js'));
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||undefined,args:[
  '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>',
  '--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
]});
const rows=[];
let checks=0,nonGet=0,sockets=0,blocked=0,fulfilled=0;
const eq=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);checks++;};
try{
 for(const lang of ['','ko','en','ja','es','pt','tw','id']){
  const relative=lang?`${lang}/`:'';
  const base=`/voicematch/${relative}`,url=`${origin}${base}?utm_source=fixture&ref=kept`;
  const html=await readFile(join(htmlDir,relative,'index.html'));
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,serviceWorkers:'block',userAgent:'Mozilla/5.0 (Linux; Android 13) KAKAOTALK'});
  const localAssets=new Map([
   [base,{contentType:'text/html',body:html}],
   ['/lib/shared-wallet.js',{contentType:'application/javascript',body:'/* synthetic, no wallet/account */'}],
   ['/voicematch/i18n.js',{contentType:'application/javascript',body:i18n}],
   ['/voicematch/analyzer.js',{contentType:'application/javascript',body:'self.onmessage=()=>{};'}],
   ['/voicematch/singers.json',{json:Array.from({length:6},(_,i)=>({slug:`fixture-${i}`,name:`Synthetic ${i}`,gk:true}))}],
   ['/voicematch/ecapa_int8.onnx',{body:Buffer.alloc(8)}],
   ['/voicematch/recent.json',{json:[]}],
   ['/voicematch/catalog.json',{json:{artists:[]}}],
  ]);
  await ctx.addInitScript(()=>{
   window.__copy={mode:'deny',legacy:false,writes:[],execs:[],pending:{},done:0,denied:0,unhandled:0};
   addEventListener('unhandledrejection',()=>{__copy.unhandled++;});
   Object.defineProperty(navigator,'sendBeacon',{value:()=>true});
   Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia(){
    __copy.denied++;return Promise.reject(new DOMException('fixture denial','NotAllowedError'));
   }}});
   Object.defineProperty(navigator,'clipboard',{value:{writeText(url){
    const at=__copy.writes.push(url)-1;
    if(__copy.mode==='defer')return new Promise((resolve,reject)=>{__copy.pending[at]=[resolve,reject];});
    if(__copy.mode==='ok')return Promise.resolve();
    return Promise.reject(new DOMException('fixture clipboard denied','NotAllowedError'));
   }}});
   document.execCommand=cmd=>{__copy.execs.push({cmd,url:document.querySelector('textarea')?.value});return __copy.legacy;};
  });
  await ctx.routeWebSocket('**/*',async socket=>{sockets++;await socket.close();});
  await ctx.route('**/*',async route=>{
   const req=route.request(),u=new URL(req.url());
   const get=req.method()==='GET';if(!get)nonGet++;
   const reply=get&&u.origin===origin&&localAssets.get(u.pathname);
   if(reply){fulfilled++;return route.fulfill(reply);}
   blocked++;return route.abort();
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(5000);
  let clicks=0,done=0,events=0,execs=0,writes=0;
  const click=async el=>{await el.click();clicks++;};
  await page.goto(url+'#fixture-only',{timeout:15000});
  const labels=await page.evaluate(()=>{
   // Count completion without replacing any handler behavior.
   const actual=copyPageUrl;
   copyPageUrl=async function(...args){try{return await actual.apply(this,args);}finally{__copy.done++;}};
   return {idle:t('inappCopy'),copied:t('inappCopied')};
  });
  eq(labels.idle!==labels.copied,true,`${lang} distinct labels`);
  const status=()=>page.evaluate(()=>({writes:__copy.writes,execs:__copy.execs,areas:document.querySelectorAll('textarea').length,
   events:window.dataLayer.filter(x=>x?.event==='vm_inapp_copy').length}));
  const verify=async(btn,label,reason)=>{
   const tag=`${lang||'root'} ${reason}`;
   eq(await btn.textContent(),label,tag+' label');
   const result=await status();
   eq(result.writes,Array(writes).fill(url),tag+' query preserved, hash stripped');
   eq(result.execs,Array(execs).fill({cmd:'copy',url}),tag+' legacy write count and URL');
   eq(result.areas,0,tag+' temporary textarea cleanup');
   eq(result.events,events,tag+' confirmed-copy event count');
  };
  const mode=(value,legacy)=>page.evaluate(([value,legacy])=>Object.assign(__copy,{mode:value,legacy}),[value,legacy]);
  const waitDone=async()=>{done++;await page.waitForFunction(n=>__copy.done===n,done);};
  const swap=async(at,success)=>{
   await page.evaluate(([at,success])=>{const [yes,no]=__copy.pending[at];delete __copy.pending[at];if(success)yes();else no(new Error('late fixture denial'));},[at,success]);
   await waitDone();
  };
  const attempt=async(btn,value,legacy)=>{
   await mode(value,legacy);await click(btn);const at=writes++;
   if(value==='defer')await page.waitForFunction(at=>at in __copy.pending,at);
   else await waitDone();
   return at;
  };
  const start=page.locator('#btn-start'),go=page.locator('#mic-go');
  await click(start);
  for(const id of ['mic-copy','err-copy']){
   if(id==='err-copy')await click(go);
   const btn=page.locator(`#${id}`);
   await btn.waitFor({state:'visible'});
   const box=await btn.boundingBox();
   eq(!!box&&box.x>=0&&box.x+box.width<=390.01&&box.y>=0&&box.y+box.height<=844.01,true,`${lang} ${id} visible at 390`);
   await verify(btn,labels.idle,`${id} initially`);
   await attempt(btn,'deny',false);execs++;await verify(btn,labels.idle,`${id} initial both fail`);
   await attempt(btn,'ok',false);events++;await verify(btn,labels.copied,`${id} clipboard success`);
   const retry=await attempt(btn,'defer',false);await verify(btn,labels.idle,`${id} immediate reset while pending`);
   await swap(retry,false);execs++;await verify(btn,labels.idle,`${id} retry both fail`);
   await attempt(btn,'deny',true);execs++;events++;await verify(btn,labels.copied,`${id} legacy recovery`);
   const lateSuccess=await attempt(btn,'defer',true);
   await attempt(btn,'deny',false);execs++;
   await swap(lateSuccess,true);events++;
   await verify(btn,labels.idle,`${id} older success leaves latest failure visible`);
   const lateRejection=await attempt(btn,'defer',true);
   await attempt(btn,'ok',true);events++;
   await swap(lateRejection,false);
   await verify(btn,labels.copied,`${id} older failure cannot start fallback`);
   const stale=await attempt(btn,'defer',true);
   const oldButton=await btn.elementHandle();
   if(id==='mic-copy'){
    await click(page.locator('#mic-no'));await click(start);
    eq(await oldButton.evaluate(el=>el.isConnected&&el===document.getElementById('mic-copy')),true,`${lang} sheet reuses button`);
   }else{
    await click(page.locator('#btn-restart'));await btn.waitFor({state:'visible'});
    eq(await oldButton.evaluate(el=>el.isConnected),false,`${lang} error button replaced`);
   }
   await verify(btn,labels.idle,`${id} reopened or replaced`);
   await swap(stale,true);events++;
   await verify(btn,labels.idle,`${id} previous screen success cannot set status`);
   eq(await oldButton.textContent(),labels.idle,`${lang} ${id} inactive button not changed`);
   await oldButton.dispose();
  }
  eq(await page.evaluate(()=>[__copy.denied,__copy.unhandled,Object.keys(__copy.pending).length,innerWidth,document.documentElement.scrollWidth<=innerWidth]),[2,0,0,390,true],`${lang} synthetic permission and viewport`);
  eq(errors,[],`${lang} page errors`);
  rows.push({locale:lang||'root',sha256:createHash('sha256').update(html).digest('hex'),clicks,copyClicks:writes,events,legacyWrites:execs});
  await ctx.close();
 }
 eq(nonGet,0,'no non-GET requests');eq(sockets,0,'no websocket attempts');
 console.log(JSON.stringify({pages:rows.length,viewport:'390x844',clicks:rows.reduce((n,r)=>n+r.clicks,0),copyClicks:rows.reduce((n,r)=>n+r.copyClicks,0),checks,blocked,fulfilled,nonGet,sockets,outboundActual:0,rows},null,2));
}finally{await browser.close();}
