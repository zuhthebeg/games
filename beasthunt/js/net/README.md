# R4 cooperative integration — release acceptance still blocked

R4b connects the shared MultiplayerLobby (lib/mp-lobby.js, the actual spudsquad
lobby) to the Hunt renderer, owner session, Worker world, party HUD and reward
flow. See the R4b report for exact live evidence and outstanding acceptance.

## Browser adapter

- coop.js owns the shared lobby/socket and wraps onStarted/onRoster via attachRelay.
- Authenticated rt hello exchanges protocol and loadout before Start is enabled.
- The host publishes BH_BEGIN + __snapshot containing the immutable starting roster,
  quest and hunt id. A directed rt plan reply recovers a missed initial announcement.
- Host packets are delivered locally to its owner AND externally over the shared
  relay. The world is a module Worker; remote hunter actions never run combat.
- Reliable world packets must name the roster host. rt identity is supplied by relay.
- Owner snapshots are applied once at initialization: refresh is a fresh respawn,
  not a restore of the world's incomplete hunter puppet action. Repeated fulls never
  overwrite a live owner's position. Cart sequence survives reconnect.
- Room identity uses same-tab sessionStorage. Host leave/5-second world timeout
  ends the guest locally. Late newcomers receive a blocked lobby, not a hunter.
- The renderer shares syncHunter pose math with solo, derives remote action phase
  from host start ticks, and projects text-only names into an overlay. Menu does
  not stop coop. Windup alone absorbs bounded playback-clock phase drift.
- Result ids are consumed before application in memory and sessionStorage; duplicate
  result presentation cannot add materials, clears, currency or wallet gold again.
- Guest HUD latency is measured rt ping/pong RTT, not the interpolation buffer delay.

## IMPORTANT: two different production relay services

The shared spudsquad WebSocket lobby connects to
wss://relay-do-poc.zuhejbeg.workers.dev/room/:code?g=beasthunt (real deployed
Durable Object, no mock). relay.cocy.io is the Pages REST/SSE service: its /api/games
registry does include beasthunt, but /room/:code returns HTML HTTP 200 rather than
WebSocket 101. Therefore testing with relay.cocy.io literally as WS host is BLOCKED.
No server change or deployment is made by this client integration. For diagnosis,
?bhRelay=pages selects that explicit host and reproduces the handshake failure.
The default follows the actual shared spudsquad transport, not a fake fallback.

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
- hunterAction:{startTick,id,state,yaw,moveId}; consumed by coop.js for remote
  animation, keeping the latest 32 starts on the playback clock.

State/claim identity MUST use rt's authenticated from. The existing DO reliable
relay action does not attach authenticated sender identity: attachRelay exposes
nominal from on that path; do not use it as an authorization boundary. No shared
lib was changed. Normal cooperative peers, not adversarial clients, are this stage's
scope. A future protocol hardening should separately address reliable identity.

## Remaining before release

See tmp/beasthunt-1112-r4b-result.md for measured acceptance. Current browser
runs complete 2/3-peer flows, but raw combat frame jumps remain above 1m on
SwiftShader, and a deliberately 1Hz host owner can submit stale claims after
its playback clock falls behind the world (the Worker and guests continue).
These are blockers, not covered by the headless benchmark. In particular, raw
combat-render CV and >1m/frame counts must not be replaced with the synthetic
constant-velocity benchmark below. Literal relay.cocy.io WS routing is a separate
upstream deployment issue. Browser validation is not evidence for mobile OS sleep.

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

- node beasthunt/test/coop-e2e.mjs [baseUrl] (real shared DO, 2 peers)
- BH_PEERS=3 node beasthunt/test/coop-e2e.mjs [baseUrl]
- BH_RELAY=pages node beasthunt/test/coop-e2e.mjs [baseUrl] (literal endpoint diagnosis)
