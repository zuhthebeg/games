(() => {
  const Engine = window.MergeDropEngine;
  const TUTORIAL_KEY = 'merge-drop-tutorial-seen';
  const BEST_SCORE_KEY = 'merge-drop-best-score';

  const ui = {
    scoreValue: document.getElementById('scoreValue'),
    turnValue: document.getElementById('turnValue'),
    chainValue: document.getElementById('chainValue'),
    tutorialCard: document.getElementById('tutorialCard'),
    tutorialBtn: document.getElementById('tutorialBtn'),
    reopenTutorialBtn: document.getElementById('reopenTutorialBtn'),
    restartBtn: document.getElementById('restartBtn'),
    openingCount: document.getElementById('openingCount'),
    currentPiece: document.getElementById('currentPiece'),
    queueList: document.getElementById('queueList'),
    queueSeed: document.getElementById('queueSeed'),
    goalLabel: document.getElementById('goalLabel'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    statusLine: document.getElementById('statusLine'),
    bestScoreValue: document.getElementById('bestScoreValue'),
    highestValue: document.getElementById('highestValue'),
    dropStrip: document.getElementById('dropStrip'),
    boardGrid: document.getElementById('boardGrid'),
    debugState: document.getElementById('debugState'),
    endSheet: document.getElementById('endSheet'),
    endEyebrow: document.getElementById('endEyebrow'),
    endTitle: document.getElementById('endTitle'),
    endSummary: document.getElementById('endSummary'),
    endRestartBtn: document.getElementById('endRestartBtn'),
  };

  const statusCopy = {
    ready: '첫 12개 드롭은 고정 큐입니다. 드롭 버튼을 눌러 같은 조각 3개를 연결하세요.',
    dropped: '보드가 차기 전에 같은 단계 3개 이상을 이어 주세요.',
    merged: '병합 성공. 체인을 이어서 더 높은 블룸을 만드세요.',
    'target-reached': '목표 블룸 완성. 이 런은 클리어입니다.',
    'column-full': '그 컬럼은 꽉 찼습니다. 다른 위치를 선택하세요.',
    'missing-column': '없는 컬럼입니다.',
    'already-won': '이미 목표를 달성했습니다. 다시 시작으로 새 런을 열 수 있습니다.',
    'game-over': '보드가 가득 찼습니다. 다시 시작으로 바로 재도전하세요.',
  };

  let state = Engine.createGameState();
  let bestScore = Number(localStorage.getItem(BEST_SCORE_KEY) || 0);
  let tutorialVisible = !localStorage.getItem(TUTORIAL_KEY);
  let activeColumn = null;

  function tier(level) {
    return Engine.TIERS[Math.min(level, Engine.TIERS.length - 1)];
  }

  function tierCard(level, caption) {
    const meta = tier(level);
    return `
      <article class="piece-card" style="--piece-color:${meta.accent};--piece-glow:${meta.glow}">
        <div class="piece-badge"><strong>${level + 1}</strong></div>
        <div class="piece-meta">
          <p class="piece-name">${meta.label}</p>
          <p class="piece-help">${caption}</p>
        </div>
      </article>
    `;
  }

  function makeTonePlayer() {
    let ctx = null;

    function ensureContext() {
      if (!ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        ctx = new AudioContext();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tone(freq, duration, gain, type, delay) {
      const audio = ensureContext();
      if (!audio) return;

      const start = audio.currentTime + (delay || 0);
      const oscillator = audio.createOscillator();
      const envelope = audio.createGain();

      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(freq, start);
      envelope.gain.setValueAtTime(0.0001, start);
      envelope.gain.exponentialRampToValueAtTime(gain || 0.03, start + 0.02);
      envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);

      oscillator.connect(envelope);
      envelope.connect(audio.destination);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    }

    return {
      drop() {
        tone(320, 0.12, 0.028, 'triangle', 0);
      },
      merge(depth) {
        tone(420, 0.13, 0.034, 'triangle', 0);
        tone(580 + (depth || 0) * 40, 0.16, 0.028, 'sine', 0.06);
      },
      fail() {
        tone(180, 0.14, 0.028, 'sawtooth', 0);
      },
      win() {
        tone(520, 0.16, 0.032, 'triangle', 0);
        tone(720, 0.18, 0.03, 'triangle', 0.08);
        tone(940, 0.24, 0.026, 'sine', 0.18);
      },
      lose() {
        tone(220, 0.18, 0.026, 'square', 0);
        tone(160, 0.22, 0.02, 'triangle', 0.12);
      },
    };
  }

  const sfx = makeTonePlayer();

  function dismissTutorial() {
    tutorialVisible = false;
    localStorage.setItem(TUTORIAL_KEY, '1');
    render();
  }

  function reopenTutorial() {
    tutorialVisible = true;
    render();
  }

  function restart() {
    state = Engine.restartGame(state);
    activeColumn = null;
    render();
  }

  function handleDrop(column) {
    const next = Engine.dropPiece(state, column);

    if (!next.lastAction.valid) {
      state = next;
      sfx.fail();
      render();
      return;
    }

    state = next;
    if (tutorialVisible) dismissTutorial();

    if (state.lastAction.merges.length) {
      sfx.merge(state.lastAction.merges.length);
    } else {
      sfx.drop();
    }

    if (state.score > bestScore) {
      bestScore = state.score;
      localStorage.setItem(BEST_SCORE_KEY, String(bestScore));
    }

    if (state.status === 'won') {
      sfx.win();
    } else if (state.status === 'game-over') {
      sfx.lose();
    }

    render();
  }

  function renderQueue() {
    ui.currentPiece.innerHTML = tierCard(
      state.queue[0],
      '이 조각이 다음으로 떨어집니다.'
    );

    ui.queueList.innerHTML = state.queue
      .slice(1)
      .map((level) => {
        const meta = tier(level);
        return `
          <article class="queue-item" style="--piece-color:${meta.accent};--piece-glow:${meta.glow}">
            <div class="queue-badge">${level + 1}</div>
            <strong>${meta.label}</strong>
            <span>다음 대기</span>
          </article>
        `;
      })
      .join('');
  }

  function renderDropStrip() {
    ui.dropStrip.innerHTML = '';

    for (let col = 0; col < state.cols; col += 1) {
      const canDrop = state.availableColumns.includes(col) && state.status !== 'won' && state.status !== 'game-over';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `drop-btn${activeColumn === col ? ' active' : ''}`;
      button.disabled = !canDrop;
      button.dataset.qaColumn = String(col);
      button.setAttribute('aria-label', `${col + 1}번 컬럼에 드롭`);
      button.innerHTML = `<strong>${col + 1}</strong><span>${canDrop ? 'Drop' : 'Full'}</span>`;
      button.addEventListener('mouseenter', () => {
        activeColumn = col;
        renderBoard();
      });
      button.addEventListener('focus', () => {
        activeColumn = col;
        renderBoard();
      });
      button.addEventListener('mouseleave', () => {
        activeColumn = null;
        renderBoard();
      });
      button.addEventListener('click', () => {
        activeColumn = col;
        handleDrop(col);
      });
      ui.dropStrip.appendChild(button);
    }
  }

  function renderBoard() {
    ui.boardGrid.innerHTML = '';
    const mergedAnchors = new Set(
      (state.lastAction.merges || []).map((merge) => `${merge.anchor.row}:${merge.anchor.col}`)
    );
    const lastDropKey = state.lastAction.valid && state.lastAction.row != null && state.lastAction.col != null
      ? `${state.lastAction.row}:${state.lastAction.col}`
      : null;

    for (let row = 0; row < state.rows; row += 1) {
      for (let col = 0; col < state.cols; col += 1) {
        const cell = document.createElement('div');
        cell.className = `board-cell${activeColumn === col ? ' active-column' : ''}`;
        cell.dataset.qaCell = `${row}:${col}`;

        const level = state.board[row][col];
        if (level != null) {
          const meta = tier(level);
          const orb = document.createElement('div');
          const cellKey = `${row}:${col}`;
          const effectClass = mergedAnchors.has(cellKey)
            ? ' is-merge'
            : lastDropKey === cellKey
              ? ' is-drop'
              : '';
          orb.className = `orb${effectClass}`;
          orb.style.setProperty('--piece-color', meta.accent);
          orb.style.setProperty('--piece-glow', meta.glow);
          orb.title = meta.label;
          orb.innerHTML = `
            <span class="orb-number">${level + 1}</span>
            <span class="orb-tag">${meta.label}</span>
          `;
          cell.appendChild(orb);
        }

        ui.boardGrid.appendChild(cell);
      }
    }
  }

  function renderProgress() {
    const highest = tier(state.highestLevel);
    const target = tier(state.targetLevel);
    const progress = Math.min(100, (Math.max(0, state.highestLevel) / Math.max(1, state.targetLevel)) * 100);
    const openingLeft = Math.max(0, state.openingQueue.length - state.openingIndex);
    const highestLabel = state.turn === 0 ? '아직 없음' : `${highest.label} ${state.highestLevel + 1}`;

    ui.scoreValue.textContent = String(state.score);
    ui.turnValue.textContent = String(state.turn);
    ui.chainValue.textContent = `${state.bestChain}x`;
    ui.goalLabel.textContent = `${target.label} ${state.targetLevel + 1}`;
    ui.progressFill.style.width = `${progress}%`;
    ui.progressText.textContent = state.turn === 0
      ? `아직 진화한 조각이 없습니다. 목표 ${target.label} ${state.targetLevel + 1}까지 올리세요.`
      : `현재 최고는 ${highest.label} ${state.highestLevel + 1}. 목표 ${target.label} ${state.targetLevel + 1}까지 올리세요.`;
    ui.statusLine.textContent = state.lastAction.merges.length
      ? `${state.lastAction.merges[state.lastAction.merges.length - 1].size}개 병합, +${state.lastAction.scoreGained}점.`
      : (statusCopy[state.lastAction.reason] || statusCopy[state.status] || statusCopy.ready);
    ui.bestScoreValue.textContent = String(bestScore);
    ui.highestValue.textContent = highestLabel;
    ui.queueSeed.textContent = `Seed ${state.seed}`;
    ui.openingCount.textContent = `${openingLeft} left`;
    ui.tutorialCard.classList.toggle('hidden', !tutorialVisible);
  }

  function renderEndSheet() {
    const show = state.status === 'won' || state.status === 'game-over';
    ui.endSheet.classList.toggle('hidden', !show);
    if (!show) return;

    if (state.status === 'won') {
      ui.endEyebrow.textContent = 'Run Clear';
      ui.endTitle.textContent = '목표 블룸 완성';
      ui.endSummary.textContent = `점수 ${state.score}점, ${state.turn}드롭으로 ${tier(state.targetLevel).label} ${state.targetLevel + 1}을 만들었습니다.`;
    } else {
      ui.endEyebrow.textContent = 'Board Full';
      ui.endTitle.textContent = '보드가 가득 찼습니다';
      ui.endSummary.textContent = `점수 ${state.score}점, 최고 단계 ${tier(state.highestLevel).label} ${state.highestLevel + 1}. 같은 시드 오프너로 바로 다시 시도할 수 있습니다.`;
    }
  }

  function syncQaState() {
    document.body.dataset.qaStatus = state.status;
    document.body.dataset.qaScore = String(state.score);
    document.body.dataset.qaTurn = String(state.turn);
    document.body.dataset.qaHighest = String(state.highestLevel);
    document.body.dataset.qaQueue = state.queue.join(',');
    ui.debugState.textContent = Engine.serializeForDebug(state);
  }

  function render() {
    renderQueue();
    renderDropStrip();
    renderBoard();
    renderProgress();
    renderEndSheet();
    syncQaState();
  }

  ui.tutorialBtn.addEventListener('click', dismissTutorial);
  ui.reopenTutorialBtn.addEventListener('click', reopenTutorial);
  ui.restartBtn.addEventListener('click', restart);
  ui.endRestartBtn.addEventListener('click', restart);

  render();
})();
