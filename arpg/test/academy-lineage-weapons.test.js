import test from 'node:test';
import assert from 'node:assert/strict';
import {createSave,validateSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {trained} from './fixtures/trained.js';
import {ABILITIES,canUseSkill} from '../js/content/combat.js';
import {BOOKS,learnSkill,equipSkill,setSlot,characterSkills,hasSkill} from '../js/meta/skills.js';
import {HubUI} from '../js/ui/hub.js';
import {skillCardHtml} from '../js/ui/skill-view.js';
const fresh=(bone,evolved=false)=>{const s=trained(bone?createSkeletonSave({lineage:'skeleton_knight',name:'academy',answers:[0,0,0,0,0],createdAt:1}):createSave({name:'academy',answers:[0,0,0,0,0],createdAt:1}),30);s.gold=10000;if(evolved)s.permanentDeathKnight=true;assert.ok(validateSave(s));return s;};
for(const [bone,evolved] of [[false,false],[true,false],[true,true]])test(`academy lineage hide and atomic rejection bone=${bone} evolved=${evolved}`,()=>{
 const s=fresh(bone,evolved),wrong=Object.keys(BOOKS).filter(id=>bone?ABILITIES[id].requiresHuman:ABILITIES[id].requiresSkeleton);
 s.learned=[...wrong];s.loadout=[wrong[0],null,null];assert.ok(validateSave(s));const before=structuredClone(s);
 const h=Object.assign(Object.create(HubUI.prototype),{save:s,root:{},showInnPanel(t,html){this.html=html;}});let html='';
 for(const family of ['blade','focus','bow']){h.academyFamily=family;h.showTrainer();html+=h.html;}
 for(const id of wrong){const unlearned=fresh(bone,evolved),unchanged=structuredClone(unlearned);assert.throws(()=>learnSkill(unlearned,id),/계보/);assert.deepEqual(unlearned,unchanged);assert.ok(!html.includes(`data-skill="${id}"`));assert.equal(hasSkill(s,id),false);assert.ok(!characterSkills(s).includes(id));assert.throws(()=>setSlot(s,ABILITIES[id].family,1,id));assert.throws(()=>learnSkill(s,id),/계보/);assert.throws(()=>equipSkill(s,ABILITIES[id].family,id));for(const context of ['academy','character','detail'])assert.equal(skillCardHtml(id,s,{context}),'',id+' '+context);for(const [weapon,form]of [['blade','sword'],['blade','blunt'],['bow','bow'],['focus','wand'],['focus','staff']])assert.equal(canUseSkill(id,weapon,form,s.lineage,2),false);}
 assert.match(html,/data-skill="berserk"/);assert.match(html,/data-skill="healing_light"/);assert.deepEqual(s,before);
});
const label=(id,s)=>{const html=skillCardHtml(id,s);const match=html.match(/class="skill-weapons"[^>]*>([^<]+)</);assert.ok(match,id+' weapon label');return match[1];};
test('academy labels actual forms and handedness, not faculty or currently held weapon',()=>{const human=fresh(false),bone=fresh(true),evolved=fresh(true,true);
 assert.equal(label('berserk',human),'양손 검 · 양손 둔기');assert.equal(label('sword_wave',human),'검');
 for(const s of [bone,evolved]){assert.equal(label('berserk',s),'모든 무기');assert.doesNotMatch(skillCardHtml('berserk',s),/양손 근접/);assert.equal(label('poison_field',s),'모든 무기');assert.equal(label('poison_arrow',s),'활');assert.equal(label('cursed_hands',s),'완드 · 스태프');assert.equal(label('dead_explosion',s),'검 · 둔기');}
 assert.equal(label('ground_slam',human),'둔기');assert.equal(label('meteor',human),'완드 · 스태프');assert.equal(label('protective_shield',human),'모든 무기');
});
