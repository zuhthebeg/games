(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const D = P.data;
  const images = {};
  const names = [
    ...Object.keys(D.chars).map(id => 'char_' + id),
    ...Object.keys(D.enemies),
    ...Object.keys(D.weapons).map(id => 'weapon_' + id),
    ...Object.keys(D.items).map(id => 'item_' + id),
    'bg_ground', 'key_art', 'item_crate'
  ];
  for (const id of names) {
    const image = new Image();
    image.onload = () => { image.ok = true; };
    image.onerror = () => { image.ok = false; };
    image.src = 'assets/' + (D.enemies[id] && !id.startsWith('boss_') ? 'enemy_' + id : id) + '.webp';
    images[id] = image;
  }
  const colors = {
    blob: '#9ed45d', bug: '#f7bb44', spitter: '#c08ad8', charger: '#ee8072',
    splitter: '#84bbdd', tank: '#6d9f69', elite: '#d76b9e',
    boss_1: '#ac5c7c', boss_2: '#713f70'
  };
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.c = canvas.getContext('2d');
      this.cam = { x: 0, y: 0 };
      this.effects = new P.fx.Effects();
      this.particles = [];
      this.projectiles = [];
      this.marks = [];
      this.flashes = new Map();
      this.previousDrops = new Map();
      this.shake = 0;
      this.last = 0;
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
    resize() {
      this.dpr = Math.min(2, devicePixelRatio || 1);
      this.canvas.width = Math.round(this.canvas.clientWidth * this.dpr);
      this.canvas.height = Math.round(this.canvas.clientHeight * this.dpr);
    }
    sprite(id, x, y, size, face = 1, time = 0, flash = false) {
      const c = this.c;
      const image = images[id];
      c.save();
      c.translate(x, y + Math.sin(time * 10) * 2);
      c.scale(face, 1);
      if (flash) c.filter = 'brightness(0) invert(1)';
      if (image?.ok) {
        c.drawImage(image, -size / 2, -size / 2, size, size);
      } else {
        c.fillStyle = id.startsWith('char') ? '#a8653a' : colors[id] || '#eeb65a';
        c.strokeStyle = '#452d23';
        c.lineWidth = 4;
        c.beginPath();
        c.arc(0, 0, size * .43, 0, Math.PI * 2);
        c.fill();
        c.stroke();
        if (id.startsWith('char')) {
          c.fillStyle = '#fff';
          c.beginPath();
          c.arc(-size * .12, -size * .07, 4, 0, 7);
          c.arc(size * .12, -size * .07, 4, 0, 7);
          c.fill();
        }
      }
      c.restore();
    }
    shadow(x, y, width) {
      const c = this.c;
      c.save();
      c.fillStyle = 'rgba(47, 29, 20, .21)';
      c.beginPath();
      c.ellipse(x, y + 22, width, 9, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    fx(events, myUid) {
      this.effects.add(events, myUid);
      for (const event of events || []) {
        if (event[0] === 'ex' && this.effects.shakeOn && this.lastOwn &&
          Math.hypot(this.lastOwn.x - event[1], this.lastOwn.y - event[2]) <= event[3]) {
          this.effects.shake = Math.max(this.effects.shake, 6);
        }
      }
      for (const event of events || []) {
        const type = event[0];
        if (type === 'mark') this.marks.push({ x: event[1], y: event[2], life: .9 });

        if (type === 'sh' && D.weapons[event[2]]?.behavior === 'projectile') {
          this.projectiles.push({ x: event[4], y: event[5],
            vx: Math.cos(event[6]) * 700, vy: Math.sin(event[6]) * 700,
            life: D.weapons[event[2]].range / 700, kind: 'sh' });
        }
        if (type === 'eb') {
          this.projectiles.push({ x: event[1], y: event[2],
            vx: Math.cos(event[3]) * event[4], vy: Math.sin(event[3]) * event[4],
            life: 2, kind: 'eb' });
        }
        if (type === 'hurt') {
          this.flashes.set(event[1], performance.now() + 100);

        }

      }
    }
    ground(width, height, world = false) {
      const c = this.c;
      const areaW = world ? D.W : width;
      const areaH = world ? D.H : height;
      const image = images.bg_ground;
      if (image?.ok) {
        c.fillStyle = c.createPattern(image, 'repeat');
        c.fillRect(0, 0, areaW, areaH);
      } else {
        c.fillStyle = '#ead69c';
        c.fillRect(0, 0, areaW, areaH);
        c.strokeStyle = '#d4b87e';
        c.lineWidth = 2;
        for (let x = 0; x < areaW; x += 80) {
          for (let y = 0; y < areaH; y += 80) {
            c.beginPath();
            c.arc(x + 40, y + 40, 3, 0, 7);
            c.stroke();
          }
        }
      }
      if (world) {
        c.strokeStyle = '#69432a';
        c.lineWidth = 16;
        c.strokeRect(0, 0, D.W, D.H);
      }
    }
    draw(scene, myUid, now = performance.now()) {
      const c = this.c;
      const canvas = this.canvas;
      const width = canvas.width / this.dpr;
      const height = canvas.height / this.dpr;
      const elapsed = Math.min(.05, (now - this.last) / 1000 || 0);
      this.last = now;
      if (now < this.effects.stopUntil) return;
      const dt = now < this.effects.slowUntil ? elapsed * .3 : elapsed;
      c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      c.fillStyle = '#ead69c';
      c.fillRect(0, 0, width, height);
      if (!scene) {
        this.previousDrops.clear();
        this.ground(width, height);
        return;
      }
      const players = scene.pl || Object.values(scene.players || {}).map(p =>
        [p.uid, p.x, p.y, p.hp, p.maxHp, p.alive, p.mats, p.xp, p.lvl, p.char, p.f]
      );
      const own = players.find(p => p[0] === myUid);
      if (own) this.lastOwn = { x: own[1], y: own[2] };
      const focus = (own?.[5] ? own : players.find(p => p[5])) || own || players[0];
      if (focus) {
        this.cam.x = Math.max(0, Math.min(D.W - width, focus[1] - width / 2));
        this.cam.y = Math.max(0, Math.min(D.H - height, focus[2] - height / 2));
      }
      c.save();
      c.translate((Math.random() - .5) * this.effects.shake - this.cam.x,
        (Math.random() - .5) * this.effects.shake - this.cam.y);
      this.effects.shake *= .85;
      this.ground(width, height, true);
      const crates = scene.cr || scene.crates || [];
      for (const row of crates) {
        const x = Array.isArray(row) ? row[1] : row.x;
        const y = Array.isArray(row) ? row[2] : row.y;
        this.sprite('item_crate', x, y, 32, 1, now / 1000);
        c.fillStyle = '#fff39b';
        c.beginPath(); c.arc(x + 18, y - 14, 3 + Math.sin(now / 170) * 2, 0, 7); c.fill();
      }
      const drops = scene.d || scene.drops || [];
      const currentDrops = new Map();
      for (const drop of drops) {
        const id = Array.isArray(drop) ? drop[0] : drop.id;
        const x = Array.isArray(drop) ? drop[1] : drop.x;
        const y = Array.isArray(drop) ? drop[2] : drop.y;
        currentDrops.set(id, { x, y });
        c.fillStyle = '#6bbf46';
        c.save();
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.fillRect(-5, -5, 10, 10);
        c.restore();
      }
      if (focus) {
        for (const [id, position] of this.previousDrops) {
          if (!currentDrops.has(id)) {
            this.particles.push({ kind: 'pickup', x: position.x, y: position.y,
              tx: focus[1], ty: focus[2], life: .35 });
          }
        }
      }
      this.previousDrops = currentDrops;
      for (const corpse of this.effects.corpses.slice()) {
        const life = (corpse.until - now) / 120;
        if (life <= 0) {
          this.effects.corpses.splice(this.effects.corpses.indexOf(corpse), 1);
          continue;
        }
        c.save();
        c.globalAlpha = life;
        c.translate(corpse.x, corpse.y);
        c.scale(1 + (1 - life) * .3, 1 - (1 - life) * .35);
        this.sprite(corpse.type, 0, 0, D.enemies[corpse.type]?.size || 40);
        c.restore();
      }
      const enemies = scene.e || scene.enemies || [];
      for (const enemy of enemies) {
        const id = Array.isArray(enemy) ? enemy[1] : enemy.type;
        const x = Array.isArray(enemy) ? enemy[2] : enemy.x;
        const y = Array.isArray(enemy) ? enemy[3] : enemy.y;
        const size = D.enemies[id]?.size || 40;
        this.shadow(x, y, size * .4);
        const flags = Array.isArray(enemy) ? enemy[5] || 0 : enemy.flags || 0;
        const flash = !!(flags & 8) || this.effects.flashes.get(Array.isArray(enemy) ? enemy[0] : enemy.id) > now;
        c.save();
        c.translate(x, y);
        const squash = flash ? Math.max(0, (this.effects.flashes.get(Array.isArray(enemy) ? enemy[0] : enemy.id) - now) / 80) : 0;
        c.scale(1 + squash * .25, 1 - squash * .2);
        this.sprite(id, 0, 0, size, 1, now / 1000, flash);
        c.restore();
        if (flags & 4) {
          c.strokeStyle = '#46ddc8'; c.lineWidth = 3;
          c.beginPath(); c.arc(x, y, size * .55, 0, 7); c.stroke();
        }
        if (flags & 3) {
          c.fillStyle = flags & 1 ? '#ff8a49' : '#e65c5c';
          c.fillRect(x - 4, y - size * .8, 8, 8);
        }
        const hp = Array.isArray(enemy) ? enemy[4] / 100 : enemy.hp / enemy.maxHp;
        if (hp < 1) {
          c.fillStyle = '#572b2b';
          c.fillRect(x - 25, y - size * .7, 50, 5);
          c.fillStyle = '#ec6053';
          c.fillRect(x - 25, y - size * .7, 50 * hp, 5);
        }
      }
      for (const player of players) {
        if (!player[5]) continue;
        const uid = player[0];
        const live = scene.players?.[uid];
        const saved = P.main?.session?.lastPlayers?.[uid];
        const data = live || (uid === myUid ? P.main?.localPlayer : null) || saved;
        const char = player[9] || data?.char || 'basic';
        const face = player[10] || data?.f || 1;
        // 걷기 연출: 프레임간 이동량으로 속도 추정 → 이동 중엔 통통 튀는 홉 + 진행방향 기울기, 정지 시 숨쉬기.
        this.walk = this.walk || new Map();
        const wk = this.walk.get(uid) || { x: player[1], y: player[2], v: 0, t: 0 };
        const moved = Math.hypot(player[1] - wk.x, player[2] - wk.y) / Math.max(dt, 1 / 120);
        wk.v += (Math.min(260, moved) - wk.v) * Math.min(1, dt * 12);
        const lean = Math.max(-1, Math.min(1, (player[1] - wk.x) / Math.max(dt, 1 / 120) / 200)) * .14;
        wk.x = player[1]; wk.y = player[2];
        const moving = wk.v > 25;
        wk.t += dt * (moving ? 14 : 3);
        this.walk.set(uid, wk);
        const hop = moving ? Math.abs(Math.sin(wk.t)) * 6 : 0;
        const breathe = moving ? 1 : 1 + Math.sin(wk.t) * .025;
        this.shadow(player[1], player[2], 24 - hop * .8);
        c.save();
        c.translate(player[1], player[2] + 22);
        c.rotate(moving ? lean : 0);
        c.scale(moving ? 1 + (1 - Math.abs(Math.sin(wk.t))) * .06 : 1 / breathe, moving ? 1 - (1 - Math.abs(Math.sin(wk.t))) * .06 : breathe);
        this.sprite('char_' + char, 0, -22 - hop, 56, face,
          0, (live?.hurt > 0 || this.flashes.get(uid) > now));
        c.restore();
        const weapons = data?.weapons || [];
        weapons.forEach(([weapon], index) => {
          const motion = this.effects.motions.get(`${uid}:${index}`);
          const action = D.weapons[weapon]?.behavior;
          const age = motion ? (now - motion.at) / 1000 : Infinity;
          // 공격 중이 아니면 가장 가까운 적을 조준(사거리+120 내). 없으면 바깥쪽.
          // 최근 0.35s 내 공격 모션이면 그 각도, 아니면 가장 가까운 적(오래된 모션 각도에 고정되는 문제 방지)
          let aim = age < .35 ? motion?.angle : undefined;
          if (aim == null) {
            const reach = (D.weapons[weapon]?.range || 300) + 120;
            let best = reach * reach;
            for (const e of enemies) {
              const ex = Array.isArray(e) ? e[2] : e.x, ey = Array.isArray(e) ? e[3] : e.y;
              const d2 = (ex - player[1]) ** 2 + (ey - player[2]) ** 2;
              if (d2 < best) { best = d2; aim = Math.atan2(ey - player[2], ex - player[1]); }
            }
          }
          const pose = P.sim.weaponPose({ x: player[1], y: player[2], weapons },
            weapon, index, aim ?? 0);
          const direction = aim ?? pose.orbit;
          let extension = 0, angle = direction;
          if (age < .3 && motion?.action === 'thrust') {
            extension = D.weapons[weapon].range * (age < .12 ? age / .12 : ( .27 - age) / .15);
          }
          if (age < .18 && motion?.action === 'sweep') {
            angle = direction + (-60 + 120 * age / .18) * Math.PI / 180;
            c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 8;
            c.beginPath(); c.arc(player[1], player[2], 48,
              direction - Math.PI / 3, angle); c.stroke();
          }
          if (age < .4 && motion?.action === 'slam') {
            extension = age < .2 ? -20 * age / .2 : 35 * (1 - (age - .2) / .2);
          }
          const recoil = age < .12 && action === 'projectile' ? 6 * Math.sin(Math.PI * age / .12) : 0;
          const px = pose.x + Math.cos(direction) * (Math.max(0, extension) - recoil);
          const py = pose.y + Math.sin(direction) * (Math.max(0, extension) - recoil);
          // 무기: 크게(46px) + 짙은 외곽 그림자로 배경 대비, 왼쪽 조준 시 상하 반전(총이 뒤집혀 보이지 않게).
          c.save(); c.translate(px, py); c.rotate(angle);
          if (Math.cos(angle) < 0) c.scale(1, -1);
          c.rotate(D.weapons[weapon].artAngle || 0);
          c.shadowColor = 'rgba(43,26,16,.9)'; c.shadowBlur = 4;
          this.sprite('weapon_' + weapon, 0, 0, D.WEAPON_SIZE || 46);
          c.restore();
          if (age < .12 && (action === 'projectile' || action === 'beam' || action === 'cone' || action === 'chain')) {
            const mx = motion?.origin?.x ?? pose.muzzleX, my = motion?.origin?.y ?? pose.muzzleY;
            const f = 1 - age / .12;
            c.save(); c.globalCompositeOperation = 'lighter';
            const g = c.createRadialGradient(mx, my, 0, mx, my, 22 * f + 4);
            g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(.4, 'rgba(255,210,80,.8)');
            g.addColorStop(1, 'rgba(255,120,20,0)');
            c.fillStyle = g; c.beginPath(); c.arc(mx, my, 22 * f + 4, 0, 7); c.fill();
            // 총구 방향 섬광 스파이크
            c.strokeStyle = `rgba(255,240,170,${f})`; c.lineWidth = 4 * f;
            c.beginPath(); c.moveTo(mx, my);
            c.lineTo(mx + Math.cos(direction) * 30 * f, my + Math.sin(direction) * 30 * f); c.stroke();
            c.restore();
          }
        });
        c.fillStyle = '#693c29';
        c.fillRect(player[1] - 26, player[2] + 30, 52, 5);
        c.fillStyle = '#76dd76';
        c.fillRect(player[1] - 26, player[2] + 30,
          52 * Math.max(0, player[3] / player[4]), 5);
      }
      for (const mark of this.marks.slice()) {
        mark.life -= dt;
        c.strokeStyle = '#eb5548';
        c.lineWidth = 4;
        c.beginPath();
        c.moveTo(mark.x - 12, mark.y - 12);
        c.lineTo(mark.x + 12, mark.y + 12);
        c.moveTo(mark.x + 12, mark.y - 12);
        c.lineTo(mark.x - 12, mark.y + 12);
        c.stroke();
        if (mark.life <= 0) this.marks.splice(this.marks.indexOf(mark), 1);
      }
      for (const bullet of this.projectiles.slice()) {
        bullet.life -= dt;
        bullet.history = (bullet.history || []).slice(-2);
        bullet.history.push([bullet.x, bullet.y]);
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        const hit = enemies.some(enemy => Math.hypot(
          (Array.isArray(enemy) ? enemy[2] : enemy.x) - bullet.x,
          (Array.isArray(enemy) ? enemy[3] : enemy.y) - bullet.y
        ) < 18);
        if (hit || bullet.life <= 0) {
          this.projectiles.splice(this.projectiles.indexOf(bullet), 1);
          continue;
        }
        bullet.history.forEach(([hx, hy], i) => {
          c.fillStyle = `rgba(255,245,170,${(i + 1) * .15})`;
          c.beginPath(); c.arc(hx, hy, 2 + i, 0, 7); c.fill();
        });
        c.fillStyle = bullet.kind === 'eb' ? '#ff7866' : '#fff19a';
        c.beginPath();
        c.arc(bullet.x, bullet.y, 5, 0, 7);
        c.fill();
      }
      this.effects.draw(c, dt, now);
      for (const particle of this.particles.slice()) {
        particle.life -= dt;
        if (particle.kind === 'pickup') {
          const move = Math.min(1, dt / Math.max(.01, particle.life + dt));
          particle.x += (particle.tx - particle.x) * move;
          particle.y += (particle.ty - particle.y) * move;
          c.fillStyle = '#9bf46f';
          c.fillRect(particle.x - 4, particle.y - 4, 8, 8);
        } else {
          particle.y += (particle.vy || -40) * dt;
          particle.x += (particle.vx || 0) * dt;
          c.globalAlpha = Math.max(0, particle.life);
          if (particle.text) {
            c.font = `bold ${particle.crit ? 24 : 17}px Jua, sans-serif`;
            c.strokeStyle = '#503324';
            c.lineWidth = 3;
            c.strokeText(particle.text, particle.x, particle.y);
            c.fillStyle = particle.crit ? '#fff037' : '#fff';
            c.fillText(particle.text, particle.x, particle.y);
          } else {
            c.fillStyle = '#afdb51';
            c.fillRect(particle.x, particle.y, particle.size || 7, particle.size || 7);
          }
          c.globalAlpha = 1;
        }
        if (particle.life <= 0) this.particles.splice(this.particles.indexOf(particle), 1);
      }
      c.restore();
      if (now < this.effects.flashScreen) {
        c.fillStyle = `rgba(255,255,255,${(this.effects.flashScreen - now) / 180})`;
        c.fillRect(0, 0, width, height);
      }
    }
  }
  P.render = { Renderer, images };
})(window);
