import { WEAPONS, ABILITIES, PLAYER_BASE, STAGES } from '../content/combat.js';
import { ticks } from '../sim/core.js';
import { weightDescription } from './hub.js';
import { MAX_LEVEL, xpSpan } from '../meta/progression.js';
import { MONSTER_NAMES } from '../content/monsters.js';
import { icon } from './icons.js';
import { skillIcon } from './skill-view.js';

const $ = (selector) => document.querySelector(selector);
const PATTERN_NAMES = {
  goblin_slash: '고블린의 베기',
  goblin_hop: '고블린의 도약',
  sling_stone: '투석병의 돌팔매',
  boar_charge: '멧돼지 돌진',
  boar_gore: '멧돼지의 엄니',
  chief_cleave: '대장의 가르기',
  chief_charge: '대장의 돌진',
  chief_slam: '대장의 내려찍기',
  wolf_dash: '늑대의 돌진', wolf_bite: '늑대의 물기',
  guardian_crush: '룬 수호자의 강타', guardian_ring: '룬 수호자의 광역 강타',
  spirit_bolt: '정령의 원소탄', spider_bite: '독거미의 물기 · 중독', spider_puddle: '독 장판 · 중독',
};
const seconds = (value) => `${(value / 30).toFixed(1)}`;
const SLOT_NODES = ['skill', 'skill2', 'skill3'];
const SLOT_KEYS = ['K', 'L', ';'];

export function remainingMonsters(world) {
  if (world.round?.state === 'victory' || world.round?.state === 'clear' || world.entities[0]?.terminal === 'clear') return 0;
  return world.entities.filter(entity => entity.kind === 'monster' && !entity.dead).length + (world.round?.pending?.length || 0);
}

export class HUD {
  constructor() {
    this.noticeLeft = 0;
    this.nodes = {};
    for (const id of [
      'hp-fill', 'hp-text', 'mp-fill', 'mp-text', 'stage-name', 'objective', 'potion', 'mana',
      'green', 'green-active', 'scroll', 'skill', 'skill2', 'skill3', 'dodge', 'attack', 'notice', 'load-fill', 'load-text', 'temp-loot',
      'lv-text', 'xp-fill', 'xp-pending',
    ]) this.nodes[id] = $(`#${id}`);
    this.party = document.createElement('section');
    this.party.id = 'party-vitals';
    this.party.setAttribute('aria-label', '파티원 HP');
    this.party.hidden = true;
    $('#hud').append(this.party);
    this.partyRows = new Map();
  }

  showClear() {
    if (!this.clearBanner) {
      const banner = document.createElement('div');
      banner.id = 'arpg-clear-banner'; banner.textContent = '스테이지 클리어!';
      banner.setAttribute('role', 'status');
      $('#hud').append(banner); this.clearBanner = banner;
    }
  }
  hideClear() { this.clearBanner?.remove(); this.clearBanner = null; }

  // `loadout` is the saved slot list; a slot the sim emptied for this weapon shows ✕.
  begin(world, loadout = []) {
    this.sanctuary = world.round?.goal === 'sanctuary';
    this.graveyard = world.round?.presentation?.lineage === 'skeleton_knight';
    if (this.graveyard) document.body.dataset.theme = 'graveyard';
    else delete document.body.dataset.theme;
    this.stage = this.sanctuary ? '법당' : STAGES[world.round?.stageId]?.name || '언데드 · 해골 · 저장 안 됨';
    if (world.round?.presentation?.lineage === 'skeleton_knight') this.stage += world.round.presentation.form === 'death_knight' ? ' · 데스나이트' : ' · 해골';
    const skills = world.entities[0].skills;
    SLOT_NODES.forEach((key, i) => {
      const node = this.nodes[key], id = skills[i] || loadout[i] || null;
      node.hidden = !id;
      node.classList.toggle('blocked', !skills[i] && !!id);
      node.querySelector('.slot-blocked')?.remove();
      node.querySelector('.icon, .skill-icon')?.remove();
      if (!id) return;
      node.insertAdjacentHTML('afterbegin', skillIcon(id));
      const name = ABILITIES[id].name;
      node.setAttribute('aria-label', name);
      node.title = `${name} · ${SLOT_KEYS[i]}`;
      let label = node.querySelector('.skill-label');
      if (!label) { label = document.createElement('span'); label.className = 'skill-label'; node.insertBefore(label, node.lastElementChild); }
      label.textContent = name;
      if (!skills[i]) node.insertAdjacentHTML('afterbegin', '<i class="slot-blocked" aria-hidden="true">✕</i>');
    });
    for (const key of [...SLOT_NODES, 'dodge', 'attack', 'green', 'green-active', 'potion', 'mana']) this.nodes[key].hidden = this.sanctuary;
    $('#hud').hidden = false;
    $('#pause').hidden = true;
    this.nodes.notice.textContent = '';
    this.noticeLeft = 0;
    if (this.sanctuary) {
      this.nodes.notice.textContent = '비전투 공간 · 보상·저장 없음';
      this.noticeLeft = Infinity;
      this.nodes.scroll.setAttribute('aria-label', '여관으로 돌아가기');
      this.nodes.scroll.title = '여관으로 돌아가기 · R';
    }
    this.nodes['stage-name'].textContent = this.stage;
    this.update(world, 0);
  }

