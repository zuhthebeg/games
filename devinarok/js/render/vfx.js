import * as THREE from 'three';
import { FixedPool, particleLimitForQuality } from './vfx-pool.js';

export const PARTICLE_CELLS = Object.freeze({
  circle_05: 0,
  flare_01: 1,
  fire_01: 2,
  flame_04: 3,
  flame_05: 4,
  smoke_07: 5,
  spark_04: 6,
  star_07: 7,
  scorch_02: 8,
  dirt_02: 9,
  magic_02: 10,
  magic_01: 11,
  twirl_02: 12,
  trace_05: 13,
  slash_02: 14,
  circle_03: 15,
});

export const VFX_PRESETS = Object.freeze({
  ember: { cell: 'fire_01', blend: 'additive', color: 0xff7828, lifeMs: 720, startSize: 0.34, endSize: 0.04, gravity: 4.5, drag: 0.8, upward: [0.8, 3.2] },
  flame: { cell: 'flame_04', blend: 'additive', color: 0xff6724, lifeMs: 620, startSize: 0.52, endSize: 0.08, gravity: -1.1, drag: 0.9, upward: [0.8, 2.1] },
  wisp: { cell: 'flame_05', blend: 'additive', color: 0xff8d42, lifeMs: 820, startSize: 0.38, endSize: 0.16, gravity: -0.45, drag: 0.45, upward: [0.35, 1.2] },
  spark: { cell: 'spark_04', blend: 'additive', color: 0xffe39b, lifeMs: 420, startSize: 0.24, endSize: 0.015, gravity: 5.2, drag: 1.2, upward: [0.4, 2.8] },
  star: { cell: 'star_07', blend: 'additive', color: 0xfff2c4, lifeMs: 560, startSize: 0.3, endSize: 0.035, gravity: 1.1, drag: 0.8, upward: [0.5, 2.4] },
  smoke: { cell: 'smoke_07', blend: 'normal', color: 0x51454b, lifeMs: 1200, startSize: 0.52, endSize: 1.25, gravity: -0.18, drag: 0.35, upward: [0.15, 0.65] },
  darkSmoke: { cell: 'smoke_07', blend: 'normal', color: 0x283b32, lifeMs: 1000, startSize: 0.48, endSize: 0.96, gravity: -0.15, drag: 0.4, upward: [0.15, 0.6] },
  dirt: { cell: 'dirt_02', blend: 'normal', color: 0x8b6944, lifeMs: 780, startSize: 0.24, endSize: 0.07, gravity: 7.8, drag: 0.5, upward: [1.2, 4.4] },
  bone: { cell: 'star_07', blend: 'additive', color: 0xe8e2cc, lifeMs: 650, startSize: 0.26, endSize: 0.05, gravity: 2.2, drag: 0.45, upward: [0.7, 2.2] },
  ice: { cell: 'trace_05', blend: 'additive', color: 0x9de6ff, lifeMs: 600, startSize: 0.16, endSize: 0.02, gravity: 3.3, drag: 0.45, stretch: 5, upward: [0.2, 1.1] },
  poison: { cell: 'circle_05', blend: 'additive', color: 0x80e84a, lifeMs: 650, startSize: 0.18, endSize: 0.03, gravity: -0.25, drag: 0.65, upward: [0.15, 1.0] },
  rainStreak: { cell: 'trace_05', blend: 'additive', color: 0xb4e5ff, lifeMs: 500, startSize: 0.15, endSize: 0.035, gravity: 0, drag: 0, stretch: 6, velocity: { x: 0, y: -16, z: 0 }, landing: true },
});

