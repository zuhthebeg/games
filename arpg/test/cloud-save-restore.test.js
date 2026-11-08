import test from 'node:test';
import assert from 'node:assert/strict';
import { CloudSave, snapshot } from '../js/meta/cloud-save.js';
import { CharacterStores } from '../js/meta/selected-character.js';
import { createSave } from '../js/meta/save.js';
const key = 'arpg.save.v1', side = key + '.cloud-owner.v1';
const fresh = name => createSave({ name, answers:[0,0,0,0,0], createdAt:41 });
function rig() {
  const bytes = new Map([['relay_token','A1']]), writes = [], puts = []; let hook = () => {}, remote = fresh('RemoteA');
  const storage = { getItem:k => bytes.get(k) ?? null, setItem(k,v) { hook(k,v); writes.push([k,v]); bytes.set(k,v); }, removeItem:k => bytes.delete(k) };
  const cloud = new CloudSave({ storage, now:() => 100000, timer:() => 0, cancelTimer() {}, fetcher:async (u,o) => {
    if (u.endsWith('/me')) return { ok:true, json:async () => ({ id:'A' }) };
    if (o.method === 'PUT') { puts.push(JSON.parse(o.body)); return { ok:true, status:200 }; }
    return { ok:true, json:async () => ({ characters:[{ charId:'human', data:snapshot(remote) }] }) };
  } });
  return { bytes, writes, puts, cloud, characters:new CharacterStores(cloud.characterStorage()), hook:fn => hook=fn, remote:save => remote=save };
}
async function offered(occupied) {
  const h=rig(); await h.cloud.load();
  if (occupied) { h.cloud.restore('human'); h.characters.selectHuman(); const newer=fresh('RemoteA'); newer.xp=10; h.remote(newer); await h.cloud.load(); }
  h.writes.length=0; return h;
}
for (const occupied of [false,true]) test('CS2 restore stage destination race preserves foreign bytes and writes no backup: '+occupied, async () => {
  const h=await offered(occupied), raw=JSON.stringify(fresh('Foreign'));
  h.hook((k,v) => { if (k===side && !JSON.parse(v).committed) h.bytes.set(key,raw); });
  assert.throws(() => h.cloud.restore('human')); h.hook(() => {});
  assert.equal(h.bytes.get(key),raw); assert.equal(JSON.parse(h.bytes.get(side)).committed,false);
  assert.equal(h.writes.filter(([k]) => k===key || k.startsWith(key+'.cloud-backup.')).length,0);
  assert.equal(h.writes.filter(([k,v]) => k===side && JSON.parse(v).committed).length,0);
});
test('CS2 restore final proof is not committed if stage record was replaced during local write', async () => {
  const h=await offered(false), foreignProof=JSON.stringify({v:1,owner:'B',committed:false});
  h.hook(k => { if (k===key) h.bytes.set(side,foreignProof); });
  assert.throws(() => h.cloud.restore('human')); h.hook(() => {});
  assert.equal(h.bytes.get(side),foreignProof); assert.equal(h.writes.filter(([k,v]) => k===side && JSON.parse(v).committed).length,0);
  const saved=JSON.parse(h.bytes.get(key)); h.cloud.changed(saved); await h.cloud.flush({hidden:true}); assert.equal(h.puts.length,0);
});
test('CS2 restore rechecks destination after occupied backup IO', async () => {
  const h=await offered(true), raw=JSON.stringify(fresh('OtherTab'));
  h.hook(k => { if (k.startsWith(key+'.cloud-backup.')) h.bytes.set(key,raw); });
  assert.throws(() => h.cloud.restore('human')); h.hook(() => {});
  assert.equal(h.bytes.get(key),raw); assert.equal(JSON.parse(h.bytes.get(side)).committed,false);
  assert.equal(h.writes.filter(([k]) => k===key).length,0);
});