  showUndeadResult(state, { next, restart, leave }) {
    if (this.undeadResult) return;
    const panel = document.createElement('section');
    panel.id = 'undead-result';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', '언데드 전투 결과');
    const title = document.createElement('h2');
    title.textContent = state === 'victory' ? '해골 승리' : state === 'death' ? '전투 종료 · 쓰러졌습니다' : '전투 종료 · 귀환';
    title.setAttribute('role', 'status');
    const detail = document.createElement('p');
    detail.textContent = '같은 상대와 다시 전투합니다. 캠페인 진행·보상·저장 없음. 회피 불가.';
    panel.append(title, detail);
    const actions = state === 'victory' ? [['next', '다음 전투', next], ['restart', '다시 시작', restart]]
      : [['restart', '다시 시작', restart]];
    actions.push(['leave', '인간으로 돌아가기', leave]);
    for (const [id, label, run] of actions) {
      const button = document.createElement('button');
      button.type = 'button'; button.dataset.undeadAction = id; button.textContent = label;
      // Hiding the held attack can retarget its trailing touch click here.
      // Require a fresh press on this result button; keyboard activation has detail=0.
      let pressed = false;
      button.addEventListener('pointerdown', () => { pressed = true; });
      button.addEventListener('pointercancel', () => { pressed = false; });
      button.addEventListener('click', event => {
        if (event.detail > 0 && !pressed) return;
        pressed = false;
        run();
      });
      panel.append(button);
    }
    const controls = $('#actions');
    this.undeadControlsHidden = controls.hidden;
    controls.hidden = true;
    this.undeadResult = panel;
    $('#hud').append(panel);
  }

  clearUndeadResult() {
    if (!this.undeadResult) return;
    this.undeadResult.remove();
    this.undeadResult = null;
    $('#actions').hidden = this.undeadControlsHidden;
  }

  pause(hidden) {
    $('#pause').hidden = !hidden;
  }

  events(events) {
    const messages = {
      lootClaimed: '전리품 획득',
      channelStart: '귀환 중',
      channelBroken: '귀환 중단',
      channelCancel: '귀환 취소',
    };
    for (const event of events) {
      const message = event.type === 'drop' && event.rejected ? '무게 초과' : messages[event.type];
      if (!message) continue;
      this.nodes.notice.textContent = message;
      this.noticeLeft = 2;
    }
  }

  meta(load, tracker, save) {
    const tier = weightDescription(load.weight, load.capacity);
    const bar = this.nodes['load-fill'];
    bar.style.transform = `scaleX(${Math.min(1, load.ratio / 1.2)})`;
    bar.parentElement.className = `bar load ${tier.tier}`;
    bar.parentElement.title = tier.text;
    bar.parentElement.setAttribute('role', 'img');
    bar.parentElement.setAttribute('aria-label', `가방 무게 ${Math.round(load.weight)}/${Math.round(load.capacity)} · ${tier.text}`);
    this.text(this.nodes['load-text'], `${Math.round(load.weight)}/${Math.round(load.capacity)}`);
    if (save) {
      const maxed = save.level >= MAX_LEVEL, span = maxed ? 1 : xpSpan(save.level);
      const base = maxed ? 1 : save.xp / span, pending = maxed ? 0 : Math.min(1 - base, tracker.depositedXp / span);
      this.text(this.nodes['lv-text'], `Lv ${save.level}`);
      this.nodes['xp-fill'].style.transform = `scaleX(${base})`;
      this.nodes['xp-pending'].style.transform = `translateX(${base * 100}%) scaleX(${pending})`;
      this.nodes['xp-fill'].parentElement.title = maxed ? 'MAX' : `XP ${Math.floor(save.xp)}+${Math.floor(tracker.depositedXp)}/${span}`;
    }
    const count = tracker.tempLoot.items.length
      + Object.values(tracker.tempLoot.stacks).reduce((sum, value) => sum + value, 0);
    this.text(this.nodes['temp-loot'], `◇ ${count} · ${tracker.tempLoot.gold} G · ${tracker.depositedXp} XP`);
  }

