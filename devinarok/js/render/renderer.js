import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ARENA } from '../sim/arena.js';
import { COMBO_TIMELINES } from '../sim/world.js';
import { ITEMS, RARITIES } from '../content/items.js';

const ASSET = (path) => new URL(`../../${path}`, import.meta.url).href;
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

export class ArenaRenderer {
  constructor(canvas, onReady = () => {}, arena = ARENA) {
    this.canvas = canvas;
    this.arena = arena;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x17141a);
    this.scene.fog = new THREE.Fog(0x17141a, 42, 78);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 80);
    this.camera.position.set(0, 15.5, 10.85);
    this.camera.lookAt(0, 0, 0);
    this.cameraHeight = 15.5;
    this.cameraOffsetZ = 10.85;
    this.cameraFollowOffsetZ = 8;
    this.frustumHeight = 19;
    this.mobileCameraOverlayKey = '';
    this.mobileCameraTargetShift = 0;
    this.mobileCameraTargetScreenY = null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.scene.add(new THREE.HemisphereLight(0xc5b6c8, 0x34242b, 1.05));
    const key = new THREE.DirectionalLight(0xffd6ad, 1.35);
    key.position.set(-4, 14, 5);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x786775, 0.3));
    this.entities = new Map();
    this.telegraphs = new Map();
    this.models = new Map();
    this.gltfs = new Map();
    this.clips = { humanoid: [], skeleton: [] };
    this.sideWalls = [];
    this.doorVisuals = [];
    this.seenEventIds = new Set();
    this.seenCastIds = new Set();
    this.slashes = new Map();
    this.damageNumbers = [];
    this.deathPuffs = [];
    this.torchLights = [];
    this.hubNpcs = [];
    this.hitstopUntil = 0;
    this.hitstopStartedAt = 0;
    this.shakeUntil = 0;
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
    this.lastRender = performance.now();
    this.averageMs = 16;
    this.resolutionScale = 1;
    this.loadedBytes = 0;
    this.buildRoom();
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(canvas);
    this.ready = this.loadAssets().then(onReady).catch((error) => {
      console.error('Devinarok assets failed to load', error);
      throw error;
    });
  }

  buildRoom() {
    const lightProps = this.arena.props.filter((prop) => (
      prop.model === 'assets/env/torch_lit.glb'
      || prop.model === 'assets/env/candle_lit.glb'
      || prop.model === 'assets/env/torch_mounted.glb'
    ));
    for (const prop of lightProps) {
      const light = new THREE.PointLight(0xffae63, prop.model.includes('candle') ? 7 : 13, prop.model.includes('candle') ? 4.5 : 8, 2);
      light.position.set(prop.x, prop.wallLight ? 2.7 : 2.1, prop.z);
      this.scene.add(light);
      this.torchLights.push({ light, phase: this.torchLights.length * 1.71, base: light.intensity });
    }
  }

  async loadAssets() {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    await MeshoptDecoder.ready;
    const load = async (path) => {
      if (!this.gltfs.has(path)) this.gltfs.set(path, loader.loadAsync(ASSET(path)));
      return this.gltfs.get(path);
    };
    const manifest = await fetch(ASSET('assets/manifest.json')).then((response) => response.json());
    this.loadedBytes = manifest.m1StageLoadedBytes?.[this.arena.id] ?? manifest.m0LoadedBytes;
    const propModels = [...new Set([
      ...this.arena.props.map((prop) => prop.model),
      ...(this.arena.npcs ?? []).map((npc) => M0_MODELS[npc.model]),
    ])];
    const modelPaths = [...new Set([...Object.values(M0_MODELS), ...propModels])];
    const loaded = await Promise.all(modelPaths.map(async (path) => [path, await load(path)]));
    const loadedByPath = new Map(loaded);
    for (const [key, path] of Object.entries(M0_MODELS)) this.models.set(key, loadedByPath.get(path).scene);
    for (const [key, path] of [['humanoid', 'assets/anims/humanoid.glb'], ['skeleton', 'assets/anims/skeleton.glb']]) {
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
        rotation.makeRotationY(prop.rotY);
        const scale = new THREE.Matrix4().makeScale(prop.scaleX ?? prop.scale ?? 1, prop.scaleY ?? prop.scale ?? 1, prop.scaleZ ?? prop.scale ?? 1);
        matrix.multiplyMatrices(translation, rotation).multiply(scale).multiply(tileMesh.matrixWorld);
        instances.setMatrixAt(index, matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      const materials = Array.isArray(material) ? material : [material];
      for (const item of materials) {
        if (item.color) item.color.multiplyScalar(path.includes('wood') ? 0.84 : 0.76);
      }
      this.scene.add(instances);
    }
    for (const placement of this.arena.props) {
      if (instancedModels.has(placement.model)) continue;
      const prop = SkeletonUtils.clone(loadedByPath.get(placement.model).scene);
      prop.position.set(placement.x, 0, placement.z);
      prop.rotation.y = placement.rotY;
      prop.scale.set(
        placement.scaleX ?? placement.scale ?? 1,
        placement.scaleY ?? placement.scale ?? 1,
        placement.scaleZ ?? placement.scale ?? 1,
      );
      if (placement.wallSide) {
        const materials = cloneMaterials(prop);
        for (const material of materials) {
          material.transparent = true;
          material.depthWrite = false;
        }
        this.sideWalls.push({ z: placement.wallCenterZ, materials });
      }
      if (placement.doorId) this.doorVisuals.push({ doorId: placement.doorId, root: prop });
      this.scene.add(prop);
    }
    this.createHubNpcs(loadedByPath);
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
      button.textContent = npc.name;
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

  updateNpcHotspots(dt) {
    const rect = this.canvas.getBoundingClientRect();
    for (const { npc, root, mixer, button } of this.hubNpcs) {
      mixer.update(Math.min(dt, 0.05));
      const point = new THREE.Vector3(npc.x, 2.2, npc.z).project(this.camera);
      button.style.left = `${(point.x + 1) * rect.width / 2}px`;
      button.style.top = `${(1 - point.y) * rect.height / 2}px`;
      button.hidden = point.z < -1 || point.z > 1 || Math.abs(point.x) > 1.1 || Math.abs(point.y) > 1.1;
      root.visible = point.z >= -1 && point.z <= 1;
    }
  }

  createEntity(entity) {
    const key = entity.kind === 'player' ? entity.characterKind : entity.model ?? entity.enemyKind;
    const modelKey = key === 'knight' ? 'knight' : key;
    const source = this.models.get(modelKey);
    const root = source ? SkeletonUtils.clone(source) : new THREE.Group();
    const materials = cloneMaterials(root);
    root.scale.setScalar(entity.modelScale ?? (entity.kind === 'loot' ? 1 : 0.95));
    const modelBounds = entity.kind === 'player' ? new THREE.Box3().setFromObject(root) : null;
    const screenCenterY = modelBounds && !modelBounds.isEmpty()
      ? (modelBounds.min.y + modelBounds.max.y) / 2
      : 0.9;
    const lootResources = [];
    if (entity.kind === 'loot') {
      const beamGeometry = new THREE.CylinderGeometry(0.035, 0.16, 1.25, 8, 1, true);
      const beamMaterial = new THREE.MeshBasicMaterial({ color: entity.item?.rarity === 'legendary' ? 0xff8b38 : entity.item?.rarity === 'rare' ? 0xf0c64f : entity.item?.rarity === 'magic' ? 0x6388ff : 0x70d8ef, transparent: true, opacity: 0.72, depthWrite: false });
      const beam = new THREE.Mesh(
        beamGeometry,
        beamMaterial,
      );
      lootResources.push(beamGeometry, beamMaterial);
      beam.position.y = 0.75;
      root.add(beam);
      const orbGeometry = new THREE.OctahedronGeometry(0.22, 0);
      const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xffdf94 });
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
      labelContext.fillStyle = entity.lootType === 'gold' ? '#f5d17d' : '#ffffff';
      labelContext.fillText(entity.lootType === 'gold' ? `+${entity.gold} G` : ITEMS[entity.item?.itemId]?.name ?? `${RARITIES[entity.item?.rarity]?.name ?? '장비'} 아이템`, 160, 42);
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
    };
    this.entities.set(entity.id, visual);
    return visual;
  }

  animationFor(entity) {
    if (entity.dead) return entity.kind === 'enemy' ? 'Death_C_Skeletons' : 'Death_A';
    if (entity.spawnTicksLeft > 0) return 'Spawn_Ground_Skeletons';
    if (entity.dodgeTicks > 0) return 'Dodge_Forward';
    if (entity.kind === 'player' && entity.attack?.step) {
      const clips = ['1H_Melee_Attack_Slice_Diagonal', '1H_Melee_Attack_Slice_Horizontal', '1H_Melee_Attack_Chop'];
      return clips[entity.attack.step - 1];
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
    if (!event.castId || this.seenCastIds.has(event.castId)) return;
    this.seenCastIds.add(event.castId);
    const skillId = event.skill;
    const timeline = COMBO_TIMELINES[event.step - 1];
    const duration = skillId === 1 ? 6 : skillId === 2 ? 6 : skillId === 3 ? 45 : timeline?.activeTicks;
    if (!duration) return;
    const points = [];
    if (skillId === 1) {
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
    const curve = new THREE.CatmullRomCurve3(points, skillId === 1);
    const geometry = new THREE.TubeGeometry(curve, skillId === 1 ? 40 : 28, skillId === 3 ? 0.085 : skillId === 1 ? 0.05 : 0.065, 6, skillId === 1);
    const material = new THREE.MeshBasicMaterial({
      color: skillId === 3 ? 0x8bd3ff : skillId === 1 ? 0xffce73 : 0xff8b43,
      transparent: true,
      opacity: 0.96,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 2;
    mesh.visible = false;
    this.scene.add(mesh);
    const startTick = event.tick + (timeline?.windupTicks ?? (skillId === 1 ? 5 : 0));
    this.slashes.set(event.castId, {
      castId: event.castId,
      entityId: event.entityId,
      startTick,
      endTick: startTick + duration,
      facing: this.worldEntity(event.entityId)?.facing ?? 0,
      mesh,
    });
  }

  worldEntity(entityId) {
    return this.currentWorld?.entities.find((entity) => entity.id === entityId);
  }

  createDamageNumber(event) {
    if (event.damage <= 0) return;
    const element = document.createElement('span');
    element.className = 'damage-number';
    element.textContent = `−${event.damage}`;
    this.vfxLayer.appendChild(element);
    this.damageNumbers.push({
      element,
      targetId: event.targetId,
      startTime: performance.now(),
      duration: 850,
    });
    while (this.damageNumbers.length > 24) this.removeDamageNumber(0);
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

  consumeEvents(world, now) {
    this.currentWorld = world;
    for (const event of world.events) {
      if (this.seenEventIds.has(event.eventId)) continue;
      this.seenEventIds.add(event.eventId);
      if (event.type === 'cast') this.createSlash(event);
      if (event.type === 'hit') {
        this.createDamageNumber(event);
        if (event.damage > 0) {
          if (!this.reducedMotion) {
            if (this.hitstopUntil <= now) this.hitstopStartedAt = now;
            this.hitstopUntil = Math.min(this.hitstopStartedAt + 60, Math.max(this.hitstopUntil, now + 55));
          }
          const target = world.entities.find((entity) => entity.id === event.targetId);
          if (target?.kind === 'player' && !this.reducedMotion) this.shakeUntil = now + 110;
        }
      }
      if (event.type === 'death') this.createDeathPuff(event, world);
    }
    while (this.seenEventIds.size > 512) this.seenEventIds.delete(this.seenEventIds.values().next().value);
    while (this.seenCastIds.size > 256) this.seenCastIds.delete(this.seenCastIds.values().next().value);
  }

  updatePresentation(world, now) {
    this.updatePartyMarkers(world);
    for (const [castId, effect] of this.slashes) {
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
        this.scene.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        this.slashes.delete(castId);
      }
    }

    for (let index = this.damageNumbers.length - 1; index >= 0; index -= 1) {
      const effect = this.damageNumbers[index];
      const elapsed = now - effect.startTime;
      if (elapsed >= effect.duration) {
        this.removeDamageNumber(index);
        continue;
      }
      const target = world.entities.find((entity) => entity.id === effect.targetId);
      if (!target) {
        this.removeDamageNumber(index);
        continue;
      }
      const progress = elapsed / effect.duration;
      const point = new THREE.Vector3(target.x, 1.35 + progress * 0.65, target.z).project(this.camera);
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
  }

  updatePartyMarkers(world) {
    const active = new Set();
    const rect = this.canvas.getBoundingClientRect();
    for (const player of world.entities.filter((entity) => (
      entity.kind === 'player' && entity.playerId !== world.localPlayerId
    ))) {
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
      marker.querySelector('span').textContent = `${player.name ?? player.playerId} · Lv.${player.level ?? 1}`;
      marker.querySelector('.revive-track').hidden = !player.downed;
      marker.querySelector('.revive-track i').style.width = `${Math.min(100, (player.reviveProgress ?? 0) / 60 * 100)}%`;
      const point = new THREE.Vector3(player.x, 2.1, player.z).project(this.camera);
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

  updateEntityMaterials(entity, visual) {
    const hit = entity.hitFlashTicks > 0;
    const invulnerable = entity.invulnerable && !hit;
    for (const [material, original] of visual.materialState) {
      if (!material.emissive) continue;
      if (hit) {
        material.emissive.setHex(0xff5939);
        material.emissiveIntensity = 1.3;
      } else if (invulnerable) {
        material.emissive.setHex(0x6298c4);
        material.emissiveIntensity = 0.65;
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
    const active = new Set();
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
        const addPart = (geometry, type, x = 0, z = 0, scaleX = 1) => {
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
          fill.position.set(x, 0.025, z);
          const outline = new THREE.LineSegments(
            new THREE.EdgesGeometry(geometry),
            new THREE.LineBasicMaterial({ color: 0xff7770, transparent: true, opacity: 0.96, depthTest: true, depthWrite: false, fog: false }),
          );
          outline.rotation.x = -Math.PI / 2;
          outline.position.set(x, 0.035, z);
          group.add(fill, outline);
          parts.push({ fill, outline, type, scaleX });
        };
        const circleGeometry = (radius, sector = false) => (
          sector
            ? new THREE.CircleGeometry(radius, 48, -shape.halfAngle, shape.halfAngle * 2)
            : new THREE.CircleGeometry(radius, 48)
        );
        if (shape.type === 'sector') addPart(circleGeometry(shape.range, true), 'radial');
        else if (shape.type === 'circle') {
          if (shape.innerRadius > 0) addPart(new THREE.RingGeometry(shape.innerRadius, shape.radius, 48), 'radial');
          else addPart(circleGeometry(shape.radius), 'radial');
        } else if (shape.type === 'ring') {
          addPart(new THREE.RingGeometry(shape.innerRadius ?? shape.radius * 0.66, shape.radius, 48), 'radial');
        } else if (shape.type === 'circles') {
          for (const circle of shape.circles ?? []) {
            addPart(
              circle.innerRadius > 0
                ? new THREE.RingGeometry(circle.innerRadius, circle.radius, 48)
                : circleGeometry(circle.radius),
              'radial',
              circle.x,
              circle.z,
            );
          }
        } else if (shape.type === 'line') {
          const geometry = new THREE.PlaneGeometry(shape.length, shape.width);
          addPart(geometry, 'linear', shape.length / 2, 0);
        }
        group.renderOrder = 0;
        this.scene.add(group);
        decal = { mesh: group, shape, signature, parts };
        this.telegraphs.set(enemy.id, decal);
      }
      if (shape.type === 'circles') {
        decal.mesh.position.set(0, 0, 0);
        decal.mesh.rotation.y = 0;
      } else {
        decal.mesh.position.set(shape.originX, 0, shape.originZ);
        decal.mesh.rotation.y = shape.type === 'line' || shape.type === 'sector' ? -shape.angle : 0;
      }
      if (shape.type === 'ring') decal.mesh.rotation.y = 0;
      const progress = THREE.MathUtils.clamp(1 - enemy.attackRemaining / Math.max(1, enemy.attackWindupTicks), 0, 1);
      for (const part of decal.parts) {
        if (part.type === 'linear') part.fill.scale.set(Math.max(0.001, progress), 1, 1);
        else part.fill.scale.setScalar(Math.max(0.001, progress));
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
    const elements = [['controls', this.canvas.ownerDocument.querySelector('#controls')]];
    if (canvasRect.width < 700) {
      elements.push(['hub-buttons', this.canvas.ownerDocument.querySelector('#hub-ui:not([hidden]) .hub-hotspots')]);
    }
    const overlays = elements.flatMap(([id, element]) => {
      if (!element || element.hidden) return [];
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return [];
      const rect = element.getBoundingClientRect();
      const overlaps = rect.height > 0
        && rect.width > 0
        && rect.left < canvasRect.right
        && rect.right > canvasRect.left
        && rect.top < canvasRect.bottom
        && rect.bottom > canvasRect.top + canvasRect.height / 2;
      return overlaps ? [{ id, rect }] : [];
    });
    if (!overlays.length) return null;
    const bottom = Math.min(canvasRect.bottom, ...overlays.map(({ rect }) => rect.top));
    return {
      top: canvasRect.top,
      bottom,
      key: overlays.map(({ id, rect }) => `${id}:${Math.round(rect.top)}:${Math.round(rect.height)}`).join('|'),
    };
  }

  mobileCameraShift(player, baseTargetZ, canvasRect, visibleArea) {
    if (!visibleArea) {
      this.mobileCameraOverlayKey = '';
      this.mobileCameraTargetShift = 0;
      this.mobileCameraTargetScreenY = null;
      return 0;
    }
    const desiredY = THREE.MathUtils.clamp(
      (visibleArea.top + visibleArea.bottom) / 2,
      canvasRect.top + canvasRect.height * 0.45,
      canvasRect.top + canvasRect.height * 0.5,
    );
    const overlayKey = `${Math.round(canvasRect.width)}x${Math.round(canvasRect.height)}:${visibleArea.key}`;
    this.mobileCameraTargetScreenY = desiredY;
    if (overlayKey !== this.mobileCameraOverlayKey) {
      const visual = this.entities.get(player.id);
      if (visual) {
        const projectionCamera = this.camera.clone();
        projectionCamera.position.set(0, this.cameraHeight, baseTargetZ + this.cameraOffsetZ);
        projectionCamera.lookAt(0, 0, baseTargetZ);
        projectionCamera.updateMatrixWorld(true);
        const center = new THREE.Vector3(
          visual.root.position.x,
          visual.root.position.y + visual.screenCenterY,
          visual.root.position.z,
        ).project(projectionCamera);
        const screenY = canvasRect.top + (1 - center.y) * canvasRect.height / 2;
        const cameraUpZ = new THREE.Vector3(0, 1, 0).applyQuaternion(projectionCamera.quaternion).z;
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

  render(previous, world, alpha) {
    const now = performance.now();
    const dt = Math.min(0.08, (now - this.lastRender) / 1000);
    this.lastRender = now;
    this.consumeEvents(world, now);
    for (const torch of this.torchLights) {
      torch.light.intensity = torch.base * (0.9 + Math.sin(now * 0.009 + torch.phase) * 0.055 + Math.sin(now * 0.023 + torch.phase * 1.7) * 0.035);
    }
    for (const door of this.doorVisuals) door.root.visible = !world.openDoors?.[door.doorId];
    this.averageMs = this.averageMs * 0.92 + dt * 1000 * 0.08;
    if (this.averageMs > 22 && this.resolutionScale > 0.7) {
      this.resolutionScale = Math.max(0.7, this.resolutionScale - 0.05);
      this.resizeCanvas();
    }
    const hitstop = now < this.hitstopUntil;
    const before = new Map(previous.entities.map((entity) => [entity.id, entity]));
    const activeIds = new Set();
    for (const entity of world.entities) {
      activeIds.add(entity.id);
      let visual = this.entities.get(entity.id);
      if (!visual) visual = this.createEntity(entity);
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
      this.updateEntityMaterials(entity, visual);
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
    this.updateNpcHotspots(dt);
    this.updatePresentation(world, now);
    this.renderer.render(this.scene, this.camera);
  }

  resizeCanvas() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const frustum = this.frustumHeight;
    this.camera.left = -frustum * width / height / 2;
    this.camera.right = frustum * width / height / 2;
    this.camera.top = frustum / 2;
    this.camera.bottom = -frustum / 2;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2) * this.resolutionScale);
    this.renderer.setSize(width, height, false);
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
    for (const effect of this.slashes.values()) {
      this.scene.remove(effect.mesh);
      effect.mesh.geometry.dispose();
      effect.mesh.material.dispose();
    }
    this.slashes.clear();
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
    this.vfxLayer.remove();
    disposeSceneResources(this.scene);
    this.renderer.dispose();
  }
}
