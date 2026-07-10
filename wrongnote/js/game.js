// 틀린 음 찾기 — 메인 게임 컨트롤러 (화면 전환 + 재생/마킹/채점/리빌/진단)
(function (global) {
  'use strict';

  var storage = global.WN.storage;
  var scoring = global.WN.scoring;
  var puzzleGen = global.WN.puzzleGen;

  var els = {};
  var engine = null;
  var state = {
    dateStr: null,
    puzzles: [],
    currentIndex: 0,
    markersByPuzzle: [],
    results: [],
    selectedMarkerId: null,
    rafId: null,
    loopStartSec: null
  };
  var markerSeq = 0;

  function qs(id) { return document.getElementById(id); }

  function fmtTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    var m = Math.floor(sec / 60);
    var s = Math.floor(sec % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  function showScreen(name) {
    ['intro', 'play', 'reveal', 'final'].forEach(function (n) {
      qs('screen-' + n).classList.toggle('active', n === name);
    });
  }

  // ---------- 인트로 ----------
  function renderIntro() {
    var streak = storage.getStreak();
    var already = storage.hasPlayedToday();
    var best = storage.getBestScore();
    var todayResult = storage.getTodayResult();

    var html = '';
    html += '<h1 class="wn-title">틀린 음 찾기</h1>';
    html += '<p class="wn-sub">오디오판 틀린그림찾기 — 듣고, 탭하고, 내 귀를 진단받는다</p>';
    html += '<div class="wn-stat-row">';
    html += '<div class="wn-stat"><span class="wn-stat-num">' + streak.count + '</span><span class="wn-stat-label">연속 출석</span></div>';
    html += '<div class="wn-stat"><span class="wn-stat-num">' + best + '</span><span class="wn-stat-label">최고 점수</span></div>';
    html += '</div>';

    if (already && todayResult) {
      html += '<p class="wn-note">오늘 문제는 이미 풀었어요. 다시 도전해도 기록은 갱신되지 않아요.</p>';
      html += '<button id="btn-view-result" class="wn-btn wn-btn-secondary">오늘 결과 다시 보기</button>';
    }
    html += '<button id="btn-start" class="wn-btn wn-btn-primary">오늘의 5문제 시작하기</button>';

    qs('screen-intro').innerHTML = html;
    qs('btn-start').addEventListener('click', startDaily);
    var viewBtn = qs('btn-view-result');
    if (viewBtn) viewBtn.addEventListener('click', function () { showFinalFromSaved(todayResult); });
  }

  function startDaily() {
    state.dateStr = storage.todayString();
    state.puzzles = puzzleGen.generateDaily(state.dateStr, global.WN.songs);
    state.currentIndex = 0;
    state.markersByPuzzle = state.puzzles.map(function () { return []; });
    state.results = [];
    engine = engine || new global.WN.AudioEngine();
    startPuzzle(0);
  }

  // ---------- 플레이 화면 ----------
  function startPuzzle(index) {
    state.currentIndex = index;
    state.selectedMarkerId = null;
    state.loopStartSec = null;
    var puzzle = state.puzzles[index];
    engine.loadPuzzle(puzzle);
    engine.onEnded(onPlaybackEnded);
    renderPlayScreen();
    showScreen('play');
    startTicking();
  }

  function markersOf() { return state.markersByPuzzle[state.currentIndex]; }

  function renderPlayScreen() {
    var puzzle = state.puzzles[state.currentIndex];
    var html = '';
    html += '<div class="wn-play-header">';
    html += '<span class="wn-pill">문제 ' + (state.currentIndex + 1) + ' / 5</span>';
    html += '<span class="wn-pill wn-pill-alt" id="plays-remaining">재생 ' + engine.playsRemaining() + '/3</span>';
    html += '</div>';
    html += '<h2 class="wn-song-title">' + puzzle.song.title_ko + '</h2>';

    html += '<div class="wn-stage" id="wn-stage" aria-label="여기를 탭해서 틀린 부분을 표시하세요">';
    html += '<div class="wn-stage-icon" id="wn-stage-icon">🎵</div>';
    html += '<div class="wn-stage-hint">재생 중 이상하다 싶은 순간에 탭!</div>';
    html += '</div>';

    html += '<div class="wn-ruler-wrap">';
    html += '<div class="wn-time-row"><span id="wn-time-cur">0:00</span><span id="wn-time-total">' + fmtTime(puzzle.totalDurationSec) + '</span></div>';
    html += '<div class="wn-ruler" id="wn-ruler">';
    html += '<div class="wn-ruler-track"></div>';
    html += '<div class="wn-loop-region" id="wn-loop-region" hidden></div>';
    html += renderBubbles(puzzle);
    html += '<div class="wn-playhead" id="wn-playhead"></div>';
    html += '<div class="wn-markers-layer" id="wn-markers-layer"></div>';
    html += '</div>';
    html += '</div>';

    html += '<div class="wn-transport">';
    html += '<button id="btn-playpause" class="wn-btn wn-btn-round">▶</button>';
    html += '<button id="btn-stop" class="wn-btn wn-btn-round wn-btn-ghost">⏮</button>';
    html += '<button id="btn-loop-mark-start" class="wn-btn wn-btn-small">구간 시작</button>';
    html += '<button id="btn-loop-mark-end" class="wn-btn wn-btn-small">구간 끝·반복</button>';
    html += '<button id="btn-loop-clear" class="wn-btn wn-btn-small wn-btn-ghost">반복 해제</button>';
    html += '</div>';

    html += '<div class="wn-marker-popover" id="wn-marker-popover" hidden>';
    html += '<p class="wn-popover-title">이 마커, 어떻게 틀렸나요? (선택사항)</p>';
    html += '<div class="wn-popover-grid">';
    html += '<button class="wn-corr-btn" data-corr="higher">음 높음 ↑</button>';
    html += '<button class="wn-corr-btn" data-corr="lower">음 낮음 ↓</button>';
    html += '<button class="wn-corr-btn" data-corr="early">박자 빠름 «</button>';
    html += '<button class="wn-corr-btn" data-corr="late">박자 느림 »</button>';
    html += '</div>';
    html += '<div class="wn-popover-actions"><button id="btn-marker-delete" class="wn-btn wn-btn-small wn-btn-ghost">마커 삭제</button><button id="btn-marker-close" class="wn-btn wn-btn-small">닫기</button></div>';
    html += '</div>';

    html += '<button id="btn-submit" class="wn-btn wn-btn-primary wn-btn-wide">제출하고 채점하기</button>';

    qs('screen-play').innerHTML = html;
    wirePlayScreen();
    renderMarkers();
  }

  function renderBubbles(puzzle) {
    var total = puzzle.totalDurationSec;
    var html = '';
    puzzle.originalNotes.forEach(function (n) {
      var pct = (n.startSec / total) * 100;
      html += '<div class="wn-bubble" style="left:' + pct.toFixed(2) + '%"></div>';
    });
    return html;
  }

  function wirePlayScreen() {
    qs('btn-playpause').addEventListener('click', togglePlayPause);
    qs('btn-stop').addEventListener('click', function () {
      engine.stop();
      updatePlayheadUI();
      qs('btn-playpause').textContent = '▶';
    });
    qs('wn-stage').addEventListener('click', onStageTap);
    qs('wn-ruler').addEventListener('pointerdown', onRulerScrubStart);
    qs('btn-loop-mark-start').addEventListener('click', function () {
      state.loopStartSec = engine.currentTime();
      flashHint('구간 시작 지정: ' + fmtTime(state.loopStartSec));
    });
    qs('btn-loop-mark-end').addEventListener('click', function () {
      if (state.loopStartSec == null) { flashHint('먼저 "구간 시작"을 눌러주세요'); return; }
      var endSec = engine.currentTime();
      if (endSec <= state.loopStartSec) endSec = state.loopStartSec + 1;
      engine.setLoopRegion(state.loopStartSec, endSec);
      var puzzle = state.puzzles[state.currentIndex];
      var region = qs('wn-loop-region');
      region.hidden = false;
      region.style.left = ((state.loopStartSec / puzzle.totalDurationSec) * 100).toFixed(2) + '%';
      region.style.width = (((endSec - state.loopStartSec) / puzzle.totalDurationSec) * 100).toFixed(2) + '%';
    });
    qs('btn-loop-clear').addEventListener('click', function () {
      engine.clearLoopRegion();
      state.loopStartSec = null;
      qs('wn-loop-region').hidden = true;
    });
    qs('btn-submit').addEventListener('click', submitPuzzle);
    qs('btn-marker-close').addEventListener('click', closePopover);
    qs('btn-marker-delete').addEventListener('click', deleteSelectedMarker);
    var corrBtns = document.querySelectorAll('.wn-corr-btn');
    for (var i = 0; i < corrBtns.length; i++) {
      corrBtns[i].addEventListener('click', function (e) {
        setSelectedMarkerCorrection(e.target.getAttribute('data-corr'));
      });
    }
  }

  var hintTimer = null;
  function flashHint(text) {
    var hint = qs('wn-stage') && qs('wn-stage').querySelector('.wn-stage-hint');
    if (!hint) return;
    var prev = hint.textContent;
    hint.textContent = text;
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.textContent = prev; }, 1400);
  }

  function togglePlayPause() {
    if (engine.isPlaying()) {
      engine.pause();
      qs('btn-playpause').textContent = '▶';
    } else {
      if (engine.playsRemaining() <= 0 && engine.currentTime() <= 0.001) {
        flashHint('재생 3회를 모두 사용했어요. 지금까지 들은 걸로 승부!');
        return;
      }
      engine.play().then(function (ok) {
        if (ok) {
          qs('btn-playpause').textContent = '⏸';
          qs('plays-remaining').textContent = '재생 ' + engine.playsRemaining() + '/3';
        }
      });
    }
  }

  function onPlaybackEnded() {
    var btn = qs('btn-playpause');
    if (btn) btn.textContent = '▶';
  }

  function onStageTap() {
    if (!engine.isPlaying()) {
      flashHint('재생 중에 탭해야 마커가 찍혀요');
      return;
    }
    var t = engine.currentTime();
    var id = 'm' + (++markerSeq);
    markersOf().push({ id: id, timeSec: t, correction: null });
    renderMarkers();
    openPopoverFor(id);
    var icon = qs('wn-stage-icon');
    icon.classList.remove('wn-pulse');
    void icon.offsetWidth;
    icon.classList.add('wn-pulse');
  }

  function onRulerScrubStart(e) {
    var ruler = qs('wn-ruler');
    var rect = ruler.getBoundingClientRect();
    var puzzle = state.puzzles[state.currentIndex];

    function seekFromEvent(ev) {
      var x = (ev.clientX != null ? ev.clientX : (ev.touches && ev.touches[0].clientX)) - rect.left;
      var pct = Math.max(0, Math.min(1, x / rect.width));
      engine.seek(pct * puzzle.totalDurationSec);
      updatePlayheadUI();
    }
    seekFromEvent(e);

    function onMove(ev) { seekFromEvent(ev); }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function renderMarkers() {
    var layer = qs('wn-markers-layer');
    if (!layer) return;
    var puzzle = state.puzzles[state.currentIndex];
    var total = puzzle.totalDurationSec;
    layer.innerHTML = '';
    markersOf().forEach(function (mk) {
      var pin = document.createElement('div');
      pin.className = 'wn-marker-pin' + (mk.correction ? ' wn-marker-pin-labeled' : '');
      pin.style.left = ((mk.timeSec / total) * 100).toFixed(2) + '%';
      pin.dataset.id = mk.id;
      pin.title = fmtTime(mk.timeSec);
      pin.addEventListener('pointerdown', function (e) { startDragMarker(e, mk.id); });
      pin.addEventListener('click', function (e) { e.stopPropagation(); openPopoverFor(mk.id); });
      layer.appendChild(pin);
    });
  }

  function startDragMarker(e, id) {
    e.stopPropagation();
    e.preventDefault();
    var ruler = qs('wn-ruler');
    var rect = ruler.getBoundingClientRect();
    var puzzle = state.puzzles[state.currentIndex];
    var marker = markersOf().find(function (m) { return m.id === id; });
    if (!marker) return;

    function onMove(ev) {
      var x = ev.clientX - rect.left;
      var pct = Math.max(0, Math.min(1, x / rect.width));
      marker.timeSec = pct * puzzle.totalDurationSec;
      renderMarkers();
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function openPopoverFor(id) {
    state.selectedMarkerId = id;
    var pop = qs('wn-marker-popover');
    pop.hidden = false;
  }
  function closePopover() {
    state.selectedMarkerId = null;
    qs('wn-marker-popover').hidden = true;
  }
  function setSelectedMarkerCorrection(corr) {
    var marker = markersOf().find(function (m) { return m.id === state.selectedMarkerId; });
    if (marker) marker.correction = corr;
    renderMarkers();
    closePopover();
  }
  function deleteSelectedMarker() {
    var idx = markersOf().findIndex(function (m) { return m.id === state.selectedMarkerId; });
    if (idx >= 0) markersOf().splice(idx, 1);
    renderMarkers();
    closePopover();
  }

  function startTicking() {
    if (state.rafId) cancelAnimationFrame(state.rafId);
    function tick() {
      if (qs('screen-play') && qs('screen-play').classList.contains('active')) {
        updatePlayheadUI();
        state.rafId = requestAnimationFrame(tick);
      }
    }
    state.rafId = requestAnimationFrame(tick);
  }

  function updatePlayheadUI() {
    var playhead = qs('wn-playhead');
    var curEl = qs('wn-time-cur');
    if (!playhead || !engine) return;
    var puzzle = state.puzzles[state.currentIndex];
    var t = engine.currentTime();
    var pct = puzzle.totalDurationSec > 0 ? Math.min(1, t / puzzle.totalDurationSec) : 0;
    playhead.style.left = (pct * 100).toFixed(2) + '%';
    if (curEl) curEl.textContent = fmtTime(t);
    if (!engine.isPlaying()) {
      var btn = qs('btn-playpause');
      if (btn) btn.textContent = '▶';
    }
  }

  // ---------- 채점 + 리빌 ----------
  function submitPuzzle() {
    engine.pause();
    var puzzle = state.puzzles[state.currentIndex];
    var result = scoring.gradePuzzle(puzzle, markersOf());
    state.results[state.currentIndex] = result;
    renderReveal(puzzle, result);
    showScreen('reveal');
  }

  function renderReveal(puzzle, result) {
    var isLast = state.currentIndex === state.puzzles.length - 1;
    var html = '';
    html += '<h2 class="wn-song-title">정답 공개 · ' + puzzle.song.title_ko + '</h2>';
    html += '<p class="wn-reveal-score">발견 ' + result.found.length + '/' + puzzle.deviations.length
      + ' · 교정보너스 ' + result.found.filter(function (f) { return f.correctionCorrect; }).length
      + ' · 오탐 ' + result.falsePositives.length
      + ' · <strong>+' + result.score + '점</strong></p>';

    html += '<div class="wn-ab-toggle">';
    html += '<button id="btn-ab-performed" class="wn-btn wn-btn-small wn-btn-active">출제본 듣기</button>';
    html += '<button id="btn-ab-original" class="wn-btn wn-btn-small">원곡 듣기</button>';
    html += '<button id="btn-ab-play" class="wn-btn wn-btn-small wn-btn-primary">▶ 재생</button>';
    html += '</div>';

    html += '<div class="wn-ruler-wrap"><div class="wn-ruler wn-ruler-reveal" id="wn-reveal-ruler">';
    html += '<div class="wn-ruler-track"></div>';
    var total = puzzle.totalDurationSec;
    puzzle.originalNotes.forEach(function (n, i) {
      var pct = (n.startSec / total) * 100;
      var dev = puzzle.deviations.find(function (d) { return d.noteIndex === i; });
      var cls = 'wn-bubble';
      if (dev) {
        var f = result.found.find(function (x) { return x.deviation === dev; });
        cls += f ? ' wn-bubble-found' : ' wn-bubble-missed';
      }
      html += '<div class="' + cls + '" style="left:' + pct.toFixed(2) + '%"></div>';
    });
    html += '<div class="wn-playhead" id="wn-reveal-playhead"></div>';
    html += '</div></div>';

    html += '<ul class="wn-dev-list">';
    puzzle.deviations.forEach(function (dev, i) {
      var f = result.found.find(function (x) { return x.deviation === dev; });
      var label = dev.type === 'pitch' ? (dev.direction === 1 ? '음이 높아짐' : '음이 낮아짐') : (dev.direction === 1 ? '박자가 늦어짐' : '박자가 빨라짐');
      var status = f ? (f.correctionCorrect ? '정확히 발견+교정!' : '발견 (교정 미스)') : '놓침';
      html += '<li class="wn-dev-item ' + (f ? 'wn-dev-found' : 'wn-dev-missed') + '">' + (i + 1) + '번 이탈 · ' + label + ' · ' + status + '</li>';
    });
    if (result.falsePositives.length) {
      html += '<li class="wn-dev-item wn-dev-fp">오탐 마커 ' + result.falsePositives.length + '개 (실제 이탈이 없는 곳을 표시함)</li>';
    }
    html += '</ul>';

    html += '<button id="btn-next-puzzle" class="wn-btn wn-btn-primary wn-btn-wide">' + (isLast ? '최종 결과 보기' : '다음 문제 ▶') + '</button>';

    qs('screen-reveal').innerHTML = html;

    var mode = 'performed';
    qs('btn-ab-performed').addEventListener('click', function () { setAbMode('performed'); });
    qs('btn-ab-original').addEventListener('click', function () { setAbMode('original'); });
    function setAbMode(m) {
      mode = m;
      qs('btn-ab-performed').classList.toggle('wn-btn-active', m === 'performed');
      qs('btn-ab-original').classList.toggle('wn-btn-active', m === 'original');
    }
    qs('btn-ab-play').addEventListener('click', function () {
      var notesTuples = (mode === 'performed' ? puzzle.performedNotes : puzzle.originalNotes).map(function (n) { return [n.pitch, n.dur]; });
      var tempPuzzle = { song: puzzle.song, performedNotes: (mode === 'performed' ? puzzle.performedNotes : puzzle.originalNotes) };
      engine.loadPuzzle(tempPuzzle);
      engine._playsRemaining = 999; // 리빌 청취는 3회 제한과 무관 (이미 채점 끝난 뒤 자유 청취)
      engine.play();
      tickRevealPlayhead(puzzle.totalDurationSec);
    });

    qs('btn-next-puzzle').addEventListener('click', function () {
      if (isLast) { finishDaily(); }
      else { startPuzzle(state.currentIndex + 1); }
    });
  }

  function tickRevealPlayhead(totalDur) {
    function tick() {
      var ph = qs('wn-reveal-playhead');
      if (!ph || !qs('screen-reveal').classList.contains('active')) return;
      var pct = totalDur > 0 ? Math.min(1, engine.currentTime() / totalDur) : 0;
      ph.style.left = (pct * 100).toFixed(2) + '%';
      if (engine.isPlaying()) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // ---------- 최종 진단 ----------
  function finishDaily() {
    var ratio = scoring.totalRatio(state.results);
    var earAge = scoring.earAgeFromRatio(ratio);
    var percentile = scoring.fakePercentile(ratio);
    var emojiGrid = scoring.buildEmojiGrid(state.results);
    var totalScore = state.results.reduce(function (s, r) { return s + r.score; }, 0);

    var streak = storage.saveTodayResult({
      totalScore: totalScore,
      ratio: ratio,
      earAge: earAge,
      percentile: percentile,
      emojiGrid: emojiGrid,
      puzzleResults: state.results.map(function (r) { return { score: r.score, maxScore: r.maxScore }; })
    });

    renderFinal({ totalScore: totalScore, ratio: ratio, earAge: earAge, percentile: percentile, emojiGrid: emojiGrid, streak: streak.count });
    showScreen('final');
  }

  function showFinalFromSaved(saved) {
    var streak = storage.getStreak();
    renderFinal({
      totalScore: saved.totalScore, ratio: saved.ratio, earAge: saved.earAge,
      percentile: saved.percentile, emojiGrid: saved.emojiGrid, streak: streak.count
    });
    showScreen('final');
  }

  function renderFinal(data) {
    var html = '';
    html += '<h2 class="wn-song-title">오늘의 귀 진단</h2>';
    html += '<div class="wn-diagnosis-card">';
    html += '<div class="wn-ear-age">' + data.earAge + '<span class="wn-ear-age-unit">세</span></div>';
    html += '<p class="wn-percentile">상위 ' + data.percentile + '% 귀 (재미용 추정치)</p>';
    // split('')는 서로게이트 페어(🟡 등 BMP 밖 이모지)를 반쪽씩 잘라 깨뜨리므로 Array.from으로 코드포인트 단위 분리
    html += '<div class="wn-emoji-grid">' + Array.from(data.emojiGrid).join(' ') + '</div>';
    html += '<p class="wn-total-score">총점 ' + data.totalScore + '점 · 연속 출석 ' + data.streak + '일</p>';
    html += '</div>';
    html += '<button id="btn-share" class="wn-btn wn-btn-primary wn-btn-wide">결과 공유하기</button>';
    html += '<button id="btn-home" class="wn-btn wn-btn-secondary wn-btn-wide">처음으로</button>';
    html += '<p class="wn-share-status" id="wn-share-status"></p>';

    qs('screen-final').innerHTML = html;

    qs('btn-share').addEventListener('click', function () {
      var text = scoring.buildShareText({
        dateStr: state.dateStr || storage.todayString(),
        earAge: data.earAge,
        percentile: data.percentile,
        emojiGrid: data.emojiGrid
      });
      shareResult(text);
    });
    qs('btn-home').addEventListener('click', function () {
      renderIntro();
      showScreen('intro');
    });
  }

  function shareResult(text) {
    var status = qs('wn-share-status');
    if (navigator.share) {
      navigator.share({ text: text }).catch(function () { copyToClipboard(text, status); });
    } else {
      copyToClipboard(text, status);
    }
  }

  function copyToClipboard(text, status) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        if (status) status.textContent = '클립보드에 복사됐어요!';
      }).catch(function () {
        if (status) status.textContent = text;
      });
    } else if (status) {
      status.textContent = text;
    }
  }

  // ---------- 부트스트랩 ----------
  function boot() {
    fetch('data/songs.json').then(function (r) { return r.json(); }).then(function (songs) {
      global.WN.songs = songs;
      renderIntro();
      showScreen('intro');
    }).catch(function (err) {
      qs('screen-intro').innerHTML = '<p class="wn-note">곡 데이터를 불러오지 못했어요. 새로고침 해보세요.</p>';
      console.error('songs.json load failed', err);
    });
  }

  // 결정론 검증용 디버그 훅 (콘솔에서 window.WN.debug.puzzleHash('2026-07-10') 호출)
  global.WN = global.WN || {};
  global.WN.debug = {
    puzzleHash: function (dateStr) {
      var puzzles = puzzleGen.generateDaily(dateStr, global.WN.songs);
      return puzzleGen.hashPuzzleSet(puzzles);
    }
  };

  document.addEventListener('DOMContentLoaded', boot);
})(window);
