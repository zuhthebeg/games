import { ENEMIES } from '../content/enemies.js';

function normalHpForModel(model) {
  return Math.max(0, ...Object.values(ENEMIES)
    .filter((enemy) => enemy.model === model && enemy.behavior !== 'boss-patterns')
    .map((enemy) => enemy.hp));
}

function bossHpForModel(model) {
  return Math.min(Infinity, ...Object.values(ENEMIES)
    .filter((enemy) => enemy.model === model && enemy.behavior === 'boss-patterns')
    .map((enemy) => enemy.hp));
}

export function deathTierForEntity(entity, traits = {}) {
  const enemyKind = entity.enemyKind ?? traits.enemyKind;
  const baseHp = ENEMIES[enemyKind]?.hp ?? normalHpForModel(entity.model);
  const bossBaseHp = bossHpForModel(entity.model);
  const boss = entity.kind === 'enemy' && (
    entity.boss === true
    || traits.boss === true
    || ENEMIES[enemyKind]?.behavior === 'boss-patterns'
    || (!enemyKind && bossBaseHp < Infinity && entity.maxHp >= baseHp * 4.5)
  );
  const elite = entity.kind === 'enemy' && !boss && (
    entity.elite === true
    || traits.elite === true
    || (baseHp > 0 && entity.maxHp >= baseHp * 1.5)
  );
  return { enemyKind, boss, elite };
}
