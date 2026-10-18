import { currentLoad, usedConsumables } from '../meta/run.js';
import { InvasionLoot } from './invasion-loot.js';
import { validParty, invasionProfile } from './invasion.js';
import { TEAM_MONSTER } from '../sim/core.js';
import { enableGuestDodgeLag } from '../sim/dodge-lag.js';
import { createWorld, addPlayer, startStage, step, setLoad } from '../sim/world.js';
import { InputSender, InputLatch, InputQueue, SnapshotBuffer, EDGES, TIMED_SKILL_EDGES, encodeSnapshot, localView, partyHpScale } from './protocol.js';

import { releaseCarrier } from '../sim/quest-objectives.js';
import { LocalPrediction } from './prediction.js';
import { presentSkillEvents } from './skill-presentation.js';
import { boundedMasteryLevels } from '../content/skill-growth.js';
import { MASTERY_SKILLS, MASTERY_MAX } from '../meta/skill-mastery.js';
const validLevels = levels => levels && typeof levels === 'object' && !Array.isArray(levels)
  && Object.entries(levels).every(([id, n]) => MASTERY_SKILLS.includes(id) && Number.isInteger(n) && n >= 1 && n <= MASTERY_MAX);

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const TICK_MS = 1000 / 30;
// Frame inputs merged into the next whole tick: newest axes/held buttons, any edge pressed in between.
const mergeInput = (held, input) => {
  const next = { ...input };
  if (held) for (const k of EDGES) next[k] = !!(held[k] || input[k]);
  next.skillViewTicks = {};
  for (const k of TIMED_SKILL_EDGES) if (next[k]) {
    next.skillViewTicks[k] = held?.[k] ? held.skillViewTicks?.[k]
      : Object.hasOwn(input.skillViewTicks || {}, k) ? input.skillViewTicks[k] : input.viewTick;
  }
  if (held?.dodgeEdge) next.viewTick = held.viewTick;
  return next;
};

