// Verify all baseline definitions, identity/render helpers, sprites and forbidden-file bytes.
// node arpg/tools/art/m2a/verify-main.mjs <git-archive-directory> [baseline revision]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const [directory,revision='fef289f']=process.argv.slice(2);assert.ok(directory);
const base=execFileSync('git',['rev-parse',revision],{encoding:'utf8'}).trim();
const art='arpg/tools/art/m2a/';const ids=['ghoul','ghost','bat'];
const sha=v=>createHash('sha256').update(v).digest('hex');
const stable=v=>typeof v==='function'?v.toString():JSON.stringify(v);
const source=p=>execFileSync('git',['show',base+':'+p]);
const before=await import(pathToFileURL(resolve(directory,'arpg/js/content/combat.js')));
const after=await import('../../../js/content/combat.js');const monsterHashes={},exports={};
for(const [id,value] of Object.entries(before.MONSTERS)){assert.deepEqual(after.MONSTERS[id],value,id);monsterHashes[id]=sha(stable(value));}
assert.deepEqual(Object.keys(after.MONSTERS).filter(id=>!Object.hasOwn(before.MONSTERS,id)),ids);
for(const [k,v] of Object.entries(before))if(k!=='MONSTERS'){assert.equal(stable(after[k]),stable(v),k);exports[k]=sha(stable(v));}
const bm=await import(pathToFileURL(resolve(directory,'arpg/js/content/monsters.js')));const am=await import('../../../js/content/monsters.js');const identities={};
for(const [k,v] of Object.entries(bm)){
 if(Array.isArray(v)){assert.deepEqual(am[k].slice(0,v.length),v,k);identities[k]={prefix_length:v.length,sha256:sha(stable(v))};}
 else {identities[k]={entries:{}};for(const [id,item] of Object.entries(v)){assert.deepEqual(am[k][id],item,k+' '+id);identities[k].entries[id]=sha(stable(item));}}
}
const ba=await import(pathToFileURL(resolve(directory,'arpg/js/render/atlas-state.js')));const aa=await import('../../../js/render/atlas-state.js');
for(const [k,v] of Object.entries(ba))if(k==='ATLAS_IDS'){for(const [id,item] of Object.entries(v))assert.equal(aa[k][id],item,id);}else assert.equal(stable(aa[k]),stable(v),k);
const paths=execFileSync('git',['ls-tree','-r','--name-only',base,'arpg/js/sim','arpg/js/net'],{encoding:'utf8'}).trim().split('\n').concat(['arpg/js/render/renderer.js','arpg/js/render/atlas-visual.js','arpg/index.html','arpg/js/content/loot.js']);const files={};
for(const p of paths){const b=source(p);assert.deepEqual(readFileSync(p),b,p);files[p]=sha(b);}
const oldManifest=JSON.parse(source('arpg/assets/sprites/manifest.json'));const manifest=JSON.parse(readFileSync('arpg/assets/sprites/manifest.json'));assert.deepEqual(manifest.slice(0,oldManifest.length),oldManifest);assert.deepEqual(manifest.slice(oldManifest.length).map(e=>e.id),ids);
const sprites={};for(const p of execFileSync('git',['ls-tree','-r','--name-only',base,'arpg/assets/sprites'],{encoding:'utf8'}).trim().split('\n').filter(p=>!p.endsWith('manifest.json'))){const b=source(p);assert.deepEqual(readFileSync(p),b,p);sprites[p]=sha(b);}
const beforeBytes=readFileSync(art+'host-trace-before.json');const afterBytes=readFileSync(art+'host-trace-after.json');assert.deepEqual(beforeBytes,afterBytes);const traces=JSON.parse(beforeBytes);assert.equal(traces.length,Object.keys(before.STAGES).length*9);
const evidence={ok:true,baseline:base,ids,original_monster_sha256:monsterHashes,other_combat_exports_sha256:exports,identity_baseline:identities,unchanged_files_sha256:files,original_manifest:oldManifest,preserved_sprite_sha256:sprites,atlas_helpers_unchanged:true,normalized_index_sha256:sha(source('arpg/index.html').toString().replace(/\?v=[a-f0-9]{10}/g,'?v=STAMP'))};
writeFileSync(art+'preservation-validation.json',JSON.stringify(evidence,null,2)+'\n');
writeFileSync(art+'host-trace-validation.json',JSON.stringify({ok:true,baseline:base,stage_ids:Object.keys(before.STAGES),traces:traces.length,seeds:[1,42,999],weapons:['blade','bow','focus'],ticks:900,before_sha256:sha(beforeBytes),after_sha256:sha(afterBytes),cmp_equal:true},null,2)+'\n');
console.log(JSON.stringify({ok:true,baseline:base,original_monsters:Object.keys(monsterHashes).length,preserved_kits:oldManifest.length,preserved_sprite_files:Object.keys(sprites).length,unchanged_files:paths.length,traces:traces.length,trace_sha256:sha(beforeBytes)},null,2));
