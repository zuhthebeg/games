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
    },
    tw: {
      title: '旋律回聲',
      sub: '聽、彈回來，診斷你的聽力等級 — 音感系列第2彈',
      statBestMelody: '旋律最高Lv',
      statBestRhythm: '節奏最高Lv',
      statStreak: '連續出席',
      startDaily: '開始今日診斷',
      startPractice: '自由練習（不留紀錄）',
      doneToday: '今日診斷已完成！自由練習不限次數。',
      viewResult: '查看今日結果',
      introHow: '🎹 旋律8回合 + 🥁 節奏6回合。答對升級、答錯降級。最終等級就是你的聽力等級！',
      seriesLink: '🎵 也試試第1彈 <a href="/wrongnote/">找錯音</a>',
      phaseMelody: '旋律回聲',
      phaseRhythm: '節奏回聲',
      roundPill: '回合 {n} / {total}',
      levelPill: 'Lv {n}',
      listenFirst: '仔細聽…',
      yourTurn: '換你了！第一個音已填好。',
      replayBtn: '🔁 再聽一次（剩{n}次）',
      undoBtn: '⌫ 刪除',
      listenRhythm: '仔細聽節奏模式…',
      tapTurn: '數拍結束後，點擊圓墊重現節奏！',
      tapPad: 'TAP',
      countIn: '準備… {n}',
      calibTitle: '🎧 裝置校正（僅首次）',
      calibDesc: '每台裝置的聲音與觸控延遲都不同。跟著8次喀噠聲點擊，判定會更準確。',
      calibStart: '開始校正',
      calibTapAlong: '跟著喀噠聲點擊！',
      calibDone: '校正完成: {ms}ms — 已套用到判定',
      calibRedo: '🎧 重新校正',
      calibSkip: '跳過（不校正）',
      calibFail: '點擊次數不足。再試一次？',
      resultPerfect: '完美！🎉',
      resultGood: '成功！',
      resultFail: '好可惜…',
      melodyYou: '你的輸入',
      melodyAnswer: '正解',
      rhythmHits: '完美 {p} · 不錯 {g} · 失誤 {m} · 多餘 {e}',
      nextRound: '下一回合 ▶',
      toRhythm: '進入節奏階段 ▶',
      toFinal: '看結果 ▶',
      finalTitle: '聽力檔案',
      melodyLv: '旋律Lv',
      rhythmLv: '節奏Lv',
      totalScore: '總分 {n}分',
      percentileLine: '前{n}%的耳朵（趣味推估）',
      goldLine: '🪙 獲得 +{n} 金幣！',
      streakLine: '連續出席 {n}天',
      titleMaestro: '🏆 大師之耳',
      titleGolden: '✨ 黃金之耳',
      titleTuned: '🎯 調律之耳',
      titleGrowing: '🌿 成長之耳',
      titleSprout: '🌱 新芽之耳',
      share: '分享結果',
      home: '回首頁',
      copied: '已複製到剪貼簿！',
      shareText: '🎹 旋律回聲 — 我的聽力檔案\n{title}\n旋律 Lv {mlv} · 節奏 Lv {rlv} · 總分 {score}\n前{pct}%\n{grid}\nhttps://game.cocy.io/melodyecho/',
      practiceNote: '自由練習 — 不計紀錄・金幣・排行榜',
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
    if (nav.indexOf('zh') === 0) return 'tw';
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
    document.documentElement.lang = l === 'tw' ? 'zh-TW' : l;
  }

  function cycle() {
    var order = ['ko', 'en', 'ja', 'tw'];
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
