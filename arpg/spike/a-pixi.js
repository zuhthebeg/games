import { Application, Container, Sprite, Texture, Rectangle, Graphics, ParticleContainer, Particle, BitmapFont, BitmapText } from '../vendor/pixi-8.22.0.min.mjs';
import { FRAME, PALETTE, WORLD } from './scene.js';

export async function createRenderer(host, assets, scene, view) {
  const app = new Application(), textures = [], sources = [];
  try {
    await app.init({ width: view.width, height: view.height, resolution: view.dpr, autoDensity: true,
      preference: 'webgl', preferWebGLVersion: 2, antialias: false, background: 0x10191e, autoStart: false });
    host.appendChild(app.canvas);
    app.stage.eventMode = 'none'; app.stage.interactiveChildren = false;
    const world = new Container(); app.stage.addChild(world);
    const root = Texture.from(assets.atlas), ground = Texture.from(assets.ground);
    sources.push(root.source, ground.source); textures.push(root, ground);
    const frame = (x, y) => { const t = new Texture({ source: root.source, frame: new Rectangle(x, y, FRAME, FRAME) }); textures.push(t); return t; };
    const frames = [0, 1].map(row => Array.from({ length: 6 }, (_, f) => frame(f * FRAME, row * FRAME)));
    const shadowTexture = frame(0, 192), glowTexture = frame(96, 192);
    world.addChild(new Sprite(ground));
    const telegraph = new Graphics(); world.addChild(telegraph);
    const shadows = new Container(), actors = new Container(); actors.sortableChildren = true;
    world.addChild(shadows, actors);
    const sprites = scene.entities.map(e => {
      const sprite = new Sprite({ texture: frames[e.player ? 0 : 1][0], anchor: .5, tint: e.player ? 0xffffff : PALETTE[e.palette] });
      const shadow = new Sprite({ texture: shadowTexture, anchor: .5 }); shadow.scale.set(.7, .24);
      actors.addChild(sprite); shadows.addChild(shadow); return { sprite, shadow };
    });
    const particles = scene.particles.map(p => new Particle({ texture: glowTexture, anchorX: .5, anchorY: .5, scaleX: p.scale, scaleY: p.scale }));
    const particleLayer = new ParticleContainer({ texture: glowTexture, particles, blendMode: 'add', boundsArea: new Rectangle(0, 0, WORLD.width, WORLD.height), dynamicProperties: { position: true, color: true, vertex: false, rotation: false, uvs: false } });
    world.addChild(particleLayer);
    BitmapFont.install({ name: 'SpikeDigits', chars: '0123456789', resolution: view.dpr, padding: 2, skipKerning: true,
      style: { fontFamily: 'Arial', fontSize: 20, fontWeight: 'bold', fill: 0xffdf88 } });
    const numbers = scene.numbers.map(n => { const text = new BitmapText({ text: n.value, anchor: .5, style: { fontFamily: 'SpikeDigits', fontSize: 20 } }); world.addChild(text); return text; });
    const gl = app.renderer.gl;
    const renderer = gl ? (gl.getParameter(gl.VERSION).includes('WebGL 2') ? 'WebGL2' : 'WebGL1') : app.renderer.name;
    const font = BitmapFont.get ? BitmapFont.get('SpikeDigits') : null;
    const fontBytes = font?.pages?.reduce((sum, page) => sum + page.texture.source.width * page.texture.source.height * 4, 0) ?? null;
    return {
      info: { renderer, tint: 'Sprite.tint (multiplicative grayscale palette; batched, no filter/render target)',
        memory: { generatedRgbaBytes: assets.bytes, extraPaletteRgbaBytes: 0, bitmapFontRgbaBytes: fontBytes,
          note: 'RGBA source lower bound only; GPU upload/framebuffers/driver pools excluded; JS heap is page-wide.' } },
      render() {
        world.position.set(-scene.camera.x, -scene.camera.y);
        telegraph.clear();
        for (const shape of scene.telegraphs) telegraph.poly(shape.points, true).fill({ color: 0xff4040, alpha: shape.alpha }).stroke({ color: 0xff6262, alpha: .8, width: 2 });
        for (let i = 0; i < sprites.length; i++) {
          const e = scene.entities[i], { sprite, shadow } = sprites[i];
          sprite.position.set(e.x, e.y - 24); sprite.zIndex = e.y; sprite.texture = frames[e.player ? 0 : 1][e.frame];
          shadow.position.set(e.x, e.y + 9);
        }
        for (let i = 0; i < particles.length; i++) { const p = scene.particles[i]; particles[i].x = p.x; particles[i].y = p.y; particles[i].alpha = p.alpha; }
        for (let i = 0; i < numbers.length; i++) { const n = scene.numbers[i]; numbers[i].position.set(n.x, n.y); numbers[i].alpha = n.alpha; }
        app.render();
      },
      destroy() {
        app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
        BitmapFont.uninstall('SpikeDigits');
        textures.forEach(t => t.destroy(false)); sources.forEach(s => s.destroy());
      }
    };
  } catch (error) {
    if (app.renderer) app.destroy({ removeView: true, releaseGlobalResources: true }, { children: true });
    textures.forEach(t => t.destroy(false)); sources.forEach(s => s.destroy());
    BitmapFont.uninstall('SpikeDigits');
    throw error;
  }
}
