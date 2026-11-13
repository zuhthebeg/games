#!/usr/bin/env python3
"""CPU-only R8b mastering. Run after gen.py jobs.json completes; no GPU allocation."""
import json, subprocess, tempfile, re, hashlib
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT=Path(__file__).resolve().parents[1]/'assets/audio'
RAW=Path('/home/cocy/ai-local/moss-sfx-out')
original=json.loads((ROOT/'jobs.json').read_text())
jobs=original+json.loads((ROOT/'jobs-repair.json').read_text())+json.loads((ROOT/'jobs-extra.json').read_text())
def run(args):
 p=subprocess.run(['ffmpeg','-hide_banner','-nostdin','-y',*args],capture_output=True)
 if p.returncode:raise RuntimeError(p.stderr.decode()[-1500:])
 return p.stderr.decode()
def metrics(x,sr):
 if x.ndim>1:x=x.mean(axis=1)
 peak=float(np.max(np.abs(x)));rms=float(np.sqrt(np.mean(x*x)))
 n=max(1,int(.01*sr));windows=[np.sqrt(np.mean(x[i:i+n]**2)) for i in range(0,len(x),n)]
 spec=abs(np.fft.rfft(x))**2;freq=np.fft.rfftfreq(len(x),1/sr)
 return dict(seconds=round(len(x)/sr,4),peak_db=round(20*np.log10(max(1e-12,peak)),2),rms_db=round(20*np.log10(max(1e-12,rms)),2),silence_pct=round(100*np.mean(np.array(windows)<.01),2),hiss_pct=round(100*spec[freq>=8000].sum()/max(1e-20,spec.sum()),3))
def lufs(path):
 s=run(['-i',str(path),'-af','apad=pad_dur=0.4,loudnorm=I=-16:TP=-1:LRA=7:print_format=json','-f','null','-'])
 block=s[s.rfind('{'):s.rfind('}')+1]
 value=float(json.loads(block)['input_i']);return value if np.isfinite(value) else None
rawrows=[];selected=[]
for base in original[::2]:
 stem=base['name'].removeprefix('r8b-').rsplit('-',1)[0];pool=[]
 for j in jobs:
  if j['name'].removeprefix('r8b-').rsplit('-',1)[0]!=stem:continue
  x,sr=sf.read(RAW/j['name']);m=metrics(x,sr);peak=np.max(np.abs(x));screen=metrics(x/max(peak,1e-12)*.8,sr)
  m.update(file=j['name'],seed=j['seed'],lufs=lufs(RAW/j['name']),normalized_silence_pct=screen['silence_pct'])
  m['accepted']=bool(m['rms_db']>=-60 and screen['silence_pct']<=90 and m['hiss_pct']<=45)
  rawrows.append(m)
  if m['accepted']:pool.append((screen['silence_pct']+m['hiss_pct']*.5,j))
 pool.sort(key=lambda q:q[0])
 if len(pool)<2:raise RuntimeError('Need two usable candidates for '+stem+'; '+str([r for r in rawrows if stem in r['file']]))
 for i,(_,j) in enumerate(pool[:2]):selected.append({**j,'output':stem+'-'+str(i+1)+'.ogg','target':base['seconds']})
