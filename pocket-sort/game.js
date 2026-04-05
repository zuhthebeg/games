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
      ready: '같은 물건끼리 한 포켓에 모아 정리해.',
      selected: '선택됨. 같은 물건 위나 빈 포켓으로 옮길 수 있어.',
      deselected: '선택 취소.',
      moved: '이동 완료.',
      'empty-pocket': '빈 포켓은 집을 물건이 없어.',
      'locked-pocket': '이미 정리된 포켓은 잠겼어.',
      'pocket-full': '그 포켓은 꽉 찼어.',
      'color-mismatch': '다른 물건 위에는 올릴 수 없어.',
      'missing-pocket': '없는 포켓이야.'
    };
    if (state.isCleared) return '정리 완료. 다음 레벨로 넘어가.';
    return reasons[lastMove.reason] || '포켓을 정리해.';
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
      button.dataset.label = `포켓 ${index + 1}`;
      button.dataset.qaPocket = String(index);
      button.dataset.qaItems = pocket.join(',');
      button.dataset.qaLocked = state.locked.has(index) ? 'true' : 'false';
      button.setAttribute('aria-label', `포켓 ${index + 1}`);
      button.addEventListener('click', () => {
        state = Engine.selectPocket(state, index);
        render();
      });

      if (pocket.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-note';
        empty.textContent = '빈 포켓';
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
    ui.nextBtn.disabled = !state.isCleared;
    ui.clearBanner.classList.toggle('hidden', !state.showClear);
    ui.debugState.textContent = Engine.serializeForDebug(state);
    document.body.dataset.qaClear = state.isCleared ? 'true' : 'false';
    document.body.dataset.qaLevel = String(state.levelIndex + 1);
    document.body.dataset.qaLastReason = state.lastMove.reason;
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
