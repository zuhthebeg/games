import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SKILL_ART,skillIcon,installSkillArtFallback,loadoutHtml,skillCardHtml} from '../js/ui/skill-view.js';
import {createSave} from '../js/meta/save.js';
const expected=['lunge','whirl','heavy_cleave','volley','pierce_shot','blast_arrow','ember_bolt','frost_lance','flame_ring','healing_light'];
test('only original ten map to distinct shipped small WebPs',()=>{
 assert.deepEqual(Object.keys(SKILL_ART),expected);let total=0;const hashes=[];
 for(const id of expected){const path=new URL('../'+SKILL_ART[id],import.meta.url),data=readFileSync(path);total+=statSync(path).size;assert.ok(data.length<15360);assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WEBP');hashes.push(createHash('sha256').update(data).digest('hex'));}
 assert.equal(new Set(hashes).size,10);assert.ok(total<200000);
});
test('shared loadout/academy/detail preserve illustrations, faculty and decorative accessible markup',()=>{
 const save=createSave({name:'icon fixture',answers:[0,0,0,0,0],createdAt:1});save.learned.push('whirl');save.loadout=['lunge','whirl','ember_bolt'];
 for(const context of ['academy','detail','character']) assert.match(skillCardHtml('lunge',save,{context}),/assets\/skill-icons\/lunge.webp/);
 assert.match(loadoutHtml(save),/assets\/skill-icons\/lunge.webp/);
 assert.match(readFileSync(new URL('../js/ui/hud.js',import.meta.url),'utf8'),/skillIcon\(id\)/);
 for(const id of expected){const html=skillIcon(id);assert.match(html,/faculty-(blade|bow|focus)/);assert.match(html,/alt=""/);assert.match(html,/aria-hidden="true"/);assert.doesNotMatch(html,/onerror|onload/);}
});
function fixture(decode=()=>Promise.resolve(),cached=false){
 const events={};const image={hidden:true,src:'http://local/icon.webp',currentSrc:'http://local/icon.webp',naturalWidth:256,isConnected:true,complete:cached,decode,matches:()=>true,removeAttribute(k){if(k==='src')this.src='';}};
 const root={addEventListener(k,fn,capture){assert.equal(capture,true);events[k]=fn;},removeEventListener(k){delete events[k];},querySelectorAll:()=>cached?[image]:[]};
 return {events,image,root};
}
const settle=()=>new Promise(r=>setImmediate(r));
test('success reveals only after decode and cached successful images are supported',async()=>{
 const f=fixture();const dispose=installSkillArtFallback(f.root);f.events.load({target:f.image});assert.equal(f.image.hidden,true);await settle();assert.equal(f.image.hidden,false);dispose();assert.deepEqual(f.events,{});
 const c=fixture(undefined,true);installSkillArtFallback(c.root);await settle();assert.equal(c.image.hidden,false);
});
test('HTTP error and decode rejection retain SVG and remove broken image source',async()=>{
 const h=fixture();installSkillArtFallback(h.root);h.events.error({target:h.image});assert.equal(h.image.hidden,true);assert.equal(h.image.src,'');
 const d=fixture(()=>Promise.reject(Error('decode failure')));installSkillArtFallback(d.root);d.events.load({target:d.image});await settle();assert.equal(d.image.hidden,true);assert.equal(d.image.src,'');
});
