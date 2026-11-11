// Compact wire-only schema. This module never mutates simulation objects.
export const VERSION = 1;
export const SNAPSHOT_TICKS = 4;
const q = (n, scale = 100) => Math.round(n * scale);
export function envelope(type, hunt, seq, payload) {
  return { v: VERSION, type, hunt, seq, payload };
}
export function validEnvelope(p, hunt) {
  return !!p && p.v === VERSION && typeof p.type === 'string' &&
    p.hunt === hunt && Number.isSafeInteger(p.seq) && p.seq >= 0 &&
    p.payload !== null && typeof p.payload === 'object';
}
export const compatible = p => p?.v === VERSION;
export function encodeMonster(sim, seq, hunt) {
  const m = sim.m;
  return envelope('world', hunt, seq, {
    k: sim.tick,
    m: [q(m.x), q(m.z), q(m.y), q(m.yaw, 1000), q(m.spin, 1000),
      m.state, m.startTick ?? sim.tick - Math.round(m.t * 60), q(m.t, 1000),
      m.hp, m.maxHp, q(m.brk.head), q(m.brk.tail), q(m.brk.legs),
      +m.broke.head | (+m.broke.tail << 1), +m.enr, m.targetId ?? null, m.ak],
    p: sim.projs.map(p => [p.id, q(p.x), q(p.z), q(p.vx), q(p.vz),
      q(p.life, 1000), q(p.rad), p.dmg, +p.heavy, p.kind]),
    c: sim.carts, tm: q(sim.time, 1000), over: sim.over, win: sim.win
  });
}
export function decodeMonster(packet) {
  const p = packet.payload, a = p.m;
  return {
    tick: p.k,
    m: { x: a[0]/100, z: a[1]/100, y: a[2]/100, yaw: a[3]/1000,
      spin: a[4]/1000, state: a[5], startTick: a[6], t: a[7]/1000,
      hp: a[8], maxHp: a[9], brk: { head: a[10]/100, tail: a[11]/100, legs: a[12]/100 },
      broke: { head: !!(a[13]&1), tail: !!(a[13]&2) }, enr: !!a[14], targetId: a[15], ak: a[16] },
    projs: p.p.map(a => ({ id: a[0], x: a[1]/100, z: a[2]/100,
      vx: a[3]/100, vz: a[4]/100, life: a[5]/1000, rad: a[6]/100,
      dmg: a[7], heavy: !!a[8], kind: a[9] })),
    carts: p.c, time: p.tm/1000, over: p.over, win: p.win
  };
}
export function encodeHunter(p, tick, seq, hunt) {
  return envelope('hunter', hunt, seq, { k: tick,
    p: [p.id, q(p.x), q(p.z), q(p.yaw,1000), p.state,
      tick - Math.round(p.t*60), q(p.hp), p.maxHp, p.weapon, +p.lock,
      q(p.spin,1000), q(p.st)] });
}
export function decodeHunter(packet) {
  const a = packet.payload.p;
  return { tick: packet.payload.k, id: a[0], x: a[1]/100, z: a[2]/100,
    yaw: a[3]/1000, state: a[4], startTick: a[5], hp: a[6]/100,
    maxHp: a[7], weapon: a[8], lock: !!a[9], spin: a[10]/1000, st: a[11]/100 };
}
export const byteLength = packet => new TextEncoder().encode(JSON.stringify(packet)).length;
// State streams are independently sequenced per authenticated sender and type.
// Event streams deliberately bypass this filter (reliable action ordering).
export class LatestState {
  constructor() { this.seq = new Map(); }
  accept(from, p) {
    const key = JSON.stringify([from,p.type]);
    if (p.seq <= (this.seq.get(key) ?? -1)) return false;
    this.seq.set(key,p.seq); return true;
  }
}
