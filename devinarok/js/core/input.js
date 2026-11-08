import { BUTTONS } from '../sim/world.js';

export function detectTouchFlick({ pointerType, elapsedMs, dx, dy }) {
  const distance = Math.hypot(dx, dy);
  if (pointerType !== 'touch' || elapsedMs < 0 || elapsedMs > 180 || distance < 28) return null;
  return {
    moveX: Math.round(dx / distance * 127),
    moveZ: Math.round(dy / distance * 127),
  };
}

const KEY_BINDINGS = {
  KeyJ: BUTTONS.ATTACK,
  KeyK: BUTTONS.DODGE,
  Space: BUTTONS.DODGE,
  Digit1: BUTTONS.SKILL1,
  Digit2: BUTTONS.SKILL2,
  Digit3: BUTTONS.SKILL3,
  KeyE: BUTTONS.INTERACT,
  KeyQ: BUTTONS.POTION,
};
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export class InputLayer {
  constructor({ canvas, controls }) {
    this.canvas = canvas;
    this.heldKeys = new Set();
    this.unreportedButtonKeys = new Set();
    this.heldPointers = new Map();
    this.latchedButtons = 0;
    this.seq = 0;
    this.moveX = 0;
    this.moveZ = 0;
    this.flickMove = null;
    this.aim = 192;
    this.devInputProvider = null;
    this.joystick = controls.querySelector('[data-joystick]');
    this.joystickKnob = controls.querySelector('[data-joystick-knob]');
    this.joystickAnchor = null;
    this.bindings = new Map();
    this.onKeyDown = (event) => {
      const code = event.code;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) event.preventDefault();
      if (KEY_BINDINGS[code] || MOVEMENT_KEYS.has(code)) {
        if (KEY_BINDINGS[code] && !this.heldKeys.has(code)) this.unreportedButtonKeys.add(code);
        this.heldKeys.add(code);
      }
    };
    this.onKeyUp = (event) => {
      if (this.unreportedButtonKeys.has(event.code)) this.latchedButtons |= KEY_BINDINGS[event.code] ?? 0;
      this.unreportedButtonKeys.delete(event.code);
      this.heldKeys.delete(event.code);
    };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.onCanvasDown = (event) => {
      if (event.clientX >= window.innerWidth / 2) return;
      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      this.joystickAnchor = { x: event.clientX, y: event.clientY };
      this.joystick.style.left = `${event.clientX}px`;
      this.joystick.style.top = `${event.clientY}px`;
      this.joystick.classList.add('floating');
      this.heldPointers.set(event.pointerId, {
        type: 'move',
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: event.timeStamp,
        pointerType: event.pointerType,
      });
      this.updateJoystick(event);
    };
    this.onCanvasMove = (event) => {
      if (this.heldPointers.get(event.pointerId)?.type === 'move') this.updateJoystick(event);
    };
    this.onCanvasUp = (event) => this.releasePointer(event.pointerId, event);
    this.canvas.addEventListener('pointerdown', this.onCanvasDown);
    this.canvas.addEventListener('pointermove', this.onCanvasMove);
    this.canvas.addEventListener('pointerup', this.onCanvasUp);
    this.canvas.addEventListener('pointercancel', this.onCanvasUp);
    this.touchListeners = new AbortController();
    this.bindTouch();
  }

  bindTouch() {
    const signal = this.touchListeners.signal;
    const on = (target, type, handler) => target?.addEventListener(type, handler, { signal });
    on(this.joystick, 'pointerdown', (event) => {
      this.joystick.setPointerCapture(event.pointerId);
      this.joystickAnchor = { x: event.clientX, y: event.clientY };
      this.heldPointers.set(event.pointerId, {
        type: 'move',
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        startedAt: event.timeStamp,
        pointerType: event.pointerType,
      });
      this.updateJoystick(event);
    });
    on(this.joystick, 'pointermove', (event) => {
      if (this.heldPointers.get(event.pointerId)?.type === 'move') this.updateJoystick(event);
    });
    for (const button of this.joystick?.parentElement?.querySelectorAll('[data-button]') ?? []) {
      const bit = Number(button.dataset.button);
      on(button, 'pointerdown', (event) => {
        event.preventDefault();
        button.setPointerCapture(event.pointerId);
        this.heldPointers.set(event.pointerId, { type: 'button', bit });
        this.bindings.set(event.pointerId, bit);
      });
      on(button, 'pointerup', (event) => this.releasePointer(event.pointerId, event));
      on(button, 'pointercancel', (event) => this.releasePointer(event.pointerId, event));
    }
    on(this.joystick, 'pointerup', (event) => this.releasePointer(event.pointerId, event));
    on(this.joystick, 'pointercancel', (event) => this.releasePointer(event.pointerId, event));
  }

  updateJoystick(event) {
    const rect = this.joystick.getBoundingClientRect();
    const centerX = this.joystickAnchor?.x ?? rect.left + rect.width / 2;
    const centerY = this.joystickAnchor?.y ?? rect.top + rect.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.max(1, Math.hypot(dx, dy));
    const scale = Math.min(1, 48 / length);
    this.moveX = Math.round(dx * scale / 48 * 127);
    this.moveZ = Math.round(dy * scale / 48 * 127);
    if (Math.hypot(this.moveX, this.moveZ) > 0) {
      this.aim = Math.round((Math.atan2(this.moveZ, this.moveX) / (Math.PI * 2) * 256 + 256) % 256);
    }
    if (this.joystickKnob) {
      this.joystickKnob.style.transform = `translate(${dx * scale}px, ${dy * scale}px)`;
    }
  }

  releasePointer(pointerId, event = null) {
    const pointer = this.heldPointers.get(pointerId);
    if (pointer?.type === 'button') this.latchedButtons |= pointer.bit;
    if (pointer?.type === 'move') {
      if (event?.type === 'pointerup') {
        const flick = detectTouchFlick({
          pointerType: pointer.pointerType ?? event.pointerType,
          elapsedMs: event.timeStamp - pointer.startedAt,
          dx: event.clientX - pointer.startX,
          dy: event.clientY - pointer.startY,
        });
        if (flick) {
          this.flickMove = flick;
          this.latchedButtons |= BUTTONS.DODGE;
          this.aim = Math.round((Math.atan2(flick.moveZ, flick.moveX) / (Math.PI * 2) * 256 + 256) % 256);
        }
      }
      this.moveX = 0;
      this.moveZ = 0;
      this.joystickAnchor = null;
      if (this.joystickKnob) this.joystickKnob.style.transform = '';
      this.joystick?.classList.remove('floating');
    }
    this.heldPointers.delete(pointerId);
    this.bindings.delete(pointerId);
  }

  nextTick() {
    if (this.devInputProvider) {
      const seq = ++this.seq;
      const input = { ...this.devInputProvider(seq), seq };
      delete input.attackHeld;
      return input;
    }
    let buttons = this.latchedButtons;
    this.latchedButtons = 0;
    let heldButtons = 0;
    for (const code of this.heldKeys) this.unreportedButtonKeys.delete(code);
    for (const code of this.heldKeys) heldButtons |= KEY_BINDINGS[code] ?? 0;
    for (const bit of this.bindings.values()) heldButtons |= bit;
    buttons |= heldButtons;
    let moveX = this.moveX;
    let moveZ = this.moveZ;
    if (this.flickMove) {
      moveX = this.flickMove.moveX;
      moveZ = this.flickMove.moveZ;
      this.flickMove = null;
    }
    const key = (code) => this.heldKeys.has(code);
    moveX += (key('KeyD') || key('ArrowRight') ? 127 : 0) - (key('KeyA') || key('ArrowLeft') ? 127 : 0);
    moveZ += (key('KeyS') || key('ArrowDown') ? 127 : 0) - (key('KeyW') || key('ArrowUp') ? 127 : 0);
    moveX = Math.max(-127, Math.min(127, moveX));
    moveZ = Math.max(-127, Math.min(127, moveZ));
    if (moveX || moveZ) this.aim = Math.round((Math.atan2(moveZ, moveX) / (Math.PI * 2) * 256 + 256) % 256);
    const input = { seq: ++this.seq, moveX, moveZ, aim: this.aim, buttons };
    if (heldButtons & BUTTONS.ATTACK) input.attackHeld = true;
    return input;
  }

  setDevInputProvider(provider) {
    if (provider !== null && typeof provider !== 'function') {
      throw new TypeError('Dev input provider must be a function or null');
    }
    this.devInputProvider = provider;
  }

  destroy() {
    this.devInputProvider = null;
    this.touchListeners.abort();
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.canvas.removeEventListener('pointerdown', this.onCanvasDown);
    this.canvas.removeEventListener('pointermove', this.onCanvasMove);
    this.canvas.removeEventListener('pointerup', this.onCanvasUp);
    this.canvas.removeEventListener('pointercancel', this.onCanvasUp);
  }
}
