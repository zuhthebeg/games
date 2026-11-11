export const QUALITY_PRESETS = Object.freeze({
  low: Object.freeze({ pixelRatio: 1, shadows: false, particles: 0.5, fog: false, outlines: false }),
  medium: Object.freeze({ pixelRatio: 1.5, shadows: true, particles: 1, fog: true, outlines: true }),
  high: Object.freeze({ pixelRatio: 2, shadows: true, particles: 1, fog: true, outlines: true }),
});

const QUALITY_LEVELS = ['low', 'medium', 'high'];
const FRAME_WINDOW = 60;
const SLOW_FRAME_LIMIT = 33;
const SLOW_DURATION = 3000;

export class AutoQualityController {
  constructor(mode = 'automatic') {
    this.samples = new Float32Array(FRAME_WINDOW);
    this.sorted = new Float32Array(FRAME_WINDOW);
    this.sampleCount = 0;
    this.writeIndex = 0;
    this.slowDuration = 0;
    this.setMode(mode);
  }

  setMode(mode) {
    this.mode = QUALITY_PRESETS[mode] ? mode : 'automatic';
    this.level = 1;
    this.sampleCount = 0;
    this.writeIndex = 0;
    this.slowDuration = 0;
    return this.quality;
  }

  get quality() {
    return this.mode === 'automatic' ? QUALITY_LEVELS[this.level] : this.mode;
  }

  recordFrame(frameMs) {
    if (this.mode !== 'automatic' || !Number.isFinite(frameMs) || frameMs < 0) return this.quality;
    this.samples[this.writeIndex] = frameMs;
    this.writeIndex = (this.writeIndex + 1) % FRAME_WINDOW;
    this.sampleCount = Math.min(FRAME_WINDOW, this.sampleCount + 1);
    for (let index = 0; index < this.sampleCount; index += 1) {
      const sample = this.samples[index];
      let position = index;
      while (position > 0 && this.sorted[position - 1] > sample) {
        this.sorted[position] = this.sorted[position - 1];
        position -= 1;
      }
      this.sorted[position] = sample;
    }
    const middle = Math.floor(this.sampleCount / 2);
    const median = this.sampleCount % 2
      ? this.sorted[middle]
      : (this.sorted[middle - 1] + this.sorted[middle]) / 2;
    this.slowDuration = median > SLOW_FRAME_LIMIT ? this.slowDuration + frameMs : 0;
    if (this.slowDuration >= SLOW_DURATION && this.level > 0) {
      this.level -= 1;
      this.slowDuration = 0;
      this.sampleCount = 0;
      this.writeIndex = 0;
      this.samples.fill(0);
    }
    return this.quality;
  }
}
