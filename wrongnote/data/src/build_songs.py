#!/usr/bin/env python3
"""melodies.abc → ../songs.json 빌더.

핵심 안전장치: 모든 마디의 길이 합을 박자표와 대조해 전사 실수를 빌드 단계에서 잡는다.
(첫 마디는 못갖춘마디 허용, 마지막 마디는 부족 허용, 중간 마디는 정확히 일치해야 함)
"""
import json
import os
import re
import sys
from fractions import Fraction

KEYSIGS = {
    'C': {}, 'Am': {},
    'G': {'F': 1}, 'Em': {'F': 1},
    'D': {'F': 1, 'C': 1}, 'Edor': {'F': 1, 'C': 1}, 'Bm': {'F': 1, 'C': 1},
    'F': {'B': -1}, 'Dm': {'B': -1},
    'Bb': {'B': -1, 'E': -1}, 'Gm': {'B': -1, 'E': -1},
}
LETTER_SEMI = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

NOTE_RE = re.compile(r"([_^=]?)([A-Ga-gz])([,']*)(\d+/\d+|/\d+|\d+|/+)?")


def parse_dur(tok):
    if not tok:
        return Fraction(1)
    if tok.startswith('/'):
        rest = tok[1:]
        if not rest:
            return Fraction(1, 2)
        if rest.isdigit():
            return Fraction(1, int(rest))
        return Fraction(1, 2 ** len(tok))  # '//' 형태
    if '/' in tok:
        a, b = tok.split('/')
        return Fraction(int(a), int(b))
    return Fraction(int(tok))


def midi_of(letter, octave, adj):
    return (octave + 1) * 12 + LETTER_SEMI[letter] + adj


