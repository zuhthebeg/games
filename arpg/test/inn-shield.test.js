import test from 'node:test';
import assert from 'node:assert/strict';
import {createSave} from '../js/meta/save.js';
import {createSkeletonSave} from '../js/meta/character-creation.js';
import {instance,ITEMS} from '../js/meta/items.js';
import {portraitHtml} from '../js/ui/gear-view.js';
import {SHIELDS} from '../js/content/shields.js';
import {skeletonAppearance} from '../js/render/skeleton-equipment-state.js';
for(const kind of ['human','skeleton','evolved'])test(`inn shield actual equipped contour and hand binding ${kind}`,()=>{
 const s=kind==='human'?createSave({name:'test',answers:[0,0,0,0,0],createdAt:1}):createSkeletonSave({lineage:'skeleton_knight',name:'test',answers:[0,0,0,0,0],createdAt:1});if(kind==='evolved')s.permanentDeathKnight=true;
 for(const [id,spec] of Object.entries(SHIELDS)){
 s.items.push(instance('test:'+id,id,0,[]));s.equipped.offhand='test:'+id;
 for(const dir of ['E','SE','S','SW','W','NW','N','NE']){
 const html=portraitHtml(s,dir);if(kind==='skeleton'){assert.match(html,/data-paperdoll=/);assert.ok(skeletonAppearance(s).layers.includes(id));assert.doesNotMatch(html,/class="portrait-shield"/);continue;}assert.match(html,new RegExp(`data-shield-type="${id}"`));assert.match(html,new RegExp(`data-shape="${spec.shape}"`));assert.match(html,/viewBox="0 0 128 128"/);assert.match(html,new RegExp(`data-behind="${['E','NE','N','NW'].includes(dir)}"`));
 }
 }
 s.equipped.offhand=null;assert.doesNotMatch(portraitHtml(s),/class="portrait-shield"/);
 for(const [id,d]of Object.entries(ITEMS).filter(([,d])=>d.slot==='weapon'&&(d.handedness===2||d.family==='bow'||d.form==='staff')).slice(0,15)){
 s.items.push(instance('test:w',id,0,[]));s.equipped.weapon='test:w';s.equipped.offhand='test:buckler';assert.doesNotMatch(portraitHtml(s),/class="portrait-shield"/);s.items.pop();
 }
});
