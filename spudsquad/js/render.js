(function (root) {
  'use strict';
  const P = root.SPUD = root.SPUD || {};
  const D = P.data;
  const images = {};
  const names = [
    ...Object.keys(D.chars).map(id => 'char_' + id),
    ...Object.keys(D.enemies),
    ...Object.keys(D.weapons).map(id => 'weapon_' + id),
    // 무기 티어 아트(T2 파랑·T3 보라 룬·T4 황금). 없으면 weaponArt가 기본 아트로 폴백.
    ...Object.keys(D.weapons).flatMap(id => [2, 3, 4].map(t => `weapon_${id}_t${t}`)),
    ...Object.keys(D.items).map(id => 'item_' + id),
    'bg_ground', 'key_art', 'item_crate'
  ];
  for (const id of names) {
    const image = new Image();
    image.onload = () => {
      image.ok = true;
      if (!D.enemies[id] && !id.startsWith('char_')) return;
      // Cache the white alpha mask once. A per-sprite Canvas filter forces
      // expensive offscreen raster work during dense hit bursts.
      const flash = document.createElement('canvas');
      flash.width = image.naturalWidth; flash.height = image.naturalHeight;
      const fc = flash.getContext('2d');
      fc.drawImage(image, 0, 0);
      fc.globalCompositeOperation = 'source-in';
      fc.fillStyle = '#fff'; fc.fillRect(0, 0, flash.width, flash.height);
      image.flash = flash;
    };
    image.onerror = () => { image.ok = false; };
    image.src = 'assets/' + (D.enemies[id] && !id.startsWith('boss_') ? 'enemy_' + id : id) + '.webp?v=20261001v6';
    images[id] = image;
  }
  const weaponArt = (id, tier) => tier >= 2 && images[`weapon_${id}_t${tier}`]?.ok ? `weapon_${id}_t${tier}` : 'weapon_' + id;
  const colors = {
    blob: '#9ed45d', bug: '#f7bb44', spitter: '#c08ad8', charger: '#ee8072',
    splitter: '#84bbdd', tank: '#6d9f69', elite: '#d76b9e',
    gunner: '#e0483a', boss_1: '#ac5c7c', boss_2: '#713f70'
  };
  // 무기 등급 팔레트: T1 기본 · T2 파랑 · T3 보라 · T4(만렙) 무지개/금
  const TIER = {
    1: { glow: 'rgba(43,26,16,.9)', blur: 4, core: '#fff19a', trail: '255,245,170' },
    2: { glow: '#3f9dff', blur: 10, core: '#bfe3ff', trail: '110,185,255' },
    3: { glow: '#b25cff', blur: 14, core: '#e8c8ff', trail: '195,130,255' },
    4: { glow: '#ffc93c', blur: 18, core: '#fff6c8', trail: '255,210,80' }
  };
  const hueRgb = (now) => {
    const h = (now / 6) % 360 / 60, x = 1 - Math.abs(h % 2 - 1);
    const [r, g, b] = h < 1 ? [1, x, 0] : h < 2 ? [x, 1, 0] : h < 3 ? [0, 1, x] : h < 4 ? [0, x, 1] : h < 5 ? [x, 0, 1] : [1, 0, x];
    return `${Math.round(155 + r * 100)},${Math.round(155 + g * 100)},${Math.round(155 + b * 100)}`;
  };
  // 카메라 계산(순수 함수, 테스트용 노출). players 행 = [uid, x, y, hp, maxHp, alive, ...]
  const MIN_VIEW_AREA = .5, TEAM_MARGIN = 220;
  function viewCamera(width, height, players, focus, reach) {
    const fitMap = Math.min(width / D.W, height / D.H);
    let areaZoom = Math.sqrt(width * height / (MIN_VIEW_AREA * D.W * D.H));
    // 한 축이 맵 밖으로 넘치면 그 축은 맵 크기로 잘리므로, 남은 축만으로 50%를 채우게 더 줌아웃한다.
    if (height / areaZoom > D.H) areaZoom = Math.min(areaZoom, width / (MIN_VIEW_AREA * D.W));
    if (width / areaZoom > D.W) areaZoom = Math.min(areaZoom, height / (MIN_VIEW_AREA * D.H));
    const rangeZoom = (width + height) / 4 / (reach * 1.2 + 40);
    let zoom = Math.min(1, areaZoom, rangeZoom);
    let cx = focus?.[1] ?? D.W / 2, cy = focus?.[2] ?? D.H / 2;
    const alive = (players || []).filter(p => p[5]);
    if (alive.length > 1) {
      const xs = alive.map(p => p[1]), ys = alive.map(p => p[2]);
      const x0 = Math.min(...xs) - TEAM_MARGIN, x1 = Math.max(...xs) + TEAM_MARGIN;
      const y0 = Math.min(...ys) - TEAM_MARGIN, y1 = Math.max(...ys) + TEAM_MARGIN;
      zoom = Math.min(zoom, width / (x1 - x0), height / (y1 - y0));
      cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
    }
    return { zoom: Math.max(fitMap, zoom), cx, cy };
  }
  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.c = canvas.getContext('2d');
      this.cam = { x: 0, y: 0 };
      this.effects = new P.fx.Effects();
      this.particles = [];
      this.projectiles = [];
      this.chilled = new Map();
      this.marks = [];
      this.flashes = new Map();
      this.revives = new Map(); // uid → 부활 연출 종료 시각
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
      size *= this.spriteK || 1;
      if (image?.ok) {
        c.drawImage(flash && image.flash ? image.flash : image, -size / 2, -size / 2, size, size);
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
        if (type === 'st' && event[2] === 'chill') this.chilled.set(event[1], performance.now() + 2000);
        if (type === 'ex') {
          const cannon = this.projectiles.find(b => b.id === 'potato_cannon' &&
            Math.hypot(b.x - event[1], b.y - event[2]) < 100);
          const owner = P.main?.session?.world?.players[event[4]] ||
            (event[4] === myUid ? P.main?.localPlayer : P.main?.session?.lastPlayers?.[event[4]]);
          if (cannon || owner?.items?.includes('shrapnel')) {
            for (let i = 0; i < 3; i++) this.projectiles.push({ x: event[1], y: event[2],
              vx: Math.cos(i * Math.PI * 2 / 3) * 700, vy: Math.sin(i * Math.PI * 2 / 3) * 700,
              life: 180 / 700, kind: 'fragment', tier: cannon?.tier || 1 });
          }
        }
        if (type === 'mark') this.marks.push({ x: event[1], y: event[2], life: .9 });

        if (type === 'sh' && D.weapons[event[2]]?.behavior === 'projectile') {
          this.projectiles.push({ x: event[4], y: event[5],
            vx: Math.cos(event[6]) * 700, vy: Math.sin(event[6]) * 700,
            life: D.weapons[event[2]].range / 700, kind: 'sh', tier: event[3] || 1,
            id: event[2], owner: event[1], returning: false });
        }
        if (type === 'eb') {
          this.projectiles.push({ x: event[1], y: event[2],
            vx: Math.cos(event[3]) * event[4], vy: Math.sin(event[3]) * event[4],
            life: 2, kind: 'eb' });
        }
        if (type === 'hurt') {
          this.flashes.set(event[1], performance.now() + 100);
        }
        if (type === 'rv') {
          this.revives.set(event[1], performance.now() + 1600);
          P.sfx?.('lvl');

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
      // Hit feedback must not freeze world/camera paints while authoritative
      // simulation and local movement continue between animation frames.
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
      // 시야: 내 최대 무기 사거리 기준 줌 + (1) 맵 면적 최소 50% 보장 (2) 멀티는 살아있는 동료 전원이 보이게.
      // 하한은 '맵 전체가 화면에 들어오는 줌' — 양 끝에 흩어지면 맵 전체가 보인다.
      const me = scene.players?.[myUid] || P.main?.localPlayer;
      let reach = 420;
      if (me?.weapons?.length) {
        const bonus = P.sim.effectiveStats(me).range || 0;
        reach = Math.max(...me.weapons.filter(([id]) => D.weapons[id]).map(([id]) =>
          P.sim.weaponRange ? P.sim.weaponRange(me, D.weapons[id]) : D.weapons[id].range + bonus), 100);
      }
      const view = viewCamera(width, height, players, focus, reach);
      this.zoom = this.zoom ? this.zoom + (view.zoom - this.zoom) * Math.min(1, elapsed * 3) : view.zoom;
      const z = this.zoom, viewW = width / z, viewH = height / z;
      // 줌아웃된 만큼 스프라이트를 약하게 키워 식별성 유지(판정 크기는 불변)
      this.spriteK = Math.pow(1 / z, .4);
      if (focus) {
        this.cam.x = viewW >= D.W ? (D.W - viewW) / 2 : Math.max(0, Math.min(D.W - viewW, view.cx - viewW / 2));
        this.cam.y = viewH >= D.H ? (D.H - viewH) / 2 : Math.max(0, Math.min(D.H - viewH, view.cy - viewH / 2));
      }
      c.save();
      c.scale(z, z);
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
        // 바닥 재화: 파란 보석(2026-10-01, 초록 바닥과 구분되게). 테두리로 밝은 바닥에서도 보이게.
        c.save();
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.fillStyle = '#1f5fd6';
        c.fillRect(-6, -6, 12, 12);
        c.fillStyle = '#4da3ff';
        c.fillRect(-4.5, -4.5, 9, 9);
        c.fillStyle = '#c9e6ff';
        c.fillRect(-4.5, -4.5, 3, 3);
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
        if (flags & 32) c.rotate(Math.sin(now / 40) * .12); // 부화 직전 알 흔들림
        this.sprite(id, 0, 0, size, 1, now / 1000, flash);
        c.restore();
        if (flags & 16) { // 응원단장 버프: 빨간 외곽 링
          c.strokeStyle = 'rgba(255,70,60,.85)'; c.lineWidth = 3;
          c.beginPath(); c.arc(x, y, size * .5, 0, 7); c.stroke();
        }
        if (flags & 4) {
          c.strokeStyle = '#46ddc8'; c.lineWidth = 3;
          c.beginPath(); c.arc(x, y, size * .55, 0, 7); c.stroke();
        }
        if (flags & 3) {
          c.fillStyle = flags & 1 ? '#ff8a49' : '#e65c5c';
          c.fillRect(x - 4, y - size * .8, 8, 8);
        }
        if (this.chilled.get(Array.isArray(enemy) ? enemy[0] : enemy.id) > now || enemy.status?.chill?.left > 0) {
          c.strokeStyle = '#86dcff'; c.lineWidth = 3;
          c.beginPath(); c.arc(x, y, size * .55, 0, 7); c.stroke();
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
        const dead = !player[5];
        c.save();
        if (dead) c.globalAlpha = .38; // 사망 중에도 캐릭터·무기를 유령처럼 표시(무기는 유지됨)
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
          let extension = 0, angle = direction, sideX = 0, sideY = 0;
          // 근접: 판정 사거리(reach)까지 무기가 실제로 날아갔다 돌아온다. 0.07s 전진·0.05s 유지·0.2s 복귀.
          const reach = motion?.reach || D.weapons[weapon].range;
          const out = age < .07 ? age / .07 : age < .12 ? 1 : Math.max(0, 1 - (age - .12) / .2);
          const ease = 1 - (1 - out) ** 3;
          if (age < .32 && motion?.action === 'thrust') {
            extension = reach * ease;
            if (age < .16) { // 찌르기 잔상
              c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 6; c.lineCap = 'round';
              c.beginPath(); c.moveTo(pose.x, pose.y);
              c.lineTo(pose.x + Math.cos(direction) * extension, pose.y + Math.sin(direction) * extension); c.stroke();
            }
          }
          if (age < .3 && motion?.action === 'sweep') {
            // 총구를 중심으로 반경 reach의 120° 호를 무기가 실제로 훑는다(판정과 동일한 원점·반경).
            const t = Math.min(1, age / .16);
            const swing = direction + (-60 + 120 * (1 - (1 - t) ** 2)) * Math.PI / 180;
            const ox = motion.origin?.x ?? pose.muzzleX, oy = motion.origin?.y ?? pose.muzzleY;
            const r = reach * (age < .16 ? 1 : Math.max(0, 1 - (age - .16) / .14));
            angle = swing;
            sideX = ox + Math.cos(swing) * r * .8 - pose.x; sideY = oy + Math.sin(swing) * r * .8 - pose.y;
            if (age < .2) {
              c.strokeStyle = `rgba(255,255,255,${.8 * (1 - age / .2)})`; c.lineWidth = 10;
              c.beginPath(); c.arc(ox, oy, reach * .8, direction - Math.PI / 3, swing); c.stroke();
            }
          }
          if (age < .4 && motion?.action === 'slam') {
            // 목표 지점까지 뛰어올라 내려찍는다: 0.15s 비행(포물선) 후 0.25s 복귀.
            const t = age < .15 ? age / .15 : Math.max(0, 1 - (age - .15) / .25);
            extension = reach * t;
            sideY = age < .15 ? -Math.sin(Math.PI * t) * 30 : 0;
          }
          const recoil = age < .12 && action === 'projectile' ? 6 * Math.sin(Math.PI * age / .12) : 0;
          const px = pose.x + sideX + Math.cos(direction) * (Math.max(0, extension) - recoil);
          const py = pose.y + sideY + Math.sin(direction) * (Math.max(0, extension) - recoil);
          // 무기: 크게(46px) + 짙은 외곽 그림자로 배경 대비, 왼쪽 조준 시 상하 반전(총이 뒤집혀 보이지 않게).
          c.save(); c.translate(px, py); c.rotate(angle);
          if (Math.cos(angle) < 0) c.scale(1, -1);
          c.rotate(D.weapons[weapon].artAngle || 0);
          const tier = Math.max(1, Math.min(4, weapons[index]?.[1] || 1));
          const tv = TIER[tier];
          const pulse = tier >= 3 ? 1 + Math.sin(now / 180 + index) * .04 : 1;
          if (tier === 4) {
            // 만렙: 무지개로 도는 오라 링 + 강한 발광
            c.save(); c.globalCompositeOperation = 'lighter';
            const g = c.createRadialGradient(0, 0, 4, 0, 0, 34);
            g.addColorStop(0, `rgba(${hueRgb(now)},.55)`); g.addColorStop(1, 'rgba(255,200,60,0)');
            c.fillStyle = g; c.beginPath(); c.arc(0, 0, 34, 0, 7); c.fill(); c.restore();
          }
          c.shadowColor = tier === 4 ? `rgb(${hueRgb(now)})` : tv.glow;
          c.shadowBlur = tv.blur;
          this.sprite(weaponArt(weapon, tier), 0, 0, (D.WEAPON_SIZE || 46) * (1 + .07 * (tier - 1)) * pulse);
          if (tier >= 2) { // 두 번 그려 발광을 더 진하게
            c.globalAlpha *= .5; this.sprite(weaponArt(weapon, tier), 0, 0, (D.WEAPON_SIZE || 46) * (1 + .07 * (tier - 1)) * pulse);
          }
          c.restore();
          if (tier === 4) { // 만렙 반짝이 3개가 무기 주위를 공전
            c.save(); c.globalCompositeOperation = 'lighter';
            for (let k = 0; k < 3; k++) {
              const a = now / 260 + k * 2.094 + index;
              const sx = px + Math.cos(a) * 26, sy = py + Math.sin(a) * 26;
              c.fillStyle = `rgba(255,${230 - k * 30},${140 + k * 40},.95)`;
              c.beginPath(); c.moveTo(sx, sy - 5); c.lineTo(sx + 1.6, sy - 1.6); c.lineTo(sx + 5, sy);
              c.lineTo(sx + 1.6, sy + 1.6); c.lineTo(sx, sy + 5); c.lineTo(sx - 1.6, sy + 1.6);
              c.lineTo(sx - 5, sy); c.lineTo(sx - 1.6, sy - 1.6); c.closePath(); c.fill();
            }
            c.restore();
          }
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
        if (dead) {
          c.globalAlpha = .9; c.font = '20px sans-serif'; c.textAlign = 'center';
          c.fillText('👻', player[1], player[2] - 42);
        }
        const revive = this.revives.get(uid);
        if (revive && revive > now) { // 흔들어 부활: 퍼지는 금빛 고리
          const k = 1 - (revive - now) / 1600;
          c.globalAlpha = 1 - k;
          c.strokeStyle = '#ffd84a'; c.lineWidth = 5;
          c.beginPath(); c.arc(player[1], player[2], 30 + k * 60, 0, 7); c.stroke();
        } else if (revive) this.revives.delete(uid);
        c.restore();
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
      for (const [id, until] of this.chilled) if (until <= now) this.chilled.delete(id);
      for (const bullet of this.projectiles.slice()) {
        const returningWeapon = D.weapons[bullet.id]?.returning;
        if (returningWeapon && bullet.life <= dt && !bullet.returning) {
          bullet.returning = true; bullet.life = (D.weapons[bullet.id].range + 200) / 700;
        }
        if (bullet.returning) {
          const owner = players.find(p => p[0] === bullet.owner);
          if (owner) {
            const a = Math.atan2(owner[2] - bullet.y, owner[1] - bullet.x);
            bullet.vx = Math.cos(a) * 700; bullet.vy = Math.sin(a) * 700;
            if (Math.hypot(owner[1] - bullet.x, owner[2] - bullet.y) <= 700 * dt + 1) bullet.life = 0;
          }
        }
        bullet.life -= dt;
        bullet.history = (bullet.history || []).slice(-2);
        bullet.history.push([bullet.x, bullet.y]);
        bullet.x += bullet.vx * dt;
        bullet.y += bullet.vy * dt;
        const hit = enemies.some(enemy => Math.hypot(
          (Array.isArray(enemy) ? enemy[2] : enemy.x) - bullet.x,
          (Array.isArray(enemy) ? enemy[3] : enemy.y) - bullet.y
        ) < 18);
        if ((!returningWeapon && hit) || bullet.life <= 0) {
          this.projectiles.splice(this.projectiles.indexOf(bullet), 1);
          continue;
        }
        const bt = bullet.kind === 'eb' ? null : TIER[bullet.tier || 1];
        const trail = bt ? (bullet.tier === 4 ? hueRgb(now) : bt.trail) : '255,130,110';
        bullet.history.forEach(([hx, hy], i) => {
          c.fillStyle = `rgba(${trail},${(i + 1) * .18})`;
          c.beginPath(); c.arc(hx, hy, 2 + i + (bullet.tier || 1) * .5, 0, 7); c.fill();
        });
        c.save();
        if (bt && bullet.tier > 1) { c.shadowColor = `rgb(${trail})`; c.shadowBlur = 6 + bullet.tier * 3; }
        if (returningWeapon) {
          c.translate(bullet.x, bullet.y); c.rotate(now / 60);
          this.sprite(weaponArt(bullet.id, bullet.tier), 0, 0, 28);
          c.restore(); continue;
        }
        c.fillStyle = bullet.kind === 'eb' ? '#ff7866' : bullet.tier === 4 ? '#fff6c8' : bt.core;
        c.beginPath();
        c.arc(bullet.x, bullet.y, 4.5 + (bullet.tier || 1) * .8, 0, 7);
        c.fill();
        c.restore();
      }
      this.effects.draw(c, dt, now);
      for (const particle of this.particles.slice()) {
        particle.life -= dt;
        if (particle.kind === 'pickup') {
          const move = Math.min(1, dt / Math.max(.01, particle.life + dt));
          particle.x += (particle.tx - particle.x) * move;
          particle.y += (particle.ty - particle.y) * move;
          c.fillStyle = '#6fb8ff';
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
      this.debugOverlay(scene, myUid);
    }
  }
  // 디버그 오버레이(?debug=1): 내 무기별 실사거리(S.weaponRange) 원. 호스트(솔로) 월드에서만 그린다.
  Renderer.prototype.debugOverlay = function (scene, myUid) {
    const view = P.main?.debugView;
    const p = view?.ranges && scene?.players?.[myUid];
    if (!p?.weapons?.length) return;
    const c = this.c, k = this.dpr * (this.zoom || 1);
    const colors = ['#fff19a', '#3f9dff', '#b25cff', '#ffc93c'];
    c.save();
    c.setTransform(k, 0, 0, k, -this.cam.x * k, -this.cam.y * k);
    c.lineWidth = 2;
    c.font = 'bold 13px system-ui, sans-serif';
    c.textAlign = 'center';
    p.weapons.forEach(([id, tier], i) => {
      const v = D.weapons[id];
      if (!v) return;
      const r = P.sim.weaponRange(p, v);
      c.setLineDash(v.kind === 'melee' ? [4, 4] : [10, 6]);
      c.strokeStyle = colors[(tier || 1) - 1] || colors[0];
      c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#2b1a10';
      c.fillText(`${id} T${tier} · ${Math.round(r)}`, p.x, p.y - r - 4 - i * 14);
    });
    c.restore();
  };
  P.render = { Renderer, images, viewCamera, weaponArt };
})(window);
