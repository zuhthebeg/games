# 감자특공대 (Spud Squad) — 구현 브리프

브로테이토류 **실시간 협동 웨이브 서바이벌**, 1~4인. 설계=Opus, 구현=위임 모델. 이 문서가 정본이다. 모호하면 여기 적힌 가장 단순한 해석을 택하고, 스펙을 바꾸지 말고 `spudsquad/NOTES.md`에 질문으로 남겨라.

URL: `https://game.cocy.io/spudsquad/` · 폴더 `/mnt/c/Users/user/games/spudsquad/`

## 0. 이미 끝난 것 (건드리지 마라)
- 서버: games-server `functions/games/spudsquad.ts`(relay 플러그인, gameType=`spudsquad`) 등록 + DO 워커 배포 완료(커밋 ec93370).
- DO 새 메시지 `rt`: 저장 없이 **발신자 제외** 전원에게 즉시 중계. 32KB 초과 드롭. 유실/순서 보장 없음.
- relay action에 `__final: true`를 실으면 DO가 판을 finished 처리 → 다음 `start`가 새 판(재대결).
- 클라 `lib/multiplayer.js`의 `MultiplayerWSClient`에 `sendRt(data)`와 콜백 `onRt(from, data)` 추가(미커밋, 이 작업과 함께 커밋). 게임에서는 `multiplayer.js?v=20260927rt`로 로드.
- 에셋: `spudsquad/assets/*.webp`가 별도로 생성 중. **파일이 없어도 게임이 돌아가야 한다**(로드 실패 시 색 도형 폴백). 이름은 §7 매니페스트 그대로.

## 1. 반드시 읽을 참고
- `/mnt/c/Users/user/games-server/docs/do-ws-client-playbook.md` — DO 클라 패턴/함정(영속 uid, 닉, 재접속, 결과창)
- `lib/mp-lobby.js` (`MultiplayerLobby`) + 사용 예 `enhance/index.html`, `blackjack/index.html` — 로비는 이걸 그대로 쓴다. 직접 로비 만들지 마라.
- `lib/multiplayer.js` `MultiplayerWSClient` (sendAction/sendRt/onEvent/onRt/onRoster)
- `CLAUDE.md`, `lib/game-rankings.js`, `lib/shared-wallet.js`

