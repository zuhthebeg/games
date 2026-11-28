// Actual controls on 390px Chromium. No real microphone or outbound requests.
// Optional argument is a directory holding downloaded voicematch HTML + rap-challenge.js.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir = fileURLToPath(new URL('../', import.meta.url));
const source = process.argv[2] ? join(process.argv[2], 'voicematch') : dir;
const i18n = await readFile(join(dir, 'i18n.js'));
const rap = await readFile(join(source, 'rap-challenge.js')).catch(e => { if (e.code !== 'ENOENT') throw e; });
const origin = 'https://fixture.invalid';
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH||undefined, args:[
  '--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=<-loopback>','--disable-quic','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
]});
let assertions=0, clicks=0;
const eq=(actual, expected, label)=>{assert.deepEqual(actual,expected,label); assertions++;};
const rows=[];
try {
 for (const loc of ['', 'ko', 'en', 'ja', 'es', 'pt', 'tw', 'id']) {
  const base=`/voicematch/${loc ? loc+'/' : ''}`;
  const html=await readFile(join(source,loc,'index.html'));
  const kr=!loc || loc==='ko';
  const counts={rap:0, blocked:0, writes:0, sockets:0};
  const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,locale:'ko-KR',timezoneId:'America/Los_Angeles',serviceWorkers:'block'});
  await ctx.routeWebSocket('**/*', async socket=>{counts.sockets++;await socket.close();});
  await ctx.route('**/*',async route=>{
   const request=route.request(),u=new URL(request.url());
   if (request.method()!=='GET') counts.writes++;
   else if (u.origin===origin) {
    if (u.pathname===base) return route.fulfill({body:html,contentType:'text/html'});
    if (u.pathname==='/voicematch/rap-challenge.js' && rap) {counts.rap++;return route.fulfill({body:rap,contentType:'application/javascript'});}
    if (u.pathname==='/voicematch/i18n.js') return route.fulfill({body:i18n,contentType:'application/javascript'});
    if (u.pathname==='/lib/shared-wallet.js') return route.fulfill({body:'',contentType:'application/javascript'});
    if (u.pathname.endsWith('/singers.json')) return route.fulfill({json:[{slug:'fixture',name:'가상 가수',gk:true}]});
    if (u.pathname.endsWith('/recent.json')) return route.fulfill({json:[]});
   }
   if (request.method()==='GET' && u.origin==='https://relay.cocy.io' && u.pathname==='/api/voicematch/group' && u.searchParams.get('id')==='fixtureteam') {
    return route.fulfill({headers:{'access-control-allow-origin':origin},json:{id:'fixtureteam',target:'blackpink',teamName:'Fixture Team',total:4,members:[]}});
   }
   counts.blocked++;return route.abort();
  });
  await ctx.addInitScript(()=>{
   const s=window.rapFixture={mic:0, mode:'deny', stopped:0, starts:0, recorderStops:0, sound:'manual', contexts:0, live:new Set(), audioEnds:[], logs:[], revoke:[], urls:[], records:[], storage:[], beacons:[]};
   Object.defineProperty(navigator,'sendBeacon',{value:(...args)=>{s.beacons.push(args[0]);return true;}});
   const origSet=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){s.storage.push(k);return origSet.call(this,k,v);};
   s.stream=()=>{
    const track=new EventTarget();track.readyState='live';
    track.stop=()=>{if(track.readyState==='live')s.stopped++;track.readyState='ended';};
    return {getTracks:()=>[track]};
   };
   Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia(){
    s.mic++;
    if(s.mode==='deny')return Promise.reject(new DOMException('fixture denial','NotAllowedError'));
    if(s.mode==='pending')return new Promise(resolve=>{s.resolve=()=>resolve(s.stream());});
    return Promise.resolve(s.stream());
   }}});
   window.AudioContext=class {
    constructor(){s.contexts++;if(s.sound==='off')throw new Error('fixture no audio');this.state='suspended';this.sampleRate=8000;}
    resume(){this.state=s.sound==='suspended'?'suspended':'running';return Promise.resolve();}
    close(){this.state='closed';s.live.delete(this);return Promise.resolve();}
    createBuffer(ch,n){return {getChannelData:()=>new Float32Array(n)};}
    createBufferSource(){const ctx=this;return {
     connect(){},
     start(){s.live.add(ctx);s.logs.push('cue:start');s.audioEnds.push(()=>{s.live.delete(ctx);s.logs.push('cue:end');this.onended?.();});},
     stop(){if(s.live.delete(ctx))s.logs.push('cue:stop');},
    };}
   };
   // Synthesize a short, silent PCM WAV; playback controls load real local bytes.
   function wav(){
    const b=new Uint8Array(8044), v=new DataView(b.buffer);const text=(n,s)=>b.set([...s].map(c=>c.charCodeAt(0)),n);
    text(0,'RIFF');v.setUint32(4,b.length-8,true);text(8,'WAVEfmt ');v.setUint32(16,16,true);
    for (const [n,value] of [[20,1],[22,1],[32,2],[34,16]]) v.setUint16(n,value,true);
    v.setUint32(24,8000,true);v.setUint32(28,16000,true);text(36,'data');v.setUint32(40,b.length-44,true);
    return new Blob([b],{type:'audio/wav'});
   }
   window.MediaRecorder=class extends EventTarget {
    state='inactive'; mimeType='audio/wav';
    constructor(stream){super();this.track=stream.getTracks()[0];s.records.push(this);}
    start(){if(s.live.size)throw new Error('recorder started with audio live');s.logs.push('rec:start');this.state='recording';s.starts++;}
    stop(){if(this.state!=='recording')throw new Error('already stopped');this.state='inactive';s.recorderStops++;
     if(s.mode==='hang')return;
     queueMicrotask(()=>{this.dispatchEvent(new BlobEvent('dataavailable',{data:s.mode==='empty'?new Blob():wav()}));this.dispatchEvent(new Event('stop'));});
    }
   };
   const create=URL.createObjectURL, revoke=URL.revokeObjectURL;
   URL.createObjectURL=b=>{const url=create(b);s.urls.push(url);return url;};
   URL.revokeObjectURL=url=>{s.revoke.push(url);return revoke(url);};
  });
  const page=await ctx.newPage();page.setDefaultTimeout(1400);
  const errs=[];page.on('pageerror',e=>errs.push(e.message));
  const time=new Date('2026-11-28T14:58:00Z');
  await page.clock.install({time});
  const invite='#d='+Buffer.from(JSON.stringify({v:1,n:'Fixture Singer',s:'fixture',p:85,e:Buffer.alloc(192,130).toString('base64url')})).toString('base64url')+'&g=fixtureteam';
  const visit=()=>page.goto(origin+base+invite);
  await visit();
  const $=id=>page.locator('#'+id);
  const click=async id=>{await $(id).click();clicks++;};
  const value=key=>page.evaluate(k=>rapFixture[k],key);
  const set=props=>page.evaluate(p=>Object.assign(rapFixture,p),props);
  const visible=(id,label)=>$(id).waitFor({state:'visible',timeout:2500}).catch(e=>{throw new Error(`${loc||'root'}: ${label||id}: ${e.message}`);});
  const hidden=id=>$(id).waitFor({state:'hidden'});
  await visible('btn-start');
  await visible('duet-banner');await visible('group-banner');
  assert.match(await $('duet-banner').textContent(),/Fixture Singer/);assertions++;
  assert.match(await $('group-banner').textContent(),/Fixture Team/);assertions++;
  eq(await value('mic'),0,'existing invite starts no mic');
  if(kr){
   await visible('vm-rap-open','Korean challenge entry is visible');
   eq(await page.evaluate(()=>Boolean(document.querySelector('#btn-start').compareDocumentPosition(document.querySelector('#vm-rap-open'))&4)),true,'challenge after primary CTA');
   eq(await value('mic'),0,'no microphone before challenge');
   const snap=()=>page.evaluate(()=>({storage:rapFixture.storage.length,beacons:rapFixture.beacons.length}));
   await click('vm-rap-open');await visible('vm-rap-dialog');
   eq(await value('mic'),0,'preview never calls microphone');eq(await value('contexts'),0,'preview never plays count-in');
   const words=await $('vm-rap-words').textContent();
   await click('vm-rap-close');
   eq(await page.evaluate(()=>document.activeElement?.id),'vm-rap-open','return focus');
   await page.reload();
   await visible('vm-rap-open');await visible('group-banner');
   await page.waitForLoadState('networkidle');
   const before=await snap(), blockedBefore=counts.blocked;
   await click('vm-rap-open');eq(await $('vm-rap-words').textContent(),words,'same day reload');
   await click('vm-rap-action');
   await page.waitForFunction(()=>document.querySelector('#vm-rap-status').textContent.includes('권한'));
   eq(await value('starts'),0,'denied permission does not record');
   await set({mode:'ok'});await click('vm-rap-action');
   await page.clock.runFor(2401);
   eq(await value('starts'),0,'no recording while cue has not ended');
   await page.evaluate(()=>rapFixture.audioEnds.shift()());
   await page.waitForFunction(()=>rapFixture.starts===1);
   eq((await value('logs')).slice(-3),['cue:start','cue:end','rec:start'],'cue ends first');
   await click('vm-rap-action');await visible('vm-rap-audio');
   await page.waitForFunction(()=>document.querySelector('#vm-rap-audio').readyState>=1);
   eq(await $('vm-rap-audio').evaluate(el=>el.duration),0.5,'local audio metadata loads');
   const played=await $('vm-rap-audio').evaluate(async el=>{await el.play();const playing=!el.paused;el.pause();return playing;});
   eq(played,true,'local generated WAV plays');
   eq(await value('stopped'),1,'manual stop releases track');
   const take=(await value('urls')).at(-1);
   await $('vm-rap-lyrics').tap(); clicks++;
   await page.keyboard.insertText('밤바다\n잠마다\n마지막 바다\n말 끝 flow\n가자 걷자');
   eq((await $('vm-rap-lyrics').inputValue()).split('\n').length,4,'input capped to four lines');
   assert.match(await $('vm-rap-hints').textContent(),/1·2/);assertions++;
   await $('vm-rap-lyrics').fill('밤바다\n잠마다 flow');
   assert.doesNotMatch(await $('vm-rap-hints').textContent(),/1·2/);assertions++;
   await $('vm-rap-lyrics').fill('밤바다\n잠마다');
   // Emulate the reduced viewport space of a keyboard, not an OS keyboard itself.
   await page.setViewportSize({width:390,height:430});
   const box=await $('vm-rap-dialog').boundingBox();
   eq(box.width<=390 && box.width>0 && box.y>=0 && box.y+box.height<=430,true,'390px dialog fits reduced viewport');
   const editor=await $('vm-rap-lyrics').boundingBox();
   eq(editor.x>=0 && editor.x+editor.width<=390,true,'focused editor is not horizontally clipped');
   await page.setViewportSize({width:390,height:844});
   await set({sound:'off'});await click('vm-rap-action');
   eq((await value('revoke')).includes(take),true,'retry revokes previous URL');
   eq(await $('vm-rap-lyrics').inputValue(),'밤바다\n잠마다','retry preserves optional text');
   await page.clock.runFor(2401);await page.waitForFunction(()=>rapFixture.starts===2);
   await page.clock.runFor(9601);await visible('vm-rap-audio');
   eq(await value('stopped'),2,'duration cap releases mic');
   const second=(await value('urls')).at(-1);
   await click('vm-rap-close');
   eq((await value('revoke')).includes(second),true,'close revokes second URL');
   await click('vm-rap-open');eq(await $('vm-rap-lyrics').inputValue(),'','close discards lyrics');
   await set({mode:'pending'});await click('vm-rap-action');
   await page.waitForFunction(()=>typeof rapFixture.resolve==='function');
   await click('vm-rap-close');
   await click('vm-rap-open');await set({mode:'ok'});await click('vm-rap-action');
   await page.evaluate(()=>rapFixture.resolve());await page.clock.runFor(2401);
   await page.waitForFunction(()=>rapFixture.starts===3);
   eq(await value('stopped'),3,'late permission stream stopped independently of new take');
   await page.keyboard.press('Escape');await hidden('vm-rap-dialog');
   eq(await value('stopped'),4,'Escape releases active recording');
   await click('vm-rap-open');await set({mode:'empty'});await click('vm-rap-action');await page.clock.runFor(2401);
   await page.waitForFunction(()=>rapFixture.starts===4);await click('vm-rap-action');
   await page.waitForFunction(()=>document.querySelector('#vm-rap-status').textContent.includes('담기지'));
   eq(await value('stopped'),5,'empty recorder output still releases mic');
   await click('vm-rap-action');await page.clock.runFor(2401);await page.waitForFunction(()=>rapFixture.starts===5);
   await page.evaluate(()=>rapFixture.records.at(-1).dispatchEvent(new Event('error')));
   await page.waitForFunction(()=>document.querySelector('#vm-rap-status').textContent.includes('녹음하지'));
   eq(await value('stopped'),6,'recorder error releases mic');
   await set({mode:'hang'});await click('vm-rap-action');await page.clock.runFor(2401);
   await page.waitForFunction(()=>rapFixture.starts===6);await click('vm-rap-action');
   eq(await value('stopped'),7,'stop releases track before recorder finalizes');
   await page.clock.runFor(1600);
   await page.waitForFunction(()=>document.querySelector('#vm-rap-status').textContent.includes('녹음하지'));
   await set({mode:'ok',sound:'manual'});await click('vm-rap-action');await page.clock.runFor(2401);
   await page.clock.runFor(1001);await page.waitForFunction(()=>rapFixture.starts===7);
   eq((await value('logs')).slice(-3),['cue:start','cue:stop','rec:start'],'stalled cue is stopped before recording');
   await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
   await hidden('vm-rap-dialog');eq(await value('stopped'),8,'pagehide releases active mic');
   await click('vm-rap-open');await set({sound:'suspended'});await click('vm-rap-action');
   await page.clock.runFor(2401);await page.waitForFunction(()=>rapFixture.starts===8);
   await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,value:true});
    document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;
   });
   await hidden('vm-rap-dialog');eq(await value('stopped'),9,'backgrounding releases active mic');
   await click('vm-rap-open');
   const mic=await value('mic');await page.evaluate(()=>{window.MediaRecorder=undefined;});
   await click('vm-rap-action');
   await page.waitForFunction(()=>document.querySelector('#vm-rap-status').textContent.includes('브라우저에서는'));
   eq(await value('mic'),mic,'unsupported MediaRecorder makes no permission request');
   await click('vm-rap-close');
   eq(await snap(),before,'no challenge beacons or storage writes');
   eq(counts.blocked,blockedBefore,'no external requests during challenge');
   eq((await value('storage')).filter(k=>k!=='vm_visit_day'&&!k.startsWith('vm_ev_')),[],'no challenge storage');
   await page.clock.setFixedTime(new Date('2026-11-28T15:00:01Z'));
   await click('vm-rap-open');
   assert.notEqual(await $('vm-rap-words').textContent(),words,'new Korean day changes prompts');assertions++;
   await click('vm-rap-close');
   await page.locator('.lg[data-l="en"]').first().click();clicks++;
   await hidden('vm-rap-open');
   await page.locator('.lg[data-l="ko"]').first().click();clicks++;
   await visible('vm-rap-open');
   eq(await page.evaluate(()=>location.hash),invite,'challenge and language toggles preserve invite hash');
   await visible('duet-banner');await visible('group-banner');
  }else{
   await hidden('vm-rap-open');eq(counts.rap,0,'non-Korean route does not load rap module');
  }
  eq(await value('mic')===0,!kr,'no mic in any non-Korean route');
  await click('btn-start');await visible('mic-go','unchanged match CTA goes straight to existing microphone primer');
  eq(await page.evaluate(()=>Boolean(document.querySelector('#vm-rap-dialog')?.open)),false,'primary CTA never opens rap');
  eq(errs,[],'page errors');eq(counts.writes,0,'no non-GET');eq(counts.sockets,0,'no sockets');
  rows.push({locale:loc||'root',hash:createHash('sha256').update(html).digest('hex'),...counts});
  await ctx.close();
 }
 console.log(JSON.stringify({viewport:'390x844',clicks,assertions,rows},null,2));
} finally {await browser.close();}
