import { TICK_HZ, step } from '../sim/world.js';

const STEP_SECONDS = 1 / TICK_HZ;
const MAX_STEPS = 5;

export class FixedStepLoop {
  constructor({ world, playerId, input, render, onTick }) {
    this.world = world;
    this.playerId = playerId;
    this.input = input;
    this.render = render;
    this.onTick = onTick;
    this.previous = structuredClone(world);
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.hidden = document.hidden;
    this.frame = (time) => this.onFrame(time);
    this.visibility = () => {
      this.hidden = document.hidden;
      this.accumulator = 0;
      this.lastTime = 0;
    };
    document.addEventListener('visibilitychange', this.visibility);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = 0;
    requestAnimationFrame(this.frame);
  }

  stop() {
    this.running = false;
    document.removeEventListener('visibilitychange', this.visibility);
  }

  pause() {
    this.paused = true;
    this.accumulator = 0;
    this.lastTime = 0;
  }

  resume() {
    this.paused = false;
    this.lastTime = 0;
  }

  onFrame(time) {
    if (!this.running) return;
    if (this.hidden || this.paused) {
      this.lastTime = time;
      requestAnimationFrame(this.frame);
      return;
    }
    const delta = this.lastTime ? Math.min(0.25, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    this.accumulator += delta;
    let steps = 0;
    while (this.accumulator >= STEP_SECONDS && steps < MAX_STEPS) {
      this.previous = structuredClone(this.world);
      step(this.world, { [this.playerId]: this.input.nextTick() });
      this.accumulator -= STEP_SECONDS;
      steps += 1;
      this.onTick?.(this.world);
    }
    if (steps === MAX_STEPS && this.accumulator >= STEP_SECONDS) this.accumulator = 0;
    this.render(this.previous, this.world, this.accumulator / STEP_SECONDS);
    requestAnimationFrame(this.frame);
  }
}
