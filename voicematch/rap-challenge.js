// The rap challenge is independent of VoiceMatch analysis, accounts and storage.
const PROMPTS = [
  ['골목', '네온'], ['새벽', '우산'], ['옥상', '종이배'], ['눈송이', '버스'],
  ['노을', '운동화'], ['첫차', '달빛'], ['파도', '모래성'], ['창문', '손편지'],
  ['별자리', '지하철'], ['빗방울', '전등'], ['시계', '나침반'], ['대문', '바람개비'],
  ['자전거', '신호등'], ['가로등', '잠수함'], ['분수', '귤껍질'], ['구름', '책갈피'],
];
const BEAT_MS = 600; // 100 BPM, 4/4
const CUE_MS = BEAT_MS * 4;
const TAKE_MS = BEAT_MS * 16;

export function dailyPrompts(now = Date.now()) {
  const day = Math.floor((now + 9 * 3_600_000) / 86_400_000);
  return [...PROMPTS[((day % PROMPTS.length) + PROMPTS.length) % PROMPTS.length]];
}

// Hints on the common vowel tail, not a pronunciation or performance score.
export function pairs(text) {
  if (typeof text !== 'string' || text.length > 800) return [];
  const ends = text.normalize('NFC').split(/\r\n|\r|\n/, 4).map(line => {
    const last = line.replace(/[\s\p{P}]+$/u, '').split(/\s+/u).at(-1);
    if (!/^[가-힣]{2,}$/u.test(last ?? '')) return null;
    return { last, vowels: [...last].map(s => Math.floor((s.charCodeAt(0) - 0xac00) / 28) % 21) };
  });
  const found = [];
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) {
    const a = ends[i], b = ends[j];
    if (!a || !b || a.last === b.last) continue;
    let n = 0;
    while (n < Math.min(a.vowels.length, b.vowels.length) && a.vowels.at(-1-n) === b.vowels.at(-1-n)) n++;
    if (n >= 2) found.push([i+1, j+1, n]);
  }
  return found;
}

function cueBuffer(ctx) {
  const rate = ctx.sampleRate;
  const buffer = ctx.createBuffer(1, Math.round(rate * CUE_MS / 1000), rate);
  const out = buffer.getChannelData(0);
  for (let beat = 0; beat < 4; beat++) {
    const from = Math.round(rate * beat * BEAT_MS / 1000);
    const frequency = beat === 0 ? 880 : 660;
    for (let i = 0; i < rate * 0.055; i++) {
      const sec = i / rate;
      out[from + i] = 0.13 * Math.sin(2 * Math.PI * frequency * sec) * Math.min(sec / 0.005, 1) * Math.exp(-sec * 75);
    }
  }
  return buffer;
}

function releaseTracks(stream) {
  for (const track of stream?.getTracks() ?? []) track.stop();
}

