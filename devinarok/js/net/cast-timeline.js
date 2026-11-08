import { BUTTONS } from '../sim/world.js';

const MAX_AUTHORITATIVE_EVENTS = 256;

function buttonsFor(input) {
  return Number(input.buttons ?? input.b ?? 0);
}

function castKind(pressed) {
  if (pressed & BUTTONS.ATTACK) return { kind: 'attack', skill: 0 };
  if (pressed & BUTTONS.SKILL1) return { kind: 'skill', skill: 1 };
  if (pressed & BUTTONS.SKILL2) return { kind: 'skill', skill: 2 };
  if (pressed & BUTTONS.SKILL3) return { kind: 'skill', skill: 3 };
  if (pressed & BUTTONS.SKILL4) return { kind: 'skill', skill: 4 };
  return null;
}

export function castVisualKey(cast) {
  const skill = cast?.skillId === 'counter' || cast?.skill === 'counter'
    ? 'counter'
    : `skill-${cast?.skill ?? 0}`;
  return `${cast?.castId ?? ''}|${skill}`;
}

export class CastTimeline {
  constructor({ playerId, confirmTimeoutMs = 300, fadeDurationMs = 150 } = {}) {
    this.playerId = playerId;
    this.confirmTimeoutMs = confirmTimeoutMs;
    this.fadeDurationMs = fadeDurationMs;
    this.previousButtons = 0;
    this.casts = new Map();
    this.seenCastIds = new Set();
    this.seenEventIds = new Set();
    this.authoritativeEvents = [];
  }

  predictInput(input, nowMs) {
    const buttons = buttonsFor(input);
    const pressed = buttons & ~this.previousButtons;
    this.previousButtons = buttons;
    const kind = castKind(pressed);
    const seq = Number(input.seq);
    if (!kind || !Number.isSafeInteger(seq)) return null;
    const castId = `${this.playerId}:${seq}`;
    if (this.seenCastIds.has(castId)) return this.casts.get(castId) ?? null;
    const cast = {
      castId,
      playerId: this.playerId,
      seq,
      ...kind,
      predicted: true,
      confirmed: false,
      startedAt: nowMs,
      alpha: 1,
      spawn: true,
    };
    this.seenCastIds.add(castId);
    this.casts.set(castId, cast);
    return cast;
  }

  ingestEvents(events, nowMs) {
    const spawned = [];
    const attached = [];
    for (const event of events ?? []) {
      if (event.eventId !== undefined) {
        if (this.seenEventIds.has(event.eventId)) continue;
        this.seenEventIds.add(event.eventId);
      }
      if (event.type === 'cast' && event.castId) {
        const existing = this.casts.get(event.castId);
        if (existing) {
          existing.confirmed = true;
          existing.eventId = event.eventId;
          existing.serverEvent = event;
          existing.skillId = event.skillId ?? existing.skillId;
          existing.family = event.family ?? existing.family;
          if (event.skillId === 'counter') {
            existing.kind = 'counter';
            existing.skill = 'counter';
          } else if (event.skill !== undefined) existing.skill = event.skill;
          attached.push(existing);
        } else if (!this.seenCastIds.has(event.castId)) {
          const cast = {
            castId: event.castId,
            playerId: event.playerId,
            kind: event.skillId === 'counter' ? 'counter' : event.skill === undefined ? 'attack' : 'skill',
            skill: event.skillId === 'counter' ? 'counter' : event.skill ?? 0,
            skillId: event.skillId,
            family: event.family,
            step: event.step,
            predicted: false,
            confirmed: true,
            startedAt: nowMs,
            alpha: 1,
            spawn: true,
            eventId: event.eventId,
            serverEvent: event,
          };
          this.seenCastIds.add(event.castId);
          this.casts.set(event.castId, cast);
          spawned.push(cast);
        }
        continue;
      }
      this.authoritativeEvents.push(event);
      if (this.authoritativeEvents.length > MAX_AUTHORITATIVE_EVENTS) {
        this.authoritativeEvents.splice(0, this.authoritativeEvents.length - MAX_AUTHORITATIVE_EVENTS);
      }
    }
    return { spawned, attached };
  }

  update(nowMs) {
    for (const cast of this.casts.values()) {
      if (cast.confirmed || nowMs - cast.startedAt <= this.confirmTimeoutMs) continue;
      cast.alpha = Math.max(0, 1 - (
        (nowMs - cast.startedAt - this.confirmTimeoutMs) / Math.max(1, this.fadeDurationMs)
      ));
      cast.fading = true;
    }
    return [...this.casts.values()].filter((cast) => cast.alpha > 0);
  }

  consumeAuthoritativeEvents() {
    const events = this.authoritativeEvents;
    this.authoritativeEvents = [];
    return events;
  }
}

export function createCastTimeline(options) {
  return new CastTimeline(options);
}
