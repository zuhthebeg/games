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

export class ArenaRenderer {
  constructor(canvas, onReady = () => {}) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x100e13);
    this.scene.fog = new THREE.Fog(0x100e13, 15, 33);
    this.camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 80);
    this.camera.position.set(0, 21, 21);
    this.camera.lookAt(0, 0, 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.scene.add(new THREE.HemisphereLight(0x6d7184, 0x211820, 2.1));
    const key = new THREE.DirectionalLight(0xffd7a0, 2.4);
    key.position.set(-5, 12, 8);
    this.scene.add(key);
    this.scene.add(new THREE.AmbientLight(0x6b5661, 0.45));
    this.entities = new Map();
    this.telegraphs = new Map();
    this.models = new Map();
    this.gltfs = new Map();
    this.clips = { humanoid: [], skeleton: [] };
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
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x29242d, roughness: 0.88 });
    for (const [x, z, sx, sz] of [[0, -12.3, 16.8, 0.6], [0, 12.3, 16.8, 0.6], [-8.3, 0, 0.6, 24.6], [8.3, 0, 0.6, 24.6]]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(sx, 3.2, sz), wallMaterial);
      wall.position.set(x, 1.5, z);
      this.scene.add(wall);
    }
    for (const obstacle of ARENA.obstacles) {
      const geometry = obstacle.type === 'circle'
        ? new THREE.CylinderGeometry(obstacle.radius, obstacle.radius, 2.4, 8)
        : new THREE.BoxGeometry(obstacle.width, 1.3, obstacle.depth);
      const prop = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0x51474a, roughness: 0.83 }));
      prop.position.set(obstacle.x, obstacle.type === 'circle' ? 1.15 : 0.62, obstacle.z);
      this.scene.add(prop);
    }
    for (const [x, z] of [[-6.8, -10.8], [6.8, -10.8], [-6.8, 10.8], [6.8, 10.8]]) {
      const light = new THREE.PointLight(0xff9c4b, 38, 8, 2);
      light.position.set(x, 2.6, z);
      this.scene.add(light);
      const flame = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffa35c }),
      );
      flame.position.copy(light.position);
      this.scene.add(flame);
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
    const entries = Object.entries(M0_MODELS);
    const loaded = await Promise.all(entries.map(async ([key, path]) => [key, await load(path)]));
    for (const [key, gltf] of loaded) this.models.set(key, gltf.scene);
    for (const [key, path] of [['humanoid', 'assets/anims/humanoid.glb'], ['skeleton', 'assets/anims/skeleton.glb']]) {
      const gltf = await load(path);
      this.clips[key] = gltf.animations;
    }
    const floor = await load('assets/env/floor_tile_large.glb');
    let tileMesh;
    floor.scene.traverse((node) => { if (!tileMesh && node.isMesh) tileMesh = node; });
    if (tileMesh) {
      const instances = new THREE.InstancedMesh(tileMesh.geometry, tileMesh.material, 24);
      const matrix = new THREE.Matrix4();
      let index = 0;
      for (let x = 0; x < 4; x += 1) {
        for (let z = 0; z < 6; z += 1) {
          matrix.makeTranslation(x * 4 - 6, 0, z * 4 - 10);
          instances.setMatrixAt(index++, matrix);
        }
      }
      this.scene.add(instances);
    }
    const placements = [
      ['assets/env/pillar.glb', -4.6, -4.1, 0], ['assets/env/pillar.glb', 4.6, -4.1, 0],
      ['assets/env/pillar.glb', -4.6, 4.1, 0], ['assets/env/pillar.glb', 4.6, 4.1, 0],
      ['assets/env/torch_lit.glb', -7.3, -10.8, 0], ['assets/env/torch_lit.glb', 7.3, -10.8, 0],
      ['assets/env/candle_lit.glb', -7.3, 10.8, 0], ['assets/env/candle_lit.glb', 7.3, 10.8, 0],
      ['assets/env/crates_stacked.glb', -6.5, -0.8, 0], ['assets/env/barrel_large.glb', 0, 10.3, 0],
      ['assets/env/banner_red.glb', 0, -11.2, Math.PI],
      ...[-6, -2, 2, 6].flatMap((x) => [['assets/env/wall.glb', x, -11.6, 0], ['assets/env/wall.glb', x, 11.6, Math.PI]]),
      ...[-8, -4, 0, 4, 8].flatMap((z) => [['assets/env/wall_half.glb', -7.6, z, Math.PI / 2], ['assets/env/wall_half.glb', 7.6, z, -Math.PI / 2]]),
      ['assets/env/wall_corner.glb', -7.6, -11.6, 0], ['assets/env/wall_corner.glb', 7.6, -11.6, Math.PI / 2],
      ['assets/env/wall_corner.glb', -7.6, 11.6, -Math.PI / 2], ['assets/env/wall_doorway.glb', 0, -11.6, 0],
      ['assets/env/floor_tile_large_rocks.glb', -5.5, -6.4, 0], ['assets/env/floor_tile_small.glb', 5.5, 6.4, 0],
    ];
    for (const [path, x, z, rotation] of placements) {
      const prop = SkeletonUtils.clone((await load(path)).scene);
      prop.position.set(x, 0, z);
      prop.rotation.y = rotation;
      this.scene.add(prop);
    }
  }

  createEntity(entity) {
    const key = entity.kind === 'player' ? entity.characterKind : entity.enemyKind;
    const modelKey = key === 'knight' ? 'knight' : key;
    const source = this.models.get(modelKey);
    const root = source ? SkeletonUtils.clone(source) : new THREE.Group();
    root.scale.setScalar(0.85);
    this.scene.add(root);
    const mixer = new THREE.AnimationMixer(root);
    const clips = entity.kind === 'player' ? this.clips.humanoid : [...this.clips.skeleton, ...this.clips.humanoid];
    const actions = new Map();
    for (const clip of clips) actions.set(clip.name, mixer.clipAction(clip));
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.52, 18),
      new THREE.MeshBasicMaterial({ color: 0x050408, transparent: true, opacity: 0.42, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.01;
    root.add(shadow);
    const visual = { root, mixer, actions, currentAction: null, currentName: '', shadow };
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
    const name = this.animationFor(entity);
    let action = visual.actions.get(name);
    if (!action && entity.kind === 'enemy') action = visual.actions.get(name.replace('_Skeletons', ''));
    if (!action) action = visual.actions.get(entity.kind === 'enemy' ? 'Idle_Combat' : 'Idle');
    if (action && visual.currentAction !== action) {
      if (visual.currentAction) visual.currentAction.fadeOut(0.12);
      action.reset().fadeIn(0.12).play();
      if (entity.attack && entity.attack.step <= COMBO_TIMELINES.length) {
        const timeline = COMBO_TIMELINES[entity.attack.step - 1];
        action.setDuration((timeline.windupTicks + timeline.activeTicks + timeline.recoveryTicks) / 30);
      }
      visual.currentAction = action;
      visual.currentName = name;
    }
    visual.mixer.update(Math.min(dt, 0.05));
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
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xe84842, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthTest: false, depthWrite: false, fog: false }));
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
      decal.mesh.scale.setScalar(Math.max(0.12, Math.min(1, progress)));
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
    this.averageMs = this.averageMs * 0.92 + dt * 1000 * 0.08;
    if (this.averageMs > 22 && this.resolutionScale > 0.7) {
      this.resolutionScale = Math.max(0.7, this.resolutionScale - 0.05);
      this.resizeCanvas();
    }
    const before = new Map(previous.entities.map((entity) => [entity.id, entity]));
    for (const entity of world.entities) {
      let visual = this.entities.get(entity.id);
      if (!visual) visual = this.createEntity(entity);
      const old = before.get(entity.id) ?? entity;
      visual.root.position.set(old.x + (entity.x - old.x) * alpha, 0, old.z + (entity.z - old.z) * alpha);
      visual.root.rotation.y = -entity.facing;
      visual.root.visible = !entity.dead || entity.deathTicks > 0;
      visual.shadow.visible = true;
      if (entity.invulnerable) visual.root.traverse((node) => { if (node.material) node.material.opacity = 0.75; });
      this.updateAnimation(entity, visual, dt);
    }
    this.updateTelegraphs(world);
    const player = world.entities.find((entity) => entity.kind === 'player');
    if (player) {
      const targetX = player.x;
      const targetZ = player.z + 1;
      this.camera.position.x += (targetX - this.camera.position.x) * 0.06;
      this.camera.position.z += (targetZ + 19 - this.camera.position.z) * 0.06;
      this.camera.lookAt(targetX, 0, targetZ);
    }
    this.renderer.render(this.scene, this.camera);
  }

  resizeCanvas() {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    const frustum = 14;
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
    for (const visual of this.entities.values()) {
      visual.mixer.stopAllAction();
      this.scene.remove(visual.root);
    }
    this.entities.clear();
    this.renderer.dispose();
  }
}
