import { Graphics, RenderTexture, Sprite } from '../../vendor/pixi-8.22.0.min.mjs';
import { BIOMES } from '../content/biomes.js';
import { createBiomeLayout, randomFor } from './biome-layout.js';

function prop(g, p, color, dark) {
  const { x, y, kind: k } = p;
  const line = (points, width = 2) => g.poly(points, false).stroke({ color, width });
  const box = (dx, dy, w, h) => g.rect(x + dx, y + dy, w, h).fill(color);
  const oval = (dx, dy, w, h) => g.ellipse(x + dx, y + dy, w, h).fill(color);
  g.ellipse(x + 2, y + 7, 26, 10).fill({ color: 0x0d1417, alpha: .35 });
  switch (k) {
    case 'tree':
      box(-4, -8, 8, 33); oval(0, -12, 26, 22); oval(-12, -7, 17, 18); oval(14, -4, 18, 17);
      g.ellipse(x - 4, y - 15, 15, 11).fill({ color: dark, alpha: .28 }); break;
    case 'bush': case 'fern':
      for (let i = -2; i <= 2; i++) line([x, y + 16, x + i * 10, y - 12, x + i * 7, y + 3], k === 'bush' ? 7 : 3); break;
    case 'grass': case 'drygrass': case 'reeds':
      for (let i = -2; i <= 2; i++) line([x + i * 6, y + 10, x + i * 8 - 2, y - (k === 'reeds' ? 24 : 9)]);
      if (k === 'reeds') { box(-17, -26, 4, 9); box(13, -23, 4, 9); } break;
    case 'flowers':
      for (let i = -1; i <= 1; i++) { line([x + i * 14, y + 8, x + i * 14, y - 7]); g.circle(x + i * 14, y - 7, 3).fill(color); } break;
    case 'mushroom':
      for (const dx of [-13, 10]) { box(dx - 2, -2, 4, 13); g.ellipse(x + dx, y - 4, 10, 6).fill(color).circle(x + dx - 3, y - 6, 2).fill(dark); } break;
    case 'stones': case 'boulder': case 'ore': case 'pebbles': case 'rubble':
      for (let i = 0; i < 3; i++) { const dx = (i - 1) * 16, size = k === 'boulder' ? 17 : 10;
        g.poly([x + dx - size, y + 6, x + dx - size / 2, y - size, x + dx + size / 2, y - size + 2, x + dx + size, y + 8]).fill(color);
        line([x + dx - size / 2, y - size + 4, x + dx, y + 3], 1); } break;
    case 'roots': case 'crack':
      line([x - 28, y + 10, x - 12, y, x - 3, y + 3, x + 13, y - 15, x + 27, y - 18], k === 'roots' ? 4 : 2);
      line([x - 3, y + 3, x + 7, y + 21]); break;
    case 'log': case 'beam': case 'splinters':
      box(-28, -7, 56, k === 'beam' ? 18 : 12); line([x - 22, y - 3, x + 23, y - 3], 1);
      if (k === 'splinters') line([x - 21, y + 19, x + 19, y + 12], 4); break;
    case 'wheel': case 'cart':
      g.circle(x - 15, y + 8, 13).stroke({ color, width: 3 });
      line([x - 28, y + 8, x - 2, y + 8]); line([x - 15, y - 5, x - 15, y + 21]);
      if (k === 'cart') { box(-6, -20, 34, 21); line([x - 6, y - 12, x + 28, y - 12]); } break;
    case 'barrel': case 'urn': case 'stump':
      oval(0, 0, k === 'urn' ? 13 : 20, 19);
      g.ellipse(x, y - 9, 15, 6).stroke({ color: dark, width: 2 });
      if (k === 'stump') g.circle(x, y - 5, 7).stroke({ color: dark, width: 2 });
      else line([x - 16, y + 6, x + 16, y + 6]); break;
    case 'crate': case 'hay': case 'slab': case 'carpet':
      box(-25, -16, 50, 32);
      if (k === 'crate') line([x - 22, y - 13, x + 22, y + 13, x + 22, y - 13, x - 22, y + 13]);
      else { g.rect(x - 20, y - 11, 40, 22).stroke({ color: dark, width: 2 }); } break;
    case 'fence': case 'rails':
      for (const dx of [-22, 22]) box(dx - 2, -23, 4, 46);
      for (const dy of [-12, 12]) box(-28, dy - 2, 56, 4); break;
    case 'column':
      box(-14, -28, 28, 50); box(-21, -29, 42, 7); box(-21, 20, 42, 7);
      line([x - 5, y - 20, x - 5, y + 15], 2); line([x + 5, y - 20, x + 5, y + 15], 2); break;
    case 'rune':
      g.circle(x, y, 21).stroke({ color, width: 1 }); line([x - 9, y + 12, x, y - 16, x + 9, y + 12, x - 9, y + 12]); break;
    case 'shield':
      g.poly([x - 15, y - 21, x + 15, y - 21, x + 12, y + 6, x, y + 23, x - 12, y + 6]).fill(color);
      line([x, y - 15, x, y + 14], 2); break;
    case 'brazier':
      box(-3, -7, 6, 28); box(-17, 18, 34, 5);
      g.poly([x - 19, y - 10, x + 19, y - 10, x + 10, y + 1, x - 10, y + 1]).fill(color);
      // Cold violet embers, not animated orange flames competing with danger cues.
      g.poly([x - 9, y - 12, x - 4, y - 25, x + 2, y - 18, x + 7, y - 29, x + 10, y - 12]).fill(0x403e4c); break;
    case 'water': case 'lily':
      g.ellipse(x, y, 30, 18).fill(dark).ellipse(x - 4, y - 2, 24, 12).stroke({ color, width: 1 });
      if (k === 'lily') g.ellipse(x + 3, y, 10, 5).fill(color); break;
    case 'web':
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; line([x, y, x + Math.cos(a) * 30, y + Math.sin(a) * 30], 1); }
      for (const r of [10, 20, 30]) { const pts = []; for (let i = 0; i < 6; i++) pts.push(x + Math.cos(i * Math.PI / 3) * r, y + Math.sin(i * Math.PI / 3) * r); g.poly(pts).stroke({ color, width: 1 }); } break;
    case 'eggs': case 'cocoon':
      for (let i = -1; i <= 1; i++) g.ellipse(x + i * 15, y + Math.abs(i) * 7, k === 'cocoon' ? 10 : 7, k === 'cocoon' ? 23 : 10).fill(color);
      line([x - 22, y - 6, x + 23, y + 12], 1); break;
    case 'ash':
      for (let i = 0; i < 9; i++) g.circle(x + (i % 3 - 1) * 18, y + (Math.floor(i / 3) - 1) * 12, 2).fill(color); break;
    default: throw new Error(`Unknown biome prop ${k}`);
  }
}

