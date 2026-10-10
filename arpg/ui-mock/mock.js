'use strict';
// Review-only interactions. No game imports, simulation, network, or storage.
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const views = ['inn', 'shop', 'forge', 'board', 'combat', 'result'];
  let current = 'inn';
  let selectedItem = 'potion';
  let quantity = 3;
  let selectedGear = 'iron';
  let selectedContract = 'S2';
  let toastTimer;
  const items = {
    potion: { name: 'HP 물약', price: 10, max: 5 },
    mana: { name: '마나 물약', price: 12, max: 5 },
    scroll: { name: '귀환 주문서', price: 6, max: 1 },
  };
  const gears = {
    iron: { name: '철검 +1', kind: '양질 · 검', power: '1.20', gain: '+0.20 증가', weight: 12, delta: '+4 kg 무거움', family: 'blade', enhance: '94 G · 고철 5', refund: '고철 +5 · 확인 필요' },
    bow: { name: '사냥꾼의 활', kind: '양질 · 활', power: '1.15', gain: '+0.15 기본 위력', weight: 7, delta: '−1 kg 가벼움', family: 'bow', enhance: '60 G · 고철 4', refund: '고철 +1 · 제작품' },
    staff: { name: '불씨 지팡이', kind: '양질 · 지팡이', power: '1.15', gain: '+0.15 기본 위력', weight: 5, delta: '−3 kg 가벼움', family: 'focus', enhance: '60 G · 고철 4', refund: '고철 +1 · 제작품' },
  };
  function toast(text) {
    const node = $('.toast');
    node.textContent = text;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.hidden = true; }, 2400);
  }
  function show(view, focusTab = false) {
    if (!views.includes(view)) return;
    current = view;
    $$('.screen').forEach(node => { node.hidden = node.dataset.view !== view; });
    $$('.screen-tabs button').forEach(node => {
      const selected = node.dataset.screen === view;
      node.setAttribute('aria-selected', String(selected));
      node.tabIndex = selected ? 0 : -1;
      if (selected && focusTab) node.focus({ preventScroll: true });
    });
    $$('.rationale').forEach(node => { node.open = false; });
    const content = $(`#screen-${view} .content`);
    if (content) content.scrollTop = 0;
    $('.toast').hidden = true;
    if (view === 'combat') $('#battle-stage').textContent = selectedContract === 'S1' ? 'S1 · 소환 시험' : 'S2 · 여관길';
  }
  function renderShop() {
    const item = items[selectedItem];
    quantity = Math.min(item.max, Math.max(1, quantity));
    $$('.shop-item').forEach(node => {
      const selected = node.dataset.item === selectedItem;
      node.classList.toggle('selected', selected);
      node.setAttribute('aria-pressed', String(selected));
      node.querySelector('.item-price small').textContent = selected ? '선택됨' : node.dataset.item === 'scroll' ? '소지 제한' : '보급품';
    });
    const total = item.price * quantity;
    $('#quantity').textContent = quantity;
    $('#shop-total').textContent = `${total} G`;
    $('#shop-balance').textContent = `${240 - total} G`;
    $('#shop-weight').textContent = `${(21 + quantity).toFixed(1)} / 108 kg`;
    $('#buy-preview').textContent = `${total} G · 구매 확인`;
    $('[data-count="-1"]').disabled = quantity === 1;
    $('[data-count="1"]').disabled = quantity === item.max;
    $('#shop-note').innerHTML = '<svg aria-hidden="true"><use href="#i-check"/></svg>' + (selectedItem === 'scroll' ? '구매 후 2장 · 소지 상한에 도달' : '가벼움 유지 · 회피에 영향 없음');
  }
  function renderGear(id) {
    selectedGear = id;
    const gear = gears[id];
    $$('.gear-picker button').forEach(node => {
      node.classList.toggle('selected', node.dataset.gear === id);
      node.setAttribute('aria-pressed', String(node.dataset.gear === id));
    });
    $('#gear-name').textContent = gear.name;
    $('#gear-kind').textContent = gear.kind;
    $('#gear-power').textContent = `×${gear.power}`;
    $('#gear-gain').textContent = gear.gain;
    $('#gear-weight').textContent = `${gear.weight} kg`;
    $('#gear-delta').textContent = gear.delta;
    $('#gear-delta').className = gear.weight > 8 ? 'loss' : 'gain';
    $('#gear-load').textContent = `${(21 - 8 + gear.weight).toFixed(1)} / 108 kg`;
    $('#enhance-cost').textContent = gear.enhance;
    $('#dismantle-refund').textContent = gear.refund;
    $('#equip-preview').textContent = `${gear.name} 장착 확인`;
    $('#gear-advice').textContent = gear.family === 'blade' ? '더 강하지만 더 무거워. 두 값을 함께 비교해.' : '다른 무기 계열: 기본 위력만 비교. 실전 피해는 스탯·숙련에 따라 달라.';
  }
  function kit(id) {
    $('.arena').dataset.kit = id;
    $$('.kit-tabs button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.kit === id)));
    for (const family of ['blade', 'bow', 'focus']) $$(`.${family}-widget`).forEach(node => { node.hidden = family !== id; });
    const hero = $('.battle-hero');
    const sprite = { blade: 'hero-sword', bow: 'hero-bow', focus: 'hero-focus' }[id];
    hero.style.backgroundImage = `url('../assets/sprites/${sprite}/atlas-0.webp')`;
    hero.setAttribute('aria-label', `실제 게임의 ${id === 'blade' ? '검 기사' : id === 'bow' ? '궁수' : '마법사'} 스프라이트`);
    $('#battle-guidance').textContent = { blade: '검 · 콤보와 가드에 집중', bow: '활 · 조준, 차지, 약점을 읽는다', focus: '지팡이 · 서클의 마나, 주문 링' }[id];
  }
  function terminal(id) {
    const death = id === 'death';
    $('#screen-result').dataset.terminal = id;
    $$('.result-tabs button').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.terminal === id)));
    $('#result-stamp use').setAttribute('href', death ? '#i-skull' : '#i-check');
    $('#result-eyebrow').textContent = death ? 'S2 · 여정 중 사망' : 'S2 · 계약 완료';
    $('#result-title').textContent = death ? '난로는 아직 따뜻하다.' : '길이 다시 열렸다.';
    $('#result-story').textContent = death ? '무엇에 쓰러졌는지, 먼저 돌아보자.' : '오늘 밤, 여관의 불빛은 조금 더 멀리 닿는다.';
    $('#reward-heading').textContent = death ? '이번 여정의 정산' : '이번 여정에서 확보';
    $('#reward-xp').textContent = death ? '−6 XP' : '+50 XP';
    $('#reward-gold').textContent = death ? '확보 0 G' : '+36 G';
    $('#kept-loot').hidden = death;
    $('#loss-explanation').hidden = !death;
    $('#next-hint').textContent = death ? '옆으로 회피하면 베기 예고를 벗어날 수 있어.\n약사에게서 물약을 챙긴 뒤 다시 준비하자.' : 'S3 · 무너진 수레 계약이 열렸어.\n가방과 보급은 난로 곁에서 정리하자.';
    $('#next-hint').style.whiteSpace = 'pre-line';
  }
  function dialog(title, html) {
    $('#dialog-title').textContent = title;
    $('#dialog-content').innerHTML = html;
    $('.mock-dialog').showModal();
  }
  document.addEventListener('click', event => {
    const node = event.target.closest('button');
    if (!node || node.disabled) return;
    const d = node.dataset;
    if (d.screen) show(d.screen);
    else if (d.go) show(d.go);
    else if (d.item) { selectedItem = d.item; renderShop(); }
    else if (d.count) { quantity += Number(d.count); renderShop(); }
    else if (d.gear) renderGear(d.gear);
    else if (d.kit) kit(d.kit);
    else if (d.terminal) terminal(d.terminal);
    else if ('buy' in d) dialog('구매 확인', `<p>${items[selectedItem].name} ${quantity}개 · ${items[selectedItem].price * quantity} G<br>구매 후 ${(21 + quantity).toFixed(1)} / 108 kg</p><small>정적 목업. 실제 구매·소지품·저장 변화 없음.</small>`);
    else if ('equip' in d) dialog('장착 확인', `<p>${gears[selectedGear].name}을 쥐면 전투 HUD도 ${gears[selectedGear].family === 'blade' ? '검' : gears[selectedGear].family === 'bow' ? '활' : '지팡이'} 키트로 바뀐다.</p><small>확인 UI 예시만 표시. 실제 장착이나 게임 입력은 변경하지 않음.</small>`);
    else if (d.forge) dialog(d.forge === 'enhance' ? '강화 비용 확인' : '분해는 되돌릴 수 없어', `<p>${gears[selectedGear].name}<br>${d.forge === 'enhance' ? '비용: ' + gears[selectedGear].enhance : '반환: ' + gears[selectedGear].refund}</p><small>검토용 확인 화면. 실제 강화·분해 없음.</small>`);
    else if (d.contract) {
      selectedContract = d.contract;
      $$('.contract[data-contract]').forEach(item => { const selected = item.dataset.contract === d.contract; item.classList.toggle('selected', selected); item.setAttribute('aria-pressed', String(selected)); });
      $('#contract-name').textContent = d.contract === 'S1' ? 'S1 · 소환 시험' : 'S2 · 끊긴 여관길';
      $('#depart-preview span').textContent = `${d.contract}로 출정 · HUD 보기`;
    }
    else if (d.hud) toast(`목업 조작: ${d.hud} · 전투는 실행되지 않아.`);
    else if (d.info) {
      if (d.info === 'owner') dialog('여관 주인', '<p>HP·MP는 이미 모두 회복했어.<br>지난 계약: 소환 시험 완료.</p><small>현재 계약 정산을 돌려보는 자리. 보급 프리셋은 후속 기능.</small>');
      if (d.info === 'trainer') dialog('교관 · 미분배 2점', '<p>인장의 힘은 여관에서 분배해.<br>힘 · 민첩 · 지능 · 지혜 · 카리스마</p><small>6개 주요 화면 검토 범위 밖. 능력치 분배 상세는 승인 후 별도 목업.</small>');
      if (d.info === 'settings') dialog('목업 안내', '<p>화면 탭 또는 빈 영역의 좌우 스와이프로 넘겨볼 수 있어. 전투의 무기 토글은 디자인 비교용이야.</p><small>실제 저장·출정·장착 없음. 시스템의 모션 감소 설정을 존중해.</small>');
    }
    else if ('close' in d) $('.mock-dialog').close();
  });
  $('.screen-tabs').addEventListener('keydown', event => {
    const index = views.indexOf(current);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % views.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + views.length) % views.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = views.length - 1;
    if (next !== undefined) { event.preventDefault(); show(views[next], true); }
  });
  let start;
  $('#screens').addEventListener('touchstart', event => {
    if (event.target.closest('button,a,summary,details,input,dialog') || event.touches.length !== 1) { start = null; return; }
    start = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  $('#screens').addEventListener('touchend', event => {
    if (!start || !event.changedTouches.length) return;
    const dx = event.changedTouches[0].clientX - start.x;
    const dy = event.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      const index = views.indexOf(current);
      const next = Math.max(0, Math.min(views.length - 1, index + (dx < 0 ? 1 : -1)));
      show(views[next]);
    }
    start = null;
  }, { passive: true });
  renderShop();
  renderGear('iron');
  kit('blade');
  terminal('clear');
})();
