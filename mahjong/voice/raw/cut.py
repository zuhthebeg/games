import subprocess, re, os, sys

RAW='/mnt/c/Users/user/games/mahjong/voice/raw'
OUT='/mnt/c/Users/user/games/mahjong/voice'
MAP={
 'man':  ['m%d'%i for i in range(1,10)],
 'tong': ['p%d'%i for i in range(1,10)],
 'sak':  ['s%d'%i for i in range(1,10)],
 'honorfx':['z1','z2','z3','z4','z5','z6','z7','fx-hu','fx-pon','fx-chi'],
 'etc':  ['fx-kan','fx-ankan','fx-rinshan','fx-tenpai','fx-tsumo','fx-bangchong'],
}
NOISE='-35dB'; DUR='0.28'

def run(cmd): return subprocess.run(cmd, capture_output=True, text=True)

def duration(path):
    r=run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',path])
    return float(r.stdout.strip())

def silences(path):
    r=run(['ffmpeg','-hide_banner','-nostats','-i',path,'-af',
           'silencedetect=noise=%s:d=%s'%(NOISE,DUR),'-f','null','-'])
    out=r.stderr
    starts=[float(x) for x in re.findall(r'silence_start:\s*([0-9.]+)',out)]
    ends=[float(x) for x in re.findall(r'silence_end:\s*([0-9.]+)',out)]
    # pair them in order
    pairs=[]
    si=ei=0
    # silence_end lines come after their start; just zip sequentially
    for i in range(min(len(starts),len(ends))):
        pairs.append((starts[i],ends[i]))
    # trailing silence with no end (file ends silent)
    if len(starts)>len(ends):
        pairs.append((starts[-1], duration(path)))
    return pairs

def speech_segments(path):
    dur=duration(path); sil=silences(path); segs=[]; cur=0.0
    for s,e in sil:
        if s>cur+0.04: segs.append((cur,s))
        cur=max(cur,e)
    if dur-cur>0.04: segs.append((cur,dur))
    return [(a,b) for a,b in segs if (b-a)>0.12]

ok=True
for stem,ids in MAP.items():
    src=os.path.join(RAW,stem+'.m4a')
    if not os.path.exists(src):
        print('MISSING',src); ok=False; continue
    segs=speech_segments(src)
    print('%-8s detected %d / expected %d'%(stem,len(segs),len(ids)))
    if len(segs)!=len(ids):
        print('  !! count mismatch — skipping', stem,'segs=',[ '%.2f-%.2f'%(a,b) for a,b in segs])
        ok=False; continue
    for (a,b),tid in zip(segs,ids):
        ss=max(0,a-0.03); to=b+0.05
        dst=os.path.join(OUT,tid+'.mp3')
        af=('silenceremove=start_periods=1:start_silence=0.02:start_threshold=-42dB:detection=peak,'
            'areverse,'
            'silenceremove=start_periods=1:start_silence=0.06:start_threshold=-42dB:detection=peak,'
            'areverse,'
            'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:st=0:d=0.015')
        r=run(['ffmpeg','-y','-hide_banner','-nostats','-i',src,
               '-ss','%.3f'%ss,'-to','%.3f'%to,'-af',af,
               '-ac','1','-ar','44100','-codec:a','libmp3lame','-q:a','5',dst])
        sz=os.path.getsize(dst) if os.path.exists(dst) else 0
        print('   ->',tid+'.mp3','%.2fs'%(to-ss),'%dB'%sz, '' if sz>0 else 'FAIL')
print('DONE' if ok else 'HAD ISSUES')
