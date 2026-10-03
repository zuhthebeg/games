const {test}=require('node:test'),a=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const D=require('../js/data.js'),S=require('../js/sim.js');
test('boss gem uses one immutable vector cache, >2x normal body, normal blue gem unchanged',()=>{
 const calls=[],canvases=[];const c=new Proxy({}, {get:(t,k)=>k in t?t[k]:(...v)=>calls.push([k,...v]),set:(t,k,v)=>{t[k]=v;calls.push(['set',k,v]);return true;}});
 const document={createElement(){const canvas={width:0,height:0,getContext:()=>c};canvases.push(canvas);return canvas;}};
 const window={SPUD:{data:D,sim:S,fx:{Effects:class{constructor(){this.shake=0;this.stopUntil=999;this.corpses=[];}draw(){}}}},addEventListener(){}};
 class Image{constructor(){this.width=this.naturalWidth=64;this.height=this.naturalHeight=64;}}
 vm.runInNewContext(fs.readFileSync(process.env.SPUD_RENDER_SOURCE||require.resolve('../js/render.js'),'utf8'),{window,document,Image,devicePixelRatio:1,performance:{now:()=>0}});
 const r=new window.SPUD.render.Renderer({width:390,height:732,clientWidth:390,clientHeight:732,getContext:()=>c});
 const scene={cr:[[1,100,100,1,'solo',2]],d:[[2,200,200]],pl:[],e:[],fx:[]};
 r.draw(scene,'none',1);r.draw(scene,'none',2);r.draw(scene,'none',3);
 const caches=canvases.filter(c=>c.width===72&&c.height===72);a.equal(caches.length,1);
 const draws=calls.filter(v=>v[0]==='drawImage'&&v[1]===caches[0]);a.equal(draws.length,3);a.equal(draws[0][1],draws[2][1]);
 a.ok(calls.some(v=>v[0]==='fillRect'&&v[3]===26&&v[4]===26),'boss blue body26 vs normal12, >2x');
 a.equal(calls.filter(v=>v[0]==='fillRect'&&v[1]===-6&&v[2]===-6&&v[3]===12&&v[4]===12).length,3);
 a.ok(!calls.some(v=>v[0]==='set'&&v[1]==='filter'&&v[2]!=='none'));
 a.ok(!calls.some(v=>v[0]==='set'&&v[1]==='shadowBlur'&&v[2]>0));
});
