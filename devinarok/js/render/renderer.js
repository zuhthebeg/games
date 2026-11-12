import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ARENA } from '../sim/arena.js';
import { attackReach } from '../core/attack-assist.js';
import { COMBO_TIMELINES, pickAimTarget } from '../sim/world.js';
import { ITEMS, RARITIES } from '../content/items.js';
import { LINEAGES, lineageDisplayName, lineageOf } from '../content/lineages.js';
import { FAMILY_SKILLS } from '../content/skills.js';
import {
  DONOR_PARTS,
  PART_SCALE,
  playerLookKey,
  playerModelKey,
  resolvePlayerParts,
} from './player-look.js';
import { AutoQualityController, QUALITY_PRESETS } from './quality.js';
import {
  OUTLINE_STYLES,
  outlineKindFor,
  silhouetteScale,
  smoothOutlineNormals,
} from './outline-style.js';
import { castVisualKey } from '../net/cast-timeline.js';
import { isPerfectDodgeWindowActive } from './dodge-window.js';

const ASSET = (path) => new URL(`../../${path}`, import.meta.url).href;
const LINEAGE_COLORS = Object.freeze({
  skeleton_knight: 0xc8463c,
  skeleton_archer: 0x4fae6a,
  skeleton_mage: 0x8a5ad6,
});
const LINEAGE_EYE_GEOMETRY = new THREE.SphereGeometry(0.04, 8, 6);
const LINEAGE_RING_GEOMETRY = new THREE.RingGeometry(0.5, 0.68, 40);
const LINEAGE_EYE_MATERIALS = Object.freeze(Object.fromEntries(
  Object.entries(LINEAGE_COLORS).map(([id, color]) => [id, new THREE.MeshBasicMaterial({ color })]),
));
const LINEAGE_RING_MATERIALS = Object.freeze(Object.fromEntries(
  Object.entries(LINEAGE_COLORS).map(([id, color]) => [id, new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.68,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  })]),
));
const M0_MODELS = {
  knight: 'assets/chars/Knight.glb',
  Barbarian: 'assets/chars/Barbarian.glb',
  Rogue_Hooded: 'assets/chars/Rogue_Hooded.glb',
  Mage: 'assets/chars/Mage.glb',
  Skeleton_Minion: 'assets/chars/Skeleton_Minion.glb',
  Skeleton_Warrior: 'assets/chars/Skeleton_Warrior.glb',
  Skeleton_Mage: 'assets/chars/Skeleton_Mage.glb',
  Skeleton_Rogue: 'assets/chars/Skeleton_Rogue.glb',
};
const PLAYER_PARTS = new Set([
  '1H_Sword_Offhand',
  'Knife',
  'Knife_Offhand',
  'Throwable',
  'Spellbook',
  'Spellbook_Offhand',
  'Badge_Shield',
  'Rectangle_Shield',
  'Round_Shield',
  'Spike_Shield',
  '1H_Sword',
  '2H_Sword',
  '1H_Crossbow',
  '2H_Crossbow',
  '1H_Wand',
  '2H_Staff',
  'Knight_Helmet',
  'Knight_Cape',
  'Barbarian_Hat',
  'Barbarian_Cape',
  'Rogue_Cape',
  'Mage_Hat',
  'Mage_Cape',
  'Skeleton_Warrior_Helmet',
  'Skeleton_Rogue_Hood',
  'Skeleton_Rogue_Cape',
]);
const FOREST_TARGET_BOUNDS = {
  'assets/env/forest/tree_pineTallA.glb': [2.5, 5, 2.5],
  'assets/env/forest/tree_pineTallB.glb': [2.8, 5.5, 2.8],
  'assets/env/forest/tree_default_fall.glb': [2.8, 3.8, 2.6],
  'assets/env/forest/tree_oak_fall.glb': [3, 3.6, 3],
  'assets/env/forest/rock_largeA.glb': [1.4, 0.9, 1.8],
  'assets/env/forest/rock_largeD.glb': [1.8, 1.4, 1.8],
  'assets/env/forest/rock_smallB.glb': [1, 0.9, 1],
  'assets/env/forest/stump_old.glb': [0.9, 0.8, 0.9],
  'assets/env/forest/stump_round.glb': [0.9, 0.75, 0.9],
  'assets/env/forest/log.glb': [0.8, 0.75, 3],
  'assets/env/forest/log_large.glb': [1.3, 0.85, 2.4],
  'assets/env/forest/mushroom_redGroup.glb': [1, 0.8, 1],
  'assets/env/forest/mushroom_tanGroup.glb': [1, 0.8, 1],
  'assets/env/forest/plant_bushLarge.glb': [1.2, 0.9, 1.2],
  'assets/env/forest/campfire_logs.glb': [1.2, 0.55, 1.2],
  'assets/env/forest/fence_planks.glb': [2.8, 1, 0.5],
  'assets/env/forest/fence_gate.glb': [2.8, 1, 0.8],
};

function createForestGroundTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const smooth = (value) => value * value * (3 - 2 * value);
  const hash = (x, y, period) => {
    const px = (x % period + period) % period;
    const py = (y % period + period) % period;
    const value = Math.sin((px + 17) * 127.1 + (py + 31) * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const noise = (x, y, cell) => {
    const period = size / cell;
    const gridX = x / cell;
    const gridY = y / cell;
    const x0 = Math.floor(gridX);
    const y0 = Math.floor(gridY);
    const tx = smooth(gridX - x0);
    const ty = smooth(gridY - y0);
    const top = hash(x0, y0, period) * (1 - tx) + hash(x0 + 1, y0, period) * tx;
    const bottom = hash(x0, y0 + 1, period) * (1 - tx) + hash(x0 + 1, y0 + 1, period) * tx;
    return top * (1 - ty) + bottom * ty;
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const grain = noise(x, y, 2);
      const patch = noise(x, y, 32) * 0.7 + noise(x, y, 8) * 0.3;
      const base = patch > 0.58 ? [82, 91, 59] : [125, 105, 73];
      const variation = (grain - 0.5) * 36;
      data[index] = Math.max(0, Math.min(255, base[0] + variation));
      data[index + 1] = Math.max(0, Math.min(255, base[1] + variation));
      data[index + 2] = Math.max(0, Math.min(255, base[2] + variation));
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function isolatePlayerPartMaterials(root, materials) {
  root.traverse((node) => {
    if (!node.isMesh || !PLAYER_PARTS.has(node.name)) return;
    const clone = (material) => {
      const isolated = material.clone();
      materials.push(isolated);
      return isolated;
    };
    node.material = Array.isArray(node.material) ? node.material.map(clone) : clone(node.material);
  });
}

function applyPlayerLook(root, look = {}) {
  const parts = resolvePlayerParts(look);
  const partTints = new Map();
  const visibleParts = new Map([
    [parts.weapon, parts.tints.weapon],
    [parts.offhand, parts.tints.offhand],
    [parts.head, parts.tints.head],
    [parts.cape, parts.tints.cape],
  ].filter(([name]) => name));
  root.traverse((node) => {
    if (!PLAYER_PARTS.has(node.name)) return;
    const baseScale = node.userData.playerPartBaseScale ??= node.scale.toArray();
    const scaleFactor = PART_SCALE[node.name] ?? 1;
    node.scale.set(
      baseScale[0] * scaleFactor,
      baseScale[1] * scaleFactor,
      baseScale[2] * scaleFactor,
    );
    node.visible = visibleParts.has(node.name);
    const tint = visibleParts.get(node.name);
    if (!node.isMesh || !tint) return;
    for (const material of [node.material].flat()) partTints.set(material, tint);
  });
  return partTints;
}

function createGroundContinuationTexture(theme) {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const palettes = {
    forest: [[45, 50, 39], [56, 50, 38]],
    castle: [[31, 36, 54], [39, 45, 65]],
    sanctuary: [[45, 29, 24], [54, 36, 27]],
  };
  const palette = palettes[theme] ?? [[50, 35, 28], [60, 44, 36]];
  const seamColor = theme === 'castle' ? [23, 28, 43] : [26, 19, 16];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const seam = x % 64 < 2 || y % 64 < 2;
      const noise = Math.sin(x * 12.9898 + y * 78.233) * 7;
      const base = palette[((x >> 6) + (y >> 6)) % 2];
      for (let channel = 0; channel < 3; channel += 1) {
        data[index + channel] = seam ? seamColor[channel] : Math.max(0, Math.min(255, base[channel] + noise));
      }
      data[index + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.needsUpdate = true;
  return texture;
}

function createOccluderState(placement, bounds, normalizedScale) {
  const scaleX = (placement.scaleX ?? placement.scale ?? 1) * (normalizedScale?.x ?? 1);
  const scaleY = (placement.scaleY ?? placement.scale ?? 1) * (normalizedScale?.y ?? 1);
  const scaleZ = (placement.scaleZ ?? placement.scale ?? 1) * (normalizedScale?.z ?? 1);
  const width = (bounds?.x ?? 1) * scaleX;
  const height = (bounds?.y ?? 1) * scaleY;
  const depth = (bounds?.z ?? 1) * scaleZ;
  return {
    x: placement.x,
    y: (placement.y ?? 0) + height / 2,
    z: placement.z,
    radius: Math.hypot(width, height, depth) / 2,
    opacity: 1,
    from: 1,
    to: 1,
    startedAt: 0,
  };
}

function updateOccluderOpacity(state, target, now) {
  if (state.to !== target) {
    state.from = state.opacity;
    state.to = target;
    state.startedAt = now;
  }
  const amount = Math.min(1, (now - state.startedAt) / 150);
  const opacity = state.from + (state.to - state.from) * amount;
  const changed = Math.abs(opacity - state.opacity) > 0.005;
  state.opacity = opacity;
  return changed;
}

function disposeSceneResources(scene) {
  const geometries = new Set();
  const materials = new Set();
  scene.traverse((node) => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) for (const material of [node.material].flat()) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) value.dispose();
    material.dispose();
  }
  scene.clear();
}

function cloneMaterials(root) {
  const clones = new Map();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const clone = (material) => {
      if (!clones.has(material)) clones.set(material, material.clone());
      return clones.get(material);
    };
    node.material = Array.isArray(node.material)
      ? node.material.map(clone)
      : clone(node.material);
  });
  return [...clones.values()];
}

