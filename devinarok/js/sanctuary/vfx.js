import * as THREE from 'three';
import { RITUAL_CAPS, RITUAL_POINTS, faceAtPhase } from './state.js';

const CHIAO_POINT = RITUAL_POINTS.find((point) => point.id === 'chiao');
const INCENSE_POINT = RITUAL_POINTS.find((point) => point.id === 'incense');
const BURN_POINT = RITUAL_POINTS.find((point) => point.id === 'burn');
const EMBER_COLORS = [0xffb347, 0xf28a3b, 0xd66535];
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);

function crescentGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.15, 0);
  shape.quadraticCurveTo(-0.12, -0.09, -0.04, -0.09);
  shape.quadraticCurveTo(0.01, -0.09, 0.03, -0.04);
  shape.quadraticCurveTo(0.06, -0.01, 0.13, -0.02);
  shape.quadraticCurveTo(0.16, 0, 0.13, 0.02);
  shape.quadraticCurveTo(0.06, 0.01, 0.03, 0.04);
  shape.quadraticCurveTo(0.01, 0.09, -0.04, 0.09);
  shape.quadraticCurveTo(-0.12, 0.09, -0.15, 0);
  return new THREE.ShapeGeometry(shape, 6);
}

function makeBlock() {
  const node = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0xc0614f,
    roughness: 0.68,
    side: THREE.DoubleSide,
    emissive: 0x21090a,
  });
  const body = new THREE.Mesh(crescentGeometry(), bodyMaterial);
  node.add(body);
  const flatMark = new THREE.Mesh(
    new THREE.BoxGeometry(0.19, 0.045, 0.012),
    new THREE.MeshStandardMaterial({ color: 0xd17a67, roughness: 0.58 }),
  );
  flatMark.position.z = 0.012;
  node.add(flatMark);
  const convexMark = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 6, 4),
    new THREE.MeshStandardMaterial({ color: 0xe77b6e, roughness: 0.5 }),
  );
  convexMark.position.set(-0.015, 0, 0.02);
  node.add(convexMark);
  return { node, bodyMaterial, flatMark, convexMark };
}