## 2. 절대 규칙 (어기면 게임 전체가 죽는 것들)
1. 전역 `const/let/class` 이름 충돌 금지: `RELAY_URL`, `_mpClientInstance`, `SharedWallet`, `MultiplayerLobby`, `MultiplayerWSClient` 재선언 금지. 게임 코드는 전부 IIFE 안 또는 `window.SPUD` 네임스페이스에.
2. `SharedWallet`은 `window.SharedWallet`이 아니라 전역 이름으로 직접 참조. `DOMContentLoaded`에서 `SharedWallet.init()` 반드시 호출.
3. shared-wallet 고정헤더(#sw-bar ≈52px) 공간 예약: `:root{--wallet-bar-h:56px}` + 게임 루트 `padding-top:calc(var(--wallet-bar-h) + env(safe-area-inset-top))`. 캔버스가 헤더에 가려지면 안 됨.
4. head에 no-cache 메타 3종. 공용 lib는 `?v=` 붙여 로드.
5. 한글 파일 쓰기에 PowerShell 금지. UTF-8.
6. 커밋 전 `node --check`를 **모든 js 파일**에, 인라인 스크립트는 추출해서 체크.

## 3. 게임 규칙

### 3.1 흐름
타이틀 → [혼자 하기 | 같이 하기(로비)] → 캐릭터 선택(4종) → 웨이브 1 → 웨이브 종료 → (레벨업 선택) → 상점 → 웨이브 2 … → 웨이브 20 보스 처치 = 승리 / 전원 사망 = 패배 → 결과창.

- 웨이브 길이: `min(20 + 5*(w-1), 60)`초. 타이머 0이 되면 남은 적 전부 소멸, 바닥 재료는 **자동 흡수**(수확 보너스와 별개).
- 웨이브 10: 중간보스 `boss_1` 1마리 추가. 웨이브 20: `boss_2`. 웨이브 20은 **보스를 잡아야** 클리어(타이머 끝나도 보스 살아있으면 계속, 타이머 표시는 "BOSS").
- 사망: 협동에서 죽은 플레이어는 관전(카메라가 생존자 따라감), 웨이브 종료 시 HP 50%로 부활. 전원 사망 시 패배.

### 3.2 조작
- 이동만 한다. 무기는 **자동 조준·자동 발사**(사거리 내 가장 가까운 적).
- PC: WASD/방향키. 모바일: 화면 아무 곳 터치-드래그 = 플로팅 조이스틱(시작점 기준 벡터, 반경 60px).
- 월드 1600×1200, 경계 밖 이동 불가. 카메라는 내 캐릭터 추적(월드 끝에서 클램프). 캔버스 DPR 대응, 세로/가로 둘 다.

### 3.3 스탯 (플레이어별)
| 키 | 기본 | 의미 |
|---|---|---|
| maxHp | 10 | |
| regen | 0 | 초당 회복 = regen*0.2 (0 이하면 없음) |
| lifesteal | 0 | % 확률로 명중 시 1 회복(초당 최대 10회) |
| dmg | 0 | 모든 피해 +% |
| melee | 0 | 근접무기 피해에 +정수 |
| ranged | 0 | 원거리무기 피해에 +정수 |
| atkSpd | 0 | 공격속도 +% (쿨다운 / (1+atkSpd/100)) |
| crit | 0 | 치명 확률 %(치명 2배) |
| range | 0 | 무기 사거리 +정수(px) |
| armor | 0 | 받는 피해 × 1/(1+armor/15) (음수면 ×(1+|armor|/15)) |
| dodge | 0 | 회피 %(상한 60) |
| speed | 0 | 이동속도 +% (기본 200px/s) |
| luck | 0 | 상점 고티어 확률·재료 추가 드롭 |
| harvest | 0 | 웨이브 종료 시 재료 +harvest, 매 웨이브 후 harvest는 +5% 성장 |
| pickup | 0 | 재료 흡수 반경 +% (기본 80px) |

### 3.4 캐릭터 (4)
- `basic` 기본감자: 보정 없음, 시작무기 권총.
- `muscle` 근육감자: maxHp +5, melee +3, speed −5, ranged −3. 시작무기 주먹.
- `science` 과학감자: ranged +3, range +40, maxHp −3. 시작무기 레이저.
- `lucky` 행운감자: luck +25, harvest +8, dmg −10. 시작무기 새총.

### 3.5 무기 (8종 × 티어 1~4, 슬롯 최대 6)
기본값은 티어1. 티어 오를 때 피해 ×1.6, 쿨다운 ×0.9. 같은 무기·같은 티어 2개를 상점에서 **합치기**(슬롯 클릭 → 합치기 버튼) = 다음 티어 1개. 티어 색: 회/파/보/빨.

| id | 종류 | 피해 | 쿨(s) | 사거리 | 특징 | 가격 |
|---|---|---|---|---|---|---|
| fist | 근접 | 8 | 0.9 | 110 | 찌르기(대상에게 돌진 모션) | 15 |
| stick | 근접 | 12 | 1.3 | 150 | 휘두르기: 전방 90° 부채꼴 전체 | 20 |
| slingshot | 원거리 | 10 | 1.2 | 380 | 1회 튕김(다음 가까운 적) | 18 |
| pistol | 원거리 | 12 | 1.0 | 420 | 관통 1 | 22 |
| shotgun | 원거리 | 6×4발 | 1.6 | 280 | 30° 산탄 | 30 |
| smg | 원거리 | 4 | 0.25 | 360 | 탄퍼짐 8° | 32 |
| laser | 원거리 | 18 | 1.8 | 520 | 무한 관통 빔(즉발, 0.1초 표시) | 38 |
| rocket | 원거리 | 22 | 2.2 | 450 | 명중 시 반경 70 폭발(범위 전원) | 45 |

무기는 캐릭터 주위 원형으로 배치해 그린다(브로테이토처럼). 투사체 속도 700px/s.

### 3.6 아이템 (16, 중첩 가능)
| id | 효과 | 가격 |
|---|---|---|
| potato_armor | armor+2, speed−3 | 25 |
| hot_sauce | dmg+8 | 30 |
| energy_drink | atkSpd+10 | 30 |
| magnet | pickup+40 | 20 |
| clover | luck+10 | 25 |
| bandage | regen+2 | 25 |
| vampire_fang | lifesteal+3 | 35 |
| sneakers | speed+8 | 25 |
| scope | range+40, crit+3 | 30 |
| dumbbell | melee+3, maxHp+3 | 30 |
| battery | ranged+3 | 30 |
| heart_jar | maxHp+8 | 35 |
| garden_glove | harvest+5 | 25 |
| helmet | armor+3, dodge−2 | 30 |
| feather | dodge+6 | 30 |
| lucky_coin | harvest+3, luck+5 | 30 |

### 3.7 적 (`enemy_*`, `boss_*`)
기본 HP는 웨이브 스케일 `hp × (1 + 0.35*(w-1))`, 접촉피해 `dmg × (1 + 0.12*(w-1))`. 플레이어 수 n일 때 스폰 수 ×`(1+0.6*(n-1))`, HP ×`(1+0.25*(n-1))`.

| id | HP | 속도 | 접촉피해 | 첫 등장 | 행동 | 재료 |
|---|---|---|---|---|---|---|
| blob | 8 | 90 | 1 | 1 | 가장 가까운 플레이어 추적 | 1 |
| bug | 5 | 170 | 1 | 2 | 추적, 빠름 | 1 |
| spitter | 10 | 60 | 1 | 3 | 거리 250 유지, 2.5s마다 탄(속도 260, 피해 1+w/5) | 2 |
| charger | 14 | 80 | 2 | 4 | 1.2s 조준 후 450px/s 돌진 0.6s | 2 |
| splitter | 16 | 70 | 1 | 5 | 사망 시 blob 2마리 | 2 |
| tank | 40 | 50 | 3 | 6 | 추적, 넉백 면역 | 4 |
| elite | 120 | 110 | 3 | 8(웨이브당 ≤2) | 추적 + 3s마다 8방향 탄 | 10 |
| boss_1 | 1500 | 70 | 4 | 10 | 추적, 4s마다 12방향 탄, 8s마다 blob 6 소환 | 60 |
| boss_2 | 6000 | 80 | 5 | 20 | boss_1 패턴 + 6s마다 돌진 | 150 |

스폰: 웨이브 중 0.6~1.2s 간격으로 `2 + floor(w*0.8)`마리 묶음, 등장 가능 풀에서 가중 랜덤. 동시 생존 상한 220(초과 시 스폰 보류). 스폰 1초 전 붉은 X 표시, 플레이어와 150px 이내엔 스폰 금지. 적끼리 약한 분리력(겹침 방지, 공간 그리드로 O(n)).

### 3.8 재료·경험치·레벨업
- 적 사망 → 재료(초록 크리스탈) 드롭. luck% 확률로 +1. 흡수는 **가장 먼저 반경에 들어온 플레이어**의 것.
- 재료 1개 = 돈 1 + XP 1. 레벨 필요 XP = `(lvl+3)^2`. 레벨업마다 maxHp +1.
- 웨이브 종료 후 레벨업한 횟수만큼 **4지선다 스탯 업그레이드**(maxHp+3 / dmg+5 / atkSpd+5 / melee+2 / ranged+2 / armor+1 / speed+3 / crit+3 / range+25 / regen+2 / dodge+3 / luck+10 / harvest+5 중 랜덤 4, 티어별 수치는 v1에선 고정).

### 3.9 상점
- 무작위 4칸(무기/아이템 혼합, 무기 확률 35%). 가격 = `ceil(base × (1 + 0.1*(w-1)))`. luck로 무기 티어 확률 상승(w≥5부터 T2, w≥10 T3, w≥15 T4 출현 가능).
- 리롤 비용 `1 + w` 부터 리롤할 때마다 +1(웨이브마다 리셋). 칸 잠금(🔒) = 다음 웨이브까지 유지.
- 무기 판매 = 가격의 50% (티어 반영).
- 협동: **각자 자기 상점**. 우측 하단에 동료 준비 상태(✔/…) 표시. 전원 준비 또는 45초 타이머로 다음 웨이브.

## 4. 넷코드 (host-authoritative, 협동이라 치팅 방어 불필요)

호스트 = 로비 `hostUser`. 솔로도 **같은 코드 경로**(자기 자신이 호스트, 전송은 no-op).

### 4.1 소유권
- **자기 캐릭터 위치는 각자 소유**: 각 클라가 자기 이동을 로컬로 즉시 적용(입력 지연 0). 호스트는 게스트가 보낸 위치를 그대로 신뢰.
- **그 외 전부 호스트 소유**: 적, 스폰, 무기 발사/명중/피해, 재료, 드롭 흡수, HP, XP, 웨이브 타이머.
- 상점/레벨업 선택은 각자 로컬 → 결과 로드아웃을 호스트에 보고.

### 4.2 rt 메시지 (휘발성, `client.sendRt` / `onRt`)
- 게스트→전원 `{t:'p', x, y, f}` (f=바라보는 방향 -1/1). 15Hz, 정지 중이면 4Hz. 정수 반올림.
- 호스트→전원 `{t:'s', k:tick, tm:남은시간(0.1s 단위), e:[[id,type,x,y,hpPct],...], d:[[id,x,y],...], pl:[[uid,x,y,hp,maxHp,alive,mats,xp,lvl],...], fx:[...]}` 12Hz. 좌표 정수, hpPct 0~100 정수. 스냅샷 사이 이벤트는 `fx`에 누적 후 비움:
  - `['sh', ownerUid, weaponId, tier, x, y, angle]` 발사 → 게스트는 **코스메틱 투사체를 로컬 시뮬**(같은 속도·사거리, 적 스냅샷 위치와 닿으면 소멸, 판정 없음)
  - `['eb', x, y, angle, speed]` 적 탄 발사(코스메틱 동일)
  - `['hit', x, y, dmg, crit]` 데미지 숫자 팝업
  - `['die', x, y, type]` 사망 이펙트
  - `['hurt', uid, dmg]` 피격(화면 붉게 번쩍 + 진동은 본인일 때만)
  - `['lvl', uid]` 레벨업 연출
- 게스트는 적/드롭을 최근 2개 스냅샷 사이 **100ms 지연 보간**으로 그린다. 스냅샷에 없는 id는 제거.
- 게스트 자기 HP는 스냅샷 값을 따른다(0이면 사망 처리).

### 4.3 action 메시지 (신뢰 경로, `client.sendAction`, relay가 seq 붙여 전원에게 — **발신자 포함** 브로드캐스트, 수신측이 멱등 처리)
- `{type:'PICK', payload:{uid, char}}` 캐릭터 선택(로비 후 선택 화면). 호스트는 전원 선택 or 20초 후 미선택자 basic으로 `WAVE_START`.
- `{type:'WAVE_START', payload:{w, seed, players:{uid:{char, weapons:[[id,tier]...], items:[id...], stats:{...}, mats, lvl, xp}}}, __snapshot:<동일 payload>}` — 호스트만 발신. 모든 클라가 이걸 받아야 웨이브 진입(자기 것도 여기서 동기화).
- `{type:'WAVE_END', payload:{w, players:{uid:{mats, xp, lvl, levelUps}}}}` — 호스트만. 수신 시 각자 레벨업→상점 UI.
- `{type:'READY', payload:{uid, loadout:{weapons, items, stats, mats}}}` — 각자 상점 종료 시. 호스트는 전원 READY(현재 roster 기준) or 45초 → 다음 `WAVE_START`.
- `{type:'GAME_OVER', payload:{win, wave, kills:{uid:n}, dmg:{uid:n}}, __final:true}` — 호스트만. 결과창 + 보상.
- 이모트 선택 기능은 v1 제외.

### 4.4 이탈/재접속
- `onRoster`로 명단 diff. **게스트 이탈**: 호스트가 그 캐릭터를 시뮬에서 제거(적 수 스케일은 다음 웨이브부터 재계산). **호스트 이탈**: 게스트에게 "호스트가 나갔습니다" 결과창 → 로비로(호스트 마이그레이션은 v1 제외).
- 재접속: relay가 마지막 `__snapshot`(=마지막 WAVE_START payload)을 `__resync` 이벤트로 줌 → 그 로드아웃으로 웨이브 합류, rt 스냅샷 수신하며 진행. 영속 uid는 `localStorage.spud_uid`.
- 백그라운드 탭 복귀(visibilitychange)에서 호스트 dt 폭주 방지: 프레임 dt 상한 0.1s, 누적 스텝 상한 5.

### 4.5 루프
- 호스트 시뮬 고정 스텝 30Hz(누적기), 렌더 rAF 보간. 게스트는 자기 이동만 로컬 스텝.
- 대역폭 목표: 스냅샷 1개 < 8KB(적 220마리 기준). 넘으면 `e`를 카메라 합집합 범위 밖 적 생략이 아니라 **소수점 제거·배열화로만** 줄인다(단순함 우선).

## 5. 코드 구조 (빌드 없음, 일반 script 태그, 전부 `window.SPUD` 아래)
```
spudsquad/
  index.html     마크업+CSS, 스크립트 로드, 메타(no-cache, GTM-MV8KQGJF, SEO/OG, JSON-LD), i18n 부트
  js/data.js     §3 표 그대로(캐릭터/무기/아이템/적/업그레이드/상수) — 수치는 여기만
  js/sim.js      순수 시뮬(DOM·네트워크 의존 0, rng 주입). createWorld/step/applyInput/spawn/damage/merge/shop 가격 등
  js/net.js      Solo/Host/Guest 어댑터: rt·action 송수신, 스냅샷 인코드/디코드, 보간 버퍼
  js/render.js   캔버스 렌더(스프라이트 로더+폴백 도형, 카메라, 데미지 숫자, 파티클)
  js/ui.js       타이틀/캐릭터선택/HUD/레벨업/상점/결과창/i18n(ko/en/zh-TW)
  js/main.js     부트스트랩, 입력(키보드/조이스틱), 로비 연결, 루프
  test/*.test.cjs node 테스트
  icon.svg
  NOTES.md       결정/질문/알려진 한계
```
`sim.js`/`data.js`/`net.js`의 인코더는 브라우저와 node 둘 다에서 로드되게(UMD 패턴: `if(typeof module!=='undefined')module.exports=...`).

## 6. UI/연출 (촌스러우면 실패)
- 톤: 밝은 카툰, 짙은 갈색 외곽선 에셋과 어울리게. 배경 `bg_ground.webp` 타일 반복 + 월드 경계는 두꺼운 테두리. 폰트: 제목 `Jua`(Google Fonts), 본문 시스템 산세리프.
- HUD 상단(지갑바 아래): 좌=HP바·XP바·레벨, 중=웨이브 n/20 + 남은초(큰 숫자), 우=재료 수. 협동이면 좌하단에 동료 미니 HP바.
- 피격 시 캐릭터 0.1s 흰색 플래시, 적 사망 시 스쿼시+파티클, 데미지 숫자(치명=노랑 크게), 재료는 흡수 시 플레이어로 빨려감. 화면 흔들림은 본인 피격·보스 등장만.
- 상점: 카드 4장(아이콘·이름·설명·가격, 티어 색 테두리), 하단에 내 무기 6슬롯(클릭 → 합치기/판매) + 아이템 목록 + 스탯 패널 토글. 모바일 세로에서 스크롤 없이 한 화면에 들어오게.
- 에셋 로드 실패 시 폴백: 캐릭터=갈색 원+눈, 적=타입별 색 원, 아이콘=이모지.

## 7. 에셋 매니페스트 (`spudsquad/assets/`, webp, 스프라이트/아이콘 256×256 투명, 원본은 정면 스티커)
- 캐릭터: `char_basic`, `char_muscle`, `char_science`, `char_lucky`
- 적: `enemy_blob`, `enemy_bug`, `enemy_tank`, `enemy_spitter`, `enemy_charger`, `enemy_splitter`, `enemy_elite`, `boss_1`, `boss_2`
- 무기: `weapon_<id>` (fist, stick, slingshot, pistol, shotgun, smg, laser, rocket)
- 아이템: `item_<id>` (§3.6 id 그대로)
- 배경 `bg_ground`(512 타일), 타이틀 `key_art`(960×657)
- 그리기 크기: 플레이어 56px, blob/bug 40, spitter/charger/splitter 48, tank 64, elite 72, boss_1 150, boss_2 190, 무기 28. 이동 방향에 따라 좌우 반전 + 걷기 바운스(스케일 사인).

## 8. 연동 (체크리스트)
- 지갑: `window.SharedWalletConfig={autoGuest:true}` → `/lib/shared-wallet.js?v=20260809pf2` → init. 보상 골드 = `클리어 웨이브 × 30 + (승리 ? 500 : 0)`, 결과창에서 1회만(가드).
- 랭킹: `lib/game-rankings.js`의 `GAME_CONFIG`에 `spudsquad:{name:'감자특공대', icon:'🥔', ...}`(기존 항목 형식 따라), 로드 `?v=20260927`, `GameRankings.injectNavButton('spudsquad')`, 결과 시 `submit('spudsquad',{score})`, score = `wave*1000 + kills`. 서버: games-server `functions/api/rankings/spudsquad.ts` = `blockblast.ts` 복제 후 치환.
- 멀티 로비: `new MultiplayerLobby({gameType:'spudsquad', gameName:'감자특공대', minPlayers:1, maxPlayers:4, onGameEvent, onLeave, onLocal: 혼자하기})`.
  **relay 게임 주의(Opus 확인 완료)**: DO는 relay 게임에 `state`를 안 보내므로 로비의 `onGameStart`는 **절대 호출되지 않는다**. 대신:
  - 게임 시작 감지 = 원시 클라 `lobby._ws`(MultiplayerWSClient)의 `onStarted`를 **기존 핸들러를 보존한 채 래핑**(`const prev=ws.onStarted; ws.onStarted=d=>{prev&&prev(d); SPUD.onMpStarted(d)}`). `d.players`=uid 배열(좌석순). 호스트 판정은 `onRoster`의 `hostUser`(마찬가지로 래핑해서 최신값 보관).
  - relay action 수신 = `onGameEvent('event', ev)`에서 `ev.type==='action'`이면 `ev.data`가 보낸 action. 재접속 복원은 `ev.data.type==='__resync'`, `ev.data.__snapshot`.
  - rt = `lobby._ws.sendRt(data)` / `lobby._ws.onRt=(from,data)=>...` (`getClient()`는 shim이라 sendRt 없음).
  - 로비의 진행 중 이탈 감지(`_inGame`)는 relay에선 비활성 — 이탈 처리는 §4.4대로 게임이 `onRoster` diff로 직접. 결과창은 `lobby.showResult({...})` 재사용 가능.
- 포털: `apps.json` **배열 맨 앞**에 항목(category는 기존 액션류 값, NEW 뱃지), `sitemap.xml`, 포털 `index.html` `GAME_TW` 맵에 `'감자특공대':'馬鈴薯特攻隊'`.
- i18n: ko/en/zh-TW 사전 + 🌐 토글 + `navigator.language` 감지.

## 9. 검증 (완료 조건 — 전부 증거 첨부)
1. `node --test spudsquad/test/` 통과. 최소:
   - sim: 웨이브 길이 공식, 적 스케일(w, n), armor/dodge/crit 공식, 무기 합치기, 상점 가격/리롤, 레벨 XP 곡선, splitter 분열, boss 웨이브 20 클리어 조건.
   - net: 스냅샷 encode→decode 왕복, 220 적 스냅샷 < 8KB, 보간 버퍼(스냅샷 누락 시 외삽 없이 정지).
   - **헤드리스 2인 통합**: 가짜 전송으로 Host+Guest 두 인스턴스를 붙여 웨이브 1 전체(30Hz 20초)를 돌리고 → WAVE_END → 양쪽 READY → WAVE_START(w=2) 수신까지. 게스트 위치가 호스트 월드에 반영되는지, 게스트 재료 수가 양쪽에서 같은지.
2. **실제 워커 WS 스모크** `spudsquad/test/ws-smoke.mjs`: `wss://relay-do-poc.zuhejbeg.workers.dev/room/<랜덤>?g=spudsquad&u=..&n=..` 2소켓 → start → rt 왕복 → action(WAVE_START+__snapshot) → 세 번째 소켓 재접속 시 `__resync` 수신 → `__final` 후 재시작 가능.
3. 모든 js `node --check` + index.html 인라인 스크립트 추출 체크.
4. 로컬 서버(`python3 -m http.server`)에서 페이지 로드 시 콘솔 에러 0 — 가능하면 playwright/chromium 헤드리스로 솔로 웨이브 1을 10초 자동 진행(가짜 입력)해서 에러 0과 캔버스 렌더(픽셀 비공백) 확인.
5. 커밋: games 레포 한 커밋(또는 논리 단위 몇 개), 메시지 한국어 OK. **push는 하지 마라**(검수 후 Opus가 push). games-server 랭킹 파일도 커밋만.

## 10. 범위 밖 (v1에서 하지 마라)
호스트 마이그레이션, PvP, 이모트, 영구 메타 진행(해금), 사운드(자리만: `SPUD.sfx(name)` no-op 훅), 서버 권위 시뮬.