def name_of(midi):
    return SHARP_NAMES[midi % 12] + str(midi // 12 - 1)


def parse_song(header, body, errors):
    sid = header['id']
    meter = header['M']
    num, den = (4, 4) if meter == 'C' else [int(x) for x in meter.split('/')]
    L = Fraction(header.get('L', '1/8'))
    unit_q = L / Fraction(1, 4)          # 단위 길이가 4분음표 몇 개인가
    full = Fraction(num, den) / L        # 한 마디 = 몇 단위인가
    sig = KEYSIGS[header['K']]

    body = re.sub(r'"[^"]*"', '', body)
    body = body.replace('!', '').replace('\\', '')

    notes = []          # [midi(or None=rest), dur_units, measure_idx]
    measures = [Fraction(0)]
    meas_acc = {}       # (letter, octave) -> adj, 마디 내 임시표 지속
    triplet = 0
    tie_pending = False

    i = 0
    while i < len(body):
        ch = body[i]
        if ch in ' \t\r\n':
            i += 1
            continue
        if body.startswith('(3', i):
            triplet = 3
            i += 2
            continue
        if ch in '()':
            i += 1
            continue
        if ch == '-':
            tie_pending = True
            i += 1
            continue
        if ch in '><':
            errors.append('%s: 전처리 안 된 부점쌍 발견 (pos %d)' % (sid, i))
            i += 1
            continue
        if ch in '|:][':
            if ch == '|':
                measures.append(Fraction(0))
                meas_acc = {}
            i += 1
            continue
        m = NOTE_RE.match(body, i)
        if not m:
            errors.append('%s: 파싱 불가 문자 %r (pos %d)' % (sid, body[i:i + 8], i))
            i += 1
            continue
        acc_tok, letter_tok, oct_tok, dur_tok = m.groups()
        i = m.end()
        dur = parse_dur(dur_tok)
        if triplet > 0:
            dur *= Fraction(2, 3)
            triplet -= 1
        measures[-1] += dur

        if letter_tok == 'z':
            if notes:
                notes[-1][1] += dur
            continue

        letter = letter_tok.upper()
        octave = 5 if letter_tok.islower() else 4
        octave += oct_tok.count("'") - oct_tok.count(',')
        key = (letter, octave)
        if acc_tok:
            adj = {'^': 1, '_': -1, '=': 0}[acc_tok]
            meas_acc[key] = adj
        else:
            adj = meas_acc.get(key, sig.get(letter, 0))
        midi = midi_of(letter, octave, adj)

        if tie_pending and notes and notes[-1][0] == midi:
            notes[-1][1] += dur
        elif tie_pending:
            errors.append('%s: 붙임줄 양쪽 음 불일치 (%s)' % (sid, name_of(midi)))
            notes.append([midi, dur, len(measures) - 1])
        else:
            notes.append([midi, dur, len(measures) - 1])
        tie_pending = False

    # 마디 검증
    if measures and measures[-1] == 0:
        measures.pop()
    for mi, s in enumerate(measures):
        is_first, is_last = mi == 0, mi == len(measures) - 1
        if is_first or is_last:
            if s > full:
                errors.append('%s: %d번 마디 초과 (%s/%s단위)' % (sid, mi + 1, s, full))
        elif s != full:
            errors.append('%s: %d번 마디 길이 불일치 (%s ≠ %s단위)' % (sid, mi + 1, s, full))

    out_notes = [[name_of(mmidi), round(float(d * unit_q), 4)] for mmidi, d, _ in notes]
    return {
        'id': sid,
        'title_ko': header['ko'], 'title_en': header['en'], 'title_ja': header['ja'],
        'source': header['src'],
        'bpm': int(header['bpm']),
        'notes': out_notes,
    }


def preprocess_broken(body):
    """A>B → A3/2 B/2, A<B → A/2 B3/2 (기존 길이에 곱하지 않고, 길이 미표기 쌍만 지원 확장).

    일반화: 'X>Y'에서 X, Y 각각의 표기 길이에 1.5배/0.5배를 적용해 명시 길이로 다시 쓴다.
    """
    def repl(m):
        pre, a_acc, a_pitch, a_oct, a_dur, op, b_acc, b_pitch, b_oct, b_dur = m.groups()
        da, db = parse_dur(a_dur), parse_dur(b_dur)
        if op == '>':
            da, db = da * Fraction(3, 2), db * Fraction(1, 2)
        else:
            da, db = da * Fraction(1, 2), db * Fraction(3, 2)
        return '%s%s%s%s%s %s%s%s%s' % (pre, a_acc, a_pitch, a_oct, fmt_frac(da), b_acc, b_pitch, b_oct, fmt_frac(db))

    pat = re.compile(r"(^|[\s|])([_^=]?)([A-Ga-g])([,']*)(\d+/\d+|/\d+|\d+|/+)?([><])([_^=]?)([A-Ga-g])([,']*)(\d+/\d+|/\d+|\d+|/+)?")
    prev = None
    while prev != body:
        prev = body
        body = pat.sub(repl, body)
    return body


def fmt_frac(f):
    if f.denominator == 1:
        return str(f.numerator) if f.numerator != 1 else ''
    return '%d/%d' % (f.numerator, f.denominator)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, 'melodies.abc'), encoding='utf-8').read()
    blocks = re.split(r'^X:\d+\s*$', src, flags=re.M)[1:]
    songs, errors = [], []
    for block in blocks:
        header, body_lines = {}, []
        for line in block.splitlines():
            line = line.rstrip()
            if line.startswith('%%'):
                k, _, v = line[2:].partition(' ')
                header[k] = v.strip()
            elif re.match(r'^[MLKQ]:', line):
                header[line[0]] = line[2:].strip()
            elif line.startswith('%') or not line.strip():
                continue
            else:
                body_lines.append(line)
        body = preprocess_broken(' '.join(body_lines))
        songs.append(parse_song(header, body, errors))

    if errors:
        for e in errors:
            print('ERROR:', e, file=sys.stderr)
        sys.exit(1)

    for s in songs:
        total_q = sum(n[1] for n in s['notes'])
        dur_sec = total_q * 60.0 / s['bpm']
        print('%-18s %2d notes  %5.1fq  %4.1fs  bpm=%d' % (s['id'], len(s['notes']), total_q, dur_sec, s['bpm']))

    out = os.path.join(here, '..', 'songs.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(songs, f, ensure_ascii=False, indent=1)
    print('\nwrote %s (%d songs)' % (os.path.normpath(out), len(songs)))


if __name__ == '__main__':
    main()
