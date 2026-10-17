// Edges survive key-up and pointer-up until consume() at the next fixed tick.
export class InputLayer {
  constructor(surface, actions, aimVector) {
    this.enabled = true;
    this.keys = new Set();
    this.pointers = new Map();
    this.edges = {};
    this.buttons = new Map();
    this.joy = null;
    this.jx = 0;
    this.jy = 0;
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseAim = false;
    this.mouseAttack = false;
    // Auto attack is a control preference (not save data); the sim only receives a per-tick flag.
    this.autoAttack = globalThis.localStorage?.getItem('arpg.autoAttack') === '1';
    this.aimVector = aimVector;
    this.pad = document.querySelector('#joystick');
    this.movePad = document.querySelector('#movepad');
    this.padPointer = null;
    this.px = 0;
    this.py = 0;
    this.value = {
      mx: 0, my: 0, aimX: 0, aimY: 0, attack: false, autoAttack: false,
      skillEdge: false, skill2Edge: false, skill3Edge: false, dodgeEdge: false, dodgeHeld:false, potionEdge: false, manaEdge: false, scrollEdge: false,
    };
    const edgeKeys = {
      Space: 'dodgeEdge', ShiftLeft: 'dodgeEdge', ShiftRight: 'dodgeEdge',
      KeyK: 'skillEdge', KeyL: 'skill2Edge', Semicolon: 'skill3Edge', KeyQ: 'potionEdge', KeyE: 'manaEdge', KeyR: 'scrollEdge',
    };
    const allowed = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
      'KeyJ', ...Object.keys(edgeKeys),
    ]);
    window.addEventListener('keydown', (event) => {
      if (this.enabled && event.code === 'KeyT' && !event.repeat && !event.target.closest('select,input,form')) this.setAutoAttack(!this.autoAttack);
      if (!this.enabled || !allowed.has(event.code) || event.target.closest('select,input,form')) return;
      event.preventDefault();
      if (!this.keys.has(event.code) && edgeKeys[event.code]) this.latch(edgeKeys[event.code]);
      this.keys.add(event.code);
    });
    window.addEventListener('keyup', (event) => this.keys.delete(event.code));
    window.addEventListener('blur', () => this.reset());
    document.addEventListener('freeze',()=>this.reset());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
    window.addEventListener('pagehide',()=>this.reset());
    window.addEventListener('touchcancel',()=>this.reset());
    for (const button of actions.querySelectorAll('[data-input]')) {
      const action = button.dataset.input;
      this.buttons.set(action, button);
      button.addEventListener('pointerdown', (event) => {
        if (!this.enabled || button.disabled) return;
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.pointers.set(event.pointerId, action);
        button.classList.add('held');
        if (action !== 'attack') this.latch(action);
      });
      // Native keyboard activation, not a duplicate pointer click.
      button.addEventListener('lostpointercapture',event=>release(event));
      button.addEventListener('click', (event) => {
        if (this.enabled && event.detail === 0) this.latch(action === 'attack' ? 'attackTap' : action);
      });
    }
    // Fixed move pad: replaces the attack button in auto-attack mode so the right thumb can steer.
    this.movePad?.addEventListener('pointerdown', (event) => {
      if (!this.enabled || !this.autoAttack || this.padPointer) return;
      event.preventDefault();
      this.movePad.setPointerCapture(event.pointerId);
      this.padPointer = { id: event.pointerId };
      this.movePadVector(event);
    });
    surface.addEventListener('pointerdown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      surface.setPointerCapture(event.pointerId);
      if (event.pointerType === 'mouse') {
        this.mouseX = event.clientX;
        this.mouseY = event.clientY;
        // mousedown detects RMB while LMB is already held; pointerdown cannot.
      } else if (event.clientX < innerWidth * 0.5 && !this.joy) {
        this.joy = { id: event.pointerId, x: event.clientX, y: event.clientY };
        this.pad.hidden = false;
        this.pad.style.left = `${event.clientX}px`;
        this.pad.style.top = `${event.clientY}px`;
      }
    });
    surface.addEventListener('mousedown', (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.mouseX = event.clientX;
      this.mouseY = event.clientY;
      if (event.button === 0) {
        this.mouseAttack = true;
        this.mouseAim = true;
      }
      if (event.button === 2) this.latch('skillEdge');
    });
    window.addEventListener('mouseup', (event) => {
      if (event.button === 0) {
        this.mouseAttack = false;
        this.mouseAim = false;
      }
    });
    window.addEventListener('pointermove', (event) => {
      if (event.pointerType === 'mouse') {
        this.mouseX = event.clientX;
        this.mouseY = event.clientY;
      }
      if (this.padPointer?.id === event.pointerId) this.movePadVector(event);
      if (this.joy?.id !== event.pointerId) return;
      const deltaX = event.clientX - this.joy.x;
      const deltaY = event.clientY - this.joy.y;
      const distance = Math.hypot(deltaX, deltaY);
      const scale = Math.min(1, 42 / (distance || 1));
      this.jx = deltaX * scale / 42;
      this.jy = deltaY * scale / 42;
      this.pad.firstElementChild.style.transform = `translate(${deltaX * scale}px,${deltaY * scale}px)`;
    });
    const release = (event) => {
      const action = this.pointers.get(event.pointerId);
      this.pointers.delete(event.pointerId);
      if (action && ![...this.pointers.values()].includes(action)) this.buttons.get(action)?.classList.remove('held');
      if (event.type === 'pointercancel' && event.pointerType === 'mouse') {
        this.mouseAttack = false;
        this.mouseAim = false;
      }
      if (this.padPointer?.id === event.pointerId) this.releaseMovePad();
      if (this.joy?.id === event.pointerId) {
        this.joy = null;
        this.jx = 0;
        this.jy = 0;
        this.pad.hidden = true;
      }
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    for (const type of ['contextmenu', 'dragstart', 'selectstart']) {
      surface.addEventListener(type, (event) => event.preventDefault());
    }
    // Inn panels must remain scrollable. Combat alone suppresses native touch gestures.
    surface.addEventListener('touchmove', (event) => event.preventDefault(), { passive: false });
  }

  setAutoAttack(on) {
    this.autoAttack = !!on;
    globalThis.localStorage?.setItem('arpg.autoAttack', on ? '1' : '0');
    document.querySelector('#attack')?.classList.toggle('auto', this.autoAttack);
    document.querySelector('#actions')?.classList.toggle('auto', this.autoAttack);
    if (!this.autoAttack) this.releaseMovePad();
    document.dispatchEvent(new CustomEvent('arpg:auto-attack'));
  }

  movePadVector(event) {
    const rect = this.movePad.getBoundingClientRect();
    const deltaX = event.clientX - (rect.left + rect.width / 2);
    const deltaY = event.clientY - (rect.top + rect.height / 2);
    const scale = Math.min(1, 36 / (Math.hypot(deltaX, deltaY) || 1));
    this.px = deltaX * scale / 36;
    this.py = deltaY * scale / 36;
    if (this.movePad.firstElementChild) {
      this.movePad.firstElementChild.style.transform = `translate(${deltaX * scale}px,${deltaY * scale}px)`;
    }
  }

  releaseMovePad() {
    this.padPointer = null;
    this.px = 0;
    this.py = 0;
    if (this.movePad?.firstElementChild) this.movePad.firstElementChild.style.transform = '';
  }

  latch(action) {
    this.edges[action] = true;
  }

  reset() {
    this.keys.clear();
    this.pointers.clear();
    this.edges = {};
    this.joy = null;
    this.jx = 0;
    this.jy = 0;
    this.releaseMovePad();
    this.mouseAim = false;
    this.mouseAttack = false;
    this.pad.hidden = true;
    for (const button of this.buttons.values()) button.classList.remove('held');
  }

  consume() {
    const value = this.value;
    const keys = this.keys;
    value.mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0)
      - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + this.jx + this.px;
    value.my = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0)
      - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) + this.jy + this.py;
    value.aimX = 0;
    value.aimY = 0;
    let held = this.mouseAttack;
    for (const action of this.pointers.values()) if (action === 'attack') held = true;
    value.attack = keys.has('KeyJ') || held || !!this.edges.attackTap;
    value.autoAttack = this.autoAttack;
    value.dodgeHeld = this.enabled && (keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || [...this.pointers.values()].includes('dodgeEdge')); 
    if (this.mouseAim) this.aimVector(this.mouseX, this.mouseY, value);
    for (const action of ['skillEdge', 'skill2Edge', 'skill3Edge', 'dodgeEdge', 'potionEdge', 'manaEdge', 'scrollEdge']) {
      value[action] = !!this.edges[action];
    }
    for (const action in this.edges) this.edges[action] = false;
    return value;
  }
}
