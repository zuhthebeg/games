// 멜로디 에코 — 동적 피아노 건반 렌더러
// 문제 멜로디의 음역만 잘라 크게 보여준다 (폰에서 키 폭 확보).
// 흰건반 위에 검은건반 오버레이. 탭 시 즉시 발음 + onInput 콜백.
(function (global) {
  'use strict';

  var WHITE_PC = [0, 2, 4, 5, 7, 9, 11];

  // 멜로디 음역 → 표시 범위 계산: 흰건반 경계로 스냅 + 좌우 여유 확장
  // 반환 { lo, hi } (midi, 둘 다 흰건반)
  function displayRange(notes, includeBlack) {
    var lo = Math.min.apply(null, notes);
    var hi = Math.max.apply(null, notes);
    lo -= 1; hi += 1; // 오답 유도 여지: 정답 범위보다 살짝 넓게
    while (WHITE_PC.indexOf(((lo % 12) + 12) % 12) < 0) lo--;
    while (WHITE_PC.indexOf(((hi % 12) + 12) % 12) < 0) hi++;
    // 최소 8흰건반 확보 (너무 좁으면 답 유추가 쉬움 + 비주얼 빈약)
    function whiteCount(a, b) {
      var n = 0;
      for (var m = a; m <= b; m++) if (WHITE_PC.indexOf(m % 12) >= 0) n++;
      return n;
    }
    var expand = true;
    while (whiteCount(lo, hi) < 8) {
      if (expand && lo > 48) lo--; else if (hi < 84) hi++; else if (lo > 48) lo--; else break;
      while (WHITE_PC.indexOf(((lo % 12) + 12) % 12) < 0 && lo > 48) lo--;
      while (WHITE_PC.indexOf(((hi % 12) + 12) % 12) < 0 && hi < 84) hi++;
      expand = !expand;
    }
    return { lo: lo, hi: hi };
  }

  // container에 건반 렌더. opts: { notes, includeBlack, onInput(midi), disabled }
  // 반환 컨트롤러 { setEnabled, highlight(midi, cls), clearHighlights, flash(midi, cls) }
  function render(container, opts) {
    container.innerHTML = '';
    var range = displayRange(opts.notes, opts.includeBlack);
    var whites = [];
    for (var m = range.lo; m <= range.hi; m++) {
      if (WHITE_PC.indexOf(m % 12) >= 0) whites.push(m);
    }

    var kb = document.createElement('div');
    kb.className = 'me-keyboard';
    var enabled = !opts.disabled;
    kb.classList.toggle('disabled', !enabled);
    var keyEls = {}; // midi → el

    function makeKey(midi, isBlack, leftPct, widthPct) {
      var el = document.createElement('button');
      el.type = 'button';
      el.className = isBlack ? 'me-key me-key-black' : 'me-key me-key-white';
      el.dataset.midi = midi;
      el.setAttribute('aria-label', ME.gen.midiToName(midi));
      if (isBlack) {
        el.style.left = leftPct + '%';
        el.style.width = widthPct + '%';
      }
      // C 라벨만 표시 (옥타브 앵커)
      if (!isBlack && midi % 12 === 0) {
        var lbl = document.createElement('span');
        lbl.className = 'me-key-label';
        lbl.textContent = 'C' + (Math.floor(midi / 12) - 1);
        el.appendChild(lbl);
      }
      var handler = function (ev) {
        ev.preventDefault();
        if (!enabled) return;
        ME.audio.playNote(midi);
        el.classList.add('pressed');
        setTimeout(function () { el.classList.remove('pressed'); }, 140);
        if (opts.onInput) opts.onInput(midi);
      };
      el.addEventListener('pointerdown', handler);
      keyEls[midi] = el;
      return el;
    }

    var whiteW = 100 / whites.length;
    whites.forEach(function (midi) {
      kb.appendChild(makeKey(midi, false));
    });
    // 검은건반: 흰건반 인덱스 기준 위치 계산
    if (opts.includeBlack) {
      whites.forEach(function (midi, i) {
        var black = midi + 1;
        if (black > range.hi || ME.gen.isBlackKey(black) === false) return;
        if (whites.indexOf(black) >= 0) return;
        // 다음 흰건반과의 사이에만 존재 (E-F, B-C 사이엔 없음)
        var pc = midi % 12;
        if (pc === 4 || pc === 11) return;
        var left = (i + 1) * whiteW - whiteW * 0.3;
        kb.appendChild(makeKey(black, true, left, whiteW * 0.6));
      });
    }

    container.appendChild(kb);

    return {
      setEnabled: function (v) { enabled = v; kb.classList.toggle('disabled', !v); },
      highlight: function (midi, cls) {
        var el = keyEls[midi];
        if (el) el.classList.add(cls || 'hint');
      },
      clearHighlights: function () {
        Object.keys(keyEls).forEach(function (k) {
          keyEls[k].classList.remove('hint', 'good', 'bad');
        });
      },
      flash: function (midi, cls) {
        var el = keyEls[midi];
        if (!el) return;
        el.classList.add(cls);
        setTimeout(function () { el.classList.remove(cls); }, 350);
      }
    };
  }

  global.ME = global.ME || {};
  global.ME.keyboard = { render: render, displayRange: displayRange };
})(window);
