// Renderer-independent workload. Positions are functions of absolute scene time, never fps.
export const VERSION = 'arpg-render-spike-1';
export const SEED = 0x15ab2026;
export const WORLD = { width: 1400, height: 860 };
export const FRAME = 96;
export const PALETTE = [0xef6666, 0x65d98c, 0x64aaff, 0xba83ef, 0xf0c76b, 0x6cdbd5];
export function rng(seed = SEED) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function canvas(width, height) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}
export function makeAssets() {
  const atlas = canvas(FRAME * 6, FRAME * 3), ctx = atlas.getContext('2d');
  for (let row = 0; row < 2; row++) for (let f = 0; f < 6; f++) {
    ctx.save(); ctx.translate(f * FRAME + 48, row * FRAME + 57);
    const stride = Math.sin(f / 6 * Math.PI * 2) * 6;
    ctx.fillStyle = row ? '#888' : '#273854';
    ctx.fillRect(-17, 7 + stride, 12, 23); ctx.fillRect(5, 7 - stride, 12, 23);
    ctx.fillStyle = row ? '#ddd' : '#66b7ef';
    ctx.beginPath(); ctx.ellipse(0, -5 + Math.abs(stride) / 3, 24, 25, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = row ? '#eee' : '#edd1ab';
    ctx.beginPath(); ctx.arc(0, -31, 15, 0, Math.PI * 2); ctx.fill();
    if (row) {
      ctx.fillStyle = '#aaa'; ctx.beginPath(); ctx.moveTo(-15, -35); ctx.lineTo(-26, -51); ctx.lineTo(-7, -43); ctx.moveTo(15, -35); ctx.lineTo(26, -51); ctx.lineTo(7, -43); ctx.fill();
    } else { ctx.fillStyle = '#36496d'; ctx.fillRect(-17, -49, 34, 10); }
    ctx.fillStyle = '#222'; ctx.fillRect(-9, -34, 5, 5); ctx.fillRect(4, -34, 5, 5);
    ctx.fillStyle = row ? '#bbb' : '#c6d9eb'; ctx.fillRect(25, -19 + stride, 8, 34);
    ctx.restore();
  }
  // Soft shadow and glow share the same source atlas in both variants.
  let gradient = ctx.createRadialGradient(48, 240, 1, 48, 240, 46);
  gradient.addColorStop(0, 'rgba(0,0,0,.5)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gradient; ctx.fillRect(0, 192, 96, 96);
  gradient = ctx.createRadialGradient(144, 240, 0, 144, 240, 46);
  gradient.addColorStop(0, '#fff2bb'); gradient.addColorStop(.16, 'rgba(255,180,60,.9)'); gradient.addColorStop(1, 'rgba(255,90,10,0)');
  ctx.fillStyle = gradient; ctx.fillRect(96, 192, 96, 96);
  const ground = canvas(WORLD.width, WORLD.height), g = ground.getContext('2d'), random = rng();
  g.fillStyle = '#172328'; g.fillRect(0, 0, ground.width, ground.height);
  g.strokeStyle = '#273638'; g.lineWidth = 1;
  for (let x = 0; x < WORLD.width; x += 70) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, WORLD.height); g.stroke(); }
  for (let y = 0; y < WORLD.height; y += 70) { g.beginPath(); g.moveTo(0, y); g.lineTo(WORLD.width, y); g.stroke(); }
  for (let i = 0; i < 260; i++) { g.fillStyle = i % 2 ? '#34433c' : '#1d2e30'; g.fillRect(random() * 1400, random() * 860, 4 + random() * 12, 3 + random() * 7); }
  return { atlas, ground, bytes: (atlas.width * atlas.height + ground.width * ground.height) * 4,
    destroy() { atlas.width = atlas.height = ground.width = ground.height = 0; } };
}
export function bakePalettes(atlas) {
  const source = atlas.getContext('2d').getImageData(0, FRAME, FRAME * 6, FRAME);
  return PALETTE.map(color => {
    const c = canvas(FRAME * 6, FRAME), ctx = c.getContext('2d');
    const image = ctx.createImageData(c.width, c.height), channels = [color >> 16, color >> 8 & 255, color & 255];
    for (let i = 0; i < source.data.length; i += 4) {
      for (let ch = 0; ch < 3; ch++) image.data[i + ch] = Math.round(source.data[i + ch] * channels[ch] / 255);
      image.data[i + 3] = source.data[i + 3];
    }
    ctx.putImageData(image, 0, 0); return c;
  });
}
export function makeScene(multiplier = 1) {
  const random = rng(), entities = [], particles = [], numbers = [], telegraphs = [];
  for (let i = 0; i < 24 * multiplier; i++) entities.push({ id: i, player: i < 4 * multiplier,
    palette: (i - 4 * multiplier + 6 * multiplier) % 6, bx: 470 + random() * 460, by: 245 + random() * 360,
    phase: random() * Math.PI * 2, speed: .4 + random() * .6, x: 0, y: 0, frame: 0 });
  for (let i = 0; i < 200 * multiplier; i++) particles.push({ phase: random() * Math.PI * 2, speed: .6 + random(), radius: 20 + random() * 290, x: 0, y: 0, alpha: 0, scale: .12 + random() * .24 });
  for (let i = 0; i < 30 * multiplier; i++) numbers.push({ bx: 495 + random() * 410, by: 250 + random() * 350, phase: random(), value: String(100 + (random() * 890 | 0)), x: 0, y: 0, alpha: 0 });
  for (let i = 0; i < 3 * multiplier; i++) telegraphs.push({ kind: i % 3, x: 595 + (i % 3) * 105 + Math.floor(i / 3) * 30, y: 340 + (i % 2) * 130, points: [], alpha: 0 });
  const sorted = entities.slice(), camera = { x: 0, y: 0 };
  return { entities, particles, numbers, telegraphs, sorted, camera, multiplier };
}
export function updateScene(scene, t, width, height) {
  scene.camera.x = Math.max(0, WORLD.width - width) * (.5 + .14 * Math.sin(t * .12));
  scene.camera.y = Math.max(0, WORLD.height - height) * (.5 + .14 * Math.cos(t * .1));
  for (const e of scene.entities) { e.x = e.bx + Math.sin(t * e.speed + e.phase) * 55; e.y = e.by + Math.cos(t * e.speed * .8 + e.phase) * 40; e.frame = Math.floor(t * 9 + e.phase) % 6; }
  scene.sorted.sort((a, b) => a.y - b.y || a.id - b.id);
  for (const p of scene.particles) { const a = p.phase + t * p.speed; p.x = 700 + Math.cos(a) * p.radius; p.y = 430 + Math.sin(a * 1.3) * p.radius * .65; p.alpha = .35 + .6 * (Math.sin(a) * .5 + .5); }
  for (const n of scene.numbers) { const life = (t * .65 + n.phase) % 1; n.x = n.bx; n.y = n.by - life * 65; n.alpha = 1 - life; }
  for (let i = 0; i < scene.telegraphs.length; i++) {
    const s = scene.telegraphs[i], rotation = t * .3 + i, points = s.points; points.length = 0;
    s.alpha = .15 + .12 * (Math.sin(t * 2 + i) * .5 + .5);
    if (s.kind === 0) {
      points.push(s.x, s.y);
      for (let j = 0; j <= 24; j++) { const a = rotation - .6 + j / 24 * 1.2; points.push(s.x + Math.cos(a) * 150, s.y + Math.sin(a) * 150); }
    } else if (s.kind === 1) {
      const r = 85 + Math.sin(t * 1.8) * 8;
      for (let j = 0; j < 48; j++) { const a = j / 48 * Math.PI * 2; points.push(s.x + Math.cos(a) * r, s.y + Math.sin(a) * r); }
    } else for (const [x, y] of [[-100,-30],[100,-30],[100,30],[-100,30]]) points.push(s.x + x * Math.cos(rotation) - y * Math.sin(rotation), s.y + x * Math.sin(rotation) + y * Math.cos(rotation));
  }
}