// Pure transport adapter: no DOM/storage. Only the host ever owns or steps a sim world.
export class CoopSession {
  constructor({ uid, host, players, profile, config, sendRt = () => {}, sendAction = () => {},
    onBegin = () => {}, onBeforeTick = () => {}, onFrame = () => {}, onLost = () => {}, onStatus = () => {} }) {
    Object.assign(this, { uid, host, profile, config, sendRt, sendAction, onBegin, onBeforeTick, onFrame, onLost, onStatus });
    this.isHost = uid === host; this.players = new Set(players); this.profiles = { [uid]: profile };
    this.phase = 'prepare'; this.world = null; this.buffer = new SnapshotBuffer(uid);
    this.prediction = new LocalPrediction(uid, { multiplayerDodge: true }); this.appliedInputSeqs = {};
    this.sender = new InputSender(); this.latches = {}; this.journal = []; this.deathTicks = new Map(); this.eventSeq = 0; this.eventAck = 0; this.acks = {};
    this.tickLeft = 0; this.tickInput = null; this.helloLeft = 0; this.now = 0; this.lastHostAt = 0; this.pingLeft = 0; this.inputLeft = 0; this.rtt = null;
    this.bytes = 0; this.snapshots = 0; this.lost = false;
  }
  decorate(view) {
    if (!view) return null;
    return { ...view, ...(this.config.invasion ? { invasionAccount: this.isHost ? this.lootLedger?.state(this.uid) : this.invasionAccount,
      lootDrops: this.isHost ? this.lootLedger?.dropsView() : this.lootDrops || [] } : {}), entities: view.entities.map(p => p.kind === 'player' ? { ...p,
      equipmentVisual: this.profiles[p.pid]?.equipmentVisual, name: this.profiles[p.pid]?.name,
      skillMasteryLevels: this.isHost ? this.profiles[p.pid]?.skillMasteryLevels : p.skillMasteryLevels ?? this.profiles[p.pid]?.skillMasteryLevels } : p) };
  }
  setMastery(levels) {
    if (!validLevels(levels)) return;
    this.profile = { ...this.profile, skillMasteryLevels: { ...levels } };
    this.profiles[this.uid] = { ...this.profiles[this.uid], skillMasteryLevels: { ...levels } };
    if (this.isHost && this.world) { const pawn = this.world.entities.find(e => e.pid === this.uid); if (pawn) pawn.skillMasteryLevels = boundedMasteryLevels(levels); }
    if (!this.isHost) this.sendRt({ t: 'mastery', levels: { ...levels } });
  }
  begin(data) {
    if (this.phase !== 'prepare' || !data?.profiles || !data.profiles[this.uid]) return;
    if (!!data.config?.invasion !== !!this.config.invasion || !validParty(data.config, data.profiles)
      || Object.keys(data.profiles).some(id => !this.players.has(id)) || Object.keys(data.profiles).length !== this.players.size
      || data.config.invasion && (this.profile.invasionConsent !== true || data.profiles[this.uid].role !== this.profile.role
        || JSON.stringify(data.profiles[this.uid].rewardSave) !== JSON.stringify(this.profile.rewardSave)
        || typeof data.runId !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(data.runId))) {
      this.onStatus('침입 동의·계보·역할·지역을 확인하세요. 일반 협동방은 적대 해골을 받지 않습니다.'); return;
    }
    this.config = data.config; this.profiles = data.config.invasion
      ? Object.fromEntries(Object.entries(data.profiles).map(([id,p])=>[id,invasionProfile(p)])) : data.profiles; this.seed = data.seed;
    this.profiles = Object.fromEntries(Object.entries(this.profiles).map(([pid, p]) => [pid, { ...p, ...(p.skillMasteryLevels ? { skillMasteryLevels: boundedMasteryLevels(p.skillMasteryLevels) } : {}) }]));
    this.players = new Set(Object.keys(data.profiles));
    if (this.isHost) {
      const party = Object.values(this.profiles).filter(p => !data.config.invasion || p.role === 'hunter');
      const levels = party.map(p => p.level || 1);
      const partyLevel = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
      this.world = createWorld({ seed: data.seed, threat: data.config.threat, multiplayerDodge: true,
        partyHpMult: partyHpScale(party.length, partyLevel, data.config.stageId) });
      let i = 0;
      for (const [pid, p] of Object.entries(this.profiles)) {
        const player = addPlayer(this.world, { pid, weapon: p.weapon, skillMasteryLevels: boundedMasteryLevels(p.skillMasteryLevels), y: 380 + i++ * 35, mods: { ...p.mods, threat: data.config.threat } });
        if (data.config.invasion) {
          player.invasionRole = p.role;
          if (p.role === 'invader') { player.team = TEAM_MONSTER; player.skeletal = true; player.x = this.world.arena.w * .78; player.facing = Math.PI; }
        }
        setLoad(this.world, pid, p.load ?? 0);
        // Host's own input has no latency: newest value. Guests: ordered per-tick commands.
        this.latches[pid] = pid === this.uid ? new InputLatch() : new InputQueue();
        if (pid !== this.uid) enableGuestDodgeLag(this.world, pid);
      }
      startStage(this.world, data.config.stageId);
      if (data.config.invasion) {
        this.world.round.invasion = true;
        this.lootLedger = new InvasionLoot(this.profiles, data.seed, data.runId, data.config.stageId, data.config.threat);
      }
    }
    this.startData = data; this.phase = 'running'; this.lastHostAt = this.now;
    this.onBegin(this.config, this.isHost ? this.decorate(localView(this.world, this.uid)) : null);
    if (this.isHost) this.broadcast();
  }
  tryStart() {
    if (!this.isHost || this.phase !== 'prepare' || this.players.size < 2 || this.players.size > 4) return;
    if ([...this.players].some(id => !this.profiles[id])) return;
    if ([...this.players].some(id => (this.profiles[id].threats?.[this.config.stageId] ?? 1) < this.config.threat)) {
      this.onStatus('동료의 위협도가 잠겨 있습니다. 나가서 낮은 위협도를 선택하세요.'); return;
    }
    const profiles = Object.fromEntries([...this.players].map(id => [id, this.profiles[id]]));
    if (!validParty(this.config, profiles)) { this.onStatus('침입 동의·계보·역할·지역을 확인하세요.'); return; }
    const data = { ...(this.config.invasion ? { runId: crypto.randomUUID() } : {}), config: this.config, profiles, seed: this.config.seed ?? crypto.getRandomValues(new Uint32Array(1))[0] };
    this.sendAction({ type: 'ARPG_START', payload: data, __snapshot: data }); this.begin(data);
  }
  action(a) {
    // Invasion starts only through authenticated-from-host RT snapshots; relay actions are not sender-bound.
    if (this.isHost || this.config.invasion) return;
    if (a?.type === 'ARPG_START') this.begin(a.payload);
    else if (a?.type === '__resync') this.begin(a.__snapshot);
  }
  rt(from, data, now = this.now) {
    if (!data || !this.players.has(from) || this.lost) return;
    if (data.t === 'claim' && this.isHost && this.lootLedger) {
      this.lootLedger.claim(this.world, from, {id:data.id});
    } else if (data.t === 'mastery' && this.isHost && this.profiles[from] && validLevels(data.levels)) {
      this.profiles[from] = { ...this.profiles[from], skillMasteryLevels: { ...data.levels } };
      const pawn = this.world?.entities.find(e => e.pid === from); if (pawn) pawn.skillMasteryLevels = boundedMasteryLevels(data.levels);
    } else if (data.t === 'profile' && this.isHost && this.phase === 'prepare') {
      this.profiles[from] = data.profile; this.tryStart();
    } else if (data.t === 'input' && this.isHost && this.world && from !== this.uid) {
      if (this.latches[from]?.receive(data, now)) {
        this.acks[from] = Math.max(this.acks[from] || 0, Math.min(this.eventSeq, data.ack || 0));
        if (!this.lootLedger) setLoad(this.world, from, Math.max(0, Number.isFinite(data.load) ? data.load : 0));
      }
    } else if (data.t === 'snapshot' && !this.isHost && from === this.host) {
      this.lastHostAt = now;
      if (this.phase === 'prepare' && data.start) this.begin(data.start);
      if (this.phase === 'prepare') return;
      const fresh = this.buffer.push(data, now);
      // A retransmitted final objective packet can repair a journal gap at the same tick.
      if (!fresh && !((data.objective || this.config.invasion) && data.tick === this.buffer.frames.at(-1)?.world.tick && this.eventAck < data.eventSeq)) return;
      if (this.config.invasion) { this.invasionAccount = data.invasionAccounts?.[this.uid]; this.lootDrops = data.lootDrops || []; }
      if (fresh) this.prediction.reconcile(this.buffer.frames.at(-1).world);
      const events = [];
      for (const row of data.events || []) if (row.seq > this.eventAck) {
        // Host repeats unacknowledged events. Consume in order, exactly once.
        if (row.seq !== this.eventAck + 1) break;
        this.eventAck = row.seq;
        if (!['kill','objectiveComplete'].includes(row.event.type) || row.participants.includes(this.uid)) events.push(row.event);
      }
      // Do not settle a final snapshot before its event journal has arrived.
      if (this.eventAck < data.eventSeq) return;
      this.onFrame(this.decorate(this.buffer.frames.at(-1).world), events);
      this.phase = data.round.state === 'running' ? 'running' : 'ended';
    } else if (data.t === 'ping' && this.isHost) this.sendRt({ t: 'pong', to: from, at: data.at });
    else if (data.t === 'pong' && from === this.host && data.to === this.uid) this.rtt = Math.max(0, clock() - data.at);
  }
  roster({ players, hostUser }) {
    const next = new Set(players.map(p => typeof p === 'string' ? p : p.user || p.uid));
    if (!next.has(this.host) || hostUser && hostUser !== this.host) {
      if (!this.isHost && !this.lost) { this.lost = true; this.onLost('방장이 나갔다. 진행분은 귀환 처리됩니다. (킬 XP는 클리어 전까지 확정되지 않습니다.)'); }
      return;
    }
    for (const pid of this.players) if (!next.has(pid)) {
      this.players.delete(pid); delete this.latches[pid]; delete this.acks[pid];
      if (this.world) {
        const player = this.world.entities.find(e => e.kind === 'player' && e.pid === pid);
        if (player) releaseCarrier(this.world, player);
        this.world.entities = this.world.entities.filter(e => e.kind !== 'player' || e.pid !== pid);
      }
    }
    // Mid-round joins/rejoins do not recreate a character or replenish supplies.
    if (this.phase === 'prepare') this.players = next;
    this.tryStart();
  }
  broadcast() {
    // Only recent corpses are render-relevant; never grow packets with the whole kill history.
    const visible = this.world.entities.filter(e => e.kind === 'player' || !e.dead || this.world.tick - (this.deathTicks.get(e.id) ?? 0) < 30);
    const packet = { ...encodeSnapshot({ ...this.world, entities: visible }, this.appliedInputSeqs, this.profiles), start: this.phase === 'running' && this.world.tick < 30 ? this.startData : undefined,
      events: this.journal, eventSeq: this.eventSeq, ...(this.lootLedger ? { invasionAccounts: Object.fromEntries([...this.players].map(pid=>[pid,this.lootLedger.state(pid)])), lootDrops:this.lootLedger.dropsView() } : {}) };
    this.bytes += new TextEncoder().encode(JSON.stringify(packet)).length; this.snapshots++;
    this.sendRt(packet);
    const guests = [...this.players].filter(id => id !== this.uid);
    const ack = guests.length ? Math.min(...guests.map(id => this.acks[id] || 0)) : this.eventSeq;
    this.journal = this.journal.filter(row => row.seq > ack);
  }
  update(dt, input, load = 0) {
    if (this.lost) return;
    dt = Math.max(0, Math.min(250, dt)); this.now += dt;
    if (this.phase === 'prepare') {
      this.helloLeft -= dt;
      if (this.helloLeft <= 0) { this.helloLeft = 500; this.sendRt({ t: 'profile', profile: this.profile }); this.tryStart(); }
      return;
    }
    if (this.isHost) { this.latches[this.uid]?.receive(this.sender.packet(input, load, this.eventAck), this.now); if (!this.lootLedger) setLoad(this.world, this.uid, load); }
    else {
      // One command per 30Hz sim tick, predicted with the host's exact tick step.
      this.tickInput = mergeInput(this.tickInput, { ...input, viewTick: this.renderTick ?? this.buffer.currentTick?.(this.now, this.rtt) });
      this.inputLeft = Math.min(this.inputLeft + dt, 8 * TICK_MS);
      while (this.inputLeft >= TICK_MS) {
        this.inputLeft -= TICK_MS;
        const packet = this.sender.packet(this.tickInput, load, this.eventAck);
        if (this.phase === 'running') this.prediction.advance(packet, this.tickInput, TICK_MS);
        this.sendRt(packet);
        this.tickInput = mergeInput(null, this.tickInput);
        for (const k of EDGES) this.tickInput[k] = false;
      }
      this.prediction.setPreview(this.tickInput, this.inputLeft);
      this.pingLeft -= dt;
      if (this.pingLeft <= 0) { this.pingLeft = 2000; this.sendRt({ t: 'ping', at: clock() }); }
      if (this.phase !== 'ended' && this.now - this.lastHostAt > 10000) {
        this.lost = true; this.onLost('방장 연결이 끊겼다. 진행분은 귀환 처리됩니다.');
      }
      return;
    }
    if (this.phase === 'ended' && (this.config.invasion || this.world.round.objective && this.journal.length)) {
      // Objective rounds freeze their tick at success. Repeat final snapshot until guests ack.
      this.helloLeft -= dt;
      if (this.helloLeft <= 0) { this.helloLeft = 250; this.broadcast(); }
      return;
    }
    this.tickLeft = Math.min(this.tickLeft + dt, 5 * 1000 / 30);
    while (this.phase === 'running' && this.tickLeft >= 1000 / 30) {
      const inputs = Object.fromEntries([...this.players].map(pid => [pid, this.latches[pid]?.consume(this.now)]));
      const participants = this.world.entities.filter(e => e.kind === 'player' && !e.terminal && e.invasionRole !== 'invader').map(p => p.pid);
      this.onBeforeTick(this.decorate(localView(this.world, this.uid)));
      const owners = new Map(this.world.projectiles.map(p => [p.id, p.ownerId]));
      const events = presentSkillEvents(step(this.world, inputs), this.world, owners);
      this.lootLedger?.tick(this.world, events, participants);
      if (this.lootLedger) {
        for (const pid of this.players) {
          const a=this.lootLedger.accounts[pid],p=this.world.entities.find(e=>e.pid===pid&&e.kind==='player');
          if (a && p) setLoad(this.world,pid,currentLoad(a.save,a.tracker,usedConsumables(a.save,p)).ratio);
        }
        events.push(...this.world.events.filter(e=>e.type==='lootClaimed'));
      }
      // Acknowledgements describe consumed sim inputs, never merely received packets.
      for (const pid of this.players) this.appliedInputSeqs[pid] = this.latches[pid]?.seq ?? 0;
      for (const event of events) if (event.type === 'kill') this.deathTicks.set(event.id, this.world.tick);
      for (const event of events) this.journal.push({ seq: ++this.eventSeq, event, participants: event.type === 'kill' ? participants : event.participants || [] });
      // Even 15Hz on the tick clock (was ~12Hz alternating 66/100ms from the timer).
      if (this.world.round.state === 'running' && this.world.tick % 2 === 0) this.broadcast();
      this.onFrame(this.decorate(localView(this.world, this.uid)), events.filter(e => e.type === 'objectiveComplete' ? e.participants.includes(this.uid) : e.type !== 'kill' || participants.includes(this.uid)));
      this.tickLeft -= 1000 / 30;
      if (this.world.round.state !== 'running') {
        this.phase = 'ended'; this.broadcast();
        this.sendAction({ type: 'ARPG_END', payload: { state: this.world.round.state }, __final: true });
      }
    }
  }
  view(now = this.now) {
    if (this.isHost) return this.world ? this.decorate(localView(this.world, this.uid)) : null;
    const sampled = this.buffer.sample(now, this.rtt);
    if (sampled) this.renderTick = sampled.viewTick;
    return this.decorate(this.prediction.view(sampled));
  }
}
