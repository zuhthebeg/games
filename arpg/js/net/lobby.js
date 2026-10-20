import { CoopSession } from './session.js';
import { STAGES } from '../content/combat.js';
import { validLobbyProfile, partyConfig } from './invasion.js';
import { connectBroadcast } from './loopback.js';

// Invitations identify the ordinary room, never the host's slot or test identity.
export function invitationUrl(href, room) {
  const url = new URL(href);
  url.searchParams.set('room', room); url.searchParams.set('relay', 'do');
  for (const key of ['u', 'coopTest', 'coopRelayTest']) url.searchParams.delete(key);
  for (const key of ['character', 'invasion']) url.searchParams.delete(key);
  return url.toString();
}
export function roomEntry(query) {
  const soloSelected = query.get('character') === 'skeleton_knight';
  const invasionInvite = false;
  return { soloSelected, invasionInvite,
    legacyEntry: !query.has('room') && !soloSelected && (query.get('debug') === '1' || query.get('dev') === '1') };
}

export class CoopLobby {
  constructor({ profile, config, onSession, onLeave, ...callbacks }) {
    Object.assign(this, { profile, config, onSession, onLeave, callbacks });
    this.session = null; this.pending = []; this.partyProfiles = {};
  }
  open() {
    const query = new URLSearchParams(location.search);
    if (query.get('dev') === '1' && query.has('coopTest')) return this.openTest(query);
    this.lobby = new window.MultiplayerLobby({ gameType: 'arpg', gameName: 'ARPG · 같이 사냥', minPlayers: 2, maxPlayers: 4,
      workerBase: query.get('dev') === '1' && query.get('coopRelayTest') === '1' ? 'ws://127.0.0.1:8792' : undefined,
      nickname: this.profile.name, startConfig: () => partyConfig(this.config, this.partyProfiles),
      onLeave: () => { this.close(); this.onLeave(); },
      onGameEvent: (type, event) => {
        if (type === 'event') this.action(event?.data);
      },
    });
    this.lobby._inviteUrl = () => invitationUrl(location.href, this.lobby.room);
    const syncLobby = this.lobby._syncLobby.bind(this.lobby);
    this.lobby._syncLobby = () => { syncLobby(); this.renderConfig(); };
    const renderLobby = this.lobby._renderLobby.bind(this.lobby);
    this.lobby._renderLobby = () => { renderLobby(); this.renderConfig(); };
    // Same started + roster.started fallback as spudsquad: relay has no initial state callback.
    this.hookTimer = setInterval(() => {
      const ws = this.lobby?._ws;
      if (!ws || ws._arpgHook) return;
      ws._arpgHook = true; this.uid = ws.getMyUserId(); this.transport = ws; this.partyProfiles[this.uid] = this.profile;
      const started = ws.onStarted, roster = ws.onRoster, closed = ws.onRoomClosed, reconnected = ws.onReconnected;
      ws.onReconnected = () => { reconnected?.(); this.session?.resume(); };
      ws.onStarted = data => { started?.(data); this.started(data.config); };
      ws.onRoster = data => {
        roster?.(data);
        const ids = new Set(data.players.map(p => p.user || p.uid));
        for (const id of Object.keys(this.partyProfiles)) if (!ids.has(id)) delete this.partyProfiles[id];
        ws.sendRt({ t: 'party-profile', profile: this.profile }); this.renderConfig();
        if (data.started && !this.session) this.started();
        this.session?.roster(data);
      };
      ws.onRt = (from, data) => {
        if (data?.t === 'party-profile' && this.lobby._roster.players.some(p => (p.user || p.uid) === from) && validLobbyProfile(data.profile)) {
          this.partyProfiles[from] = data.profile; this.renderConfig();
        }
        this.session?.rt(from, data);
      };
      ws.sendRt({ t: 'party-profile', profile: this.profile });
      this.profileTimer = setInterval(() => { if (!this.session) ws.sendRt({ t: 'party-profile', profile: this.profile }); }, 500);
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
    let note = card.querySelector('#arpg-room-mode');
    if (!note) { note = document.createElement('p'); note.id = 'arpg-room-mode'; card.prepend(note); }
    const players = this.lobby._roster.players;
    note.textContent = `같이 사냥 · 총 ${players.length}/4명 · 인간은 사냥꾼 편, 해골은 몬스터 편`;
    for (const p of players) {
      const id = p.user || p.uid, profile = this.partyProfiles[id];
      const role = profile?.lineage === 'skeleton_knight' ? '해골 / 몬스터 편' : profile ? '인간 / 사냥꾼 편' : '캐릭터 확인 중';
      note.textContent += ` · ${p.nick || profile?.name || id}: ${role}`;
    }
    const start = card.querySelector('#mpl-start');
    if (start) start.disabled = !amHost || players.length < 2 || players.length > 4
      || players.some(p => !this.partyProfiles[p.user || p.uid] || (p.user || p.uid) !== this.lobby._roster.hostUser && !p.ready);
  }

  started(config) {
    if (this.session) return;
    const roster = this.lobby._roster;
    this.makeSession(roster, config?.stageId ? config : this.config);
  }
  makeSession(roster, config) {
    this.session = new CoopSession({ uid: this.uid, host: roster.hostUser,
      players: roster.players.map(p => p.user || p.uid), profile: this.profile, config,
      sendRt: p => this.transport.sendRt(p), sendAction: a => this.transport.sendAction(a), onTransportStale: () => this.reconnect(), ...this.callbacks });
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
  resume() {
    this.session?.resume();
    const ws = this.transport;
    if (ws?._ws && ws._ws.readyState >= 2) ws._scheduleReconnect?.();
  }
  reconnect() {
    const ws = this.transport;
    if (!ws || ws._manualClose) return;
    if (ws._ws?.readyState === 1) ws._ws.close();
    else ws._scheduleReconnect?.();
  }
  close() {
    clearInterval(this.hookTimer); this.hookTimer = null; clearInterval(this.profileTimer);
    if (this.lobby) {
      this.lobby._inGame = false; this.lobby._hideModeSelect(); this.lobby._hideLobby(); this.lobby._hideResult();
    }
    const transport = this.transport || this.lobby?._ws;
    transport?.leave?.(); transport?.close?.();
    this.session = null;
  }
}
