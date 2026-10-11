import { createWorld, addPlayer, startStage, step, setLoad } from '../sim/world.js';
import { InputSender, InputLatch, SnapshotBuffer, encodeSnapshot, localView, partyHpScale } from './protocol.js';

import { LocalPrediction } from './prediction.js';

const clock = () => globalThis.performance?.now?.() ?? Date.now();

// Pure transport adapter: no DOM/storage. Only the host ever owns or steps a sim world.
export class CoopSession {
  constructor({ uid, host, players, profile, config, sendRt = () => {}, sendAction = () => {},
    onBegin = () => {}, onBeforeTick = () => {}, onFrame = () => {}, onLost = () => {}, onStatus = () => {} }) {
    Object.assign(this, { uid, host, profile, config, sendRt, sendAction, onBegin, onBeforeTick, onFrame, onLost, onStatus });
    this.isHost = uid === host; this.players = new Set(players); this.profiles = { [uid]: profile };
    this.phase = 'prepare'; this.world = null; this.buffer = new SnapshotBuffer(uid);
    this.prediction = new LocalPrediction(uid); this.appliedInputSeqs = {};
    this.sender = new InputSender(); this.latches = {}; this.journal = []; this.deathTicks = new Map(); this.eventSeq = 0; this.eventAck = 0; this.acks = {};
    this.tickLeft = 0; this.netLeft = 0; this.helloLeft = 0; this.now = 0; this.lastHostAt = 0; this.pingLeft = 0; this.inputLeft = 0; this.rtt = null;
    this.bytes = 0; this.snapshots = 0; this.lost = false;
  }
  decorate(view) {
    if (!view) return null;
    for (const p of view.entities) if (p.kind === 'player') {
      p.equipmentVisual = this.profiles[p.pid]?.equipmentVisual; p.name = this.profiles[p.pid]?.name;
    }
    return view;
  }
  begin(data) {
    if (this.phase !== 'prepare' || !data?.profiles || !data.profiles[this.uid]) return;
    this.config = data.config; this.profiles = data.profiles; this.seed = data.seed;
    this.players = new Set(Object.keys(data.profiles));
    if (this.isHost) {
      const highest = Math.max(...Object.values(this.profiles).map(p => p.level));
      this.world = createWorld({ seed: data.seed, threat: data.config.threat,
        partyHpMult: partyHpScale(this.players.size, highest, data.config.stageId) });
      let i = 0;
      for (const [pid, p] of Object.entries(this.profiles)) {
        addPlayer(this.world, { pid, weapon: p.weapon, y: 380 + i++ * 35, mods: { ...p.mods, threat: data.config.threat } });
        setLoad(this.world, pid, p.load ?? 0);
        this.latches[pid] = new InputLatch();
      }
      startStage(this.world, data.config.stageId);
      this.decorate(this.world);
    }
    this.startData = data; this.phase = 'running'; this.lastHostAt = this.now;
    this.onBegin(this.config, this.isHost ? localView(this.world, this.uid) : null);
    if (this.isHost) this.broadcast();
  }
  tryStart() {
    if (!this.isHost || this.phase !== 'prepare' || this.players.size < 2 || this.players.size > 4) return;
    if ([...this.players].some(id => !this.profiles[id])) return;
    if ([...this.players].some(id => (this.profiles[id].threats?.[this.config.stageId] ?? 1) < this.config.threat)) {
      this.onStatus('동료의 위협도가 잠겨 있습니다. 나가서 낮은 위협도를 선택하세요.'); return;
    }
    const profiles = Object.fromEntries([...this.players].map(id => [id, this.profiles[id]]));
    const data = { config: this.config, profiles, seed: this.config.seed ?? crypto.getRandomValues(new Uint32Array(1))[0] };
    this.sendAction({ type: 'ARPG_START', payload: data, __snapshot: data }); this.begin(data);
  }
  action(a) {
    if (a?.type === 'ARPG_START') this.begin(a.payload);
    else if (a?.type === '__resync') this.begin(a.__snapshot);
  }
  rt(from, data, now = this.now) {
    if (!data || !this.players.has(from) || this.lost) return;
    if (data.t === 'profile' && this.isHost && this.phase === 'prepare') {
      this.profiles[from] = data.profile; this.tryStart();
    } else if (data.t === 'input' && this.isHost && this.world && from !== this.uid) {
      if (this.latches[from]?.receive(data, now)) {
        this.acks[from] = Math.max(this.acks[from] || 0, Math.min(this.eventSeq, data.ack || 0));
        setLoad(this.world, from, Math.max(0, Number.isFinite(data.load) ? data.load : 0));
      }
    } else if (data.t === 'snapshot' && !this.isHost && from === this.host) {
      this.lastHostAt = now;
      if (this.phase === 'prepare' && data.start) this.begin(data.start);
      if (this.phase === 'prepare' || !this.buffer.push(data, now)) return;
      this.prediction.reconcile(this.buffer.frames.at(-1).world);
      const events = [];
      for (const row of data.events || []) if (row.seq > this.eventAck) {
        // Host repeats unacknowledged events. Consume in order, exactly once.
        if (row.seq !== this.eventAck + 1) break;
        this.eventAck = row.seq;
        if (row.event.type !== 'kill' || row.participants.includes(this.uid)) events.push(row.event);
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
      if (this.world) this.world.entities = this.world.entities.filter(e => e.kind !== 'player' || e.pid !== pid);
    }
    // Mid-round joins/rejoins do not recreate a character or replenish supplies.
    if (this.phase === 'prepare') this.players = next;
    this.tryStart();
  }
  broadcast() {
    // Only recent corpses are render-relevant; never grow packets with the whole kill history.
    const visible = this.world.entities.filter(e => e.kind === 'player' || !e.dead || this.world.tick - (this.deathTicks.get(e.id) ?? 0) < 30);
    const packet = { ...encodeSnapshot({ ...this.world, entities: visible }, this.appliedInputSeqs), start: this.phase === 'running' && this.world.tick < 30 ? this.startData : undefined,
      events: this.journal, eventSeq: this.eventSeq };
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
    const packet = this.sender.packet(input, load, this.eventAck);
    if (this.isHost) { this.latches[this.uid]?.receive(packet, this.now); setLoad(this.world, this.uid, load); }
    else {
      if (this.phase === 'running') this.prediction.advance(packet, input, dt);
      this.inputLeft += dt;
      if (this.inputLeft >= 1000 / 30) { this.inputLeft %= 1000 / 30; this.sendRt(packet); }
      this.pingLeft -= dt;
      if (this.pingLeft <= 0) { this.pingLeft = 2000; this.sendRt({ t: 'ping', at: clock() }); }
      if (this.phase !== 'ended' && this.now - this.lastHostAt > 10000) {
        this.lost = true; this.onLost('방장 연결이 끊겼다. 진행분은 귀환 처리됩니다.');
      }
      return;
    }
    this.tickLeft = Math.min(this.tickLeft + dt, 5 * 1000 / 30);
    while (this.phase === 'running' && this.tickLeft >= 1000 / 30) {
      const inputs = Object.fromEntries([...this.players].map(pid => [pid, this.latches[pid]?.consume(this.now)]));
      const participants = this.world.entities.filter(e => e.kind === 'player' && !e.terminal).map(p => p.pid);
      this.onBeforeTick(localView(this.world, this.uid));
      const events = step(this.world, inputs);
      // Acknowledgements describe consumed sim inputs, never merely received packets.
      for (const pid of this.players) this.appliedInputSeqs[pid] = this.latches[pid]?.seq ?? 0;
      for (const event of events) if (event.type === 'kill') this.deathTicks.set(event.id, this.world.tick);
      for (const event of events) this.journal.push({ seq: ++this.eventSeq, event, participants: event.type === 'kill' ? participants : [] });
      this.onFrame(localView(this.world, this.uid), events.filter(e => e.type !== 'kill' || participants.includes(this.uid)));
      this.tickLeft -= 1000 / 30;
      if (this.world.round.state !== 'running') {
        this.phase = 'ended'; this.broadcast();
        this.sendAction({ type: 'ARPG_END', payload: { state: this.world.round.state }, __final: true });
      }
    }
    this.netLeft += dt;
    if (this.netLeft >= 1000 / 12) { this.netLeft %= 1000 / 12; this.broadcast(); }
  }
  view(now = this.now) {
    return this.isHost ? localView(this.world, this.uid) : this.decorate(this.prediction.view(this.buffer.sample(now)));
  }
}
