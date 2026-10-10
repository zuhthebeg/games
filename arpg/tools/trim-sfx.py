"""Trim MOSS WAV jobs into short mono 48kHz Ogg delivery; requires numpy, soundfile, ffmpeg.
Run in repository root: python arpg/tools/trim-sfx.py .local-sfx
Generate WAVs first using assets/audio/generation.json prompts/seeds and gen.py absolute output names.
"""
import hashlib
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

source = Path(sys.argv[1])
output = Path('arpg/assets/audio')
metadata = json.loads((output / 'generation.json').read_text())
lengths = {'swing': .24, 'hit': .26, 'critical': .36, 'dodge': .28,
           'hurt': .30, 'kill': .55, 'level-up': 1.15}
for entry in metadata:
    name = Path(entry['name']).stem
    wav = source / f'{name}.wav'
    data, rate = sf.read(wav)
    if data.ndim > 1:
        data = data.mean(axis=1)
    window = max(1, int(rate * .005))
    padded = np.pad(data, (0, (-len(data)) % window))
    energy = np.sqrt(np.mean(padded.reshape(-1, window) ** 2, axis=1))
    assert energy.max() > .00001, f'silent generation: {name}'
    first = int(np.flatnonzero(energy > energy.max() * .2)[0])
    start = max(0, first * .005 - .015)
    duration = min(lengths[name], len(data) / rate - start)
    segment = data[int(start * rate):int((start + duration) * rate)]
    gain = .7 / max(float(np.abs(segment).max()), .00001)
    filters = (f'volume={gain:.6f},highpass=f=65,'
               f'afade=t=in:d=0.005,afade=t=out:st={duration - .045:.4f}:d=0.045,alimiter=limit=0.85:level=false')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(start), '-i', str(wav),
                    '-t', str(duration), '-ac', '1', '-ar', '48000', '-af', filters,
                    '-c:a', 'libvorbis', '-q:a', '3', str(output / entry['name'])], check=True)
    entry.update(sourceSha256=hashlib.sha256(wav.read_bytes()).hexdigest(),
                 trimStart=round(start, 4), duration=round(duration, 4),
                 sampleRate=48000, channels=1, bytes=(output / entry['name']).stat().st_size)
    print(name, entry['bytes'], 'bytes', entry['duration'], 'sec')
(output / 'generation.json').write_text(json.dumps(metadata, indent=2) + '\n')
print('total', sum(entry['bytes'] for entry in metadata))
