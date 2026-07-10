// 틀린 음 찾기 — 문제 생성기
// 날짜 시드 -> 결정론적으로 5문제(곡 선택 + 이탈 위치/종류) 생성.
// 같은 dateStr을 넣으면 항상 같은 결과가 나와야 한다 (Done When #3 결정론 검증 대상).
(function (global) {
  'use strict';

  var theory = global.WN.theory;

  // 난이도 테이블: 문제별로 별도 정의 (ceil 스케일링 금지, 브리프 지시사항)
  // count: 이탈 개수, pitchSemitones: 음정 이탈 크기(반음), timingMs: 박자 이탈 크기(ms)
  // types: 이 문제에서 뽑을 수 있는 이탈 종류 풀
  var DIFFICULTY_TABLE = [
    { count: 1, pitchSemitones: 2, timingMs: 200, types: ['pitch'] },
    { count: 1, pitchSemitones: 2, timingMs: 150, types: ['pitch', 'timing'] },
    { count: 2, pitchSemitones: 2, timingMs: 120, types: ['pitch', 'timing'] },
    { count: 3, pitchSemitones: 1, timingMs: 80, types: ['pitch', 'timing'] },
    { count: 4, pitchSemitones: 1, timingMs: 50, types: ['pitch', 'timing'] }
  ];

  function getDifficulty(puzzleIndex) {
    return DIFFICULTY_TABLE[Math.min(puzzleIndex, DIFFICULTY_TABLE.length - 1)];
  }

  // 노트 배열에 시작 박(startBeat)과 시작 초(startSec)를 부여
  function withTiming(notes, bpm) {
    var secPerBeat = 60 / bpm;
    var acc = 0;
    return notes.map(function (n, i) {
      var pitch = n[0], dur = n[1];
      var out = { index: i, pitch: pitch, dur: dur, startBeat: acc, startSec: acc * secPerBeat, offsetMs: 0 };
      acc += dur;
      return out;
    });
  }

  // 이탈을 적용할 노트 인덱스 선택: 첫/마지막 노트 제외, 서로 최소 간격(2) 유지
  function pickDeviationIndices(rng, noteCount, count) {
    var candidates = [];
    for (var i = 1; i < noteCount - 1; i++) candidates.push(i);
    var shuffled = rng.shuffle(candidates);
    var chosen = [];
    for (var j = 0; j < shuffled.length && chosen.length < count; j++) {
      var idx = shuffled[j];
      var tooClose = chosen.some(function (c) { return Math.abs(c - idx) < 2; });
      if (!tooClose) chosen.push(idx);
    }
    // 후보가 부족하면(짧은 곡) 간격 제약 없이 채움
    if (chosen.length < count) {
      for (var k = 0; k < shuffled.length && chosen.length < count; k++) {
        if (chosen.indexOf(shuffled[k]) === -1) chosen.push(shuffled[k]);
      }
    }
    return chosen.sort(function (a, b) { return a - b; });
  }

  // 한 곡 + 난이도 설정으로 한 문제(performed 버전 + 정답 이탈 목록) 생성
  function buildPuzzle(rng, song, puzzleIndex) {
    var diff = getDifficulty(puzzleIndex);
    var original = withTiming(song.notes, song.bpm);
    var performed = original.map(function (n) { return { index: n.index, pitch: n.pitch, dur: n.dur, startBeat: n.startBeat, startSec: n.startSec, offsetMs: 0 }; });

    var devIndices = pickDeviationIndices(rng, original.length, diff.count);
    var deviations = devIndices.map(function (noteIndex) {
      var type = rng.pick(diff.types);
      var direction = rng.pick([1, -1]);
      var dev = { noteIndex: noteIndex, type: type, direction: direction };

      if (type === 'pitch') {
        var originalPitch = original[noteIndex].pitch;
        var performedPitch = theory.transpose(originalPitch, direction * diff.pitchSemitones);
        performed[noteIndex].pitch = performedPitch;
        dev.originalPitch = originalPitch;
        dev.performedPitch = performedPitch;
        dev.semitones = diff.pitchSemitones;
      } else {
        var offsetMs = direction * diff.timingMs;
        performed[noteIndex].offsetMs = offsetMs;
        performed[noteIndex].startSec = original[noteIndex].startSec + offsetMs / 1000;
        dev.offsetMs = offsetMs;
      }
      return dev;
    });

    return {
      puzzleIndex: puzzleIndex,
      difficulty: diff,
      song: { id: song.id, title_ko: song.title_ko, title_en: song.title_en, title_ja: song.title_ja, bpm: song.bpm },
      originalNotes: original,
      performedNotes: performed,
      deviations: deviations,
      totalDurationSec: (original[original.length - 1].startSec + original[original.length - 1].dur * (60 / song.bpm))
    };
  }

  // 날짜 시드로 5문제 생성. songs: data/songs.json 로드 결과 배열.
  function generateDaily(dateStr, songs) {
    var rng = global.WN.rng.createRng('wrongnote:' + dateStr);
    var songOrder = rng.shuffle(songs);
    var picked = songOrder.slice(0, 5);
    var puzzles = [];
    for (var i = 0; i < 5; i++) {
      puzzles.push(buildPuzzle(rng, picked[i], i));
    }
    return puzzles;
  }

  // 결정론 검증용: 문제 세트를 문자열로 직렬화 후 간단 해시
  function hashPuzzleSet(puzzles) {
    var parts = puzzles.map(function (p) {
      var devStr = p.deviations.map(function (d) {
        return [d.noteIndex, d.type, d.direction, d.originalPitch || '', d.performedPitch || '', d.offsetMs || ''].join(':');
      }).join(',');
      return p.song.id + '|' + devStr;
    });
    return global.WN.rng.hashStringToSeed(parts.join('#')).toString(16);
  }

  global.WN = global.WN || {};
  global.WN.puzzleGen = {
    DIFFICULTY_TABLE: DIFFICULTY_TABLE,
    getDifficulty: getDifficulty,
    generateDaily: generateDaily,
    hashPuzzleSet: hashPuzzleSet
  };
})(window);
