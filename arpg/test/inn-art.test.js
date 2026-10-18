import test from 'node:test';
import assert from 'node:assert/strict';
import { HubUI } from '../js/ui/hub.js';
import { createSave } from '../js/meta/save.js';
import { createSkeletonSave } from '../js/meta/character-creation.js';

const saveFor = lineage => lineage === 'human'
  ? createSave({name:'Inn art',answers:[0,0,0,0,0],createdAt:1})
  : createSkeletonSave({lineage:'skeleton_knight',name:'Inn art',answers:[0,0,0,0,0],createdAt:1});
const hubFor = lineage => Object.assign(Object.create(HubUI.prototype), {
  save:saveFor(lineage),recoverVitals(){},dev:false,
  show(html,page){this.html=html;this.page=page;},
});

for (const lineage of ['human','skeleton_knight']) {
  test(`${lineage}: one smith entry owns crafting, navigation never mutates the save`, () => {
    const hub=hubFor(lineage),before=structuredClone(hub.save);
    hub.showInn();
    assert.doesNotMatch(hub.html,/data-action="craft-hub"/);
    assert.equal((hub.html.match(/data-action="forge"/g)||[]).length,1);
    hub.action('forge',{});assert.equal(hub.page,'forge');
    hub.action('forge-tab',{tab:'salvage'});
    assert.match(hub.html,/data-forge-tab="salvage"/);
    assert.match(hub.html,/class="craft-list"/);
    assert.deepEqual(hub.save,before);
  });
  test(`${lineage}: storage, bag and merchant use different authored subjects with DOM labels`, () => {
    const hub=hubFor(lineage);hub.showInn();
    for (const [action,subject] of [['inventory','storage'],['bag','bag'],['merchant','merchant'],['shop','supplies'],['forge','smith'],['trainer','academy']]) {
      assert.match(hub.html,new RegExp(`<button[^>]*data-action="${action}"[^>]*><img[^>]*src="[^\"]*/${subject}\\.webp"[^>]*alt=""[^>]*><strong>[^<]+</strong>`));
    }
    assert.match(hub.html,/inn-room\.webp/);
    assert.match(hub.html,/hearth\.webp/);
    assert.match(hub.html,/map\.webp/);
    assert.equal((hub.html.match(/class="inn-flame /g)||[]).length,3);
    assert.match(hub.html,/class="inn-fire" aria-hidden="true"/);
    assert.match(hub.html,lineage==='human'?/잿빛 여관/:/잊힌 묘지/);
  });
}

test('delivered model art has nine distinct hash-bound WebP files within the UI budget', async () => {
  const {readFile}=await import('node:fs/promises');
  const {createHash}=await import('node:crypto');
  const base=new URL('../assets/inn/',import.meta.url);
  const manifest=JSON.parse(await readFile(new URL('manifest.json',base),'utf8'));
  assert.equal(manifest.assets.length,9);assert.equal(manifest.model.offline,true);assert.equal(manifest.model.paidApiUsed,false);
  assert.equal(new Set(manifest.assets.map(a=>a.outputSha256)).size,9);
  let total=0;
  for(const entry of manifest.assets){
    const bytes=await readFile(new URL(entry.output,base));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.outputSha256,entry.id+' delivered bytes');
    assert.equal(bytes.length,entry.outputBytes);assert.match(entry.sourceSha256,/^[a-f0-9]{64}$/);
    assert.ok(Number.isInteger(entry.seed)&&entry.prompt.length>20&&entry.negative.length>20&&entry.reviewedDirectly);
    total+=bytes.length;
  }
  assert.equal(total,manifest.totalWebPBytes);assert.ok(total<512*1024,'all nine decode-ready images fit under 512 KiB');
});

test("main inn omits recovery and load rows but bag retains load information", () => {
 const hub=hubFor("human"),before=structuredClone(hub.save);hub.showInn();
 assert.doesNotMatch(hub.html,/inn-recovery|class="p2-weight"/);
 hub.action("bag",{});assert.match(hub.html,/class="p2-weight(?: |")/);
 assert.deepEqual(hub.save,before);
});
