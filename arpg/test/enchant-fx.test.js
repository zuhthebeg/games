import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Container } from '../vendor/pixi-8.22.0.min.mjs';
import { enchantPresentation } from '../js/ui/enchant-fx.js';
import { weaponGlowSpec, withWeaponGlow } from '../js/render/weapon-glow.js';
import { equipmentVisual } from '../js/render/paperdoll-state.js';
import { emblem, portraitHtml } from '../js/ui/gear-view.js';
import { createSave } from '../js/meta/save.js';
import { HubUI } from '../js/ui/hub.js';

const success = {outcome:'success',id:'training_sword',from:5,to:6,risky:false,refund:null};
test('safe/risky/destroyed/crack presentation uses only committed immutable results', () => {
  const result = Object.freeze(success), before = JSON.stringify(result);
  assert.equal(enchantPresentation(result).chargeMs,300);
  assert.equal(enchantPresentation(result).title,'+6');
  assert.equal(JSON.stringify(result),before);
  assert.equal(enchantPresentation({...result,risky:true,to:7}).chargeMs,1200);
  assert.equal(enchantPresentation({...result,risky:true,to:7}).title,'+7 성공');
  const destroyed = enchantPresentation({...result,outcome:'destroyed',to:null,risky:true,refund:{enhance_stone_1:4}});
  assert.equal(destroyed.title,'장비가 산산조각 났다');assert.equal(destroyed.detail,'남은 강화석 4개');assert.equal(destroyed.sound,'kill');
  const crack = enchantPresentation({id:'scroll_enchant_armor',count:7});
  assert.equal(crack.kind,'crack');assert.equal(crack.title,'주문서 7장');
  assert.equal(enchantPresentation({...result,risky:true},true).chargeMs,80);
});
test('weapon tiers have bounded distinct effects and reduced motion has no particles/pulse/trail', () => {
  assert.equal(weaponGlowSpec(5).color,null);
  assert.equal(new Set([6,7,8,9,10].map(n=>weaponGlowSpec(n).color)).size,5);
  assert.equal(weaponGlowSpec(6).pulse,false);assert.equal(weaponGlowSpec(8).trail,true);
  assert.equal(weaponGlowSpec(9).particles,6);assert.equal(weaponGlowSpec(10).particles,10);assert.equal(weaponGlowSpec(10).ring,true);
  for(const level of [6,7,8,9,10]) {const s=weaponGlowSpec(level,true);assert.equal(s.particles,0);assert.equal(s.pulse,false);assert.equal(s.trail,false);}
});
test('glow wrapper reads frozen entity, reuses geometry after destruction, allocates no per-frame nodes', () => {
  const entity=Object.freeze({facing:0,dead:false});
  for (let attempt=0;attempt<3;attempt++) {
    const base={container:new Container(),debug:{mode:'fixture'},update(){},destroy(){this.container.destroy();}};
    const glow=withWeaponGlow(base,10,'blade'), count=glow.container.children[1].children.length;
    for(let frame=0;frame<100;frame++) glow.update(entity,{reduced:false,frozen:false},1/60);
    assert.equal(glow.container.children[1].children.length,count);assert.equal(glow.debug.weaponGlow.particles,10);
    glow.update(entity,{reduced:true,frozen:false},1/60);assert.equal(glow.debug.weaponGlow.particles,0);assert.equal(glow.debug.weaponGlow.reduced,true);
    glow.destroy();
  }
});
test('enhancement metadata changes badges/portrait/combat but not paperdoll baked-cache key', () => {
  const save=createSave({name:'글로우',answers:[0,0,0,0,0],createdAt:1});
  const baseline=equipmentVisual(save).key;
  for(let level=6;level<=10;level++) {
    save.items.find(i=>i.uid===save.equipped.weapon).enhance=level;
    assert.equal(equipmentVisual(save).key,baseline);assert.equal(equipmentVisual(save).enhance,level);
    assert.ok(emblem(save.items[0]).includes(`data-enhance="${level}"`));
    assert.ok(portraitHtml(save).includes(`portrait-weapon-glow" data-enhance="${level}"`));
  }
});
test('hub commits before playing and blocks actions during animation; no presentation writes to save/sim', () => {
  const hub=readFileSync(new URL('../js/ui/hub.js',import.meta.url),'utf8');
  const section=hub.slice(hub.indexOf("case 'enhance':"),hub.indexOf("case 'craft-scroll':"));
  assert.ok(section.indexOf('this.commit(save)')<section.indexOf('playEnchantFx'));
  assert.ok(hub.includes('if (this.enchantFx?.active) return;'));
  const fx=readFileSync(new URL('../js/ui/enchant-fx.js',import.meta.url),'utf8');
  assert.ok(!/\.save\(|\.commit\(|\.enhance\s*=|\.stacks\s*=/.test(fx));
});

test('a persistence failure neither plays a result nor advances in-memory save', () => {
  const hub=Object.create(HubUI.prototype);
  hub.save=createSave({name:'저장 실패',answers:[0,0,0,0,0],createdAt:1});
  hub.save.stacks.scroll_enchant_weapon=1;hub.forgeScroll='scroll_enchant_weapon';
  hub.persist=()=>{throw new Error('quota');};hub.showForge=()=>{throw new Error('must not show result');};
  const before=JSON.stringify(hub.save);
  assert.throws(()=>hub.action('enhance',{uid:'starter:weapon'}),/quota/);
  assert.equal(JSON.stringify(hub.save),before);assert.equal(hub.lastEnchant,undefined);assert.equal(hub.enchantFx,undefined);
});