function shortestAngleDelta(from, to) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function createTelegraphHatch(type, { radius = 0, innerRadius = 0, halfAngle = null, length = 0, width = 0 } = {}) {
  const positions = [];
  const diagonal = Math.SQRT1_2;
  const addLine = (x1, z1, x2, z2) => positions.push(x1, z1, 0, x2, z2, 0);
  if (type === 'linear') {
    for (let offset = -length - width; offset <= length + width; offset += 0.36) {
      const centerX = -offset / 2;
      const centerZ = offset / 2;
      const minT = Math.max((-length / 2 - centerX) / diagonal, (-width / 2 - centerZ) / diagonal);
      const maxT = Math.min((length / 2 - centerX) / diagonal, (width / 2 - centerZ) / diagonal);
      if (minT <= maxT) addLine(centerX + minT * diagonal, centerZ + minT * diagonal, centerX + maxT * diagonal, centerZ + maxT * diagonal);
    }
  } else {
    for (let offset = -radius * Math.SQRT2; offset <= radius * Math.SQRT2; offset += 0.34) {
      const distance = Math.abs(offset) / Math.SQRT2;
      if (distance > radius) continue;
      const halfLength = Math.sqrt(radius * radius - distance * distance);
      const centerX = -offset / 2;
      const centerZ = offset / 2;
      let previous = null;
      const steps = Math.max(2, Math.ceil(halfLength * 2 / 0.08));
      for (let step = 0; step <= steps; step += 1) {
        const t = -halfLength + 2 * halfLength * step / steps;
        const x = centerX + t * diagonal;
        const z = centerZ + t * diagonal;
        const radialDistance = Math.hypot(x, z);
        const inSector = halfAngle === null || Math.abs(Math.atan2(-z, x)) <= halfAngle;
        if (radialDistance >= innerRadius && radialDistance <= radius && inSector) {
          if (previous) addLine(previous.x, previous.z, x, z);
          previous = { x, z };
        } else previous = null;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

export class ArenaRenderer {
  constructor(canvas, onReady = () => {}, arena = ARENA, showCollisionOverlay = false, initialWorld = null) {
    this.canvas = canvas;
    this.arena = arena;
    this.initialWorld = initialWorld;
    this.isHub = arena.id === 'inn-hub';
    this.isForest = arena.theme === 'forest';
    this.isCastle = arena.theme === 'castle';
    this.isSanctuary = arena.theme === 'sanctuary';
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(
      this.isForest ? 0x484f43 : this.isCastle ? 0x202238 : this.isSanctuary ? 0x2b1918 : 0x17141a,
    );
    this.scene.fog = new THREE.Fog(
      this.isForest ? 0x777663 : this.isCastle ? 0x384164 : this.isSanctuary ? 0x55362a : 0x17141a,
      this.isForest || this.isCastle ? 12 : this.isSanctuary ? 18 : 42,
      this.isForest ? 36 : this.isCastle ? 44 : this.isSanctuary ? 32 : 78,
    );
    this.baseFogRange = { near: this.scene.fog.near, far: this.scene.fog.far };
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 80);
    this.cameraHeight = this.isForest || this.isCastle ? 10.85 : 15.5;
    this.cameraOffsetZ = 10.85;
    this.camera.position.set(0, this.cameraHeight, this.cameraOffsetZ);
    this.camera.lookAt(0, 0, 0);
    this.cameraFollowOffsetZ = this.isHub ? 3.5 : 8;
    this.frustumHeight = this.isHub ? 15 : 19;
    this.mobileCameraOverlayKey = '';
    this.mobileCameraTargetShift = 0;
    this.mobileCameraTargetScreenY = null;
    this.mobileVisibleAreaResult = null;
    this.mobileOverlays = [
      { id: 'controls', element: canvas.ownerDocument.querySelector('#controls'), top: 0, height: 0, active: false },
      { id: 'hub-buttons', element: canvas.ownerDocument.querySelector('#hub-ui:not([hidden]) .hub-hotspots'), top: 0, height: 0, active: false },
      { id: 'hub-hud', element: this.isHub ? canvas.ownerDocument.querySelector('#hud') : null, top: 0, height: 0, active: false },
      { id: 'tutorial-card', element: canvas.ownerDocument.querySelector('#tutorial-card'), top: 0, height: 0, active: false },
    ];
    this.projectionCamera = this.camera.clone();
    this.mobileProjectedPoint = new THREE.Vector3();
    this.mobileCameraUp = new THREE.Vector3(0, 1, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.qualityController = new AutoQualityController('automatic');
    this.qualityMode = 'automatic';
    this.effectiveQuality = 'medium';
    this.particleMultiplier = 1;
    this.telegraphEmphasis = true;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.createOutlineMaterials();
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene.add(new THREE.HemisphereLight(
      this.isCastle ? 0x97a6e5 : this.isSanctuary ? 0xffd7a1 : 0xc5b6c8,
      this.isCastle ? 0x20263f : this.isSanctuary ? 0x49261c : 0x34242b,
      1.05,
    ));
    const key = new THREE.DirectionalLight(
      this.isCastle ? 0x99aaff : this.isSanctuary ? 0xffbd72 : 0xffd6ad,
      1.35,
    );
    key.position.set(-4, 14, 5);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(this.isCastle ? 0x6573bd : this.isSanctuary ? 0xd78e56 : 0x786775, 0.3));
    this.entities = new Map();
    this.telegraphs = new Map();
    this.models = new Map();
    this.gltfs = new Map();
    this.clips = { humanoid: [], skeleton: [] };
    this.fadeGroups = [];
    this.fadeObjects = [];
    this.localPlayerId = initialWorld?.entities?.find((entity) => entity.kind === 'player')?.playerId ?? null;
    this.outlineTargetId = null;
    this.occlusionPlayerPoint = new THREE.Vector3();
    this.occlusionPropPoint = new THREE.Vector3();
    this.sideWalls = [];
    this.doorVisuals = [];
    this.seenEventIds = new Set();
    this.seenCastKeys = new Set();
    this.slashes = new Map();
    this.damageNumbers = [];
    this.deathPuffs = [];
    this.transientEffects = [];
    this.ashPoints = null;
    this.ashPositions = null;
    if (this.isForest) this.createAshParticles();
    this.seenShotKeys = new Set();
    this.seenImpactCasts = new Set();
    this.torchLights = [];
    this.hubNpcs = [];
    this.hitstopUntil = 0;
    this.hitstopStartedAt = 0;
    this.shakeUntil = 0;
    this.predictedFlashUntil = new Map();
    this.enemyClipPreview = null;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.vfxLayer = document.createElement('div');
    this.vfxLayer.className = 'combat-vfx-layer';
    canvas.parentElement?.appendChild(this.vfxLayer);
    this.npcLayer = document.createElement('div');
    this.npcLayer.className = 'npc-hotspots-layer';
    canvas.parentElement?.appendChild(this.npcLayer);
    this.partyLayer = document.createElement('div');
    this.partyLayer.className = 'party-name-layer';
    canvas.parentElement?.appendChild(this.partyLayer);
    this.partyMarkers = new Map();
    this.objectiveTargetMarker = document.createElement('div');
    this.objectiveTargetMarker.className = 'objective-target-marker';
    this.objectiveTargetMarker.classList.add('is-hunt');
    this.objectiveTargetMarker.textContent = '☠ 현상수배';
    this.objectiveTargetMarker.hidden = true;
    this.partyLayer.appendChild(this.objectiveTargetMarker);
    this.objectiveWardMarker = document.createElement('div');
    this.objectiveWardMarker.className = 'objective-ward-marker';
    this.objectiveWardMarker.innerHTML = '<span>결계석</span><i><b></b></i>';
    this.objectiveWardMarker.hidden = true;
    this.partyLayer.appendChild(this.objectiveWardMarker);
    this.objectivePillar = null;
    this.objectiveWardRing = null;
    this.objectiveChannelFill = null;
    this.objectiveChannelRing = null;
    this.previousEntities = new Map();
    this.activeEntityIds = new Set();
    this.activeTelegraphs = new Set();
    this.activePartyMarkers = new Set();
    this.projectedPoint = new THREE.Vector3();
    this.lastRender = performance.now();
    this.averageMs = 16;
    this.resolutionScale = 1;
    this.loadedBytes = 0;
    this.showCollisionOverlay = showCollisionOverlay;
    this.debugOverlayFlags = { hitboxes: false, attacks: false, dodgeWindow: false };
    this.debugOverlayRoot = new THREE.Group();
    this.debugOverlayRoot.name = 'debug-overlays';
    this.scene.add(this.debugOverlayRoot);
    this.debugEntityRings = new Map();
    this.debugAttackLines = new Map();
    this.debugDodgeRing = null;
    this.buildRoom();
    this.collisionOverlay = null;
    if (showCollisionOverlay) this.createCollisionOverlay();
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(canvas);
    this.ready = this.loadAssets().then(onReady).catch((error) => {
      console.error('Devinarok assets failed to load', error);
      throw error;
    });
  }

  setQualityMode(mode) {
    this.qualityMode = mode === 'automatic' || QUALITY_PRESETS[mode] ? mode : 'automatic';
    this.qualityController.setMode(this.qualityMode);
    this.applyQualityPreset(this.qualityController.quality);
  }

  applyQualityPreset(name) {
    const preset = QUALITY_PRESETS[name] ?? QUALITY_PRESETS.medium;
    const previousParticles = this.particleMultiplier;
    this.effectiveQuality = name;
    this.particleMultiplier = preset.particles;
    this.outlinesEnabled = preset.outlines;
    if (this.renderer) {
      this.renderer.shadowMap.enabled = preset.shadows;
      this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, preset.pixelRatio) * this.resolutionScale);
      this.updateOutlineUniforms();
    }
    if (this.scene.fog) {
      this.scene.fog.near = preset.fog ? this.baseFogRange.near : this.baseFogRange.near * 1.2;
      this.scene.fog.far = preset.fog ? this.baseFogRange.far : this.baseFogRange.far * 0.8;
    }
    if (previousParticles !== this.particleMultiplier && this.isForest && this.ashPoints) {
      this.scene.remove(this.ashPoints);
      this.ashPoints.geometry.dispose();
      this.ashPoints.material.dispose();
      this.ashPoints = null;
      this.createAshParticles();
    }
    if (this.particleMultiplier < previousParticles) {
      const cap = Math.floor(48 * this.particleMultiplier);
      while (this.transientEffects.length > cap) {
        const [effect] = this.transientEffects.splice(0, 1);
        this.scene.remove(effect.mesh);
        effect.geometry.dispose();
        effect.material.dispose();
      }
    }
    this.resizeCanvas();
  }

  createOutlineMaterials() {
    this.outlineResolutionUniform = { value: new THREE.Vector2(1, 1) };
    this.outlinePixelUniforms = new Map();
    this.outlineMaterials = new Map();
    this.outlineNormalGeometryCache = new WeakMap();
    this.outlinesEnabled = Boolean(QUALITY_PRESETS[this.effectiveQuality]?.outlines);

    for (const [kind, style] of Object.entries(OUTLINE_STYLES)) {
      const outlinePxUniform = { value: style.widthPx * this.renderer.getPixelRatio() };
      const material = new THREE.MeshBasicMaterial({
        color: style.color,
        side: THREE.BackSide,
        toneMapped: false,
        fog: false,
      });
      material.onBeforeCompile = (shader) => {
        shader.uniforms.uOutlineResolution = this.outlineResolutionUniform;
        shader.uniforms.uOutlinePx = outlinePxUniform;
        shader.vertexShader = shader.vertexShader.replace(
          '#include <common>',
          '#include <common>\nattribute vec3 outlineNormal;\nuniform vec2 uOutlineResolution;\nuniform float uOutlinePx;',
        );
        shader.vertexShader = shader.vertexShader.replace(
          '#include <project_vertex>',
          `#include <project_vertex>
#ifdef USE_SKINNING
  vec3 outlineN = (skinMatrix * vec4(outlineNormal, 0.0)).xyz;
#else
  vec3 outlineN = outlineNormal;
#endif
vec2 outlineDir = (projectionMatrix * modelViewMatrix * vec4(outlineN, 0.0)).xy;
float outlineLen = length(outlineDir);
if (outlineLen > 1e-6) gl_Position.xy += (outlineDir / outlineLen) * uOutlinePx * 2.0 / uOutlineResolution * gl_Position.w;`,
        );
      };
      material.customProgramCacheKey = () => 'devinarok-outline';
      this.outlineMaterials.set(kind, material);
      this.outlinePixelUniforms.set(kind, outlinePxUniform);
    }
    this.updateOutlineUniforms();
  }

  updateOutlineUniforms() {
    if (!this.renderer || !this.outlineResolutionUniform) return;
    this.renderer.getDrawingBufferSize(this.outlineResolutionUniform.value);
    const pixelRatio = this.renderer.getPixelRatio();
    for (const [kind, style] of Object.entries(OUTLINE_STYLES)) {
      const uniform = this.outlinePixelUniforms.get(kind);
      if (uniform) uniform.value = style.widthPx * pixelRatio;
    }
  }

  outlineGeometry(geometry) {
    if (!geometry) return null;
    if (this.outlineNormalGeometryCache.has(geometry)) {
      return this.outlineNormalGeometryCache.get(geometry) ? geometry : null;
    }
    const positions = geometry.getAttribute('position');
    const normals = geometry.getAttribute('normal');
    if (!positions || !normals || positions.count !== normals.count) {
      this.outlineNormalGeometryCache.set(geometry, false);
      return null;
    }
    const positionValues = new Float32Array(positions.count * 3);
    const normalValues = new Float32Array(normals.count * 3);
    for (let index = 0; index < positions.count; index += 1) {
      const offset = index * 3;
      positionValues[offset] = positions.getX(index);
      positionValues[offset + 1] = positions.getY(index);
      positionValues[offset + 2] = positions.getZ(index);
      normalValues[offset] = normals.getX(index);
      normalValues[offset + 1] = normals.getY(index);
      normalValues[offset + 2] = normals.getZ(index);
    }
    geometry.setAttribute('outlineNormal', new THREE.Float32BufferAttribute(
      smoothOutlineNormals(positionValues, normalValues),
      3,
    ));
    this.outlineNormalGeometryCache.set(geometry, true);
    return geometry;
  }

  updateEntityOutlines(entity, visual, world) {
    const kind = outlineKindFor(entity, world, this.outlineTargetId);
    if (kind !== visual.outlineKind) {
      const material = this.outlineMaterials.get(kind);
      if (material) {
        for (const { outline } of visual.outlines) outline.material = material;
      }
      visual.outlineKind = kind;
    }
    for (const { source, outline } of visual.outlines) {
      outline.position.copy(source.position);
      outline.quaternion.copy(source.quaternion);
      outline.scale.copy(source.scale);
      outline.visible = this.outlinesEnabled && kind !== null && source.visible && !entity.dead;
    }
  }

  setReducedMotion(value) {
    this.reducedMotion = Boolean(value);
  }

  setTelegraphEmphasis(value) {
    this.telegraphEmphasis = Boolean(value);
    for (const decal of this.telegraphs.values()) {
      for (const part of decal.parts) {
        part.hatch.visible = this.telegraphEmphasis;
        part.outline.material.color.setHex(this.telegraphEmphasis ? 0xffe09a : 0xff7770);
      }
    }
  }

  buildRoom() {
    if (this.isSanctuary) {
      this.buildSanctuaryRoom();
      return;
    }
    const lightProps = this.arena.props.filter((prop) => (
      prop.model === 'assets/env/torch_lit.glb'
      || prop.model === 'assets/env/candle_lit.glb'
      || prop.model === 'assets/env/torch_mounted.glb'
    ));
    for (const prop of lightProps) {
      const light = new THREE.PointLight(
        this.isCastle ? 0x6783ff : 0xffae63,
        prop.model.includes('candle') ? 7 : 13,
        prop.model.includes('candle') ? 4.5 : 8,
        2,
      );
      light.position.set(prop.x, prop.wallLight ? 2.7 : 2.1, prop.z);
      this.scene.add(light);
      this.torchLights.push({ light, phase: this.torchLights.length * 1.71, base: light.intensity });
    }
  }

  buildSanctuaryRoom() {
    const { width, depth } = this.arena;
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const context = floorCanvas.getContext('2d');
    context.fillStyle = '#6c4536';
    context.fillRect(0, 0, 512, 512);
    for (let row = 0; row < 12; row += 1) {
      const y = row * 44;
      context.fillStyle = row % 2 ? '#7d5040' : '#885a46';
      context.fillRect(0, y, 512, 42);
      context.fillStyle = '#482d26';
      context.fillRect(0, y + 41, 512, 3);
      for (let seam = row % 2 ? 0 : 96; seam < 512; seam += 192) {
        context.fillRect(seam, y, 2, 42);
        context.fillStyle = '#a06b4e';
        context.fillRect(seam + 4, y + 8, 42, 1);
        context.fillStyle = '#482d26';
      }
    }
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.colorSpace = THREE.SRGBColorSpace;
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(3.5, 2.5);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshStandardMaterial({ map: floorTexture, color: 0xe8c19a, roughness: 0.88 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.04;
    this.scene.add(floor);

    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x492d28, roughness: 0.92 });
    const trimMaterial = new THREE.MeshStandardMaterial({ color: 0xb88a4c, metalness: 0.28, roughness: 0.62 });
    const addBox = (size, position, material, target = this.scene) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      target.add(mesh);
      return mesh;
    };
    addBox([width, 4.6, 0.28], [0, 2.25, -depth / 2], wallMaterial);
    addBox([0.28, 4.6, depth], [-width / 2, 2.25, 0], wallMaterial);
    addBox([0.28, 4.6, depth], [width / 2, 2.25, 0], wallMaterial);
    addBox([width, 0.22, 0.38], [0, 4.45, -depth / 2 + 0.16], trimMaterial);

    const backPanel = new THREE.MeshStandardMaterial({ color: 0x8f312d, roughness: 0.76 });
    addBox([2.5, 3.2, 0.18], [0, 2.1, -depth / 2 + 0.2], backPanel);
    addBox([2.8, 0.14, 0.28], [0, 3.78, -depth / 2 + 0.2], trimMaterial);
    addBox([0.14, 3.35, 0.28], [-1.35, 2.05, -depth / 2 + 0.2], trimMaterial);
    addBox([0.14, 3.35, 0.28], [1.35, 2.05, -depth / 2 + 0.2], trimMaterial);

    const columnMaterial = new THREE.MeshStandardMaterial({ color: 0xb39a73, roughness: 0.82 });
    const columnCapMaterial = new THREE.MeshStandardMaterial({ color: 0xd0ab64, metalness: 0.18, roughness: 0.66 });
    for (const x of [-5.7, 5.7]) {
      for (const z of [-3.2, 0, 3.2]) {
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.52, 0.26, 8), columnCapMaterial);
        base.position.set(x, 0.13, z);
        this.scene.add(base);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 3.0, 8), columnMaterial);
        column.position.set(x, 1.75, z);
        this.scene.add(column);
        const capital = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.42, 0.28, 8), columnCapMaterial);
        capital.position.set(x, 3.39, z);
        this.scene.add(capital);
      }
    }

    const lanternMaterial = new THREE.MeshStandardMaterial({ color: 0xa93630, emissive: 0x48130c, roughness: 0.48 });
    const lanternLightColor = 0xffb34d;
    for (const x of [-3.2, 3.2]) {
      addBox([0.35, 0.52, 0.35], [x, 3.45, -3.6], lanternMaterial);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.22, 4), trimMaterial);
      cap.position.set(x, 3.82, -3.6);
      this.scene.add(cap);
      const light = new THREE.PointLight(lanternLightColor, 6.5, 8, 2);
      light.position.set(x, 3.3, -3.6);
      this.scene.add(light);
      this.torchLights.push({ light, phase: x * 0.7, base: light.intensity });
    }

    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x4a251b, roughness: 0.84 });
    addBox([1.45, 2.7, 0.18], [0, 1.35, depth / 2 - 0.12], doorMaterial);
    addBox([1.62, 0.13, 0.26], [0, 2.78, depth / 2 - 0.1], trimMaterial);
    const doorLight = new THREE.PointLight(0xffb34d, 3.8, 5, 2);
    doorLight.position.set(0, 2.2, depth / 2 - 1.1);
    this.scene.add(doorLight);
    this.torchLights.push({ light: doorLight, phase: 1.4, base: doorLight.intensity });
  }

  createAshParticles() {
    const count = Math.floor(180 * this.particleMultiplier);
    this.ashPositions = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      const phase = index * 2.399963;
      this.ashPositions[index * 3] = Math.sin(phase) * 11;
      this.ashPositions[index * 3 + 1] = (index % 12) * 0.48 + 0.5;
      this.ashPositions[index * 3 + 2] = Math.cos(phase) * 11;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.ashPositions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xe4d9bc,
      size: 2.5,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: false,
    });
    this.ashPoints = new THREE.Points(geometry, material);
    this.ashPoints.renderOrder = 2;
    this.scene.add(this.ashPoints);
    this.transientEffects.push({
      mesh: this.ashPoints,
      geometry,
      material,
      startTime: null,
      durationMs: null,
      startTick: null,
      endTick: null,
      update: null,
    });
  }

  updateAshParticles(dt, now) {
    if (!this.ashPoints) return;
    for (let index = 0; index < this.ashPositions.length / 3; index += 1) {
      const offset = index * 3;
      this.ashPositions[offset + 1] -= dt * (0.18 + index % 5 * 0.025);
      this.ashPositions[offset] += Math.sin(now * 0.00012 + index) * dt * 0.05;
      if (this.ashPositions[offset + 1] < 0.1) this.ashPositions[offset + 1] = 5.5;
    }
    this.ashPoints.geometry.attributes.position.needsUpdate = true;
  }

  createCollisionOverlay() {
    const group = new THREE.Group();
    const material = new THREE.LineBasicMaterial({
      color: 0xff6370,
      transparent: true,
      opacity: 0.95,
      depthTest: true,
      fog: false,
    });
    for (const obstacle of this.arena.obstacles ?? []) {
      const points = obstacle.type === 'circle'
        ? Array.from({ length: 48 }, (_, index) => {
          const angle = index / 48 * Math.PI * 2;
          return new THREE.Vector3(
            obstacle.x + Math.cos(angle) * obstacle.radius,
            0,
            obstacle.z + Math.sin(angle) * obstacle.radius,
          );
        })
        : [
          new THREE.Vector3(obstacle.x - obstacle.width / 2, 0, obstacle.z - obstacle.depth / 2),
          new THREE.Vector3(obstacle.x + obstacle.width / 2, 0, obstacle.z - obstacle.depth / 2),
          new THREE.Vector3(obstacle.x + obstacle.width / 2, 0, obstacle.z + obstacle.depth / 2),
          new THREE.Vector3(obstacle.x - obstacle.width / 2, 0, obstacle.z + obstacle.depth / 2),
        ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const outline = new THREE.LineLoop(geometry, material);
      outline.position.y = 0.045;
      group.add(outline);
    }
    this.collisionOverlay = group;
    this.scene.add(group);
  }

  setDebugOverlays(flags = {}) {
    this.debugOverlayFlags = {
      hitboxes: Boolean(flags.hitboxes),
      attacks: Boolean(flags.attacks),
      dodgeWindow: Boolean(flags.dodgeWindow),
    };
    if (this.debugOverlayFlags.hitboxes && !this.collisionOverlay) this.createCollisionOverlay();
    if (this.collisionOverlay) {
      this.collisionOverlay.visible = this.showCollisionOverlay || this.debugOverlayFlags.hitboxes;
    }
  }

  debugAttackPoints(shape) {
    const y = 0.09;
    if (shape.type === 'sector') {
      const points = [new THREE.Vector3(shape.originX, y, shape.originZ)];
      const steps = 24;
      for (let index = 0; index <= steps; index += 1) {
        const angle = shape.angle - shape.halfAngle + shape.halfAngle * 2 * index / steps;
        points.push(new THREE.Vector3(
          shape.originX + Math.cos(angle) * shape.range,
          y,
          shape.originZ + Math.sin(angle) * shape.range,
        ));
      }
      points.push(points[0].clone());
      return points;
    }
    if (shape.type === 'circle' || shape.type === 'annulus') {
      const radius = shape.radius ?? shape.outerRadius;
      return Array.from({ length: 49 }, (_, index) => {
        const angle = index / 48 * Math.PI * 2;
        return new THREE.Vector3(shape.originX + Math.cos(angle) * radius, y, shape.originZ + Math.sin(angle) * radius);
      });
    }
    if (shape.type === 'circles') {
      return shape.circles.flatMap((circle) => Array.from({ length: 49 }, (_, index) => {
        const angle = index / 48 * Math.PI * 2;
        return new THREE.Vector3(circle.x + Math.cos(angle) * circle.radius, y, circle.z + Math.sin(angle) * circle.radius);
      }).flatMap((point, index, points) => index === 0 ? [] : [points[index - 1], point]));
    }
    if (shape.type === 'line' || shape.type === 'rect') {
      const dx = Math.cos(shape.angle);
      const dz = Math.sin(shape.angle);
      const sx = -dz * shape.width / 2;
      const sz = dx * shape.width / 2;
      const x1 = shape.originX - sx;
      const z1 = shape.originZ - sz;
      const x2 = shape.originX + dx * shape.length - sx;
      const z2 = shape.originZ + dz * shape.length - sz;
      const x3 = shape.originX + dx * shape.length + sx;
      const z3 = shape.originZ + dz * shape.length + sz;
      const x4 = shape.originX + sx;
      const z4 = shape.originZ + sz;
      return [
        new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2),
        new THREE.Vector3(x3, y, z3), new THREE.Vector3(x4, y, z4),
        new THREE.Vector3(x1, y, z1),
      ];
    }
    return [];
  }

  updateDebugOverlays(world, now) {
    const { hitboxes, attacks, dodgeWindow } = this.debugOverlayFlags;
    this.debugOverlayRoot.visible = hitboxes || attacks || dodgeWindow;
    if (!this.debugOverlayRoot.visible) return;
    const activeRings = new Set();
    if (hitboxes) {
      for (const entity of world.entities) {
        if (!['player', 'enemy'].includes(entity.kind) || entity.dead) continue;
        activeRings.add(entity.id);
        let ring = this.debugEntityRings.get(entity.id);
        if (!ring) {
          const points = Array.from({ length: 49 }, (_, index) => {
            const angle = index / 48 * Math.PI * 2;
            return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
          });
          ring = new THREE.LineLoop(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.LineBasicMaterial({ color: entity.kind === 'player' ? 0x71eaff : 0xff6774, transparent: true, opacity: 0.9, depthTest: true }),
          );
          this.debugEntityRings.set(entity.id, ring);
          this.debugOverlayRoot.add(ring);
        }
        ring.visible = true;
        ring.position.set(entity.x, 0.06, entity.z);
        ring.scale.setScalar(entity.radius ?? 0.32);
      }
    }
    for (const [id, ring] of this.debugEntityRings) ring.visible = hitboxes && activeRings.has(id);

    const activeAttacks = new Set();
    if (attacks) {
      for (const enemy of world.entities) {
        if (enemy.kind !== 'enemy' || enemy.dead || !enemy.attackShape) continue;
        const points = this.debugAttackPoints(enemy.attackShape);
        if (points.length < 2) continue;
        activeAttacks.add(enemy.id);
        let line = this.debugAttackLines.get(enemy.id);
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        if (!line) {
          line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffa64d, transparent: true, opacity: 0.95, depthTest: true }));
          this.debugAttackLines.set(enemy.id, line);
          this.debugOverlayRoot.add(line);
        } else {
          line.geometry.dispose();
          line.geometry = geometry;
        }
        line.visible = true;
      }
    }
    for (const [id, line] of this.debugAttackLines) line.visible = attacks && activeAttacks.has(id);

    const player = world.entities.find((entity) => entity.kind === 'player' && entity.playerId === this.localPlayerId);
    if (dodgeWindow && player?.dodgeTicks > 0 && !player.perfectPaid && isPerfectDodgeWindowActive(world, player)) {
      if (!this.debugDodgeRing) {
        const points = Array.from({ length: 49 }, (_, index) => {
          const angle = index / 48 * Math.PI * 2;
          return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
        });
        this.debugDodgeRing = new THREE.LineLoop(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({ color: 0xffd45c, transparent: true, depthTest: true }),
        );
        this.debugOverlayRoot.add(this.debugDodgeRing);
      }
      this.debugDodgeRing.visible = true;
      this.debugDodgeRing.position.set(player.x, 0.11, player.z);
      this.debugDodgeRing.scale.setScalar((player.radius ?? 0.32) * (1.7 + Math.sin(now * 0.025) * 0.18));
      this.debugDodgeRing.material.opacity = 0.5 + (Math.sin(now * 0.025) + 1) * 0.2;
    } else if (this.debugDodgeRing) this.debugDodgeRing.visible = false;
  }

  async loadAssets() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    await MeshoptDecoder.ready;
    let assetHashes = {};
    const assetUrl = (path) => {
      const url = new URL(`../../${path}`, import.meta.url);
      const hash = assetHashes[path];
      if (hash) url.searchParams.set('v', hash.slice(0, 12));
      return url.href;
    };
    const load = async (path) => {
      if (!this.gltfs.has(path)) this.gltfs.set(path, loader.loadAsync(assetUrl(path)));
      return this.gltfs.get(path);
    };
    const manifest = await fetch(ASSET('assets/manifest.json'), { cache: 'no-store' }).then((response) => response.json());
    assetHashes = manifest.sha256 ?? {};
    this.loadedBytes = manifest.m1StageLoadedBytes?.[this.arena.id] ?? manifest.m0LoadedBytes;
    const propModels = [...new Set([
      ...this.arena.props.map((prop) => prop.model).filter(Boolean),
      ...(this.arena.npcs ?? []).map((npc) => M0_MODELS[npc.model]),
    ])];
    const characterPaths = [...new Set((this.initialWorld?.entities ?? []).map((entity) => {
      const key = entity.kind === 'player' ? playerModelKey(entity) : entity.model ?? entity.enemyKind;
      const assetKey = key === 'rogue' ? 'Rogue_Hooded' : key === 'mage' ? 'Mage' : key;
      return M0_MODELS[assetKey];
    }).filter(Boolean))];
    const requiredModels = new Set([...propModels, ...characterPaths]);
    if (this.isHub || this.isSanctuary) {
      for (const lineage of Object.values(LINEAGES)) {
        if (lineage.model && M0_MODELS[lineage.model]) requiredModels.add(M0_MODELS[lineage.model]);
      }
      for (const donor of new Set(DONOR_PARTS.map(({ donor }) => donor))) {
        const path = M0_MODELS[donor];
        if (path) requiredModels.add(path);
      }
    }
    if (this.arena.rooms?.some((room) => room.objective)) {
      requiredModels.add('assets/env/pillar.glb');
    }
    if (!this.isHub && !this.isSanctuary) {
      for (const path of Object.values(M0_MODELS)) requiredModels.add(path);
    }
    const modelPaths = [...requiredModels];
    const loaded = await Promise.all(modelPaths.map(async (path) => [path, await load(path)]));
    const loadedByPath = new Map(loaded);
    this.modelBounds = new Map();
    for (const [path, gltf] of loadedByPath) {
      gltf.scene.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(gltf.scene);
      const size = bounds.getSize(new THREE.Vector3());
      this.modelBounds.set(path, { x: size.x, y: size.y, z: size.z });
    }
    this.forestModelScales = new Map();
    for (const [path, target] of Object.entries(FOREST_TARGET_BOUNDS)) {
      const scene = loadedByPath.get(path)?.scene;
      if (!scene) continue;
      scene.updateMatrixWorld(true);
      const measured = new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3());
      if (measured.x && measured.y && measured.z) {
        this.forestModelScales.set(path, new THREE.Vector3(
          target[0] / measured.x,
          target[1] / measured.y,
          target[2] / measured.z,
        ));
      }
    }
    for (const [key, path] of Object.entries(M0_MODELS)) {
      if (loadedByPath.has(path)) this.models.set(key, loadedByPath.get(path).scene);
    }
    if (loadedByPath.has('assets/env/pillar.glb')) {
      this.models.set('objective-pillar', loadedByPath.get('assets/env/pillar.glb').scene);
    }
    const animationLibraries = this.isHub || this.isSanctuary ? ['humanoid'] : ['humanoid', 'skeleton'];
    for (const [key, path] of animationLibraries.map((name) => [name, `assets/anims/${name}.glb`])) {
      const gltf = await load(path);
      this.clips[key] = gltf.animations;
    }
    const instancedModels = new Set([
      'assets/env/floor_tile_large.glb',
      'assets/env/floor_tile_large_rocks.glb',
      'assets/env/floor_tile_small.glb',
      'assets/env/floor_tile_small_broken_A.glb',
      'assets/env/floor_dirt_large.glb',
      'assets/env/floor_dirt_large_rocky.glb',
      'assets/env/floor_wood_large.glb',
      'assets/env/floor_wood_large_dark.glb',
    ]);
    for (const path of instancedModels) {
      const gltf = loadedByPath.get(path);
      if (!gltf) continue;
      gltf.scene.updateMatrixWorld(true);
      let tileMesh;
      gltf.scene.traverse((node) => { if (!tileMesh && node.isMesh) tileMesh = node; });
      if (!tileMesh) continue;
      const tileProps = this.arena.props.filter((prop) => prop.model === path);
      const material = Array.isArray(tileMesh.material)
        ? tileMesh.material.map((source) => source.clone())
        : tileMesh.material.clone();
      const instances = new THREE.InstancedMesh(tileMesh.geometry, material, tileProps.length);
      const translation = new THREE.Matrix4();
      const rotation = new THREE.Matrix4();
      const matrix = new THREE.Matrix4();
      tileProps.forEach((prop, index) => {
        translation.makeTranslation(prop.x, prop.y ?? 0, prop.z);
        rotation.makeRotationY(prop.rotY ?? 0);
        const scale = new THREE.Matrix4().makeScale(prop.scaleX ?? prop.scale ?? 1, prop.scaleY ?? prop.scale ?? 1, prop.scaleZ ?? prop.scale ?? 1);
        matrix.multiplyMatrices(translation, rotation).multiply(scale).multiply(tileMesh.matrixWorld);
        instances.setMatrixAt(index, matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      const materials = Array.isArray(material) ? material : [material];
      for (const item of materials) {
        if (item.color) {
          if (this.isForest) {
            item.color.multiplyScalar(path.includes('wood') ? 0.9 : 0.95);
            item.color.lerp(new THREE.Color(path.includes('wood') ? 0x6d5c40 : 0xb3a078), path.includes('wood') ? 0.5 : 0.78);
          } else if (this.isCastle) {
            item.color.multiplyScalar(path.includes('wood') ? 0.9 : 0.82);
            item.color.lerp(new THREE.Color(path.includes('wood') ? 0x363044 : 0x717da9), 0.38);
          } else {
            item.color.multiplyScalar(path.includes('wood') ? 0.84 : 0.76);
          }
        }
      }
      this.scene.add(instances);
    }
    const arenaBounds = this.arena.bounds ?? {
      minX: -(this.arena.width ?? 16) / 2,
      maxX: (this.arena.width ?? 16) / 2,
      minZ: -(this.arena.depth ?? 24) / 2,
      maxZ: (this.arena.depth ?? 24) / 2,
    };
    let minX = arenaBounds.minX;
    let maxX = arenaBounds.maxX;
    let minZ = arenaBounds.minZ;
    let maxZ = arenaBounds.maxZ;
    for (const prop of this.arena.props) {
      minX = Math.min(minX, prop.x - 2);
      maxX = Math.max(maxX, prop.x + 2);
      minZ = Math.min(minZ, prop.z - 2);
      maxZ = Math.max(maxZ, prop.z + 2);
    }
    minX -= 16;
    maxX += 16;
    minZ -= 16;
    maxZ += 16;
    const continuationTexture = createGroundContinuationTexture(this.arena.theme);
    continuationTexture.repeat.set((maxX - minX) / 4, (maxZ - minZ) / 4);
    const continuation = new THREE.Mesh(
      new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
      new THREE.MeshBasicMaterial({ map: continuationTexture, color: 0xffffff, side: THREE.DoubleSide }),
    );
    continuation.rotation.x = -Math.PI / 2;
    continuation.position.set((minX + maxX) / 2, -0.4, (minZ + maxZ) / 2);
    continuation.renderOrder = -2;
    this.scene.add(continuation);
    if (this.isForest) {
      const floorProps = this.arena.props.filter((prop) => (
        prop.model === 'assets/env/floor_dirt_large.glb'
        || prop.model === 'assets/env/floor_dirt_large_rocky.glb'
      ));
      if (floorProps.length) {
        const minX = Math.min(...floorProps.map((prop) => prop.x)) - 8;
        const maxX = Math.max(...floorProps.map((prop) => prop.x)) + 8;
        const minZ = Math.min(...floorProps.map((prop) => prop.z)) - 14;
        const maxZ = Math.max(...floorProps.map((prop) => prop.z)) + 14;
        const width = maxX - minX;
        const depth = maxZ - minZ;
        const texture = createForestGroundTexture();
        texture.repeat.set(width / 4, depth / 4);
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(width, depth),
          new THREE.MeshBasicMaterial({
            map: texture,
            color: 0xe8d9b5,
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
            side: THREE.DoubleSide,
          }),
        );
        ground.rotation.x = -Math.PI / 2;
        ground.position.set((minX + maxX) / 2, 0.025, (minZ + maxZ) / 2);
        this.scene.add(ground);
      }
    }
    const staticGroups = new Map();
    const staticPlacements = new Set();
    for (const placement of this.arena.props) {
      if (
        !placement.model
        || placement.procedural
        || placement.decal
        || placement.bogPool
        || placement.blueFlame
        || placement.wallSide
        || placement.doorId
        || instancedModels.has(placement.model)
      ) continue;
      const key = `${placement.model}:${placement.tint ?? ''}`;
      if (!staticGroups.has(key)) staticGroups.set(key, []);
      staticGroups.get(key).push(placement);
      staticPlacements.add(placement);
    }
    for (const placements of staticGroups.values()) {
      const source = loadedByPath.get(placements[0].model)?.scene;
      if (!source) continue;
      source.updateMatrixWorld(true);
      const fadeGroup = this.isForest || this.isCastle
        ? { states: placements.map((placement) => createOccluderState(
          placement,
          this.modelBounds.get(placement.model),
          this.forestModelScales.get(placement.model),
        )), attributes: [] }
        : null;
      if (fadeGroup) this.fadeGroups.push(fadeGroup);
      const translation = new THREE.Matrix4();
      const rotation = new THREE.Matrix4();
      const scaleMatrix = new THREE.Matrix4();
      const matrix = new THREE.Matrix4();
      const materialClones = new Map();
      source.traverse((node) => {
        if (!node.isMesh) return;
        const cloneMaterial = (sourceMaterial) => {
          if (!materialClones.has(sourceMaterial)) {
            const material = sourceMaterial.clone();
            if (this.isForest && material.color) {
              material.color.multiplyScalar(0.88).lerp(new THREE.Color(0x69735e), 0.2);
            }
            const tint = placements[0].tint;
            if (Number.isInteger(tint) && material.color) material.color.lerp(new THREE.Color(tint), 0.35);
            materialClones.set(sourceMaterial, material);
          }
          return materialClones.get(sourceMaterial);
        };
        const material = Array.isArray(node.material)
          ? node.material.map(cloneMaterial)
          : cloneMaterial(node.material);
        const geometry = node.geometry.clone();
        if (fadeGroup) {
          const opacity = new THREE.InstancedBufferAttribute(new Float32Array(placements.length).fill(1), 1);
          geometry.setAttribute('instanceOpacity', opacity);
          fadeGroup.attributes.push(opacity);
          for (const item of Array.isArray(material) ? material : [material]) {
            item.transparent = true;
            item.depthWrite = false;
            item.onBeforeCompile = (shader) => {
              shader.vertexShader = shader.vertexShader
                .replace('#include <common>', '#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;')
                .replace('#include <begin_vertex>', '#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;');
              shader.fragmentShader = shader.fragmentShader
                .replace('#include <common>', '#include <common>\nvarying float vInstanceOpacity;')
                .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;');
            };
            item.customProgramCacheKey = () => 'devinarok-instance-opacity-v1';
            item.needsUpdate = true;
          }
        }
        const instances = new THREE.InstancedMesh(geometry, material, placements.length);
        const normalized = this.forestModelScales.get(placements[0].model);
        placements.forEach((placement, index) => {
          translation.makeTranslation(placement.x, placement.y ?? 0, placement.z);
          rotation.makeRotationY(placement.rotY ?? 0);
          scaleMatrix.makeScale(
            (placement.scaleX ?? placement.scale ?? 1) * (normalized?.x ?? 1),
            (placement.scaleY ?? placement.scale ?? 1) * (normalized?.y ?? 1),
            (placement.scaleZ ?? placement.scale ?? 1) * (normalized?.z ?? 1),
          );
          matrix.multiplyMatrices(translation, rotation).multiply(scaleMatrix).multiply(node.matrixWorld);
          instances.setMatrixAt(index, matrix);
        });
        instances.instanceMatrix.needsUpdate = true;
        instances.computeBoundingSphere();
        this.scene.add(instances);
      });
    }
    for (const placement of this.arena.props) {
      if (placement.decal === 'red-carpet') {
        const geometry = new THREE.PlaneGeometry(placement.decalWidth ?? 1.8, placement.decalLength ?? 16);
        const material = new THREE.MeshStandardMaterial({
          color: 0x79252e,
          roughness: 0.92,
          metalness: 0.02,
          side: THREE.DoubleSide,
        });
        const carpet = new THREE.Mesh(geometry, material);
        carpet.rotation.x = -Math.PI / 2;
        carpet.position.set(placement.x, placement.y ?? 0.055, placement.z);
        carpet.renderOrder = 1;
        this.scene.add(carpet);
        continue;
      }
      if (placement.procedural) {
        this.createSanctuaryProp(placement);
        continue;
      }
      if (staticPlacements.has(placement)) continue;
      if (instancedModels.has(placement.model)) continue;
      if (placement.bogPool) {
        const geometry = new THREE.CircleGeometry(1, 12);
        const material = new THREE.MeshBasicMaterial({
          color: 0x202d28,
          transparent: true,
          opacity: 0.86,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const pool = new THREE.Mesh(geometry, material);
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(placement.x, 0.035, placement.z);
        pool.scale.set(placement.scaleX ?? 1, placement.scaleZ ?? 1, 1);
        this.scene.add(pool);
        continue;
      }
      const prop = SkeletonUtils.clone(loadedByPath.get(placement.model).scene);
      const normalizedScale = this.forestModelScales.get(placement.model);
      const propMaterials = this.isForest || this.isCastle || placement.wallSide || placement.doorId
        || Number.isInteger(placement.tint) || placement.blueFlame
        ? cloneMaterials(prop)
        : [];
      if (propMaterials.length) {
        for (const material of propMaterials) {
          if (this.isForest && material.color) {
            material.color.multiplyScalar(0.88).lerp(new THREE.Color(0x69735e), 0.2);
          }
          if (Number.isInteger(placement.tint) && material.color) material.color.lerp(new THREE.Color(placement.tint), 0.35);
          if (placement.blueFlame && material.emissive) {
            material.emissive.setHex(0x405dff);
            material.emissiveIntensity = 0.75;
          }
        }
      }
      if (this.isForest || this.isCastle) {
        for (const material of propMaterials) {
          material.transparent = true;
          material.depthWrite = false;
        }
        this.fadeObjects.push({
          state: createOccluderState(placement, this.modelBounds.get(placement.model), normalizedScale),
          materials: propMaterials,
        });
      }
      prop.position.set(placement.x, placement.y ?? 0, placement.z);
      prop.rotation.y = placement.rotY;
      prop.scale.set(
        (placement.scaleX ?? placement.scale ?? 1) * (normalizedScale?.x ?? 1),
        (placement.scaleY ?? placement.scale ?? 1) * (normalizedScale?.y ?? 1),
        (placement.scaleZ ?? placement.scale ?? 1) * (normalizedScale?.z ?? 1),
      );
      if (placement.wallSide) {
        for (const material of propMaterials) {
          material.transparent = true;
          material.depthWrite = false;
        }
        this.sideWalls.push({ z: placement.wallCenterZ, materials: propMaterials });
      }
      if (placement.doorId) this.doorVisuals.push({ doorId: placement.doorId, root: prop });
      this.scene.add(prop);
    }
    this.createHubNpcs(loadedByPath);
  }

  createSanctuaryProp(placement) {
    const group = new THREE.Group();
    group.position.set(placement.x, 0, placement.z);
    const wood = new THREE.MeshStandardMaterial({ color: 0x684334, roughness: 0.84 });
    const darkWood = new THREE.MeshStandardMaterial({ color: 0x3e2925, roughness: 0.9 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc39a52, metalness: 0.32, roughness: 0.58 });
    const red = new THREE.MeshStandardMaterial({ color: 0x8e282d, roughness: 0.74 });
    const bronze = new THREE.MeshStandardMaterial({ color: 0x976b3e, metalness: 0.45, roughness: 0.48 });
    const addBox = (size, position, material) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      group.add(mesh);
      return mesh;
    };
    if (placement.procedural === 'altar') {
      addBox([2.05, 0.16, 0.78], [0, 0.92, 0], wood);
      addBox([1.9, 0.06, 0.82], [0, 1.03, 0], red);
      addBox([1.25, 0.72, 0.56], [0, 0.49, 0], darkWood);
      for (const x of [-0.84, 0.84]) {
        for (const z of [-0.28, 0.28]) addBox([0.15, 0.78, 0.15], [x, 0.48, z], wood);
      }
      addBox([0.14, 0.56, 0.83], [0, 0.72, 0.43], red);
      addBox([0.14, 0.56, 0.83], [0, 0.72, -0.43], red);
      for (const x of [-0.74, 0.74]) {
        const incenseCandle = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.28, 6), gold);
        incenseCandle.position.set(x, 1.23, 0);
        group.add(incenseCandle);
        const flame = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffaa43 }));
        flame.position.set(x, 1.42, 0);
        group.add(flame);
      }
    } else if (placement.procedural === 'statue') {
      const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.48, 0.62), darkWood);
      plinth.position.set(0, 0.24, 0.16);
      group.add(plinth);
      const statueMaterial = new THREE.MeshStandardMaterial({ color: 0xd1b57b, metalness: 0.22, roughness: 0.65 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.15, 8), statueMaterial);
      body.position.set(0, 1.08, 0.12);
      group.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 6), statueMaterial);
      head.position.set(0, 1.82, 0.12);
      group.add(head);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 6, 18), gold);
      halo.position.set(0, 1.82, -0.06);
      group.add(halo);
      const backdrop = new THREE.MeshBasicMaterial({ color: 0xf0b95a, transparent: true, opacity: 0.18 });
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.4), backdrop);
      glow.position.set(0, 1.85, -0.18);
      group.add(glow);
      const light = new THREE.PointLight(0xffc875, 5, 4.5, 2);
      light.position.set(0, 2.2, 0.4);
      group.add(light);
    } else if (placement.procedural === 'incense-burner') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.28, 8), bronze);
      base.position.y = 0.14;
      group.add(base);
      const profile = [
        new THREE.Vector2(0.17, 0.2),
        new THREE.Vector2(0.3, 0.28),
        new THREE.Vector2(0.34, 0.48),
        new THREE.Vector2(0.27, 0.55),
        new THREE.Vector2(0.24, 0.47),
        new THREE.Vector2(0.18, 0.4),
      ];
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 10), bronze);
      bowl.position.y = 0.18;
      group.add(bowl);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 5, 12), gold);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.68;
      group.add(rim);
      for (const x of [-0.12, 0, 0.12]) {
        const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.42, 5), darkWood);
        stick.position.set(x, 0.83, 0);
        group.add(stick);
      }
    } else if (placement.procedural === 'furnace') {
      addBox([1.0, 0.92, 0.76], [0, 0.46, 0], darkWood);
      addBox([1.16, 0.16, 0.88], [0, 0.94, 0], gold);
      addBox([0.54, 0.52, 0.12], [0, 0.47, 0.4], bronze);
      addBox([0.36, 0.34, 0.06], [0, 0.42, 0.48], new THREE.MeshBasicMaterial({ color: 0x260f0c }));
      for (const x of [-0.44, 0.44]) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.04, 0.08), gold);
        trim.position.set(x, 0.52, 0.42);
        group.add(trim);
      }
      const top = new THREE.Mesh(new THREE.ConeGeometry(0.58, 0.38, 4), red);
      top.position.set(0, 1.18, 0);
      group.add(top);
    }
    this.scene.add(group);
  }

  createHubNpcs(loadedByPath) {
    for (const npc of this.arena.npcs ?? []) {
      const source = loadedByPath.get(M0_MODELS[npc.model])?.scene;
      if (!source) continue;
      const root = SkeletonUtils.clone(source);
      const materials = cloneMaterials(root);
      root.position.set(npc.x, 0, npc.z);
      root.rotation.y = npc.rotY;
      root.scale.setScalar(0.85);
      this.scene.add(root);
      const mixer = new THREE.AnimationMixer(root);
      const idle = this.clips.humanoid.find((clip) => clip.name === 'Unarmed_Idle') ?? this.clips.humanoid.find((clip) => clip.name === 'Idle');
      const action = idle ? mixer.clipAction(idle).play() : null;
      const button = document.createElement('button');
      button.className = 'npc-hotspot';
      button.type = 'button';
      button.dataset.panel = npc.panel;
      button.append(document.createTextNode(npc.name));
      if (npc.id === 'innkeeper') {
        const badge = document.createElement('b');
        badge.className = 'contract-claim-badge npc-contract-badge';
        badge.dataset.contractClaimBadge = 'innkeeper';
        badge.textContent = '!';
        badge.hidden = true;
        button.append(badge);
      }
      this.npcLayer.appendChild(button);
      this.hubNpcs.push({ npc, root, mixer, action, button, materials });
    }
  }

  updateWallFade(playerZ) {
    for (const wall of this.sideWalls) {
      const ahead = wall.z - playerZ;
      const opacity = THREE.MathUtils.clamp(1 - Math.max(0, ahead + 1) * 0.24, 0.18, 1);
      for (const material of wall.materials) material.opacity = opacity;
    }
  }

  updateNpcHotspots(dt, world) {
    const rect = this.canvas.getBoundingClientRect();
    const player = world?.entities.find((entity) => entity.kind === 'player' && (
      entity.playerId === this.localPlayerId || entity.id === this.localPlayerId
    ));
    for (const { npc, root, mixer, button } of this.hubNpcs) {
      mixer.update(Math.min(dt, 0.05));
      button.classList.toggle('is-nearby', Boolean(player && Math.hypot(player.x - npc.x, player.z - npc.z) <= 1.6));
      const point = this.projectedPoint.set(npc.x, 2.2, npc.z).project(this.camera);
      button.style.left = `${(point.x + 1) * rect.width / 2}px`;
      button.style.top = `${(1 - point.y) * rect.height / 2}px`;
      button.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1;
      root.visible = point.z >= -1 && point.z <= 1;
    }
  }

  graftPlayerParts(root, lineage = 'human') {
    const existingParts = new Set();
    root.traverse((node) => existingParts.add(node.name));
    const compatible = {
      skeleton_knight: new Set(['Skeleton_Warrior_Helmet']),
      skeleton_archer: new Set(['Skeleton_Rogue_Hood', 'Skeleton_Rogue_Cape']),
      skeleton_mage: new Set(),
    }[lineage];
    for (const { node, donor, bone } of DONOR_PARTS) {
      if (compatible && !compatible.has(node)) continue;
      if (existingParts.has(node)) continue;
      const donorPart = this.models.get(donor)?.getObjectByName(node);
      const parent = root.getObjectByName(bone);
      if (!donorPart || !parent) continue;
      const graft = donorPart.clone();
      graft.position.copy(donorPart.position);
      graft.quaternion.copy(donorPart.quaternion);
      graft.scale.copy(donorPart.scale);
      parent.add(graft);
      existingParts.add(node);
    }
  }

  createEntity(entity, world = null) {
    const entityModelKey = entity.kind === 'player' ? playerModelKey(entity) : entity.model ?? entity.enemyKind;
    const assetKey = entityModelKey === 'rogue' ? 'Rogue_Hooded' : entityModelKey === 'mage' ? 'Mage' : entityModelKey;
    const source = this.models.get(assetKey);
    const root = source ? SkeletonUtils.clone(source) : new THREE.Group();
    const lineageId = entity.kind === 'player' ? lineageOf(entity) : null;
    if (entity.kind === 'player') this.graftPlayerParts(root, lineageId);
    const materials = cloneMaterials(root);
    if (entity.kind === 'enemy' && entity.enemyKind === 'ashwarden') {
      root.traverse((node) => {
        if (/hat/i.test(node.name)) node.visible = false;
      });
    }
    if (Number.isInteger(entity.tint)) {
      const tint = new THREE.Color(entity.tint);
      for (const material of materials) {
        if (material.color) material.color.lerp(tint, 0.45);
      }
    }
    if (entity.kind === 'player') isolatePlayerPartMaterials(root, materials);
    if (entity.kind === 'player' && entity.evolved) {
      const head = root.getObjectByName('head');
      if (head) {
        const eyeMaterial = LINEAGE_EYE_MATERIALS[lineageId] ?? LINEAGE_EYE_MATERIALS.skeleton_knight;
        for (const x of [-0.045, 0.045]) {
          const eye = new THREE.Mesh(LINEAGE_EYE_GEOMETRY, eyeMaterial);
          eye.position.set(x, 0.055, 0.075);
          head.add(eye);
        }
      }
    }
    if (entity.kind === 'player' && lineageId !== 'human') {
      const ring = new THREE.Mesh(LINEAGE_RING_GEOMETRY, LINEAGE_RING_MATERIALS[lineageId]);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.09;
      ring.renderOrder = 2;
      root.add(ring);
    }
    if (entity.kind === 'player' && entity.evolved) {
      const tint = new THREE.Color(LINEAGE_COLORS[lineageId] ?? 0xe7d9bf);
      for (const material of materials) {
        if (!material.emissive) continue;
        material.emissive.lerp(tint, 0.005);
        material.emissiveIntensity = 0.005;
      }
    }
    if (entity.kind === 'enemy') root.scale.set(...silhouetteScale(entity));
    else root.scale.setScalar(entity.kind === 'player'
      ? (entity.modelScale ?? 0.95) * (entity.evolved ? 1.08 : 1)
      : entity.modelScale ?? (entity.kind === 'loot' ? 1 : 0.95));
    const modelBounds = entity.kind === 'player' ? new THREE.Box3().setFromObject(root) : null;
    const screenCenterY = modelBounds && !modelBounds.isEmpty()
      ? (modelBounds.min.y + modelBounds.max.y) / 2
      : 0.9;
    const lootResources = [];
    if (entity.kind === 'enemy' && entity.enemyKind === 'shieldbearer') {
      const shieldGeometry = new THREE.BoxGeometry(0.48, 0.68, 0.14);
      const shieldMaterial = new THREE.MeshStandardMaterial({ color: 0x79818e, metalness: 0.48, roughness: 0.52 });
      const shield = new THREE.Mesh(shieldGeometry, shieldMaterial);
      shield.scale.setScalar(1.2);
      shield.position.set(0.42, 0.8, 0.25);
      root.add(shield);
      const bossGeometry = new THREE.SphereGeometry(0.095, 6, 4);
      const bossMaterial = new THREE.MeshStandardMaterial({ color: 0xd2bd7b, metalness: 0.42, roughness: 0.45 });
      const shieldBoss = new THREE.Mesh(bossGeometry, bossMaterial);
      shieldBoss.position.set(0.42, 0.8, 0.33);
      root.add(shieldBoss);
      lootResources.push(shieldGeometry, shieldMaterial, bossGeometry, bossMaterial);
    }
    const outlines = [];
    const outlineKind = entity.kind === 'enemy'
      ? outlineKindFor(entity, world, this.outlineTargetId)
      : null;
    if (entity.kind === 'enemy') {
      const meshNodes = [];
      root.traverse((node) => {
        if (node.isMesh) meshNodes.push(node);
      });
      const material = this.outlineMaterials.get(outlineKind) ?? this.outlineMaterials.get('enemy');
      for (const node of meshNodes) {
        const geometry = this.outlineGeometry(node.geometry);
        if (!geometry) continue;
        const outline = node.isSkinnedMesh
          ? new THREE.SkinnedMesh(geometry, material)
          : new THREE.Mesh(geometry, material);
        if (node.isSkinnedMesh) outline.bind(node.skeleton, node.bindMatrix);
        outline.position.copy(node.position);
        outline.quaternion.copy(node.quaternion);
        outline.scale.copy(node.scale);
        outline.frustumCulled = node.frustumCulled;
        outline.castShadow = false;
        outline.receiveShadow = false;
        outline.visible = this.outlinesEnabled && outlineKind !== null && node.visible && !entity.dead;
        node.parent.add(outline);
        outlines.push({ source: node, outline });
      }
    }
    if (entity.kind === 'loot') {
      const isPotion = entity.lootType === 'potion';
      const beamColor = isPotion ? 0xe0414f
        : entity.item?.rarity === 'legendary' ? 0xff8b38
          : entity.item?.rarity === 'rare' ? 0xf0c64f
            : entity.item?.rarity === 'magic' ? 0x6388ff : 0x70d8ef;
      const beamGeometry = new THREE.CylinderGeometry(0.035, 0.16, 1.25, 8, 1, true);
      const beamMaterial = new THREE.MeshBasicMaterial({ color: beamColor, transparent: true, opacity: 0.72, depthWrite: false });
      const beam = new THREE.Mesh(
        beamGeometry,
        beamMaterial,
      );
      lootResources.push(beamGeometry, beamMaterial);
      beam.position.y = 0.75;
      root.add(beam);
      const orbGeometry = new THREE.OctahedronGeometry(0.22, 0);
      const orbMaterial = new THREE.MeshBasicMaterial({ color: isPotion ? 0xe0414f : 0xffdf94 });
      const orb = new THREE.Mesh(orbGeometry, orbMaterial);
      lootResources.push(orbGeometry, orbMaterial);
      orb.position.y = 0.18;
      root.add(orb);
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 320;
      labelCanvas.height = 64;
      const labelContext = labelCanvas.getContext('2d');
      labelContext.fillStyle = '#171219d9';
      labelContext.fillRect(2, 2, 316, 60);
      labelContext.font = 'bold 28px sans-serif';
      labelContext.textAlign = 'center';
      labelContext.fillStyle = isPotion ? '#ffd2d7' : entity.lootType === 'gold' ? '#f5d17d' : '#ffffff';
      labelContext.fillText(
        isPotion
          ? '물약'
          : entity.lootType === 'gold'
            ? `+${entity.gold} G`
            : ITEMS[entity.item?.itemId]?.name ?? `${RARITIES[entity.item?.rarity]?.name ?? '장비'} 아이템`,
        160,
        42,
      );
      const labelTexture = new THREE.CanvasTexture(labelCanvas);
      labelTexture.colorSpace = THREE.SRGBColorSpace;
      const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true, depthTest: false });
      const label = new THREE.Sprite(labelMaterial);
      lootResources.push(labelTexture, labelMaterial);
      label.position.y = 1.7;
      label.scale.set(1.7, 0.35, 1);
      root.add(label);
    }
    this.scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const actions = new Map();
    const libraries = entity.kind === 'player'
      ? [['humanoid', this.clips.humanoid]]
      : [['skeleton', this.clips.skeleton], ['humanoid', this.clips.humanoid]];
    for (const [library, clips] of libraries) {
      for (const clip of clips) actions.set(`${library}:${clip.name}`, mixer.clipAction(clip));
    }
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.52, 18),
      new THREE.MeshBasicMaterial({ color: 0x050408, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);
    const materialState = new Map(materials.map((material) => [material, {
      emissive: material.emissive?.clone(),
      emissiveIntensity: material.emissiveIntensity ?? 0,
    }]));
    const visual = {
      root,
      mixer,
      actions,
      currentAction: null,
      currentKey: '',
      shadow,
      materials,
      materialState,
      screenCenterY,
      lootResources,
      outlines,
      outlineKind,
      modelKey: entity.kind === 'player' ? entityModelKey : '',
      lookKey: entity.kind === 'player' ? playerLookKey(entity.look) : '',
      partTints: entity.kind === 'player' ? applyPlayerLook(root, entity.look) : new Map(),
    };
    this.entities.set(entity.id, visual);
    return visual;
  }

  animationFor(entity) {
    if (entity.dead) return entity.kind === 'enemy' ? 'Death_C_Skeletons' : 'Death_A';
    if (entity.spawnTicksLeft > 0) return 'Spawn_Ground_Skeletons';
    if (entity.dodgeTicks > 0 || ['dodge', 'blink', 'vault'].includes(entity.anim)) return 'Dodge_Forward';
    if (entity.kind === 'player' && entity.attack?.step) {
      if (entity.family === 'crossbow') return entity.look?.weapon === '2H_Crossbow' ? '2H_Ranged_Shoot' : '1H_Ranged_Shoot';
      if (entity.family === 'staff') return 'Spellcast_Shoot';
      const clips = ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'];
      return clips[entity.attack.step - 1];
    }
    if (entity.kind === 'player' && entity.skillCast?.name) {
      if (['blink', 'vault'].includes(entity.skillCast.name)) return 'Dodge_Forward';
      if (['flame', 'frost'].includes(entity.skillCast.name)) return 'Spellcast_Long';
      if (entity.family === 'crossbow') return entity.look?.weapon === '2H_Crossbow' ? '2H_Ranged_Shoot' : '1H_Ranged_Shoot';
      if (entity.family === 'staff') return 'Spellcast_Shoot';
    }
    if (entity.kind === 'player' && entity.anim === 'run') return 'Running_A';
    if (entity.kind === 'player' && entity.anim && !['idle', 'attack', 'windup', 'active', 'recovery'].includes(entity.anim)) return entity.anim;
    if (entity.kind === 'enemy' && entity.attackPhase === 'active' && entity.attackPattern === 'bone-spear') {
      return this.clips.skeleton?.find((clip) => /throw/i.test(clip.name))?.name ?? '1H_Melee_Attack_Chop';
    }
    if (entity.attackPhase === 'active') return '1H_Melee_Attack_Chop';
    if (entity.moving || entity.attackShape) return entity.kind === 'enemy' ? 'Running_C' : 'Running_A';
    return entity.kind === 'enemy' ? 'Idle_Combat' : 'Idle';
  }

  updateAnimation(entity, visual, dt) {
    const preview = entity.kind === 'enemy' ? this.enemyClipPreview : null;
    const library = preview?.source ?? (entity.kind === 'enemy' ? 'skeleton' : 'humanoid');
    const name = preview?.clipName ?? this.animationFor(entity);
    const action = visual.actions.get(`${library}:${name}`)
      ?? visual.actions.get(`${library}:${entity.kind === 'enemy' ? 'Idle_Combat' : 'Idle'}`);
    const key = `${library}:${name}`;
    if (action && visual.currentKey !== key) {
      if (visual.currentAction) visual.currentAction.fadeOut(0.12);
      action.reset().fadeIn(0.12).play();
      if (entity.attack && entity.attack.step <= COMBO_TIMELINES.length) {
        const timeline = COMBO_TIMELINES[entity.attack.step - 1];
        action.setDuration((timeline.windupTicks + timeline.activeTicks + timeline.recoveryTicks) / 30);
      }
      visual.currentAction = action;
      visual.currentKey = key;
    }
    visual.mixer.update(Math.min(dt, 0.05));
  }

  setEnemyClipPreview(source, clipName) {
    if (!['skeleton', 'humanoid'].includes(source)) return false;
    if (!this.clips[source].some((clip) => clip.name === clipName)) return false;
    this.enemyClipPreview = { source, clipName };
    for (const visual of this.entities.values()) {
      visual.currentAction?.stop();
      visual.currentKey = '';
      visual.currentAction = null;
    }
    return true;
  }

  createSlash(event) {
    if (!event.castId) return;
    const castKey = castVisualKey(event);
    if (this.seenCastKeys.has(castKey)) return;
    this.seenCastKeys.add(castKey);
    const counter = event.skillId === 'counter';
    if (counter) {
      for (const [key, effect] of this.slashes) {
        if (effect.castId === event.castId && !effect.counter && !effect.hit) this.removeSlash(key);
      }
    }
    const skillId = event.skill;
    const rankFive = !counter && Number.isInteger(skillId)
      && this.masteryRankForSkill(event.entityId, skillId) === 5;
    const timeline = COMBO_TIMELINES[event.step - 1];
    const duration = counter ? 8 : skillId === 1 ? 6 : skillId === 2 ? 6 : skillId === 3 ? 45 : timeline?.activeTicks;
    if (!duration) return;
    const points = [];
    if (counter && event.family === 'staff') {
      for (let index = 0; index <= 32; index += 1) {
        const angle = index / 32 * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * 2.8, 0, Math.sin(angle) * 2.8));
      }
    } else if (counter) {
      const length = event.family === 'crossbow' ? 12 : 3.5;
      points.push(new THREE.Vector3(0, 0, 0), new THREE.Vector3(length, 0, 0));
    } else if (skillId === 1) {
      for (let index = 0; index <= 32; index += 1) {
        const angle = index / 32 * Math.PI * 2;
        points.push(new THREE.Vector3(Math.cos(angle) * 2.2, 0, Math.sin(angle) * 2.2));
      }
    } else {
      const startAngle = skillId === 3 ? -0.9 : -0.95;
      const endAngle = skillId === 3 ? 0.9 : 0.95;
      const radius = skillId === 3 ? 1.35 : 1.1;
      for (let index = 0; index <= 24; index += 1) {
        const angle = startAngle + (index / 24) * (endAngle - startAngle);
        points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
      }
    }
    const closed = skillId === 1 || (counter && event.family === 'staff');
    const curve = new THREE.CatmullRomCurve3(points, closed);
    const geometry = new THREE.TubeGeometry(curve, closed ? 40 : 28, counter ? 0.09 : skillId === 3 ? 0.085 : skillId === 1 ? 0.05 : 0.065, 6, closed);
    const material = new THREE.MeshBasicMaterial({
      color: rankFive ? 0xfff2c4 : counter ? 0xffe08a : skillId === 3 ? 0x8bd3ff : skillId === 1 ? 0xffce73 : 0xff8b43,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (rankFive) mesh.scale.setScalar(1.15);
    mesh.renderOrder = 2;
    mesh.visible = false;
    this.scene.add(mesh);
    const startTick = event.tick + (counter ? 0 : timeline?.windupTicks ?? (skillId === 1 ? 5 : 0));
    this.slashes.set(castKey, {
      castKey,
      castId: event.castId,
      entityId: event.entityId,
      counter,
      hit: false,
      startTick,
      endTick: startTick + duration,
      facing: counter ? event.angle ?? this.worldEntity(event.entityId)?.facing ?? 0 : this.worldEntity(event.entityId)?.facing ?? 0,
      mesh,
    });
  }

  removeSlash(key) {
    const effect = this.slashes.get(key);
    if (!effect) return;
    this.scene.remove(effect.mesh);
    effect.mesh.geometry.dispose();
    effect.mesh.material.dispose();
    this.slashes.delete(key);
  }

  worldEntity(entityId) {
    return this.currentWorld?.entities.find((entity) => entity.id === entityId);
  }

  masteryRankForSkill(playerId, skill) {
    const player = this.currentWorld?.entities.find((entity) => (
      entity.kind === 'player' && (entity.id === playerId || entity.playerId === playerId)
    ));
    if (!player) return 0;
    const slot = Number.isInteger(skill)
      ? skill
      : (FAMILY_SKILLS[player.family] ?? []).indexOf(skill) + 1;
    if (slot < 1) return 0;
    const rank = player.masteryRanks?.[slot]
      ?? (Array.isArray(player.mastery) ? player.mastery[slot - 1] : player.mastery?.[slot]);
    return Number.isInteger(rank) ? rank : 0;
  }

  createDamageNumber(event) {
    const pickup = event.type === 'pickup';
    if (pickup && (
      !event.auto || event.lootType !== 'gold' || event.playerId !== this.localPlayerId
    )) return;
    if (!pickup && event.damage <= 0) return;
    const element = document.createElement('span');
    element.className = pickup
      ? 'damage-number gold-pickup'
      : event.guarded ? 'damage-number guarded' : 'damage-number';
    element.textContent = pickup
      ? `+${event.gold} G`
      : event.guarded ? `막음 −${event.damage}` : `−${event.damage}`;
    this.vfxLayer.appendChild(element);
    this.damageNumbers.push({
      element,
      targetId: pickup ? null : event.targetId,
      x: pickup ? event.x : null,
      z: pickup ? event.z : null,
      startTime: performance.now(),
      duration: pickup ? 700 : 850,
    });
    while (this.damageNumbers.length > 24) this.removeDamageNumber(0);
  }

  createGuardSpark(event, world, now) {
    const target = world.entities.find((entity) => entity.id === event.targetId);
    if (!target) return;
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.2, 0, 0),
      new THREE.Vector3(0, 0, -0.2), new THREE.Vector3(0, 0, 0.2),
      new THREE.Vector3(-0.15, 0.13, -0.15), new THREE.Vector3(0.15, -0.13, 0.15),
    ]);
    const material = new THREE.LineBasicMaterial({ color: 0xcbd7e8, transparent: true, opacity: 1, fog: false });
    const spark = new THREE.LineSegments(geometry, material);
    spark.position.set(target.x, 0.86, target.z);
    this.scene.add(spark);
    this.addTransient(spark, geometry, material, {
      startTime: now,
      durationMs: 180,
      update: (effect, tick, elapsed) => {
        const progress = THREE.MathUtils.clamp(elapsed / 180, 0, 1);
        effect.mesh.scale.setScalar(0.6 + progress * 0.8);
        material.opacity = 1 - progress;
      },
    });
  }

  removeDamageNumber(index) {
    const [effect] = this.damageNumbers.splice(index, 1);
    effect?.element.remove();
  }

  createDeathPuff(event, world) {
    const entity = world.entities.find((item) => item.id === event.entityId);
    if (!entity) return;
    const geometry = new THREE.SphereGeometry(0.13, 6, 4);
    const material = new THREE.MeshBasicMaterial({
      color: 0xb9a99b,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
      fog: false,
    });
    const group = new THREE.Group();
    for (const [x, y, z] of [[0, 0.3, 0], [-0.22, 0.18, 0.12], [0.19, 0.2, -0.1], [0.06, 0.12, 0.22]]) {
      const puff = new THREE.Mesh(geometry, material);
      puff.position.set(x, y, z);
      group.add(puff);
    }
    group.position.set(entity.x, 0, entity.z);
    this.scene.add(group);
    this.deathPuffs.push({ group, geometry, material, startTime: performance.now(), duration: 520 });
    while (this.deathPuffs.length > 12) this.removeDeathPuff(0);
  }

  removeDeathPuff(index) {
    const [effect] = this.deathPuffs.splice(index, 1);
    if (!effect) return;
    this.scene.remove(effect.group);
    effect.geometry.dispose();
    effect.material.dispose();
  }

  addTransient(mesh, geometry, material, { startTime = null, durationMs = null, startTick = null, endTick = null, update = null } = {}) {
    this.scene.add(mesh);
    this.transientEffects.push({ mesh, geometry, material, startTime, durationMs, startTick, endTick, update });
  }

  createShot(event, now) {
    const key = `${event.ownerId}:${event.castSeq}:${event.lineIndex ?? 0}`;
    if (this.seenShotKeys.has(key)) return;
    this.seenShotKeys.add(key);
    while (this.seenShotKeys.size > 512) this.seenShotKeys.delete(this.seenShotKeys.values().next().value);
    const owner = this.currentWorld?.entities.find((entity) => (
      entity.kind === 'player' && entity.playerId === event.ownerId
    ));
    const rankFive = owner && this.masteryRankForSkill(
      event.ownerId,
      owner.skillCast?.name ?? owner.skill,
    ) === 5;
    const geometry = new THREE.CylinderGeometry(0.018, 0.018, event.length, 5);
    const material = new THREE.MeshStandardMaterial({
      color: rankFive ? 0xfff2c4 : 0xffe9ab,
      emissive: rankFive ? 0xffe8a0 : 0xffbd58,
      emissiveIntensity: 1.6,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    if (rankFive) mesh.scale.setScalar(1.15);
    const direction = new THREE.Vector3(Math.cos(event.angle), 0, Math.sin(event.angle));
    mesh.position.set(event.x + direction.x * event.length / 2, 0.55, event.z + direction.z * event.length / 2);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    this.addTransient(mesh, geometry, material, { startTime: now, durationMs: 80 });
  }

  createImpactRing(x, z, radius, color, startTick, endTick) {
    const geometry = new THREE.RingGeometry(0.1, radius, 32);
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.045, z);
    mesh.renderOrder = 2;
    this.addTransient(mesh, geometry, material, {
      startTick,
      endTick,
      update: (effect, tick) => {
        const progress = THREE.MathUtils.clamp((tick - startTick) / Math.max(1, endTick - startTick), 0, 1);
        effect.mesh.scale.setScalar(0.25 + progress * 0.85);
        effect.material.opacity = 0.8 * (1 - progress);
      },
    });
  }

  createObjectiveFlash(x, z, radius, now) {
    const geometry = new THREE.RingGeometry(0.12, radius, 40);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffd47a,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.055, z);
    mesh.renderOrder = 3;
    this.addTransient(mesh, geometry, material, {
      startTime: now,
      durationMs: 420,
      update: (effect, _tick, elapsed) => {
        const progress = THREE.MathUtils.clamp(elapsed / 420, 0, 1);
        effect.mesh.scale.setScalar(0.45 + progress * 0.75);
        effect.material.opacity = 0.9 * (1 - progress);
      },
    });
  }

  createSkillTelegraph(event) {
    const { originX: x, originZ: z, radius } = event.shape;
    const colors = { quake: 0xe5be72, rain: 0x8bc9ff, meteor: 0xff8c4a };
    const rankFive = this.masteryRankForSkill(event.ownerId, event.skillName) === 5;
    const color = rankFive ? 0xfff2c4 : colors[event.skillName] ?? 0xffc777;
    const fillGeometry = new THREE.CircleGeometry(radius, 48);
    const fillMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const fill = new THREE.Mesh(fillGeometry, fillMaterial);
    fill.rotation.x = -Math.PI / 2;
    fill.position.set(x, 0.04, z);
    fill.renderOrder = 20;
    this.addTransient(fill, fillGeometry, fillMaterial, {
      startTick: event.startTick,
      endTick: event.resolveTick,
      update: (effect, tick) => {
        const progress = THREE.MathUtils.clamp((tick - event.startTick) / Math.max(1, event.resolveTick - event.startTick), 0, 1);
        effect.mesh.scale.setScalar(progress * (rankFive ? 1.15 : 1));
      },
    });
    const ringGeometry = new THREE.RingGeometry(Math.max(0, radius - 0.18), radius, 48);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.85,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    if (rankFive) ring.scale.setScalar(1.15);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.045, z);
    ring.renderOrder = 21;
    this.addTransient(ring, ringGeometry, ringMaterial, {
      startTick: event.startTick,
      endTick: event.resolveTick,
    });
  }

  createImpact(event) {
    const key = `${event.ownerId}:${event.castSeq}`;
    if (this.seenImpactCasts.has(key)) return;
    this.seenImpactCasts.add(key);
    while (this.seenImpactCasts.size > 256) this.seenImpactCasts.delete(this.seenImpactCasts.values().next().value);
    const { originX: x, originZ: z, radius } = event.shape;
    const skillKey = {
      burn: 'flame',
      frost: 'frost',
      quake: 'quake',
      meteor: 'meteor',
      rain: 'rain',
    }[event.kind];
    const rankFive = skillKey && this.masteryRankForSkill(event.ownerId, skillKey) === 5;
    if (event.kind === 'staff-basic') {
      const geometry = new THREE.SphereGeometry(0.19, 10, 8);
      const material = new THREE.MeshStandardMaterial({ color: 0xffd391, emissive: 0xff812f, emissiveIntensity: 1.4 });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(event.sourceX, 0.8, event.sourceZ);
      this.addTransient(mesh, geometry, material, {
        startTick: event.fireTick,
        endTick: event.resolveTick,
        update: (effect, tick) => {
          const progress = THREE.MathUtils.clamp((tick - event.fireTick) / Math.max(1, event.resolveTick - event.fireTick), 0, 1);
          effect.mesh.position.set(event.sourceX + (x - event.sourceX) * progress, 0.8 + Math.sin(progress * Math.PI) * 0.35, event.sourceZ + (z - event.sourceZ) * progress);
          if (tick >= event.resolveTick) {
            this.createImpactRing(x, z, radius, 0xffd17a, event.resolveTick, event.resolveTick + 10);
            effect.endTick = event.resolveTick;
          }
        },
      });
    } else if (event.kind === 'burn') {
      const geometry = new THREE.CircleGeometry(radius * (rankFive ? 1.15 : 1), 36);
      const material = new THREE.MeshBasicMaterial({ color: rankFive ? 0xfff2c4 : 0xff6b2e, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, 0.025, z);
      this.addTransient(mesh, geometry, material, {
        startTick: event.resolveTick,
        endTick: event.endsTick,
        update: (effect, tick) => {
          effect.mesh.scale.setScalar(0.92 + Math.sin(tick * 0.55) * 0.08);
          effect.material.opacity = 0.15 + (Math.sin(tick * 0.55) + 1) * 0.045;
        },
      });
    } else {
      const color = rankFive ? 0xfff2c4 : event.kind === 'quake' ? 0xe5be72
        : event.kind === 'meteor' ? 0xff8c4a : 0x91dfff;
      this.createImpactRing(x, z, radius * (rankFive ? 1.15 : 1), color, event.resolveTick, event.resolveTick + 14);
    }
  }

  createBlink(event, now) {
    const rankFive = this.masteryRankForSkill(event.entityId, 'blink') === 5;
    for (const point of [event.from, event.to]) {
      const geometry = new THREE.SphereGeometry(rankFive ? 0.23 : 0.2, 8, 6);
      const material = new THREE.MeshBasicMaterial({ color: rankFive ? 0xfff2c4 : 0xb8e8ff, transparent: true, opacity: 0.72, depthWrite: false });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(point.x, 0.35, point.z);
      this.addTransient(mesh, geometry, material, {
        startTime: now,
        durationMs: 360,
        update: (effect, _tick, elapsed) => {
          const progress = elapsed / 360;
          effect.mesh.scale.setScalar(0.5 + progress * 1.8);
          effect.material.opacity = 0.72 * (1 - progress);
        },
      });
    }
  }

  updateTransientEffects(world, now) {
    for (let index = this.transientEffects.length - 1; index >= 0; index -= 1) {
      const effect = this.transientEffects[index];
      const elapsed = effect.startTime === null ? 0 : now - effect.startTime;
      if ((effect.durationMs !== null && elapsed >= effect.durationMs) || (effect.endTick !== null && world.tick > effect.endTick)) {
        this.scene.remove(effect.mesh);
        effect.geometry.dispose();
        effect.material.dispose();
        this.transientEffects.splice(index, 1);
        continue;
      }
      effect.mesh.visible = effect.startTick === null || world.tick >= effect.startTick;
      effect.update?.(effect, world.tick, elapsed);
    }
  }

  consumePredictedEvents(events, world, now) {
    this.currentWorld = world;
    for (const event of events ?? []) {
      if (event.type === 'cast') {
        this.createSlash(event);
      } else if (event.type === 'predictedHit') {
        for (const effect of this.slashes.values()) {
          if (effect.castId === event.castId) effect.hit = true;
        }
        this.predictedFlashUntil.set(event.targetId, now + 150);
        if (!this.reducedMotion) {
          if (this.hitstopUntil <= now) this.hitstopStartedAt = now;
          this.hitstopUntil = Math.min(this.hitstopStartedAt + 60, Math.max(this.hitstopUntil, now + 55));
        }
      }
    }
  }

  consumeEvents(world, now) {
    this.currentWorld = world;
    for (const event of world.events) {
      if (this.seenEventIds.has(event.eventId)) continue;
      this.seenEventIds.add(event.eventId);
      if (event.type === 'cast') this.createSlash(event);
      if (event.type === 'skillTelegraph') this.createSkillTelegraph(event);
      if (event.type === 'shot') this.createShot(event, now);
      if (event.type === 'impact') this.createImpact(event);
      if (event.type === 'blink' || event.type === 'bossBlink') this.createBlink(event, now);
      if (event.type === 'objectiveFailed' && ['defend', 'channel'].includes(world.objective?.type)) {
        const objective = world.objective;
        const room = world.arena.rooms?.[objective.roomIndex];
        this.createImpactRing(
          objective.x ?? 0,
          objective.z ?? room?.centerZ ?? 0,
          Math.max(0.9, objective.radius ?? 0.8),
          0xff706d,
          world.tick,
          world.tick + 14,
        );
      }
      if (event.type === 'objectiveComplete' && world.objective?.type === 'channel') {
        const objective = world.objective;
        this.createObjectiveFlash(
          objective.x ?? 0,
          objective.z ?? world.arena.rooms?.[objective.roomIndex]?.centerZ ?? 0,
          objective.radius,
          now,
        );
      }
      if (event.type === 'hit') {
        for (const effect of this.slashes.values()) {
          if (effect.castId === event.castId) effect.hit = true;
        }
        this.createDamageNumber(event);
        if (event.guarded) this.createGuardSpark(event, world, now);
        if (event.damage > 0 && !event.predictedLocally) {
          if (!this.reducedMotion) {
            if (this.hitstopUntil <= now) this.hitstopStartedAt = now;
            this.hitstopUntil = Math.min(this.hitstopStartedAt + 60, Math.max(this.hitstopUntil, now + 55));
          }
          const target = world.entities.find((entity) => entity.id === event.targetId);
          if (target?.kind === 'player' && !this.reducedMotion) this.shakeUntil = now + 110;
        }
      }
      if (event.type === 'pickup') this.createDamageNumber(event);
      if (event.type === 'death') this.createDeathPuff(event, world);
      if (event.type === 'boneRevival') {
        const player = world.entities.find((entity) => entity.id === event.entityId);
        if (player) {
          const color = LINEAGE_COLORS[lineageOf(player)] ?? 0xe7d9bf;
          this.createImpactRing(player.x, player.z, 0.72, color, world.tick, world.tick + 18);
          this.createImpactRing(player.x, player.z, 0.42, 0xe7d9bf, world.tick + 2, world.tick + 16);
        }
      }
    }
    while (this.seenEventIds.size > 512) this.seenEventIds.delete(this.seenEventIds.values().next().value);
    while (this.seenCastKeys.size > 256) this.seenCastKeys.delete(this.seenCastKeys.values().next().value);
  }

  updatePresentation(world, now) {
    this.updatePartyMarkers(world);
    this.updateObjectiveVisual(world);
    for (const [castKey, effect] of this.slashes) {
      const entity = world.entities.find((item) => item.id === effect.entityId);
      const tick = world.tick;
      const visible = entity && tick >= effect.startTick && tick <= effect.endTick + 3;
      effect.mesh.visible = Boolean(visible);
      if (entity && visible) {
        effect.mesh.position.set(entity.x, 0.72, entity.z);
        effect.mesh.rotation.y = -effect.facing;
        effect.mesh.material.opacity = tick <= effect.endTick ? 0.9 : 0.9 * (1 - (tick - effect.endTick) / 4);
      }
      if (!entity || tick > effect.endTick + 3) {
        this.removeSlash(castKey);
      }
    }

    for (let index = this.damageNumbers.length - 1; index >= 0; index -= 1) {
      const effect = this.damageNumbers[index];
      const elapsed = now - effect.startTime;
      if (elapsed >= effect.duration) {
        this.removeDamageNumber(index);
        continue;
      }
      const target = effect.targetId === null
        ? null
        : world.entities.find((entity) => entity.id === effect.targetId);
      if (effect.targetId !== null && !target) {
        this.removeDamageNumber(index);
        continue;
      }
      const progress = elapsed / effect.duration;
      const point = this.projectedPoint.set(
        target?.x ?? effect.x,
        1.35 + progress * 0.65,
        target?.z ?? effect.z,
      ).project(this.camera);
      const rect = this.canvas.getBoundingClientRect();
      effect.element.style.left = `${(point.x + 1) * rect.width / 2}px`;
      effect.element.style.top = `${(1 - point.y) * rect.height / 2}px`;
      effect.element.style.opacity = String(1 - progress);
      effect.element.style.transform = `translate(-50%, ${-progress * 12}px)`;
    }

    for (let index = this.deathPuffs.length - 1; index >= 0; index -= 1) {
      const effect = this.deathPuffs[index];
      const progress = (now - effect.startTime) / effect.duration;
      if (progress >= 1) {
        this.removeDeathPuff(index);
        continue;
      }
      effect.group.scale.setScalar(0.7 + progress * 1.7);
      effect.group.position.y = progress * 0.2;
      effect.material.opacity = 0.68 * (1 - progress);
    }
    this.updateTransientEffects(world, now);
  }

  updateObjectiveVisual(world) {
    const objective = world.objective;
    const active = objective?.state === 'active' && objective.roomIndex === world.roomIndex;
    this.objectiveTargetMarker.hidden = true;
    this.objectiveWardMarker.hidden = true;
    if (this.objectivePillar) this.objectivePillar.visible = false;
    if (this.objectiveWardRing) this.objectiveWardRing.visible = false;
    if (this.objectiveChannelFill) this.objectiveChannelFill.visible = false;
    if (this.objectiveChannelRing) this.objectiveChannelRing.visible = false;
    if (!active) return;

    const room = world.arena.rooms?.[objective.roomIndex];
    const x = objective.x ?? 0;
    const z = objective.z ?? room?.centerZ ?? 0;
    if (objective.type === 'hunt') {
      const target = world.entities.find((entity) => entity.id === objective.targetId && !entity.dead);
      if (target) {
        const rect = this.canvas.getBoundingClientRect();
        const point = this.projectedPoint.set(target.x, 1.8, target.z).project(this.camera);
        this.objectiveTargetMarker.hidden = false;
        const markerWidth = this.objectiveTargetMarker.offsetWidth;
        const markerHeight = this.objectiveTargetMarker.offsetHeight;
        const projectedX = (point.x + 1) * rect.width / 2;
        const projectedY = (1 - point.y) * rect.height / 2;
        const left = Math.max(markerWidth / 2 + 8, Math.min(rect.width - markerWidth / 2 - 8, projectedX));
        const minTop = Math.max(markerHeight + 120, 146);
        const maxTop = Math.max(minTop, rect.height - 284);
        const top = Math.max(minTop, Math.min(maxTop, projectedY));
        this.objectiveTargetMarker.style.left = `${left}px`;
        this.objectiveTargetMarker.style.top = `${top}px`;
        this.objectiveTargetMarker.hidden = point.z < -1 || point.z > 1;
      }
      return;
    }

    if (objective.type === 'defend') {
      if (!this.objectivePillar) {
        const template = this.models.get('objective-pillar');
        if (template) {
          const bounds = this.modelBounds.get('assets/env/pillar.glb');
          const scale = 1.75 / (bounds?.y || 1.75);
          this.objectivePillar = template.clone(true);
          this.objectivePillar.scale.setScalar(scale);
          this.objectivePillar.updateMatrixWorld(true);
          const modelBounds = new THREE.Box3().setFromObject(this.objectivePillar);
          this.objectivePillar.position.y -= modelBounds.min.y;
          this.scene.add(this.objectivePillar);
        }
      }
      if (!this.objectiveWardRing) {
        const geometry = new THREE.RingGeometry(0.82, 0.95, 40);
        const material = new THREE.MeshBasicMaterial({
          color: 0x78d9ce,
          transparent: true,
          opacity: 0.76,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.objectiveWardRing = new THREE.Mesh(geometry, material);
        this.objectiveWardRing.rotation.x = -Math.PI / 2;
        this.objectiveWardRing.position.y = 0.055;
        this.objectiveWardRing.renderOrder = 2;
        this.scene.add(this.objectiveWardRing);
      }
      if (this.objectivePillar) {
        this.objectivePillar.position.x = x;
        this.objectivePillar.position.z = z;
        this.objectivePillar.visible = true;
      }
      this.objectiveWardRing.position.x = x;
      this.objectiveWardRing.position.z = z;
      this.objectiveWardRing.visible = true;
      this.objectiveWardRing.material.color.setHex(objective.hp / objective.maxHp < 0.35 ? 0xff706d : 0x78d9ce);
      const rect = this.canvas.getBoundingClientRect();
      const point = this.projectedPoint.set(x, 2.2, z).project(this.camera);
      const percent = THREE.MathUtils.clamp(objective.hp / objective.maxHp, 0, 1);
      this.objectiveWardMarker.style.left = `${(point.x + 1) * rect.width / 2}px`;
      this.objectiveWardMarker.style.top = `${(1 - point.y) * rect.height / 2}px`;
      this.objectiveWardMarker.querySelector('i b').style.width = `${percent * 100}%`;
      this.objectiveWardMarker.classList.toggle('is-critical', percent < 0.35);
      this.objectiveWardMarker.hidden = point.z < -1 || point.z > 1
        || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1;
      return;
    }

    if (objective.type === 'channel') {
      const radius = objective.radius;
      if (!this.objectiveChannelFill) {
        const geometry = new THREE.CircleGeometry(radius, 48);
        const material = new THREE.MeshBasicMaterial({
          color: 0xe5bd66,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.objectiveChannelFill = new THREE.Mesh(geometry, material);
        this.objectiveChannelFill.rotation.x = -Math.PI / 2;
        this.objectiveChannelFill.position.y = 0.025;
        this.objectiveChannelFill.renderOrder = 1;
        this.scene.add(this.objectiveChannelFill);
      }
      if (!this.objectiveChannelRing) {
        const geometry = new THREE.RingGeometry(radius - 0.12, radius, 48);
        const material = new THREE.MeshBasicMaterial({
          color: 0x91dfff,
          transparent: true,
          opacity: 0.82,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.objectiveChannelRing = new THREE.Mesh(geometry, material);
        this.objectiveChannelRing.rotation.x = -Math.PI / 2;
        this.objectiveChannelRing.position.y = 0.05;
        this.objectiveChannelRing.renderOrder = 2;
        this.scene.add(this.objectiveChannelRing);
      }
      const progress = THREE.MathUtils.clamp(objective.progress / objective.required, 0, 1);
      this.objectiveChannelFill.geometry.setDrawRange(0, Math.floor(progress * 48) * 3);
      const pulse = (Math.sin(performance.now() * 0.006) + 1) / 2;
      for (const mesh of [this.objectiveChannelFill, this.objectiveChannelRing]) {
        mesh.position.x = x;
        mesh.position.z = z;
        mesh.visible = true;
      }
      this.objectiveChannelFill.material.opacity = 0.16 + pulse * 0.18;
      this.objectiveChannelRing.material.opacity = 0.48 + pulse * 0.38;
    }
  }

  updatePartyMarkers(world) {
    const active = this.activePartyMarkers;
    active.clear();
    const rect = this.canvas.getBoundingClientRect();
    for (const player of world.entities) {
      if (player.kind !== 'player' || !world.localPlayerId || player.playerId === world.localPlayerId) continue;
      active.add(player.id);
      let marker = this.partyMarkers.get(player.id);
      if (!marker) {
        marker = document.createElement('div');
        marker.className = 'party-name-tag';
        marker.innerHTML = '<span></span><span class="revive-track"><i></i></span>';
        this.partyLayer.appendChild(marker);
        this.partyMarkers.set(player.id, marker);
      }
      marker.classList.toggle('downed', Boolean(player.downed));
      marker.querySelector('span').textContent = `${lineageDisplayName(player.name ?? player.playerId, player)} · Lv.${player.level ?? 1}`;
      marker.querySelector('.revive-track').hidden = !player.downed;
      marker.querySelector('.revive-track i').style.width = `${Math.min(100, (player.reviveProgress ?? 0) / 60 * 100)}%`;
      const point = this.projectedPoint.set(player.x, 2.1, player.z).project(this.camera);
      marker.style.left = `${(point.x + 1) * rect.width / 2}px`;
      marker.style.top = `${(1 - point.y) * rect.height / 2}px`;
      marker.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1;
    }
    for (const [id, marker] of this.partyMarkers) {
      if (active.has(id)) continue;
      marker.remove();
      this.partyMarkers.delete(id);
    }
  }

  updateEntityMaterials(entity, visual, now) {
    const predictedFlashUntil = this.predictedFlashUntil.get(entity.id) ?? 0;
    const predictedFlash = predictedFlashUntil > now;
    if (!predictedFlash && predictedFlashUntil) this.predictedFlashUntil.delete(entity.id);
    const hit = (entity.hitFlashTicks > 0 || predictedFlash) && !this.reducedMotion;
    const invulnerable = entity.invulnerable && !hit;
    for (const [material, original] of visual.materialState) {
      if (!material.emissive) continue;
      if (hit) {
        material.emissive.setHex(0xff5939);
        material.emissiveIntensity = 1.3;
      } else if (invulnerable) {
        material.emissive.setHex(0x6298c4);
        material.emissiveIntensity = 0.65;
      } else if (entity.kind === 'enemy' && (entity.slowTicks ?? 0) > 0) {
        material.emissive.setHex(0x9edfff);
        material.emissiveIntensity = 0.55;
      } else if (entity.evolved && entity.lineage !== 'human') {
        const color = { skeleton_knight: 0xc8463c, skeleton_archer: 0x4fae6a, skeleton_mage: 0x8a5ad6 }[entity.lineage];
        material.emissive.setHex(color);
        material.emissiveIntensity = 0.005;
      } else if (visual.partTints.has(material)) {
        const tint = visual.partTints.get(material);
        material.emissive.setHex(tint.hex);
        material.emissiveIntensity = tint.intensity;
      } else {
        material.emissive.copy(original.emissive);
        material.emissiveIntensity = original.emissiveIntensity;
      }
    }
  }

  removeEntityVisual(id, visual) {
    visual.mixer.stopAllAction();
    visual.mixer.uncacheRoot(visual.root);
    this.scene.remove(visual.root);
    for (const material of visual.materials) material.dispose();
    visual.shadow.geometry.dispose();
    visual.shadow.material.dispose();
    for (const resource of visual.lootResources) resource.dispose();
    this.entities.delete(id);
  }

  updateTelegraphs(world) {
    const active = this.activeTelegraphs;
    active.clear();
    for (const enemy of world.entities) {
      const shape = enemy.attackShape;
      if (enemy.kind !== 'enemy' || !shape || enemy.attackPhase !== 'windup') continue;
      active.add(enemy.id);
      let decal = this.telegraphs.get(enemy.id);
      const signature = JSON.stringify(shape);
      if (!decal || decal.signature !== signature) {
        if (decal) {
          this.scene.remove(decal.mesh);
          decal.mesh.traverse((node) => {
            node.geometry?.dispose();
            if (node.material) for (const material of [node.material].flat()) material.dispose();
          });
        }
        const group = new THREE.Group();
        const parts = [];
        const addPart = (geometry, type, x = 0, z = 0, scaleX = 1, hatchBounds = {}) => {
          const fillMaterial = new THREE.MeshBasicMaterial({
            color: 0xe84842,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            depthTest: true,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
            polygonOffsetUnits: -2,
            fog: false,
          });
          const fill = new THREE.Mesh(geometry, fillMaterial);
          fill.rotation.x = -Math.PI / 2;
          fill.position.set(x, 0.2, z);
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({ color: this.telegraphEmphasis ? 0xffe09a : 0xff7770, transparent: true, opacity: 0.96, depthTest: true, depthWrite: false, fog: false }),
          );
          outline.rotation.x = -Math.PI / 2;
          outline.position.set(x, 0.22, z);
          const hatch = new THREE.LineSegments(
            createTelegraphHatch(type, hatchBounds),
            new THREE.LineBasicMaterial({ color: 0xfff2c7, transparent: true, opacity: 0.82, depthTest: true, depthWrite: false, fog: false }),
          );
          hatch.rotation.x = -Math.PI / 2;
          hatch.position.set(x, 0.24, z);
          hatch.visible = this.telegraphEmphasis;
          group.add(fill, outline, hatch);
          parts.push({ fill, outline, hatch, type, scaleX });
        };
        const circleGeometry = (radius, sector = false) => (
          sector
            ? new THREE.CircleGeometry(radius, 48, -shape.halfAngle, shape.halfAngle * 2)
            : new THREE.CircleGeometry(radius, 48)
        );
        if (shape.type === 'sector') addPart(circleGeometry(shape.range, true), 'radial', 0, 0, 1, { radius: shape.range, halfAngle: shape.halfAngle });
        else if (shape.type === 'circle') {
          if (shape.innerRadius > 0) addPart(new THREE.RingGeometry(shape.innerRadius, shape.radius, 48), 'radial', 0, 0, 1, { radius: shape.radius, innerRadius: shape.innerRadius });
          else addPart(circleGeometry(shape.radius), 'radial', 0, 0, 1, { radius: shape.radius });
        } else if (shape.type === 'ring') {
          const innerRadius = shape.innerRadius ?? shape.radius * 0.66;
          addPart(new THREE.RingGeometry(innerRadius, shape.radius, 48), 'radial', 0, 0, 1, { radius: shape.radius, innerRadius });
        } else if (shape.type === 'annulus') {
          addPart(new THREE.RingGeometry(shape.innerRadius, shape.outerRadius, 48), 'radial', 0, 0, 1, { radius: shape.outerRadius, innerRadius: shape.innerRadius });
        } else if (shape.type === 'circles') {
          for (const circle of shape.circles ?? []) {
            const innerRadius = circle.innerRadius ?? 0;
            addPart(
              innerRadius > 0
                ? new THREE.RingGeometry(circle.innerRadius, circle.radius, 48)
                : circleGeometry(circle.radius),
              'radial',
              circle.x,
              circle.z,
              1,
              { radius: circle.radius, innerRadius },
            );
          }
        } else if (shape.type === 'line' || shape.type === 'rect') {
          const geometry = new THREE.PlaneGeometry(shape.length, shape.width);
          addPart(geometry, 'linear', shape.length / 2, 0, 1, { length: shape.length, width: shape.width });
        }
        group.renderOrder = 4;
        this.scene.add(group);
        decal = { mesh: group, shape, signature, parts };
        this.telegraphs.set(enemy.id, decal);
      }
      if (shape.type === 'circles') {
        decal.mesh.position.set(0, 0, 0);
        decal.mesh.rotation.y = 0;
      } else {
        decal.mesh.position.set(shape.originX, 0, shape.originZ);
        decal.mesh.rotation.y = ['line', 'rect', 'sector'].includes(shape.type) ? -shape.angle : 0;
      }
      if (shape.type === 'ring') decal.mesh.rotation.y = 0;
      const progress = THREE.MathUtils.clamp(1 - enemy.attackRemaining / Math.max(1, enemy.attackWindupTicks), 0, 1);
      for (const part of decal.parts) {
        if (part.type === 'linear') part.fill.scale.set(Math.max(0.001, progress), 1, 1);
        else part.fill.scale.setScalar(Math.max(0.001, progress));
        part.hatch.scale.copy(part.fill.scale);
      }
    }
    for (const [id, decal] of this.telegraphs) {
      if (!active.has(id)) {
        this.scene.remove(decal.mesh);
        decal.mesh.traverse((node) => {
          node.geometry?.dispose();
          if (node.material) for (const material of [node.material].flat()) material.dispose();
        });
        this.telegraphs.delete(id);
      }
    }
  }

  mobileVisibleArea(canvasRect) {
    let top = canvasRect.top;
    let bottom = canvasRect.bottom;
    let hasOverlay = false;
    let changed = false;
    for (const overlay of this.mobileOverlays) {
      const { element } = overlay;
      if (!element || (['hub-buttons', 'hub-hud', 'tutorial-card'].includes(overlay.id) && canvasRect.width >= 700)) {
        if (overlay.active) changed = true;
        overlay.active = false;
        continue;
      }
      const style = getComputedStyle(element);
      if (element.hidden || style.display === 'none' || style.visibility === 'hidden') {
        if (overlay.active) changed = true;
        overlay.active = false;
        continue;
      }
      const rect = element.getBoundingClientRect();
      const topOverlay = overlay.id === 'hub-hud';
      const overlaps = rect.height > 0
        && rect.width > 0
        && rect.left < canvasRect.right
        && rect.right > canvasRect.left
        && rect.top < canvasRect.bottom
        && (topOverlay
          ? rect.top < canvasRect.top + canvasRect.height / 2
          : rect.bottom > canvasRect.top + canvasRect.height / 2);
      const overlayTop = Math.round(rect.top);
      const height = Math.round(rect.height);
      if (overlay.active !== overlaps || overlay.top !== overlayTop || overlay.height !== height) changed = true;
      overlay.active = overlaps;
      overlay.top = overlayTop;
      overlay.height = height;
      if (overlaps) {
        hasOverlay = true;
        if (topOverlay) top = Math.max(top, rect.bottom);
        else bottom = Math.min(bottom, rect.top);
      }
    }
    if (!hasOverlay) {
      this.mobileVisibleAreaResult = null;
      return null;
    }
    const result = this.mobileVisibleAreaResult ??= { top: 0, bottom: 0, key: '' };
    result.top = top;
    result.bottom = bottom;
    if (changed) {
      let key = '';
      for (const overlay of this.mobileOverlays) {
        if (overlay.active) key += `${overlay.id}:${overlay.top}:${overlay.height}|`;
      }
      result.key = key;
    }
    return result;
  }

  mobileCameraShift(player, baseTargetZ, canvasRect, visibleArea) {
    if (!visibleArea) {
      this.mobileCameraOverlayKey = '';
      this.mobileCameraTargetShift = 0;
      this.mobileCameraTargetScreenY = null;
      return 0;
    }
    const desiredY = this.isHub
      ? THREE.MathUtils.clamp(
        (visibleArea.top + visibleArea.bottom) / 2,
        canvasRect.top + canvasRect.height * 0.52,
        canvasRect.top + canvasRect.height * 0.58,
      )
      : THREE.MathUtils.clamp(
        (visibleArea.top + visibleArea.bottom) / 2,
        canvasRect.top + canvasRect.height * 0.45,
        canvasRect.top + canvasRect.height * 0.5,
      );
    const overlayKey = `${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)}:${visibleArea.key}`;
    this.mobileCameraTargetScreenY = desiredY;
    if (overlayKey !== this.mobileCameraOverlayKey) {
      const visual = this.entities.get(player.id);
      if (visual) {
        const projectionCamera = this.projectionCamera.copy(this.camera);
        projectionCamera.position.set(0, this.cameraHeight, baseTargetZ + this.cameraOffsetZ);
        projectionCamera.lookAt(0, 0, baseTargetZ);
        projectionCamera.updateMatrixWorld(true);
        const center = this.mobileProjectedPoint.set(
          visual.root.position.x,
          visual.root.position.y + visual.screenCenterY,
          visual.root.position.z,
        ).project(projectionCamera);
        const screenY = canvasRect.top + (1 - center.y) * canvasRect.height / 2;
        const cameraUpZ = this.mobileCameraUp.set(0, 1, 0).applyQuaternion(projectionCamera.quaternion).z;
        const pixelsPerWorldUnit = canvasRect.height / this.frustumHeight;
        const pixelsPerTargetMeter = cameraUpZ * pixelsPerWorldUnit;
        this.mobileCameraTargetShift = Math.abs(pixelsPerTargetMeter) > 0.01
          ? (desiredY - screenY) / pixelsPerTargetMeter
          : 0;
      }
      this.mobileCameraOverlayKey = overlayKey;
    }
    return this.mobileCameraTargetShift;
  }

  updateOccluderFades(world, now) {
    if (!this.isForest && !this.isCastle) return;
    let player = null;
    for (const entity of world.entities) {
      if (entity.kind !== 'player') continue;
      if (entity.playerId === this.localPlayerId || entity.id === this.localPlayerId) {
        player = entity;
        break;
      }
      if (!player) player = entity;
    }
    if (!player) return;
    const visual = this.entities.get(player.id);
    this.camera.updateMatrixWorld(true);
    this.occlusionPlayerPoint.set(
      visual?.root.position.x ?? player.x,
      (visual?.root.position.y ?? 0) + (visual?.screenCenterY ?? 1),
      visual?.root.position.z ?? player.z,
    ).project(this.camera);
    const aspect = this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight);
    const playerRadiusX = 1 / (this.frustumHeight * aspect);
    const playerRadiusY = 1.4 / this.frustumHeight;
    for (const group of this.fadeGroups) {
      let changed = false;
      for (let index = 0; index < group.states.length; index += 1) {
        const state = group.states[index];
        const point = this.occlusionPropPoint.set(state.x, state.y, state.z).project(this.camera);
        const radiusX = 2 * state.radius / (this.frustumHeight * aspect);
        const radiusY = 2 * state.radius / this.frustumHeight;
        const overlaps = Math.abs(point.x - this.occlusionPlayerPoint.x) < radiusX + playerRadiusX
          && Math.abs(point.y - this.occlusionPlayerPoint.y) < radiusY + playerRadiusY
          && point.z < 1;
        if (updateOccluderOpacity(state, overlaps ? 0.25 : 1, now)) {
          for (const attribute of group.attributes) attribute.array[index] = state.opacity;
          changed = true;
        }
      }
      if (changed) for (const attribute of group.attributes) attribute.needsUpdate = true;
    }
    for (const object of this.fadeObjects) {
      const state = object.state;
      const point = this.occlusionPropPoint.set(state.x, state.y, state.z).project(this.camera);
      const radiusX = 2 * state.radius / (this.frustumHeight * aspect);
      const radiusY = 2 * state.radius / this.frustumHeight;
      const overlaps = Math.abs(point.x - this.occlusionPlayerPoint.x) < radiusX + playerRadiusX
        && Math.abs(point.y - this.occlusionPlayerPoint.y) < radiusY + playerRadiusY
        && point.z < 1;
      if (updateOccluderOpacity(state, overlaps ? 0.25 : 1, now)) {
        for (const material of object.materials) material.opacity = state.opacity;
      }
    }
  }

  projectWorldPosition(x, y, z) {
    this.camera.updateMatrixWorld(true);
    const point = this.projectedPoint.set(x, y, z).project(this.camera);
    const rect = this.canvas.getBoundingClientRect();
    return {
      left: (point.x + 1) * rect.width / 2,
      top: (1 - point.y) * rect.height / 2,
      visible: point.z >= -1 && point.z <= 1 && Math.abs(point.x) <= 1 && Math.abs(point.y) <= 1,
    };
  }

  render(previous, world, alpha) {
    const now = performance.now();
    const dt = Math.min(0.08, (now - this.lastRender) / 1000);
    this.lastRender = now;
    const quality = this.qualityController.recordFrame(dt * 1000);
    if (quality !== this.effectiveQuality) this.applyQualityPreset(quality);
    const localPlayer = world.entities.find((entity) => entity.kind === 'player' && (
      entity.playerId === this.localPlayerId || entity.id === this.localPlayerId
    ));
    this.outlineTargetId = localPlayer && !localPlayer.dead
      ? pickAimTarget(world, localPlayer, attackReach(localPlayer))?.id ?? null
      : null;
    this.updateAshParticles(dt, now);
    this.consumeEvents(world, now);
    for (const torch of this.torchLights) {
      torch.light.intensity = torch.base * (0.9 + Math.sin(now * 0.009 + torch.phase) * 0.055 + Math.sin(now * 0.023 + torch.phase * 1.7) * 0.035);
    }
    for (const door of this.doorVisuals) door.root.visible = !world.openDoors?.[door.doorId];
    this.averageMs = this.averageMs * 0.92 + dt * 1000 * 0.08;
    const hitstop = now < this.hitstopUntil;
    const before = this.previousEntities;
    before.clear();
    for (const entity of previous.entities) before.set(entity.id, entity);
    const activeIds = this.activeEntityIds;
    activeIds.clear();
    for (const entity of world.entities) {
      activeIds.add(entity.id);
      let visual = this.entities.get(entity.id);
      if (!visual) visual = this.createEntity(entity, world);
      if (entity.kind === 'player') {
        const modelKey = playerModelKey(entity);
        if (modelKey !== visual.modelKey) {
          this.removeEntityVisual(entity.id, visual);
          visual = this.createEntity(entity, world);
        }
        const lookKey = playerLookKey(entity.look);
        if (lookKey !== visual.lookKey) {
          visual.lookKey = lookKey;
          visual.partTints = applyPlayerLook(visual.root, entity.look);
        }
      }
      const old = before.get(entity.id) ?? entity;
      if (!hitstop) {
        visual.root.position.set(old.x + (entity.x - old.x) * alpha, 0, old.z + (entity.z - old.z) * alpha);
        const oldFacing = Number.isFinite(old.facing) ? old.facing : 0;
        const entityFacing = Number.isFinite(entity.facing) ? entity.facing : oldFacing;
        const facing = oldFacing + shortestAngleDelta(oldFacing, entityFacing) * alpha;
        visual.root.rotation.y = Math.PI / 2 - facing;
        this.updateAnimation(entity, visual, dt);
      }
      visual.root.visible = !entity.dead || entity.deathTicks > 0;
      visual.shadow.visible = !entity.dead;
      this.updateEntityOutlines(entity, visual, world);
      this.updateEntityMaterials(entity, visual, now);
    }
    for (const [id, visual] of this.entities) {
      if (!activeIds.has(id)) this.removeEntityVisual(id, visual);
    }
    this.updateTelegraphs(world);
    const player = world.entities.find((entity) => entity.kind === 'player');
    if (player) {
      const room = world.arena.rooms?.[world.roomIndex];
      const roomCenterZ = room?.centerZ ?? 0;
      const roomDepth = room ? world.arena.depth / Math.max(1, world.arena.rooms.length) : world.arena.depth;
      const minCameraZ = roomCenterZ - roomDepth / 2 + 1.6;
      const maxCameraZ = roomCenterZ + roomDepth / 2 - 1.6;
      const baseTargetZ = THREE.MathUtils.clamp(player.z - this.cameraFollowOffsetZ, minCameraZ, maxCameraZ);
      const canvasRect = this.canvas.getBoundingClientRect();
      const visibleArea = this.mobileVisibleArea(canvasRect);
      const targetShift = this.mobileCameraShift(player, baseTargetZ, canvasRect, visibleArea);
      const targetMinZ = minCameraZ + Math.min(0, targetShift);
      const targetMaxZ = maxCameraZ + Math.max(0, targetShift);
      const followAlpha = visibleArea ? 0.16 : 0.06;
      const targetZ = THREE.MathUtils.clamp(
        player.z - this.cameraFollowOffsetZ + targetShift,
        targetMinZ,
        targetMaxZ,
      );
      const halfViewWidth = (this.camera.right - this.camera.left) / 2;
      const roomHalfWidth = (room?.width ?? world.arena.width) / 2 + 1;
      const maxCameraX = Math.max(0, roomHalfWidth - halfViewWidth);
      const targetX = THREE.MathUtils.clamp(player.x, -maxCameraX, maxCameraX);
      this.camera.position.x += (targetX - this.camera.position.x) * followAlpha;
      this.camera.position.z += (targetZ + this.cameraOffsetZ - this.camera.position.z) * followAlpha;
      let shakeX = 0;
      let shakeZ = 0;
      if (!this.reducedMotion && now < this.shakeUntil) {
        const strength = (this.shakeUntil - now) / 110;
        shakeX = Math.sin(now * 0.11) * 0.08 * strength;
        shakeZ = Math.cos(now * 0.13) * 0.05 * strength;
      }
      this.camera.lookAt(this.camera.position.x + shakeX, 0, targetZ + shakeZ);
      this.updateWallFade(targetZ);
    }
    this.updateNpcHotspots(dt, world);
    this.updatePresentation(world, now);
    this.updateOccluderFades(world, now);
    this.updateDebugOverlays(world, now);
    this.renderer.render(this.scene, this.camera);
  }

  resizeCanvas() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const frustum = this.isHub
      ? Math.max(15, 8 / (width / height))
      : this.frustumHeight;
    this.frustumHeight = frustum;
    this.camera.left = -frustum * width / height / 2;
    this.camera.right = frustum * width / height / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.camera.updateProjectionMatrix();
    const pixelRatio = QUALITY_PRESETS[this.effectiveQuality]?.pixelRatio ?? 1.5;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, pixelRatio) * this.resolutionScale);
    this.renderer.setSize(width, height, false);
    this.updateOutlineUniforms();
  }

  getLoadedBytes() {
    return this.loadedBytes;
  }

  destroy() {
    this.resize.disconnect();
    for (const { root, mixer, action } of this.hubNpcs) {
      action?.stop();
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    }
    this.hubNpcs = [];
    this.npcLayer.remove();
    this.partyLayer.remove();
    this.partyMarkers.clear();
    for (const [id, visual] of this.entities) this.removeEntityVisual(id, visual);
    this.entities.clear();
    for (const material of this.outlineMaterials.values()) material.dispose();
    this.outlineMaterials.clear();
    for (const effect of this.slashes.values()) {
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.mesh.material.dispose();
    }
    this.slashes.clear();
    this.predictedFlashUntil.clear();
    this.transientEffects.forEach((effect) => {
      this.scene.remove(effect.mesh);
      effect.geometry.dispose();
      effect.material.dispose();
    });
    this.transientEffects = [];
    this.ashPoints = null;
    this.damageNumbers.forEach((effect) => effect.element.remove());
    this.damageNumbers = [];
    for (let index = this.deathPuffs.length - 1; index >= 0; index -= 1) this.removeDeathPuff(index);
    for (const decal of this.telegraphs.values()) {
      this.scene.remove(decal.mesh);
      decal.mesh.traverse((node) => {
        node.geometry?.dispose();
        if (node.material) for (const material of [node.material].flat()) material.dispose();
      });
    }
    this.telegraphs.clear();
    if (this.collisionOverlay) {
      this.scene.remove(this.collisionOverlay);
      const materials = new Set();
      this.collisionOverlay.traverse((node) => {
        node.geometry?.dispose();
        for (const material of [node.material].flat()) if (material) materials.add(material);
      });
      for (const material of materials) material.dispose();
      this.collisionOverlay = null;
    }
    this.debugEntityRings.clear();
    this.debugAttackLines.clear();
    this.debugDodgeRing = null;
    this.vfxLayer.remove();
    disposeSceneResources(this.scene);
    this.renderer.dispose();
  }
}
