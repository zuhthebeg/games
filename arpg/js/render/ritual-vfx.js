import { Container, Graphics } from '../../vendor/pixi-8.22.0.min.mjs';
import { RITUAL_CAPS, RITUAL_POINTS, faceAtPhase } from './ritual-state.js';

const CHIAO_POINT = RITUAL_POINTS.find(point => point.id === 'chiao');
const INCENSE_POINT = RITUAL_POINTS.find(point => point.id === 'incense');
const BURN_POINT = RITUAL_POINTS.find(point => point.id === 'burn');
const emberColors = [0xffb347, 0xf28a3b, 0xd66535];

const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

function drawBlock(block, phase) {
  const face = faceAtPhase(phase);
  if (face === block.face) return;
  block.face = face;
  block.body.clear();
  block.faceNode.clear();
  block.body.moveTo(-15, 0).quadraticCurveTo(-12, -9, -4, -9)
    .quadraticCurveTo(1, -9, 3, -4).quadraticCurveTo(6, -1, 13, -2)
    .quadraticCurveTo(16, 0, 13, 2).quadraticCurveTo(6, 1, 3, 4)
    .quadraticCurveTo(1, 9, -4, 9).quadraticCurveTo(-12, 9, -15, 0)
    .fill({ color: face === 'flat' ? 0xb84743 : 0x7f242c, alpha: .98 })
    .stroke({ color: 0x431b1e, width: 1.5, alpha: .95 });
  if (face === 'flat') {
    block.faceNode.roundRect(-10, -4, 20, 8, 3).fill({ color: 0xd8786b, alpha: .55 });
  } else {
    block.faceNode.ellipse(-4, -2, 7, 4).fill({ color: 0xd45d51, alpha: .45 });
    block.faceNode.ellipse(-5, -3, 3, 1.5).fill({ color: 0xf0a08b, alpha: .55 });
  }
}

export class RitualVfx {
  constructor(layer, { onTok = () => {}, stopAudio = () => {} } = {}) {
    this.layer = layer;
    this.onTok = onTok;
    this.stopAudio = stopAudio;
    this.blocks = Array.from({ length: RITUAL_CAPS.blocks }, () => {
      const node = new Container(), body = new Graphics(), faceNode = new Graphics();
      node.addChild(body, faceNode); layer.addChild(node);
      node.visible = false;
      return { node, body, faceNode, face: null, played: [] };
    });
    this.sticks = Array.from({ length: RITUAL_CAPS.sticks }, () => {
      const node = new Graphics(); node.visible = false; layer.addChild(node); return node;
    });
    this.embers = Array.from({ length: RITUAL_CAPS.embers }, (_, index) => {
      const node = new Graphics(); node.visible = false; layer.addChild(node); return { node, index };
    });
    this.paper = new Graphics(); this.paper.visible = false; layer.addChild(this.paper);
    this.activeSeq = 0;
    this.lastElapsed = 0;
  }

  resetNodes(stopAudio = false) {
    for (const block of this.blocks) block.node.visible = false;
    for (const node of this.sticks) node.visible = false;
    for (const ember of this.embers) ember.node.visible = false;
    this.paper.visible = false;
    if (stopAudio) this.stopAudio();
  }

  clear() {
    this.resetNodes(true);
    this.activeSeq = 0;
    this.lastElapsed = 0;
  }

  update(state, player, reduced) {
    this.resetNodes(false);
    if (!state) return;
    const active = state.active;
    const age = Math.max(0, 20 - state.sticksLeft);
    if (state.sticksLeft > 0 || active?.id === 'incense') {
      const reveal = Math.min(1, age / 1.2);
      [-7, 0, 7].forEach((offset, index) => {
        const node = this.sticks[index];
        node.clear().moveTo(offset, 4).lineTo(offset + (index - 1) * 1.2, -23)
          .stroke({ color: 0x9a5038, width: 2.2, alpha: .95 })
          .circle(offset + (index - 1) * 1.2, -25, 3.2).fill({ color: 0xd77c3e, alpha: .35 + reveal * .2 });
        node.position.set(INCENSE_POINT.target.x, INCENSE_POINT.target.y);
        node.alpha = reveal;
        node.visible = true;
      });
    }
    if (!active) return;
    if (active.id === 'chiao' && active.phase !== 'intro') this.updateChiao(active, reduced);
    if (active.id === 'burn') this.updateBurn(active, reduced);
  }

