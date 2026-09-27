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
  function createPlayer(uid, char = "basic", saved = {}) {
    const c = D.chars[char] || D.chars.basic;
    const s = { ...D.stats, ...c.stats, ...saved.stats };
    return { uid, char, x: 800, y: 600, f: 1, stats: s, maxHp: s.maxHp, hp: s.maxHp, alive: true, weapons: saved.weapons || [[c.weapon, 1]], items: saved.items || [], mats: saved.mats || 0, xp: saved.xp || 0, lvl: saved.lvl || 1, levelUps: 0, kills: 0, totalDamage: 0, cool: [], hurt: 0, steal: 0 };
  }
  function createWorld(opts = {}) {
    const w = { wave: opts.wave || 1, rng: opts.rng || Math.random, players: {}, enemies: [], drops: [], shots: [], bullets: [], projectiles: [], fx: [], tick: 0, tm: waveLength(opts.wave || 1), spawnClock: 0, nextId: 1, ended: false, win: false, bossKilled: false, eliteCount: 0, bossSpawned: false };
    for (const [uid, v] of Object.entries(opts.players || { solo: { char: "basic" } })) w.players[uid] = createPlayer(uid, v.char, v);
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
  function kill(w, e, owner) {
    if (e.hp > 0) return;
    w.enemies = w.enemies.filter((v) => v !== e);
    const p = w.players[owner];
    if (p) p.kills++;
    drop(w, e.x, e.y, D.enemies[e.type].mats + (p && rand(w) * 100 < p.stats.luck ? 1 : 0));
    w.fx.push(["die", e.x | 0, e.y | 0, e.type]);
    if (e.type === "splitter") {
      spawn(w, "blob", e.x - 18, e.y);
      spawn(w, "blob", e.x + 18, e.y);
    }
    if (e.type === "boss_2") w.bossKilled = true;
  }
  function hurtEnemy(w, e, dmg, uid, crit) {
    e.hp -= dmg;
    w.fx.push(["hit", e.x | 0, e.y | 0, Math.ceil(dmg), !!crit]);
    const p = w.players[uid];
    if (p) {
      p.totalDamage += dmg;
      if (rand(w) * 100 < p.stats.lifesteal && p.steal < 10) {
        p.hp = Math.min(p.maxHp, p.hp + 1);
        p.steal++;
      }
    }
    kill(w, e, uid);
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
  function weaponHit(w, p, id, tier, e, angle) {
    const v = D.weapons[id];
    const crit = rand(w) * 100 < p.stats.crit;
    const power = Math.max(1, v.damage * 1.6 ** (tier - 1) * (1 + p.stats.dmg / 100) + (p.stats[v.kind] || 0)) * (crit ? 2 : 1);
    const range = v.range + p.stats.range;
    const candidates = w.enemies.slice();
    if (id === "stick") for (const target of candidates) {
      if (dist(p, target) <= range && Math.abs(Math.atan2(Math.sin(Math.atan2(target.y - p.y, target.x - p.x) - angle), Math.cos(Math.atan2(target.y - p.y, target.x - p.x) - angle))) <= Math.PI / 4) hurtEnemy(w, target, power, p.uid, crit);
    }
    else if (id === "laser") for (const target of candidates) {
      const dx = target.x - p.x, dy = target.y - p.y;
      if (Math.hypot(dx, dy) <= range && Math.abs(dx * Math.sin(angle) - dy * Math.cos(angle)) < 26) hurtEnemy(w, target, power, p.uid, crit);
    }
    else if (id === "fist") hurtEnemy(w, e, power, p.uid, crit);
    else {
      const count = id === "shotgun" ? 4 : 1;
      for (let i = 0; i < count; i++) {
        const spread = id === "shotgun" ? (i - 1.5) * Math.PI / 18 : id === "smg" ? (rand(w) - 0.5) * Math.PI * 8 / 180 : 0;
        const a = angle + spread;
        w.projectiles.push({ id, x: p.x, y: p.y, vx: Math.cos(a) * 700, vy: Math.sin(a) * 700, left: range, power, crit, owner: p.uid, hit: /* @__PURE__ */ new Set(), bounces: 0 });
      }
    }
    w.fx.push(["sh", p.uid, id, tier, p.x | 0, p.y | 0, angle]);
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
      p.hp = Math.min(p.maxHp, p.hp + p.stats.regen * 0.2 * dt);
      p.weapons.forEach(([id, tier], i) => {
        const v = D.weapons[id];
        if (!v) return;
        p.cool[i] = (p.cool[i] || 0) - dt;
        const target = nearest(w, p, v.range + p.stats.range);
        if (target && p.cool[i] <= 0) {
          const angle = Math.atan2(target.y - p.y, target.x - p.x);
          weaponHit(w, p, id, tier, target, angle);
          p.cool[i] = v.cool * 0.9 ** (tier - 1) / (1 + p.stats.atkSpd / 100);
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
        hurtEnemy(w, e, b.power, b.owner, b.crit);
        if (b.id === "rocket") {
          for (const other of w.enemies.slice()) if (other !== e && dist(e, other) < 70) hurtEnemy(w, other, b.power, b.owner, b.crit);
          b.left = 0;
          break;
        }
        if (b.id === "pistol") {
          if (b.hit.size >= 2) b.left = 0;
          break;
        }
        if (b.id === "slingshot" && b.bounces === 0) {
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
      e.clock += dt;
      e.summon = (e.summon || 0) + dt;
      let target = alive[0];
      for (const p of alive) if (dist(e, p) < dist(e, target)) target = p;
      if (!target) break;
      let dx = target.x - e.x, dy = target.y - e.y, d = Math.hypot(dx, dy) || 1;
      let speed = e.speed;
      if (e.type === "spitter" && d < 250) speed = -speed;
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
          if (rand(w) * 100 >= Math.min(60, target.stats.dodge)) {
            const dmg = damageTaken(e.dmg, target.stats.armor);
            target.hp -= dmg;
            target.hurt = 0.1;
            w.fx.push(["hurt", target.uid, Math.ceil(dmg)]);
            if (target.hp <= 0) {
              target.hp = 0;
              target.alive = false;
            }
          }
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
        for (let i = 0; i < 6; i++) spawn(w, "blob", e.x + (rand(w) - 0.5) * 150, e.y + (rand(w) - 0.5) * 150);
      }
    }
    for (const b of w.bullets.slice()) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      for (const p of alive) if (dist(b, p) < 24) {
        if (rand(w) * 100 >= Math.min(60, p.stats.dodge)) {
          const dmg = damageTaken(b.dmg, p.stats.armor);
          p.hp -= dmg;
          w.fx.push(["hurt", p.uid, Math.ceil(dmg)]);
          if (p.hp <= 0) {
            p.hp = 0;
            p.alive = false;
          }
        }
        b.life = 0;
        break;
      }
      if (b.life <= 0) w.bullets.splice(w.bullets.indexOf(b), 1);
    }
    for (const d of w.drops.slice()) {
      for (const p of alive) {
        if (dist(d, p) < 80 * (1 + p.stats.pickup / 100)) {
          gain(w, p);
          w.drops.splice(w.drops.indexOf(d), 1);
          break;
        }
      }
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
  function shop(w, p) {
    const slots = [];
    for (let i = 0; i < 4; i++) {
      const weapon = rand(w) < 0.35;
      const ids = Object.keys(weapon ? D.weapons : D.items), id = ids[Math.floor(rand(w) * ids.length)];
      let tier = 1;
      if (weapon) {
        const cap = w.wave >= 15 ? 4 : w.wave >= 10 ? 3 : w.wave >= 5 ? 2 : 1;
        while (tier < cap && rand(w) < Math.min(0.75, 0.15 + p.stats.luck / 200)) tier++;
      }
      slots.push({ id, weapon, tier, price: price((weapon ? D.weapons : D.items)[id].price, w.wave) * tier, locked: false });
    }
    return slots;
  }
  function buy(p, offer) {
    if (!offer || p.mats < offer.price || offer.weapon && p.weapons.length >= 6) return false;
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
  const api = { waveLength, enemyStats, needXp, price, rerollCost, damageTaken, rollDamage, createPlayer, createWorld, applyInput, spawn, kill, step, canEnd, merge, shop, buy, clamp };
  root.SPUD = root.SPUD || {};
  root.SPUD.sim = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
