# R4 cooperative core — not a released cooperative game

This directory is a tested **headless implementation stage**. The hub, Hunt
renderer, multiplayer lobby, wallet/result flow and remote hunter models are NOT
connected to it. There is deliberately no cooperative entry button yet. Do not
advertise multiplayer or deploy this stage as a finished R4.

## Ownership

- Sim's optional fourth argument selects role 'world' or 'owner'. Without it,
  solo state/snapshot/PRNG behavior remains R3-compatible.
- HostSession owns a world Sim: all hunters are puppets, no hunter input/damage
  executes, shared carts and outcome are host-only.
- GuestSession owns one local Sim: hunter input and incoming contact run locally;
  outgoing damage only produces hitClaim and immediate local presentation effects.
- Host player is also an owner peer. In production it needs a local bridge to
  WorkerHost because rt excludes its sender. session.test.mjs demonstrates it.
- Monster attack contacts/motion on both roles call the SAME Sim.updMonAtk.
  Coop freezes target coordinates at attack selection, transmitting them in the
  start event. This is a coop-only targeting policy; solo tracking is unchanged.

## Modules

- protocol: v1 / hunt id / stream seq, centimetre and milliradian wire packing.
- transport: existing shared lobby WS hooks, rt state/claim, reliable action events;
  seeded virtual TCP with delay, jitter and HOL burst stalls (no real packet loss).
- clock / interp: host-tick buffer, p95 adaptive delay, bounded 0.95..1.05 slew,
  100ms decelerating extrapolation, display-only HP smoothing.
- claims: 60-tick part history, roster-bound loadout, raw/range/rate/seq/dead checks.
- replication: 4-tick world emission and presentation-only monster/hunter buffers.
- host / guest: headless world and owner sessions; initial snapshot, timeline events,
  owner state and damage claims, shared carts, per-owner independently seeded result.
- worker / worker-host: actual world Sim executes in a module Worker, not a main
  document timer. worker-smoke.mjs clamps main timers to 1Hz to verify it.

## Wire schema

Every packet: {v:1, type, hunt, seq, payload}. State sequences are scoped by sender
and type. Host event sequences are independent from the host's own hunter events.

- world: {k,m:[x,z,y,yaw,spin,state,startTick,t,hp,maxHp,headAccum,tailAccum,
  legsAccum,brokenBits,enraged,targetId,moveKey],p:[projectile rows],c,tm,over,win}
- hunter: {k,p:[id,x,z,yaw,state,startTick,hp,maxHp,weapon,lock,spin,st]}
- hit: {seq,hostTick,part,raw,moveId,actionTick?}; bow includes release actionTick; moveId is heavy or light:N.
- monster: {startTick,monster} (complete initial attack/state context).
- full: {hostTick,snapshot}; carts:{carts}; cart:{cart:per-owner monotonic count}.
- end:{startTick,win,broke,time,carts,delay}; break:{startTick,part}.
- hunterAction:{startTick,id,state,yaw,moveId}; emitted but not consumed for remote
  animation yet. That is one of the remaining renderer integration tasks.

State/claim identity MUST use rt's authenticated from. The existing DO reliable
relay action does not attach authenticated sender identity: attachRelay exposes
nominal from on that path; do not use it as an authorization boundary. No shared
lib was changed. Normal cooperative peers, not adversarial clients, are this stage's
scope. A future protocol hardening should separately address reliable identity.

## Remaining before release

1. Shared MultiplayerLobby with room URL, readiness and host quest selection;
   visible version mismatch rejection and roster lifecycle.
2. Hunt adapter using owner Sim, worker host wiring, interpolation/render time
   integration, attack event timing under real rAF, remote hunter models/names,
   party HP/latency HUD, no-pause multiplayer menu.
3. Remote hunterAction animation replay (currently emitted only).
4. Explicit host leave in roster UI, reconnect
   with complete owned potion/stamina/attack state, lobby rematch.
5. Client-specific result/save/wallet application exactly once and lobby return.
6. Browser two-context full lobby-to-reward E2E at 1280/390, real relay verification,
   active-window timing and full-contact-range proofs, rather than headless only.
7. Attack playback currently advances 60Hz local ticks independently of the clock's
   bounded slew; chase interpolation uses the adaptive clock. Real renderer tests
   must address windup scheduling/drift without ever shortening active duration.

## Reproducible tests

From repository root:

- node --test beasthunt/test/*.test.mjs
- python3 -m http.server 8791 --bind 127.0.0.1
- node beasthunt/test/smoke.mjs
- node beasthunt/test/worker-smoke.mjs

The synthetic smoothness benchmark uses a constant 5m/s trajectory, not an actual
combat renderer. Its table is not evidence that attack animation is smooth. Hunt
acceptance reports both raw and eligible rates: claims arriving after authoritative
end are intentionally rejected and excluded only from the eligible denominator.
