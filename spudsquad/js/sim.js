(function(root) {
  "use strict";
  const D = root.SPUD?.data || (typeof require === "function" ? require("./data.js") : null);
  const rand = (w) => w.rng();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  function waveLength(w) {
    return Math.min(20 + 5 * (w - 1), 60);
  }
  function enemyStats(type, w, n) {
    const e = D.enemies[type];
    return { hp: e.hp * (1 + 0.35 * (w - 1)) * (1 + 0.25 * (n - 1)), dmg: e.dmg * (1 + 0.12 * (w - 1)), speed: e.speed };
  }
  function needXp(lvl) {
    return (lvl + 3) ** 2;
  }
  function price(base, w) {
    return Math.ceil(base * (1 + 0.1 * (w - 1)));
  }
  function rerollCost(w, count) {
    return 1 + w + count;
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
  function effectiveStats(p) {
    const result = { ...p.stats };
    for (const group of Object.values(sets(p))) {
      for (const [key, value] of Object.entries(group.stats)) result[key] = (result[key] || 0) + value;
    }
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
    const p = { uid, char, x: 800, y: 600, f: 1, stats: s, maxHp: s.maxHp,
      hp: s.maxHp, alive: true, weapons: weapons.map(v => [...v]), items: [...(saved.items || [])],
      mats: saved.mats || 0, xp: saved.xp || 0, lvl: saved.lvl || 1, levelUps: 0,
      kills: 0, totalDamage: 0, cool: [], hurt: 0, steal: 0, immune: 0, nextCrit: false };
    if (char === 'vampire') p.hp = Math.ceil(p.maxHp * .5);
    return p;
  }
  function createWorld(opts = {}) {
    const w = { wave: opts.wave || 1, rng: opts.rng || Math.random, players: {}, enemies: [], drops: [], shots: [], bullets: [], projectiles: [], crates: [], crateCount: 0, turrets: [], fx: [], tick: 0, tm: waveLength(opts.wave || 1), spawnClock: 0, nextId: 1, ended: false, win: false, bossKilled: false, eliteCount: 0, bossSpawned: false };
    for (const [uid, v] of Object.entries(opts.players || { solo: { char: "basic" } })) {
      const p = w.players[uid] = createPlayer(uid, v.char, v);
      if (p.items.includes('piggy_bank')) p.mats += Math.min(20, Math.floor(p.mats * .1)) * p.items.filter(i => i === 'piggy_bank').length;
      for (let i = 0; i < p.items.filter(id => id === 'turret').length; i++) {
        w.turrets.push({ x: p.x, y: p.y, owner: uid, cool: 1.5 });
      }
    }
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
    if (w.enemies.length >= 220) return null;
    let n = Object.keys(w.players).length || 1;
    const s = enemyStats(type, w.wave, n);
    const e = { id: w.nextId++, type, x, y, hp: s.hp, maxHp: s.hp, dmg: s.dmg, speed: s.speed, clock: 0, charge: 0, hit: {} };
    w.enemies.push(e);
    return e;
  }
  function drop(w, x, y, count) {
    for (let i = 0; i < count; i++) w.drops.push({ id: w.nextId++, x: x + (rand(w) - 0.5) * 24, y: y + (rand(w) - 0.5) * 24 });
  }
  const killHooks = {
    luckyCrate(w, e, p) { if (rand(w) < .02) createCrate(w, e.x, e.y, p.uid); },
    deathBlast(w, e, p) {
      if (rand(w) < .1) explode(w, e.x, e.y, 60, 8 * (1 + effectiveStats(p).explosion / 100), p.uid);
    },
    firecracker(w, e, p) {
      if (rand(w) < .08) explode(w, e.x, e.y, 60, 8, p.uid);
    }
  };
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
    if (e.type === 'boss_2') w.bossKilled = true;
    if (e.type === 'exploder') explode(w, e.x, e.y, 70, 3 + w.wave / 4, p?.uid, true);
    if (p) {
      const trait = D.chars[p.char].trait;
      killHooks[trait]?.(w, e, p);
      for (const item of p.items) killHooks[D.items[item]?.hook]?.(w, e, p);
      const chance = .015 * (1 + (p.items.filter(id => id === 'treasure_map') * .5));
      if (rand(w) < chance) createCrate(w, e.x, e.y, p.uid);
    } else if (rand(w) < .015) createCrate(w, e.x, e.y);
  }
  function kill(w, e, owner) {
    if (e.hp > 0 || !w.enemies.includes(e)) return;
    w.enemies.splice(w.enemies.indexOf(e), 1);
    const p = w.players[owner];
    if (p) p.kills++;
    drop(w, e.x, e.y, D.enemies[e.type].mats + (p && rand(w) * 100 < p.stats.luck ? 1 : 0));
    w.fx.push(['die', e.x | 0, e.y | 0, e.type]);
    onKill(w, e, p);
  }
  function applyStatus(w, e, type, owner, power = 0) {
    e.status = e.status || {};
    e.status[type] = { left: type === 'burn' ? 3 : 2, owner, power, tick: 0 };
    w.fx.push(['st', e.id, type]);
  }
  function explode(w, x, y, radius, damage, owner, friendly = false) {
    w.fx.push(['ex', x | 0, y | 0, radius, owner]);
    for (const e of w.enemies.slice()) {
      if (dist(e, { x, y }) < radius) hurtEnemy(w, e, damage, owner, false, 'explosion', 0);
    }
    if (friendly) for (const p of Object.values(w.players)) {
      if (p.alive && dist(p, { x, y }) < radius) hurtPlayer(w, p, damage, null);
    }
  }
  function hurtEnemy(w, e, dmg, uid, crit = false, element = '', kb = 0) {
    if (!w.enemies.includes(e)) return;
    const protectedBy = w.enemies.some(v => v !== e && v.type === 'shielder' && dist(v, e) <= 140);
    const actual = dmg * (protectedBy ? .5 : 1);
    e.hp -= actual;
    e.flash = .08;
    const p = w.players[uid];
    const knock = kb * (1 + (p ? effectiveStats(p).knockback : 0) / 100) * (p?.char === 'muscle' ? 1.5 : 1);
    const resist = ['tank', 'shielder', 'boss_1', 'boss_2'].includes(e.type) ? .25 : 1;
    const angle = p ? Math.atan2(e.y - p.y, e.x - p.x) : 0;
    e.kx = Math.cos(angle) * knock * resist;
    e.ky = Math.sin(angle) * knock * resist;
    w.fx.push(['hit', e.x | 0, e.y | 0, Math.ceil(actual), !!crit, e.id, element]);
    if (p) {
      p.totalDamage += actual;
      if (rand(w) * 100 < effectiveStats(p).lifesteal && p.steal < 10) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        p.steal++;
      }
    }
    kill(w, e, uid);
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
    const amount = damageTaken(damage, effectiveStats(p).armor);
    p.hp = Math.max(0, p.hp - amount);
    p.hurt = .1;
    w.fx.push(['hurt', p.uid, Math.ceil(amount)]);
    if (source && effectiveStats(p).thorns) hurtEnemy(w, source, effectiveStats(p).thorns, p.uid, false, '', 0);
    if (p.hp <= 0) p.alive = false;
  }
  function gain(w, p) {
    p.mats++;
    p.xp++;
    if (p.xp >= needXp(p.lvl)) {
      p.xp -= needXp(p.lvl);
      p.lvl++;
      p.stats.maxHp++;
      p.maxHp++;
      p.hp++;
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
      : ['cone', 'chain'].includes(v.behavior) ? 'elemental' : 'ranged';
    let power = (v.damage * 1.6 ** (tier - 1) + (s[kind] || 0)) * (1 + s.dmg / 100);
    const crit = p.nextCrit || rand(w) * 100 < s.crit + (v.crit || 0);
    p.nextCrit = false;
    if (v.classes.includes('elemental')) power *= 1 + (p.char === 'science' ? .25 : 0)
      + p.items.filter(id => id === 'spark_plug').length * .15;
    if (p.char === 'gunslinger' && v.classes.includes('gun')) power *= 1.2;
    if (p.char === 'cyclops') power *= 2.5;
    return { power: Math.max(1, power * (crit ? 2 : 1)), crit };
  }
  function hitWeapon(w, p, v, e, power, crit) {
    hurtEnemy(w, e, power, p.uid, crit, v.classes.includes('elemental') ? 'elemental' : '', v.kb);
    if (w.enemies.includes(e) && v.status === 'burn') {
      applyStatus(w, e, 'burn', p.uid, 2);
    }
    if (w.enemies.includes(e) && v.status === 'bleed' && crit) {
      applyStatus(w, e, 'bleed', p.uid, power * .25);
    }
  }
  const behaviors = {
    thrust(w, p, v, e, angle, range, power, crit) {
      for (const target of w.enemies.slice()) {
        const dx = target.x - p.x, dy = target.y - p.y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        const across = Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle));
        if (along >= 0 && along <= range && across < D.enemies[target.type].size / 3 + 5) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
    },
    sweep(w, p, v, e, angle, range, power, crit) {
      for (const target of w.enemies.slice()) {
        const difference = Math.atan2(Math.sin(Math.atan2(target.y - p.y, target.x - p.x) - angle),
          Math.cos(Math.atan2(target.y - p.y, target.x - p.x) - angle));
        if (dist(p, target) <= range && Math.abs(difference) <= Math.PI / 3) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
    },
    slam(w, p, v, e, angle, range, power, crit) {
      const point = { x: p.x + Math.cos(angle) * Math.min(range, dist(p, e)),
        y: p.y + Math.sin(angle) * Math.min(range, dist(p, e)) };
      for (const target of w.enemies.slice()) {
        if (dist(point, target) <= 80) hitWeapon(w, p, v, target, power, crit);
      }
      w.fx.push(['ex', point.x | 0, point.y | 0, 80, p.uid]);
    },
    beam(w, p, v, e, angle, range, power, crit) {
      for (const target of w.enemies.slice()) {
        const dx = target.x - p.x, dy = target.y - p.y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        if (along >= 0 && along <= range && Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle)) < 26) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
      w.fx.push(['bm', p.x | 0, p.y | 0, (p.x + Math.cos(angle) * range) | 0,
        (p.y + Math.sin(angle) * range) | 0, 'beam']);
    },
    cone(w, p, v, e, angle, range, power, crit) {
      for (const target of w.enemies.slice()) {
        const delta = Math.atan2(Math.sin(Math.atan2(target.y - p.y, target.x - p.x) - angle),
          Math.cos(Math.atan2(target.y - p.y, target.x - p.x) - angle));
        if (dist(p, target) <= range && Math.abs(delta) <= Math.PI * 20 / 180) {
          hitWeapon(w, p, v, target, power, crit);
        }
      }
      w.fx.push(['bm', p.x | 0, p.y | 0, e.x | 0, e.y | 0, 'cone']);
    },
    chain(w, p, v, e, angle, range, power, crit) {
      const seen = new Set();
      let from = p, target = e;
      for (let i = 0; i < 4 && target; i++) {
        seen.add(target.id);
        w.fx.push(['bm', from.x | 0, from.y | 0, target.x | 0, target.y | 0, 'chain']);
        hitWeapon(w, p, v, target, power * .8 ** i, crit);
        from = target;
        target = w.enemies.filter(v => !seen.has(v.id) && dist(from, v) <= 400)
          .sort((a, b) => dist(from, a) - dist(from, b))[0];
      }
    },
    projectile(w, p, v, e, angle, range, power, crit) {
      const count = (v.count || 1) + Math.max(0, effectiveStats(p).projectiles);
      for (let i = 0; i < count; i++) {
        const spread = v.count ? (i - (count - 1) / 2) * Math.PI * (v.spread / (v.count - 1)) / 180
          : (i - (count - 1) / 2) * 5 * Math.PI / 180;
        const a = angle + spread + (v.randomSpread ? (rand(w) - .5) * 8 * Math.PI / 180 : 0);
        w.projectiles.push({ id: Object.keys(D.weapons).find(id => D.weapons[id] === v),
          x: p.x, y: p.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700,
          left: range, power, crit, owner: p.uid, hit: new Set(), bounces: 0 });
      }
    }
  };
  function weaponHit(w, p, id, tier, e, angle, slot = 0) {
    const v = D.weapons[id];
    const { power, crit } = attackPower(w, p, v, tier);
    const range = v.range + effectiveStats(p).range;
    behaviors[v.behavior](w, p, v, e, angle, range, power, crit);
    if (['thrust', 'sweep', 'slam'].includes(v.behavior)) w.fx.push(['sw', p.uid, slot, angle, v.behavior]);
    w.fx.push(['sh', p.uid, id, tier, p.x | 0, p.y | 0, angle, slot]);
  }
  function spawnPack(w) {
    const pool = Object.keys(D.enemies).filter((id) => !id.startsWith("boss") && D.enemies[id].first <= w.wave && id !== "elite");
    for (let i = 0; i < Math.ceil((2 + Math.floor(w.wave * 0.8)) * (1 + 0.6 * (Object.keys(w.players).length - 1))) && w.enemies.length < 220; i++) {
      const type = pool[Math.floor(rand(w) * pool.length)];
      let x, y, tries = 0;
      do {
        x = rand(w) * D.W;
        y = rand(w) * D.H;
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
      w.spawnClock += dt;
      if (w.spawnClock >= 0.6 + rand(w) * 0.6) {
        w.spawnClock = 0;
        spawnPack(w);
      }
    }
    if (!w.bossSpawned && (w.wave === 10 || w.wave === 20)) {
      w.bossSpawned = true;
      const b = w.wave === 20 ? "boss_2" : "boss_1";
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
      p.steal = Math.max(0, p.steal - 10 * dt);
      p.hurt = Math.max(0, p.hurt - dt);
      p.immune = Math.max(0, p.immune - dt);
      const bonusHp = effectiveStats(p).maxHp - p.maxHp;
      if (bonusHp) { p.maxHp += bonusHp; p.hp = Math.min(p.maxHp, p.hp + Math.max(0, bonusHp)); }
      p.hp = Math.min(p.maxHp, p.hp + effectiveStats(p).regen * .2 * dt);
      p.weapons.forEach(([id, tier], i) => {
        const v = D.weapons[id];
        if (!v) return;
        p.cool[i] = (p.cool[i] || 0) - dt;
        const target = nearest(w, p, v.range + effectiveStats(p).range);
        if (target && p.cool[i] <= 0) {
          const angle = Math.atan2(target.y - p.y, target.x - p.x);
          weaponHit(w, p, id, tier, target, angle, i);
          p.cool[i] = v.cool * .9 ** (tier - 1) / (1 + effectiveStats(p).atkSpd / 100 +
            (p.char === 'cyclops' ? .4 : 0));
        }
      });
    }
    for (const b of w.projectiles.slice()) {
      const travel = Math.min(b.left, 700 * dt);
      b.x += b.vx / 700 * travel;
      b.y += b.vy / 700 * travel;
      b.left -= travel;
      for (const e of w.enemies.slice()) {
        if (b.hit.has(e.id) || dist(b, e) > D.enemies[e.type].size / 3 + 5) continue;
        b.hit.add(e.id);
        const weapon = D.weapons[b.id];
        if (weapon.radius) {
          explode(w, e.x, e.y, weapon.radius * (1 + effectiveStats(w.players[b.owner]).explosion / 100),
            b.power * (1 + effectiveStats(w.players[b.owner]).explosion / 100), b.owner);
          b.left = 0;
          break;
        }
        hitWeapon(w, w.players[b.owner], weapon, e, b.power, b.crit);
        if (weapon.pierce) {
          if (b.hit.size > weapon.pierce) b.left = 0;
          break;
        }
        if (weapon.bounce && b.bounces === 0) {
          b.bounces++;
          const next = w.enemies.filter((v) => !b.hit.has(v.id) && dist(b, v) < 220).sort((a, c) => dist(a, b) - dist(c, b))[0];
          if (next) {
            const angle = Math.atan2(next.y - b.y, next.x - b.x);
            b.vx = Math.cos(angle) * 700;
            b.vy = Math.sin(angle) * 700;
            b.left = Math.min(b.left, 220);
          } else b.left = 0;
          break;
        }
        b.left = 0;
        break;
      }
      if (b.left <= 0) w.projectiles.splice(w.projectiles.indexOf(b), 1);
    }
    const grid = /* @__PURE__ */ new Map();
    for (const e of w.enemies) {
      const key = `${e.x / 60 | 0},${e.y / 60 | 0}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(e);
    }
    for (const e of w.enemies.slice()) {
      e.flash = Math.max(0, (e.flash || 0) - dt);
      if (e.status) for (const [name, status] of Object.entries(e.status)) {
        status.left -= dt;
        status.tick += dt;
        if (status.tick >= 1) {
          status.tick -= 1;
          const owner = w.players[status.owner];
          const extra = owner && name === 'burn' ? effectiveStats(owner).elemental : 0;
          hurtEnemy(w, e, status.power + extra, status.owner, false,
            name === 'burn' ? 'fire' : 'bleed', 0);
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
      if (e.type === "spitter" && d < 250) speed = -speed;
      if (e.type === 'shielder' && d < 300) speed = -speed;
      if (e.type === 'exploder' && d < 60 && e.fuse == null) e.fuse = .6;
      if (e.fuse != null) {
        e.fuse -= dt;
        if (e.fuse <= 0) {
          w.enemies.splice(w.enemies.indexOf(e), 1);
          explode(w, e.x, e.y, 70, 3 + w.wave / 4, null, true);
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
      if (d < 23 + D.enemies[e.type].size / 3) {
        e.hit[target.uid] = (e.hit[target.uid] || 0) - dt;
        if (e.hit[target.uid] <= 0) {
          e.hit[target.uid] = 0.7;
          hurtPlayer(w, target, e.dmg, e);
        }
      }
      const interval = e.type === "spitter" ? 2.5 : e.type === "elite" ? 3 : e.type.startsWith("boss") ? 4 : 0;
      if (interval && e.clock >= interval) {
        e.clock = 0;
        const count = e.type === "elite" ? 8 : e.type.startsWith("boss") ? 12 : 1;
        for (let i = 0; i < count; i++) {
          const a = count === 1 ? Math.atan2(dy, dx) : Math.PI * 2 * i / count;
          const sp = e.type === "spitter" ? 260 : 260;
          w.bullets.push({ x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg: e.type === "spitter" ? 1 + w.wave / 5 : e.dmg, life: 4 });
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
      for (const p of alive) if (dist(b, p) < 24) {
        hurtPlayer(w, p, b.dmg, null);
        b.life = 0;
        break;
      }
      if (b.life <= 0) w.bullets.splice(w.bullets.indexOf(b), 1);
    }
    for (const d of w.drops.slice()) {
      for (const p of alive) {
        if (dist(d, p) < 80 * (1 + p.stats.pickup / 100)) {
          gain(w, p);
          if (p.items.includes('jam_jar') && rand(w) < .03 * p.items.filter(id => id === 'jam_jar').length) {
            p.hp = Math.min(p.maxHp, p.hp + 1);
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
      w.drops.forEach((d, i) => gain(w, alive[i % alive.length]));
      w.drops = [];
      w.enemies = [];
      w.ended = true;
      w.win = w.wave === 20;
      for (const p of players) {
        p.mats += Math.floor(p.stats.harvest);
        p.stats.harvest *= 1.05;
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
  function rollItemTier(w, p) {
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
        : (D.items[id].tier || 1) === tier);
      const id = list[Math.floor(rand(w) * list.length)];
      slots.push({ id, weapon, tier, price: price((weapon ? D.weapons : D.items)[id].price, w.wave)
        * (weapon ? tier : 1), locked: false });
    }
    return slots;
  }
  function buy(p, offer) {
    if (!offer || p.mats < offer.price || offer.weapon && p.weapons.length >= capacity(p)) return false;
    p.mats -= offer.price;
    if (offer.weapon) p.weapons.push([offer.id, offer.tier]);
    else {
      p.items.push(offer.id);
      for (const [k, v] of Object.entries(D.items[offer.id].stats)) {
        p.stats[k] += v;
        if (k === "maxHp") {
          p.maxHp += v;
          p.hp += v;
        }
      }
    }
    return true;
  }
  const api = { sets, effectiveStats, capacity, behaviors, applyStatus, explode, createCrate, rollItemTier, weaponHit, hurtEnemy, hurtPlayer, waveLength, enemyStats, needXp, price, rerollCost, damageTaken, rollDamage, createPlayer, createWorld, applyInput, spawn, kill, step, canEnd, merge, shop, buy, clamp };
  root.SPUD = root.SPUD || {};
  root.SPUD.sim = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
