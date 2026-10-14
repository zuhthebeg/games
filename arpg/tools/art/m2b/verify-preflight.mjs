// Resumed registration/loading + exact approved-boundary preservation proof.
import { ATLAS_IDS } from '../../../js/render/atlas-state.js';
import { AtlasLibrary } from '../../../js/render/atlas-library.js';
import * as combat from '../../../js/content/combat.js';
import * as identity from '../../../js/content/monsters.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root=new URL('../../../../',import.meta.url),ids=['demon','goleling','slime'];
const read=p=>readFileSync(new URL(p,root)),sha=b=>createHash('sha256').update(b).digest('hex');
const baseline=execFileSync('git',['rev-parse','0c64a94'],{cwd:root,encoding:'utf8'}).trim();
const source=p=>execFileSync('git',['show',baseline+':'+p],{cwd:root});
const oldState=source('arpg/js/render/atlas-state.js').toString();
assert.equal(read('arpg/js/render/atlas-state.js').toString(),oldState.replace("  ghoul: 'ghoul', ghost: 'ghost', bat: 'bat',","  ghoul: 'ghoul', ghost: 'ghost', bat: 'bat',\n  demon: 'demon', goleling: 'goleling', slime: 'slime',"));
const archive='/home/cocy/.openclaw/workspace/tmp/arpg-m2b-baseline/';
const before=await import(pathToFileURL(archive+'arpg/js/content/combat.js'));
const bm=await import(pathToFileURL(archive+'arpg/js/content/monsters.js'));
for(const [k,v] of Object.entries(before))if(k==='MONSTERS'){for(const [id,m] of Object.entries(v))assert.deepEqual(combat.MONSTERS[id],m,id);assert.deepEqual(Object.keys(combat.MONSTERS).filter(id=>!Object.hasOwn(v,id)),ids);}else if(typeof v==='function')assert.equal(combat[k].toString(),v.toString(),k);else assert.deepEqual(combat[k],v,k);
for(const [k,v] of Object.entries(bm))if(Array.isArray(v)){assert.deepEqual(identity[k].slice(0,v.length),v,k);assert.deepEqual(identity[k].slice(v.length),ids);}else for(const [id,item] of Object.entries(v))assert.deepEqual(identity[k][id],item,k+' '+id);
const allowed=['arpg/js/render/atlas-state.js','arpg/js/content/combat.js','arpg/js/content/monsters.js','arpg/assets/sprites/manifest.json'];
const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'arpg/js','arpg/assets','arpg/vendor','arpg/index.html'],{cwd:root,encoding:'utf8'}).trim().split('\n');
const unchanged={};for(const p of paths.filter(p=>!allowed.includes(p))){const expected=source(p);assert.deepEqual(read(p),expected,p);unchanged[p]=sha(expected);}
const manifest=JSON.parse(read('arpg/assets/sprites/manifest.json')),oldManifest=JSON.parse(source('arpg/assets/sprites/manifest.json'));
assert.deepEqual(manifest.slice(0,oldManifest.length),oldManifest);assert.deepEqual(manifest.slice(oldManifest.length).map(e=>e.id),ids);
let fetchCalls=0,sheetCalls=0;
const atlas=new AtlasLibrary({baseUrl:new URL('https://example.invalid/'),fetchManifest:async()=>{fetchCalls++;return manifest;},loadSheet:async(url,id)=>{sheetCalls++;const file=new URL(url).pathname.split('/').at(-1);return JSON.parse(read('arpg/assets/sprites/'+id+'/'+file));},unloadSheet:async()=>{}});
const loaded=[];for(const id of ids){assert.equal(ATLAS_IDS[id],id);const asset=await atlas.load(id);assert.equal(asset.id,id);assert.equal(Object.keys(asset.animations).length,40);loaded.push({id,clips:40,sheets:asset.sheets.length});}
assert.equal(fetchCalls,1);assert.equal(sheetCalls,manifest.filter(e=>ids.includes(e.id)).reduce((n,e)=>n+e.sheets.length,0));assert.deepEqual(atlas.status().failed,{});
const licenses=JSON.parse(read('arpg/tools/art/m2b/license-evidence.json'));
for(const l of licenses)for(const f of l.files)assert.equal(sha(readFileSync('/mnt/c/Users/user/ai-tools/arpg-art/m2b/source/'+f.file)),f.sha256,f.file);
const a=readFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-m2b-host-before.json'),b=readFileSync('/home/cocy/.openclaw/workspace/tmp/arpg-m2b-host-after.json');assert.deepEqual(a,b);
const report={status:'REGISTERED',ok:true,baseline,original_checkpoint:'e0078e22cc8aa53cbd6e8359f08e61a6c729771b',candidates:ids,loaded,manifest_fetch_calls:fetchCalls,sheet_load_calls:sheetCalls,atlas_registry_only_three_mappings:true,source_quality_approved:false,unchanged_runtime_files:Object.keys(unchanged).length,unchanged_files_sha256:unchanged,authorized_files:allowed,original_sources_preserved:true,original_combat_identity_entries_preserved:true,original_manifest_preserved:true,host_traces:JSON.parse(a).length,host_trace_sha256:sha(a),host_trace_equal:true,prohibited_changes:false};
writeFileSync(new URL('arpg/tools/art/m2b/registration-validation.json',root),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,unchanged_files_sha256:undefined},null,2));
