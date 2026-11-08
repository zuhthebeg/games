import { TICK_HZ, step } from '../sim/world.js';

const STEP_SECONDS = 1 / TICK_HZ;
const MAX_STEPS = 5;

export class FixedStepLoop {
  constructor({ world, playerId, input, render, onTick, beforeStep, buildInput = (rawInput) => rawInput }) {
    this.world = world;
    this.playerId = playerId;
    this.input = input;
    this.buildInput = buildInput;
    this.render = render;
    this.onTick = onTick;
    this.beforeStep = beforeStep;
    this.previous = structuredClone(world);
    this.accumulator = 0;
    this.lastTime = 0;
    this.running = false;
    this.paused = false;
    this.speed = 1;
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

  stepOnce(inputs = null) {
    this.previous = structuredClone(this.world);
    this.beforeStep?.(this.world);
    const nextInputs = inputs ?? {
      [this.playerId]: this.buildInput(this.input.nextTick(), this.world),
    };
    step(this.world, nextInputs);
    this.onTick?.(this.world);
    return this.world;
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
    this.accumulator += delta * this.speed;
    let steps = 0;
    const maxSteps = Math.ceil(MAX_STEPS * this.speed);
    while (this.accumulator >= STEP_SECONDS && steps < maxSteps) {
      this.stepOnce();
      this.accumulator -= STEP_SECONDS;
      steps += 1;
    }
    if (steps === maxSteps && this.accumulator >= STEP_SECONDS) this.accumulator = 0;
    this.render(this.previous, this.world, this.accumulator / STEP_SECONDS);
    requestAnimationFrame(this.frame);
  }
}
