import { advanceDeathKnightPlayback, deathKnightAnimation } from './death-knight-playback.js';
import { BALANCE } from '../content/balance.js';
import { Assets, Container, Graphics, Sprite, Text, Texture, Rectangle } from '../../vendor/pixi-8.22.0.min.mjs';
import { paperdolls } from './paperdoll-library.js';
import { paperdollEnabled } from './paperdoll-state.js';
import { AtlasLibrary } from './atlas-library.js';
import { ATLAS_IDS, visualKey, atlasDirection, atlasAnimation, atlasFrame, atlasScale } from './atlas-state.js';

export function registerAtlasFactories(provider, fallbackFactory) {
  const library = new AtlasLibrary({
    baseUrl: new URL('../../assets/sprites/', import.meta.url),
    fetchManifest: async (url) => {
      // Revalidate the kit registry when a new stamped renderer boots; otherwise
      // an old cached manifest can hide newly delivered monster art for hours.
      const response = await fetch(url, { cache: 'no-cache' });
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
  let transitionFailure = null;
  let lease;
  const controller = new AbortController();
  container.addChild(current.container);
  const load = entity.kind === 'player' && options.equipment && paperdollEnabled()
    ? (async () => {
      try {
        lease = await paperdolls.acquire(options.equipment, controller.signal);
        if (destroyed) { lease.release(); lease = null; return null; }
        return paperdollTextures(lease.asset);
      } catch { lease?.release(); lease = null; if (destroyed) return null; }
      return library.load(visualKey(entity));
    })() : library.load(visualKey(entity));
  load.then((asset) => {
    if (destroyed || !asset) return;
    const next = spriteVisual(entity, options, asset);
    current.destroy();
    current = next;
    mode = asset.descriptor ? 'paperdoll' : 'atlas';
    container.addChild(current.container);
  }).catch((error) => {
    // Invalid/unsupported art is never a fatal gameplay error.
    transitionFailure = error.message || 'Atlas presentation failed';
    mode = 'procedural';
  });
  return {
    container,
    get debug() { return { mode, key: visualKey(entity), loadFailure: transitionFailure || library.failed.get(visualKey(entity)) || null, ...current.debug }; },
    weaponPose() { return current.weaponPose?.() || null; },
    update(state, animation, deltaTime) {
      if (!destroyed) current.update(state, animation, deltaTime);
    },
    destroy() {
      destroyed = true;
      controller.abort();
      current.destroy();
      lease?.release();
      container.removeFromParent();
      container.destroy({ children: true });
    },
  };
}

function paperdollTextures(asset) {
  if (asset.animations) return asset;
  const source = Texture.from(asset.canvas), textures = {};
  for (const name of asset.manifest.frames) {
    const {rect,trim} = asset.manifest.layout.frames[name];
    textures[name] = new Texture({source:source.source,frame:new Rectangle(...rect),
      orig:new Rectangle(0,0,128,128),trim:new Rectangle(...trim)});
  }
  asset.animations = Object.fromEntries(Object.entries(asset.manifest.animations)
    .map(([name,frames])=>[name,frames.map(frame=>textures[frame])]));
  // Weapon-only silhouette frames share the body frame's 128px origin, so they
  // overlay the drawn weapon exactly with the same anchor/scale. null = no weapon drawn.
  const mask = asset.weaponMask, weaponTextures = {};
  const maskSource = mask?.canvas && mask.layer ? Texture.from(mask.canvas) : null;
  if (maskSource) for (const name of asset.manifest.frames) {
    const frame = mask.layer.frames[name]; if (!frame) continue;
    const [x,y,w,h] = mask.layer.rects[frame.index];
    weaponTextures[name] = { texture:new Texture({source:maskSource.source,frame:new Rectangle(x,y,w,h),
      orig:new Rectangle(0,0,128,128),trim:new Rectangle(frame.offset[0],frame.offset[1],w,h)}),
      cx:frame.offset[0]+w/2, cy:frame.offset[1]+h/2 };
  }
  asset.weaponAnimations = maskSource ? Object.fromEntries(Object.entries(asset.manifest.animations)
    .map(([name,frames])=>[name,frames.map(frame=>weaponTextures[frame] || null)])) : null;
  asset.anchor=asset.manifest.anchor;asset.fps=asset.manifest.fps;
  asset.disposeTextures = () => {
    Object.values(textures).forEach(texture=>texture.destroy()); source.destroy(true);
    Object.values(weaponTextures).forEach(w=>w.texture.destroy()); maskSource?.destroy(true);
  };
  return asset;
}

function spriteVisual(entity, { color }, asset) {
  const container = new Container();
  const sprite = new Sprite(asset.animations.idle_E[0]);
  sprite.anchor.set(asset.anchor.x, asset.anchor.y);
  sprite.tint = entity.kind === 'monster' ? (entity.eliteVariant ? BALANCE.elite.tint : color) : 0xffffff;
  // This candidate's parser expands physical128 to logical256 (resolution .5).
  // Normalize only this kit; historical skeleton/human geometry is unchanged.
  sprite.scale.set(atlasScale(entity) * (asset.id === 'player-death-knight' ? .5 : 1));
  // Same atlas geometry, additive bright impact; no filters or base-palette tint changes.
  const flash = new Sprite(sprite.texture);
  flash.anchor.copyFrom(sprite.anchor);
  flash.scale.copyFrom(sprite.scale);
  flash.blendMode = 'add';
  flash.visible = false;
  const dragon = entity.type === 'throne_dragon';
  const cue = dragon ? new Text({ text:'', style:{fontFamily:'sans-serif',fontSize:17,fill:0xffe1a8,
    stroke:{color:0x17151a,width:4}} }) : null;
  if (cue) { cue.anchor.set(.5); cue.y=-250; container.addChild(cue); }
  const stars = new Graphics();
  for (let index = 0; index < 3; index++)
    stars.star((index - 1) * 14, -62 - (index % 2) * 6, 4, 4, 2).fill(0xffd57a);
  const bar = new Graphics().rect(-entity.r, -66, entity.r * 2, 4).fill(0x1b1b18);
  // Drawn from x=0 and shifted left so scale.x drains right-to-left, not toward the middle.
  const health = new Graphics().rect(0, -66, entity.r * 2, 4).fill(0xb26d50);
  health.x = -entity.r;
  if (dragon) { bar.y=health.y=-164; } // Boss bar above wings; training atlas is untouched.
  container.addChild(sprite, flash, stars, bar, health);
  const deathKnightPlayback = {};
  let stateName = '', direction = 'E', age = 0, previousAct = null, previousDodge = null, frame = 0;
  return {
    container,
    // Current drawn-weapon pose in this container's local space, for presentation overlays.
    weaponPose() {
      const pose = asset.weaponAnimations?.[`${stateName}_${direction}`]?.[frame];
      if (!pose) return asset.weaponAnimations ? { hidden:true } : null;
      const scale = sprite.scale.x;
      return { texture:pose.texture, anchor:sprite.anchor, scale,
        x:(pose.cx - sprite.anchor.x*128)*scale, y:(pose.cy - sprite.anchor.y*128)*scale };
    },
    get debug() {
      return { id: asset.id, state: stateName, direction, frame, tint: sprite.tint, scale: sprite.scale.x,
        equipment: asset.descriptor || null,
        ...(asset.id === 'player-death-knight' ? { age, duration: asset.animation_durations?.[stateName] || null, startedTick: previousDodge, playback: 'source-dodge' } : {}),
        textureLoaded: sprite.texture.source.width > 0 && sprite.texture.source.height > 0 };
    },
    update(state, animation, deltaTime) {
      flash.visible = animation.flash > 0 && !animation.reduced;
      flash.alpha = animation.flash || 0;
      if (animation.frozen) return;
      animation.age += deltaTime;
      if (state.dead) animation.deadAge += deltaTime;
      const wanted = asset.id === 'player-death-knight' ? deathKnightAnimation(state, animation, atlasAnimation, deathKnightPlayback, asset.animation_durations.dodge) : atlasAnimation(state, animation);
      const next = asset.animations[`${wanted}_E`] ? wanted : 'idle';
      if (asset.id === 'player-death-knight') {
        age = advanceDeathKnightPlayback(deathKnightPlayback, state, next, deltaTime);
      } else if (next !== stateName || next === 'attack' && previousAct !== state.act
        || next === 'dodge' && previousDodge !== state.dodge?.startedTick) age = 0;
      else age += deltaTime;
      previousAct = state.act;
      previousDodge = state.dodge?.startedTick;
      stateName = next;
      direction = atlasDirection(state.facing);
      const textures = asset.animations[`${stateName}_${direction}`];
      frame = atlasFrame(stateName, textures.length, age, asset.fps, state, asset.animation_durations?.[stateName]);
      sprite.texture = textures[frame];
      flash.texture = sprite.texture;
      sprite.tint = state.kind === 'monster' ? (state.eliteVariant ? BALANCE.elite.tint : color) : 0xffffff;
      sprite.alpha = state.spawnLeft > 0 ? .45 : 1;
      stars.visible = state.staggerLeft > 0;
      stars.rotation = Math.sin(animation.age * 6) * .05;
      container.alpha = state.dead ? Math.max(0, 1 - animation.deadAge / .7)
        : state.terminal === 'return_scroll' ? .35 : 1;
      // Training samples (scarecrow, dragon) never lose HP, so no bar.
      bar.visible = health.visible = state.kind === 'monster' && !state.dead && state.type !== 'training_dragon';
      health.scale.x = Math.max(0, state.hp / state.maxHp);
      if (cue) { cue.visible=!!state.act && !state.dead;
        cue.text=state.act ? `공격: ${state.act.def.name} · 단계: ${state.act.phase==='recovery'?'회복':state.act.phase==='active'?'발동':'준비'}` : ''; }
    },
    destroy() {
      container.removeFromParent();
      // Do not destroy atlas textures; other entities can share them.
      container.destroy({ children: true });
    },
  };
}
