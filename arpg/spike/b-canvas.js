import { canvas, bakePalettes, FRAME } from './scene.js';

export async function createRenderer(host, assets, scene, view) {
  const surface = canvas(Math.round(view.width * view.dpr), Math.round(view.height * view.dpr));
  surface.style.width = `${view.width}px`; surface.style.height = `${view.height}px`;
  const ctx = surface.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const start = performance.now(), palettes = bakePalettes(assets.atlas), paletteBakeMs = performance.now() - start;
  host.appendChild(surface);
  return {
    info: { renderer: 'canvas', paletteBakeMs, tint: 'Six pre-baked multiplicative monster atlases',
      memory: { generatedRgbaBytes: assets.bytes, extraPaletteRgbaBytes: palettes.reduce((sum, c) => sum + c.width * c.height * 4, 0),
        bitmapFontRgbaBytes: 0, note: 'RGBA backing-store lower bound; compositor/driver copies excluded; JS heap is page-wide.' } },
    render() {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#10191e'; ctx.fillRect(0, 0, view.width, view.height);
      ctx.translate(-scene.camera.x, -scene.camera.y); ctx.drawImage(assets.ground, 0, 0);
      for (const shape of scene.telegraphs) {
        const points = shape.points; ctx.beginPath(); ctx.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
        ctx.closePath(); ctx.fillStyle = '#ff4040'; ctx.globalAlpha = shape.alpha; ctx.fill();
        ctx.globalAlpha = .8; ctx.strokeStyle = '#ff6262'; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const e of scene.entities) ctx.drawImage(assets.atlas, 0, 192, 96, 96, e.x - 33.6, e.y + 9 - 11.52, 67.2, 23.04);
      for (const e of scene.sorted) ctx.drawImage(e.player ? assets.atlas : palettes[e.palette], e.frame * FRAME, 0, FRAME, FRAME, e.x - 48, e.y - 72, FRAME, FRAME);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of scene.particles) { ctx.globalAlpha = p.alpha; const size = 96 * p.scale; ctx.drawImage(assets.atlas, 96, 192, 96, 96, p.x - size / 2, p.y - size / 2, size, size); }
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#ffdf88'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const n of scene.numbers) { ctx.globalAlpha = n.alpha; ctx.fillText(n.value, n.x, n.y); }
      ctx.globalAlpha = 1;
    },
    destroy() { surface.remove(); surface.width = surface.height = 0; palettes.forEach(c => { c.width = c.height = 0; }); }
  };
}
