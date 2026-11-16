# Embedded game actor sources

Approved user request 33129: Mixamo main actors and one Gobkit training projection. These are embedded game assets, not a model download/redistribution product. Raw FBX, private review server credentials and private gate keys are not included.

- Maw.glb — private user-provided Mixamo FBX, existing game-animation bake; 14,159,492 bytes; SHA256 818453466c349974994de74cbebc1eb46b129111c0bf85e97bee7a9835ab3099.
- Mutant.glb — same authorized source/bake workflow; SHA256 087043fdb8a7199c3c1eed6efb021933b18ff20e5cc6535b4466cb36c2d74f78.
- Pumpkinhulk.glb — same authorized source/bake workflow; SHA256 6c2e99ae73218a17fb6f31354b38b01d4bb1944db4bd76549f3a9cb2818b8574.
- OrcChainBrute.glb — Gobkit free pack, CC0 1.0 per existing input metadata; SHA256 00949aae1a21ab48ddb9a530a96a1c2388d129bed4495d93ec1e20d09b413d6f.

Exact existing derived GLB bytes copied without decimation, recoloring, material/texture rewriting or rig replacement. The three Mixamo rigs have respectively 64/37/66 bones and retain all thirteen original named clips. Orc retains its seven own clips. Runtime actor clones own geometry/material/skeleton/mixer; page templates own original embedded textures.

## Necessary progression compatibility

Quest IDs, save key, material IDs, forge costs, stock, HP, quest shards and wallet gold are unchanged. New main actors have no supported part-break presentation, so their former one-horn and one-tail break slots become one-horn and one-tail clear slots. This is an explicit change in accessibility, not an additional reward roll: it does not exceed the former fully-broken clear budget (5 low-rank / 7 high-rank total materials), and supplied break flags never stack another copy. Warrok loot is unchanged. Parent independent spec/sim/economy review must assess this compatibility decision before release.

## Technical transforms

Only selected actors load. Original clip tracks are cloned without editing. After evaluation, hips are centered in the actor's ground plane using world-space axes (the original author axes differ). Sim owns leap translation; root-only floor correction uses original skinned support vertices selected from 49 poses in every original clip. No per-bone conversion. Three's updateMatrixWorld, including SkinnedMesh bind inverse maintenance, runs before skin reads; repeated paused poses are tested. This CPU proof is not a rendered/GPU or physical-phone approval.