export class SanctuaryVfx {
  constructor(scene, { onTok = () => {}, reducedMotion = false } = {}) {
    this.scene = scene;
    this.onTok = onTok;
    this.reducedMotion = Boolean(reducedMotion);
    this.root = new THREE.Group();
    scene.add(this.root);
    this.blocks = Array.from({ length: RITUAL_CAPS.blocks }, () => {
      const block = makeBlock();
      this.root.add(block.node);
      block.node.visible = false;
      return block;
    });
    this.incenseGroup = new THREE.Group();
    this.root.add(this.incenseGroup);
    this.incenseSticks = [];
    this.smokePuffs = [];
    const stickGeometry = new THREE.CylinderGeometry(0.022, 0.025, 0.42, 5);
    const stickMaterial = new THREE.MeshStandardMaterial({ color: 0x9a5038, roughness: 0.9 });
    const emberTipGeometry = new THREE.SphereGeometry(0.031, 5, 4);
    const emberTipMaterial = new THREE.MeshBasicMaterial({ color: 0xff8a3d });
    const smokeGeometry = new THREE.SphereGeometry(0.038, 5, 4);
    const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0xd7d1c7, transparent: true, opacity: 0.24, depthWrite: false });
    for (let stickIndex = 0; stickIndex < RITUAL_CAPS.sticks; stickIndex += 1) {
      const offset = (stickIndex - 1) * 0.1;
      const stick = new THREE.Mesh(stickGeometry, stickMaterial);
      stick.position.set(INCENSE_POINT.target.x + offset, 0.86, INCENSE_POINT.target.z);
      this.incenseGroup.add(stick);
      this.incenseSticks.push(stick);
      const tip = new THREE.Mesh(emberTipGeometry, emberTipMaterial);
      tip.position.set(INCENSE_POINT.target.x + offset, 1.08, INCENSE_POINT.target.z);
      this.incenseGroup.add(tip);
      for (let puffIndex = 0; puffIndex < 4; puffIndex += 1) {
        const puff = new THREE.Mesh(smokeGeometry, smokeMaterial);
        this.incenseGroup.add(puff);
        this.smokePuffs.push({ mesh: puff, stickIndex, puffIndex });
      }
    }
    this.incenseGroup.visible = false;

    this.paper = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xd6ae4f, roughness: 0.72, side: THREE.DoubleSide }),
    );
    this.root.add(this.paper);
    this.paper.visible = false;
    this.embers = Array.from({ length: RITUAL_CAPS.embers }, (_, index) => {
      const geometry = new THREE.SphereGeometry(0.035 + (index % 3) * 0.006, 5, 4);
      const material = new THREE.MeshBasicMaterial({
        color: EMBER_COLORS[index % EMBER_COLORS.length],
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geometry, material);
      this.root.add(mesh);
      mesh.visible = false;
      return { mesh, index };
    });
    this.flame = new THREE.Group();
    const flameMaterials = [0xffc15b, 0xff6b32].map((color) => new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.88,
    }));
    this.flame.add(
      new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.48, 6), flameMaterials[0]),
      new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.32, 5), flameMaterials[1]),
    );
    this.flame.children[0].position.y = 0.24;
    this.flame.children[1].position.set(0.035, 0.22, 0.02);
    this.root.add(this.flame);
    this.flame.position.set(BURN_POINT.target.x, 0.54, BURN_POINT.target.z + 0.52);
    this.flame.visible = false;
  }

  updateIncense(state, time) {
    const planted = state.sticksLeft > 0 || state.active?.id === 'incense';
    this.incenseGroup.visible = planted;
    if (!planted) return;
    const age = state.incenseAge ?? 0;
    for (const { mesh, stickIndex, puffIndex } of this.smokePuffs) {
      const phase = age * 1.5 + stickIndex * 2.1 + puffIndex * 1.57 + time * 0.0002;
      const rise = (age * 0.32 + puffIndex * 0.18) % 0.78;
      const offset = (stickIndex - 1) * 0.1;
      mesh.position.set(
        INCENSE_POINT.target.x + offset + Math.sin(phase) * 0.045,
        1.08 + rise,
        INCENSE_POINT.target.z + Math.cos(phase * 0.7) * 0.035,
      );
      mesh.scale.setScalar(0.65 + rise * 0.8);
      mesh.material.opacity = 0.22 * (1 - rise * 0.55);
      mesh.visible = true;
    }
  }

  updateChiao(active) {
    const flight = active.phase === 'flight';
    this.blocks.forEach((block, index) => {
      const plan = active.plan[index];
      const progress = flight ? Math.min(1, active.elapsed / plan.duration) : 1;
      const travel = flight ? Math.min(1, active.elapsed / 0.58) : 1;
      const startX = active.origin.x + (index ? 0.09 : -0.09);
      const startZ = active.origin.z;
      const startY = 0.56;
      const targetX = CHIAO_POINT.target.x + (index ? 0.19 : -0.19);
      const targetZ = CHIAO_POINT.target.z;
      let x = lerp(startX, targetX, ease(travel));
      let y = lerp(startY, 0.08, ease(travel));
      if (flight) {
        y += Math.sin(Math.PI * travel) * (this.reducedMotion ? 0.22 : 0.58);
        const bounceTime = Math.max(0, active.elapsed - 0.58);
        let bounceLift = 0;
        for (let bounce = 0; bounce < plan.bounceCount; bounce += 1) {
          const local = Math.max(0, Math.min(1, (bounceTime - bounce * 0.28) / 0.28));
          bounceLift = Math.max(bounceLift, Math.sin(Math.PI * local) * ((this.reducedMotion ? 0.06 : 0.2) / (bounce + 1)));
        }
        y += bounceLift;
      }
      const phase = plan.finalPhase * ease(progress);
      const face = faceAtPhase(phase);
      block.bodyMaterial.color.setHex(face === 'flat' ? 0xc0614f : 0x8a1f2a);
      block.flatMark.visible = face === 'flat';
      block.convexMark.visible = face === 'convex';
      block.node.position.set(x, y, targetZ);
      block.node.rotation.z = Math.sin(progress * Math.PI) * (this.reducedMotion ? 0.08 : 0.25);
      block.node.scale.set(1.7, 1.7 * (0.25 + Math.abs(Math.cos(phase)) * 0.75), 1);
      block.node.visible = true;
    });
  }

  updateBurn(active) {
    const elapsed = active.elapsed;
    const progress = Math.min(1, elapsed / 0.58);
    const x = lerp(active.origin.x, BURN_POINT.target.x, ease(progress));
    const targetZ = BURN_POINT.target.z + 0.52;
    const z = lerp(active.origin.z, targetZ, ease(progress));
    const height = 0.28 + Math.sin(Math.PI * progress) * 0.42;
    this.paper.position.set(x, height, z);
    this.paper.rotation.set(0, 0, progress * 1.8);
    this.paper.visible = elapsed < 3.2;
    this.flame.visible = elapsed >= 0.4;
    this.flame.scale.setScalar(0.8 + Math.sin(elapsed * 11) * 0.14);
    for (const { mesh, index } of this.embers) {
      if (elapsed < 0.4 || elapsed > 3.2) {
        mesh.visible = false;
        continue;
      }
      const phase = index * 1.71 + active.seq;
      const rise = Math.min(1, (elapsed - 0.4) / 1.6);
      mesh.position.set(
        BURN_POINT.target.x + Math.cos(phase) * (0.07 + index % 4 * 0.025),
        0.32 + rise * (0.18 + index % 5 * 0.08),
        BURN_POINT.target.z + 0.52 + Math.sin(phase) * (0.06 + index % 3 * 0.03),
      );
      mesh.material.opacity = 0.85 * (1 - rise * 0.35);
      mesh.visible = true;
    }
  }

  update(state, time = performance.now()) {
    const pendingToks = Number.isFinite(state.pendingToks) ? Math.max(0, Math.floor(state.pendingToks)) : 0;
    for (let index = 0; index < pendingToks; index += 1) this.onTok();
    state.pendingToks = 0;
    for (const block of this.blocks) block.node.visible = false;
    this.paper.visible = false;
    this.flame.visible = false;
    for (const ember of this.embers) ember.mesh.visible = false;
    this.updateIncense(state, time);
    const active = state.active;
    if (!active) return;
    if (active.id === 'chiao' && active.phase !== 'intro') this.updateChiao(active);
    if (active.id === 'burn') this.updateBurn(active);
  }

  clear() {
    this.incenseGroup.visible = false;
    for (const block of this.blocks) block.node.visible = false;
    this.paper.visible = false;
    this.flame.visible = false;
    for (const ember of this.embers) ember.mesh.visible = false;
  }

  destroy() {
    this.scene.remove(this.root);
    const geometries = new Set();
    const materials = new Set();
    this.root.traverse((node) => {
      if (node.geometry) geometries.add(node.geometry);
      if (node.material) for (const material of [node.material].flat()) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
}
