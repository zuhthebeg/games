(() => {
  const { LEVELS } = window.PocketSortLevels;
  const Engine = window.PocketSortEngine;

  const ITEMS = {
    lip: { emoji: '💄', label: '립밤', color: '#f9a8d4', text: '#4a044e' },
    usb: { emoji: '💾', label: 'USB', color: '#7dd3fc', text: '#082f49' },
    battery: { emoji: '🔋', label: '배터리', color: '#86efac', text: '#052e16' },
    ring: { emoji: '💍', label: '반지', color: '#fde68a', text: '#713f12' },
    card: { emoji: '💳', label: '카드', color: '#c4b5fd', text: '#2e1065' },
    key: { emoji: '🔑', label: '열쇠', color: '#fdba74', text: '#7c2d12' },
    earbud: { emoji: '🎧', label: '이어버드', color: '#f0abfc', text: '#701a75' }
  };

  const ui = {
    levelLabel: document.getElementById('levelLabel'),
    moveLabel: document.getElementById('moveLabel'),
    lockLabel: document.getElementById('lockLabel'),
    messageLine: document.getElementById('messageLine'),
    moveHint: document.getElementById('moveHint'),
    board: document.getElementById('board'),
    debugState: document.getElementById('debugState'),
    clearBanner: document.getElementById('clearBanner'),
    nextBtn: document.getElementById('nextBtn'),
    bannerNextBtn: document.getElementById('bannerNextBtn'),
    restartBtn: document.getElementById('restartBtn'),
    legend: document.getElementById('legend')
  };

  let state = Engine.createGameState(LEVELS, 0);

  function messageFor(state) {
    const { lastMove } = state;
    const reasons = {
      ready: '먼저 옮길 포켓을 누르세요.',
      selected: '이제 초록 테두리 포켓으로 옮길 수 있어.',
      deselected: '선택 취소.',
      moved: '이동 완료. 같은 물건끼리 계속 모아봐.',
      'empty-pocket': '빈 포켓은 선택할 수 없어.',
      'locked-pocket': '초록 잠금 포켓은 이미 완성된 포켓이야.',
      'pocket-full': '그 포켓은 꽉 차서 더 못 넣어.',
      'color-mismatch': '같은 물건 위 또는 빈 포켓으로만 이동 가능.',
      'missing-pocket': '없는 포켓이야.'
    };
    if (state.isCleared) return '정리 완료. 다음 레벨로 넘어가.';
    return reasons[lastMove.reason] || '먼저 옮길 포켓을 누르세요.';
  }

  function getTargetState(targetIndex) {
    if (state.selectedPocket === null || targetIndex === state.selectedPocket) return '';
    const sourcePocket = state.pockets[state.selectedPocket];
    const targetPocket = state.pockets[targetIndex];
    if (!sourcePocket || sourcePocket.length === 0) return 'invalid';
    if (state.locked.has(targetIndex)) return 'invalid';
    if (targetPocket.length >= state.capacity) return 'invalid';
    const item = sourcePocket[sourcePocket.length - 1];
    if (targetPocket.length === 0) return 'valid';
    return targetPocket[targetPocket.length - 1] === item ? 'valid' : 'invalid';
  }

  function renderLegend() {
    ui.legend.innerHTML = Object.values(ITEMS).map((item) => (
      `<span class="legend-chip" style="background:${item.color}; color:${item.text}">${item.emoji} ${item.label}</span>`
    )).join('');
  }

  function renderBoard() {
    ui.board.innerHTML = '';
    state.pockets.forEach((pocket, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pocket';
      if (state.selectedPocket === index) button.classList.add('selected');
      if (state.locked.has(index)) button.classList.add('locked');
      if (pocket.length === 0) button.classList.add('empty');
      const targetState = getTargetState(index);
      if (targetState === 'valid') button.classList.add('valid-target');
      if (targetState === 'invalid') button.classList.add('invalid-target');
      button.dataset.label = `포켓 ${index + 1}`;
      button.dataset.qaPocket = String(index);
      button.dataset.qaItems = pocket.join(',');
      button.dataset.qaLocked = state.locked.has(index) ? 'true' : 'false';
      button.dataset.qaTarget = targetState || 'none';
      button.setAttribute('aria-label', `포켓 ${index + 1}`);
      button.addEventListener('click', () => {
        state = Engine.selectPocket(state, index);
        render();
      });

      if (pocket.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-note';
        empty.textContent = targetState === 'valid' ? '여기로 이동' : '빈 포켓';
        button.appendChild(empty);
      } else {
        pocket.forEach((itemKey) => {
          const meta = ITEMS[itemKey];
          const item = document.createElement('div');
          item.className = 'item';
          item.style.background = meta.color;
          item.style.color = meta.text;
          item.innerHTML = `<span class="emoji">${meta.emoji}</span><span>${meta.label}</span>`;
          button.appendChild(item);
        });
      }
      ui.board.appendChild(button);
    });
  }

  function render() {
    ui.levelLabel.textContent = `${state.levelIndex + 1} / ${LEVELS.length}`;
    ui.moveLabel.textContent = String(state.moveCount);
    ui.lockLabel.textContent = `${state.lockedCount}`;
    ui.messageLine.textContent = messageFor(state);
    if (state.isCleared) {
      ui.moveHint.textContent = '클리어. 다음 레벨 버튼을 누르세요.';
    } else if (state.selectedPocket === null) {
      ui.moveHint.textContent = '1단계: 옮길 포켓을 누르세요.';
    } else {
      ui.moveHint.textContent = '2단계: 초록 테두리 포켓을 눌러 이동하세요.';
    }
    ui.nextBtn.disabled = !state.isCleared;
    ui.clearBanner.classList.toggle('hidden', !state.showClear);
    ui.debugState.textContent = Engine.serializeForDebug(state);
    document.body.dataset.qaClear = state.isCleared ? 'true' : 'false';
    document.body.dataset.qaLevel = String(state.levelIndex + 1);
    document.body.dataset.qaLastReason = state.lastMove.reason;
    document.body.dataset.qaSelected = state.selectedPocket === null ? 'none' : String(state.selectedPocket);
    renderBoard();
  }

  function bindActions() {
    ui.restartBtn.addEventListener('click', () => {
      state = Engine.restartLevel(state);
      render();
    });
    const goNext = () => {
      state = Engine.nextLevel(state);
      render();
    };
    ui.nextBtn.addEventListener('click', goNext);
    ui.bannerNextBtn.addEventListener('click', goNext);
  }

  renderLegend();
  bindActions();
  render();
})();
