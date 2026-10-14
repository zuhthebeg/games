import test from 'node:test';
import assert from 'node:assert/strict';
import { InputLayer } from '../js/input.js';
class Element extends EventTarget {
  constructor(action) {
    super();
    this.dataset = { input: action };
    this.hidden = true;
    this.disabled = false;
    this.style = {};
    this.classList = {
      add() {
      }, remove() {
      }
    };
    this.firstElementChild = { style: {} };
  }
  setPointerCapture() {
  }
}
function fire(target, type, props = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, props);
  target.dispatchEvent(e);
}
function fixture() {
  globalThis.window = new EventTarget();
  window.closest = () => null;
  globalThis.document = new Element();
  globalThis.innerWidth = 390;
  const pad = new Element();
  const surface = new Element();
  const buttons = ['attack', 'dodgeEdge', 'skillEdge', 'potionEdge', 'scrollEdge', 'manaEdge']
    .map(action => new Element(action));
  document.querySelector = () => pad;
  const actions = { querySelectorAll: () => buttons };
  const input = new InputLayer(surface, actions, (_x, _y, v) => {
    v.aimX = 10;
    v.aimY = 20;
  });
  return { input, surface, buttons };
}
test('input: short key/button taps persist until consumed once', () => {
  const { input, buttons } = fixture();
  for (const [code, edge] of [
    ['Space', 'dodgeEdge'],
    ['KeyK', 'skillEdge'],
    ['KeyQ', 'potionEdge'],
    ['KeyE', 'manaEdge'],
    ['KeyR', 'scrollEdge']
  ]) {
    fire(window, 'keydown', { code });
    fire(window, 'keyup', { code });
    assert.equal(input.consume()[edge], true);
    assert.equal(input.consume()[edge], false);
  }
  fire(buttons[2], 'pointerdown', { pointerId: 7 });
  fire(window, 'pointerup', { pointerId: 7 });
  assert.equal(input.consume().skillEdge, true);
  assert.equal(input.consume().skillEdge, false);
});
test('input: mouse chords, attack hold, touch auto-aim and reset', () => {
  const { input, surface, buttons } = fixture();
  fire(surface, 'mousedown', { button: 0, clientX: 100, clientY: 200 });
  fire(surface, 'mousedown', { button: 2, clientX: 100, clientY: 200 });
  let v = input.consume();
  assert.equal(v.attack, true);
  assert.equal(v.skillEdge, true);
  assert.equal(v.aimX, 10);
  fire(window, 'mouseup', { button: 2 });
  assert.equal(input.consume().attack, true);
  fire(window, 'mouseup', { button: 0 });
  assert.equal(input.consume().attack, false);
  fire(buttons[0], 'pointerdown', { pointerId: 8 });
  v = input.consume();
  assert.equal(v.attack, true);
  assert.equal(v.aimX, 0);
  assert.equal(v.aimY, 0);
  fire(window, 'pointercancel', { pointerId: 8 });
  assert.equal(input.consume().attack, false);
  input.latch('dodgeEdge');
  input.reset();
  assert.equal(input.consume().dodgeEdge, false);
});
test('input: fixed move pad steers only in auto-attack mode and releases cleanly', () => {
  globalThis.window = new EventTarget();
  window.closest = () => null;
  globalThis.document = new Element();
  globalThis.innerWidth = 390;
  globalThis.localStorage = { getItem: () => '1', setItem() {} };
  const joystick = new Element();
  const movePad = new Element();
  movePad.getBoundingClientRect = () => ({ left: 200, top: 700, width: 96, height: 96 });
  const surface = new Element();
  joystick.classList.toggle = () => {};
  document.querySelector = (selector) => (selector === '#movepad' ? movePad : joystick);
  document.dispatchEvent = () => true;
  const input = new InputLayer(surface, { querySelectorAll: () => [] }, () => {});
  assert.equal(input.autoAttack, true);
  fire(movePad, 'pointerdown', { pointerId: 3, clientX: 248 + 36, clientY: 748 });
  assert.equal(input.consume().mx, 1);
  fire(window, 'pointermove', { pointerId: 3, pointerType: 'touch', clientX: 248, clientY: 748 - 90 });
  const v = input.consume();
  assert.equal(v.mx, 0);
  assert.equal(v.my, -1);
  fire(window, 'pointerup', { pointerId: 3 });
  assert.equal(input.consume().my, 0);
  input.setAutoAttack(false);
  fire(movePad, 'pointerdown', { pointerId: 4, clientX: 284, clientY: 748 });
  assert.equal(input.consume().mx, 0, 'pad inert when auto attack is off');
  input.setAutoAttack(true);
  fire(movePad, 'pointerdown', { pointerId: 5, clientX: 284, clientY: 748 });
  input.setAutoAttack(false);
  assert.equal(input.consume().mx, 0, 'turning auto off releases a held pad');
});