  update(world, dt) {
    const player = world.entities[0];
    this.updateParty(world, player);
    const nodes = this.nodes;
    nodes['hp-fill'].style.transform = `scaleX(${player.hp / player.maxHp})`;
    nodes['mp-fill'].style.transform = `scaleX(${player.mp / player.maxMp})`;
    this.text(nodes['hp-text'], `${this.graveyard ? 'HP ' : ''}${Math.ceil(player.hp)}/${Math.ceil(player.maxHp)}`);
    this.text(nodes['mp-text'], `${this.graveyard ? 'MP ' : ''}${Math.floor(player.mp)}/${Math.ceil(player.maxMp)}`);
    const alive = world.entities.filter((entity) => entity.kind === 'monster' && !entity.dead).length;
    const objective = world.round?.objective;
    this.text(nodes.objective, this.sanctuary ? '비전투 공간 · 보상·저장 없음' : !world.round ? `상대: ${alive}/1 · 보상 없음` : objective?.kind === 'kill-target' ? `가고일 처치: ${objective.state === 'complete' ? 1 : 0}/1` : objective?.kind === 'visit-markers' ? `길 표식: ${objective.markers.filter((_,i)=>objective.visited & (1 << i)).length}/${objective.markers.length} · 체류: ${Math.max(0,...Object.values(objective.progress))}/${objective.dwellTicks}` : objective ? `목표: ${objective.state === 'complete' ? '완료' : objective.carrier !== null ? '장부→입구' : '장부 회수'} · 체류: ${Math.max(0, ...Object.values(objective.progress))}/15` : world.round.goal === 'timer'
      ? `${Math.max(0, Math.ceil((world.round.timerTicks - world.round.t) / 30))}s`
      : `◇ ${remainingMonsters(world)}`);
    this.text(nodes.green.lastElementChild, player.greenPotions ?? 0);
    nodes['green-active'].hidden = !player.greenActive;
    nodes.green.classList.toggle('active', !!player.greenActive);
    nodes.green.disabled = !(player.greenPotions > 0) || !!player.greenActive || !!player.dead || !!player.terminal || world.round?.state !== 'running';
    const potionCooldown = player.potionCd > 0 ? ` · ${seconds(player.potionCd)}` : '';
    this.text(nodes.potion.lastElementChild, `${player.potions}${potionCooldown}`);
    this.text(nodes.mana.lastElementChild, `${player.manaPotions}${potionCooldown}`);
    this.text(nodes.scroll.lastElementChild, this.sanctuary ? '나가기' : player.channel > 0 ? seconds(player.channel)
      : `${player.scrolls}${player.scrollRetry > 0 ? ` · ${seconds(player.scrollRetry)}` : ''}`);
    nodes.scroll.style.setProperty('--progress',
      `${player.channel > 0 ? (1 - player.channel / ticks(PLAYER_BASE.scroll.channelMs)) * 100 : 0}%`);
    SLOT_NODES.forEach((key, i) => {
      const node = nodes[key], skill = player.skills[i];
      if (!skill) { node.disabled = true; return; }
      const cooldown = player.cds[skill] || 0;
      const skillAct = player.act?.id === skill;
      const needsMana = player.mp < (ABILITIES[skill].manaCost || 0);
      const needsDodge = ABILITIES[skill].dodgeShot && (player.dodgeDisabled || player.dodge.cdLeft > 0 || player.dodge.dashLeft > 0);
      this.text(node.lastElementChild, cooldown > 0 ? seconds(cooldown) : skillAct ? '…' : needsMana ? '−' : '');
      node.style.setProperty('--progress', `${cooldown / ticks(ABILITIES[skill].cooldownMs) * 100}%`);
      node.disabled = player.shieldGuard?.left > 0 || cooldown > 0 || skillAct || player.channel > 0 || needsMana || !!needsDodge;
    });
    this.text(nodes.dodge.lastElementChild, player.dodge.cdLeft > 0 ? seconds(player.dodge.cdLeft) : '');
    nodes.dodge.disabled = !!player.dodgeDisabled;
    const block=player.offhand === 'shield', label=block?'막기':'회피';
    nodes.dodge.setAttribute('aria-label',label);
    if (nodes.dodge.dataset.guard !== String(block)) { nodes.dodge.dataset.guard=String(block);nodes.dodge.querySelector('svg')?.remove();nodes.dodge.insertAdjacentHTML('afterbegin',icon(block?'offhand':'dodge')); }
    let guardLabel=nodes.dodge.querySelector('.guard-label');
    if(block && !guardLabel){nodes.dodge.querySelector('small').insertAdjacentHTML('beforebegin','<span class="guard-label">막기</span>');}
    else if(!block)guardLabel?.remove();
    nodes.dodge.title = player.dodgeDisabled ? '회피 불가' : `${label} · ⇧`;
    nodes.dodge.className = player.dodge.cdLeft > 0 ? 'cooling' : 'ready';
    // Held attack is never disabled: release must always reach InputLayer.
    nodes.potion.disabled = player.potions === 0 || player.potionCd > 0 || player.hp === player.maxHp;
    nodes.mana.disabled = player.manaPotions === 0 || player.potionCd > 0 || player.mp === player.maxMp;
    nodes.scroll.disabled = this.sanctuary ? false : player.scrolls === 0 || player.scrollRetry > 0 || player.channel > 0 || !!player.act;
    if (this.noticeLeft > 0) {
      this.noticeLeft -= dt;
      if (this.noticeLeft <= 0) nodes.notice.textContent = '';
    }
  }

