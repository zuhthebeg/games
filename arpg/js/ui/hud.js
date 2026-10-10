import { WEAPONS, ABILITIES, PLAYER_BASE } from '../content/combat.js';
import { ticks } from '../sim/core.js';
import { weightDescription } from './hub.js';

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
};
const MONSTER_NAMES = {
  goblin_grunt: '고블린', goblin_slinger: '고블린 투석병', iron_boar: '철갑 멧돼지', goblin_chief: '고블린 대장',
};
const seconds = (value) => `${(value / 30).toFixed(1)}`;

export class HUD {
  constructor() {
    this.noticeLeft = 0;
    this.nodes = {};
    for (const id of [
      'hp-fill', 'hp-text', 'mp-fill', 'mp-text', 'stage-name', 'objective', 'potion', 'mana',
      'scroll', 'skill', 'dodge', 'attack', 'notice', 'load-fill', 'load-text', 'temp-loot',
    ]) this.nodes[id] = $(`#${id}`);
  }

  begin(world) {
    this.stage = world.round.stageId;
    $('#hud').hidden = false;
    $('#pause').hidden = true;
    this.nodes.notice.textContent = '';
    this.noticeLeft = 0;
    this.nodes['stage-name'].textContent = this.stage;
    this.update(world, 0);
  }

  pause(hidden) {
    $('#pause').hidden = !hidden;
  }

  events(events) {
    const messages = {
      channelStart: '귀환 중',
      channelBroken: '귀환 중단',
      channelCancel: '귀환 취소',
      perfectDodge: '완벽 회피',
    };
    for (const event of events) {
      const message = event.type === 'drop' && event.rejected ? '무게 초과' : messages[event.type];
      if (!message) continue;
      this.nodes.notice.textContent = message;
      this.noticeLeft = 2;
    }
  }

  meta(load, tracker) {
    const tier = weightDescription(load.weight, load.capacity);
    const bar = this.nodes['load-fill'];
    bar.style.transform = `scaleX(${Math.min(1, load.ratio / 1.2)})`;
    bar.parentElement.className = `bar load ${tier.tier}`;
    bar.parentElement.title = tier.text;
    this.text(this.nodes['load-text'], `${load.weight.toFixed(1)}/${load.capacity}`);
    const count = tracker.tempLoot.items.length
      + Object.values(tracker.tempLoot.stacks).reduce((sum, value) => sum + value, 0);
    this.text(this.nodes['temp-loot'], `◇ ${count} · ${tracker.tempLoot.gold} G · ${tracker.depositedXp} XP`);
  }

  update(world, dt) {
    const player = world.entities[0];
    const nodes = this.nodes;
    nodes['hp-fill'].style.transform = `scaleX(${player.hp / player.maxHp})`;
    nodes['mp-fill'].style.transform = `scaleX(${player.mp / player.maxMp})`;
    this.text(nodes['hp-text'], `${Math.ceil(player.hp)}/${Math.ceil(player.maxHp)}`);
    this.text(nodes['mp-text'], `${Math.floor(player.mp)}/${Math.ceil(player.maxMp)}`);
    const alive = world.entities.filter((entity) => entity.kind === 'monster' && !entity.dead).length;
    this.text(nodes.objective, world.round.goal === 'timer'
      ? `${Math.max(0, Math.ceil((world.round.timerTicks - world.round.t) / 30))}s`
      : `◇ ${alive + world.round.pending.length}`);
    const potionCooldown = player.potionCd > 0 ? ` · ${seconds(player.potionCd)}` : '';
    this.text(nodes.potion.lastElementChild, `${player.potions}${potionCooldown}`);
    this.text(nodes.mana.lastElementChild, `${player.manaPotions}${potionCooldown}`);
    this.text(nodes.scroll.lastElementChild, player.channel > 0 ? seconds(player.channel)
      : `${player.scrolls}${player.scrollRetry > 0 ? ` · ${seconds(player.scrollRetry)}` : ''}`);
    nodes.scroll.style.setProperty('--progress',
      `${player.channel > 0 ? (1 - player.channel / ticks(PLAYER_BASE.scroll.channelMs)) * 100 : 0}%`);
    const skill = WEAPONS[player.weapon].skill;
    const cooldown = player.cds[skill] || 0;
    const skillAct = player.act?.id === skill;
    const needsMana = player.mp < (ABILITIES[skill].manaCost || 0);
    this.text(nodes.skill.lastElementChild, cooldown > 0 ? seconds(cooldown)
      : skillAct ? '…' : needsMana ? '−' : '');
    nodes.skill.style.setProperty('--progress', `${cooldown / ticks(ABILITIES[skill].cooldownMs) * 100}%`);
    this.text(nodes.dodge.lastElementChild, player.dodge.cdLeft > 0 ? seconds(player.dodge.cdLeft) : '');
    nodes.dodge.className = player.dodge.cdLeft > 0 ? 'cooling' : 'ready';
    // Held attack is never disabled: release must always reach InputLayer.
    nodes.potion.disabled = player.potions === 0 || player.potionCd > 0 || player.hp === player.maxHp;
    nodes.mana.disabled = player.manaPotions === 0 || player.potionCd > 0 || player.mp === player.maxMp;
    nodes.scroll.disabled = player.scrolls === 0 || player.scrollRetry > 0 || player.channel > 0 || !!player.act;
    nodes.skill.disabled = cooldown > 0 || skillAct || player.channel > 0 || needsMana;
    if (this.noticeLeft > 0) {
      this.noticeLeft -= dt;
      if (this.noticeLeft <= 0) nodes.notice.textContent = '';
    }
  }

  text(node, value) {
    if (node.textContent !== value) node.textContent = value;
  }

  deathExplanation(world) {
    const player = world.entities[0];
    const cause = player.deathCause;
    if (player.terminal === 'death' && cause) {
      return `${MONSTER_NAMES[cause.by] || cause.by} · ${PATTERN_NAMES[cause.ability] || cause.ability}`;
    }
    return player.terminal === 'return_scroll' ? '주문서의 빛이 당신을 여관으로 이끌었습니다.'
      : '인장에 힘이 깃들었다. 난로 곁에서 다음 길을 준비하자.';
  }
}
