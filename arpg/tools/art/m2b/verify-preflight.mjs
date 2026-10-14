// Read-only M2b registration boundary proof. Does not register or alias new monsters.
import { ATLAS_IDS } from '../../../js/render/atlas-state.js';
import { AtlasLibrary } from '../../../js/render/atlas-library.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=new URL('../../../../',import.meta.url);
const read=p=>readFileSync(new URL(p,root));
const sha=b=>createHash('sha256').update(b).digest('hex');
const baseline=execFileSync('git',['rev-parse',process.argv[2] || '0c64a94'],{cwd:root,encoding:'utf8'}).trim();
const candidates=['demon','goleling','slime'];
const factory=read('arpg/js/render/atlas-visual.js').toString();
assert.match(factory,/for \(const key of Object\.keys\(ATLAS_IDS\)\)/);
const library=read('arpg/js/render/atlas-library.js').toString();
const absent=candidates.filter(id=>!Object.hasOwn(ATLAS_IDS,id));
assert.deepEqual(absent,candidates);
let fetchCalls=0, sheetCalls=0;
const atlas=new AtlasLibrary({baseUrl:new URL('https://example.invalid/'),fetchManifest:async()=>{fetchCalls++;return [];},loadSheet:async()=>{sheetCalls++;throw Error('not expected');},unloadSheet:async()=>{}});
for(const id of candidates) assert.equal(await atlas.load(id),null,id);
assert.equal(fetchCalls,0);assert.equal(sheetCalls,0);
const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'arpg/js','arpg/assets','arpg/vendor','arpg/index.html'],{cwd:root,encoding:'utf8'}).trim().split('\n');
// No runtime/content/assets/index change is allowed after the renderer stop gate.
const unchanged={};
for(const p of paths){const expected=execFileSync('git',['show',baseline+':'+p],{cwd:root});assert.deepEqual(read(p),expected,p);unchanged[p]=sha(expected);}
const report={status:'BLOCKED',baseline,candidates,missing_atlas_ids:absent,factory_enumerates:'Object.keys(ATLAS_IDS)',manifest_alone_registers_factory:false,unmapped_load_results:candidates.map(id=>({id,result:null})),manifest_fetch_calls:fetchCalls,sheet_load_calls:sheetCalls,renderer_change_required:true,renderer_change_performed:false,source_quality_approved:false,unchanged_runtime_files:paths.length,unchanged_files_sha256:unchanged,atlas_library_sha256:sha(library),prohibited_changes:false};
writeFileSync(new URL('arpg/tools/art/m2b/preflight-validation.json',root),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...report,unchanged_files_sha256:undefined},null,2));