rows=[]
with tempfile.TemporaryDirectory() as td:
 td=Path(td)
 for j in selected:
  name=j['output'];source=RAW/j['name'];x,sr=sf.read(source);x=x.mean(axis=1) if x.ndim>1 else x
  pre=td/'pre.wav';sf.write(pre,x/max(np.max(np.abs(x)),1e-12)*.8,sr,subtype='FLOAT')
  loop='charge_loop' in name;target=j['target'];trim=td/'trim.wav'
  hp=30 if 'slam' in name else 100 if 'roll' in name else 60
  filters='highpass=f='+str(hp)+',lowpass=f=8000,silenceremove=start_periods=1:start_threshold=-40dB:stop_periods=0'
  run(['-i',str(pre),'-af',filters,'-ac','1','-ar','24000',str(trim)])
  y,sr=sf.read(trim);y=y[:round(target*sr)]
  if len(y)<sr*.08:raise RuntimeError('too short '+name)
  if len(y)<round(target*sr):y=np.pad(y,(0,round(target*sr)-len(y)))
  if loop:
   # Crossfade last/first 80ms and rotate join: endpoint follows the first naturally.
   n=int(sr*.08);w=np.linspace(0,1,n);y=np.concatenate([y[n:-n],y[-n:]*(1-w)+y[:n]*w])
  else:
   n=min(int(sr*.035),len(y)//4);y[-n:]*=np.linspace(1,0,n);n=min(48,len(y)//4);y[:n]*=np.linspace(0,1,n)
  sf.write(trim,y,sr,subtype='FLOAT')
  measured=lufs(trim);delta=-16-measured;y*=10**(delta/20)
  # True-peak headroom before lossy encoding, ceiling checked again on decoded OGG.
  pk=np.max(np.abs(y));ceiling=10**(-1.7/20)
  if pk>ceiling:y*=ceiling/pk
  sf.write(trim,y,sr,subtype='FLOAT');out=ROOT/name
  run(['-i',str(trim),'-c:a','libvorbis','-q:a','4',str(out)])
  decoded,sr=sf.read(out);m=metrics(decoded,sr)
  if m['peak_db']>-1:
   y*=10**((-1.2-m['peak_db'])/20);sf.write(trim,y,sr,subtype='FLOAT');run(['-i',str(trim),'-c:a','libvorbis','-q:a','4',str(out)]);decoded,sr=sf.read(out);m=metrics(decoded,sr)
  m.update(file=name,lufs=lufs(out),bytes=out.stat().st_size,seed=j['seed'],source=j['name'],sha256=hashlib.sha256(out.read_bytes()).hexdigest())
  if loop:m['loop_seam_delta_db']=round(20*np.log10(max(1e-12,abs(decoded[-1]-decoded[0]))),2)
  rows.append(m)
assert len(rows)==30 and sum(r['bytes'] for r in rows)<=1200000
assert all(r['peak_db']<=-1 for r in rows), 'decoded peak over -1dBFS'
assert all(r['lufs'] is not None and r['rms_db']>-45 for r in rows), 'inaudible final signal'
(ROOT/'metrics.json').write_text(json.dumps({'definitions':{'silence':'10ms RMS below -40dBFS','hiss':'FFT energy >=8kHz / total, not subjective hiss judgment','lufs':'ffmpeg integrated input_i with 400ms trailing silence padding for short cues','loop':'80ms linear wrap crossfade; decoded sample boundary delta measured'},'raw_candidates':rawrows,'files':rows,'total_bytes':sum(r['bytes'] for r in rows)},indent=2)+'\n')
header='| file | seconds | peak dBFS | RMS dBFS | LUFS* | silence % | >=8kHz % | bytes |\n|---|---:|---:|---:|---:|---:|---:|---:|\n'
table=header+'\n'.join('| {file} | {seconds} | {peak_db} | {rms_db} | {lufs} | {silence_pct} | {hiss_pct} | {bytes} |'.format(**r) for r in rows)
(ROOT/'METRICS.md').write_text('# Objective metrics — 청취 판정 필요\n\n'+table+'\n\n*400ms trailing silence for short-cue integrated LUFS. Peak ceiling takes priority over -16 target for transient-heavy sounds.\n\nTotal OGG bytes: '+str(sum(r['bytes'] for r in rows))+'\n')
lines=['# MOSS-SoundEffect v2.0 generation record','', '46 independently seeded candidates. Reject raw RMS < -60 dBFS, peak-normalized silence >90%, HF >45%; select the two lowest (normalized silence + 0.5*HF) scores per sound. Longer physical candidates replace objectively silent short outputs. These are objective screens, not quality ranking. 청취 판정은 cocy 필요.','', 'steps=100, cfg_scale=4.0, sigma_shift=5.0, bfloat16 CUDA; raw 48kHz. See jobs.json for executable exact job inputs.','', 'Mastering: highpass 60Hz (slam 30Hz, roll 100Hz) and lowpass 8kHz, trim start <-40dBFS, peak-normalize before -40dB trim, mono 24kHz, requested duration crop/pad, 35ms fade-out (2ms anti-click fade-in), -16 LUFS target subject to -1dBFS decoded peak ceiling; runtime -3dB gain. Loop: 80ms wrap crossfade, no fade to silence. OGG Vorbis q4.','']
lines += ['## Selected outputs']+[r['file']+' <- '+r['source']+' seed='+str(r['seed']) for r in rows]+['']
for j in jobs:lines += ['## '+j['name'],j['prompt'],'','seed='+str(j['seed'])+', requested seconds='+str(j['seconds']),'']
(ROOT/'PROMPTS.md').write_text('\n'.join(lines))
print('PASS mastered',len(rows),'files',sum(r['bytes'] for r in rows),'bytes; max peak',max(r['peak_db'] for r in rows))
