import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {GS_SAMPLES,WEAPON_SAMPLES} from '../js/audio.js';
import {WeaponSoundView} from '../js/weapon-sound.js';
import {Sim} from '../js/sim.js';
import {QUESTS} from '../js/data.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),base='3eb196c05a37b37468ef0adab2d7241710f37a7d';
const run=(cmd,args)=>execFileSync(cmd,args,{cwd:root,maxBuffer:32*1024*1024});
const fixture=JSON.parse(fs.readFileSync(new URL('./r19-audio-baseline.json',import.meta.url),'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
function loud(path,repeat=false){const f=(repeat?'aloop=loop=20:size=2000000,atrim=duration=3,':'')+'loudnorm=I=-16:TP=-1:LRA=11:print_format=json';const r=spawnSync('ffmpeg',['-hide_banner','-nostats','-i',path,'-af',f,'-f','null','-']);assert.equal(r.status,0);const t=r.stderr.toString(),j=JSON.parse(t.slice(t.lastIndexOf('{'),t.lastIndexOf('}')+1));let i=Number(j.input_i);if(!Number.isFinite(i)&&!repeat)i=loud(path,true).i;return {i,tp:Number(j.input_tp)};}
for(const f of fixture)test('R19 approved '+f.name+': exact bytes, Vorbis mono24k, finite duration, true peak/onset and recorded reference deviation',()=>{
 const path=fileURLToPath(new URL('../assets/audio/weapons/'+f.name+'.ogg',import.meta.url)),bytes=fs.readFileSync(path);assert.equal(hash(bytes),f.sha256);assert.equal(bytes.length,f.bytes);assert.ok(bytes.length<60000);
 const s=JSON.parse(run('ffprobe',['-v','error','-show_streams','-of','json',path])).streams[0];assert.equal(s.codec_name,'vorbis');assert.equal(Number(s.sample_rate),24000);assert.equal(s.channels,1);
 const pcm=run('ffmpeg',['-v','error','-i',path,'-f','f32le','-']),env=[];for(let at=0;at<pcm.length;at+=96){let sum=0,n=0;for(let k=at;k<Math.min(at+96,pcm.length);k+=4){const x=pcm.readFloatLE(k);assert.ok(Number.isFinite(x));sum+=x*x;n++;}env.push(Math.sqrt(sum/n));}
 const peak=Math.max(...env),leading=env.findIndex(x=>x>Math.max(peak*.001,1e-6));assert.ok(leading>=0&&leading<=10);assert.ok(pcm.length/4/24000>0&&pcm.length/4/24000<.7);assert.equal(pcm.length/4/24000,f.duration_s);
 const m=loud(path);assert.ok(m.tp<=-1);assert.ok(Math.abs(m.i-f.LUFS)<.05);assert.ok(Math.abs(m.tp-f.TP)<.05);assert.ok(Math.abs(m.i-f.target_LUFS-f.LU_delta)<.05,'reference shortfall is measured, not hidden');
});
test('R19 exact approved pools, no rejected material, aggregate under300KB, GS30 bytes/maps unchanged',()=>{
 assert.equal(fixture.length,10);assert.ok(fixture.reduce((n,f)=>n+f.bytes,0)<300000);assert.equal(new Set(fixture.map(f=>f.source_sha256)).size,10,'ten independent approved recordings, no pitch clones');
 assert.deepEqual(fixture.map(f=>f.name),['db_swing-3','db_swing-4','db_swing-5','db_hit-1','db_clink-1','db_clink-2','db_clink-3','bow_release-1','bow_flight-3','bow_hit-1']);
 const urls=Object.values(WEAPON_SAMPLES).flat();assert.equal(urls.length,10);for(const url of urls){const u=new URL(url);assert.equal(u.search,'?v=20261115s19');assert.ok(fs.existsSync(fileURLToPath(u)));}
 const gs=Object.values(GS_SAMPLES).flat();assert.equal(gs.length,30);for(const url of gs){const u=new URL(url);assert.equal(u.search,'?v=20261115sx');const relative='beasthunt/assets/audio/'+u.pathname.split('/').at(-1);assert.deepEqual(fs.readFileSync(fileURLToPath(u)),run('git',['show',base+':'+relative]));}
 const old=run('git',['show',base+':beasthunt/js/audio.js']).toString(),now=fs.readFileSync(new URL('../js/audio.js',import.meta.url),'utf8');assert.equal(now.split('export const GS_SAMPLES = ')[1].split('const fallback')[0],old.split('export const GS_SAMPLES = ')[1].split('const fallback')[0]);
 const inventory=fs.readdirSync(new URL('../assets/audio/weapons/',import.meta.url));assert.equal(inventory.length,10);assert.ok(inventory.every(n=>n.endsWith('.ogg')));
});
test('R19 sim/data/input/network, GS API adapter and latest R17 visual modules/models byte unchanged',()=>{
 const files=['sim.js','data.js','input.js','gs-sound.js','models.js','gs-motion.js','bow-motion.js','db-motion.js','warrok-motion.js','warrok-floor.js'];
 for(const file of files){const path='beasthunt/js/'+file;assert.deepEqual(fs.readFileSync(new URL('../js/'+file,import.meta.url)),run('git',['show',base+':'+path]),file);}
 const net=run('git',['ls-tree','-r','--name-only',base,'beasthunt/js/net/']).toString().trim().split('\n');for(const p of net)assert.deepEqual(fs.readFileSync(root+'/'+p),run('git',['show',base+':'+p]),p);
 for(const file of ['hunter-erika-bow.glb','hunter-arissa-db.glb','hunter-maria-gs.glb','warrok.glb']){const p='beasthunt/assets/'+file;assert.equal(hash(fs.readFileSync(root+'/'+p)),hash(run('git',['show',base+':'+p])),file);}
});
test('R19 exact baseline snapshots/events/save across 3 weapons x3 seeds x1200 =10800 ticks with audio adapter active',async()=>{
 const temporary=new URL('../js/.r19-baseline-sim.js',import.meta.url);fs.writeFileSync(temporary,run('git',['show',base+':beasthunt/js/sim.js']));
 try{const {Sim:Old}=await import(temporary.href);let ticks=0;for(const weapon of ['gs','db','bow'])for(const seed of [1,42,999]){
 const save={weapon,w:{gs:1,db:1,bow:1},armor:1},original=JSON.stringify(save),a=new Sim(QUESTS[0],save,seed),b=new Old(QUESTS[0],JSON.parse(original),seed),view=new WeaponSoundView(()=>{});
 for(let i=0;i<1200;i++){const input={p1:{aimYaw:0,moveZ:i<250?127:0,light:i%50===0,heavy:i%300===0,heavyHeld:i%300<110,attackHeld:false,roll:i%200===150}};a.step(input);b.step(input);const events=a.drainEvents();assert.deepEqual(events,b.drainEvents());view.begin(events);for(const e of events)if(e.type==='sound')view.event(e,a.players,a.p,a.tick,a.arrows);view.update(a.p,a.p,false);assert.deepEqual(a.snapshot(),b.snapshot());assert.equal(JSON.stringify(save),original);ticks++;}view.dispose();}assert.equal(ticks,10800);
 }finally{fs.unlinkSync(temporary);}
});
