// 멜로디 에코 — 절차 생성기 (멜로디 + 리듬 패턴)
// 곡 데이터 없음: 레벨 파라미터 테이블 + 시드 RNG로 문제를 결정론 생성한다.
(function (global) {
  'use strict';

  // MIDI 노트 번호 기준. C4 = 60.
  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  function midiToName(midi) {
    return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
  }

  function isBlackKey(midi) {
    var pc = midi % 12;
    return pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
  }

  // C장조 스케일 (피치클래스)
  var MAJOR_PC = [0, 2, 4, 5, 7, 9, 11];

  function isDiatonic(midi) {
    return MAJOR_PC.indexOf(midi % 12) >= 0;
  }

  // 레벨 → 멜로디 생성 파라미터
  // noteCount: 재현할 음 수 / maxLeap: 최대 도약(반음) / chromaticProb: 반음계 이웃음 확률
  // rangeSemis: 허용 음역(반음) / gapMs: 음 간격
  function melodyParams(level) {
    var L = Math.max(1, level);
    return {
      noteCount: Math.min(8, 3 + Math.floor((L - 1) / 2)),
      maxLeap: L <= 2 ? 4 : L <= 4 ? 5 : L <= 6 ? 9 : 12,
      chromaticProb: L <= 6 ? 0 : L <= 8 ? 0.15 : L <= 11 ? 0.25 : 0.35,
      rangeSemis: L <= 2 ? 7 : L <= 4 ? 9 : L <= 6 ? 12 : L <= 8 ? 14 : 16,
      gapMs: L <= 8 ? 500 : 400
    };
  }

  // 멜로디 생성: 시작음은 C4~C5 다이어토닉, 이후 음은 도약 제한 + 음역 제한 내 랜덤워크.
  // 반환: { notes:[midi...], gapMs, level }
  function generateMelody(rng, level) {
    var p = melodyParams(level);
    var chromatic = p.chromaticProb > 0;

    // 시작음: C4(60)~B4(71) 중 다이어토닉
    var startCandidates = [];
    for (var m = 60; m <= 71; m++) if (isDiatonic(m)) startCandidates.push(m);
    var start = rng.pick(startCandidates);

    var lo = start, hi = start;
    var notes = [start];
    var guard = 0;
    while (notes.length < p.noteCount && guard < 500) {
      guard++;
      var prev = notes[notes.length - 1];
      var useChromatic = chromatic && rng.next() < p.chromaticProb;
      var step;
      if (useChromatic) {
        step = rng.pick([-1, 1]); // 반음계 이웃음
      } else {
        // 다이어토닉 스텝/도약: 반음 간격 후보에서 고르되 다이어토닉만 남긴다
        var candidates = [];
        for (var d = -p.maxLeap; d <= p.maxLeap; d++) {
          if (d === 0) continue;
          var cand = prev + d;
          if (!isDiatonic(cand)) continue;
          // 스텝(±1~2도) 가중치를 높인다: 3회 중복 삽입
          var weight = Math.abs(d) <= 4 ? 3 : 1;
          for (var w = 0; w < weight; w++) candidates.push(cand);
        }
        if (!candidates.length) continue;
        step = rng.pick(candidates) - prev;
      }
      var next = prev + step;
      // 건반 표시 가능한 절대 범위(C3~C6) + 레벨 음역 제한
      if (next < 48 || next > 84) continue;
      var newLo = Math.min(lo, next), newHi = Math.max(hi, next);
      if (newHi - newLo > p.rangeSemis) continue;
      // 같은 음 3연속 금지
      if (notes.length >= 2 && notes[notes.length - 2] === next && prev === next) continue;
      notes.push(next);
      lo = newLo; hi = newHi;
    }
    // guard 소진 시(극단 케이스) 부족분은 시작음 반복으로 채운다 — 결정론 유지
    while (notes.length < p.noteCount) notes.push(start);

    return { notes: notes, gapMs: p.gapMs, level: level };
  }

  // 레벨 → 리듬 생성 파라미터
  // 2마디 4/4, 그리드 단위: 16분(0.25박). onsets = 박 위치 배열(0~7.75)
  function rhythmParams(level) {
    var L = Math.max(1, level);
    return {
      bpm: 90,
      beats: 8, // 2마디
      onsetCount: Math.min(9, 3 + L),
      // 사용 가능한 그리드 오프셋 (박 내)
      grid: L <= 2 ? [0] : L <= 4 ? [0, 0.5] : L <= 6 ? [0, 0.5] : L <= 8 ? [0, 0.25, 0.5, 0.75] : [0, 1 / 3, 0.5, 2 / 3],
      syncopProb: L <= 4 ? 0 : L <= 6 ? 0.35 : 0.45 // 오프비트 선택 확률
    };
  }

  // 리듬 패턴 생성: 첫 박(0)은 항상 온셋(앵커). 나머지는 그리드에서 중복 없이 뽑는다.
  // 반환: { onsets:[beat...], bpm, beats, level }
  function generateRhythm(rng, level) {
    var p = rhythmParams(level);
    var pool = [];
    for (var b = 0; b < p.beats; b++) {
      for (var g = 0; g < p.grid.length; g++) {
        var off = p.grid[g];
        if (b === 0 && off === 0) continue; // 앵커는 이미 확보
        // 마지막 반박은 입력 시간 확보를 위해 제외
        if (b === p.beats - 1 && off > 0.5) continue;
        pool.push({ pos: b + off, offbeat: off !== 0 });
      }
    }
    var onsets = [0];
    var need = p.onsetCount - 1;
    var guard = 0;
    while (need > 0 && pool.length > 0 && guard < 500) {
      guard++;
      var idx = rng.int(0, pool.length);
      var cand = pool[idx];
      // 저레벨에선 오프비트 확률 게이트
      if (cand.offbeat && rng.next() > p.syncopProb) continue;
      // 최소 간격 0.25박 확보
      var tooClose = false;
      for (var i = 0; i < onsets.length; i++) {
        if (Math.abs(onsets[i] - cand.pos) < 0.24) { tooClose = true; break; }
      }
      pool.splice(idx, 1);
      if (tooClose) continue;
      onsets.push(cand.pos);
      need--;
    }
    onsets.sort(function (a, b2) { return a - b2; });
    return { onsets: onsets, bpm: p.bpm, beats: p.beats, level: level };
  }

  global.ME = global.ME || {};
  global.ME.gen = {
    midiToName: midiToName,
    isBlackKey: isBlackKey,
    isDiatonic: isDiatonic,
    melodyParams: melodyParams,
    rhythmParams: rhythmParams,
    generateMelody: generateMelody,
    generateRhythm: generateRhythm
  };
})(window);
