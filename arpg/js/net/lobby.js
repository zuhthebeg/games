import { CoopSession } from './session.js';
import { STAGES } from '../content/combat.js';
import { connectBroadcast } from './loopback.js';

export class CoopLobby {
  constructor({ profile, config, onSession, onLeave, ...callbacks }) {
    Object.assign(this, { profile, config, onSession, onLeave, callbacks });
    this.session = null; this.pending = [];
  }
  open() {
    const query = new URLSearchParams(location.search);
    if (query.get('dev') === '1' && query.has('coopTest')) return this.openTest(query);
    this.lobby = new window.MultiplayerLobby({ gameType: this.config.invasion ? 'arpg-invasion' : 'arpg', gameName: this.config.invasion ? 'ARPG · 침입 동의방' : 'ARPG · 같이 사냥', minPlayers: 2, maxPlayers: 4,
      workerBase: query.get('dev') === '1' && query.get('coopRelayTest') === '1' ? 'ws://127.0.0.1:8792' : undefined,
      nickname: this.profile.name, startConfig: () => ({ ...this.config }),
      onLeave: () => { this.close(); this.onLeave(); },
      onGameEvent: (type, event) => {
        if (type === 'event') this.action(event?.data);
      },
    });
    const renderLobby = this.lobby._renderLobby.bind(this.lobby);
    this.lobby._renderLobby = () => { renderLobby(); this.renderConfig(); };
    // Same started + roster.started fallback as spudsquad: relay has no initial state callback.
    this.hookTimer = setInterval(() => {
      const ws = this.lobby?._ws;
      if (!ws || ws._arpgHook) return;
      ws._arpgHook = true; this.uid = ws.getMyUserId(); this.transport = ws;
      const started = ws.onStarted, roster = ws.onRoster, closed = ws.onRoomClosed;
      ws.onStarted = data => { started?.(data); this.started(data.config); };
      ws.onRoster = data => {
        roster?.(data); this.renderConfig();
        if (data.started && !this.session) this.started();
        this.session?.roster(data);
      };
      ws.onRt = (from, data) => this.session?.rt(from, data);
      ws.onRoomClosed = data => { closed?.(data); if (this.session) this.callbacks.onLost('방장이 나갔다. 진행분은 귀환 처리됩니다.'); };
      this.renderConfig();
      if (this.lobby._roster?.started || ws._started) this.started();
      clearInterval(this.hookTimer); this.hookTimer = null;
    }, 50);
  }
  renderConfig() {
    const card = document.querySelector('#mpl-lobby .mpl-card');
    if (!card) return;
    document.querySelector('#mpl-solo-start')?.remove(); // This game has no AI padding or solo relay start.
    const amHost = this.lobby._roster.hostUser === this.uid;
    let controls = card.querySelector('#arpg-party-config');
    if (!controls) {
      controls = document.createElement('div'); controls.id = 'arpg-party-config';
      const stage = document.createElement('select'); stage.id = 'arpg-party-stage'; stage.setAttribute('aria-label', '협동 스테이지');
      for (const id of this.profile.stages || Object.keys(STAGES)) stage.add(new Option(`${id} · ${STAGES[id].name}`, id));
      if (![...stage.options].some(o => o.value === this.config.stageId)) this.config.stageId = stage.options[0].value;
      stage.value = this.config.stageId;
      const threat = document.createElement('select'); threat.id = 'arpg-party-threat'; threat.setAttribute('aria-label', '협동 위협도');
      const refresh = () => {
        threat.replaceChildren();
        for (let n = 1; n <= this.profile.threats[stage.value]; n++) threat.add(new Option(`위협 ${n}`, String(n)));
        this.config.stageId = stage.value; this.config.threat = Math.min(this.config.threat, this.profile.threats[stage.value]);
        threat.value = String(this.config.threat);
      };
      stage.onchange = refresh; threat.onchange = () => { this.config.threat = Number(threat.value); };
      refresh(); controls.append(stage, threat); card.insertBefore(controls, document.querySelector('#mpl-ready'));
    }
    controls.hidden = !amHost;
    if (!card.querySelector('#arpg-room-mode')) {
      const note = document.createElement('p'); note.id = 'arpg-room-mode';
      note.textContent = this.config.invasion ? `침입 동의방 · 내 역할: ${this.profile.role === 'invader' ? '해골 / 몬스터 편' : '인간 / 사냥꾼 편'} · 인간·해골 각 1명 이상 필요` : '일반 협동방 · 적대 참가 불가';
      card.prepend(note);
    }
  }
  started(config) {
    if (this.session) return;
    const roster = this.lobby._roster;
    this.makeSession(roster, config?.stageId ? config : this.config);
  }
  makeSession(roster, config) {
    this.session = new CoopSession({ uid: this.uid, host: roster.hostUser,
      players: roster.players.map(p => p.user || p.uid), profile: this.profile, config,
      sendRt: p => this.transport.sendRt(p), sendAction: a => this.transport.sendAction(a), ...this.callbacks });
    this.onSession(this.session);
    for (const action of this.pending.splice(0)) this.session.action(action);
  }
  action(a) { if (this.session) this.session.action(a); else if (a) this.pending.push(a); }
  openTest(query) {
    this.uid = query.get('coopTest');
    this.transport = connectBroadcast({ room: query.get('room') || 'local', uid: this.uid, host: 'host',
      network: { latency: Number(query.get('netLatency')) || 0, jitter: Number(query.get('netJitter')) || 0, loss: Math.max(0, Math.min(1, Number(query.get('netLoss')) || 0)) },
      onReady: roster => this.makeSession(roster, this.config),
      onRoster: roster => this.session?.roster(roster),
      onRt: (from, data) => this.session?.rt(from, data), onAction: a => this.action(a) });
  }
  close() {
    clearInterval(this.hookTimer); this.hookTimer = null;
    if (this.lobby) {
      this.lobby._inGame = false; this.lobby._hideModeSelect(); this.lobby._hideLobby(); this.lobby._hideResult();
    }
    const transport = this.transport || this.lobby?._ws;
    transport?.leave?.(); transport?.close?.();
    this.session = null;
  }
}
