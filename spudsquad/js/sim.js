(function(root) {
  "use strict";
  const D = root.SPUD?.data || (typeof require === "function" ? require("./data.js") : null);
  const rand = (w) => w.rng();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  // 점(px,py)과 선분(ax,ay)-(bx,by) 최단거리
  const segDist = (ax, ay, bx, by, px, py) => {
    const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / L)) : 0;
    return Math.hypot(px - ax - vx * t, py - ay - vy * t);
  };
  function waveLength(w) {
    return Math.min(20 + 5 * (w - 1), 60);
  }
  function enemyStats(type, w, n) {
    const e = D.enemies[type];
    const k = D.curve || {};
    // 21웨이브 이후(무한 모드)는 HP ×1.1·피해 ×1.06 복리로 더 가파르게 → 언젠가는 끝난다.
    return { hp: e.hp * (1 + (k.hpPerWave ?? 0.35) * (w - 1)) * (1 + (k.mpHp ?? 0.25) * (n - 1)) * 1.1 ** Math.max(0, w - 20),
      dmg: e.dmg * (1 + (k.dmgPerWave ?? 0.12) * (w - 1)) * (1 + (k.mpDmg ?? 0) * (n - 1)) * 1.06 ** Math.max(0, w - 20),
      speed: e.speed };
  }
  // 동시 생존 적 상한: 멀티는 렌더·스냅샷 부하 때문에 낮게(4인 렉 대응).
  function enemyCap(w) {
    const k = D.curve || {};
    return Object.keys(w.players).length > 1 ? (k.capMulti ?? 220) : (k.capSolo ?? 220);
  }
  // 돌연변이감자 등 캐릭터 xpNeed 배율(없으면 1)
  function needXp(lvl, char) {
    return Math.ceil((lvl + 3) ** 2 * (D.chars[char]?.xpNeed || 1));
  }
  function price(base, w) {
    return Math.ceil(base * (1 + 0.1 * (w - 1)));
  }
  function rerollCost(w, count) {
    return Math.ceil((1 + w + count) * 1.2);
  }
  function shopRerollCost(p, w, count, offers = []) {
    const cleared = offers.length === 4 && offers.every(o => o?.sold === true);
    return cleared || (p.char === 'basic' && count === 0) ? 0 : rerollCost(w, count);
  }
  function damageTaken(raw, armor) {
    return raw * (armor >= 0 ? 1 / (1 + armor / 15) : 1 + Math.abs(armor) / 15);
  }
  function rollDamage(base, p, kind, rng) {
    const crit = rng() * 100 < p.stats.crit;
    return { damage: Math.max(1, (base * (1 + p.stats.dmg / 100) + (p.stats[kind] || 0)) * (crit ? 2 : 1)), crit };
  }
  const setTable = {
    unarmed: { 2: { dodge: 3 }, 3: { dodge: 6 }, 4: { dodge: 9, melee: 2 }, 6: { dodge: 15, melee: 4 } },
    blade: { 2: { lifesteal: 2 }, 3: { lifesteal: 4 }, 4: { lifesteal: 6, crit: 5 },
      6: { lifesteal: 10, crit: 10 } },
    blunt: { 2: { maxHp: 3 }, 3: { maxHp: 6, armor: 1 }, 4: { maxHp: 9, armor: 2 },
      6: { maxHp: 15, armor: 4 } },
    gun: { 2: { range: 20 }, 3: { range: 40 }, 4: { range: 60, atkSpd: 5 },
      6: { range: 100, atkSpd: 10 } },
    precise: { 2: { crit: 3 }, 3: { crit: 6 }, 4: { crit: 9 }, 6: { crit: 15 } },
    explosive: { 2: { explosion: 10 }, 3: { explosion: 20 }, 4: { explosion: 30 },
      6: { explosion: 50 } },
    elemental: { 2: { elemental: 2 }, 3: { elemental: 4 }, 4: { elemental: 6 },
      6: { elemental: 10 } }
  };
  function sets(p) {
    const counts = {};
    for (const [id] of p.weapons) for (const name of D.weapons[id]?.classes || []) {
      counts[name] = (counts[name] || 0) + 1;
    }
    return Object.fromEntries(Object.entries(counts).map(([name, n]) => {
      const stage = [6, 4, 3, 2].find(t => n >= t) || 0;
      return [name, { count: n, stage, stats: setTable[name][stage] || {} }];
    }));
  }
  // 규칙형 효과 원천: 캐릭터 정의 + 보유 아이템 정의(data.js 규칙 필드 참고)
  const rulesOf = p => [D.chars[p.char], ...(p.items || []).map(id => D.items[id])].filter(Boolean);
  const ruleSum = (p, key) => rulesOf(p).reduce((n, d) => n + (d[key] || 0), 0);
  const hasRule = (p, key) => rulesOf(p).some(d => d[key]);
  function effectiveStats(p) {
    const result = { ...p.stats };
    const cuffed = hasRule(p, 'noMaxHp'); // 수갑: 세트 보너스의 최대HP 증가도 차단
    for (const group of Object.values(sets(p))) {
      for (const [key, value] of Object.entries(group.stats)) {
        if (!(cuffed && key === 'maxHp' && value > 0)) result[key] = (result[key] || 0) + value;
      }
    }
    const kinds = new Set(p.weapons.map(v => v[0])).size;
    for (const d of rulesOf(p)) {
      if (d.still && p.still) for (const [k, v] of Object.entries(d.still)) result[k] = (result[k] || 0) + v;
      if (d.moving && !p.still) for (const [k, v] of Object.entries(d.moving)) result[k] = (result[k] || 0) + v;
      if (d.perWeapon) for (const [k, v] of Object.entries(d.perWeapon)) result[k] = (result[k] || 0) + v * kinds;
      // 지혜의 두루마리: 웨이브 경과 시간 기반 일시 피해(스탯에 저장 안 함)
      if (d.ramp) result.dmg += d.ramp[0] + d.ramp[1] * Math.floor((p.waveT || 0) / d.ramp[2]);
    }
    result.maxHp = Math.max(1, result.maxHp);
    if (p.char === 'berserker') {
      result.regen = 0;
      result.dmg += Math.min(60, Math.floor((1 - p.hp / p.maxHp) * 10) * 6);
    }
    if (p.char === 'vampire') result.regen = 0;
    return result;
  }
  function capacity(p) { return p.char === 'cyclops' ? 1 : 6; }
  function createPlayer(uid, char = "basic", saved = {}) {
    const c = D.chars[char] || D.chars.basic;
    const s = { ...D.stats };
    for (const [k, v] of Object.entries(c.stats)) s[k] = (s[k] || 0) + v;
    if (char === 'ghost') s.maxHp = Math.round(s.maxHp * .5);
    Object.assign(s, saved.stats || {});
    const weapons = saved.weapons || c.weapons || [[c.weapon, 1]];
    const maxHp = Math.max(1, s.maxHp);
    // pending=상점에서 산 '다음 웨이브 1회' 효과. 웨이브 생성 시 active로 옮겨 소비한다(호스트·게스트 동일).
    const p = { uid, char, x: 800, y: 600, f: 1, stats: s, maxHp,
      hp: maxHp, alive: true, weapons: weapons.map(v => [...v]), items: [...(saved.items || [])],
      mats: saved.mats || 0, xp: saved.xp || 0, lvl: saved.lvl || 1, levelUps: 0,
      ultUsed: false, kills: 0, totalDamage: 0, cool: [], hurt: 0, steal: 0, immune: 0, nextCrit: false,
      pending: {}, active: { ...(saved.pending || {}) }, waveT: 0 };
    if (char === 'vampire' || hasRule(p, 'startHp')) p.hp = Math.ceil(p.maxHp * .5);
    if (p.active.hp1) p.hp = 1;
    return p;
  }
  function createWorld(opts = {}) {
    const w = {
      wave: opts.wave || 1, rng: opts.rng || Math.random, players: {}, enemies: [], drops: [],
      shots: [], bullets: [], projectiles: [], crates: [], crateCount: 0, turrets: [], fx: [],
      tick: 0, tm: waveLength(opts.wave || 1), spawnClock: 0, nextId: 1,
      endless: !!opts.endless, ended: false, win: false, bossKilled: false, bossKills: 0, eliteCount: 0, bossSpawned: false
    };
    for (const [uid, v] of Object.entries(opts.players || { solo: { char: "basic" } })) {
      const p = w.players[uid] = createPlayer(uid, v.char, v);
      if (p.items.includes('piggy_bank')) p.mats += Math.min(20, Math.floor(p.mats * .1));
      if (p.char === 'saver') p.mats += Math.min(15, Math.floor((v.mats || 0) * .1));
      for (let i = 0; i < p.items.filter(id => id === 'turret').length; i++) {
        w.turrets.push({ x: p.x, y: p.y, owner: uid, cool: 1.5 });
      }
      // 미끼: 다음 웨이브 시작 시 엘리트(플레이어 반대편)
      for (let i = 0; i < (p.active.elite || 0); i++) {
        const x = p.x < D.W / 2 ? D.W - 120 : 120, y = 120 + rand(w) * (D.H - 240);
        w.fx.push(['mark', x | 0, y | 0]);
        w.shots.push({ type: 'elite', x, y, delay: 1.5 });
      }
    }
    // 적 수(호루라기·백기·시끌감자)·적 HP(외계 아기) 배율은 파티 전원 합산
    const all = Object.values(w.players);
    w.enemyMult = Math.max(.25, 1 + all.reduce((n, p) => n + ruleSum(p, 'enemies'), 0) / 100);
    w.enemyHp = 1 + all.reduce((n, p) => n + ruleSum(p, 'enemyHp'), 0) / 100;
    return w;
  }
  function applyInput(w, uid, x, y, f) {
    const p = w.players[uid];
    if (p && p.alive) {
      p.x = clamp(x, 0, D.W);
      p.y = clamp(y, 0, D.H);
      p.f = f < 0 ? -1 : 1;
    }
  }
  function spawn(w, type, x, y) {
    if (w.enemies.length >= enemyCap(w)) return null;
    let n = Object.keys(w.players).length || 1;
    const s = enemyStats(type, w.wave, n);
    s.hp *= w.enemyHp ?? 1;
    const e = { id: w.nextId++, type, x, y, hp: s.hp, maxHp: s.hp, dmg: s.dmg, speed: s.speed, clock: 0, charge: 0, hit: {} };
    w.enemies.push(e);
    if (type === 'shielder') w.fx.push(['st', e.id, 'shield']);
    return e;
  }
  function drop(w, x, y, count, owner) {
    const k = D.curve;
    const base = w.wave < k.goldStartWave ? 1 : Math.max(k.goldFloor,
      1 - (w.wave - k.goldStartWave + 1) * k.goldDropPerWave);
    const chance = Math.min(1, base + (owner?.items.includes('bounty_badge') ? .12 : 0));
    for (let i = 0; i < count; i++) w.drops.push({ id: w.nextId++,
      x: x + (rand(w) - 0.5) * 24, y: y + (rand(w) - 0.5) * 24,
      gold: chance === 1 || rand(w) < chance ? 1 : 0 });
  }
  const killHooks = {
    luckyCrate(w, e, p) { if (rand(w) < .02) createCrate(w, e.x, e.y, p.uid); },
    deathBlast(w, e, p) {
      if (rand(w) < .1) explode(w, e.x, e.y, 60, 8 * (1 + effectiveStats(p).explosion / 100), p.uid);
    },
    harvest_sickle(w, e, p) {
      if (rand(w) < D.items.harvest_sickle.killMat) bonusMaterial(w, e, p);
    },
    firecracker(w, e, p) {
      if (rand(w) < .08) explode(w, e.x, e.y, 60, 8, p.uid);
    }
  };
  function bonusMaterial(w, e, p) {
    w.drops.push({ id: w.nextId++, x: e.x, y: e.y, gold: 1 });
  }
  function createCrate(w, x, y, owner = null) {
    if (w.crateCount >= 2) return null;
    const crate = { id: w.nextId++, x, y, owner };
    w.crateCount++;
    w.crates.push(crate);
    w.fx.push(['cr', crate.id, x | 0, y | 0]);
    return crate;
  }
  function onKill(w, e, p) {
    if (e.type === 'splitter') {
      spawn(w, 'blob', e.x - 18, e.y);
      spawn(w, 'blob', e.x + 18, e.y);
    }
    if (e.type.startsWith('boss_')) w.bossKills++;
    if (e.type === 'boss_2') w.bossKilled = true;
    if (e.type === 'exploder') explode(w, e.x, e.y, 70, 2 + w.wave / 5, p?.uid, true);
    if (e.type === 'looter') createCrate(w, e.x, e.y, p?.uid ?? null);
    if (p) {
      const trait = D.chars[p.char].trait;
      killHooks[trait]?.(w, e, p);
      for (const item of p.items) killHooks[D.items[item]?.hook]?.(w, e, p);
      const chance = .015 * (1 + (p.items.filter(id => id === 'treasure_map').length * .5));
      if (rand(w) < chance) createCrate(w, e.x, e.y, p.uid);
    } else if (rand(w) < .015) createCrate(w, e.x, e.y);
  }
  function kill(w, e, owner) {
    if (e.hp > 0 || !w.enemies.includes(e)) return;
    w.enemies.splice(w.enemies.indexOf(e), 1);
    const p = w.players[owner];
    if (p) p.kills++;
    drop(w, e.x, e.y, D.enemies[e.type].mats + (p && rand(w) * 100 < p.stats.luck ? 1 : 0), p);
    w.fx.push(['die', e.x | 0, e.y | 0, e.type]);
    onKill(w, e, p);
  }
  function applyStatus(w, e, type, owner, power = 0) {
    e.status = e.status || {};
    e.status[type] = { left: type === 'burn' ? 3 : 2, owner, power, tick: 0 };
    w.fx.push(['st', e.id, type]);
  }
  // Host-only simulation state; fragments reuse a valid weapon id for SOLO saves.
  // No new realtime rows/events: existing explosion FX render the cosmetic burst.
  function fragments(w, x, y, damage, owner, id = 'potato_cannon', exclude = null) {
    for (let i = 0; i < 3; i++) {
      const a = Math.PI * 2 * i / 3;
      w.projectiles.push({ id, x, y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
        left: 180, power: damage, crit: false, owner, fragment: true,
        hit: new Set(exclude == null ? [] : [exclude]), bounces: 0, bounce: 0, pierce: 0 });
    }
  }
  function explode(w, x, y, radius, damage, owner, friendly = false) {
    w.fx.push(['ex', x | 0, y | 0, radius, owner]);
    for (const e of w.enemies.slice()) {
      if (dist(e, { x, y }) < radius) hurtEnemy(w, e, damage, owner, false, 'explosion', 0);
    }
    const source = w.players[owner];
    const shard = source && ruleSum(source, 'fragments');
    if (shard) fragments(w, x, y, damage * shard, owner);
    if (friendly) for (const p of Object.values(w.players)) {
      if (p.alive && dist(p, { x, y }) < radius) hurtPlayer(w, p, damage, null);
    }
  }
  function hurtEnemy(w, e, dmg, uid, crit = false, element = '', kb = 0, dot = false, allowSteal = true) {
    if (!w.enemies.includes(e)) return;
    const protectedBy = w.enemies.some(v => v !== e && v.type === 'shielder' && dist(v, e) <= 140);
    const p = w.players[uid];
    const chilled = e.status?.chill?.left > 0;
    const actual = dmg * (protectedBy ? .5 : 1) * (chilled && p ? 1 + ruleSum(p, 'chilledDmg') / 100 : 1);
    e.hp -= actual;
    e.flash = .08;
    const knock = kb * (1 + (p ? effectiveStats(p).knockback : 0) / 100) * (p?.char === 'muscle' ? 1.5 : 1);
    const resist = ['tank', 'shielder', 'boss_1', 'boss_2'].includes(e.type) ? .25 : 1;
    const angle = p ? Math.atan2(e.y - p.y, e.x - p.x) : 0;
    e.kx = Math.cos(angle) * knock * resist;
    e.ky = Math.sin(angle) * knock * resist;
    w.fx.push(['hit', e.x | 0, e.y | 0, Math.ceil(actual), !!crit, e.id, element]);
    if (p) {
      p.totalDamage += actual;
      const chill = ruleSum(p, 'chill');
      if (!dot && chill && rand(w) < Math.min(1, chill) && e.hp > 0) applyStatus(w, e, 'chill', uid);
      if (allowSteal && rand(w) * 100 < effectiveStats(p).lifesteal && p.steal < 10) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        p.steal++;
      }
    }
    kill(w, e, uid);
  }
  function useUlt(w, uid, wave) {
    const p = w?.players[uid], u = D.ults[p?.char];
    if (!p || !u || !p.alive || !(p.hp > 0) || p.ultUsed ||
        wave !== w.wave || w.ended || w.reported || canEnd(w)) return false;
    // Consume before any kill hooks: duplicate commands cannot re-enter the effect.
    p.ultUsed = true;
    const startFx = w.fx.length;
    let targets = w.enemies.filter(e => e.hp > 0 && dist(p, e) <= u.radius);
    if (u.limit) targets = targets.sort((a, b) => dist(p, a) - dist(p, b)).slice(0, u.limit);
    const damage = p.char === 'berserker' ? 30 + 60 * (1 - p.hp / p.maxHp)
      : p.char === 'thorn' ? 30 + 3 * effectiveStats(p).thorns : u.damage;
    for (const e of targets) {
      if (p.char === 'vampire') {
        // Exact current-HP reduction: no armor, shield, lifesteal, or max-HP rewrite.
        const amount = e.hp / 2;
        e.hp -= amount; e.flash = .08; p.totalDamage += amount;
      } else {
        hurtEnemy(w, e, damage, uid, false, '', u.kb || 0, true, false);
        if (u.chill && e.hp > 0 && w.enemies.includes(e)) applyStatus(w, e, 'chill', uid);
      }
    }
    if (p.char === 'vampire') p.hp = p.maxHp;
    if (u.heal) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * u.heal);
    if (u.immune) p.immune = Math.max(p.immune, u.immune);
    if (u.mats) p.mats += u.mats;
    if (p.char === 'saver') p.mats += Math.min(40, 10 + Math.floor(p.mats * .1));
    if (u.resetCool) p.cool = p.cool.map(() => 0);
    // Keep gameplay hooks, crate/level signals; collapse cosmetic burst fanout to one pulse.
    const effects = w.fx.splice(startFx).filter(e => !['hit', 'die', 'st', 'ex', 'bm'].includes(e[0]));
    w.fx.push(...effects);
    w.fx.push(['ult', p.x | 0, p.y | 0, u.radius, p.char]);
    return true;
  }
  function hurtPlayer(w, p, damage, source) {
    if (!p.alive || p.immune > 0) return;
    if (rand(w) * 100 < Math.min(60, effectiveStats(p).dodge)) {
      if (p.char === 'ghost') {
        p.immune = .5;
        p.nextCrit = true;
        w.fx.push(['bt', p.uid]);
      }
      return;
    }
    const amount = damageTaken(damage * (p.active?.peacock ? 1.5 : 1), effectiveStats(p).armor);
    p.hp = Math.max(0, p.hp - amount);
    p.hurt = .1;
    // 피격 무적(i-frame): 없으면 접촉 피해가 30Hz 매 틱 들어가 닿는 순간 녹는다(v2 밸런스 붕괴 원인).
    p.immune = Math.max(p.immune, D.IFRAME || .45);
    w.fx.push(['hurt', p.uid, Math.ceil(amount)]);
    if (source && effectiveStats(p).thorns) hurtEnemy(w, source, effectiveStats(p).thorns, p.uid, false, '', 0);
    if (p.hp <= 0) {
      const revive = ruleSum(p, 'revive');
      if (revive && !p.revived) {
        p.revived = true; // world recreation resets it each wave; SOLO checkpoint preserves it.
        p.hp = p.maxHp * revive;
        p.immune = .8;
      } else p.alive = false;
    }
  }
  function gain(w, p, material) {
    p.mats += material.gold ?? 1; // legacy SOLO drops had no currency field
    // 공작 깃털: 상시 XP +25%/개, 구매 다음 웨이브는 ×2
    p.xp += (1 + ruleSum(p, 'xp') / 100) * (p.active?.peacock ? 2 : 1);
    while (p.xp >= needXp(p.lvl, p.char)) {
      p.xp -= needXp(p.lvl, p.char);
      p.lvl++;
      if (!hasRule(p, 'noMaxHp')) {
        p.stats.maxHp++;
        p.maxHp++;
        p.hp++;
      }
      p.levelUps++;
      w.fx.push(["lvl", p.uid]);
    }
  }
  function nearest(w, p, range) {
    let best = null, bd = range;
    for (const e of w.enemies) {
      const d = dist(p, e);
      if (d < bd) {
        best = e;
        bd = d;
      }
    }
    return best;
  }
  function attackPower(w, p, v, tier) {
    const s = effectiveStats(p);
    const kind = ['thrust', 'sweep', 'slam'].includes(v.behavior) ? 'melee'
      : ['cone', 'chain'].includes(v.behavior) || v.status === 'chill' ? 'elemental' : 'ranged';
    let power = (v.damage * 1.6 ** (tier - 1) + (s[kind] || 0)) * (1 + s.dmg / 100);
    const crit = p.nextCrit || rand(w) * 100 < s.crit + (v.crit || 0);
    p.nextCrit = false;
    if (v.classes.includes('elemental')) power *= 1 + (p.char === 'science' ? .25 : 0)
      + p.items.filter(id => id === 'spark_plug').length * .15;
    if (p.char === 'gunslinger' && v.classes.includes('gun')) power *= 1.2;
    if (p.char === 'cyclops') power *= 2.5;
    return { power: Math.max(1, power * (crit ? 2 : 1)), crit };
  }
  function hitWeapon(w, p, v, e, power, crit, allowSteal = true) {
    hurtEnemy(w, e, power, p.uid, crit, v.classes.includes('elemental') ? 'elemental' : '', v.kb, false, allowSteal);
    if (!w.enemies.includes(e) && v.killMat && rand(w) < Math.min(1, v.killMat * (1 + effectiveStats(p).luck / 100))) {
      bonusMaterial(w, e, p);
    }
    if (w.enemies.includes(e) && v.status === 'chill') applyStatus(w, e, 'chill', p.uid);
    if (w.enemies.includes(e) && v.status === 'burn') {
      applyStatus(w, e, 'burn', p.uid, 2);
    }
    if (w.enemies.includes(e) && v.status === 'bleed' && crit) {
      applyStatus(w, e, 'bleed', p.uid, power * .25);
    }
  }
  // Slot 0 starts at +X; no camera-facing/aim rotation of the orbit itself.
  function weaponPose(p, id, slot, angle) {
    const orbit = 2 * Math.PI * slot / Math.max(1, p.weapons.length);
    // 무기 궤도 반경·크기(렌더와 공유). muzzle은 28px 아트 기준이라 표시 크기 비율로 확대.
    // 무기가 많을수록 궤도를 넓혀 겹침 방지(2개까지 기본, 이후 개당 +6px)
    const R = (D.WEAPON_ORBIT || 36) + 6 * Math.max(0, p.weapons.length - 2), k = (D.WEAPON_SIZE || 44) / 28;
    const x = p.x + R * Math.cos(orbit);
    const y = p.y + R * Math.sin(orbit);
    const mx = D.weapons[id].muzzle[0] * k, my = D.weapons[id].muzzle[1] * k;
    return { x, y, muzzleX: x + mx * Math.cos(angle) - my * Math.sin(angle),
      muzzleY: y + mx * Math.sin(angle) + my * Math.cos(angle), orbit };
  }
  const behaviors = {
    thrust(w, p, v, e, angle, range, power, crit, origin) {
      for (const target of w.enemies.slice()) {
        const dx = target.x - origin.x, dy = target.y - origin.y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        const across = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
        if (along >= -(origin.back || 0) && along <= range && across < D.enemies[target.type].size / 3 + 5) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
    },
    sweep(w, p, v, e, angle, range, power, crit, origin) {
      for (const target of w.enemies.slice()) {
        const difference = Math.atan2(Math.sin(Math.atan2(target.y - origin.y, target.x - origin.x) - angle),
          Math.cos(Math.atan2(target.y - origin.y, target.x - origin.x) - angle));
        if (dist(origin, target) <= range && Math.abs(difference) <= Math.PI / 3) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
    },
    slam(w, p, v, e, angle, range, power, crit, origin) {
      const point = { x: origin.x + Math.cos(angle) * Math.min(range, dist(origin, e)),
        y: origin.y + Math.sin(angle) * Math.min(range, dist(origin, e)) };
      for (const target of w.enemies.slice()) {
        if (dist(point, target) <= 80) hitWeapon(w, p, v, target, power, crit);
      }
      w.fx.push(['ex', point.x | 0, point.y | 0, 80, p.uid]);
    },
    beam(w, p, v, e, angle, range, power, crit, origin) {
      for (const target of w.enemies.slice()) {
        const dx = target.x - origin.x, dy = target.y - origin.y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        if (along >= -(origin.back || 0) && along <= range && Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle)) < 26) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
      w.fx.push(['bm', origin.x | 0, origin.y | 0, (origin.x + Math.cos(angle) * range) | 0,
        (origin.y + Math.sin(angle) * range) | 0, 'beam', origin.tier]);
    },
    cone(w, p, v, e, angle, range, power, crit, origin) {
      for (const target of w.enemies.slice()) {
        const delta = Math.atan2(Math.sin(Math.atan2(target.y - origin.y, target.x - origin.x) - angle),
          Math.cos(Math.atan2(target.y - origin.y, target.x - origin.x) - angle));
        if (dist(origin, target) <= range && Math.abs(delta) <= Math.PI * 20 / 180) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
      w.fx.push(['bm', origin.x | 0, origin.y | 0, e.x | 0, e.y | 0, 'cone']);
    },
    chain(w, p, v, e, angle, range, power, crit, origin) {
      const seen = new Set();
      let from = origin, target = e;
      for (let i = 0; i < 4 && target; i++) {
        seen.add(target.id);
        w.fx.push(['bm', from.x | 0, from.y | 0, target.x | 0, target.y | 0, 'chain']);
        hitWeapon(w, p, v, target, power * .8 ** i, crit);
        from = target;
        target = w.enemies.filter(v => !seen.has(v.id) && dist(from, v) <= 400)
          .sort((a, b) => dist(from, a) - dist(from, b))[0];
      }
    },
    projectile(w, p, v, e, angle, range, power, crit, origin) {
      const count = (v.count || 1) + Math.max(0, effectiveStats(p).projectiles);
      for (let i = 0; i < count; i++) {
        const spread = v.count ? (i - (count - 1) / 2) * Math.PI * (v.spread / (v.count - 1)) / 180
          : (i - (count - 1) / 2) * 5 * Math.PI / 180;
        const a = angle + spread + (v.randomSpread ? (rand(w) - .5) * 8 * Math.PI / 180 : 0);
        w.projectiles.push({ id: Object.keys(D.weapons).find(id => D.weapons[id] === v),
          x: origin.x, y: origin.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
          left: range, power, crit, owner: p.uid, hit: new Set(), bounces: 0,
          bounce: (v.bounce || 0) + (v.radius || v.returning ? 0 : ruleSum(p, 'bounce')), // 도탄 코일 +1
          pierce: v.radius || v.bounce || v.returning ? 0 : Math.min(2,
            ruleSum(p, 'pierce')) }); // 프리즘(아이템)·외눈(캐릭터) 관통 합산, 최대 2
      }
    }
  };
  const MELEE = ['thrust', 'sweep', 'slam'];
  // 무기 실사거리. 근접은 사거리 스탯을 MELEE_RANGE_SCALE만큼만 받는다.
  function weaponRange(p, v) {
    return v.range + effectiveStats(p).range * (MELEE.includes(v.behavior) ? D.MELEE_RANGE_SCALE ?? .5 : 1);
  }
  function weaponHit(w, p, id, tier, e, angle, slot = 0) {
    const v = D.weapons[id];
    const { power, crit } = attackPower(w, p, v, tier);
    const range = weaponRange(p, v);
    const pose = weaponPose(p, id, slot, angle);
    // back = 몸 중심~총구 거리. 캐릭터에 붙은 적(총구보다 가까운 적)도 맞도록 판정을 몸 쪽까지 연장.
    const back = Math.hypot(pose.muzzleX - p.x, pose.muzzleY - p.y);
    let origin = { x: pose.muzzleX, y: pose.muzzleY, back };
    // 투사체: 목표가 총구보다 안쪽이면 무기 몸체에서 발사(적 뒤에서 탄이 생기는 문제 방지)
    if (v.behavior === 'projectile' && e && dist(p, e) <= back + 10) origin = { x: pose.x, y: pose.y, back: 0 };
    origin.tier = tier;
    if (p.char === 'vampire' && MELEE.includes(v.behavior)) {
      // 흡혈감자 근접: 몸 중심의 실제 근접 사거리. 범위가 넓어져도 흡혈 판정은 공격당 1회.
      let first = true;
      for (const target of w.enemies.slice()) {
        if (dist(p, target) <= range) {
          hitWeapon(w, p, v, target, power, crit, first);
          first = false;
        }
      }
      w.fx.push(['va', p.x | 0, p.y | 0, range | 0]);
    } else behaviors[v.behavior](w, p, v, e, angle, range, power, crit, origin);
    // reach = 모션이 총구에서 실제로 뻗어나가는 거리. 렌더가 이 값까지 무기를 날려 판정과 맞춘다.
    let reach = 0;
    if (MELEE.includes(v.behavior)) {
      reach = v.behavior === 'slam' && e ? Math.min(range, dist(origin, e)) : range;
      w.fx.push(['sw', p.uid, slot, angle, v.behavior, origin.x | 0, origin.y | 0, reach | 0]);
    }
    w.fx.push(['sh', p.uid, id, tier, origin.x | 0, origin.y | 0, angle, slot, reach | 0]);
  }
  const RANGED = new Set(['spitter', 'gunner']);
  // 무리 스폰: 한 지점 주변에 count마리(브로테이토식 그룹). 개체 수는 step의 초당 예산이 결정.
  function spawnPack(w, count) {
    const pool = Object.keys(D.enemies).filter((id) => !id.startsWith("boss") && D.enemies[id].first <= w.wave && id !== "elite" && !D.enemies[id].special);
    let cx, cy, ctries = 0;
    do {
      cx = 80 + rand(w) * (D.W - 160);
      cy = 80 + rand(w) * (D.H - 160);
      ctries++;
    } while (ctries < 20 && Object.values(w.players).some((p) => dist(p, { x: cx, y: cy }) < 260));
    for (let i = 0; i < count && w.enemies.length < enemyCap(w); i++) {
      // 신규 적은 첫 등장 웨이브에 드물게(1/3 가중) → 2웨이브에 걸쳐 정상 비중. 벽 스파이크 방지.
      // 원거리(침뱉이·총잡이)는 12웨이브부터 웨이브당 +15% 비중 → 후반일수록 원거리 압박.
      const weights = pool.map((id) => Math.min(1, (w.wave - D.enemies[id].first + 1) / 3) *
        (RANGED.has(id) ? 1 + Math.max(0, w.wave - 11) * .15 : 1));
      let r = rand(w) * weights.reduce((sum, v) => sum + v, 0), type = pool[0];
      for (let j = 0; j < pool.length; j++) { r -= weights[j]; if (r <= 0) { type = pool[j]; break; } }
      let x, y, tries = 0;
      do {
        x = clamp(cx + (rand(w) - 0.5) * 120, 0, D.W);
        y = clamp(cy + (rand(w) - 0.5) * 120, 0, D.H);
        tries++;
      } while (tries < 20 && Object.values(w.players).some((p) => dist(p, { x, y }) < 150));
      if (tries < 20) {
        w.fx.push(["mark", x | 0, y | 0]);
        w.shots.push({ type, x, y, delay: 1 });
      }
    }
    if (w.wave >= 8 && w.eliteCount < 2 && rand(w) < 0.22) {
      w.eliteCount++;
      w.shots.push({ type: "elite", x: rand(w) * D.W, y: rand(w) * D.H, delay: 1 });
    }
  }
  function canEnd(w) {
    return w.wave === 20 ? w.bossKilled : w.tm <= 0;
  }
  function step(w, dt = 1 / 30) {
    if (w.ended) return;
    dt = Math.min(dt, 0.1);
    w.tick++;
    const players = Object.values(w.players), alive = players.filter((p) => p.alive);
    if (!alive.length) {
      w.ended = true;
      w.win = false;
      return;
    }
    w.tm = Math.max(0, w.tm - dt);
    if (w.tm > 0) {
      // 초당 스폰 예산(웨이브·인원 비례)을 누적해 무리 단위로 소비.
      const k = D.curve || {};
      const n = Object.keys(w.players).length || 1;
      const rate = ((k.spawnBase ?? 0.9) + (k.spawnPerWave ?? 0.33) * (w.wave - 1)) * (1 + (k.mpCount ?? 0.6) * (n - 1)) *
        (w.enemyMult ?? 1);
      w.spawnClock += rate * dt;
      const pack = Math.min(w.packNext || 1, 1 + Math.floor(w.wave / 3));
      if (w.spawnClock >= pack) {
        w.spawnClock -= pack;
        spawnPack(w, pack);
        w.packNext = 1 + Math.floor(rand(w) * Math.min(5, 1 + Math.floor(w.wave / 3)));
      }
    }
    // 도둑 두더지: 3웨이브부터 웨이브당 1회, 6초 경과 시 40% 확률로 플레이어에게서 먼 곳에 등장.
    if (w.wave >= 3 && !w.looterRolled && waveLength(w.wave) - w.tm >= 6) {
      w.looterRolled = true;
      if (rand(w) < .4) {
        const far = [[120, 120], [D.W - 120, 120], [120, D.H - 120], [D.W - 120, D.H - 120]]
          .sort((a, b) => Math.min(...alive.map(p => dist(p, { x: b[0], y: b[1] }))) -
            Math.min(...alive.map(p => dist(p, { x: a[0], y: a[1] }))))[0];
        spawn(w, 'looter', far[0], far[1]);
      }
    }
    // 보스: 10·20웨이브, 무한 모드는 이후 10웨이브마다(20의 배수=boss_2). 처치 필수는 20웨이브뿐.
    if (!w.bossSpawned && w.wave % 10 === 0) {
      w.bossSpawned = true;
      const b = w.wave % 20 === 0 ? "boss_2" : "boss_1";
      spawn(w, b, 800, 90);
      w.fx.push(["boss", 800, 90]);
    }
    for (const s of w.shots.slice()) {
      s.delay -= dt;
      if (s.delay <= 0) {
        spawn(w, s.type, s.x, s.y);
        w.shots.splice(w.shots.indexOf(s), 1);
      }
    }
    for (const p of alive) {
      // 정지 판정: 틱당 1px 이하로 0.15초 이상(원격 입력 15Hz 간격도 '이동'으로 유지)
      const moved = p.lx != null && Math.hypot(p.x - p.lx, p.y - p.ly) > 1;
      p.lx = p.x; p.ly = p.y;
      p.stillT = moved ? 0 : (p.stillT || 0) + dt;
      p.still = p.stillT >= .15;
      p.waveT = (p.waveT || 0) + dt;
      const drain = ruleSum(p, 'drain'); // 헌혈 팩: 2초마다 HP-1/개, 1 미만으로는 안 내려감
      if (drain) {
        p.drainT = (p.drainT || 0) + dt;
        while (p.drainT >= 2) { p.drainT -= 2; if (p.hp > 1) p.hp = Math.max(1, p.hp - drain); }
      }
      const pinned = hasRule(p, 'noMoveAttack') && !p.still; // 포대감자: 이동 중 공격 불가
      p.steal = Math.max(0, p.steal - 10 * dt);
      p.hurt = Math.max(0, p.hurt - dt);
      p.immune = Math.max(0, p.immune - dt);
      const bonusHp = effectiveStats(p).maxHp - p.maxHp;
      if (bonusHp) { p.maxHp += bonusHp; p.hp = Math.min(p.maxHp, p.hp + Math.max(0, bonusHp)); }
      p.hp = Math.min(p.maxHp, p.hp + Math.max(0, effectiveStats(p).regen) * .2 * dt);
      p.weapons.forEach(([id, tier], i) => {
        const v = D.weapons[id];
        if (!v) return;
        p.cool[i] = (p.cool[i] || 0) - dt;
        const weapon = weaponPose(p, id, i, 0);
        const target = nearest(w, p.char === 'vampire' && MELEE.includes(v.behavior) ? p : weapon, weaponRange(p, v));
        if (target && p.cool[i] <= 0 && !pinned) {
          const angle = Math.atan2(target.y - weapon.y, target.x - weapon.x);
          weaponHit(w, p, id, tier, target, angle, i);
          const s = effectiveStats(p);
          // 근접: 사거리 스탯 100당 쿨다운 +5%(더 멀리 뻗는 만큼 느림)
          p.cool[i] = v.cool * .9 ** (tier - 1) / (1 + s.atkSpd / 100 + (p.char === 'cyclops' ? .6 : 0)) *
            (MELEE.includes(v.behavior) ? 1 + Math.max(0, s.range) / 100 * .05 : 1);
        }
      });
    }
    for (const b of w.projectiles.slice()) {
      const def = D.weapons[b.id];
      let distance = Infinity;
      if (b.returning) {
        const p = w.players[b.owner];
        if (!p) { w.projectiles.splice(w.projectiles.indexOf(b), 1); continue; } // 주인 퇴장(협동)
        distance = Math.hypot(p.x - b.x, p.y - b.y);
        const a = Math.atan2(p.y - b.y, p.x - b.x);
        b.vx = Math.cos(a) * 700; b.vy = Math.sin(a) * 700;
      }
      const travel = Math.min(b.left, distance, 700 * dt);
      const sx = b.x, sy = b.y; // 이동 전 위치 — 선분 충돌(스윕)로 발사 직후·고속 관통 누락 방지
      b.x += b.vx / 700 * travel;
      b.y += b.vy / 700 * travel;
      b.left -= travel;
      const hits = w.enemies.filter(e => !b.hit.has(e.id) &&
        segDist(sx, sy, b.x, b.y, e.x, e.y) <= D.enemies[e.type].size / 3 + 5);
      // Resolve a swept segment in travel order, not enemy spawn order.
      const dx = b.x - sx, dy = b.y - sy;
      hits.sort((a, c) => ((a.x - sx) * dx + (a.y - sy) * dy) -
        ((c.x - sx) * dx + (c.y - sy) * dy));
      for (const e of hits) {
        b.hit.add(e.id);
        const weapon = D.weapons[b.id];
        if (weapon.radius && !b.fragment) {
          explode(w, e.x, e.y, weapon.radius * (1 + effectiveStats(w.players[b.owner]).explosion / 100),
            b.power * (1 + effectiveStats(w.players[b.owner]).explosion / 100), b.owner);
          if (weapon.split) fragments(w, e.x, e.y, b.power * weapon.split, b.owner, b.id, e.id);
          b.left = 0;
          break;
        }
        hitWeapon(w, w.players[b.owner], b.fragment ? { ...weapon, status: null, kb: 0 } : weapon, e, b.power, b.crit);
        if (weapon.returning && !b.fragment) continue; // one hit per leg; reset only on turnaround
        if (b.bounces < (b.bounce ?? weapon.bounce ?? 0)) {
          b.bounces++;
          const next = w.enemies.filter((v) => !b.hit.has(v.id) && dist(b, v) < 220).sort((a, c) => dist(a, b) - dist(c, b))[0];
          if (next) {
            const angle = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(angle) * 700;
            b.vy = Math.sin(angle) * 700;
            b.left = 220; // 튕길 때마다 220px 새 사거리(연속 도탄이 사거리 부족으로 끊기지 않게)
          } else b.left = 0;
          break;
        }
        if ((b.pierce || 0) > 0) {
          b.pierce--;
          b.power *= w.players[b.owner]?.items.includes('fracture_round') ? .9 : .75;
          continue;
        }
        b.left = 0;
        break;
      }
      if (b.returning && distance <= travel + 1) b.left = 0;
      if (b.left <= 0 && def.returning && !b.returning && !b.fragment) {
        b.returning = true; b.hit.clear(); b.left = def.range + 200;
        b.power *= 1 + ruleSum(w.players[b.owner], 'returnDmg') / 100;
      } else if (b.left <= 0) w.projectiles.splice(w.projectiles.indexOf(b), 1);
    }
    const grid = /* @__PURE__ */ new Map();
    for (const e of w.enemies) {
      const key = `${e.x / 60 | 0},${e.y / 60 | 0}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(e);
    }
    const buffers = w.enemies.filter(e => e.type === 'buffer');
    for (const e of w.enemies.slice()) {
      e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.status) for (const [name, status] of Object.entries(e.status)) {
        status.left -= dt;
        status.tick += dt;
        if (name !== 'chill' && status.tick >= 1) {
          status.tick -= 1;
          const owner = w.players[status.owner];
          const extra = owner && name === 'burn' ? effectiveStats(owner).elemental : 0;
          hurtEnemy(w, e, status.power + extra, status.owner, false,
            name === 'burn' ? 'fire' : 'bleed', 0, true);
        }
        if (status.left <= 0) delete e.status[name];
      }
      if (!w.enemies.includes(e)) continue;
      e.x = clamp(e.x + (e.kx || 0) * dt, 0, D.W);
      e.y = clamp(e.y + (e.ky || 0) * dt, 0, D.H);
      const decay = Math.max(0, 1 - dt / .15);
      e.kx = (e.kx || 0) * decay;
      e.ky = (e.ky || 0) * decay;
      e.clock += dt;
      e.summon = (e.summon || 0) + dt;
      let target = alive[0];
      for (const p of alive) if (dist(e, p) < dist(e, target)) target = p;
      if (!target) break;
      let dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
      let speed = e.speed;
      e.age = (e.age || 0) + dt;
      if (e.type === 'egg' && e.age >= 6) { // 못 깨면 부화
        w.enemies.splice(w.enemies.indexOf(e), 1);
        spawn(w, 'charger', e.x - 20, e.y);
        spawn(w, 'charger', e.x + 20, e.y);
        w.fx.push(['mark', e.x | 0, e.y | 0]);
        continue;
      }
      if (e.type === 'looter') {
        if (e.age >= 12) { w.enemies.splice(w.enemies.indexOf(e), 1); continue; } // 탈출
        speed = -speed;
        // 벽에 몰리면 벽을 따라 옆으로 빠져나간다
        if (e.x < 60 || e.x > D.W - 60) { dx = 0; dy = e.y < D.H / 2 ? 1 : -1; d = 1; speed = e.speed; }
        else if (e.y < 60 || e.y > D.H - 60) { dy = 0; dx = e.x < D.W / 2 ? 1 : -1; d = 1; speed = e.speed; }
      }
      if (e.type === 'buffer' && d < 300) speed = -speed;
      const buffed = e.type !== 'buffer' && buffers.some(b => dist(b, e) <= 160);
      if (buffed) speed *= 1.3;
      if (e.type === "spitter" && d < 250) speed = -speed;
      if (e.type === "gunner" && d < 320) speed = -speed;
      if (e.type === 'shielder' && d < 300) speed = -speed;
      if (e.type === 'exploder' && d < 60 && e.fuse == null) e.fuse = .6;
      if (e.fuse != null) {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          w.enemies.splice(w.enemies.indexOf(e), 1);
          explode(w, e.x, e.y, 70, 2 + w.wave / 5, null, true);
          continue;
        }
      }
      if (e.type === "charger") {
        e.charge += dt;
        if (e.charge > 1.2 && e.charge < 1.8) speed = 450;
        if (e.charge > 1.8) e.charge = 0;
      }
      if (e.type === "boss_2") {
        e.charge += dt;
        if (e.charge % 6 < 0.6) speed = 450;
      }
      ;
      // Apply after charge/retreat overrides so chill also slows a charging boss.
      if (e.status?.chill?.left > 0) speed *= 1 - (e.type.startsWith('boss_') ? .175 : .35);
      e.x = clamp(e.x + dx / d * speed * dt, 0, D.W);
      e.y = clamp(e.y + dy / d * speed * dt, 0, D.H);
      const cx = e.x / 60 | 0, cy = e.y / 60 | 0;
      for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) for (const o of grid.get(`${gx},${gy}`) || []) {
        if (o === e) continue;
        const dd = dist(e, o);
        if (dd > 0 && dd < 32) {
          e.x += (e.x - o.x) / dd * 0.6;
          o.x -= (e.x - o.x) / dd * 0.6;
        }
      }
      if (e.dmg > 0 && d < 23 + D.enemies[e.type].size / 3) {
        e.hit[target.uid] = (e.hit[target.uid] || 0) - dt;
        if (e.hit[target.uid] <= 0) {
          e.hit[target.uid] = 0.7;
          hurtPlayer(w, target, e.dmg * (buffed ? 1.25 : 1), e);
        }
      }
      const interval = e.type === "spitter" ? 2.5 : e.type === "gunner" ? 2.8 : e.type === "elite" ? 3 : e.type.startsWith("boss") ? 4 : 0;
      if (interval && e.clock >= interval) {
        e.clock = 0;
        const count = e.type === "elite" ? 8 : e.type.startsWith("boss") ? 12 : e.type === "gunner" ? 3 : 1;
        for (let i = 0; i < count; i++) {
          const a = e.type === "gunner" ? Math.atan2(dy, dx) + (i - 1) * .22 // 3발 부채꼴(±12.6°)
            : count === 1 ? Math.atan2(dy, dx) : Math.PI * 2 * i / count;
          const sp = e.type === "gunner" ? 340 : 260;
          w.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: e.dmg, life: 4 });
          w.fx.push(["eb", e.x | 0, e.y | 0, a, sp]);
        }
      }
      if (e.type.startsWith("boss") && e.summon >= 8) {
        e.summon = 0;
        for (let i = 0; i < 6; i++) spawn(w, e.type === 'boss_2' ? 'exploder' : 'blob',
          e.x + (rand(w) - .5) * 150, e.y + (rand(w) - .5) * 150);
      }
    }
    for (const b of w.bullets.slice()) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const p of alive) if (dist(b, p) < 18) {
        hurtPlayer(w, p, b.dmg, null);
        b.life = 0;
        break;
      }
      if (b.life <= 0) w.bullets.splice(w.bullets.indexOf(b), 1);
    }
    for (const d of w.drops.slice()) {
      for (const p of alive) {
        if (dist(d, p) < 80 * (1 + p.stats.pickup / 100)) {
          gain(w, p, d);
          if (p.items.includes('jam_jar') && rand(w) < .03 * p.items.filter(id => id === 'jam_jar').length) {
            p.hp = Math.min(p.maxHp, p.hp + 1);
          }
          // 피뢰침: 개당 20% 확률로 무작위 적에게 번개(8 + 원소 피해)
          const zap = ruleSum(p, 'zap');
          if (zap && w.enemies.length && rand(w) < Math.min(1, zap)) {
            const e = w.enemies[Math.floor(rand(w) * w.enemies.length)];
            w.fx.push(['bm', p.x | 0, p.y | 0, e.x | 0, e.y | 0, 'chain']);
            hurtEnemy(w, e, 8 + effectiveStats(p).elemental, p.uid, false, 'elemental', 0);
          }
          w.drops.splice(w.drops.indexOf(d), 1);
          break;
        }
      }
    }
    for (const crate of w.crates.slice()) for (const p of alive) {
      if (crate.owner && crate.owner !== p.uid) continue;
      if (dist(crate, p) < 80 * (1 + effectiveStats(p).pickup / 100)) {
        (p.pendingCrates ||= []).push(crate.id);
        w.crates.splice(w.crates.indexOf(crate), 1);
        w.fx.push(['crp', crate.id, p.uid]);
        break;
      }
    }
    for (const turret of w.turrets) {
      turret.cool -= dt;
      if (turret.cool > 0) continue;
      const owner = w.players[turret.owner];
      const e = owner && nearest(w, turret, 350);
      if (e) {
        hurtEnemy(w, e, 8 + effectiveStats(owner).ranged, owner.uid);
        w.fx.push(['bm', turret.x | 0, turret.y | 0, e.x | 0, e.y | 0, 'turret']);
      }
      turret.cool += 1.5;
    }
    if (canEnd(w)) {
      w.drops.forEach((d, i) => gain(w, alive[i % alive.length], d));
      w.drops = [];
      w.enemies = [];
      w.ended = true;
      w.win = w.wave === 20 && !w.endless;
      for (const p of players) {
        p.mats = Math.max(0, p.mats + Math.floor(p.stats.harvest));
        if (p.stats.harvest > 0) p.stats.harvest *= 1.05;
        // 웨이브 종료 훅(자경단 반지·로봇 팔·시끌감자): 스탯에 영구 반영
        const cuffed = hasRule(p, 'noMaxHp');
        for (const d of rulesOf(p)) for (const [k, v] of Object.entries(d.waveEnd || {})) {
          if (!(cuffed && k === 'maxHp' && v > 0)) p.stats[k] = (p.stats[k] || 0) + v;
        }
        if (!p.alive) {
          p.alive = true;
          p.hp = p.maxHp * 0.5;
        }
      }
    }
  }
  function merge(p, index) {
    const [id, tier] = p.weapons[index] || [];
    if (!id || tier >= 4) return false;
    const other = p.weapons.findIndex((v, i) => i !== index && v[0] === id && v[1] === tier);
    if (other < 0) return false;
    p.weapons[index] = [id, tier + 1];
    p.weapons.splice(other, 1);
    return true;
  }
  function rollGrade(rng = Math.random, luck = 0) {
    const rare = Math.min(1, .30 * (1 + luck / 100));
    const roll = rng();
    if (roll >= 1 - rare) {
      const within = (roll - (1 - rare)) / rare;
      if (within >= 29 / 30) return 4;
      if (within >= 22 / 30) return 3;
      return 2;
    }
    return 1;
  }
  const gradeMult = [0, 1, 1.6, 2.4, 3.5];
  function rollUpgrades(p, rng = Math.random) {
    const pool = Object.keys(D.upgrades).filter(id => id !== 'maxHp' || !hasRule(p, 'noMaxHp'));
    const result = [];
    for (let i = 0; i < 4; i++) {
      const index = Math.floor(rng() * pool.length);
      const id = pool.splice(index, 1)[0];
      const grade = rollGrade(rng, p.stats.luck);
      result.push({ id, grade, value: Math.round(D.upgrades[id] * gradeMult[grade] * 10) / 10 });
    }
    return result;
  }
  // unique=1개, max=N개까지만 보유. 상한에 닿은 아이템은 상점·상자에서 빠진다.
  function itemCapped(p, id) {
    const def = D.items[id];
    const cap = def?.unique ? 1 : def?.max;
    return !!cap && p.items.filter(x => x === id).length >= cap;
  }
  function rollCrateItem(w, p) {
    const tier = rollItemTier(w, p);
    const options = Object.keys(D.items).filter(id => (D.items[id].tier || 1) === tier &&
      !itemCapped(p, id));
    return options[Math.floor(rand(w) * options.length)];
  }
  function rollItemTier(w, p) {
    if (w.wave >= 10 && rand(w) < .03 + p.stats.luck / 1000) return 4;
    if (w.wave >= 8 && rand(w) < .10 + p.stats.luck / 600) return 3;
    if (w.wave >= 4 && rand(w) < .25 + p.stats.luck / 400) return 2;
    return 1;
  }
  function shop(w, p) {
    const slots = [];
    for (let i = 0; i < 4; i++) {
      let weapon = rand(w) < .35;
      const tier = weapon ? (() => {
        let t = 1;
        const cap = w.wave >= 15 ? 4 : w.wave >= 10 ? 3 : w.wave >= 5 ? 2 : 1;
        while (t < cap && rand(w) < Math.min(.75, .15 + p.stats.luck / 200)) t++;
        return t;
      })() : rollItemTier(w, p);
      const list = Object.keys(weapon ? D.weapons : D.items).filter(id => weapon
        ? p.char !== 'gunslinger' || D.weapons[id].kind !== 'melee'
        : (D.items[id].tier || 1) === tier && !itemCapped(p, id));
      const id = list[Math.floor(rand(w) * list.length)];
      slots.push({ id, weapon, tier, price: Math.ceil(price((weapon ? D.weapons : D.items)[id].price, w.wave)
        * (weapon ? tier : 1) * rulesOf(p).reduce((mult, d) => mult * (d.priceMult || 1), 1)), locked: false }); // 돌연변이 ×1.5
    }
    return slots;
  }
  function grantItem(p, id) {
    if (!D.items[id] || itemCapped(p, id)) return false;
    p.items.push(id);
    const once = D.items[id].once;
    if (once) (p.pending ||= {})[once] = (p.pending[once] || 0) + 1;
    for (const [k, v] of Object.entries(D.items[id].stats)) {
      if (k === 'maxHp' && v > 0 && hasRule(p, 'noMaxHp')) continue; // 수갑 이후 최대HP 증가 차단
      p.stats[k] += v;
      if (k === 'maxHp') {
        p.maxHp = Math.max(1, p.maxHp + v);
        p.hp = clamp(p.hp + v, 1, p.maxHp);
      }
    }
    return true;
  }
  // 상점 입장 훅(클라 권위: 상점을 여는 쪽이 자기 플레이어에 1회 호출). 모루: 티어<4 무기 1개 +1.
  function enterShop(p, rng = Math.random) {
    if (!hasRule(p, 'anvil')) return null;
    const open = p.weapons.map((v, i) => i).filter(i => p.weapons[i][1] < 4);
    if (!open.length) return null;
    const i = open[Math.floor(rng() * open.length)];
    p.weapons[i] = [p.weapons[i][0], p.weapons[i][1] + 1];
    return i;
  }
  // 슬롯이 가득 차도 같은 무기·같은 티어(4 미만)가 있으면 구매 즉시 합쳐 한 단계 올린다(브로테이토식).
  function mergeTarget(p, offer) {
    return p.weapons.findIndex(([id, tier]) => id === offer.id && tier === offer.tier && tier < 4);
  }
  function canBuy(p, offer) {
    if (!offer || p.mats < offer.price || (!offer.weapon &&
        (!D.items[offer.id] || itemCapped(p, offer.id)))) return false;
    return !offer.weapon || p.weapons.length < capacity(p) || mergeTarget(p, offer) >= 0;
  }
  function buy(p, offer) {
    if (!canBuy(p, offer)) return false;
    p.mats -= offer.price;
    if (offer.weapon && p.weapons.length >= capacity(p)) p.weapons[mergeTarget(p, offer)][1]++;
    else if (offer.weapon) p.weapons.push([offer.id, offer.tier]);
    else {
      grantItem(p, offer.id);
    }
    return true;
  }
  // Local, disposable SOLO checkpoint. Keep this here so the existing classic-script
  // loading order needs no additional script tag (and multiplayer never calls it).
  const soloSave = (() => {
    const key = 'spudsquad:solo:v1', version = 1, maxAge = 24 * 60 * 60 * 1000;
    function clear(storage) { try { storage.removeItem(key); } catch {} }
    function save(storage, state, now = Date.now()) {
      try {
        if (!state || !['wave', 'shop'].includes(state.mode) ||
            state.world?.players?.solo?.uid !== 'solo' ||
            Object.keys(state.world.players).length !== 1) return false;
        // JSON removes the rng function; fx is transient and must not replay on restore.
        const world = { ...state.world, rng: undefined, fx: [],
          projectiles: state.world.projectiles.map(b => ({ ...b, hit: [...b.hit] })) };
        storage.setItem(key, JSON.stringify({ version, at: now, mode: state.mode,
          world, offers: state.offers, cratesRemaining: state.cratesRemaining || 0,
          shopRolls: state.shopRolls || 0 }));
        return true;
      } catch { return false; } // private browsing/quota: play continues normally
    }
    function load(storage, now = Date.now()) {
      let raw;
      try { raw = storage.getItem(key); } catch { return null; }
      if (!raw) return null;
      try {
        const s = JSON.parse(raw), w = s.world, p = w?.players?.solo;
        const validNumber = n => typeof n === 'number' && Number.isFinite(n);
        if (s.version !== version || !validNumber(s.at) || s.at > now + 60000 ||
            now - s.at > maxAge || !['wave', 'shop'].includes(s.mode) ||
            !w || !Number.isInteger(w.wave) || w.wave < 1 || w.wave > (w.endless ? 999 : 20) ||
            Object.keys(w.players || {}).length !== 1 || p?.uid !== 'solo' ||
            !D.chars[p.char] || (p.ultUsed != null && typeof p.ultUsed !== 'boolean') || !validNumber(p.hp) || !validNumber(p.x) || !validNumber(p.y) ||
            !validNumber(w.tm) || !validNumber(w.tick) || !Number.isInteger(w.nextId) ||
            !Array.isArray(p.weapons) || !p.weapons.every(([id, tier]) =>
              D.weapons[id] && Number.isInteger(tier) && tier >= 1 && tier <= 4) ||
            !Array.isArray(p.items) || !p.items.every(id => D.items[id]) ||
            !p.stats || !Array.isArray(w.enemies) || !Array.isArray(w.drops) ||
            !w.drops.every(d => d.gold == null || d.gold === 0 || d.gold === 1) ||
            !Array.isArray(w.shots) || !Array.isArray(w.bullets) ||
            !Array.isArray(w.projectiles) || !w.projectiles.every(b =>
              D.weapons[b.id] && Array.isArray(b.hit) &&
              b.hit.every(id => Number.isInteger(id) && id > 0) &&
              validNumber(b.x) && validNumber(b.y) && validNumber(b.left) &&
              validNumber(b.power) && (b.pierce == null ||
                (Number.isInteger(b.pierce) && b.pierce >= 0))) ||
            !Array.isArray(w.crates) ||
            !Array.isArray(w.turrets) || w.win || (s.mode === 'wave' && (w.ended || !p.alive)) ||
            (s.mode === 'shop' && (!w.ended || !w.reported)) ||
            !Number.isInteger(s.cratesRemaining) || s.cratesRemaining < 0 || s.cratesRemaining > 100 ||
            !Number.isInteger(s.shopRolls) || s.shopRolls < 0 || s.shopRolls > 10000 ||
            (s.offers != null && (!Array.isArray(s.offers) ||
              (s.offers.length !== 4 && s.offers.length !== 0) ||
              !s.offers.every(o => (s.mode === 'wave' && o == null) || o?.sold === true ||
                (o && (o.weapon ? D.weapons[o.id] : D.items[o.id]) &&
                Number.isFinite(o.price) && Number.isInteger(o.tier)))))) throw Error('invalid save');
        w.rng = Math.random;
        p.ultUsed ??= false; // checkpoints made before ultimates were introduced
        w.fx = [];
        for (const b of w.projectiles) {
          b.hit = new Set(b.hit);
          b.pierce ??= 0; // old snapshots had no remaining-pierce field
        }
        return s;
      } catch { clear(storage); return null; }
    }
    return { key, save, load, clear };
  })();
  // 흔들어 부활(멀티 전용): 죽은 플레이어가 폰을 20회 흔들면 호스트가 이 함수로 되살린다.
  // 웨이브당 1회, 최대 HP 50%, 2초 무적. 솔로는 사망 즉시 판이 끝나므로 해당 없음.
  const REVIVE_SHAKES = 20;
  function shakeRevive(w, uid) {
    const p = w?.players[uid];
    if (!p || p.alive || w.ended || p.shakeRevived || Object.keys(w.players).length < 2) return false;
    p.alive = true;
    p.shakeRevived = true;
    p.hp = Math.max(1, p.maxHp * .5);
    p.immune = 2;
    w.fx.push(['rv', uid]);
    return true;
  }
  const api = {
    useUlt, shakeRevive, REVIVE_SHAKES, spawnPack,
    rollGrade, rollUpgrades, rollCrateItem, grantItem, sets, effectiveStats, capacity,
    shopRerollCost, soloSave,
    behaviors, weaponPose, weaponRange, applyStatus, explode, createCrate, rollItemTier, weaponHit, hurtEnemy,
    hurtPlayer, waveLength, enemyStats, needXp, price, rerollCost, damageTaken,
    rollDamage, createPlayer, createWorld, applyInput, spawn, kill, step, canEnd,
    merge, shop, buy, canBuy, clamp, enterShop
  };
  // 스탯 시트용 무기 요약(순수 함수). attackPower와 같은 식이되 RNG·치명타·nextCrit 소모 없이 비치명 1타 피해.
  // 간격은 step의 쿨다운 식, 사거리는 weaponRange 그대로. p는 절대 변경하지 않는다.
  api.weaponSummary = function weaponSummary(p, id, tier = 1) {
    const v = D.weapons[id];
    if (!v) return null;
    const s = effectiveStats(p);
    const kind = MELEE.includes(v.behavior) ? 'melee'
      : ['cone', 'chain'].includes(v.behavior) || v.status === 'chill' ? 'elemental' : 'ranged';
    let power = (v.damage * 1.6 ** (tier - 1) + (s[kind] || 0)) * (1 + s.dmg / 100);
    if (v.classes.includes('elemental')) power *= 1 + (p.char === 'science' ? .25 : 0)
      + (p.items || []).filter(x => x === 'spark_plug').length * .15;
    if (p.char === 'gunslinger' && v.classes.includes('gun')) power *= 1.2;
    if (p.char === 'cyclops') power *= 2.5;
    const cooldown = v.cool * .9 ** (tier - 1) / (1 + s.atkSpd / 100 + (p.char === 'cyclops' ? .6 : 0));
    return { id, tier, kind, damage: Math.max(1, power), cooldownMs: cooldown * 1000,
      range: weaponRange(p, v), shots: v.behavior === 'projectile'
        ? (v.count || 1) + Math.max(0, s.projectiles || 0) : 1,
      crit: s.crit + (v.crit || 0) };
  };
  root.SPUD = root.SPUD || {};
  root.SPUD.sim = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
