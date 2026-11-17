import * as THREE from 'three';

// One hunt owns one quad, one 64px mask and one material, regardless of party size.
// The quad lies in XZ (local Y=0): its otherwise unused Y scale carries opacity
// into the shared shader. No per-actor uniforms, material clones or draw hooks.
export class ContactShadows {
  constructor(scene, realShadows, doc = globalThis.document) {
    this.scene = scene; this.entries = []; this.actors = new WeakMap(); this.disposed = false;
    this.opacity = realShadows ? .15 : .5; // desktop = 30% of mobile
    const canvas = doc.createElement('canvas'); canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d'), gradient = ctx.createRadialGradient(32,32,0,32,32,32);
    gradient.addColorStop(0,'rgba(0,0,0,1)'); gradient.addColorStop(.35,'rgba(0,0,0,.7)'); gradient.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0,0,64,64);
    this.texture = new THREE.CanvasTexture(canvas); this.texture.generateMipmaps = false;
    this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
    this.geometry = new THREE.PlaneGeometry(2,2); this.geometry.rotateX(-Math.PI/2);
    this.material = new THREE.ShaderMaterial({
      uniforms: { mask: { value: this.texture } }, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
      vertexShader: `
varying vec2 vUv;
varying float vOpacity;
void main() {
  vUv = uv;
  vOpacity = length(modelMatrix[1].xyz);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
      fragmentShader: `
uniform sampler2D mask;
varying vec2 vUv;
varying float vOpacity;
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, texture2D(mask, vUv).a * vOpacity);
}
`
    });
  }

  attach(actor, state, definition) {
    if (this.disposed) return;
    let entry = this.actors.get(actor);
    if (entry) { entry.state = state; return entry; }
    // Read the same live anatomy dimensions as the sim, including legacy forms
    // and the practice sim's boar collider. Hunters use the requested 0.9m disc.
    const rx = definition ? definition.dims.bw * definition.scale : .9;
    const rz = definition ? definition.dims.hz * definition.scale : .9;
    const mesh = new THREE.Mesh(this.geometry,this.material);
    mesh.name = 'contact-shadow'; mesh.renderOrder = 1; mesh.matrixAutoUpdate = false;
    mesh.visible = false; this.scene.add(mesh);
    entry = { actor, state, mesh, rx, rz, x: NaN, y: NaN, z: NaN, yaw: NaN, visible: false };
    this.entries.push(entry); this.actors.set(actor,entry); return entry;
  }

  update() {
    if (this.disposed) return;
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const e = this.entries[i], a = e.actor, root = a.root, p = root.position;
      if (!root.parent) { e.mesh.removeFromParent(); this.actors.delete(a); this.entries.splice(i,1); continue; }
      const height = Math.max(0,p.y), fade = 1 - Math.min(1,height/3);
      const visible = root.visible && e.state.state !== 'dead' && e.state.hp !== 0 &&
        (!a.status || a.status === 'ready') && fade > 0;
      if (visible !== e.visible) { e.mesh.visible = e.visible = visible; }
      if (!visible || (e.x === p.x && e.y === height && e.z === p.z && e.yaw === root.rotation.y)) continue;
      e.x = p.x; e.y = height; e.z = p.z; e.yaw = root.rotation.y;
      e.mesh.rotation.y = e.yaw;
      e.mesh.position.set(p.x,.02,p.z);
      const spread = 1 + height*.1;
      e.mesh.scale.set(e.rx*spread,this.opacity*fade,e.rz*spread); e.mesh.updateMatrix();
    }
  }

  dispose() {
    if (this.disposed) return; this.disposed = true;
    // Detach before Hunt's generic scene disposal, so shared resources die once.
    for (let i = 0; i < this.entries.length; i++) this.entries[i].mesh.removeFromParent();
    this.entries.length = 0; this.actors = new WeakMap();
    this.geometry.dispose(); this.material.dispose(); this.texture.dispose();
  }
}