export function paintBiome(g, layout) {
  const { w, h, id, seed } = layout, b = BIOMES[id], random = randomFor(seed ^ 0x9e3779b9);
  g.rect(0, 0, w, h).fill(b.tiles[0]);
  // Jittered irregular earth plates or staggered stone courses: no alternating checker.
  const stone = ['fortress', 'throne', 'mine'].includes(id);
  for (let y = 0, row = 0; y < h; y += 44, row++) {
    for (let x = -80 + (row % 2) * 43; x < w; x += 86) {
      const color = b.tiles[Math.floor(random() * b.tiles.length)];
      if (stone) g.rect(x + 1, y + 1, 83, 41).fill(color);
      else g.poly([x - random() * 12, y + 5, x + 61, y - random() * 12, x + 92, y + 26, x + 50, y + 53, x - 7, y + 36]).fill(color);
    }
  }
  // Worn continuous lane; all color stays deliberately below telegraph luminance.
  const lane = [];
  for (let x = 0; x <= w + 100; x += 100) lane.push([x, h * .5 + Math.sin(x / 240) * 46]);
  for (let i = 1; i < lane.length; i++) {
    const [x, y] = lane[i - 1], [nx, ny] = lane[i];
    g.poly([x, y - 32, nx, ny - 32, nx, ny + 32, x, y + 32]).fill({ color: b.path, alpha: .65 });
    if (id === 'mine') {
      for (const dy of [-16, 16]) g.moveTo(x, y + dy).lineTo(nx, ny + dy).stroke({ color: b.accent, width: 2, alpha: .55 });
      for (let dx = 0; dx < 100; dx += 24) g.moveTo(x + dx, y - 20).lineTo(x + dx, y + 20).stroke({ color: b.path, width: 4 });
    }
    if (id === 'throne') g.poly([x, y - 24, nx, ny - 24, nx, ny + 24, x, y + 24]).fill(0x452c37);
  }
  for (let i = 0; i < 160; i++) {
    const x = random() * w, y = random() * h;
    g.ellipse(x, y, 3 + random() * 18, 1 + random() * 6).fill({ color: b.path, alpha: .25 });
  }
  // Biome-specific perimeter, kept below entities/telegraphs like all props.
  g.rect(7, 7, w - 14, h - 14).stroke({ color: b.path, width: 14 });
  const perimeter = [];
  for (let x = 28; x < w - 28; x += 54) perimeter.push([x, 17], [x, h - 17]);
  for (let y = 60; y < h - 28; y += 54) perimeter.push([17, y], [w - 17, y]);
  for (const [x, y] of perimeter) {
    if (b.boundary === 'fence' || b.boundary === 'timber') g.rect(x - 4, y - 12, 8, 24).fill(b.accent);
    else if (b.boundary === 'wall') g.rect(x - 22, y - 9, 44, 18).fill(b.accent);
    else if (b.boundary === 'roots') g.moveTo(x - 17, y + 4).lineTo(x, y - 8).lineTo(x + 19, y + 3).stroke({ color: b.accent, width: 5 });
    else g.poly([x - 17, y + 6, x - 10, y - 10, x + 9, y - 8, x + 17, y + 8]).fill(b.accent);
  }
  for (const p of layout.props) prop(g, p, b.accent, b.tiles[0]);
}

// Exactly one RGBA8 texture, resolution 1 even on high-DPI screens: 4,816,000 bytes.
// No upper layer: trees/columns cannot obscure entities, danger shapes or poison.
export function bakeBiome(renderer, stageId, w, h) {
  const layout = createBiomeLayout(stageId, w, h), graphic = new Graphics();
  const texture = RenderTexture.create({ width: w, height: h, resolution: 1, antialias: false });
  try {
    paintBiome(graphic, layout);
    renderer.render({ container: graphic, target: texture, clear: true });
  } catch (error) { texture.destroy(true); throw error; }
  finally { graphic.destroy(true); }
  return { sprite: new Sprite(texture), texture, layout, bytes: w * h * 4 };
}
