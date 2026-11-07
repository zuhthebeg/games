import assert from 'node:assert/strict';
import test from 'node:test';
import { InputLayer } from '../js/core/input.js';
import { BUTTONS } from '../js/sim/world.js';

class ElementStub {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.handlers = {};
    this.parentElement = null;
    this.style = {};
  }

  addEventListener(type, handler, options) {
    this.handlers[type] = handler;
    options?.signal?.addEventListener('abort', () => {
      if (this.handlers[type] === handler) delete this.handlers[type];
    });
  }

  setPointerCapture() {}

  getBoundingClientRect() {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
}

test('a touch press released before the tick is latched once', () => {
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const joystick = new ElementStub();
  const attack = new ElementStub({ button: String(BUTTONS.ATTACK) });
  joystick.parentElement = { querySelectorAll: () => [attack] };
  const controls = { querySelector: (selector) => selector === '[data-joystick]' ? joystick : new ElementStub() };
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const input = new InputLayer({ canvas, controls });
  attack.handlers.pointerdown({ pointerId: 4, preventDefault() {} });
  attack.handlers.pointerup({ pointerId: 4 });
  assert.equal(input.nextTick().buttons, BUTTONS.ATTACK);
  assert.equal(input.nextTick().buttons, 0);
  input.destroy();
  globalThis.window = oldWindow;
});

test('a held keyboard button reports its bit on successive ticks', () => {
  const oldWindow = globalThis.window;
  let down;
  let up;
  globalThis.window = {
    addEventListener(type, handler) { if (type === 'keydown') down = handler; if (type === 'keyup') up = handler; },
    removeEventListener() {},
  };
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const input = new InputLayer({ canvas, controls: { querySelector: () => null } });
  down({ code: 'KeyJ', preventDefault() {} });
  assert.equal(input.nextTick().buttons, BUTTONS.ATTACK);
  assert.equal(input.nextTick().buttons, BUTTONS.ATTACK);
  up({ code: 'KeyJ' });
  assert.equal(input.nextTick().buttons, 0);
  input.destroy();
  globalThis.window = oldWindow;
});

test('a keyboard press released before the tick is latched once', () => {
  const oldWindow = globalThis.window;
  let down;
  let up;
  globalThis.window = {
    addEventListener(type, handler) { if (type === 'keydown') down = handler; if (type === 'keyup') up = handler; },
    removeEventListener() {},
  };
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const input = new InputLayer({ canvas, controls: { querySelector: () => null } });
  down({ code: 'KeyJ', preventDefault() {} });
  up({ code: 'KeyJ' });
  assert.equal(input.nextTick().buttons, BUTTONS.ATTACK);
  assert.equal(input.nextTick().buttons, 0);
  input.destroy();
  globalThis.window = oldWindow;
});

test('WASD and arrow keys move the virtual joystick axes', () => {
  const oldWindow = globalThis.window;
  let down;
  let up;
  globalThis.window = {
    addEventListener(type, handler) { if (type === 'keydown') down = handler; if (type === 'keyup') up = handler; },
    removeEventListener() {},
  };
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const input = new InputLayer({ canvas, controls: { querySelector: () => null } });
  down({ code: 'KeyW', preventDefault() {} });
  assert.equal(input.nextTick().moveZ, -127);
  up({ code: 'KeyW' });
  down({ code: 'ArrowRight', preventDefault() {} });
  assert.equal(input.nextTick().moveX, 127);
  up({ code: 'ArrowRight' });
  input.destroy();
  globalThis.window = oldWindow;
});

test('destroy removes touch listeners from the persistent controls', () => {
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener() {}, removeEventListener() {} };
  const joystick = new ElementStub();
  const attack = new ElementStub({ button: String(BUTTONS.ATTACK) });
  joystick.parentElement = { querySelectorAll: () => [attack] };
  const controls = { querySelector: (selector) => selector === '[data-joystick]' ? joystick : new ElementStub() };
  const canvas = { addEventListener() {}, removeEventListener() {} };
  const input = new InputLayer({ canvas, controls });
  assert.ok(attack.handlers.pointerdown && joystick.handlers.pointerdown);
  input.destroy();
  assert.deepEqual(Object.keys(attack.handlers), []);
  assert.deepEqual(Object.keys(joystick.handlers), []);
  globalThis.window = oldWindow;
});
