import { Assets, Container, Graphics, Sprite } from '../../vendor/pixi-8.22.0.min.mjs';
import { AtlasLibrary } from './atlas-library.js';
import { ATLAS_IDS, visualKey, atlasDirection, atlasAnimation, atlasFrame, atlasScale } from './atlas-state.js';

export function registerAtlasFactories(provider, fallbackFactory) {
  const library = new AtlasLibrary({
    baseUrl: new URL('../../assets/sprites/', import.meta.url),
    fetchManifest: async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Atlas manifest HTTP ${response.status}`);
      return response.json();
    },
    loadSheet: (url, id) => Assets.load({ src: url, data: { cachePrefix: `${id}/` } }),
    unloadSheet: (url) => Assets.unload(url),
  });
  provider.atlases = library;
  for (const key of Object.keys(ATLAS_IDS)) {
    provider.register(key, (entity, options) => lazyVisual(entity, options, library, fallbackFactory));
  }
}

function lazyVisual(entity, options, library, fallbackFactory) {
  const container = new Container();
  let current = fallbackFactory(entity, options);
  let destroyed = false;
  let mode = 'procedural';
  container.addChild(current.container);
  library.load(visualKey(entity)).then((asset) => {
    if (destroyed || !asset) return;
    const next = spriteVisual(entity, options, asset);
    current.destroy();
    current = next;
    mode = 'atlas';
    container.addChild(current.container);
  }).catch(() => {
    // Invalid/unsupported art is never a fatal gameplay error.
    mode = 'procedural';
  });
  return {
    container,
    get debug() { return { mode, key: visualKey(entity), ...current.debug }; },
    update(state, animation, deltaTime) {
      if (!destroyed) current.update(state, animation, deltaTime);
    },
    destroy() {
      destroyed = true;
      current.destroy();
      container.removeFromParent();
      container.destroy({ children: true });
    },
  };
}

function spriteVisual(entity, { color }, asset) {
  const container = new Container();
  const sprite = new Sprite(asset.animations.idle_E[0]);
  sprite.anchor.set(asset.anchor.x, asset.anchor.y);
  sprite.tint = entity.kind === 'monster' ? color : 0xffffff;
  sprite.scale.set(atlasScale(entity));
  const stars = new Graphics();
  for (let index = 0; index < 3; index++)
    stars.star((index - 1) * 14, -62 - (index % 2) * 6, 4, 4, 2).fill(0xffd57a);
  const bar = new Graphics().rect(-entity.r, -66, entity.r * 2, 4).fill(0x1b1b18);
  const health = new Graphics().rect(-entity.r, -66, entity.r * 2, 4).fill(0xb26d50);
  container.addChild(sprite, stars, bar, health);
  let stateName = '', direction = 'E', age = 0, previousAct = null, previousDodge = null, frame = 0;
  return {
    container,
    get debug() {
      return { id: asset.id, state: stateName, direction, frame, tint: sprite.tint, scale: sprite.scale.x,
        textureLoaded: sprite.texture.source.width > 0 && sprite.texture.source.height > 0 };
    },
    update(state, animation, deltaTime) {
      animation.age += deltaTime;
      if (state.dead) animation.deadAge += deltaTime;
      const wanted = atlasAnimation(state, animation);
      const next = asset.animations[`${wanted}_E`] ? wanted : 'idle';
      if (next !== stateName || next === 'attack' && previousAct !== state.act
        || next === 'dodge' && previousDodge !== state.dodge?.startedTick) age = 0;
      else age += deltaTime;
      previousAct = state.act;
      previousDodge = state.dodge?.startedTick;
      stateName = next;
      direction = atlasDirection(state.facing);
      const textures = asset.animations[`${stateName}_${direction}`];
      frame = atlasFrame(stateName, textures.length, age, asset.fps, state);
      sprite.texture = textures[frame];
      sprite.tint = animation.hurt > 0 ? 0xffffff : state.kind === 'monster' ? color : 0xffffff;
      sprite.alpha = state.spawnLeft > 0 ? .45 : 1;
      stars.visible = state.staggerLeft > 0;
      stars.rotation = Math.sin(animation.age * 6) * .05;
      container.alpha = state.dead ? Math.max(0, 1 - animation.deadAge / .7)
        : state.terminal === 'return_scroll' ? .35 : 1;
      bar.visible = health.visible = state.kind === 'monster' && !state.dead;
      health.scale.x = Math.max(0, state.hp / state.maxHp);
    },
    destroy() {
      container.removeFromParent();
      // Do not destroy atlas textures; other entities can share them.
      container.destroy({ children: true });
    },
  };
}
