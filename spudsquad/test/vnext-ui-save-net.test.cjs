const {test}=require('node:test'), a=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const D=require('../js/data.js'),S=require('../js/sim.js'),N=require('../js/net.js');
function storage(){const m=new Map();return {getItem:k=>m.get(k),setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k)};}
function i18n(lang){const window={SPUD:{data:D},navigator:{language:lang}};vm.runInNewContext(fs.readFileSync(require.resolve('../js/i18n.js'),'utf8'),{window,navigator:window.navigator,document:{documentElement:{},getElementById:()=>null}});return window.SPUD.i18n;}
for(const lang of ['ko','en','zh-TW'])test('semantic benefit/penalty based on mechanics, not numeric sign '+lang,()=>{
 const I=i18n(lang);
 for(const id of Object.keys(D.items))a.ok(I.itemParts(id).every(p=>p.text&&['positive','negative','neutral'].includes(p.tone)),id);
 for(const id of ['whistle','alien_baby','potato_crown','blood_pack','ghost_sheet','bait','handcuffs','sad_tomato','focus_lens'])a.ok(I.itemParts(id).some(p=>p.tone==='negative'),id);
 a.ok(I.itemParts('white_flag').some(p=>p.tone==='positive'&&/-5/.test(p.text)));
 for(const id of ['robot_arm','wisdom_scroll','peacock_feather']){const parts=I.itemParts(id);a.ok(parts.some(p=>p.tone==='negative'));a.ok(parts.some(p=>p.tone==='positive'));}
 a.ok(I.itemParts('piercing_prism').some(p=>p.tone==='neutral'&&/2/.test(p.text)));
});
test('old save levels XP items stats grandfathered unchanged, T5/T6 saved and7 rejected',()=>{
 for(const tier of [4,5,6,7]){const w=S.createWorld(),p=w.players.solo,st=storage();p.weapons=[['pistol',tier]];p.lvl=20;p.xp=123;p.stats.regen=8;p.items=['bandage','bandage'];
 a.equal(S.soloSave.save(st,{mode:'wave',world:w,offers:[]},1000),true);const r=S.soloSave.load(st,1001);
 if(tier===7){a.equal(r,null);continue;}a.equal(r.world.players.solo.lvl,20);a.equal(r.world.players.solo.xp,123);a.deepEqual(r.world.players.solo.weapons,[['pistol',tier]]);a.deepEqual(r.world.players.solo.items,p.items);a.deepEqual(r.world.players.solo.stats,p.stats);}
});
test('host receives actual T5/T6 READY, refuses7; serialized snapshots preserve tier',()=>{
 const h=new N.Session({uid:'host',host:'host'});h.players={host:{},guest:{}};h.wave=4;h.world=S.createWorld({wave:4,players:{host:{char:'basic'},guest:{char:'basic'}}});
 for(const tier of [5,6,7]){h.ready.clear();h.receive({type:'READY',payload:{uid:'guest',loadout:{weapons:[['laser',tier]]}}});a.equal(h.world.players.guest.weapons[0][1],tier===7?6:tier);}
 h.start(5); const payload=JSON.parse(JSON.stringify(h.lastPlayers));a.deepEqual(payload.guest.weapons,[['laser',6]]);a.deepEqual(h.world.players.guest.weapons,[['laser',6]]);
});
test('owner mean uses weapons only, empty defaults1; locked quoted stock remains buyable',()=>{
 const w=S.createWorld({rng:()=>.1}),p=w.players.solo;p.mats=10000;p.lvl=99;p.weapons=[];a.equal(S.weaponMean(p),1);a.equal(S.rollWeaponTier(w,p),2);
 const old={id:'pistol',weapon:true,tier:1,price:13,locked:true};p.weapons=[['pistol',5]];a.equal(S.buy(p,old),true);a.equal(p.mats,9987);a.equal(old.price,13);
 for(let i=0;i<1000;i++)for(const o of S.shop(w,p))if(o.weapon)a.ok(o.tier>S.weaponMean(p));
});
test('15 casts use bounded immutable cached geometry; no particles, expiry and no filter',()=>{
 const window={SPUD:{data:D}},source=fs.readFileSync(require.resolve('../js/fx.js'),'utf8');vm.runInNewContext(source,{window,localStorage:{getItem:()=>null},performance:{now:()=>0}});
 const fx=new window.SPUD.fx.Effects();let arcs=0,lines=0;
 const c={save(){},restore(){},beginPath(){},arc(){arcs++},stroke(){},moveTo(){},lineTo(){lines++}};
 for(const char of Object.keys(D.chars)){fx.add([['ult',10,20,D.ults[char].radius,char]],'x',0);const cast=fx.trails.at(-1);a.ok(Object.isFrozen(cast.style));a.ok(Object.isFrozen(cast.style.points));fx.draw(c,1/30,200);}
 a.ok(fx.trails.filter(v=>v.kind==='ult').length<=4);a.equal(fx.particles.length,0);a.ok(arcs>15);a.ok(lines>15);fx.draw(c,1/30,4001);a.equal(fx.trails.filter(v=>v.kind==='ult').length,0);a.ok(!/\.filter\s*=/.test(source));
});