const PARTICLE_VERTEX_SHADER = `
  attribute vec3 instancePosition;
  attribute vec2 instanceSize;
  attribute float instanceRotation;
  attribute vec4 instanceColor;
  attribute float instanceCell;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vCell;
  void main() {
    float c = cos(instanceRotation);
    float s = sin(instanceRotation);
    vec2 local = mat2(c, -s, s, c) * (position.xy * instanceSize);
    vec4 center = modelViewMatrix * vec4(instancePosition, 1.0);
    center.xy += local;
    gl_Position = projectionMatrix * center;
    vUv = uv;
    vColor = instanceColor;
    vCell = instanceCell;
  }
`;
const PARTICLE_FRAGMENT_SHADER = `
  uniform sampler2D uAtlas;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vCell;
  void main() {
    float column = mod(vCell, 4.0);
    float row = floor(vCell / 4.0);
    vec2 cellUv = (vec2(column, 3.0 - row) + clamp(vUv, vec2(0.003), vec2(0.997))) / 4.0;
    vec4 texel = texture2D(uAtlas, cellUv);
    float alpha = texel.a * vColor.a;
    if (alpha < 0.002) discard;
    gl_FragColor = vec4(texel.rgb * vColor.rgb, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
const TAU = Math.PI * 2;
const PARTICLE_SIZE_SCALE = 1.8;
const BASE_PARTICLE_CAP = 700;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const randomRange = (value, random) => (
  Array.isArray(value) ? value[0] + random() * (value[1] - value[0]) : value
);

function cellIndex(value) {
  return Number.isInteger(value) ? value : PARTICLE_CELLS[value] ?? 0;
}

function makeParticle() {
  return {
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, gravity: 0, drag: 0,
    width: 0, height: 0, startSize: 0, endSize: 0, rotation: 0, spin: 0,
    r: 1, g: 1, b: 1, alpha: 1, ageMs: 0, lifeMs: 1, fadeIn: 0.1,
    blend: 'additive', cell: 0, stretch: 1, alignVelocity: false, landing: false,
  };
}

function makeAttribute(geometry, name, size, count) {
  const attribute = new THREE.InstancedBufferAttribute(new Float32Array(size * count), size);
  attribute.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute(name, attribute);
  return attribute;
}

function makeParticleMesh(scene, texture, blend, capacity) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const attributes = {
    position: makeAttribute(geometry, 'instancePosition', 3, capacity),
    size: makeAttribute(geometry, 'instanceSize', 2, capacity),
    rotation: makeAttribute(geometry, 'instanceRotation', 1, capacity),
    color: makeAttribute(geometry, 'instanceColor', 4, capacity),
    cell: makeAttribute(geometry, 'instanceCell', 1, capacity),
  };
  const material = new THREE.ShaderMaterial({
    uniforms: { uAtlas: { value: texture } },
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
    blending: blend === 'normal' ? THREE.NormalBlending : THREE.AdditiveBlending,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  scene.add(mesh);
  return { mesh, geometry, material, attributes };
}

function makeCellGeometry(cell) {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const attribute = geometry.attributes.uv;
  const column = cell % 4;
  const rowFromBottom = 3 - Math.floor(cell / 4);
  for (let index = 0; index < attribute.count; index += 1) {
    attribute.setXY(
      index,
      (column + attribute.getX(index)) / 4,
      (rowFromBottom + attribute.getY(index)) / 4,
    );
  }
  attribute.needsUpdate = true;
  return geometry;
}

export class VfxSystem {
  constructor(scene, {
    particleTexture,
    fireballTexture,
    fireballAtlas,
    quality = 'medium',
    reducedMotion = false,
  }) {
    this.scene = scene;
    this.particleTexture = particleTexture;
    this.fireballTexture = fireballTexture;
    this.fireballAtlas = fireballAtlas;
    this.particleCapacity = 700;
    this.particlePool = new FixedPool(this.particleCapacity, makeParticle);
    this.decalGeometries = Array.from({ length: 16 }, (_, index) => makeCellGeometry(index));
    this.flipbookGeometry = new THREE.PlaneGeometry(1, 1);
    this.decalPool = new FixedPool(28, () => this.createDecalSlot());
    this.flipbookPool = new FixedPool(10, () => this.createFlipbookSlot());
    this.additive = makeParticleMesh(scene, particleTexture, 'additive', this.particleCapacity);
    this.normal = makeParticleMesh(scene, particleTexture, 'normal', this.particleCapacity);
    this.decalSlots = this.decalPool.free;
    this.flipbookSlots = this.flipbookPool.free;
    this.emitters = new Map();
    this.rainFields = new Map();
    this.meteors = new Map();
    this.randomState = 0x4d395646;
    this._cameraVelocity = new THREE.Vector3();
    this._color = new THREE.Color();
    this._counts = { additive: 0, normal: 0 };
    this._landingEffects = [];
    this.pointLight = new THREE.PointLight(0xff9a42, 0, 11, 2);
    this.pointLight.visible = false;
    this.scene.add(this.pointLight);
    this.flashAgeMs = 0;
    this.flashDurationMs = 0;
    this.flashIntensity = 0;
    this.lastParticleCount = 0;
    this.peakParticleCount = 0;
    this.lastUpdateMs = 0;
    this.peakUpdateMs = 0;
    this.setQuality(quality, reducedMotion);
  }

  random() {
    let value = this.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    this.randomState = value >>> 0;
    return this.randomState / 4294967296;
  }

  setQuality(quality, reducedMotion = false) {
    this.quality = quality;
    this.reducedMotion = Boolean(reducedMotion);
    this.maxParticles = particleLimitForQuality(quality, this.reducedMotion);
    this.particlePool.setLimit(this.maxParticles);
    this.pointLight.visible = false;
    this.lowQuality = quality === 'low';
  }

  scaleCount(count) {
    return Math.max(1, Math.ceil(count * this.maxParticles / BASE_PARTICLE_CAP));
  }

  emit(presetName, x, y, z, options = {}) {
    const preset = VFX_PRESETS[presetName] ?? VFX_PRESETS.spark;
    const particle = this.particlePool.acquire();
    if (!particle) return null;
    const random = () => this.random();
    const color = options.color ?? preset.color ?? 0xffffff;
    this._color.set(color);
    const size = randomRange(options.size ?? preset.startSize, random);
    const sizeScale = options.sizeScale ?? PARTICLE_SIZE_SCALE;
    const velocity = options.velocity ?? preset.velocity ?? {};
    particle.x = x;
    particle.y = y;
    particle.z = z;
    particle.vx = options.vx ?? velocity.x ?? 0;
    particle.vy = options.vy ?? velocity.y ?? randomRange(options.upward ?? preset.upward ?? 0, random);
    particle.vz = options.vz ?? velocity.z ?? 0;
    particle.gravity = options.gravity ?? preset.gravity ?? 0;
    particle.drag = options.drag ?? preset.drag ?? 0;
    particle.startSize = (options.startSize ?? size) * sizeScale;
    particle.endSize = randomRange(options.endSize ?? preset.endSize ?? size * 0.1, random) * sizeScale;
    particle.width = particle.startSize;
    particle.height = particle.startSize * (options.stretch ?? preset.stretch ?? 1);
    particle.rotation = options.rotation ?? random() * TAU;
    particle.spin = randomRange(options.spin ?? preset.spin ?? 0, random);
    particle.r = this._color.r;
    particle.g = this._color.g;
    particle.b = this._color.b;
    particle.alpha = options.alpha ?? preset.alpha ?? 1;
    particle.ageMs = 0;
    particle.lifeMs = Math.max(1, randomRange(options.lifeMs ?? preset.lifeMs ?? 400, random));
    particle.fadeIn = options.fadeIn ?? preset.fadeIn ?? 0.1;
    particle.blend = options.blend ?? preset.blend ?? 'additive';
    particle.cell = cellIndex(options.cell ?? preset.cell);
    particle.stretch = options.stretch ?? preset.stretch ?? 1;
    particle.alignVelocity = Boolean(options.alignVelocity ?? preset.alignVelocity);
    particle.landing = Boolean(options.landing ?? preset.landing);
    return particle;
  }

  burst(spec) {
    const count = Math.max(0, Math.trunc(spec.count ?? 1));
    const preset = spec.preset ?? 'spark';
    const spreadRadius = spec.spreadRadius ?? 0;
    const speed = spec.speed ?? [0.5, 3.5];
    const upward = spec.upward ?? [0.4, 2.8];
    const colors = spec.colors;
    const startAngle = spec.startAngle ?? this.random() * TAU;
    const jitter = spec.angleJitter ?? 0.08;
    const particles = [];
    for (let index = 0; index < count; index += 1) {
      const angle = startAngle + TAU * index / Math.max(1, count) + (this.random() - 0.5) * jitter;
      const radius = Math.sqrt(this.random()) * spreadRadius;
      const velocity = randomRange(speed, () => this.random());
      const particle = this.emit(preset, spec.x, spec.y, spec.z, {
        ...spec,
        count: undefined,
        preset: undefined,
        x: undefined,
        y: undefined,
        z: undefined,
        vx: spec.vx ?? Math.cos(angle) * velocity,
        vy: spec.vy ?? randomRange(upward, () => this.random()),
        vz: spec.vz ?? Math.sin(angle) * velocity,
        color: Array.isArray(colors) ? colors[index % colors.length] : spec.color,
        xOffset: undefined,
      });
      if (particle) {
        particle.x += Math.cos(angle) * radius;
        particle.z += Math.sin(angle) * radius;
        particles.push(particle);
      }
    }
    return particles;
  }

  createDecalSlot() {
    const materialOptions = {
      map: this.particleTexture,
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    };
    const materials = {
      additive: new THREE.MeshBasicMaterial({ ...materialOptions, blending: THREE.AdditiveBlending }),
      normal: new THREE.MeshBasicMaterial({ ...materialOptions, blending: THREE.NormalBlending }),
    };
    const mesh = new THREE.Mesh(this.decalGeometries?.[0] ?? new THREE.PlaneGeometry(1, 1), materials.additive);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.03;
    mesh.renderOrder = 1;
    mesh.visible = false;
    this.scene.add(mesh);
    return { mesh, material: materials.additive, materials, ageMs: 0, lifeMs: 1, startTick: null, endTick: null, opacity: 1 };
  }

  decal(spec) {
    const slot = this.decalPool.acquire();
    if (!slot) return null;
    const cell = cellIndex(spec.cell);
    slot.mesh.geometry = this.decalGeometries[cell] ?? this.decalGeometries[0];
    slot.material = slot.materials[spec.blend === 'normal' ? 'normal' : 'additive'];
    slot.mesh.material = slot.material;
    slot.mesh.position.set(spec.x, spec.y ?? 0.03, spec.z);
    slot.mesh.rotation.set(-Math.PI / 2, 0, spec.rotation ?? 0);
    slot.mesh.scale.setScalar((spec.radius ?? 1) * 2);
    slot.mesh.visible = true;
    slot.mesh.renderOrder = spec.renderOrder ?? 1;
    slot.material.color.set(spec.color ?? 0xffffff);
    const opacityScale = spec.opacityScale ?? 1.25;
    slot.opacity = clamp((spec.opacity ?? 0.8) * opacityScale, 0, 1);
    slot.startOpacity = clamp((spec.startOpacity ?? spec.opacity ?? 0.8) * opacityScale, 0, 1);
    slot.endOpacity = clamp((spec.endOpacity ?? spec.opacity ?? 0.8) * opacityScale, 0, 1);
    slot.material.opacity = slot.opacity;
    slot.ageMs = 0;
    slot.lifeMs = Math.max(1, spec.lifeMs ?? 900);
    slot.startTick = Number.isFinite(spec.startTick) ? spec.startTick : null;
    slot.endTick = Number.isFinite(spec.endTick) ? spec.endTick : null;
    slot.fadeIn = spec.fadeIn ?? 0;
    slot.fadeOut = spec.fadeOut ?? 0.25;
    slot.startRadius = spec.startRadius ?? spec.radius ?? 1;
    slot.endRadius = spec.endRadius ?? spec.radius ?? 1;
    slot.rotationSpeed = spec.rotationSpeed ?? 0;
    return slot;
  }

  createFlipbookSlot() {
    const map = this.fireballTexture.clone();
    map.needsUpdate = true;
    const material = new THREE.MeshBasicMaterial({
      map,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(this.flipbookGeometry ?? new THREE.PlaneGeometry(1, 1), material);
    mesh.visible = false;
    mesh.renderOrder = 12;
    this.scene.add(mesh);
    return { mesh, material, ageMs: 0, durationMs: 1, clip: null, size: 1, x: 0, y: 0, z: 0 };
  }

  flipbook(clipName, x, y, z, size, options = {}) {
    const clip = this.fireballAtlas?.clips?.[clipName];
    if (!clip?.frames?.length || !this.fireballTexture?.image) return null;
    this.flipbookGeometry ??= new THREE.PlaneGeometry(1, 1);
    for (const slot of this.flipbookPool.free) slot.mesh.geometry = this.flipbookGeometry;
    for (const slot of this.flipbookPool.active) slot.mesh.geometry = this.flipbookGeometry;
    const slot = this.flipbookPool.acquire();
    if (!slot) return null;
    slot.mesh.geometry = this.flipbookGeometry;
    slot.clip = clip;
    slot.ageMs = 0;
    slot.durationMs = options.durationMs ?? clip.frames.length / (clip.fps ?? 20) * 1000;
    slot.size = size;
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.tint = options.color ?? 0xffffff;
    slot.contentScale = clip.contentScale ?? 1;
    slot.mesh.position.set(x, y, z);
    slot.mesh.scale.set(size * slot.contentScale, size * 0.65 * slot.contentScale, 1);
    slot.material.color.set(slot.tint);
    slot.mesh.visible = true;
    this.setFlipbookFrame(slot, 0);
    return slot;
  }

  setFlipbookFrame(slot, index) {
    const name = slot.clip.frames[Math.min(slot.clip.frames.length - 1, index)];
    const frame = this.fireballAtlas.frames[name]?.frame;
    if (!frame) return;
    const image = this.fireballTexture.image;
    const map = slot.material.map;
    map.offset.set(frame.x / image.width, 1 - (frame.y + frame.h) / image.height);
    map.repeat.set(frame.w / image.width, frame.h / image.height);
    map.updateMatrix();
  }

  flash(x, y, z, color = 0xff9a42, intensity = 4, durationMs = 180) {
    if (this.lowQuality || this.reducedMotion) return;
    this.pointLight.color.set(color);
    this.pointLight.position.set(x, y, z);
    this.flashIntensity = Math.max(this.flashIntensity, intensity);
    this.flashDurationMs = Math.max(this.flashDurationMs, durationMs);
    this.flashAgeMs = 0;
    this.pointLight.intensity = this.flashIntensity;
    this.pointLight.visible = true;
  }

  startEmitter(spec) {
    this.emitters.set(spec.id, {
      ...spec,
      accumulator: 0,
      startTick: spec.startTick ?? 0,
    });
  }

  startRain(event) {
    const key = `${event.ownerId}:${event.castSeq}:rain`;
    this.rainFields.set(key, {
      x: event.shape.originX,
      z: event.shape.originZ,
      radius: event.shape.radius,
      nextTick: event.resolveTick,
      hitEvery: Math.max(1, event.hitEvery ?? 1),
      hitsRemaining: Math.max(1, event.hitsRemaining ?? 1),
    });
    return key;
  }

  startMeteor(event, rankFive = false) {
    const key = event.castId ?? `${event.ownerId}:${event.resolveTick}`;
    if (this.meteors.has(key)) return;
    const { originX: x, originZ: z, radius } = event.shape;
    this.meteors.set(key, {
      x, z, radius, startTick: event.startTick, resolveTick: event.resolveTick,
      trailAccumulator: 0, smokeAccumulator: 0, coreAccumulator: 0, sparkAccumulator: 0, rankFive,
    });
  }

  emitRainDrop(field) {
    const angle = this.random() * TAU;
    const distance = Math.sqrt(this.random()) * field.radius;
    this.emit('rainStreak', field.x + Math.cos(angle) * distance, 8, field.z + Math.sin(angle) * distance, {
      landing: true,
      color: 0xb8e8ff,
      lifeMs: 500,
    });
  }

  updateEmitters(dtMs, renderTick) {
    for (const [key, emitter] of this.emitters) {
      if (renderTick < emitter.startTick) continue;
      if (Number.isFinite(emitter.endTick) && renderTick >= emitter.endTick) {
        this.emitters.delete(key);
        continue;
      }
      emitter.accumulator += dtMs * emitter.rate / 1000;
      while (emitter.accumulator >= 1) {
        emitter.accumulator -= 1;
        const angle = this.random() * TAU;
        const radius = Math.sqrt(this.random()) * (emitter.radius ?? 0);
        const x = emitter.x + Math.cos(angle) * radius;
        const z = emitter.z + Math.sin(angle) * radius;
        this.emit(emitter.preset, x, emitter.y ?? 0.14, z, emitter.options ?? {});
      }
    }
  }

  updateRain(renderTick) {
    for (const [key, field] of this.rainFields) {
      while (field.hitsRemaining > 0 && renderTick >= field.nextTick) {
        for (let index = 0; index < 6; index += 1) this.emitRainDrop(field);
        field.hitsRemaining -= 1;
        field.nextTick += field.hitEvery;
      }
      if (field.hitsRemaining <= 0) this.rainFields.delete(key);
    }
  }

  updateMeteors(dtMs, renderTick) {
    for (const [key, meteor] of this.meteors) {
      const duration = Math.max(1, meteor.resolveTick - meteor.startTick);
      const progress = clamp((renderTick - meteor.startTick) / duration, 0, 1);
      const arrived = progress >= 1;
      const eased = progress ** 1.6;
      const x = meteor.x - 4 + 4 * eased;
      const y = 16 - 15.2 * eased;
      const z = meteor.z - 3 + 3 * eased;
      meteor.trailAccumulator += dtMs;
      meteor.smokeAccumulator += dtMs;
      meteor.coreAccumulator += dtMs;
      meteor.sparkAccumulator += dtMs;
      while (meteor.trailAccumulator >= 16) {
        meteor.trailAccumulator -= 16;
        const offsetX = (this.random() - 0.5) * 0.3;
        const offsetZ = (this.random() - 0.5) * 0.3;
        this.emit('flame', x + offsetX, y, z + offsetZ, {
          cell: 'flame_04',
          color: meteor.rankFive ? 0xffefad : 0xff7624,
          startSize: 0.9,
          endSize: 0.1,
          sizeScale: 1,
          lifeMs: 450,
          vx: -0.15,
          vy: -0.45,
          vz: -0.1,
          spin: 1.4,
          alignVelocity: true,
          stretch: 1.35,
        });
      }
      while (meteor.sparkAccumulator >= 50) {
        meteor.sparkAccumulator -= 50;
        for (let index = 0; index < 2; index += 1) {
          this.emit('spark', x, y, z, {
            cell: 'spark_04',
            color: index ? 0xffa03e : 0xffebaa,
            startSize: 0.32,
            endSize: 0.04,
            sizeScale: 1,
            lifeMs: 260,
            speed: 0.9,
            vx: (this.random() - 0.5) * 2,
            vy: -0.35 + this.random(),
            vz: (this.random() - 0.5) * 2,
          });
        }
      }
      while (meteor.smokeAccumulator >= 65) {
        meteor.smokeAccumulator -= 65;
        this.emit('smoke', x - 0.1, y - 0.12, z, {
          color: 0x40343a,
          startSize: 0.8,
          endSize: 1.8,
          sizeScale: 1,
          lifeMs: 900,
          vx: -0.2,
          vy: 0.8,
          vz: -0.12,
        });
      }
      while (meteor.coreAccumulator >= 33) {
        meteor.coreAccumulator -= 33;
        this.emit('flame', x, y, z, {
          cell: 'circle_05', color: 0xfff0c0, startSize: 2.4, endSize: 2.1,
          sizeScale: 1, lifeMs: 120, alpha: 0.95, fadeIn: 0.01,
        });
        this.emit('flame', x, y - 0.05, z, {
          cell: 'fire_01', color: 0xff842d, startSize: 1.8, endSize: 1.45,
          sizeScale: 1, lifeMs: 120, alpha: 0.95, fadeIn: 0.01,
        });
      }
      if (arrived) {
        this.emit('flame', meteor.x, 0.8, meteor.z, {
          cell: 'circle_05', color: 0xfff0c0, startSize: 2.4, endSize: 2.1,
          sizeScale: 1, lifeMs: 120, alpha: 0.95, fadeIn: 0.01,
        });
        this.emit('flame', meteor.x, 0.75, meteor.z, {
          cell: 'fire_01', color: 0xff842d, startSize: 1.8, endSize: 1.45,
          sizeScale: 1, lifeMs: 120, alpha: 0.95, fadeIn: 0.01,
        });
        this.meteors.delete(key);
      }
    }
  }

  updateParticles(dtMs, camera) {
    const bundles = { additive: this.additive, normal: this.normal };
    this._counts.additive = 0;
    this._counts.normal = 0;
    const expired = [];
    this._landingEffects.length = 0;
    const seconds = dtMs / 1000;
    for (const particle of this.particlePool.active) {
      particle.ageMs += dtMs;
      if (particle.ageMs >= particle.lifeMs) {
        if (particle.landing) this._landingEffects.push([particle.x, particle.z]);
        expired.push(particle);
        continue;
      }
      const drag = Math.exp(-particle.drag * seconds);
      particle.vx *= drag;
      particle.vy = (particle.vy - particle.gravity * seconds) * drag;
      particle.vz *= drag;
      particle.x += particle.vx * seconds;
      particle.y += particle.vy * seconds;
      particle.z += particle.vz * seconds;
      particle.rotation += particle.spin * seconds;
      const progress = particle.ageMs / particle.lifeMs;
      const fadeIn = particle.fadeIn <= 0 ? 1 : clamp(progress / particle.fadeIn, 0, 1);
      const fadeOut = clamp((1 - progress) / 0.35, 0, 1);
      const size = particle.startSize + (particle.endSize - particle.startSize) * progress;
      let rotation = particle.rotation;
      if (particle.alignVelocity && camera) {
        this._cameraVelocity.set(particle.vx, particle.vy, particle.vz).transformDirection(camera.matrixWorldInverse);
        rotation = Math.atan2(this._cameraVelocity.y, this._cameraVelocity.x);
      }
      const bundle = bundles[particle.blend === 'normal' ? 'normal' : 'additive'];
      const instance = this._counts[particle.blend === 'normal' ? 'normal' : 'additive']++;
      const position = bundle.attributes.position.array;
      const sizeAttribute = bundle.attributes.size.array;
      const rotationAttribute = bundle.attributes.rotation.array;
      const colorAttribute = bundle.attributes.color.array;
      const cellAttribute = bundle.attributes.cell.array;
      position.set([particle.x, particle.y, particle.z], instance * 3);
      sizeAttribute.set([size, size * particle.stretch], instance * 2);
      rotationAttribute[instance] = rotation;
      colorAttribute.set([
        particle.r,
        particle.g,
        particle.b,
        particle.alpha * fadeIn * fadeOut,
      ], instance * 4);
      cellAttribute[instance] = particle.cell;
    }
    for (const particle of expired) this.particlePool.release(particle);
    for (const [x, z] of this._landingEffects) {
      this.burst({
        preset: 'spark',
        count: 3,
        x,
        y: 0.1,
        z,
        speed: [0.2, 1.2],
        upward: [0.4, 1.2],
        color: 0xb9e7ff,
        startSize: 0.12,
        endSize: 0.01,
        lifeMs: 260,
      });
      this.emit('smoke', x, 0.08, z, { startSize: 0.16, endSize: 0.32, lifeMs: 320, color: 0x9aa4a5, upward: 0.2 });
    }
    for (const bundle of Object.values(bundles)) {
      for (const attribute of Object.values(bundle.attributes)) attribute.needsUpdate = true;
    }
    this.additive.mesh.count = this._counts.additive;
    this.normal.mesh.count = this._counts.normal;
    this.lastParticleCount = this._counts.additive + this._counts.normal;
    this.peakParticleCount = Math.max(this.peakParticleCount, this.lastParticleCount);
  }

  updateDecals(dtMs, renderTick) {
    const expired = [];
    for (const slot of this.decalPool.active) {
      slot.ageMs += dtMs;
      const tickDriven = slot.startTick !== null && slot.endTick !== null;
      const progress = tickDriven
        ? clamp((renderTick - slot.startTick) / Math.max(1, slot.endTick - slot.startTick), 0, 1)
        : clamp(slot.ageMs / slot.lifeMs, 0, 1);
      if (progress >= 1) {
        expired.push(slot);
        continue;
      }
      const fadeIn = slot.fadeIn > 0 ? clamp(progress / slot.fadeIn, 0, 1) : 1;
      const fadeOut = slot.fadeOut <= 0 ? 1 : clamp((1 - progress) / slot.fadeOut, 0, 1);
      const opacity = slot.startOpacity + (slot.endOpacity - slot.startOpacity) * progress;
      slot.material.opacity = opacity * fadeIn * fadeOut;
      const radius = slot.startRadius + (slot.endRadius - slot.startRadius) * progress;
      slot.mesh.scale.setScalar(radius * 2);
      slot.mesh.rotateZ(slot.rotationSpeed * dtMs / 1000);
    }
    for (const slot of expired) {
      slot.mesh.visible = false;
      this.decalPool.release(slot);
    }
  }

  updateFlipbooks(dtMs, camera) {
    const expired = [];
    for (const slot of this.flipbookPool.active) {
      slot.ageMs += dtMs;
      if (slot.ageMs >= slot.durationMs) {
        expired.push(slot);
        continue;
      }
      const progress = slot.ageMs / slot.durationMs;
      const frame = Math.floor(progress * slot.clip.frames.length);
      this.setFlipbookFrame(slot, frame);
      if (camera) slot.mesh.quaternion.copy(camera.quaternion);
      const opacity = Math.min(1, (1 - progress) * 5);
      slot.material.opacity = opacity;
    }
    for (const slot of expired) {
      slot.mesh.visible = false;
      this.flipbookPool.release(slot);
    }
  }

  updateFlash(dtMs) {
    if (!this.pointLight.visible) return;
    this.flashAgeMs += dtMs;
    const progress = clamp(this.flashAgeMs / Math.max(1, this.flashDurationMs), 0, 1);
    this.pointLight.intensity = this.flashIntensity * (1 - progress);
    if (progress >= 1) {
      this.pointLight.intensity = 0;
      this.pointLight.visible = false;
      this.flashIntensity = 0;
      this.flashDurationMs = 0;
    }
  }

  update(dtMs, camera, renderTick = 0) {
    const startedAt = performance.now();
    const delta = clamp(dtMs, 0, 100);
    this.updateEmitters(delta, renderTick);
    this.updateRain(renderTick);
    this.updateMeteors(delta, renderTick);
    this.updateParticles(delta, camera);
    this.updateDecals(delta, renderTick);
    this.updateFlipbooks(delta, camera);
    this.updateFlash(delta);
    this.lastUpdateMs = performance.now() - startedAt;
    this.peakUpdateMs = Math.max(this.peakUpdateMs, this.lastUpdateMs);
  }

  getStats() {
    return {
      particleCount: this.lastParticleCount,
      peakParticleCount: this.peakParticleCount,
      updateMs: this.lastUpdateMs,
      peakUpdateMs: this.peakUpdateMs,
      particleCap: this.maxParticles,
    };
  }

  clear() {
    this.particlePool.clear();
    this.decalPool.clear();
    this.flipbookPool.clear();
    for (const slot of this.decalPool.free) slot.mesh.visible = false;
    for (const slot of this.flipbookPool.free) slot.mesh.visible = false;
    this.emitters.clear();
    this.rainFields.clear();
    this.meteors.clear();
    this.additive.mesh.count = 0;
    this.normal.mesh.count = 0;
    this.pointLight.intensity = 0;
    this.pointLight.visible = false;
    this.flashAgeMs = 0;
    this.flashDurationMs = 0;
    this.flashIntensity = 0;
    this.lastParticleCount = 0;
    this.peakParticleCount = 0;
  }

  dispose() {
    this.clear();
    this.scene.remove(this.additive.mesh, this.normal.mesh, this.pointLight);
    this.additive.geometry.dispose();
    this.normal.geometry.dispose();
    this.additive.material.dispose();
    this.normal.material.dispose();
    for (const geometry of this.decalGeometries) geometry.dispose();
    for (const slot of this.decalSlots) {
      this.scene.remove(slot.mesh);
      slot.materials.additive.dispose();
      slot.materials.normal.dispose();
    }
    for (const slot of this.flipbookSlots) {
      this.scene.remove(slot.mesh);
      slot.material.map.dispose();
      slot.material.dispose();
    }
    this.flipbookGeometry?.dispose();
    this.particleTexture.dispose();
    this.fireballTexture.dispose();
  }
}
