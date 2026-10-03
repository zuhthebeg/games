'use strict';
const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../js/data.js'),S=require('../js/sim.js'),N=require('../js/net.js');
const source=id=>fs.readFileSync(require.resolve('../js/'+id+'.js'),'utf8');
function renderHarness(){
 const calls=[];const c=new Proxy({filter:'none'}, {get(t,k){return k in t?t[k]:(...v)=>calls.push([k,...v])},set(t,k,v){t[k]=v;calls.push(['set',k,v]);return true}});
 const document={createElement:()=>({width:0,height:0,getContext:()=>c})};
 const window={SPUD:{data:D,sim:S,fx:{Effects:class{constructor(){this.stopUntil=0;this.shake=0}}}},addEventListener(){}};
 class Image{constructor(){this.width=this.naturalWidth=64;this.height=this.naturalHeight=64;}}
 vm.runInNewContext(source('render'),{window,document,Image,devicePixelRatio:1,performance:{now:()=>0}});
 const R=window.SPUD.render.Renderer,r=new R({width:200,height:100,clientWidth:200,clientHeight:100,getContext:()=>c});return {R,r,c,calls,images:window.SPUD.render.images};
}
test('hit flash draws a cached alpha-mask sprite without a per-frame Canvas filter',()=>{
 const {r,c,calls,images}=renderHarness();const im=images.blob;im.onload();calls.length=0;
 for(let i=0;i<20;i++)r.sprite('blob',10,10,40,1,0,true);
 a.ok(!calls.some(v=>v[0]==='set'&&v[1]==='filter'&&v[2]!=='none'),'no full-surface filtered draw');
 const draws=calls.filter(v=>v[0]==='drawImage');a.equal(draws.length,20);a.notEqual(draws[0][1],im,'precomputed white sprite');a.equal(draws[0][1],draws.at(-1)[1],'same cached sprite reused');
});
test('non-flashing ground/art/weapon images do not allocate white-mask canvases',()=>{
 const {images}=renderHarness();for(const id of ['bg_ground','key_art','weapon_smg']){images[id].onload();a.equal(images[id].flash,undefined,id);}
});
test('hitstop cannot freeze the camera and whole world draw while simulation moves',()=>{
 const {r,calls}=renderHarness();r.effects.stopUntil=100;calls.length=0;r.draw(null,'hero',50);
 a.ok(calls.some(v=>v[0]==='fillRect'),'world still repaints during hit feedback');
});
test('unchanged HUD does not rebuild team nodes every animation frame',()=>{
 let writes=0;const nodes=new Map();const node=id=>{if(!nodes.has(id)){const t={style:{},classList:{toggle(){},remove(){}},setAttribute(){}};for(const key of ['innerHTML','textContent']){let value;Object.defineProperty(t,key,{get:()=>value,set:v=>{writes++;value=v}})}nodes.set(id,t)}return nodes.get(id)};
 const window={SPUD:{data:D,sim:S,main:{session:{wave:1,players:{ally:{name:'Ally'}},lastPlayers:{ally:{char:'basic'}}}}}};
 const document={getElementById:node,documentElement:{},body:{classList:{toggle(){}}}};
 vm.runInNewContext(source('i18n'),{window,document,navigator:{language:'ko'}});vm.runInNewContext(source('ui'),{window,document,requestAnimationFrame(){}});
 const w=S.createWorld({players:{hero:{char:'basic'},ally:{char:'basic'}}});window.SPUD.ui.hud(w,'hero');const initial=writes;for(let i=0;i<20;i++)window.SPUD.ui.hud(w,'hero');a.equal(writes,initial);
 w.players.ally.hp--;window.SPUD.ui.hud(w,'hero');a.ok(writes>initial);a.match(node('team').innerHTML,/11\/12/);
});
test('this game has no GTM or AdSense loader, retains shared wallet and reserved header',()=>{
 const html=fs.readFileSync(require.resolve('../index.html'),'utf8');a.doesNotMatch(html,/googletagmanager\.com|googlesyndication\.com|adsbygoogle|shared-ads/);a.match(html,/lib\/shared-wallet\.js/);a.match(html,/--wallet-bar-h:\s*56px/);
});
test('jittered, delayed, duplicate and stale snapshots retain monotonic positions and bounded stops',()=>{
 const b=new N.Buffer(),snap=(k,x)=>({t:'s',k,w:1,tm:10,e:[[1,'blob',x,0,100]],pl:[['hero',x,0,12,12,true,0,0,1,'basic',1]],d:[],fx:[]});
 let x=-Infinity;for(const [k,at,pos]of [[1,0,0],[2,90,30],[3,210,60],[2,220,-90],[4,245,90],[4,250,-100],[5,600,120]]){b.push(snap(k,pos),at);const s=b.sample(at);a.ok(s.e[0][2]>=x);a.ok(s.e[0][2]<=b.a.at(-1).s.e[0][2]);x=s.e[0][2];}
 a.equal(b.sample(1e6).e[0][2],120);a.equal(b.sample(1e6).pl[0][1],120);
});
function packetWithHits(count) {
 const w=S.createWorld({wave:20,players:Object.fromEntries(['a','b','c','d'].map(uid=>[uid,{char:'gunslinger'}]))});
 for(let i=0;i<150;i++)S.spawn(w,['tank','gunner','shielder','buffer'][i%4],i*7,600);
 w.fx=Array.from({length:count},(_,i)=>['hit',800,600,12,false,i%150]);return N.encode(w);
}
test('representative 4p/150-enemy snapshot plus 50 hit events stays below the 8KiB target',()=>{
 const p=packetWithHits(50);a.equal(p.e.length,150);a.equal(p.pl.length,4);a.equal(p.fx.length,50);a.ok(Buffer.byteLength(JSON.stringify(p))<8192);
});
test('8KiB is not an enforced cap: larger FX bursts retain all authoritative rows',()=>{
 const p=packetWithHits(150),raw=JSON.stringify(p);a.ok(Buffer.byteLength(raw)>8192);a.ok(raw.length+100<32768,'below observed relay-source string cutoff');
 const decoded=N.decode(JSON.parse(raw));a.equal(decoded.e.length,150);a.equal(decoded.pl.length,4);a.equal(decoded.fx.length,150);
});
test('guest accepts only current-wave host authority; stale snapshots cannot replay FX',()=>{
 let fx=0;const g=new N.Session({uid:'guest',host:'host',onSnapshot:()=>fx++});g.wave=1;const s={t:'s',w:1,k:3,tm:10,e:[],pl:[],d:[],fx:[['ult',1,2,3]]};g.rt('other',s,0);g.rt('host',{...s,w:0},0);a.equal(fx,0);g.rt('host',s,0);g.rt('host',s,1);g.rt('host',{...s,k:2},2);a.equal(fx,1);
});
