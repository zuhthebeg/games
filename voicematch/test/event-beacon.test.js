// index.html 이벤트 카운터(VM-I10) 슬라이스 테스트 — node --test test/event-beacon.test.js
// 실제 index.html에서 /* ---- 이벤트 카운터 */ ~ function applyLang 구간을 잘라 vm 샌드박스에서 실행한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('/* ---- 이벤트 카운터'),html.indexOf('function applyLang'));
assert.ok(source.includes('function vmEv'),'이벤트 카운터 슬라이스를 찾지 못함 — index.html 마커 확인');

function harness({referrer='',lang='ko',storage=new Map(),beacon=true}={}){
  const beacons=[],fetches=[];
  const sessionStorage={getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>storage.set(k,String(v))};
  const navigator=beacon?{sendBeacon:(u,b)=>{beacons.push({u,b});return true;}}:{};
  const ctx=vm.createContext({document:{referrer},navigator,sessionStorage,URL,JSON,Blob,console,
    fetch:async(u,o)=>{fetches.push({u,o});return{ok:true};}});
  // LANG은 슬라이스 바깥 변수라 prelude로 주입한다
  vm.runInContext('let LANG='+JSON.stringify(lang)+';'+source,ctx);
  return{beacons,fetches,storage,run:s=>vm.runInContext(s,ctx)};
}
const beaconBody=async h=>JSON.parse(await h.beacons.at(-1).b.text());

test('visit — 페이지 로드 시 세션당 1회만 발송',async()=>{
  const storage=new Map();
  const h1=harness({storage});
  assert.equal(h1.beacons.length,1);
  assert.deepEqual(await beaconBody(h1),{ev:'visit',loc:'ko',ref:'direct'});
  h1.run('vmVisit()'); // 같은 세션 재호출 → 추가 발송 없음
  assert.equal(h1.beacons.length,1);
  const h2=harness({storage}); // 같은 sessionStorage = 같은 세션의 재로드
  assert.equal(h2.beacons.length,0);
  const h3=harness({storage:new Map()}); // 새 세션(새 탭) → 다시 1회
  assert.equal(h3.beacons.length,1);
});

test('이벤트 화이트리스트 — 목록 밖 ev는 발송하지 않는다',async()=>{
  const h=harness();
  h.run("vmEv('rec_start');vmEv('bogus');vmEv('login_tap');vmEv('');vmEv('admin')");
  assert.equal(h.beacons.length,3); // visit + rec_start + login_tap
  const evs=[];
  for(const b of h.beacons)evs.push(JSON.parse(await b.b.text()).ev);
  assert.deepEqual(evs,['visit','rec_start','login_tap']);
});

test('ref 매핑 — document.referrer 호스트를 enum으로 정규화',async()=>{
  const h=harness({referrer:'https://www.threads.net/@foo/post/123'});
  assert.deepEqual(await beaconBody(h),{ev:'visit',loc:'ko',ref:'threads'});
  const cases=[
    ['https://l.threads.net/l.php?u=x','threads'],['https://threads.com/@a','threads'],
    ['https://www.instagram.com/p/abc','instagram'],['https://l.instagram.com/','instagram'],
    ['https://m.facebook.com/story','facebook'],['https://lm.facebook.com/l.php','facebook'],
    ['https://x.com/a/status/1','x'],['https://mobile.twitter.com/a','x'],['https://t.co/abc','x'],
    ['https://www.google.co.kr/search?q=x','google'],['https://google.com/','google'],
    ['https://www.reddit.com/r/kpop','other'],['https://youtu.be/x','other'],
    ['', 'direct'],['notaurl','direct'],
  ];
  for(const[u,want]of cases)assert.equal(h.run(`vmRefOf(${JSON.stringify(u)})`),want,u);
});

test('sendBeacon이 없으면 keepalive fetch로 폴백',async()=>{
  const h=harness({beacon:false});
  assert.equal(h.beacons.length,0);
  assert.equal(h.fetches.length,1); // visit
  h.run("vmEv('share')");
  assert.equal(h.fetches.length,2);
  const last=h.fetches.at(-1);
  assert.equal(last.o.method,'POST');
  assert.equal(last.o.keepalive,true);
  assert.match(last.o.body,/"ev":"share"/);
});

test('loc는 현재 LANG 값을 그대로 보낸다',async()=>{
  for(const lang of['ko','en','ja','es','pt','tw','id']){
    const h=harness({lang});
    assert.equal(JSON.parse(await h.beacons[0].b.text()).loc,lang);
  }
});

test('funnel events are first-only across retries, language changes and reloads',()=>{
  const storage=new Map(),h=harness({storage});
  h.run("for(let i=0;i<3;i++){vmEv('rec_start');vmEv('analyze_done');vmEv('result_view');}LANG='tw';vmEv('result_view')");
  assert.equal(h.beacons.length,4);
  const again=harness({storage});again.run("vmEv('rec_start');vmEv('analyze_done');vmEv('result_view')");assert.equal(again.beacons.length,0);
  h.run("vmEv('share');vmEv('share');vmEv('login_tap');vmEv('login_tap')");assert.equal(h.beacons.length,8);
});
test('blocked storage keeps first-only guard in memory',()=>{
  const h=harness();h.run("sessionStorage.getItem=()=>{throw Error('blocked')};for(let i=0;i<3;i++)vmEv('rec_start')");assert.equal(h.beacons.length,2);
});

test('landing attribution precedes referrer without accepting arbitrary enums',()=>{
 const h=harness();for(const [url,ref,want] of [
 ['https://game.cocy.io/voicematch/tw/?utm_source=share#g=abc','https://threads.net/','share'],
 ['https://game.cocy.io/voicematch/#d=abc','https://game.cocy.io/','invite'],
 ['https://game.cocy.io/voicematch/#g=abc','https://x.com/','invite'],
 ['https://game.cocy.io/voicematch/','https://game.cocy.io/','portal'],
 ['https://game.cocy.io/voicematch/?utm_source=attacker','https://google.com/','google']])assert.equal(h.run(`vmRefOf(${JSON.stringify(ref)},${JSON.stringify(url)})`),want);
});
test('new event whitelist accepts only approved signals',()=>{const h=harness();h.run("['visit_return','newchip_tap','req_done_seen','daily_play','invite_open'].forEach(vmEv)");assert.equal(h.beacons.length,6);});

for(const ev of ['social_tap_duet','social_tap_group'])test(ev+' is first-only per session, independent of locale, reload and the other choice',async()=>{
 const storage=new Map(),h=harness({storage,referrer:'https://threads.net/'});h.run("vmEv('"+ev+"');vmEv('"+ev+"');LANG='tw';vmEv('"+ev+"')");
 assert.equal(h.beacons.length,2);assert.deepEqual(await beaconBody(h),{ev,loc:'ko',ref:'threads'});
 const again=harness({storage});again.run("vmEv('"+ev+"')");assert.equal(again.beacons.length,0);
 const fresh=harness();fresh.run("vmEv('"+ev+"')");assert.equal(fresh.beacons.length,2);
 const blocked=harness();blocked.run("sessionStorage.getItem=()=>{throw Error('blocked')};vmEv('"+ev+"');vmEv('"+ev+"')");assert.equal(blocked.beacons.length,2);
});
test('duet and group each have their own session-first guard',()=>{const h=harness();h.run("['social_tap_duet','social_tap_group','social_tap_duet','social_tap_group'].forEach(vmEv)");assert.equal(h.beacons.length,3);});