  updateChiao(active, reduced) {
    if (active.seq !== this.activeSeq) {
      this.activeSeq = active.seq;
      this.lastElapsed = 0;
      this.blocks.forEach(block => { block.face = null; block.played = []; });
    }
    const flight = active.phase === 'flight';
    this.blocks.forEach((block, index) => {
      const plan = active.plan[index];
      const progress = flight ? Math.min(1, active.elapsed / plan.duration) : 1;
      const travel = flight ? Math.min(1, active.elapsed / .58) : 1;
      const startX = active.origin.x + (index ? 9 : -9);
      const startY = active.origin.y - 13;
      const targetX = CHIAO_POINT.target.x + (index ? 19 : -19);
      const targetY = CHIAO_POINT.target.y + 8;
      let x = lerp(startX, targetX, ease(travel)), y = lerp(startY, targetY, ease(travel));
      if (!reduced && flight) {
        y -= Math.sin(Math.PI * travel) * 58;
        const bounceTime = Math.max(0, active.elapsed - .58);
        let bounceLift = 0;
        for (let bounce = 0; bounce < plan.bounceCount; bounce++) {
          const local = Math.max(0, Math.min(1, (bounceTime - bounce * .28) / .28));
          bounceLift = Math.max(bounceLift, Math.sin(Math.PI * local) * (20 / (bounce + 1)));
        }
        y -= bounceLift;
      }
      const phase = plan.finalPhase * (reduced ? 1 : ease(progress));
      drawBlock(block, phase);
      block.node.position.set(x, y);
      block.node.rotation = Math.sin(progress * Math.PI) * .25;
      block.node.scale.set(1, .25 + Math.abs(Math.cos(phase)) * .75);
      block.node.alpha = reduced && active.phase === 'settled' ? Math.min(1, active.elapsed / .32) : 1;
      block.node.visible = true;
      if (flight) for (const impact of plan.impactTimes) {
        if (this.lastElapsed < impact && active.elapsed >= impact && !block.played.includes(impact)) {
          block.played.push(impact); this.onTok();
        }
      }
    });
    this.lastElapsed = active.elapsed;
  }

  updateBurn(active, reduced) {
    const elapsed = active.elapsed;
    const progress = reduced ? 1 : Math.min(1, elapsed / .58);
    const x = reduced ? BURN_POINT.target.x : lerp(active.origin.x, BURN_POINT.target.x, ease(progress));
    const y = reduced ? BURN_POINT.target.y : lerp(active.origin.y - 12, BURN_POINT.target.y, ease(progress)) - Math.sin(Math.PI * progress) * 42;
    this.paper.clear().rect(-13, -8, 26, 16).fill({ color: elapsed < 2 ? 0xd6ae4f : 0x51463a, alpha: 1 })
      .stroke({ color: 0x9f3e32, width: 2, alpha: elapsed < 2 ? .95 : .35 })
      .rect(-4, -4, 8, 4).fill({ color: 0xb13d35, alpha: elapsed < 2 ? .9 : .25 });
    this.paper.position.set(x, y);
    this.paper.rotation = progress * 1.8;
    this.paper.alpha = reduced ? Math.max(0, 1 - elapsed / 1.2) : elapsed < 2 ? 1 : Math.max(0, 1 - (elapsed - 2) / 1.5);
    this.paper.visible = true;
    if (!reduced && elapsed >= .4 && elapsed < 2) {
      this.embers.forEach(({ node, index }) => {
        const phase = (index * 1.71 + active.seq) % (Math.PI * 2);
        const rise = Math.min(1, (elapsed - .4) / 1.6);
        node.clear().moveTo(0, 4).quadraticCurveTo(-3, -5, 0, -11).quadraticCurveTo(4, -5, 2, 3)
          .fill({ color: emberColors[index % emberColors.length], alpha: .25 + .55 * Math.max(0, 1 - rise) });
        node.position.set(BURN_POINT.target.x + Math.cos(phase) * (7 + index % 4 * 3), BURN_POINT.target.y - 5 - rise * (18 + index % 5 * 8));
        node.rotation = phase;
        node.visible = true;
      });
    }
  }

  destroy() {
    this.clear();
    for (const block of this.blocks) block.node.destroy({ children: true });
    for (const node of this.sticks) node.destroy();
    for (const ember of this.embers) ember.node.destroy();
    this.paper.destroy();
    this.blocks.length = this.sticks.length = this.embers.length = 0;
  }
}
