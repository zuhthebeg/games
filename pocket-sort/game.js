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
    remainingLabel: document.getElementById('remainingLabel'),
    messageLine: document.getElementById('messageLine'),
    selectionHint: document.getElementById('selectionHint'),
    binGrid: document.getElementById('binGrid'),
    trayGrid: document.getElementById('trayGrid'),
    debugState: document.getElementById('debugState'),
    clearBanner: document.getElementById('clearBanner'),
    nextBtn: document.getElementById('nextBtn'),
    bannerNextBtn: document.getElementById('bannerNextBtn'),
    restartBtn: document.getElementById('restartBtn')
  };

  let state = Engine.createGameState(LEVELS, 0);

  const reasonText = {
    ready: '아래에서 물건 하나를 선택하세요.',
    selected: '같은 그림 포켓을 누르면 들어간다.',
    deselected: '선택이 취소됐다.',
    placed: '제자리로 정리됐다.',
    'missing-item': '그 물건은 없어요.',
    'no-item-selected': '먼저 아래 물건을 선택하세요.',
    'missing-bin': '없는 포켓입니다.',
    'wrong-bin': '다른 그림 포켓에는 넣을 수 없어요.',
    'bin-full': '그 포켓은 이미 다 찼어요.'
  };

  function selectedItemMeta() {
    return state.selectedItem ? ITEMS[state.selectedItem] : null;
  }

  function renderBins() {
    ui.binGrid.innerHTML = '';
    const selected = selectedItemMeta();

    state.bins.forEach((bin, index) => {
      const meta = ITEMS[bin.type];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'bin';
      if (selected && selected === meta) button.classList.add('valid-target');
      if (selected && selected !== meta) button.classList.add('invalid-target');
      if (bin.items.length === bin.targetCount) button.classList.add('completed');
      button.dataset.qaBin = String(index);
      button.dataset.qaBinType = bin.type;
      button.dataset.qaBinCount = String(bin.items.length);
      button.dataset.qaBinTarget = String(bin.targetCount);
      button.setAttribute('aria-label', `${meta.label} 포켓`);
      button.addEventListener('click', () => {
        state = Engine.placeSelectedIntoBin(state, index);
        render();
      });

      button.innerHTML = `
        <div class="bin-top">
          <div class="bin-name">${meta.label}</div>
          <div class="bin-count">${bin.items.length} / ${bin.targetCount}</div>
        </div>
        <div class="bin-target">
          <span class="bin-emoji">${meta.emoji}</span>
          <span>${selected && selected === meta ? '여기에 넣기' : '이 포켓으로 정리'}</span>
        </div>
        <div class="bin-items">
          ${bin.items.length ? bin.items.map(() => `<span class="bin-chip" style="background:${meta.color};color:${meta.text}">${meta.emoji}</span>`).join('') : `<span class="bin-placeholder">아직 비어 있음</span>`}
        </div>
      `;
      ui.binGrid.appendChild(button);
    });
  }

  function renderTray() {
    ui.trayGrid.innerHTML = '';
    state.tray.forEach((itemKey, index) => {
      const meta = ITEMS[itemKey];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'item-card glass';
      if (state.selectedItemIndex === index) button.classList.add('selected');
      button.dataset.qaItem = itemKey;
      button.dataset.qaItemIndex = String(index);
      button.addEventListener('click', () => {
        state = Engine.selectItem(state, index);
        render();
      });
      button.innerHTML = `
        <span class="emoji">${meta.emoji}</span>
        <span>
          <div class="item-name">${meta.label}</div>
          <div class="item-help">같은 그림 포켓으로 보내기</div>
        </span>
      `;
      ui.trayGrid.appendChild(button);
    });
  }

  function renderStatus() {
    ui.levelLabel.textContent = `${state.levelIndex + 1} / ${LEVELS.length}`;
    ui.moveLabel.textContent = String(state.moveCount);
    ui.remainingLabel.textContent = String(state.tray.length);
    ui.messageLine.textContent = state.isCleared ? '정리 완료. 다음 레벨로 넘어가세요.' : (reasonText[state.lastAction.reason] || '정리해보세요.');
    const selected = selectedItemMeta();
    ui.selectionHint.textContent = selected ? `${selected.emoji} ${selected.label} 선택됨 → 같은 그림 포켓을 누르세요` : '선택된 물건 없음';
    ui.nextBtn.disabled = !state.isCleared;
    ui.clearBanner.classList.toggle('hidden', !state.showClear);
    ui.debugState.textContent = Engine.serializeForDebug(state);
    document.body.dataset.qaClear = state.isCleared ? 'true' : 'false';
    document.body.dataset.qaLevel = String(state.levelIndex + 1);
    document.body.dataset.qaRemaining = String(state.tray.length);
  }

  function render() {
    renderStatus();
    renderBins();
    renderTray();
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

  bindActions();
  render();
})();
