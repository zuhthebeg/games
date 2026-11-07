import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { ARENA } from '../sim/arena.js';
import { COMBO_TIMELINES } from '../sim/world.js';

const ASSET = (path) => new URL(`../../${path}`, import.meta.url).href;
const M0_MODELS = {
  knight: 'assets/chars/Knight.glb',
  Skeleton_Minion: 'assets/chars/Skeleton_Minion.glb',
  Skeleton_Warrior: 'assets/chars/Skeleton_Warrior.glb',
};

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
  constructor(canvas, onReady = () => {}) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x17141a);
    this.scene.fog = new THREE.Fog(0x17141a, 34, 58);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 80);
    this.camera.position.set(0, 16, 11.2);
    this.camera.lookAt(0, 0, 0);
    this.cameraOffsetZ = 11.2;
    this.frustumHeight = 11;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene.add(new THREE.HemisphereLight(0xbeb0c0, 0x493438, 1.45));
    const key = new THREE.DirectionalLight(0xffd9ab, 1.8);
    key.position.set(-4, 14, 5);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x6f5660, 0.38));
    this.entities = new Map();
    this.telegraphs = new Map();
    this.models = new Map();
    this.gltfs = new Map();
    this.clips = { humanoid: [], skeleton: [] };
    this.sideWalls = [];
    this.seenEventIds = new Set();
    this.seenCastIds = new Set();
    this.slashes = new Map();
    this.damageNumbers = [];
    this.deathPuffs = [];
    this.hitstopUntil = 0;
    this.hitstopStartedAt = 0;
    this.shakeUntil = 0;
    this.enemyClipPreview = null;
    this.reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    this.vfxLayer = document.createElement('div');
    this.vfxLayer.className = 'combat-vfx-layer';
    canvas.parentElement?.appendChild(this.vfxLayer);
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
    const lightProps = ARENA.props.filter((prop) => (
      prop.model === 'assets/env/torch_lit.glb' || prop.model === 'assets/env/candle_lit.glb'
    ));
    for (const prop of lightProps) {
      const light = new THREE.PointLight(0xffac68, 28, 8, 2);
      light.position.set(prop.x, 2.4, prop.z);
      this.scene.add(light);
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
    this.loadedBytes = manifest.m0LoadedBytes;
    const propModels = [...new Set(ARENA.props.map((prop) => prop.model))];
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
    ]);
    for (const path of instancedModels) {
      const gltf = loadedByPath.get(path);
      gltf.scene.updateMatrixWorld(true);
      let tileMesh;
      gltf.scene.traverse((node) => { if (!tileMesh && node.isMesh) tileMesh = node; });
      if (!tileMesh) continue;
      const tileProps = ARENA.props.filter((prop) => prop.model === path);
      const material = Array.isArray(tileMesh.material)
        ? tileMesh.material.map((source) => source.clone())
        : tileMesh.material.clone();
      const instances = new THREE.InstancedMesh(tileMesh.geometry, material, tileProps.length);
      const translation = new THREE.Matrix4();
      const rotation = new THREE.Matrix4();
      const matrix = new THREE.Matrix4();
      tileProps.forEach((prop, index) => {
        translation.makeTranslation(prop.x, 0, prop.z);
        rotation.makeRotationY(prop.rotY);
        matrix.multiplyMatrices(translation, rotation).multiply(tileMesh.matrixWorld);
        instances.setMatrixAt(index, matrix);
      });
      instances.instanceMatrix.needsUpdate = true;
      const materials = Array.isArray(material) ? material : [material];
      for (const item of materials) {
        if (item.color) item.color.multiplyScalar(0.98);
      }
      this.scene.add(instances);
    }
    for (const placement of ARENA.props) {
      if (instancedModels.has(placement.model)) continue;
      const prop = SkeletonUtils.clone(loadedByPath.get(placement.model).scene);
      prop.position.set(placement.x, 0, placement.z);
      prop.rotation.y = placement.rotY;
      if (placement.wallSide) {
        const materials = cloneMaterials(prop);
        for (const material of materials) {
          material.transparent = true;
          material.depthWrite = false;
        }
        this.sideWalls.push({ z: placement.wallCenterZ, materials });
      }
      this.scene.add(prop);
    }
  }

  updateWallFade(playerZ) {
    for (const wall of this.sideWalls) {
      const ahead = wall.z - playerZ;
      const opacity = THREE.MathUtils.clamp(1 - Math.max(0, ahead + 1) * 0.28, 0.16, 1);
      for (const material of wall.materials) material.opacity = opacity;
    }
  }

  createEntity(entity) {
    const key = entity.kind === 'player' ? entity.characterKind : entity.enemyKind;
    const modelKey = key === 'knight' ? 'knight' : key;
    const source = this.models.get(modelKey);
    const root = source ? SkeletonUtils.clone(source) : new THREE.Group();
    const materials = cloneMaterials(root);
    root.scale.setScalar(0.85);
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
    };
    this.entities.set(entity.id, visual);
    return visual;
  }

  animationFor(entity) {
    if (entity.dead) return entity.kind === 'enemy' ? 'Death_C_Skeletons' : 'Death_A';
    if (entity.spawnTicksLeft > 0) return 'Spawn_Ground_Skeletons';
    if (entity.dodgeTicks > 0) return 'Dodge_Forward';
    if (entity.attack) {
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
    const timeline = COMBO_TIMELINES[event.step - 1];
    if (!timeline) return;
    const points = [];
    for (let index = 0; index <= 24; index += 1) {
      const angle = -0.95 + (index / 24) * 1.9;
      points.push(new THREE.Vector3(Math.cos(angle) * 1.1, 0, Math.sin(angle) * 1.1));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.TubeGeometry(curve, 28, 0.065, 6, false);
    const material = new THREE.MeshBasicMaterial({
      color: 0xff8b43,
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
    const startTick = event.tick + timeline.windupTicks;
    this.slashes.set(event.castId, {
      castId: event.castId,
      entityId: event.entityId,
      startTick,
      endTick: startTick + timeline.activeTicks,
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
    this.entities.delete(id);
  }

  updateTelegraphs(world) {
    const active = new Set();
    for (const enemy of world.entities) {
      const shape = enemy.attackShape;
      if (enemy.kind !== 'enemy' || !shape || enemy.attackPhase !== 'windup') continue;
      active.add(enemy.id);
      let decal = this.telegraphs.get(enemy.id);
      if (!decal) {
        const geometry = new THREE.CircleGeometry(shape.range, 24, -shape.halfAngle, shape.halfAngle * 2);
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xe84842, transparent: true, opacity: 0.68, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.y = 0.08;
        mesh.renderOrder = 1;
        this.scene.add(mesh);
        decal = { mesh, shape, maxTicks: enemy.attackWindupTicks };
        this.telegraphs.set(enemy.id, decal);
      }
      decal.mesh.position.set(shape.originX, 0.08, shape.originZ);
      decal.mesh.rotation.set(-Math.PI / 2, 0, -shape.angle);
      const progress = 1 - enemy.attackRemaining / Math.max(1, enemy.attackWindupTicks);
      decal.mesh.scale.setScalar(0.22 + Math.max(0, Math.min(1, progress)) * 0.78);
    }
    for (const [id, decal] of this.telegraphs) {
      if (!active.has(id)) {
        this.scene.remove(decal.mesh);
        decal.mesh.geometry.dispose();
        decal.mesh.material.dispose();
        this.telegraphs.delete(id);
      }
    }
  }

  render(previous, world, alpha) {
    const now = performance.now();
    const dt = Math.min(0.08, (now - this.lastRender) / 1000);
    this.lastRender = now;
    this.consumeEvents(world, now);
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
        const facing = old.facing + shortestAngleDelta(old.facing, entity.facing) * alpha;
        visual.root.rotation.y = -facing;
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
      const targetX = player.x;
      const targetZ = player.z - 0.6;
      this.camera.position.x += (targetX - this.camera.position.x) * 0.06;
      this.camera.position.z += (targetZ + this.cameraOffsetZ - this.camera.position.z) * 0.06;
      let shakeX = 0;
      let shakeZ = 0;
      if (!this.reducedMotion && now < this.shakeUntil) {
        const strength = (this.shakeUntil - now) / 110;
        shakeX = Math.sin(now * 0.11) * 0.08 * strength;
        shakeZ = Math.cos(now * 0.13) * 0.05 * strength;
      }
      this.camera.lookAt(targetX + shakeX, 0, targetZ + shakeZ);
      this.updateWallFade(targetZ);
    }
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
      decal.mesh.geometry.dispose();
      decal.mesh.material.dispose();
    }
    this.telegraphs.clear();
    this.vfxLayer.remove();
    this.renderer.dispose();
  }
}