export function mountRapChallenge() {
  const node = name => document.getElementById('vm-rap-' + name);
  const entry = node('entry'), open = node('open'), dialog = node('dialog'), back = node('close');
  if (typeof dialog?.showModal !== 'function') return;
  const [action, status, beat, audio, lyrics, hints] = ['action', 'status', 'beat', 'audio', 'lyrics', 'hints'].map(node);
  const defaultStatus = '카운트인 4번 뒤에 녹음해요. 4마디를 채우거나 먼저 멈춰도 돼요.';
  let attempt, playbackUrl;

  const current = a => a === attempt && dialog.open;
  function releaseCue(a) {
    if (a.source) {
      a.source.onended = null;
      try { a.source.stop(); } catch {}
      a.source = null;
    }
    if (a.context) {
      try { a.context.close().catch(() => {}); } catch {}
      a.context = null;
    }
  }
  function cancelAttempt() {
    if (!attempt) return;
    const a = attempt;
    attempt = null; // Invalidate callbacks before stopping the recorder or sound.
    clearTimeout(a.timer);
    releaseCue(a);
    try { if (a.recorder?.state === 'recording') a.recorder.stop(); } catch {}
    releaseTracks(a.stream);
    a.stream = null;
    a.chunks.length = 0;
  }
  function clearPlayback() {
    if (!playbackUrl) return;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio.hidden = true;
    URL.revokeObjectURL(playbackUrl);
    playbackUrl = null;
  }
  function render(message, label, enabled = true) {
    status.textContent = message;
    beat.hidden = true;
    action.textContent = label;
    // Keep the button focused during countdown and finalization, but ignore clicks.
    action.setAttribute('aria-disabled', String(!enabled));
  }
  function dismiss() {
    cancelAttempt();
    clearPlayback();
    lyrics.value = '';
    hints.textContent = '';
    if (dialog.open) dialog.close();
  }
  function fail(a, message = '녹음하지 못했어요. 다시 시도해 주세요.') {
    if (!current(a)) return;
    cancelAttempt();
    render(message, '다시 시작');
  }
  function finish(a) {
    if (!current(a) || a.phase !== 'recording') return;
    a.phase = 'finishing';
    clearTimeout(a.timer);
    render('녹음을 정리하고 있어요.', '잠시만요', false);
    a.timer = setTimeout(() => fail(a), 1500);
    try { a.recorder.stop(); } catch { fail(a); }
    releaseTracks(a.stream);
    a.stream = null;
  }
  function record(a) {
    if (!current(a)) return;
    releaseCue(a);
    try {
      const recorder = a.recorder = new MediaRecorder(a.stream);
      recorder.addEventListener('error', () => fail(a));
      recorder.addEventListener('dataavailable', ({data}) => {
        if (current(a) && data.size) a.chunks.push(data);
      });
      recorder.addEventListener('stop', () => {
        if (!current(a)) return;
        if (a.phase !== 'finishing') return fail(a);
        if (!a.chunks.length) return fail(a, '소리가 담기지 않았어요. 다시 시도해 주세요.');
        try {
          playbackUrl = URL.createObjectURL(new Blob(a.chunks, {type: a.chunks[0].type || recorder.mimeType}));
        } catch { return fail(a); }
        cancelAttempt();
        audio.src = playbackUrl;
        audio.hidden = false;
        render('녹음했어요. 아래에서 들어볼 수 있어요.', '다시 시작');
      });
      recorder.start();
      a.phase = 'recording';
      render('녹음 중 · 최대 4마디', '녹음 멈추기');
      const started = performance.now();
      function markBar() {
        if (!current(a)) return;
        const elapsed = performance.now() - started;
        if (elapsed >= TAKE_MS) return finish(a);
        const bar = Math.floor(elapsed / CUE_MS) + 1;
        beat.textContent = `${bar} / 4마디`;
        beat.hidden = false;
        a.timer = setTimeout(markBar, Math.max(1, bar * CUE_MS - elapsed));
      }
      markBar();
    } catch { fail(a); }
  }
  function countIn(a) {
    a.phase = 'countin';
    render('준비 · 카운트인', '카운트인 중', false);
    let soundDone = true, visualDone = false;
    try {
      if (a.context?.state === 'running') {
        const source = a.source = a.context.createBufferSource();
        source.buffer = cueBuffer(a.context);
        source.connect(a.context.destination);
        source.onended = () => {
          soundDone = true;
          if (visualDone && current(a)) { clearTimeout(a.timer); record(a); }
        };
        source.start();
        soundDone = false;
      } else releaseCue(a);
    } catch { releaseCue(a); }
    const started = performance.now();
    function markBeat() {
      if (!current(a)) return;
      const elapsed = performance.now() - started;
      const tick = Math.floor(elapsed / BEAT_MS) + 1;
      if (tick > 4) {
        visualDone = true;
        if (soundDone) record(a);
        else a.timer = setTimeout(() => record(a), 1000); // record() stops stalled sound first.
        return;
      }
      beat.textContent = `${tick} / 4`;
      beat.hidden = false;
      a.timer = setTimeout(markBeat, Math.max(1, tick * BEAT_MS - elapsed));
    }
    markBeat();
  }
  async function start() {
    clearPlayback();
    if (typeof MediaRecorder !== 'function' || !navigator.mediaDevices?.getUserMedia) {
      render('이 브라우저에서는 녹음할 수 없어요.', '녹음 시작', false);
      return;
    }
    const a = attempt = {phase:'permission', chunks:[]};
    render('마이크를 준비하고 있어요.', '잠시만요', false);
    // Unlock sound in the explicit click gesture. No cue is played during permission.
    try {
      const Context = window.AudioContext || window.webkitAudioContext;
      a.context = new Context();
      a.context.resume().catch(() => {});
    } catch { releaseCue(a); }
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({audio:true}); }
    catch (error) {
      fail(a, error?.name === 'NotAllowedError'
        ? '마이크 권한을 허용한 뒤 다시 시도해 주세요.'
        : '마이크를 열 수 없어요. 연결을 확인한 뒤 다시 시도해 주세요.');
      return;
    }
    if (!current(a)) { releaseTracks(stream); return; }
    a.stream = stream;
    if (!stream.getTracks().some(track => track.readyState === 'live')) return fail(a);
    for (const track of stream.getTracks()) track.addEventListener('ended', () => fail(a), {once:true});
    countIn(a);
  }

  open.addEventListener('click', () => {
    node('words').replaceChildren(...dailyPrompts().map(word => {
      const chip = document.createElement('span');
      chip.textContent = word;
      return chip;
    }));
    render(defaultStatus, '녹음 시작');
    dialog.showModal();
  });
  back.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('close', () => { if (!dialog.open) dismiss(); });
  // iOS can shrink only the visual viewport when the keyboard is open.
  const viewport = window.visualViewport;
  const fitKeyboard = () => {
    const shrunk = dialog.open && viewport.scale <= 1.05 && window.innerHeight - viewport.height > 90;
    dialog.classList.toggle('rap-keyboard', shrunk);
    if (shrunk) {
      dialog.style.setProperty('--rap-keyboard-top', `${viewport.offsetTop + 10}px`);
      dialog.style.setProperty('--rap-keyboard-height', `${viewport.height - 20}px`);
    } else {
      dialog.style.removeProperty('--rap-keyboard-top');
      dialog.style.removeProperty('--rap-keyboard-height');
    }
  };
  if (viewport) {
    viewport.addEventListener('resize', fitKeyboard);
    viewport.addEventListener('scroll', fitKeyboard);
    dialog.addEventListener('close', fitKeyboard);
  }
  window.addEventListener('pagehide', dismiss);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden || !dialog.open) return;
    if (attempt) dismiss();
    else if (playbackUrl) audio.pause();
  });
  action.addEventListener('click', () => {
    if (action.getAttribute('aria-disabled') === 'true') return;
    if (attempt) finish(attempt);
    else start();
  });
  audio.addEventListener('error', () => {
    if (!playbackUrl) return;
    clearPlayback();
    render('이 브라우저에서 녹음을 재생하지 못했어요.', '다시 시작');
  });
  lyrics.addEventListener('input', () => {
    const limited = lyrics.value.split('\n', 4).join('\n');
    if (limited !== lyrics.value) lyrics.value = limited;
    const matches = pairs(lyrics.value);
    hints.textContent = matches.length ? `라임 힌트: ${matches.map(([a,b]) => `${a}·${b}줄`).join(', ')}의 끝 모음이 닮았어요.`
      : lyrics.value.trim() ? '닮은 줄 끝 모음이 아직 없어요.' : '';
  });
  entry.hidden = false;
}