  text(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  updateParty(world, local) {
    const members = world.entities.filter(p => p.kind === 'player' && p.id !== local.id && p.team === local.team && !(p.invisibleUntil>world.tick));
    const ids = new Set(members.map(p => p.id));
    for (const [id, row] of this.partyRows) if (!ids.has(id)) {
      row.remove();
      this.partyRows.delete(id);
    }
    this.party.hidden = members.length === 0;
    for (const p of members) {
      let row = this.partyRows.get(p.id);
      if (!row) {
        row = document.createElement('div');
        row.className = 'party-member';
        row.innerHTML = '<span class="party-name"></span><span class="party-state"></span><div class="bar hp" role="meter"><i></i><span></span></div>';
        this.partyRows.set(p.id, row);
        this.party.append(row);
      }
      const name = p.name || '모험가';
      const max = Math.max(1, Math.ceil(p.maxHp));
      const hp = Math.max(0, Math.min(max, Math.ceil(p.hp)));
      const state = p.dead || p.terminal === 'death' ? '쓰러짐' : p.terminal === 'return_scroll' ? '귀환' : p.terminal ? '전투 완료' : '';
      this.text(row.children[0], name);
      row.children[0].title = name;
      this.text(row.children[1], state);
      row.classList.toggle('inactive', !!state);
      const bar = row.children[2];
      bar.setAttribute('aria-label', `${name} HP${state ? ` · ${state}` : ''}`);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(max));
      bar.setAttribute('aria-valuenow', String(hp));
      bar.firstElementChild.style.transform = `scaleX(${hp / max})`;
      this.text(bar.lastElementChild, `${hp}/${max}`);
    }
  }

  deathExplanation(world) {
    const player = world.entities[0];
    const cause = player.deathCause;
    if (player.terminal === 'death' && cause) {
      const humanRole = world.round?.presentation?.humans?.[cause.by];
      const name = humanRole ? `인간 모험가 · ${{blade:'근접',bow:'원거리',focus:'마법'}[humanRole] || '전투'}` : MONSTER_NAMES[cause.by] || '적';
      return `${name} · ${PATTERN_NAMES[cause.ability] || ABILITIES[cause.ability]?.name || '공격'}`;
    }
    if (world.round?.presentation?.lineage === 'skeleton_knight') {
      return player.terminal === 'return_scroll' ? '주문서의 빛이 당신을 잊힌 묘지로 이끌었습니다.'
        : '영혼에 힘이 깃들었다. 잊힌 묘지에서 다음 길을 준비하자.';
    }
    return player.terminal === 'return_scroll' ? '주문서의 빛이 당신을 여관으로 이끌었습니다.'
      : '인장에 힘이 깃들었다. 난로 곁에서 다음 길을 준비하자.';
  }
}
