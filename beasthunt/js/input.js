// Keyboard / mouse / touch input with a short press buffer.
const KEYMAP = {
  Space: 'roll', KeyL: 'roll', ShiftLeft: 'sprint', ShiftRight: 'sprint', KeyE: 'potion', KeyQ: 'lock', Tab: 'lock',
  KeyJ: 'attack', KeyK: 'heavy', Escape: 'pause', KeyP: 'pause',
};
const MOVE = { KeyW: [0, 1], ArrowUp: [0, 1], KeyS: [0, -1], ArrowDown: [0, -1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };

export class Input {
  constructor(canvas, touchRoot) {
    this.cv = canvas; this.keys = {}; this.held = {}; this.pressed = {}; this.lx = 0; this.ly = 0;
    this.joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 }; this.camTouch = null; this.enabled = false;
    this.isTouch = matchMedia('(pointer:coarse)').matches || 'ontouchstart' in window;
    const on = (el, ev, fn, opt) => el.addEventListener(ev, fn, opt);
    on(window, 'keydown', (e) => {
      if (!this.enabled) return;
      if (MOVE[e.code]) { this.keys[e.code] = true; e.preventDefault(); return; }
      const a = KEYMAP[e.code]; if (!a) return; e.preventDefault(); if (!e.repeat) this.press(a);
    });
    on(window, 'keyup', (e) => { if (MOVE[e.code]) this.keys[e.code] = false; const a = KEYMAP[e.code]; if (a) this.release(a); });
    on(window, 'blur', () => { this.keys = {}; this.held = {}; });
    on(canvas, 'mousedown', (e) => {
      if (!this.enabled || this.isTouch) return;
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ } }
      this.press(e.button === 2 ? 'heavy' : 'attack'); this.drag = true;
    });
    on(window, 'mouseup', (e) => { this.release(e.button === 2 ? 'heavy' : 'attack'); this.drag = false; });
    on(window, 'mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === canvas || this.drag) { this.lx += e.movementX || 0; this.ly += e.movementY || 0; }
    });
    on(canvas, 'contextmenu', (e) => e.preventDefault());
    if (touchRoot) this.bindTouch(touchRoot, canvas);
  }
  bindTouch(root, canvas) {
    const zone = root.querySelector('#joyZone'), knob = root.querySelector('#joyKnob'), base = root.querySelector('#joyBase');
    const setKnob = () => { knob.style.transform = `translate(${this.joy.x * 44}px,${-this.joy.y * 44}px)`; };
    zone.addEventListener('touchstart', (e) => {
      e.preventDefault(); const t = e.changedTouches[0]; this.joy.id = t.identifier; this.joy.ox = t.clientX; this.joy.oy = t.clientY;
      const r = zone.getBoundingClientRect(); base.style.left = (t.clientX - r.left) + 'px'; base.style.top = (t.clientY - r.top) + 'px'; base.classList.add('on');
    }, { passive: false });
    const mv = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          e.preventDefault(); let dx = (t.clientX - this.joy.ox) / 52, dy = -(t.clientY - this.joy.oy) / 52; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
          this.joy.x = dx; this.joy.y = dy; this.held.sprint = l > 1.9; setKnob();
        } else if (this.camTouch && t.identifier === this.camTouch.id) {
          e.preventDefault(); this.lx += (t.clientX - this.camTouch.x) * 1.6; this.ly += (t.clientY - this.camTouch.y) * 1.6; this.camTouch.x = t.clientX; this.camTouch.y = t.clientY;
        }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) { this.joy.id = null; this.joy.x = this.joy.y = 0; this.held.sprint = false; setKnob(); base.classList.remove('on'); }
        if (this.camTouch && t.identifier === this.camTouch.id) this.camTouch = null;
      }
    };
    window.addEventListener('touchmove', mv, { passive: false }); window.addEventListener('touchend', end); window.addEventListener('touchcancel', end);
    canvas.addEventListener('touchstart', (e) => { e.preventDefault(); if (!this.camTouch) { const t = e.changedTouches[0]; this.camTouch = { id: t.identifier, x: t.clientX, y: t.clientY }; } }, { passive: false });
    root.querySelectorAll('[data-act]').forEach((b) => {
      const a = b.dataset.act;
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); if (this.enabled) { this.press(a); b.classList.add('on'); } }, { passive: false });
      const up = (e) => { e.preventDefault(); this.release(a); b.classList.remove('on'); };
      b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
    });
  }
  press(a) { this.pressed[a] = performance.now(); this.held[a] = true; }
  release(a) { this.held[a] = false; }
  take(a, win = 260) { const t = this.pressed[a]; if (t && performance.now() - t < win) { this.pressed[a] = 0; return true; } return false; }
  clear() { this.pressed = {}; this.held = {}; this.keys = {}; this.lx = this.ly = 0; this.joy.x = this.joy.y = 0; }
  move() {
    let x = this.joy.x, y = this.joy.y;
    for (const k in MOVE) if (this.keys[k]) { x += MOVE[k][0]; y += MOVE[k][1]; }
    const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    return { x, y };
  }
  sample(yaw) {
    const mv = this.move();
    return { moveX: Math.round(mv.x*127), moveZ: Math.round(mv.y*127), aimYaw: yaw,
      light: this.take('attack'), heavy: this.take('heavy'), dodge: this.take('roll'), potion: this.take('potion'), lock: this.take('lock'),
      heavyHeld: !!this.held.heavy, sprint: !!this.held.sprint };
  }
  takeLook() { const r = { x: this.lx, y: this.ly }; this.lx = this.ly = 0; return r; }
}
