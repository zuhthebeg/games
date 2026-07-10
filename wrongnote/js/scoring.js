// 틀린 음 찾기 — 채점 + 자가진단(귀 나이/백분위) + 공유 그리드
(function (global) {
  'use strict';

  var FOUND_POINTS = 10;
  var CORRECTION_BONUS = 5;
  var FALSE_POSITIVE_PENALTY = -3;
  var MATCH_TOLERANCE_SEC = 0.6; // 마커-이탈 노트 매칭 허용 오차(순발력 무관, 넉넉하게)

  function expectedLabel(dev) {
    if (dev.type === 'pitch') return dev.direction === 1 ? 'higher' : 'lower';
    return dev.direction === 1 ? 'late' : 'early'; // offsetMs>0 = 늦게 연주됨
  }

  // markers: [{ timeSec, correction: 'higher'|'lower'|'early'|'late'|null }]
  function gradePuzzle(puzzle, markers) {
    var deviations = puzzle.deviations;
    var usedMarker = markers.map(function () { return false; });
    var found = [];
    var missed = [];

    deviations.forEach(function (dev) {
      var noteTime = puzzle.performedNotes[dev.noteIndex].startSec;
      var bestIdx = -1, bestDist = Infinity;
      markers.forEach(function (mk, i) {
        if (usedMarker[i]) return;
        var dist = Math.abs(mk.timeSec - noteTime);
        if (dist <= MATCH_TOLERANCE_SEC && dist < bestDist) { bestDist = dist; bestIdx = i; }
      });
      if (bestIdx >= 0) {
        usedMarker[bestIdx] = true;
        var marker = markers[bestIdx];
        var correct = marker.correction === expectedLabel(dev);
        found.push({ deviation: dev, marker: marker, correctionCorrect: correct });
      } else {
        missed.push(dev);
      }
    });

    var falsePositives = markers.filter(function (mk, i) { return !usedMarker[i]; });

    var score = found.length * FOUND_POINTS
      + found.filter(function (f) { return f.correctionCorrect; }).length * CORRECTION_BONUS
      + falsePositives.length * FALSE_POSITIVE_PENALTY;
    score = Math.max(0, score);

    var maxScore = deviations.length * (FOUND_POINTS + CORRECTION_BONUS);

    return {
      puzzleIndex: puzzle.puzzleIndex,
      found: found,
      missed: missed,
      falsePositives: falsePositives,
      score: score,
      maxScore: maxScore
    };
  }

  function gradeAll(puzzles, markersByPuzzle) {
    return puzzles.map(function (p, i) { return gradePuzzle(p, markersByPuzzle[i] || []); });
  }

  function totalRatio(puzzleResults) {
    var score = 0, max = 0;
    puzzleResults.forEach(function (r) { score += r.score; max += r.maxScore; });
    return max > 0 ? score / max : 0;
  }

  // 귀 나이 매핑 (재미용, 점수 비율 -> 나이). 순수 엔터테인먼트 목적.
  var EAR_AGE_BANDS = [
    { min: 0.95, age: 9 },
    { min: 0.85, age: 14 },
    { min: 0.70, age: 19 },
    { min: 0.55, age: 27 },
    { min: 0.40, age: 38 },
    { min: 0.25, age: 52 },
    { min: 0.10, age: 65 },
    { min: 0.0, age: 74 }
  ];

  function earAgeFromRatio(ratio) {
    for (var i = 0; i < EAR_AGE_BANDS.length; i++) {
      if (ratio >= EAR_AGE_BANDS[i].min) return EAR_AGE_BANDS[i].age;
    }
    return 74;
  }

  // TODO(M2): 실제 유저 제출 분포로 교체. 지금은 서버가 없어(M1) 가짜 곡선으로 "상위 N%"를 흉내만 낸다.
  // 반환값 = "상위 N%"의 N (작을수록 좋음). ratio(0~1)를 지수 곡선으로 눌러
  // 고득점만 한 자릿수 상위권에 들고, 저득점은 상위 90%대(=하위권)로 밀리게 함.
  function fakePercentile(ratio) {
    var beat = Math.pow(Math.max(0, Math.min(1, ratio)), 1.8); // 내가 이긴 비율
    var topPercent = Math.round(100 * (1 - beat));
    return Math.min(99, Math.max(1, topPercent));
  }

  function emojiForResult(r) {
    if (r.found.length === 0) return '❌';
    var allFound = r.missed.length === 0;
    var allCorrect = r.found.every(function (f) { return f.correctionCorrect; });
    if (allFound && allCorrect && r.falsePositives.length === 0) return '🎯';
    if (allFound) return '✅';
    return '🟡';
  }

  function buildEmojiGrid(puzzleResults) {
    return puzzleResults.map(emojiForResult).join('');
  }

  function buildShareText(opts) {
    // opts: { dateStr, earAge, percentile, emojiGrid, url }
    var lines = [
      '틀린 음 찾기 ' + opts.dateStr,
      '🎵 오늘의 귀 나이: ' + opts.earAge + '세 (상위 ' + opts.percentile + '%)',
      opts.emojiGrid,
      opts.url || 'https://game.cocy.io/wrongnote/'
    ];
    return lines.join('\n');
  }

  global.WN = global.WN || {};
  global.WN.scoring = {
    FOUND_POINTS: FOUND_POINTS,
    CORRECTION_BONUS: CORRECTION_BONUS,
    FALSE_POSITIVE_PENALTY: FALSE_POSITIVE_PENALTY,
    expectedLabel: expectedLabel,
    gradePuzzle: gradePuzzle,
    gradeAll: gradeAll,
    totalRatio: totalRatio,
    earAgeFromRatio: earAgeFromRatio,
    fakePercentile: fakePercentile,
    buildEmojiGrid: buildEmojiGrid,
    buildShareText: buildShareText
  };
})(window);
