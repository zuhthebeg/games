"""Rebuild/measure species cues: MOSS gen.py jobs.json separately; this script only processes existing WAVs.
Uses soundfile, never torchaudio. Originals stay outside the repository.
Normalization matches the existing profiles: RMS target .16, peak cap .70,
5ms attack, 40ms release; mono 48kHz Vorbis q3. No subjective listening claim.
--verify recomputes delivered metrics/hashes and checks the committed ledger.
"""
import hashlib
import itertools
import json
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

OUT = Path('arpg/assets/audio')
LEDGER = OUT / 'species-audit.json'
DURATIONS = {'wolf': (.28, .72), 'boar': (.32, .85), 'bat': (.22, .48),
             'spider': (.30, .68), 'goblin': (.30, .72), 'stone': (.32, 1.10),
             'slime': (.30, .85), 'demon': (.32, .95), 'dragon': (.38, 1.10)}
FAMILIES = ['wolf', 'boar', 'bat', 'spider', 'goblin', 'stone']


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def metrics(path):
    x, rate = sf.read(path, dtype='float64')
    assert x.ndim == 1 and rate == 48000, path
    # Whole-clip frame-power spectrum, Hann 1024/256. Power weighting avoids
    # assigning equal importance to near-silent spectral frames.
    frames = np.lib.stride_tricks.sliding_window_view(np.pad(x, (0, 1024)), 1024)[::256]
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(1024), axis=1)) ** 2
    power = spectrum.sum(axis=0)
    freqs = np.fft.rfftfreq(1024, 1 / rate)
    centroid = float(np.sum(power * freqs) / power.sum())
    bandwidth = float(np.sqrt(np.sum(power * (freqs - centroid) ** 2) / power.sum()))
    win = 240  # 5ms, relative -40dB RMS onset/end threshold
    energy = np.sqrt(np.mean(np.pad(x, (0, (-len(x)) % win)).reshape(-1, win) ** 2, axis=1))
    active = np.flatnonzero(energy > max(energy.max() * .01, .0001))
    assert len(active), f'silent: {path}'
    envelope = np.array([np.sqrt(np.mean(v * v)) for v in np.array_split(x, 32)])
    envelope /= max(envelope.max(), 1e-12)
    return dict(duration=len(x) / rate, sampleRate=rate, channels=1,
                decodedPeak=float(np.max(np.abs(x))), decodedRms=float(np.sqrt(np.mean(x * x))),
                centroidHz=centroid, bandwidthHz=bandwidth,
                onsetMs=float(active[0] * 5), trailingSilenceMs=max(0., len(x) / rate * 1000 - (active[-1] + 1) * 5),
                envelope32=[round(float(v), 7) for v in envelope],
                outputSha256=sha(path), bytes=path.stat().st_size)


def pairs(clips):
    rows = []
    for kind in ['hit', 'death']:
        for a, b in itertools.combinations(FAMILIES, 2):
            x, y = clips[f'{a}-{kind}.ogg'], clips[f'{b}-{kind}.ogg']
            spectral = abs(x['centroidHz'] - y['centroidHz']) / max(x['centroidHz'], y['centroidHz'])
            duration = abs(x['duration'] - y['duration'])
            envelope = float(np.mean(np.abs(np.array(x['envelope32']) - y['envelope32'])))
            # Different prompt/seed + different file hash AND >=2 independent feature differences.
            passed = x['outputSha256'] != y['outputSha256'] and sum([spectral >= .08, duration >= .06, envelope >= .08]) >= 2
            # Explicit canine/rock identity guard: separate spectrum and time shape.
            if (a, b) == ('wolf', 'stone'):
                passed = passed and spectral >= .15 and (duration >= .12 or envelope >= .12)
            rows.append(dict(a=f'{a}-{kind}', b=f'{b}-{kind}', relativeCentroidDifference=spectral,
                             durationDifference=duration, meanEnvelopeDifference=envelope, passed=bool(passed)))
    return rows


def check(clips):
    for name, m in clips.items():
        assert .10 < m['duration'] <= 1.2, (name, 'duration', m['duration'])
        assert .02 < m['decodedPeak'] < .85, (name, 'peak', m['decodedPeak'])
        assert .015 < m['decodedRms'] <= .18, (name, 'rms', m['decodedRms'])
        assert m['onsetMs'] <= 30, (name, 'late onset', m['onsetMs'])
        assert m['trailingSilenceMs'] <= 65, (name, 'silent tail', m['trailingSilenceMs'])
        assert 100 < m['centroidHz'] < 16000 and 0 < m['bandwidthHz'] < 18000, name  # Tonal yelps can legitimately be narrow-band.
    comparisons = pairs(clips)
    assert all(row['passed'] for row in comparisons), [r for r in comparisons if not r['passed']]
    return comparisons


