#!/usr/bin/env python3
"""Offline, free deterministic SFX synthesis. --write regenerates four MP3s; default measures/validates.
Requires numpy + ffmpeg. No API/GPU/model downloads. BGM and unrelated SFX are untouched.
"""
import argparse, hashlib, json, pathlib, subprocess, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]
RATE = 24000
DURATIONS = {'smg': .085, 'pistol': .13, 'shotgun': .19, 'bow': .26}

def lowpass(x, cutoff):
    a = 1 - np.exp(-2*np.pi*cutoff/RATE)
    out = np.empty_like(x); value = 0
    for i, sample in enumerate(x):
        value += a*(sample-value); out[i] = value
    return out

def generate(name):
    rng = np.random.default_rng(20261001 + list(DURATIONS).index(name))
    t = np.arange(round(DURATIONS[name]*RATE))/RATE
    noise = rng.uniform(-1, 1, len(t))
    if name == 'bow':
        # Damped string pluck followed 35ms later by the arrow's soft air release.
        string = sum(np.sin(2*np.pi*330*k*t)*np.exp(-t*(20+8*k))/k**1.6 for k in range(1, 6))
        air_t = np.maximum(0,t-.035)
        air = lowpass(lowpass(lowpass(noise,1400),1400),1400)*np.sin(np.pi*np.minimum(1,air_t/.018)/2)**2*np.exp(-air_t*22)*(t>=.035)
        x = string*.65 + air*.3
    else:
        # Rounded mechanical pop; no recorded machine-gun burst or high-frequency crack.
        decay = {'smg':65,'pistol':45,'shotgun':30}[name]
        hz = {'smg':210,'pistol':170,'shotgun':115}[name]
        body = np.sin(2*np.pi*(hz*t-140*t*t))*np.exp(-t*decay)
        air = lowpass(lowpass(noise,1200),1200)*np.exp(-t*(decay+12))
        click = np.sin(2*np.pi*640*t)*np.exp(-t*150)
        x = .75*body + .65*air + .12*click
    # Smooth attack/end, remove DC and bound encoded peak independently of in-game gain.
    x *= np.sin(np.pi*np.minimum(1,t/.003)/2)**2
    x *= np.sin(np.pi*np.minimum(1,(t[-1]-t)/.008)/2)**2
    x -= np.mean(x)
    x *= .5/np.max(np.abs(x))
    return x.astype('<f4')

def decode(blob):
    raw = subprocess.run(['ffmpeg','-v','error','-i','pipe:0','-f','f32le','-ac','1','-ar',str(RATE),'pipe:1'],input=blob,stdout=subprocess.PIPE,check=True).stdout
    return np.frombuffer(raw,dtype='<f4')

def metrics(blob):
    x = decode(blob); spectrum=np.abs(np.fft.rfft(x*np.hanning(len(x))))**2
    freqs=np.fft.rfftfreq(len(x),1/RATE)
    return {'duration_s':round(len(x)/RATE,4),'rms':round(float(np.sqrt(np.mean(x*x))),5),
            'peak':round(float(np.max(np.abs(x))),5),'centroid_hz':round(float(np.sum(freqs*spectrum)/np.sum(spectrum)),1),
            'energy_above_4k_pct':round(float(100*np.sum(spectrum[freqs>4000])/np.sum(spectrum)),4),
            'sha256':hashlib.sha256(blob).hexdigest()}

parser=argparse.ArgumentParser();parser.add_argument('--write',action='store_true');args=parser.parse_args()
report={}
for name in DURATIONS:
    path=ROOT/'assets'/'audio'/('sfx_'+name+'.mp3')
    old=subprocess.run(['git','show','804d3a0:spudsquad/assets/audio/'+path.name],cwd=ROOT,stdout=subprocess.PIPE,check=True).stdout
    if args.write:
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(RATE),'-ac','1','-i','pipe:0','-codec:a','libmp3lame','-b:a','96k',str(path)],input=generate(name).tobytes(),check=True)
    before,after=metrics(old),metrics(path.read_bytes())
    assert before['sha256']!=after['sha256'],name+': must change actual waveform'
    assert after['duration_s']<.35 and after['peak']<.6,name+': short, bounded transient'
    assert after['energy_above_4k_pct']<1,name+': avoid sharp high-frequency crack'
    if name!='bow':
        assert after['centroid_hz']<before['centroid_hz'],name+': less sharp spectral centroid'
        assert after['energy_above_4k_pct']<1,name+': avoid high-frequency crack'
    report[name]={'before':before,'after':after}
print(json.dumps(report,indent=2))
