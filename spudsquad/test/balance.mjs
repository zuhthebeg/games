import D from '../js/data.js';
import S from '../js/sim.js';
const chars = process.env.SPUD_BALANCE_CHARS?.split(',') || Object.keys(D.chars);
const games = Number(process.argv[2] || 20);
const rngFor = seed => {
  let value = seed >>> 0;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0) / 2 ** 32);
};
function aim(world, player) {
  const target = world.enemies.reduce((best, e) => {
    const d = Math.hypot(player.x - e.x, player.y - e.y);
    return d < best.d ? { e, d } : best;
  }, { e: null, d: Infinity });
  const pickup = world.drops.reduce((best, d) => {
    const distance = Math.hypot(player.x - d.x, player.y - d.y);
    return distance < best.distance ? { d, distance } : best;
  }, { d: null, distance: Infinity });
  let dx = 0, dy = 0;
  // 포대감자(이동 중 공격 불가): 180px 안에 적이 없으면 제자리에 서서 쏜다(카이팅↔정지 교대).
  if (D.chars[player.char].noMoveAttack && (!target.e || target.d > 180)) return;
  if (target.e && target.d < 400) {
    dx += (player.x - target.e.x) / Math.max(target.d, 1) * 2.5;
    dy += (player.y - target.e.y) / Math.max(target.d, 1) * 2.5;
  }
  if (pickup.d) {
    const distance = Math.max(pickup.distance, 1);
    const weight = target.d < 200 ? .15 : .8;
    dx += (pickup.d.x - player.x) / distance * weight;
    dy += (pickup.d.y - player.y) / distance * weight;
  }
  if (player.x < 150) dx += 2;
  if (player.x > D.W - 150) dx -= 2;
  if (player.y < 150) dy += 2;
  if (player.y > D.H - 150) dy -= 2;
  dx += (player.botDx || 0) * 1.6;
  dy += (player.botDy || 0) * 1.6;
  const length = Math.hypot(dx, dy);
  player.botDx = length ? dx / length : 0;
  player.botDy = length ? dy / length : 0;
  const speed = 200 * (1 + S.effectiveStats(player).speed / 100);
  if (length > 0) {
    player.x = S.clamp(player.x + player.botDx * speed / 30, 0, D.W);
    player.y = S.clamp(player.y + player.botDy * speed / 30, 0, D.H);
    player.f = dx < 0 ? -1 : 1;
  }
}
function between(world, player) {
  S.enterShop(player, world.rng); // 상점 입장 훅(모루) — 게임에선 main.js WAVE_END에서 호출
  for (let i = 0; i < (player.pendingCrates?.length || 0); i++) {
    const id = S.rollCrateItem(world, player);
    S.grantItem(player, id);
  }
  for (let i = 0; i < player.levelUps; i++) {
    const best = S.rollUpgrades(player, world.rng)
      .sort((a, b) => b.grade - a.grade || b.value - a.value)[0];
    player.stats[best.id] += best.value;
    if (best.id === 'maxHp') { player.maxHp += best.value; player.hp += best.value; }
  }
  const slots = S.shop(world, player);
  const classCounts = S.sets(player);
  const score = offer => {
    const item = (offer.weapon ? D.weapons : D.items)[offer.id];
    const relevant = offer.weapon ? Math.max(0, ...item.classes.map(c => classCounts[c]?.count || 0)) : 0;
    return relevant * 1000 + offer.price;
  };
  for (const offer of slots.sort((a, b) => score(b) - score(a))) S.buy(player, offer);
  if (player.char === 'basic') {
    for (const offer of S.shop(world, player).sort((a, b) => score(b) - score(a))) S.buy(player, offer);
  }
}
function play(char, seed) {
  const random = rngFor(seed);
  let saved = { char };
  let bosses = 0, encountered = 0;
  for (let wave = 1; wave <= 20; wave++) {
    const world = S.createWorld({ wave, players: { solo: saved }, rng: random });
    if (wave === 10 || wave === 20) encountered++;
    for (let tick = 0; tick < 12000 && !world.ended; tick++) {
      aim(world, world.players.solo);
      S.step(world, 1 / 30);
      world.fx.length = 0;
    }
    const player = world.players.solo;
    if (process.env.SPUD_BALANCE_TRACE && seed === 1001) console.log('trace', char, wave, {hp: player.hp, mats:player.mats, kills:player.kills, shots:world.projectiles.length, tick:world.tick, drops:world.drops.length});
    bosses += world.bossKills;
    if (!world.ended || !player.alive || world.win) return { wave, won: world.win, bosses, encountered };
    between(world, player);
    saved = {
      char, weapons: player.weapons, items: player.items, stats: player.stats,
      mats: player.mats, xp: player.xp, lvl: player.lvl, pending: player.pending
    };
  }
  return { wave: 20, won: true, bosses, encountered };
}
const rows = [];
for (const [index, char] of chars.entries()) {
  const results = [];
  for (let seed = 0; seed < games; seed++) results.push(play(char, 1001 + seed * 9173));
  const reached = results.map(x => x.wave).sort((a, b) => a - b);
  rows.push({ char, mean: reached.reduce((sum, n) => sum + n, 0) / games,
    median: (reached[(games - 1) >> 1] + reached[games >> 1]) / 2,
    clear: results.filter(x => x.won).length / games * 100,
    boss: results.reduce((sum, x) => sum + x.bosses, 0),
    encountered: results.reduce((sum, x) => sum + x.encountered, 0) });
  console.log(`${index + 1}/${chars.length} ${char} ${JSON.stringify(rows.at(-1))}`);
}
const mean = rows.reduce((sum, row) => sum + row.mean, 0) / rows.length;
console.log('overall', mean.toFixed(2));
console.log('| Character | Mean reached | Median | Wave 20 clear | Boss clears/encounters |');
console.log('|---|---:|---:|---:|---:|');
for (const r of rows) {
  console.log(`| ${r.char} | ${r.mean.toFixed(2)} | ${r.median.toFixed(1)} | ${r.clear.toFixed(1)}% | ${r.boss}/${r.encountered} |`);
}
console.log('goal: basic 9–14, all ±40% overall, each boss clear rate neither 0% nor 100%');
console.log('pass:', rows.find(x => x.char === 'basic').mean >= 9 &&
  rows.find(x => x.char === 'basic').mean <= 14 &&
  rows.every(x => x.mean >= mean * .6 && x.mean <= mean * 1.4 && x.boss > 0 && x.boss < x.encountered));
