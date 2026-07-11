// 멜로디 에코 — 게임 플로우 컨트롤러
// intro → (멜로디 8라운드) → (캘리브레이션, 최초 1회) → (리듬 6라운드) → 청음 프로필
(function (global) {
  'use strict';

  var T = function (k, p) { return ME.i18n.t(k, p); };

  var MELODY_ROUNDS = 8;
  var RHYTHM_ROUNDS = 6;
  var START_LEVEL = 3;
  var MELODY_REPLAYS = 1;

  var S = null; // 세션 상태

  function qs(id) { return document.getElementById(id); }

  function screen(name) {
    ['intro', 'play', 'calib', 'final'].forEach(function (n) {
      qs('screen-' + n).classList.toggle('active', n === name);
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  // ---------- 인트로 ----------
  function renderIntro() {
    var bestLv = ME.storage.getBestLv();
    var streak = ME.storage.getStreak();
    var played = ME.storage.hasPlayedToday();
    var el = qs('screen-intro');
    var html = '';
    html += '<div class="me-topbar"><button id="btn-lang" class="me-lang" aria-label="language">🌐 ' + ME.i18n.lang().toUpperCase() + '</button></div>';
    html += '<h1 class="me-title">🎹 ' + T('title') + '</h1>';
    html += '<p class="me-sub">' + T('sub') + '</p>';
    html += '<div class="me-stat-row">';
    html += '<div class="me-stat"><span class="me-stat-num">' + (bestLv.melody || '-') + '</span><span class="me-stat-label">' + T('statBestMelody') + '</span></div>';
    html += '<div class="me-stat"><span class="me-stat-num">' + (bestLv.rhythm || '-') + '</span><span class="me-stat-label">' + T('statBestRhythm') + '</span></div>';
    html += '<div class="me-stat"><span class="me-stat-num">' + streak.count + '</span><span class="me-stat-label">' + T('statStreak') + '</span></div>';
    html += '</div>';
    html += '<p class="me-note">' + T('introHow') + '</p>';
    if (played) {
      html += '<p class="me-note me-note-done">' + T('doneToday') + '</p>';
      html += '<button id="btn-view-result" class="me-btn me-btn-secondary me-btn-wide">' + T('viewResult') + '</button>';
    } else {
      html += '<button id="btn-start-daily" class="me-btn me-btn-primary me-btn-wide">' + T('startDaily') + '</button>';
    }
    html += '<button id="btn-start-practice" class="me-btn me-btn-secondary me-btn-wide">' + T('startPractice') + '</button>';
    if (ME.storage.getCalibOffset() != null) {
      html += '<button id="btn-recalib" class="me-btn me-btn-ghost me-btn-wide">' + T('calibRedo') + '</button>';
    }
    html += '<p class="me-series">' + T('seriesLink') + '</p>';
    el.innerHTML = html;

    qs('btn-lang').addEventListener('click', function () { ME.i18n.cycle(); renderIntro(); });
    if (qs('btn-start-daily')) qs('btn-start-daily').addEventListener('click', function () { startSession('daily'); });
    if (qs('btn-view-result')) qs('btn-view-result').addEventListener('click', function () {
      var r = ME.storage.getTodayResult();
      if (r) renderFinalFromResult(r, { replay: true });
    });
    qs('btn-start-practice').addEventListener('click', function () { startSession('practice'); });
    if (qs('btn-recalib')) qs('btn-recalib').addEventListener('click', function () {
      renderCalib(function () { renderIntro(); screen('intro'); });
      screen('calib');
    });
    screen('intro');
  }

  // ---------- 세션 ----------
  function startSession(mode) {
    var seed = mode === 'daily'
      ? 'melodyecho-' + ME.storage.todayString()
      : 'practice-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
    S = {
      mode: mode,
      rng: ME.rng.createRng(seed),
      phase: 'melody',
      round: 0,
      level: START_LEVEL,
      melodyRounds: [],
      rhythmRounds: [],
      melodyScore: 0,
      rhythmScore: 0,
      // 현재 라운드 상태
      answer: null,
      inputs: [],
      replaysLeft: 0,
      kb: null,
      taps: [],
      patStart: null,
      inputOpen: false,
      roundToken: 0
    };
    ME.audio.ensureStarted().then(function () {
      startMelodyRound();
    });
  }

  // ---------- 멜로디 페이즈 ----------
  function startMelodyRound() {
    S.phase = 'melody';
    S.round++;
    S.roundToken++;
    S.answer = ME.gen.generateMelody(S.rng, S.level);
    S.inputs = [S.answer.notes[0]];
    S.replaysLeft = MELODY_REPLAYS;

    var el = qs('screen-play');
    var html = '';
    html += renderPills(T('phaseMelody'), S.round, MELODY_ROUNDS);
    if (S.mode === 'practice') html += '<p class="me-practice-tag">' + T('practiceNote') + '</p>';
    html += '<p class="me-status" id="me-status">' + T('listenFirst') + '</p>';
    html += '<div class="me-slots" id="me-slots"></div>';
    html += '<div class="me-answer-row" id="me-answer-row"></div>';
    html += '<div class="me-kb-wrap" id="me-kb"></div>';
    html += '<div class="me-actions">';
    html += '<button id="btn-replay" class="me-btn me-btn-secondary" disabled>' + T('replayBtn', { n: S.replaysLeft }) + '</button>';
    html += '<button id="btn-undo" class="me-btn me-btn-ghost" disabled>' + T('undoBtn') + '</button>';
    html += '</div>';
    html += '<div class="me-roundresult" id="me-roundresult"></div>';
    el.innerHTML = html;
    screen('play');

    renderSlots();

    // 검은건반은 항상 렌더 — 안 그리면 저레벨(다이어토닉) 건반이 흰 박스 나열로만 보인다.
    // 다이어토닉 멜로디에서 검은건반 탭 = 그냥 오답 입력 (실제 피아노와 동일).
    S.kb = ME.keyboard.render(qs('me-kb'), {
      notes: S.answer.notes,
      includeBlack: true,
      disabled: true,
      onInput: onMelodyInput
    });
    S.kb.highlight(S.answer.notes[0], 'hint');

    qs('btn-replay').addEventListener('click', function () {
      if (S.replaysLeft <= 0) return;
      S.replaysLeft--;
      qs('btn-replay').textContent = T('replayBtn', { n: S.replaysLeft });
      qs('btn-replay').disabled = true;
      qs('btn-undo').disabled = true;
      S.kb.setEnabled(false);
      playCurrentMelody();
    });
    qs('btn-undo').addEventListener('click', function () {
      if (S.inputs.length > 1) {
        S.inputs.pop();
        renderSlots();
      }
    });

    setTimeout(playCurrentMelody, 600);
  }

  function playCurrentMelody() {
    qs('me-status').textContent = T('listenFirst');
    ME.audio.playMelody(S.answer, {
      onNote: function (i) {
        var slots = qs('me-slots');
        if (!slots) return;
        var cells = slots.children;
        for (var c = 0; c < cells.length; c++) cells[c].classList.toggle('playing', c === i);
      },
      onDone: function () {
        var slots = qs('me-slots');
        if (slots) for (var c = 0; c < slots.children.length; c++) slots.children[c].classList.remove('playing');
        var st = qs('me-status');
        if (!st) return;
        st.textContent = T('yourTurn');
        S.kb.setEnabled(true);
        qs('btn-undo').disabled = false;
        if (S.replaysLeft > 0) qs('btn-replay').disabled = false;
      }
    });
  }

  function renderSlots() {
    var el = qs('me-slots');
    if (!el) return;
    var html = '';
    for (var i = 0; i < S.answer.notes.length; i++) {
      var filled = i < S.inputs.length;
      var cls = 'me-slot' + (filled ? ' filled' : '') + (i === 0 ? ' given' : '');
      var label = filled ? esc(ME.gen.midiToName(S.inputs[i])) : '';
      html += '<div class="' + cls + '">' + label + '</div>';
    }
    el.innerHTML = html;
  }

  function onMelodyInput(midi) {
    if (S.inputs.length >= S.answer.notes.length) return;
    // 선입력된 첫 음을 다시 쳐보는 건 오답이 아니다(앵커 확인용) — 입력으로 넣지 않는다.
    // 단, 정답 2번째 음이 첫 음과 같은 멜로디면 그대로 정상 입력으로 받는다.
    if (S.inputs.length === 1 && midi === S.answer.notes[0] && S.answer.notes[1] !== S.answer.notes[0]) return;
    S.inputs.push(midi);
    renderSlots();
    if (S.inputs.length === S.answer.notes.length) {
      S.kb.setEnabled(false);
      qs('btn-undo').disabled = true;
      qs('btn-replay').disabled = true;
      setTimeout(gradeMelodyRound, 350);
    }
  }

  function gradeMelodyRound() {
    var g = ME.scoring.gradeMelody(S.answer.notes, S.inputs);
    var usedReplay = S.replaysLeft < MELODY_REPLAYS;
    var score = ME.scoring.melodyRoundScore(S.level, g.allCorrect, g.numCorrect, S.answer.notes.length, usedReplay);
    S.melodyScore += score;
    S.melodyRounds.push({ level: S.level, success: g.allCorrect, score: score });

    // 슬롯 컬러링
    var slots = qs('me-slots').children;
    for (var i = 0; i < slots.length; i++) {
      slots[i].classList.add(g.correct[i] ? 'good' : 'bad');
    }
    if (g.allCorrect) {
      ME.audio.jingleSuccess();
    } else {
      ME.audio.jingleFail();
      // 정답 노출 + 1.2초 후 정답 멜로디 자동 재생(건반 하이라이트)
      var ans = S.answer.notes.map(function (m) { return esc(ME.gen.midiToName(m)); }).join(' ');
      qs('me-answer-row').innerHTML = '<span class="me-answer-label">' + T('melodyAnswer') + ':</span> ' + ans;
      // 라운드 토큰 가드: 유저가 1.2초 안에 다음 라운드로 넘어가면 스테일 재생이
      // 새 라운드의 재생 타이머를 지워버린다 (clearTimers 공유) — 반드시 스킵.
      var token = S.roundToken;
      var staleAnswer = S.answer;
      setTimeout(function () {
        if (!S || S.roundToken !== token) return;
        ME.audio.playMelody(staleAnswer, {
          onNote: function (i2) { S.kb.flash(staleAnswer.notes[i2], 'good'); }
        });
      }, 1200);
    }

    var st = qs('me-status');
    st.textContent = g.allCorrect ? (usedReplay ? T('resultGood') : T('resultPerfect')) : T('resultFail');
    var prevLevel = S.level;
    S.level = ME.scoring.nextLevel(S.level, g.allCorrect);

    var rr = qs('me-roundresult');
    var isLast = S.round >= MELODY_ROUNDS;
    rr.innerHTML = '<div class="me-scoreline">+' + score + ' · Lv ' + prevLevel + ' → ' + S.level + '</div>' +
      '<button id="btn-next" class="me-btn me-btn-primary me-btn-wide">' + (isLast ? T('toRhythm') : T('nextRound')) + '</button>';
    qs('btn-next').addEventListener('click', function () {
      ME.audio.stopAll();
      if (isLast) beginRhythmPhase();
      else startMelodyRound();
    });
  }

  // ---------- 캘리브레이션 ----------
  function renderCalib(onDone) {
    var el = qs('screen-calib');
    var html = '';
    html += '<h2 class="me-title-sm">' + T('calibTitle') + '</h2>';
    html += '<p class="me-sub">' + T('calibDesc') + '</p>';
    html += '<div class="me-pad-wrap"><button id="calib-pad" class="me-pad" disabled>' + T('tapPad') + '</button></div>';
    html += '<p class="me-status" id="calib-status"></p>';
    html += '<div class="me-actions">';
    html += '<button id="btn-calib-start" class="me-btn me-btn-primary">' + T('calibStart') + '</button>';
    html += '<button id="btn-calib-skip" class="me-btn me-btn-ghost">' + T('calibSkip') + '</button>';
    html += '</div>';
    el.innerHTML = html;

    var taps = [];
    var clickTimes = null;

    qs('btn-calib-start').addEventListener('click', function () {
      ME.audio.ensureStarted().then(function () {
        taps = [];
        qs('calib-status').textContent = T('calibTapAlong');
        qs('calib-pad').disabled = false;
        qs('btn-calib-start').disabled = true;
        clickTimes = ME.audio.startCalibration({
          onClick: function (n) {
            var pad = qs('calib-pad');
            if (pad) { pad.classList.add('pulse'); setTimeout(function () { pad.classList.remove('pulse'); }, 120); }
          },
          onDone: function () {
            qs('calib-pad').disabled = true;
            qs('btn-calib-start').disabled = false;
            // 각 탭을 최근접 클릭에 매칭 (±300ms), 첫 2클릭은 워밍업으로 제외
            var offsets = [];
            taps.forEach(function (t) {
              var best = null, bestErr = Infinity;
              for (var i = 2; i < clickTimes.length; i++) {
                var err = t - clickTimes[i];
                if (Math.abs(err) < Math.abs(bestErr)) { bestErr = err; best = i; }
              }
              if (best != null && Math.abs(bestErr) <= 0.3) offsets.push(bestErr);
            });
            if (offsets.length < 4) {
              qs('calib-status').textContent = T('calibFail');
              return;
            }
            offsets.sort(function (a, b) { return a - b; });
            var median = offsets[Math.floor(offsets.length / 2)];
            ME.storage.setCalibOffset(median);
            qs('calib-status').textContent = T('calibDone', { ms: Math.round(median * 1000) });
            setTimeout(onDone, 900);
          }
        });
      });
    });

    qs('calib-pad').addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      taps.push(ME.audio.now());
      var pad = qs('calib-pad');
      pad.classList.add('hit');
      setTimeout(function () { pad.classList.remove('hit'); }, 100);
    });

    qs('btn-calib-skip').addEventListener('click', function () {
      if (ME.storage.getCalibOffset() == null) ME.storage.setCalibOffset(0);
      onDone();
    });
  }

  function beginRhythmPhase() {
    S.phase = 'rhythm';
    S.round = 0;
    S.level = START_LEVEL;
    if (ME.storage.getCalibOffset() == null) {
      renderCalib(function () { startRhythmRound(); });
      screen('calib');
    } else {
      startRhythmRound();
    }
  }

  // ---------- 리듬 페이즈 ----------
  function startRhythmRound() {
    S.round++;
    S.roundToken++;
    S.answer = ME.gen.generateRhythm(S.rng, S.level);
    S.taps = [];
    S.patStart = null;
    S.inputOpen = false;

    var el = qs('screen-play');
    var html = '';
    html += renderPills(T('phaseRhythm'), S.round, RHYTHM_ROUNDS);
    if (S.mode === 'practice') html += '<p class="me-practice-tag">' + T('practiceNote') + '</p>';
    html += '<p class="me-status" id="me-status">' + T('listenRhythm') + '</p>';
    html += '<div class="me-rhythm-grid" id="me-rgrid"></div>';
    html += '<div class="me-count" id="me-count"></div>';
    html += '<div class="me-pad-wrap"><button id="rhythm-pad" class="me-pad" disabled>' + T('tapPad') + '</button></div>';
    html += '<div class="me-roundresult" id="me-roundresult"></div>';
    el.innerHTML = html;
    screen('play');

    renderRhythmGrid();

    qs('rhythm-pad').addEventListener('pointerdown', function (ev) {
      ev.preventDefault();
      if (!S.inputOpen || S.patStart == null) return;
      var t = ME.audio.now() - S.patStart;
      S.taps.push(t);
      var pad = qs('rhythm-pad');
      pad.classList.add('hit');
      setTimeout(function () { pad.classList.remove('hit'); }, 100);
      addTapMark(t);
    });

    setTimeout(playRhythmListen, 600);
  }

  function renderRhythmGrid() {
    var el = qs('me-rgrid');
    var html = '<div class="me-rtrack">';
    for (var b = 0; b < S.answer.beats; b++) {
      html += '<div class="me-rbeat' + (b % 4 === 0 ? ' bar' : '') + '"></div>';
    }
    S.answer.onsets.forEach(function (pos, i) {
      var pct = (pos / S.answer.beats) * 100;
      html += '<div class="me-ronset" id="me-ronset-' + i + '" style="left:' + pct + '%"></div>';
    });
    html += '<div class="me-rtaps" id="me-rtaps"></div>';
    html += '</div>';
    el.innerHTML = html;
  }

  function addTapMark(tSec) {
    var spb = 60 / S.answer.bpm;
    var beat = tSec / spb;
    if (beat < -0.3 || beat > S.answer.beats + 0.3) return;
    var wrap = qs('me-rtaps');
    if (!wrap) return;
    var m = document.createElement('div');
    m.className = 'me-rtap';
    m.style.left = Math.max(0, Math.min(100, (beat / S.answer.beats) * 100)) + '%';
    wrap.appendChild(m);
  }

  function playRhythmListen() {
    qs('me-status').textContent = T('listenRhythm');
    ME.audio.playRhythm(S.answer, {
      onCount: function (n) { var c = qs('me-count'); if (c) c.textContent = (n + 1) + ''; },
      onOnset: function (i) {
        var d = qs('me-ronset-' + i);
        if (d) { d.classList.add('on'); setTimeout(function () { d.classList.remove('on'); }, 180); }
        var c = qs('me-count'); if (c) c.textContent = '';
      },
      onDone: function () {
        var st = qs('me-status');
        if (!st) return;
        st.textContent = T('tapTurn');
        setTimeout(startRhythmInput, 700);
      }
    });
  }

  function startRhythmInput() {
    S.taps = [];
    var tapsEl = qs('me-rtaps');
    if (tapsEl) tapsEl.innerHTML = '';
    S.patStart = ME.audio.startInputPhase(S.answer, {
      onCount: function (n) {
        var c = qs('me-count'); if (c) c.textContent = (n + 1) + '';
        if (n === 3) {
          // 마지막 카운트에서 입력 오픈 (첫 온셋이 0박이라 미리 열어둔다)
          S.inputOpen = true;
          var pad = qs('rhythm-pad'); if (pad) pad.disabled = false;
        }
      },
      onBeat: function (n) { var c = qs('me-count'); if (c && n === 0) c.textContent = ''; },
      onDone: function () {
        S.inputOpen = false;
        var pad = qs('rhythm-pad'); if (pad) pad.disabled = true;
        gradeRhythmRound();
      }
    });
  }

  function gradeRhythmRound() {
    var spb = 60 / S.answer.bpm;
    var calib = ME.storage.getCalibOffset() || 0;
    var onsetTimes = S.answer.onsets.map(function (b) { return b * spb; });
    var patEnd = S.answer.beats * spb;
    // 카운트인 중 성급한 탭 / 종료 뒤 잔탭은 판정 대상에서 제외 (억울한 오탐 방지)
    var tapTimes = S.taps.map(function (t) { return t - calib; })
      .filter(function (t) { return t >= -0.25 && t <= patEnd + 0.3; });
    var g = ME.scoring.gradeRhythm(onsetTimes, tapTimes);
    var score = ME.scoring.rhythmRoundScore(S.level, g);
    S.rhythmScore += score;
    S.rhythmRounds.push({ level: S.level, success: g.allHit, score: score });

    if (g.allHit) ME.audio.jingleSuccess(); else ME.audio.jingleFail();

    var perfect = g.hits.filter(function (h) { return h.grade === 'perfect'; }).length;
    var good = g.hits.length - perfect;

    var st = qs('me-status');
    st.textContent = g.allHit ? (g.allPerfect ? T('resultPerfect') : T('resultGood')) : T('resultFail');
    var prevLevel = S.level;
    S.level = ME.scoring.nextLevel(S.level, g.allHit);

    var rr = qs('me-roundresult');
    var isLast = S.round >= RHYTHM_ROUNDS;
    rr.innerHTML = '<div class="me-scoreline">' +
      T('rhythmHits', { p: perfect, g: good, m: g.misses, e: g.extras }) +
      '<br>+' + score + ' · Lv ' + prevLevel + ' → ' + S.level + '</div>' +
      '<button id="btn-next" class="me-btn me-btn-primary me-btn-wide">' + (isLast ? T('toFinal') : T('nextRound')) + '</button>';
    qs('btn-next').addEventListener('click', function () {
      ME.audio.stopAll();
      if (isLast) finishSession();
      else startRhythmRound();
    });
  }

  // ---------- 최종 ----------
  function finishSession() {
    var melodyLv = S.melodyRounds.length ? S.melodyRounds[S.melodyRounds.length - 1].level + (S.melodyRounds[S.melodyRounds.length - 1].success ? 1 : -1) : START_LEVEL;
    melodyLv = Math.max(1, Math.min(20, melodyLv));
    var rhythmLv = S.level; // 마지막 조정 반영값
    var totalScore = S.melodyScore + S.rhythmScore;
    var result = {
      mode: S.mode,
      melodyLv: melodyLv,
      rhythmLv: rhythmLv,
      totalScore: totalScore,
      percentile: ME.scoring.fakePercentile(totalScore),
      titleKey: ME.scoring.profileTitleKey(melodyLv, rhythmLv),
      grid: ME.scoring.emojiGrid(S.melodyRounds, S.rhythmRounds),
      gold: 0
    };

    if (S.mode === 'daily' && !ME.storage.hasPlayedToday()) {
      result.gold = 10 + Math.min(50, Math.round(totalScore / 10));
      var streak = ME.storage.saveTodayResult(result);
      result.streak = streak.count;
      try { if (typeof SharedWallet !== 'undefined' && SharedWallet._initialized) SharedWallet.addGold(result.gold); } catch (e) {}
      try { if (typeof GameRankings !== 'undefined') GameRankings.submit('melodyecho', { score: totalScore }); } catch (e) {}
    }

    renderFinalFromResult(result, {});
  }

  function renderFinalFromResult(result, opts) {
    var el = qs('screen-final');
    var html = '';
    html += '<h2 class="me-title-sm">' + T('finalTitle') + '</h2>';
    html += '<div class="me-profile-title">' + T(result.titleKey) + '</div>';
    html += '<div class="me-stat-row">';
    html += '<div class="me-stat"><span class="me-stat-num">' + result.melodyLv + '</span><span class="me-stat-label">🎹 ' + T('melodyLv') + '</span></div>';
    html += '<div class="me-stat"><span class="me-stat-num">' + result.rhythmLv + '</span><span class="me-stat-label">🥁 ' + T('rhythmLv') + '</span></div>';
    html += '</div>';
    html += '<p class="me-final-line">' + T('totalScore', { n: result.totalScore }) + ' · ' + T('percentileLine', { n: result.percentile }) + '</p>';
    html += '<pre class="me-grid">' + esc(result.grid || '') + '</pre>';
    if (result.gold) html += '<p class="me-gold">' + T('goldLine', { n: result.gold }) + '</p>';
    if (result.streak) html += '<p class="me-final-line">' + T('streakLine', { n: result.streak }) + '</p>';
    if (result.mode === 'practice') html += '<p class="me-practice-tag">' + T('practiceNote') + '</p>';
    html += '<button id="btn-share" class="me-btn me-btn-primary me-btn-wide">' + T('share') + '</button>';
    html += '<p class="me-share-status" id="me-share-status"></p>';
    html += '<button id="btn-home" class="me-btn me-btn-secondary me-btn-wide">' + T('home') + '</button>';
    el.innerHTML = html;
    screen('final');

    qs('btn-share').addEventListener('click', function () {
      var text = T('shareText', {
        title: T(result.titleKey),
        mlv: result.melodyLv,
        rlv: result.rhythmLv,
        score: result.totalScore,
        pct: result.percentile,
        grid: result.grid || ''
      });
      var status = qs('me-share-status');
      if (navigator.share) {
        navigator.share({ text: text }).catch(function () { copyText(text, status); });
      } else {
        copyText(text, status);
      }
    });
    qs('btn-home').addEventListener('click', function () { renderIntro(); });
  }

  function copyText(text, statusEl) {
    var done = function () { if (statusEl) statusEl.textContent = T('copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    } else {
      fallbackCopy(text); done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(ta);
  }

  function renderPills(phaseName, round, total) {
    return '<div class="me-pills">' +
      '<span class="me-pill me-pill-phase">' + phaseName + '</span>' +
      '<span class="me-pill">' + T('roundPill', { n: round, total: total }) + '</span>' +
      '<span class="me-pill me-pill-lv">' + T('levelPill', { n: S.level }) + '</span>' +
      '</div>';
  }

  // ---------- E2E 훅 (헤드리스 검증용, 게임플레이엔 미사용) ----------
  function _state() {
    if (!S) return null;
    return {
      phase: S.phase,
      round: S.round,
      level: S.level,
      answerNotes: S.answer && S.answer.notes ? S.answer.notes.slice() : null,
      answerOnsets: S.answer && S.answer.onsets ? S.answer.onsets.slice() : null,
      bpm: S.answer ? S.answer.bpm : null,
      patStart: S.patStart,
      inputOpen: S.inputOpen,
      melodyScore: S.melodyScore,
      rhythmScore: S.rhythmScore
    };
  }

  function _testTap(tSec) {
    if (S) S.taps.push(tSec);
  }

  // ---------- 부트스트랩 ----------
  document.addEventListener('DOMContentLoaded', function () {
    try { if (typeof SharedWallet !== 'undefined' && SharedWallet.init && !SharedWallet._initialized) SharedWallet.init(); } catch (e) {}
    try { if (typeof GameRankings !== 'undefined') GameRankings.injectNavButton('melodyecho'); } catch (e) {}
    document.documentElement.lang = ME.i18n.lang();
    renderIntro();
  });

  global.ME = global.ME || {};
  global.ME.game = { _state: _state, _testTap: _testTap };
})(window);
