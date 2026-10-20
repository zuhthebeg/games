import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';
import { skillCardHtml } from '../js/ui/skill-view.js';
import { HUD } from '../js/ui/hud.js';
import { STAGES } from '../js/content/combat.js';

const banned = /아틀라스|대체 외형|오류 표시|인간 AI|기존 공격|실제 장착|침입 동의방|무기 Lv1|다섯 부위|맨뼈 기본|영구 진화|전용 회피|몸 판정 여유|유한 효과|유한 저주|최대 32지대|자신만 잔상/;
const text = html => html.replace(/<[^>]*>/g, ' ');
const fixture = save => Object.assign(Object.create(HubUI.prototype), {
  save, dev:false, recoverVitals(){}, show(html){this.html=html;},
});
for (const form of ['human','skeleton_knight','death_knight']) {
  test(`ordinary ${form} inn has no developer/spec notes and retains real identity/actions`, () => {
    const options = {name:'문구 검증',answers:[0,0,0,0,0],createdAt:1};
    const save = form === 'human' ? createSave(options) : createSkeletonSave({...options,lineage:'skeleton_knight'});
    if(form === 'death_knight') save.permanentDeathKnight=true;
    const h=fixture(save);h.showInn();
    assert.doesNotMatch(text(h.html),banned);
    assert.doesNotMatch(h.html, /class="minor"/);
    assert.match(h.html,/data-action="board"/);
    assert.match(h.html,/data-action="trainer"/);
    assert.match(h.html,/data-action="inventory"/);
    assert.match(h.html,/data-action="forge"/);
    assert.match(text(h.html),form==='death_knight' ? /데스나이트/ : form==='human' ? /잿빛 여관/ : /해골/);
    h.showTrainer();assert.doesNotMatch(text(h.html),banned);
    h.showInventory();assert.doesNotMatch(text(h.html),banned);
    h.showForge();assert.doesNotMatch(text(h.html),banned);
  });
}
test('quest UI uses named locations, not internal stage/quest identifiers', () => {
 const h=fixture(createSave({name:'지도',answers:[0,0,0,0,0],createdAt:1}));
 h.showBoard();assert.doesNotMatch(text(h.html),/\bS\d+\b|Q_\w+/);assert.match(text(h.html),new RegExp(STAGES.S1.name));
});
test('skill details keep costs, risks and requirements without engine limits/render notes', () => {
 const s=createSkeletonSave({lineage:'skeleton_knight',name:'기술',answers:[0,0,0,0,0],createdAt:1});
 for(const id of ['poison_field','curse','invisibility','berserk']) {
  const html=skillCardHtml(id,s,{context:'detail'});assert.doesNotMatch(text(html),banned);assert.match(text(html),/MP/);assert.match(text(html),/재사용/);
  if(id==='berserk') assert.match(text(html),/받는 피해 \+20%/);
 }
});

test('death explanation names the opponent and attack, never presentation source/internal IDs', () => {
 const explain = (by, ability, humans) => HUD.prototype.deathExplanation({entities:[{terminal:'death',deathCause:{by,ability}}],round:{presentation:{humans}}});
 assert.equal(explain('goblin','goblin_slash',{goblin:'blade'}),'인간 모험가 · 근접 · 고블린의 베기');
 assert.equal(explain('internal_actor_17','internal_attack_9',{}),'적 · 공격');
});
