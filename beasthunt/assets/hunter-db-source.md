# Hunter DB source provenance

Paladin target: same local Paladin J Nordstrom FBX and mobile decimation as the accepted hunter-gs/hunter-bow pipeline. Body 1448 + helmet 2377 = 3825 triangles; runtime dual blades add 64, total 3889.

Motion source: public Rokojori/winter-tales mirror, https://community.rokojori.com/Rokojori/winter-tales/src/branch/main/assets/Mixamo/ . No login, browser automation, cookies or tokens used.

- idle/Warrior Idle.fbx
- run/Run Forward-Male.fbx
- move-backwards/Running Backward-Male.fbx
- strafe/Jog Strafe Left-Male.fbx and Jog Strafe Right.fbx
- attack/Sword And Shield Attack-2.fbx (h; X-reflected paired bones for h2)
- attack/Sword And Shield Attack-3.fbx (third combo)
- attack/Standing Melee Attack Downward.fbx (bilateral arm adaptation)
- attack/Standing Melee Attack 360 High.fbx (spin)
- Existing locally staged roll/drink/hit/stun/death sources reused from R9.

FBX originals are private build inputs, not committed. Full URLs, hashes, 65-bone inventory and per-frame clips/calibration remain in the task worktree tmp/beasthunt-mixamo-db/.

Licensing: animations are identified as Adobe Mixamo content in the mirror; public availability is not a standalone redistribution license. Review Adobe/Mixamo embedded-game terms and original target-character terms before release. Do not redistribute raw animation/source FBX files. This branch is not deployed.
