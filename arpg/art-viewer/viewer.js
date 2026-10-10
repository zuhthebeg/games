import { Application, Assets, AnimatedSprite, Container, Graphics, Text } from '../vendor/pixi-8.22.0.min.mjs';
const $ = (id) => document.getElementById(id);
const dirs = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];
const labels = { idle: '대기', run: '달리기', attack: '공격', dodge: '회피', hit: '피격', death: '죽음' };
const debug = window.__ART_VIEWER__ = { ready: false, loadedSheets: 0, frameAdvances: 0, direction: 'S', frames: {}, errors: [], moving: false };
let app, models, ring = [], big, shadow, ground, heading, ringGroup, asset, color = 0xffffff;
let direction = 'S', actualAnimation = 'idle', input = { x: 0, y: 0 }, normalized = { x: .62, y: .5 }, moving = false;
const keys = new Set();
function selectedID() { return $('character').value === 'hero' ? `hero-${$('weapon').value}` : $('character').value; }
function tint() {
  const t = Number($('tint').value) / 100;
  const mul = (c) => Math.round(255 + (c - 255) * t);
  const value = asset.monster ? (mul(color >> 16 & 255) << 16) | (mul(color >> 8 & 255) << 8) | mul(color & 255) : 0xffffff;
  for (const sprite of [...ring.map((r) => r.sprite), big]) sprite.tint = value;
  debug.tint = value;
}
function text(label, size = 12, fill = 0xbcb39d) { return new Text({ text: label, style: { fontFamily: 'system-ui', fontSize: size, fill, align: 'center' } }); }
function setBig(animation, facing, restart = false) {
  if (!restart && animation === actualAnimation && facing === direction) return;
  const frames = asset.animations[`${animation}_${facing}`];
  if (!frames) throw new Error(`애니메이션 없음: ${animation}_${facing}`);
  const previous = big.currentFrame;
  big.textures = frames; big.animationSpeed = asset.fps / 60;
  big.loop = animation === 'idle' || animation === 'run';
  big.gotoAndPlay(restart ? 0 : Math.min(previous, frames.length - 1));
  actualAnimation = animation; direction = facing; debug.direction = facing; debug.animation = animation;
}
function refresh() {
  asset = models.get(selectedID());
  $('weapon').disabled = asset.monster;
  $('tint-controls').style.opacity = asset.monster ? '1' : '.5';
  const prior = $('animation').value;
  $('animation').replaceChildren(...asset.states.map((a) => { const o = document.createElement('option'); o.value = a; o.textContent = labels[a]; return o; }));
  $('animation').value = asset.states.includes(prior) ? prior : 'idle';
  for (const item of ring) {
    item.sprite.anchor.set(asset.anchor.x, asset.anchor.y);
    item.sprite.textures = asset.animations[`${$('animation').value}_${item.direction}`];
    item.sprite.animationSpeed = asset.fps / 60; item.sprite.loop = true; item.sprite.gotoAndPlay(0);
  }
  big.anchor.set(asset.anchor.x, asset.anchor.y);
  big.scale.set(asset.id === 'goblin-chief' ? 1.55 * 1.3 : 1.55);
  setBig($('animation').value, direction, true); tint(); debug.character = selectedID();
  debug.frames = Object.fromEntries(Object.entries(asset.animations).map(([k, v]) => [k, v.length]));
  $('status').textContent = `${asset.label} · ${asset.fps}fps · ${Object.values(asset.animations).reduce((n, a) => n + a.length, 0)}프레임 · 8방향 · ${debug.loadedSheets}개 atlas 로드`;
}
function layout() {
  if (!app) return;
  const w = app.screen.width, h = app.screen.height, split = 310;
  ground.clear().rect(0, 0, w, h).fill(0x171b21);
  // Dark-fantasy hand-drawn basalt tiles, no texture/network dependencies.
  for (let row = 0; row < 9; row++) for (let col = -1; col < Math.ceil(w / 70) + 1; col++) {
    const x = col * 70 + (row % 2) * 35, y = split + row * 42;
    ground.poly([x, y, x + 35, y + 20, x, y + 40, x - 35, y + 20]).fill({ color: [0x22282a, 0x292d2b, 0x24282b][(row + col + 99) % 3] }).stroke({ color: 0x111718, width: 1 });
  }
  ground.rect(0, 0, w, split).fill(0x171b21).moveTo(0, split).lineTo(w, split).stroke({ color: 0x514a38, width: 1 });
  heading.position.set(12, 10);
  ringGroup.position.set(w / 2, 167);
  const radius = Math.min(w * .34, 122);
  for (const r of ring) {
    const a = dirs.indexOf(r.direction) * Math.PI / 4;
    const x = Math.cos(a) * radius, y = Math.sin(a) * 99;
    r.sprite.position.set(x, y + 32); r.sprite.scale.set(.66);
    r.label.position.set(x, y + 43); r.label.anchor.set(.5, 0);
  }
  big.position.set(normalized.x * w, split + 65 + normalized.y * (h - split - 95));
  shadow.position.set(big.x, big.y - 2);
}
function joystick(event) {
  const box = $('joystick').getBoundingClientRect();
  const x = event.clientX - box.left - box.width / 2, y = event.clientY - box.top - box.height / 2;
  const length = Math.hypot(x, y), amount = Math.min(38, length), nx = length ? x / length : 0, ny = length ? y / length : 0;
  $('knob').style.transform = `translate(${nx * amount}px,${ny * amount}px)`;
  input = length > 9 ? { x: nx * amount / 38, y: ny * amount / 38 } : { x: 0, y: 0 };
}
function release() { input = { x: 0, y: 0 }; $('knob').style.transform = ''; }
async function main() {
  const manifest = await (await fetch('../assets/sprites/manifest.json')).json();
  models = new Map();
  await Promise.all(manifest.map(async (entry) => {
    const animations = {};
    for (const file of entry.sheets) {
      const sheet = await Assets.load(`../assets/sprites/${entry.id}/${file}`);
      Object.assign(animations, sheet.animations); debug.loadedSheets++;
    }
    for (const state of entry.animations) for (const d of dirs) if (!animations[`${state}_${d}`]?.length) throw new Error(`${entry.id}: ${state}_${d} 누락`);
    models.set(entry.id, { ...entry, animations, states: entry.animations });
  }));
  app = new Application();
  await app.init({ resizeTo: $('stage'), preference: 'webgl', background: 0x171b21, antialias: true, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, 2) });
  $('stage').prepend(app.canvas);
  ground = new Graphics(); app.stage.addChild(ground);
  ringGroup = new Container(); app.stage.addChild(ringGroup);
  heading = text('8방향 / 실시간 애니메이션', 12); app.stage.addChild(heading);
  asset = models.get('hero-sword');
  for (const d of dirs) {
    const sprite = new AnimatedSprite(asset.animations[`idle_${d}`]); sprite.anchor.set(.5, .82);
    const label = text(d, 11); ringGroup.addChild(sprite, label); ring.push({ sprite, label, direction: d });
  }
  // Soft independent blob; never part of the baked atlas.
  shadow = new Graphics();
  for (let i = 9; i >= 1; i--) shadow.ellipse(0, 0, 18 + i * 1.6, 6 + i * .55).fill({ color: 0x020408, alpha: .027 });
  app.stage.addChild(shadow);
  big = new AnimatedSprite(asset.animations.idle_S); big.anchor.set(.5, .82); big.scale.set(1.55); app.stage.addChild(big);
  const arenaLabel = text('이동 테스트 · 원본 128px × 1.55', 11); arenaLabel.position.set(12, 323); app.stage.addChild(arenaLabel);
  for (const id of ['character', 'weapon', 'animation']) $(id).addEventListener('change', refresh);
  $('tint').addEventListener('input', tint);
  for (const b of document.querySelectorAll('[data-color]')) b.addEventListener('click', () => { color = parseInt(b.dataset.color, 16); tint(); });
  let activePointer = null;
  $('joystick').addEventListener('pointerdown', (e) => { activePointer = e.pointerId; $('joystick').setPointerCapture(e.pointerId); joystick(e); });
  $('joystick').addEventListener('pointermove', (e) => { if (e.pointerId === activePointer) joystick(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) $('joystick').addEventListener(type, () => { activePointer = null; release(); });
  window.addEventListener('keydown', (e) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key) && !['SELECT', 'INPUT'].includes(e.target.tagName)) { keys.add(e.key); e.preventDefault(); } });
  window.addEventListener('keyup', (e) => keys.delete(e.key));
  window.addEventListener('blur', () => { keys.clear(); release(); });
  const observer = new ResizeObserver(() => { app.resize(); layout(); }); observer.observe($('stage'));
  const frameIndices = new Map();
  app.ticker.add((ticker) => {
    let x = input.x + Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
    let y = input.y + Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'));
    const length = Math.hypot(x, y), wasMoving = moving; moving = length > .05;
    if (moving) {
      if (length > 1) { x /= length; y /= length; }
      const index = (Math.round(Math.atan2(y, x) / (Math.PI / 4)) + 8) % 8;
      setBig('run', dirs[index]);
      const dt = Math.min(ticker.deltaMS, 50) / 1000;
      normalized.x = Math.max(.15, Math.min(.85, normalized.x + x * dt * 115 / app.screen.width));
      normalized.y = Math.max(0, Math.min(1, normalized.y + y * dt * 100 / (app.screen.height - 405)));
      layout();
    } else if (wasMoving) setBig('idle', direction, true);
    for (const r of [...ring.map((r) => r.sprite), big]) {
      const before = frameIndices.get(r); if (before !== undefined && before !== r.currentFrame) debug.frameAdvances++;
      frameIndices.set(r, r.currentFrame);
    }
    debug.currentFrame = big.currentFrame; debug.moving = moving; debug.position = { x: big.x, y: big.y };
    debug.ringFrames = ring.map((r) => r.sprite.currentFrame);
  });
  refresh(); layout(); debug.ready = true; debug.animationKeys = [...models].map(([id, m]) => ({ id, keys: Object.keys(m.animations), frames: Object.values(m.animations).reduce((n, a) => n + a.length, 0) }));
}
main().catch((error) => { debug.errors.push(String(error)); $('error').textContent = `뷰어 로드 실패: ${error.message}`; console.error(error); });
