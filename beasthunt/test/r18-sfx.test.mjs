import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {GS_SAMPLES} from '../js/audio.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
const audio=path.join(root,'beasthunt/assets/audio');
const base='5a92b2069007355cc77f9717cbe07f0cf13f94d7';
const families=['gs_swing_light','gs_swing_b','gs_swing_spin','gs_hit','gs_hit_part','gs_hit_weak','gs_guard_block','gs_guard_break'];
const changed=families.flatMap(n=>[n+'-1',n+'-2']);
const run=(cmd,args)=>execFileSync(cmd,args,{maxBuffer:8*1024*1024});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bh-r18-gates-'));
process.on('exit',()=>fs.rmSync(temp,{recursive:true,force:true}));
const old=n=>{const p=path.join(temp,n+'.ogg');if(!fs.existsSync(p))fs.writeFileSync(p,run('git',['-C',root,'show',base+':beasthunt/assets/audio/'+n+'.ogg']));return p;};
function loud(p,repeat=false){
 const filter=(repeat?'aloop=loop=20:size=2000000,atrim=duration=3,':'')+'loudnorm=I=-16:TP=-1:LRA=11:print_format=json';
 // ffmpeg's measurement JSON is on stderr; execFileSync would discard it.
 const {stderr,status}=spawn('ffmpeg',['-hide_banner','-nostats','-i',p,'-af',filter,'-f','null','-']);assert.equal(status,0,stderr);
 const s=stderr.toString(),j=JSON.parse(s.slice(s.lastIndexOf('{'),s.lastIndexOf('}')+1));
 let i=Number(j.input_i);if(!Number.isFinite(i)&&!repeat)i=loud(p,true).i;
 return {i,tp:Number(j.input_tp)};
}
import {spawnSync as spawn} from 'node:child_process';
function measured(p){
 const stream=JSON.parse(run('ffprobe',['-v','error','-show_streams','-of','json',p])).streams[0];
 const pcm=run('ffmpeg',['-v','error','-i',p,'-ac','1','-ar','24000','-f','f32le','-']);
 const env=[];let peak=0;
 for(let at=0;at<pcm.length;at+=96){let sum=0,n=0;for(let k=at;k<Math.min(pcm.length,at+96);k+=4){const x=pcm.readFloatLE(k);assert.ok(Number.isFinite(x));sum+=x*x;n++;}const rms=Math.sqrt(sum/n);env.push(rms);peak=Math.max(peak,rms);}
 const leading=env.findIndex(x=>x>Math.max(peak*.001,1e-6));
 return {...loud(p),stream,duration:pcm.length/4/24000,leading,bytes:fs.statSync(p).size};
}
const result=new Map();
for(const n of changed)test('R18 '+n+': decoded format, length, loudness, true peak and onset',()=>{
 const p=path.join(audio,n+'.ogg');assert.ok(fs.existsSync(p));const m=measured(p);result.set(n,m);
 assert.equal(m.stream.codec_name,'vorbis');assert.equal(m.stream.channels,1);assert.equal(Number(m.stream.sample_rate),24000);
 const max=n.includes('swing_spin')?1.2:n.includes('swing')?.9:n.includes('guard')?1.4:1.0;
 assert.ok(m.duration>0&&m.duration<=max,n+' decoded duration '+m.duration);assert.ok(m.bytes<=60000,n+' bytes '+m.bytes);
 assert.ok(Number.isFinite(m.i));assert.ok(m.tp<=-1.0,n+' TP '+m.tp);assert.ok(m.leading>=0&&m.leading<=10,n+' onset '+m.leading);
 // Same-category existing peer references retain the explicit -4 LU weak contrast.
 // Original sub-400ms cues use a documented repeated-3s EBU measurement fallback,
 // not invented integrated LUFS or padded silence. No old gate is relaxed.
 const ref=n==='gs_hit-2'?'gs_hit-1':n.startsWith('gs_hit_weak-')?'gs_hit_weak-2':n;
 const b=loud(old(ref));
 assert.ok(Math.abs(m.i-b.i)<=2,n+' LU delta against '+ref+': '+(m.i-b.i));
 assert.ok(Math.abs(m.tp-b.tp)<=2,n+' TP delta against '+ref+': '+(m.tp-b.tp));
 if(n.includes('swing_spin'))assert.ok(m.duration>=.9,'spin is not shortened below previous .9s cue');
});
test('R18 weak variants preserve approximately -4 LU final contrast to the matching hit',()=>{
 for(const i of [1,2])assert.ok(Math.abs((result.get('gs_hit_weak-'+i).i-result.get('gs_hit-'+i).i)+4)<=.25);
});
test('R18 same-name assets and importer both carry sx cache generation; palette remains 30 lazy URLs',()=>{
 const index=fs.readFileSync(path.join(root,'beasthunt/index.html'),'utf8');
 assert.ok(index.includes('"bh/audio":"./js/audio.js?v=20261115sx"'));
 const urls=Object.values(GS_SAMPLES).flat();assert.equal(urls.length,30);
 for(const url of urls){const u=new URL(url);assert.equal(u.search,'?v=20261115sx');assert.ok(fs.existsSync(fileURLToPath(u)));}
});
test('R18 all fourteen charge/release/slam/roll bytes and source tree inventory remain unchanged',()=>{
 const files=fs.readdirSync(audio).filter(n=>n.endsWith('.ogg'));assert.equal(files.length,30);
 const kept=files.filter(n=>!changed.includes(n.slice(0,-4)));assert.equal(kept.length,14);
 for(const file of kept)assert.deepEqual(fs.readFileSync(path.join(audio,file)),fs.readFileSync(old(file.slice(0,-4))),file);
 assert.equal(fs.readdirSync(audio).filter(n=>/\.(wav|mp3|zip|py)$/i.test(n)).length,0,'no source/preview/script redistribution');
});
