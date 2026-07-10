// 틀린 음 찾기 — i18n (ko/en/ja). 문자열은 전부 여기, 코드에선 WN.i18n.t(key, params)로.
(function (global) {
  'use strict';

  var DICTS = {
    ko: {
      title: '틀린 음 찾기',
      sub: '오디오판 틀린그림찾기 — 듣고, 탭하고, 내 귀를 진단받는다',
      statStreak: '연속 출석',
      statBest: '최고 점수',
      doneToday: '오늘 문제는 이미 풀었어요. 다시 도전해도 기록은 갱신되지 않아요.',
      viewResult: '오늘 결과 다시 보기',
      start: '오늘의 5문제 시작하기',
      debugTitle: '🔧 디버그: 곡 원본 듣기',
      debugPlay: '▶ 원곡 재생',
      debugStop: '⏹ 정지',
      debugNote: '이탈 없는 원본 멜로디. 재생 횟수 제한 없음.',
      pillPuzzle: '문제 {n} / 5',
      pillPlays: '재생 {n}/3',
      stageAria: '여기를 탭해서 틀린 부분을 표시하세요',
      stageHint: '재생 중 이상하다 싶은 순간에 탭!',
      loopStart: '구간 시작',
      loopEnd: '구간 끝·반복',
      loopClear: '반복 해제',
      popTitle: '이 마커, 어떻게 틀렸나요? (선택사항)',
      corrHigher: '음 높음 ↑',
      corrLower: '음 낮음 ↓',
      corrEarly: '박자 빠름 «',
      corrLate: '박자 느림 »',
      markerDelete: '마커 삭제',
      markerClose: '닫기',
      submit: '제출하고 채점하기',
      hintLoopStart: '구간 시작 지정: {t}',
      hintLoopFirst: '먼저 "구간 시작"을 눌러주세요',
      hintNoPlays: '재생 3회를 모두 사용했어요. 지금까지 들은 걸로 승부!',
      hintTapWhilePlaying: '재생 중에 탭해야 마커가 찍혀요',
      revealTitle: '정답 공개 · {title}',
      revealScore: '발견 {found}/{total} · 교정보너스 {corr} · 오탐 {fp} · <strong>+{score}점</strong>',
      abPerformed: '출제본 듣기',
      abOriginal: '원곡 듣기',
      abPlay: '▶ 재생',
      devPitchUp: '음이 높아짐',
      devPitchDown: '음이 낮아짐',
      devLate: '박자가 늦어짐',
      devEarly: '박자가 빨라짐',
      devItem: '{n}번 이탈 · {label} · {status}',
      statusFoundCorr: '정확히 발견+교정!',
      statusFound: '발견 (교정 미스)',
      statusMissed: '놓침',
      fpItem: '오탐 마커 {n}개 (실제 이탈이 없는 곳을 표시함)',
      nextPuzzle: '다음 문제 ▶',
      finalResultBtn: '최종 결과 보기',
      finalTitle: '오늘의 귀 진단',
      earAgeUnit: '세',
      percentileLine: '상위 {n}% 귀 (재미용 추정치)',
      totalLine: '총점 {score}점 · 연속 출석 {streak}일',
      goldLine: '🪙 골드 +{n} 획득!',
      share: '결과 공유하기',
      home: '처음으로',
      copied: '클립보드에 복사됐어요!',
      loadFail: '곡 데이터를 불러오지 못했어요. 새로고침 해보세요.',
      shareGame: '틀린 음 찾기',
      shareEarAge: '🎵 오늘의 귀 나이: {age}세 (상위 {pct}%)'
    },
    en: {
      title: 'Find the Wrong Note',
      sub: 'Spot-the-difference for your ears — listen, tap, get your ear diagnosed',
      statStreak: 'Day streak',
      statBest: 'Best score',
      doneToday: "You've already played today. Replays won't update your record.",
      viewResult: "View today's result",
      start: "Start today's 5 puzzles",
      debugTitle: '🔧 Debug: listen to originals',
      debugPlay: '▶ Play original',
      debugStop: '⏹ Stop',
      debugNote: 'Original melody without deviations. No play limit.',
      pillPuzzle: 'Puzzle {n} / 5',
      pillPlays: 'Plays {n}/3',
      stageAria: 'Tap here to mark the wrong parts',
      stageHint: 'Tap the moment something sounds off!',
      loopStart: 'Loop start',
      loopEnd: 'Loop end · repeat',
      loopClear: 'Clear loop',
      popTitle: 'How is this note wrong? (optional)',
      corrHigher: 'Too high ↑',
      corrLower: 'Too low ↓',
      corrEarly: 'Too early «',
      corrLate: 'Too late »',
      markerDelete: 'Delete marker',
      markerClose: 'Close',
      submit: 'Submit & grade',
      hintLoopStart: 'Loop start set: {t}',
      hintLoopFirst: 'Press "Loop start" first',
      hintNoPlays: "All 3 plays used. Go with what you've heard!",
      hintTapWhilePlaying: 'Tap while the music is playing to drop a marker',
      revealTitle: 'Answer · {title}',
      revealScore: 'Found {found}/{total} · Correction bonus {corr} · False alarms {fp} · <strong>+{score} pts</strong>',
      abPerformed: 'Puzzle version',
      abOriginal: 'Original',
      abPlay: '▶ Play',
      devPitchUp: 'pitch raised',
      devPitchDown: 'pitch lowered',
      devLate: 'timing delayed',
      devEarly: 'timing rushed',
      devItem: 'Deviation {n} · {label} · {status}',
      statusFoundCorr: 'Found + corrected!',
      statusFound: 'Found (wrong correction)',
      statusMissed: 'Missed',
      fpItem: '{n} false-alarm marker(s) (marked where nothing was wrong)',
      nextPuzzle: 'Next puzzle ▶',
      finalResultBtn: 'See final result',
      finalTitle: "Today's Ear Diagnosis",
      earAgeUnit: 'yrs',
      percentileLine: 'Top {n}% ears (just for fun)',
      totalLine: 'Total {score} pts · {streak}-day streak',
      goldLine: '🪙 +{n} gold earned!',
      share: 'Share result',
      home: 'Home',
      copied: 'Copied to clipboard!',
      loadFail: 'Failed to load song data. Try refreshing.',
      shareGame: 'Find the Wrong Note',
      shareEarAge: '🎵 My ear age today: {age} (top {pct}%)'
    },
    ja: {
      title: 'まちがい音さがし',
      sub: '耳で楽しむまちがいさがし — 聴いて、タップして、耳年齢を診断',
      statStreak: '連続出席',
      statBest: 'ベストスコア',
      doneToday: '今日の問題はもう解きました。再挑戦しても記録は更新されません。',
      viewResult: '今日の結果をもう一度見る',
      start: '今日の5問をはじめる',
      debugTitle: '🔧 デバッグ: 原曲を聴く',
      debugPlay: '▶ 原曲再生',
      debugStop: '⏹ 停止',
      debugNote: 'ズレのない原曲メロディー。再生回数制限なし。',
      pillPuzzle: '問題 {n} / 5',
      pillPlays: '再生 {n}/3',
      stageAria: 'ここをタップして違う部分をマークしてください',
      stageHint: '再生中に「あれ?」と思った瞬間にタップ!',
      loopStart: '区間開始',
      loopEnd: '区間終了・リピート',
      loopClear: 'リピート解除',
      popTitle: 'このマーカー、どう違いましたか?(任意)',
      corrHigher: '音が高い ↑',
      corrLower: '音が低い ↓',
      corrEarly: 'テンポが早い «',
      corrLate: 'テンポが遅い »',
      markerDelete: 'マーカー削除',
      markerClose: '閉じる',
      submit: '提出して採点する',
      hintLoopStart: '区間開始を設定: {t}',
      hintLoopFirst: 'まず「区間開始」を押してください',
      hintNoPlays: '再生3回を使い切りました。ここまでの記憶で勝負!',
      hintTapWhilePlaying: '再生中にタップするとマーカーが付きます',
      revealTitle: '正解発表 · {title}',
      revealScore: '発見 {found}/{total} · 補正ボーナス {corr} · 誤検出 {fp} · <strong>+{score}点</strong>',
      abPerformed: '出題版を聴く',
      abOriginal: '原曲を聴く',
      abPlay: '▶ 再生',
      devPitchUp: '音が高くなった',
      devPitchDown: '音が低くなった',
      devLate: 'テンポが遅れた',
      devEarly: 'テンポが早まった',
      devItem: '{n}番のズレ · {label} · {status}',
      statusFoundCorr: '発見+補正成功!',
      statusFound: '発見(補正ミス)',
      statusMissed: '見逃し',
      fpItem: '誤検出マーカー {n}個(ズレのない場所をマーク)',
      nextPuzzle: '次の問題 ▶',
      finalResultBtn: '最終結果を見る',
      finalTitle: '今日の耳診断',
      earAgeUnit: '歳',
      percentileLine: '上位 {n}% の耳(お楽しみ推定値)',
      totalLine: '合計 {score}点 · 連続出席 {streak}日',
      goldLine: '🪙 ゴールド +{n} 獲得!',
      share: '結果をシェア',
      home: 'ホームへ',
      copied: 'クリップボードにコピーしました!',
      loadFail: '曲データを読み込めませんでした。再読み込みしてください。',
      shareGame: 'まちがい音さがし',
      shareEarAge: '🎵 今日の耳年齢: {age}歳(上位 {pct}%)'
    }
  };

  var LANGS = ['ko', 'en', 'ja'];
  var KEY = 'wn_lang';

  function detect() {
    try {
      var saved = localStorage.getItem(KEY);
      if (saved && DICTS[saved]) return saved;
    } catch (e) {}
    var nav = (navigator.language || 'ko').toLowerCase();
    if (nav.indexOf('ja') === 0) return 'ja';
    if (nav.indexOf('ko') === 0) return 'ko';
    return 'en';
  }

  var current = detect();

  function t(key, params) {
    var s = (DICTS[current] && DICTS[current][key]) || DICTS.ko[key] || key;
    if (params) {
      Object.keys(params).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(params[k]));
      });
    }
    return s;
  }

  function songTitle(song) {
    if (!song) return '';
    return song['title_' + current] || song.title_ko || song.title || '';
  }

  function cycle() {
    var i = (LANGS.indexOf(current) + 1) % LANGS.length;
    current = LANGS[i];
    try { localStorage.setItem(KEY, current); } catch (e) {}
    return current;
  }

  global.WN = global.WN || {};
  global.WN.i18n = {
    t: t,
    songTitle: songTitle,
    cycle: cycle,
    lang: function () { return current; },
    label: function () { return { ko: '한국어', en: 'EN', ja: '日本語' }[current]; }
  };
})(window);
