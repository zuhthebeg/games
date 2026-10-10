'use strict';
// Approval-only fixtures and pure comparison adapter. No game imports or persistence.
(() => {
  const $ = s => document.querySelector(s);
  const slots = { weapon: '무기', head: '머리', body: '몸', hands: '손', feet: '발' };
  const grades = { common: '일반', fine: '양질', rare: '희귀', epic: '영웅' };
  const affixNames = { atk_pct: '공격력%', hp_flat: '최대HP+', move_pct: '이동속도%', dodge_pct: '회피 재사용 −%', crit_chance: '치명 확률', crit_damage: '치명 피해', potion_pct: '물약 효율%', mana_pct: '마나 재생%', capacity: '소지 한도+', gold_pct: '골드 획득%', drop_pct: '재료 드랍 확률%', poise: '넉백 저항' };
  const item = (uid, name, slot, icon, rarity, power, hp, weight, requiredLevel, price, enhance = 0, affixes = []) => ({ uid, id: uid, name, slot, icon, rarity, power, hp, weight, requiredLevel, price, enhance, affixes, rolledAt: 17 });
  const equipped = {
    weapon: item('old-sword', '수련용 검', 'weapon', 'sword', 'common', 20, 0, 8, 1, 40),
    head: null,
    body: item('old-body', '가죽 갑옷', 'body', 'body', 'fine', 0, 60, 12, 2, 80, 1, [{ k: 'poise', v: 3 }]),
    hands: item('old-hands', '사냥꾼 장갑', 'hands', 'hands', 'fine', 0, 8, 1, 2, 32, 0, [{ k: 'crit_chance', v: 2 }]),
    feet: item('old-feet', '여행자 장화', 'feet', 'feet', 'common', 0, 4, 2, 1, 24),
  };
  const bag = [
    item('iron', '철검', 'weapon', 'sword', 'fine', 27, 0, 8, 2, 80, 1, [{ k: 'atk_pct', v: 4 }]),
    item('heavy', '거친 전투검', 'weapon', 'sword', 'fine', 34, -12, 14, 3, 100, 0, [{ k: 'hp_flat', v: -12 }]),
    item('locked', '수호자의 검', 'weapon', 'sword', 'rare', 40, 12, 10, 7, 160, 2, [{ k: 'hp_flat', v: 12 }, { k: 'poise', v: 4 }]),
    item('bow', '사냥꾼 활', 'weapon', 'bow', 'fine', 23, 0, 7, 2, 72, 0, [{ k: 'crit_chance', v: 2 }]),
    item('wand', '불씨 마법봉', 'weapon', 'wand', 'common', 19, 0, 4, 1, 48),
    item('staff', '밤의 긴 지팡이', 'weapon', 'staff', 'epic', 31, 0, 5, 4, 200, 3, [{ k: 'mana_pct', v: 5 }, { k: 'potion_pct', v: 3 }, { k: 'drop_pct', v: 2 }]),
    item('head', '철 투구', 'head', 'head', 'fine', 0, 16, 3, 3, 48, 0, [{ k: 'mana_pct', v: 3 }]),
    item('body', '무거운 판금', 'body', 'body', 'rare', 0, 88, 22, 4, 140, 1, [{ k: 'hp_flat', v: 8 }, { k: 'poise', v: 6 }]),
    item('hands', '바람 장갑', 'hands', 'hands', 'fine', 0, 6, 1, 3, 44, 0, [{ k: 'crit_chance', v: 3 }]),
    item('feet', '정찰 장화', 'feet', 'feet', 'fine', 0, 8, 2, 2, 40, 1, [{ k: 'move_pct', v: 3 }]),
    item('cap', '천 모자', 'head', 'head', 'common', 0, 8, 1, 1, 24),
    item('cloth', '누빈 조끼', 'body', 'body', 'common', 0, 44, 5, 1, 36),
  ];
  // Eight stock entries: four weapons + four armor. Never rare/epic.
  const stock = [bag[0], bag[3], bag[4], item('shop-staff', '견습 지팡이', 'weapon', 'staff', 'common', 21, 0, 5, 2, 52), bag[6], item('shop-body', '철 갑옷', 'body', 'body', 'fine', 0, 72, 18, 5, 96, 0, [{ k: 'poise', v: 4 }]), bag[8], bag[9]];
  const save = { level: 4, power: 20, hp: 128, weight: 31, capacity: 108, gold: 240 };
  function compareItems(current, candidate, state) {
    const from = current || { power: 0, hp: 0, weight: 0, affixes: [] };
    const line = (label, a, b, lower = false) => ({ label, from: a, to: b, delta: b - a, good: lower ? b <= a : b >= a });
    const lines = [line('공격력', state.power, state.power - from.power + candidate.power), line('최대 HP', state.hp, state.hp - from.hp + candidate.hp), line('장비 무게 (kg)', from.weight, candidate.weight, true)];
    const keys = new Set([...from.affixes, ...candidate.affixes].map(a => a.k));
    for (const k of keys) lines.push(line(affixNames[k], from.affixes.find(a => a.k === k)?.v || 0, candidate.affixes.find(a => a.k === k)?.v || 0));
    return { lines, weightAfter: state.weight - from.weight + candidate.weight, locked: state.level < candidate.requiredLevel };
  }
  const icon = name => `<svg aria-hidden="true" focusable="false"><use href="icons.svg#${name}"/></svg>`;
  const emblem = it => `<span class="p2-emblem ${it.rarity}">${icon(it.icon)}<span class="grade-mark">${grades[it.rarity]}</span><b class="enhance-badge">+${it.enhance}</b></span>`;
  const weight = (value = save.weight) => `<div class="p2-weight"><span>소지 무게 <b>${value.toFixed(1)} / ${save.capacity} kg</b></span><meter min="0" max="108" value="${value}">${value} kg</meter><small>가벼움 · 기동성 정상</small></div>`;
  function deltaText(l) { return l.delta === 0 ? '= 0 유지' : `${l.delta > 0 ? '▲+' : '▼−'}${Math.abs(l.delta)} · ${l.good ? '이득' : '손해'}`; }
  function linesHtml(comparison) { return `<dl class="p2-lines">${comparison.lines.map(l => `<div><dt>${l.label}</dt><dd><span>${l.from} → <b>${l.to}</b></span><small class="${l.delta === 0 ? '' : l.good ? 'gain' : 'loss'}">${deltaText(l)}</small></dd></div>`).join('')}</dl>`; }
  function summary(it) {
    const c = compareItems(equipped[it.slot], it, save);
    return c.lines.filter(l => l.delta !== 0).slice(0, 2).map(l => `${l.label.replace(' (kg)', '')} ${l.delta > 0 ? '▲+' : '▼−'}${Math.abs(l.delta)}`).join(' · ') || '동일 능력치';
  }
  function card(it, mode = '장착', compact = false) {
    return `<button class="p2-card ${compact ? 'compact' : ''}" data-p2-item="${it.uid}" data-p2-mode="${mode}" aria-label="${it.name} +${it.enhance}, ${grades[it.rarity]}, 비교 열기">${emblem(it)}<span class="p2-card-copy"><strong>${it.name}</strong><small>${compact ? grades[it.rarity] : `${grades[it.rarity]} · ${slots[it.slot]} · ${mode === '구매' ? it.price + ' G' : mode === '판매' ? it.price / 4 + ' G · 매입 25%' : it.weight + ' kg'}`}</small>${compact ? '' : `<span class="p2-delta">${summary(it)}</span>${it.requiredLevel > save.level ? `<small class="loss">잠김 · 필요 Lv.${it.requiredLevel}</small>` : ''}`}</span></button>`;
  }
  function header(title, subtitle) { return `<header class="game-header panel-header"><div><small>${subtitle}</small><h2>${title}</h2></div><span class="money">240 G</span></header>`; }
  function section(id, body) { return `<section id="screen-${id}" class="screen p2-screen" role="tabpanel" aria-labelledby="tab-${id}" data-view="${id}" hidden>${body}</section>`; }
  const socket = slot => {
    const it = equipped[slot];
    return `<button class="p2-socket socket-${slot} ${it ? 'occupied' : 'empty'}" data-p2-slot="${slot}" aria-label="${slots[slot]} 소켓 · ${it ? it.name : '빈 슬롯'}, 보유품 보기">${it ? emblem(it) : `<span class="p2-emblem common">${icon(slot === 'weapon' ? 'sword' : slot)}</span>`}<span>${slots[slot]}${it ? '' : ' · 비어 있음'}</span></button>`;
  };
  const scene = $('#screen-inn .room-art').outerHTML.replace(/id="floor"/g, 'id="p2-floor"').replace(/url\(#floor\)/g, 'url(#p2-floor)');
  $('#screens').insertAdjacentHTML('beforeend',
    section('equipment', `${header('잿빛 기사 · Lv.4', '여관 / 다섯 부위의 준비')}<div class="content p2-content"><div class="p2-room">${scene}<div class="sprite p2-hero" role="img" aria-label="검 기사 idle SW 정적 프레임"></div><div class="body-sockets" aria-hidden="true">${Object.keys(slots).map(s => `<i class="pin-${s} ${equipped[s] ? 'worn' : ''}"></i>`).join('')}</div>${Object.keys(slots).map(socket).join('')}</div><p class="minor">부위 소켓을 눌러 교체 후보 확인 · 옷 파츠 합성 아님</p><div class="p2-stat-summary"><span>최대 HP <b>128</b></span><span>공격력 <b>20</b></span></div>${weight()}<div class="p2-hint">빈 머리 슬롯부터 채울까? 투구는 HP, 모자는 가벼움.</div></div><footer class="action-footer"><button class="primary" data-go="inventory">가방 전체 보기</button></footer>`) +
    section('inventory', `${header('눈으로 고르는 가방', '인벤토리 / 탭 또는 길게 눌러 비교')}<div class="content p2-content"><div class="p2-filters" role="group" aria-label="부위 필터">${['all', ...Object.keys(slots)].map(s => `<button data-p2-filter="${s}" aria-pressed="${s === 'all'}">${s === 'all' ? '전체' : slots[s]}</button>`).join('')}</div><div class="p2-toolbar"><span id="bag-count">보유 12개</span><button id="p2-sort" data-p2-sort>정렬: 등급</button></div><div id="p2-grid" class="p2-grid"></div>${weight()}<details class="p2-icon-catalog"><summary>재사용 SVG 아이콘 · 14종</summary><div class="p2-icon-grid">${['sword','bow','wand','staff','head','body','hands','feet','stone-low','stone-mid','stone-high','scrap','leather','ore'].map((i, n) => `<div>${icon(i)}<small>${['검','활','마법봉','긴 지팡이','투구','갑옷','장갑','장화','하급 I','중급 II','상급 III','고철','가죽','광석'][n]}</small></div>`).join('')}</div></details></div>`) +
    section('merchant', `${header('빈 부위를 메우는 거래', '무기상 · 방어구상 / 상점은 양질까지')}<div class="content p2-content"><div class="p2-refresh"><span id="p2-refresh-note">다음 갱신: 2판</span><button id="p2-refresh" data-p2-refresh>골드로 갱신 (20G)</button></div><div class="p2-merchant-tabs" role="group" aria-label="상점 종류"><button data-p2-shop="weapon" aria-pressed="true">무기상 · 4종</button><button data-p2-shop="armor" aria-pressed="false">방어구상 · 4종</button><button data-p2-shop="sell" aria-pressed="false">매입 · 25%</button></div><p id="p2-shop-note" class="minor">재고 총 8종 · 카드마다 현재 장비와 비교</p><div id="p2-stock" class="p2-stock"></div></div>`) +
    section('comparison', `${header('같은 장부, 세 가지 결정', '공통 비교 시트 / 숫자와 제약을 함께')}<div class="content p2-content"><p class="npc-line">“강한 것과, 맞는 것은 다르지.”</p><div class="p2-scenarios"><button data-p2-case="iron">01 · 명백한 상위호환<small>공격 ▲ · 무게 유지 · 장착 가능</small></button><button data-p2-case="heavy">02 · 득실이 갈리는 선택<small>공격 ▲ · HP ▼ · 무게 ▲</small></button><button data-p2-case="locked">03 · 아직 쥘 수 없는 검<small>필요 Lv.7 · 현재 Lv.4 · 잠금 사유</small></button></div><p class="p2-hint">▲▼와 이득/손해 텍스트를 병기한다. 종합 점수나 자동 장착 추천은 하지 않는다.</p>${weight()}</div>`) +
    section('reveal', `${header('이번 여정에서 가져온 것', '런 정산 확정 후 / 획득 공개')}<div class="content p2-content"><div class="p2-reveal-count" role="status" id="p2-reveal-count">공개 0 / 3 · 아직 가방에 넣기 전</div><button id="p2-reveal" class="primary" data-p2-reveal>첫 번째 장비 공개</button><div id="p2-loot" class="p2-loot"></div><p class="minor">희귀 이상만 정적인 광택 · 자동 공개/자동 분해 없음</p></div>`) +
    section('upgrade', `${header('강화는 사냥에서 시작된다', '대장간 / 강화석 드랍 · 성공 확정')}<div class="content p2-content"><div class="p2-upgrade-picker" role="group" aria-label="강화 대상"><button data-p2-target="iron" aria-pressed="true">${icon('sword')}철검 +1 → +2</button><button data-p2-target="staff" aria-pressed="false">${icon('staff')}지팡이 +3 → +4</button><button data-p2-target="locked" aria-pressed="false">${icon('sword')}수호검 +4 → +5</button></div><div class="p2-two" role="group" aria-label="강화석 보유 상태"><button data-p2-stones="ready" aria-pressed="true">가능한 상태</button><button data-p2-stones="missing" aria-pressed="false">부족한 상태</button></div><div id="p2-upgrade-detail"></div></div><footer class="action-footer"><button class="primary" id="p2-upgrade-action" data-p2-upgrade>강화 · 하급 2개 + 30 G</button></footer>`));
  document.body.insertAdjacentHTML('beforeend', `<dialog id="compare-sheet" class="p2-sheet" aria-labelledby="p2-sheet-title"><header><h2 id="p2-sheet-title">비교</h2><button data-p2-close aria-label="비교 시트 닫기">닫기</button></header><div id="p2-sheet-body" class="p2-sheet-body"></div><footer id="p2-sheet-footer"></footer></dialog>`);
  let filter = 'all', sort = 0, shop = 'weapon', refresh = 0, revealed = 0, target = 'iron', stones = 'ready', opener;
  const allItems = [...bag, ...stock];
  function renderBag() {
    const list = bag.filter(i => filter === 'all' || i.slot === filter).slice();
    if (sort === 0) list.sort((a, b) => Object.keys(grades).indexOf(b.rarity) - Object.keys(grades).indexOf(a.rarity));
    if (sort === 1) list.reverse();
    if (sort === 2) list.sort((a, b) => a.weight - b.weight);
    $('#p2-grid').innerHTML = list.map(i => card(i, '장착', true)).join('');
    $('#bag-count').textContent = `보유 ${list.length}개`;
  }
  function renderStock() {
    $('#p2-stock').innerHTML = (shop === 'sell' ? bag : stock.filter(i => shop === 'weapon' ? i.slot === 'weapon' : i.slot !== 'weapon')).map(i => card(i, shop === 'sell' ? '판매' : '구매')).join('');
    $('#p2-shop-note').textContent = shop === 'sell' ? '매입가 = 구매가의 25% · 장착품 제외 · 저장 없는 예시' : '재고 총 8종 · 일반/양질만 · 나머지는 드랍·제작';
  }
  function openSheet(it, mode = '장착') {
    const c = compareItems(equipped[it.slot], it, save);
    opener = document.activeElement;
    $('#p2-sheet-title').textContent = `${mode} 전 비교`;
    $('#p2-sheet-body').innerHTML = `<div class="p2-item-heading">${emblem(it)}<div><h3>${it.name} +${it.enhance}</h3><small>${grades[it.rarity]} · ${slots[it.slot]} · 필요 Lv.${it.requiredLevel}</small></div></div><p class="minor">현재: ${equipped[it.slot]?.name || '빈 슬롯'} → 후보 · ${it.slot === 'weapon' && ['bow','wand','staff'].includes(it.icon) ? '계열 변경: 실전 피해 우열 아님' : '캐릭터 총 능력치 비교'}</p>${linesHtml(c)}<div class="p2-weight-after">장착 후 무게 <b>${c.weightAfter.toFixed(1)} / ${save.capacity} kg</b><small>${c.weightAfter / save.capacity < .8 ? '가벼움 · 기동성 정상' : '짐이 많음 · 회피 재사용 +15%'}</small></div>${c.locked ? `<p class="p2-lock">잠금 · 필요 Lv.${it.requiredLevel}, 현재 Lv.${save.level}<br>${mode === '구매' ? '구매 가능 · 지금은 장착 불가' : mode === '판매' ? '판매 가능 · 레벨 제한은 장착에만 적용' : '레벨이 부족해 장착할 수 없음'}</p>` : ''}<p class="minor">${mode === '구매' ? `${it.price} G · 구매 후 ${save.gold - it.price} G · 가방 무게 ${(save.weight + it.weight).toFixed(1)} / 108 kg` : mode === '판매' ? `매입 ${it.price / 4} G = 구매가 ${it.price} G의 25%` : '가방의 같은 부위 장비와 비교 · 목업 수치 [제안]'}</p>`;
    $('#p2-sheet-footer').innerHTML = `<button class="primary" data-p2-confirm ${c.locked && mode === '장착' ? 'disabled' : ''}>${mode}${mode === '구매' ? ` · ${it.price} G` : mode === '판매' ? ` · ${it.price / 4} G` : ''}${c.locked && mode === '장착' ? ' 불가 · 레벨 부족' : ' 확인'}</button>`;
    if (!$('#compare-sheet').open) $('#compare-sheet').showModal();
  }
  function openSlot(slot) {
    opener = document.activeElement;
    $('#p2-sheet-title').textContent = `${slots[slot]} · 보유품`;
    $('#p2-sheet-body').innerHTML = `<p class="minor">현재: ${equipped[slot]?.name || '빈 슬롯'} · 탭하면 상세 증감</p><div class="p2-stock">${bag.filter(i => i.slot === slot).map(i => card(i)).join('')}</div>`;
    $('#p2-sheet-footer').innerHTML = '<button class="primary" data-p2-close>장비 화면으로</button>';
    $('#compare-sheet').showModal();
  }
  function renderUpgrade() {
    const base = bag.find(i => i.uid === target);
    const stage = { iron: { from: 1, tier: 'low', text: '하급', cost: 30 }, staff: { from: 3, tier: 'mid', text: '중급', cost: 50 }, locked: { from: 4, tier: 'high', text: '상급', cost: 70 } }[target];
    const next = { ...base, enhance: stage.from + 1, power: base.power + 3 };
    const c = compareItems({ ...base, enhance: stage.from }, next, { ...save, power: base.power, hp: 128 });
    // Upgrade changes the selected item; equip requirements are shown separately.
    $('#p2-upgrade-detail').innerHTML = `<div class="p2-item-heading">${emblem({ ...base, enhance: stage.from })}<div><h3>${base.name} +${stage.from} → +${stage.from + 1}</h3><small>단계별 비용 [제안] · 파손/실패 없음</small></div></div>${linesHtml(c)}<div class="p2-stones">${[['low','하급','+1~+2'],['mid','중급','+3~+4'],['high','상급','+5']].map(([key, text, levels]) => `<div>${icon('stone-' + key)}<span>${text} ${levels}<small>보유 ${stones === 'missing' && key === stage.tier ? 0 : key === 'low' ? 3 : 2} / 필요 ${key === stage.tier ? 2 : 0}</small></span>${key === stage.tier ? '<b>사용</b>' : ''}</div>`).join('')}</div><p class="p2-hint">${stones === 'missing' ? `${stage.text} 강화석 2개 부족 · 몬스터 드랍으로 획득` : `${stage.text} 강화석 2개와 ${stage.cost} G로 강화 가능`}</p><p class="minor">골드: 보유 240 / 필요 ${stage.cost} G<br>고철은 제작·분해 전용, 강화에 사용하지 않음${base.requiredLevel > save.level ? '<br>강화와 별개: 필요 Lv.7 · 현재 장착 불가' : ''}</p>`;
    $('#p2-upgrade-action').disabled = stones === 'missing';
    $('#p2-upgrade-action').textContent = stones === 'missing' ? '강화 불가 · 강화석 부족' : `강화 · ${stage.text} 2개 + ${stage.cost} G`;
  }
  function reveal() {
    const it = [bag[2], bag[9], bag[5]][revealed];
    if (!it) return;
    revealed++;
    $('#p2-loot').insertAdjacentHTML('beforeend', `<article class="p2-loot-card ${it.rarity === 'rare' || it.rarity === 'epic' ? 'sheen' : ''}" data-loot="${it.uid}">${card(it)}<div class="p2-three"><button data-p2-item="${it.uid}" data-p2-mode="장착">장착</button><button data-p2-loot-action="보관" data-uid="${it.uid}">보관</button><button data-p2-loot-action="분해" data-uid="${it.uid}">분해</button></div><small class="p2-loot-status" role="status">${grades[it.rarity]} · 확보된 전리품</small></article>`);
    $('#p2-reveal-count').textContent = `공개 ${revealed} / 3 · 정산 확정 장비`;
    $('#p2-reveal').textContent = revealed === 3 ? '모든 장비 공개 완료' : '다음 장비 하나 공개';
    $('#p2-reveal').disabled = revealed === 3;
  }
  function preview(text) {
    $('#p2-sheet-title').textContent = '목업 확인';
    $('#p2-sheet-body').innerHTML = `<p>${text}</p><p class="p2-hint">정적 목업 · 실제 장착/구매/판매/강화/분해·저장 변화 없음</p>`;
    $('#p2-sheet-footer').innerHTML = '<button class="primary" data-p2-close>확인</button>';
    if (!$('#compare-sheet').open) { opener = document.activeElement; $('#compare-sheet').showModal(); }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.p2Item) openSheet(allItems.find(i => i.uid === d.p2Item), d.p2Mode);
    else if (d.p2Slot) openSlot(d.p2Slot);
    else if (d.p2Case) openSheet(bag.find(i => i.uid === d.p2Case));
    else if (d.p2Filter) { filter = d.p2Filter; document.querySelectorAll('[data-p2-filter]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.p2Filter === filter))); renderBag(); }
    else if ('p2Sort' in d) { sort = (sort + 1) % 3; b.textContent = '정렬: ' + ['등급','최근','무게'][sort]; renderBag(); }
    else if (d.p2Shop) { shop = d.p2Shop; document.querySelectorAll('[data-p2-shop]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.p2Shop === shop))); renderStock(); }
    else if ('p2Refresh' in d) { const paid = 20 * 2 ** refresh; refresh = Math.min(2, refresh + 1); b.textContent = `골드로 갱신 (${20 * 2 ** refresh}G)`; $('#p2-refresh-note').textContent = `목업 갱신 ${paid} G · 판 갱신 시 20G`; }
    else if ('p2Reveal' in d) reveal();
    else if (d.p2Target) { target = d.p2Target; document.querySelectorAll('[data-p2-target]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.p2Target === target))); renderUpgrade(); }
    else if (d.p2Stones) { stones = d.p2Stones; document.querySelectorAll('[data-p2-stones]').forEach(n => n.setAttribute('aria-pressed', String(n.dataset.p2Stones === stones))); renderUpgrade(); }
    else if ('p2Upgrade' in d) preview('강화 재료와 골드 사용을 확인하는 화면 예시.');
    else if ('p2Confirm' in d) preview('선택한 행동의 확인 화면 예시.');
    else if (d.p2LootAction === '보관') b.closest('article').querySelector('.p2-loot-status').textContent = '보관 선택 · 실제 저장 없음';
    else if (d.p2LootAction === '분해') { const it = bag.find(i => i.uid === d.uid); preview(`${it.name} 분해 확인 · 고철 +${{ common: 2, fine: 5, rare: 12, epic: 30 }[it.rarity]} · 취소는 Escape/닫기`); }
    else if ('p2Close' in d) $('#compare-sheet').close();
  });
  $('#compare-sheet').addEventListener('close', () => opener?.focus({ preventScroll: true }));
  let hold;
  document.addEventListener('pointerdown', e => { const b = e.target.closest('#p2-grid [data-p2-item]'); if (b) hold = setTimeout(() => { if (!$('#compare-sheet').open) openSheet(bag.find(i => i.uid === b.dataset.p2Item)); }, 500); });
  ['pointerup','pointercancel','pointermove'].forEach(type => document.addEventListener(type, () => clearTimeout(hold)));
  renderBag(); renderStock(); renderUpgrade();
  // Read-only test surface for fixture/schema assertions.
  window.P2Mock = Object.freeze({ compareItems, save, equipped, bag, stock, grades, slots });
})();