def main():
    if sys.argv[1] == '--verify':
        ledger = json.loads(LEDGER.read_text())
        clips = {name: metrics(OUT / name) for name in ledger['clips']}
        check(clips)
        for name, m in clips.items():
            for key, value in m.items():
                old = ledger['clips'][name][key]
                assert np.allclose(value, old, rtol=1e-6, atol=1e-6) if isinstance(value, (float, list)) else value == old, (name, key)
        print(f'PASS: {len(clips)} decoded clips; {len(pairs(clips))} family comparisons; hashes and metrics exact')
        return
    jobs = json.loads(Path(sys.argv[1]).read_text())
    manifest = json.loads((OUT / 'profiles-manifest.json').read_text())
    new = {}
    for job in jobs:
        source = Path(job['name']); name = source.stem; family, kind = name.split('-')
        data, rate = sf.read(source)
        if data.ndim > 1:
            data = data.mean(axis=1)
        win = int(rate * .005)
        energy = np.sqrt(np.mean(np.pad(data, (0, (-len(data)) % win)).reshape(-1, win) ** 2, axis=1))
        first = np.flatnonzero(energy > energy.max() * .12)[0]
        start = max(0, first * .005 - .01)
        duration = DURATIONS[family][kind == 'death']
        # Never retain dead air: stop at last substantial frame within target.
        end = min(len(data), int((start + duration) * rate))
        segment = data[int(start * rate):end]
        active = np.flatnonzero(np.abs(segment) > max(np.max(np.abs(segment)) * .015, .0001))
        segment = segment[:min(len(segment), active[-1] + int(rate * .025))]
        duration = len(segment) / rate
        # Same .16 RMS target / .70 peak cap as process-audio.py (2026-10-14).
        gain = min(.16 / max(float(np.sqrt(np.mean(segment ** 2))), 1e-8), .70 / max(float(np.abs(segment).max()), 1e-8))
        delivery = source.with_name(name + '-delivery.wav')
        segment *= gain
        fade_in = min(len(segment), int(rate * .005)); fade_out = min(len(segment), int(rate * .040))
        segment[:fade_in] *= np.linspace(0, 1, fade_in)
        segment[-fade_out:] *= np.linspace(1, 0, fade_out)
        sf.write(delivery, segment, rate, subtype='FLOAT')
        target = OUT / (name + '.ogg')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(delivery), '-ac', '1', '-ar', '48000', '-af', 'highpass=f=65,alimiter=limit=0.85:level=false:latency=true', '-c:a', 'libvorbis', '-q:a', '3', str(target)], check=True)
        m = metrics(target); new[target.name] = m
        entry = dict(name=target.name, source=str(source), sourceSha256=sha(source), sourceType='local MOSS generated WAV', prompt=job['prompt'], settings=job,
                     trimStart=start, pitchTransform=1, codec='vorbis', endFadeMs=40, deliveryWav=str(delivery), specialMix=None, additionalSources=[], **m)
        manifest['clips'] = [e for e in manifest['clips'] if e['name'] != target.name] + [entry]
        print(name, json.dumps({k:v for k,v in m.items() if k!='envelope32'}), flush=True)
    # Obsolete cross-species generic clips are no longer downloaded or shipped.
    for name in ['beast-death.ogg', 'goleling-death.ogg']:
        manifest['clips'] = [e for e in manifest['clips'] if e['name'] != name]
        (OUT / name).unlink(missing_ok=True)
    for e in manifest['clips']:
        e['outputSha256'] = sha(OUT / e['name'])
    (OUT / 'profiles-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    baseline = json.loads((OUT / 'generation.json').read_text())
    for e in baseline:
        e['outputSha256'] = sha(OUT / e['name'])
    (OUT / 'generation.json').write_text(json.dumps(baseline, indent=2) + '\n')
    ledger = dict(model='MOSS-SoundEffect v2.0', auditoryJudgement='NOT machine-verified; prompts/metrics are not proof of perceptual identity',
                  normalization='Existing .16 RMS target / .70 peak cap, 5ms onset / 40ms tail fade, highpass65Hz, limiter .85, mono48k Vorbis q3',
                  thresholds=dict(spectralSanity='centroid 100..16000 Hz, bandwidth >0..18000 Hz; narrow-band tonal cries are valid', durationSeconds=[.10, 1.2], peak=[.02, .85], rms=[.015, .18], onsetMs=30, trailingSilenceMs=65,
                                  pairwise='>=2 of relative centroid >=.08 / duration >=.06s / mean normalized 32-bin envelope distance >=.08; hashes differ',
                                  wolfStone='also relative centroid >=.15 AND (duration >=.12s OR envelope distance >=.12)'),
                  clips=new, comparisons=pairs(new))
    LEDGER.write_text(json.dumps(ledger, indent=2) + '\n')
    check(new)
    print('ALL METRIC GATES PASS')


if __name__ == '__main__':
    main()
