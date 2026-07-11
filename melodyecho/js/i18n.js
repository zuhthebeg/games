// 멜로디 에코 — i18n (ko/en/ja). 문자열은 전부 여기, 코드에선 ME.i18n.t(key, params)로.
(function (global) {
  'use strict';

  var DICTS = {
    ko: {
      title: '멜로디 에코',
      sub: '듣고, 따라 치고, 내 청음 레벨을 진단받는다 — 음감 시리즈 2탄',
      statBestMelody: '멜로디 최고 Lv',
      statBestRhythm: '리듬 최고 Lv',
      statStreak: '연속 출석',
      startDaily: '오늘의 진단 시작하기',
      startPractice: '자유 연습 (기록 없음)',
      doneToday: '오늘 진단은 이미 완료! 자유 연습은 무제한이에요.',
      viewResult: '오늘 결과 다시 보기',
      introHow: '🎹 멜로디 8라운드 + 🥁 리듬 6라운드. 맞추면 레벨이 오르고 틀리면 내려가요. 마지막 레벨이 당신의 청음 레벨!',
      seriesLink: '🎵 1탄 <a href="/wrongnote/">틀린 음 찾기</a>도 해보세요',
      phaseMelody: '멜로디 에코',
      phaseRhythm: '리듬 에코',
      roundPill: '라운드 {n} / {total}',
      levelPill: 'Lv {n}',
      listenFirst: '멜로디를 잘 들어보세요…',
      yourTurn: '이제 따라 칠 차례! 첫 음은 채워뒀어요.',
      replayBtn: '🔁 다시 듣기 ({n}회 남음)',
      undoBtn: '⌫ 지우기',
      listenRhythm: '리듬 패턴을 잘 들어보세요…',
      tapTurn: '카운트인 후 패드를 탭해서 리듬을 재현하세요!',
      tapPad: 'TAP',
      countIn: '준비… {n}',
      calibTitle: '🎧 기기 보정 (최초 1회)',
      calibDesc: '기기마다 소리·터치 지연이 달라요. 딱 8번, 클릭 소리에 맞춰 패드를 탭해주세요. 판정이 훨씬 정확해집니다.',
      calibStart: '보정 시작',
      calibTapAlong: '클릭에 맞춰 탭!',
      calibDone: '보정 완료: {ms}ms — 판정에 반영됩니다',
      calibRedo: '🎧 보정 다시 하기',
      calibSkip: '건너뛰기 (보정 없이 진행)',
      calibFail: '탭이 부족해요. 다시 해볼까요?',
      resultPerfect: '퍼펙트! 🎉',
      resultGood: '성공!',
      resultFail: '아쉽다…',
      melodyYou: '내 입력',
      melodyAnswer: '정답',
      rhythmHits: '퍼펙트 {p} · 굿 {g} · 미스 {m} · 추가탭 {e}',
      nextRound: '다음 라운드 ▶',
      toRhythm: '리듬 페이즈로 ▶',
      toFinal: '결과 보기 ▶',
      finalTitle: '청음 프로필',
      melodyLv: '멜로디 Lv',
      rhythmLv: '리듬 Lv',
      totalScore: '총점 {n}점',
      percentileLine: '상위 {n}% 귀 (재미용 추정치)',
      goldLine: '🪙 골드 +{n} 획득!',
      streakLine: '연속 출석 {n}일',
      titleMaestro: '🏆 마에스트로 이어',
      titleGolden: '✨ 골든 이어',
      titleTuned: '🎯 조율된 귀',
      titleGrowing: '🌿 자라는 귀',
      titleSprout: '🌱 새싹 귀',
      share: '결과 공유하기',
      home: '처음으로',
      copied: '클립보드에 복사됐어요!',
      shareText: '🎹 멜로디 에코 — 내 청음 프로필\n{title}\n멜로디 Lv {mlv} · 리듬 Lv {rlv} · 총점 {score}\n상위 {pct}%\n{grid}\nhttps://game.cocy.io/melodyecho/',
      practiceNote: '자유 연습 — 기록·골드·랭킹 미반영',
      loading: '준비 중…'
    },
    en: {
      title: 'Melody Echo',
      sub: 'Listen, play it back, get your ear level diagnosed — Ear Training Series #2',
      statBestMelody: 'Best Melody Lv',
      statBestRhythm: 'Best Rhythm Lv',
      statStreak: 'Streak',
      startDaily: "Start Today's Diagnosis",
      startPractice: 'Free Practice (no records)',
      doneToday: "Today's diagnosis is done! Free practice is unlimited.",
      viewResult: "View Today's Result",
      introHow: '🎹 8 melody rounds + 🥁 6 rhythm rounds. Level up when correct, down when wrong. Your final level is your ear level!',
      seriesLink: '🎵 Also try #1 <a href="/wrongnote/">Find the Wrong Note</a>',
      phaseMelody: 'Melody Echo',
      phaseRhythm: 'Rhythm Echo',
      roundPill: 'Round {n} / {total}',
      levelPill: 'Lv {n}',
      listenFirst: 'Listen carefully…',
      yourTurn: 'Your turn! The first note is filled in.',
      replayBtn: '🔁 Replay ({n} left)',
      undoBtn: '⌫ Undo',
      listenRhythm: 'Listen to the rhythm pattern…',
      tapTurn: 'After the count-in, tap the pad to echo the rhythm!',
      tapPad: 'TAP',
      countIn: 'Ready… {n}',
      calibTitle: '🎧 Device Calibration (once)',
      calibDesc: 'Every device has different audio/touch latency. Tap along with 8 clicks — judgments get much more accurate.',
      calibStart: 'Start Calibration',
      calibTapAlong: 'Tap along with the clicks!',
      calibDone: 'Calibrated: {ms}ms — applied to judgments',
      calibRedo: '🎧 Recalibrate',
      calibSkip: 'Skip (no calibration)',
      calibFail: 'Not enough taps. Try again?',
      resultPerfect: 'Perfect! 🎉',
      resultGood: 'Success!',
      resultFail: 'So close…',
      melodyYou: 'Your input',
      melodyAnswer: 'Answer',
      rhythmHits: 'Perfect {p} · Good {g} · Miss {m} · Extra {e}',
      nextRound: 'Next Round ▶',
      toRhythm: 'To Rhythm Phase ▶',
      toFinal: 'See Results ▶',
      finalTitle: 'Ear Profile',
      melodyLv: 'Melody Lv',
      rhythmLv: 'Rhythm Lv',
      totalScore: 'Total {n} pts',
      percentileLine: 'Top {n}% ear (just for fun)',
      goldLine: '🪙 +{n} Gold earned!',
      streakLine: '{n}-day streak',
      titleMaestro: '🏆 Maestro Ear',
      titleGolden: '✨ Golden Ear',
      titleTuned: '🎯 Well-Tuned Ear',
      titleGrowing: '🌿 Growing Ear',
      titleSprout: '🌱 Sprout Ear',
      share: 'Share Result',
      home: 'Home',
      copied: 'Copied to clipboard!',
      shareText: '🎹 Melody Echo — My Ear Profile\n{title}\nMelody Lv {mlv} · Rhythm Lv {rlv} · Score {score}\nTop {pct}%\n{grid}\nhttps://game.cocy.io/melodyecho/',
      practiceNote: 'Free practice — no records, gold, or ranking',
      loading: 'Loading…'
    },
    ja: {
      title: 'メロディーエコー',
      sub: '聴いて、弾き返して、耳レベルを診断 — 音感シリーズ第2弾',
      statBestMelody: 'メロディー最高Lv',
      statBestRhythm: 'リズム最高Lv',
      statStreak: '連続出席',
      startDaily: '今日の診断を始める',
      startPractice: '自由練習（記録なし）',
      doneToday: '今日の診断は完了！自由練習は無制限です。',
      viewResult: '今日の結果を見る',
      introHow: '🎹 メロディー8ラウンド + 🥁 リズム6ラウンド。正解でレベルアップ、不正解でダウン。最終レベルがあなたの耳レベル！',
      seriesLink: '🎵 第1弾 <a href="/wrongnote/">まちがい音さがし</a> もどうぞ',
      phaseMelody: 'メロディーエコー',
      phaseRhythm: 'リズムエコー',
      roundPill: 'ラウンド {n} / {total}',
      levelPill: 'Lv {n}',
      listenFirst: 'よく聴いてください…',
      yourTurn: 'あなたの番！最初の音は入力済みです。',
      replayBtn: '🔁 もう一度聴く（残り{n}回）',
      undoBtn: '⌫ 消す',
      listenRhythm: 'リズムパターンをよく聴いてください…',
      tapTurn: 'カウントインの後、パッドをタップしてリズムを再現！',
      tapPad: 'TAP',
      countIn: '準備… {n}',
      calibTitle: '🎧 デバイス補正（初回のみ）',
      calibDesc: 'デバイスごとに音・タッチの遅延が違います。クリック音に合わせて8回タップしてください。判定が正確になります。',
      calibStart: '補正スタート',
      calibTapAlong: 'クリックに合わせてタップ！',
      calibDone: '補正完了: {ms}ms — 判定に反映されます',
      calibRedo: '🎧 再補正',
      calibSkip: 'スキップ（補正なし）',
      calibFail: 'タップが足りません。もう一度？',
      resultPerfect: 'パーフェクト！🎉',
      resultGood: '成功！',
      resultFail: 'おしい…',
      melodyYou: 'あなたの入力',
      melodyAnswer: '正解',
      rhythmHits: 'パーフェクト {p} · グッド {g} · ミス {m} · 余分 {e}',
      nextRound: '次のラウンド ▶',
      toRhythm: 'リズムフェーズへ ▶',
      toFinal: '結果を見る ▶',
      finalTitle: '耳プロフィール',
      melodyLv: 'メロディーLv',
      rhythmLv: 'リズムLv',
      totalScore: '合計 {n}点',
      percentileLine: '上位{n}%の耳（おたのしみ推定）',
      goldLine: '🪙 ゴールド +{n} 獲得！',
      streakLine: '連続出席 {n}日',
      titleMaestro: '🏆 マエストロイヤー',
      titleGolden: '✨ ゴールデンイヤー',
      titleTuned: '🎯 調律された耳',
      titleGrowing: '🌿 育つ耳',
      titleSprout: '🌱 芽生えの耳',
      share: '結果をシェア',
      home: 'ホームへ',
      copied: 'コピーしました！',
      shareText: '🎹 メロディーエコー — 耳プロフィール\n{title}\nメロディーLv {mlv} · リズムLv {rlv} · 合計 {score}\n上位{pct}%\n{grid}\nhttps://game.cocy.io/melodyecho/',
      practiceNote: '自由練習 — 記録・ゴールド・ランキング対象外',
      loading: '準備中…'
    }
  };

  var KEY = 'melodyecho_lang';
  var current = null;

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

  function lang() {
    if (!current) current = detect();
    return current;
  }

  function setLang(l) {
    if (!DICTS[l]) return;
    current = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.lang = l;
  }

  function cycle() {
    var order = ['ko', 'en', 'ja'];
    setLang(order[(order.indexOf(lang()) + 1) % order.length]);
  }

  function t(key, params) {
    var dict = DICTS[lang()] || DICTS.ko;
    var s = dict[key] != null ? dict[key] : (DICTS.ko[key] != null ? DICTS.ko[key] : key);
    if (params) {
      Object.keys(params).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(params[k]));
      });
    }
    return s;
  }

  global.ME = global.ME || {};
  global.ME.i18n = { t: t, lang: lang, setLang: setLang, cycle: cycle };
})(window);
