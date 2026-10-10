# 잿빛 여관 · UI 검토 B

**상태: 1단계 조사·디자인 시스템·정적 목업. 게임 구현/밸런스 변경/배포 아님.**

`index.html`을 정적 서버에서 열면 된다. 390×844 기준, 상단 6개 탭·빈 영역 좌우 스와이프·키보드 방향키/Home/End로 비교한다. 실제 게임 JS/CSS를 가져오지 않으며 저장·구매·장착·전투·보상은 실행하지 않는다. 게임 아틀라스만 상대경로로 참조한다. noindex/nofollow/noarchive.

## 1. 확인한 맥락과 범위

요청자가 제공한 맥락: **모바일 세로 액션RPG**, NPC를 눌러 준비하고 출정하는 흐름, **‘잿빛 여관’ 다크 판타지**, KayKit 3D 큰머리 기사. 목적은 짧은 준비 동안 보급·장비·계약을 판단하고, 전투 중 조작을 놓치지 않게 하는 것. 보라 그라디언트·네온·글래스모피즘·이모지·CDN·웹폰트를 금지한다. 타깃 연령, 한손 플레이 가능성, 리텐션은 확인되지 않았으며 추정하지 않는다. 이번 목업은 양손 전투를 전제로 검토할 형태이지 사용성 검증 결과가 아니다.

### 읽은 기준

- `arpg/js/ui/hub.js`: `HubUI`, NPC/상점/장비 시트/교관/계약/출정/정산 흐름.
- `arpg/js/ui/hud.js`: HP·MP·무게·전리품·쿨다운/개수·귀환 채널링.
- `arpg/js/ui/icons.js`, `arpg/css/game.css`, `arpg/index.html`: 기존 인라인 SVG, 버튼/포커스/오버레이, HUD 앵커.
- `/home/cocy/.openclaw/workspace/docs/design/arpg/design-v6.md` §3.2, §26.2 (읽기만).

### 로컬 Chromium에서 실제 확인한 흐름

새 격리 세션: 도입 → 이름 → 5개 소환 문답 → 추천 무기/무기 변경 → **S1 30초** → Lv2 능력치 3점 분배 → 결과 → 여관 → 주인·약사·대장장이·교관·게시판 → **S2 출정 확인**. 기존 게임의 이 확인 과정에서 page error 0.

- 기존 상점은 3가지 보급과 수량/총액이 있고, 구매 후 골드·무게는 안내 접기 안에 있다. 목업은 판단에 필요한 두 결과를 전면으로 옮긴다.
- 장비 시트는 위력/HP 변화와 요구 레벨·무게를 보여준다. 목업은 이 기능을 대체하지 않고 **현재/후보/변화**의 읽는 순서를 분리한다.
- 결과 이전에 필수 능력치 분배가 나오는 경우가 있다. 이번 6개 주요 화면은 결과 뒤 분배로 게임 순서를 바꾸지 않는다.
- 설계 §3.2 MVP 핫스폿은 주인·약사·게시판 3개지만 현행 코드는 대장장이·교관 포함 5개다. 목업은 **3개를 공간에**, 나머지 **2개를 기능 목록에** 놓는다. 이미 구현된 기능을 제거하지 않는다.
- §26.2의 가드·스태미나·화살·서클/주문 링은 **후속 제안**이다. 목업에 표시했다고 M1의 실기능이 되는 것이 아니다. 전투 무기 토글은 검토 장치이며 필드 스왑 구현이 아니다. MVP 무기 교체는 여관에서만 유지한다.

## 2. 외부 조사: 채택 / 피하기

조사일: 2026-10-10. 웹 검색 후 본문을 확인할 수 있는 자료는 재확인했다. 이미지·스크린샷·로고는 내려받거나 퍼오지 않았다. **Archero/VS는 세로 모바일 참고, Soul Knight/Diablo/Hades는 조작·준비 루프 비교 사례**로 분리한다. 후자를 세로 UI의 직접 증거로 포장하지 않는다.

| 사례 / 출처 | 확인한 패턴 | 채택하는 것 | 피하는 것 |
|---|---|---|---|
| [Archero 초보 가이드 · LevelWinner](https://www.levelwinner.com/archero-beginners-guide-tips-cheats-strategies/) — 본문 확인 | 이동 조이스틱, 정지할 때 공격, 챕터별 런/능력과 영구 성장의 구분 | 준비 화면과 실전 화면의 목적을 분리하고, 전투 중앙은 적 예고 읽기에 남긴다 | **정지=자동 공격을 이 게임에 복제하지 않음.** 실시간 공격·회피 입력을 숨기지 않는다 |
| [Soul Knight · 개발사 App Store 소개](https://apps.apple.com/us/app/soul-knight/id1184159988) — 본문 확인 | 자동 조준, dodge/fire/cast라는 소수의 직관적 조작 역할, 무기별 플레이스타일 | 공격 버튼에는 실제 동사(베기/발사/시전), 보조 위젯에는 무기별 판단 정보 | 무기 아이콘만 바꾸고 읽는 정보는 동일하게 유지하는 방식. 자동 조준을 새 기능으로 약속하는 것 |
| [Diablo Immortal 접근성 · Blizzard 공식](https://news.blizzard.com/en-us/article/23805083/making-a-game-for-everyonediablo-immortals-accessibility-features) — 본문 확인 | 모바일 스킬 버튼 위치 조정, 컨트롤러 리매핑, 어두운 월드의 가시성 조정 | 큰 터치 표적, 눈에 띄는 대비, 공통 생존 조작 고정. 조작 커스터마이즈는 후속 검토 항목 | 어두운 분위기를 명분으로 낮은 대비 허용. 키트마다 회피·물약 위치를 이동 |
| [Diablo 장비 점수 사용자 사례 · Reddit](https://www.reddit.com/r/DiabloImmortal/comments/vjl9f3/does_more_score_equal_better_itemupgrade/) / [HellHades 글](https://hellhades.com/diablo-immortal-dont-make-this-gearing-mistake/) — 검색 근거, 상세 본문 불충분 | ‘더 높은 점수=더 좋은 장비인가’라는 혼동 제기 | 실제 수치 비교, 무게 증가 손해, 다른 무기 계열의 비교 한계 안내 | ‘좋음’ 화살표 하나로 장착 권유. **사용자 사례를 객관적 사용성 실험처럼 인용하지 않음** |
| [Vampire Survivors 조작 · Gamepressure](https://www.gamepressure.com/newsroom/vampire-survivors-controls-explained/z14ebf) — 본문 확인 | 공격은 자동, 플레이어는 주로 이동/방향과 선택에 집중 | 불필요한 전투 메뉴 제거, 역할과 위험이 필요한 순간만 표시 | 해당 게임의 적은 버튼 수를 이 수동 액션RPG에 그대로 적용. 필수 공격·귀환을 없앰 |
| [Hades 게임플레이 · Wikipedia](https://en.wikipedia.org/wiki/Hades_(video_game)) — 본문 확인 | 사망 후 House 귀환, 런 사이 업그레이드·무기·NPC 준비 루프 | 여관을 ‘실패 뒤 다음 준비’의 공간으로, 결과 화면을 정산/다음 힌트로 연결 | Hades의 실제 이동을 모바일 허브의 메뉴 노동으로 복제. 사망을 바로 재출정으로 덮음 |

Hades의 사망 시 자원 보존 규칙은 이 게임과 다르다. **귀환·준비 루프만** 가져오고, 기존 ARPG의 확보/상실 규칙은 유지한다. 게임별 패턴의 ‘효과’는 이 프로젝트에서 아직 검증하지 않았다.

검색은 `Archero mobile stop to shoot joystick equipment UI Soul Knight controls`, `Diablo Immortal inventory compare equipped item green arrows touch controls HUD skill buttons`, `Hades House of Hades hub preparation ... Vampire Survivors portrait mobile controls` 등을 사용했다. Fandom/PrimaGames/TouchArcade 일부는 403, MiniReview/HellHades 일부는 본문 추출 불충분이었다. 우회하지 않고 위의 확인 가능한 자료와 검색 수준의 사용자 사례를 구분했다.

## 3. 디자인 시스템

### 스킬 실행과 선택의 근거

`ui-ux-pro-max`의 `--design-system` 흐름을 **실제로 2회 실행**했다.

```sh
python3 /home/cocy/.openclaw/workspace/.agents/skills/ui-ux-pro-max/scripts/search.py "mobile action RPG game dark fantasy ash inn warm bronze stone tactile accessible portrait touch" --design-system -p "잿빛 여관 · ARPG B" -f markdown
python3 /home/cocy/.openclaw/workspace/.agents/skills/ui-ux-pro-max/scripts/search.py "gaming mobile app dark mode minimal tactile warm earthy medieval fantasy accessible" --design-system -p "Ash Inn · restrained tactile variant" -f markdown
```

원본 출력: [`design-system-cli.md`](design-system-cli.md), [`design-system-variant.md`](design-system-variant.md). UX 보충 검색은 `touch target game controls reduced motion contrast --domain ux -n 5`. 추가로 `impeccable-frontend/SKILL.md`의 맥락 우선·카드 남발 금지·상태 위계·장식 모션 절제 원칙을 참고했다.

| 자동 추천 | 판정 |
|---|---|
| 어두운 UI + 높은 대비 + 큰 터치 표적, focus/reduced-motion/일관 아이콘 | 채택. 구체적인 토큰과 검증으로 바꾼다 |
| Funnel/App Store Landing/다운로드 CTA | **제외.** 게임 내부 화면이며 마케팅 페이지가 아니다 |
| Pixel Art·순간 깜박임 | **제외.** 현재 KayKit 3D 구운 아트와 충돌 |
| 보라/네온, 글래스, Parallax/WebGL 3D | **제외.** 요청 금지사항·정적 목업·성능 목표와 충돌 |
| Google Fonts/Outfit/Orbitron/JetBrains Mono | **제외.** 외부 폰트 금지. 한국어 시스템 폰트 우선 |

자동 생성 결과를 그대로 사용한 것이 아니라 **요청 맥락으로 걸러 최종 시스템을 생성**했다. 원본 출력에 웹폰트 코드가 있어도 HTML/CSS에서는 사용하지 않는다.

### 조형 방향: ‘황동으로 묶은 여관 장부’

안전한 여관은 난로·목재·황동의 온기, 밖은 재/이끼의 저채도. 캐릭터는 실제 KayKit 스프라이트가 주인공이다. UI 장식은 여관 공간, 비교 장부, 정산 인장에 한정한다. 웹사이트식 랜딩 히어로·메트릭 대시보드·카드 속 카드가 아니다.

| 토큰 | 값 | 사용 |
|---|---|---|
| `--ash` | `#141916` | 바탕 |
| `--surface` / `--raised` | `#222821` / `#30362B` | 메뉴 면·눌림 |
| `--ink` / `--muted` | `#EFE6D2` / `#B8B39F` | 양피지 텍스트·보조 텍스트 |
| `--brass` | `#D3AD6D` | 유일한 주 CTA·선택·포커스 |
| `--edge` / `--hairline` | `#696956` / `#414739` | 기능 경계·장부 구분 |
| HP / MP | `#AB5753` / `#6C8D9C` | 체력/마나 전용. 일반 강조에 사용하지 않음 |
| gain / loss | `#ADC6A0` / `#E9A294` | 증가/손해. 반드시 `+수치/−수치/증가/무거움` 텍스트 병행 |

- **타이포:** 본문 system-ui, Malgun Gothic, Apple SD Gothic Neo. 장소/결과 제목만 AppleMyungjo/Batang/Georgia 로컬 serif. 제목 30/29, 패널 17/18, 의사결정 본문/주 CTA 16, 보조 12/13, 전투 개수·메타 10/11. 숫자는 tabular-nums. 전투 정보는 명시한 예외 크기이며 작은 텍스트를 긴 설명에 쓰지 않는다.
- **간격:** 기본 8, 그룹 내부 4/6, 선택 표적 간 8, 패널 수평 16, 큰 그룹 20/24. 전체폭 서비스 목록은 행 구분선으로 구획한다. 390×844에서 기본 의사결정 면을 한 화면에 맞추고, 작은 화면/설명 확장은 콘텐츠 영역만 스크롤한다.
- **버튼:** 한 주요 화면에 주 CTA 하나, 52px 높이/황동 채움/어두운 글자. 부 CTA는 짙은 면+얇은 경계. 뒤로/설정은 44×44. 분해는 조용한 손해색+확인. 비활성은 제한 이유를 옆에 표시하고 희미한 투명도로 숨기지 않는다. 공격 80, 회피 56, 작은 주문/보급 44 이상.
- **아이콘:** 직접 작성한 인라인 SVG 세트, viewBox 24×24, 1.6px stroke, round join. 의도치 않은 이모지/아이콘 폰트 없음. 의미는 텍스트나 aria-label이 담당. 장식은 aria-hidden.
- **모션:** 색/경계 160ms ease-out, 위치·크기 애니메이션 없음. 키트 전환 즉시 반영. UI 문법 승인 전 룬 회전·불 깜박임·파티클은 넣지 않음. `prefers-reduced-motion`에서 transition/animation을 끈다.
- **레이어:** 장면 장식 → HUD/조작 → 단기 안내 → native dialog. 본문 상점·비교는 모달 안에 숨기지 않는다. 구매/장착/분해 버튼은 저장 없는 검토용 확인만 연다.
- **대비:** 일반 텍스트 목표 4.5:1 이상. 배경과 중요 글자의 주요 조합은 검증 보고서에 포함. 이것은 DOM 기하/토큰 검증이지 실제 기기 야외 시인성 테스트는 아니다.

## 4. 화면별 결정

1. **여관:** 장소 제목 → NPC 공간 → 무료 회복 → 대장장이/교관 → 가방 → 계약 CTA. 3개 공간 핫스폿의 서사 역할은 §3.2에 맞추고, 기존 5개 기능은 모두 찾을 수 있게 한다. 실제 atlas의 `idle_SW_000` 128×128 프레임을 CSS로 잘라 쓰며 이미지를 새로 만들거나 복제하지 않는다.
2. **상점:** 3개 보급의 이름/단가/보유량 → 수량 → 총액·구매 후 골드·무게 → 확인. 귀환서 소지 상한 2장(보유 1이면 추가 1개) 표시. 목업 일반 보급 수량 5개 제한은 **리뷰 편의**이며 실제 게임 상한을 5개로 바꾸는 제안이 아니다.
3. **대장장이:** 후보 선택 → 현재/후보 → 위력·무게·요구 레벨 → 장착 후 가방 → 비용을 적은 강화/분해 → 장착 확인. 철검 +1 기본 배율은 현행 `1.15 × 1.042 ≈ 1.20`, 무게 8→12. 다른 계열은 기본 배율만 비교하며 실전 피해 우열을 단정하지 않는다. 철검 +1→+2 비용 94 G/고철5, 나머지 +0→+1 60 G/고철4. 분해 반환은 획득/제작 출처에 따라 달라지는 더미 인스턴스 예시.
4. **게시판·출정 확인:** 완료/선택/잠김 계약을 텍스트와 SVG로 구분. 별도 모달 대신 같은 화면의 준비 확인 면에 보급·무게·완료/귀환/사망 규칙을 놓는다. 클릭 한 번으로 예상 못 한 전투에 진입하지 않음.
5. **전투 HUD:** 상단 HP/MP·목표, 작은 무게/임시 전리품. 좌측 이동 공간, 우측 전투 조작. **HP/보급 3개/귀환/회피 좌표는 3변형에서 동일**. 검은 스태미나·콤보·가드/큰 근접 버튼, 활은 차지·화살·적 레티클/약점, 지팡이는 캐릭터 둘레 마나 서클·주문 링. 고정 MP 바는 세 변형에서 읽는 기준으로 남기고 지팡이 주변 서클을 보조 표현으로 추가했다. 추가 위젯은 §26.2 승인 대상이며 현행 게임 기능으로 표시하지 않는다.
6. **결과:** 클리어/사망 2개 변형. 확보 XP/골드/재료 또는 사망 원인·상실을 분리. 다음 행동은 여관 하나. 즉시 재도전/광고 부활/보상 뽑기 없음. 목업의 시간/경험치/골드/능력치 수치와 힌트는 더미이며 실제 정산 공식의 증거가 아니다.

각 화면 맨 아래 ‘왜 이렇게?’가 외부 근거와 현행 설계를 한 줄로 연결한다. 6개 탭/전투·결과 토글/목업 안내는 **리뷰 도구**로 2단계 실제 게임 UI에 들어가지 않는다. 교관 상세는 이번 범위 밖이라 안내만 표시하며, 기존 능력치 분배 기능을 삭제한다는 의미가 아니다.

## 5. 검증과 한계

[`verify.mjs`](verify.mjs): `node arpg/ui-mock/verify.mjs` (기존 로컬 Playwright와 Chromium 필요, python3 정적 서버 사용). 빌드/패키지 설치/게임 변경 없음. 일시 서버는 종료한다. **스크린샷 코드와 이미지 결과 없음.**

- 390×844 Chromium에서 기본 6화면, 3 HUD, 2 결과, 3 보급, 3 장비, S1 계약 선택 = 18상태.
- 모든 표시된 button/summary의 DOM 사각형: 뷰포트 밖 0, 버튼끼리 겹침 0, 44×44 미만 0. 가로 넘침 0.
- HUD 공통 생존 조작 좌표가 3변형에서 동일함을 배열 비교로 검증. 3 기사 아틀라스 이미지 decode 확인.
- 상점 상한·총액·무게, 장비 변형, 계약 선택/확정, 확인 dialog, 6개 조사 접기, 키보드 탭, 합성 touch swipe, reduced-motion, noindex, 외부 리소스 요청 0, storage 기록 0 확인.
- 최종 검증: **Chromium 149.0.7827.55**, 18상태 PASS, console/page error 0, 리소스 4xx/5xx 0, 기본 본문 세로 스크롤 필요 0. 결과는 [`verification.json`](verification.json)에 저장.
- 주요 텍스트 대비: 본문/재 14.33:1, 보조/상승면 5.92:1, 주 CTA 7.79:1, 선택 황동 5.66:1, 증가 9.63:1, 손실 7.22:1, HP바 5.65:1, MP바 5.12:1. 8개 모두 4.5:1 이상.
- 설명을 펼치면 콘텐츠 영역은 스크롤될 수 있다. 하단 CTA/설명은 고정된 정상 flex 영역이고 게임의 콘텐츠와 겹치지 않는다. 390×844 기본 화면이 주요 기하 검증 범위다. 작은 뷰포트/확대와 손가락 실제 기기 검증은 승인 후 후속으로 해야 한다.
- 브라우저 프록시는 localhost 접근을 정책으로 제한했으므로 설정을 변경하지 않았다. 격리된 **로컬 테스트 러너**의 Chromium으로 요청된 로컬 확인을 수행했다. 스크린샷은 전 과정에서 찍지 않았다.

요청자의 실제 미감/손의 위치 승인은 아직 없다. 목업을 보고 여관 공간감·장부 밀도·무기 HUD 중 무엇을 유지/바꿀지 먼저 승인 받아야 하며, 코드 구현이 완료되었다고 보고하지 않는다.

## 6. 2단계 승인 후 바뀔 파일 — 제안 목록, 이번 diff 아님

| 파일 | 역할 / 보존할 계약 |
|---|---|
| `arpg/css/game.css` | 토큰·패널/장부/CTA/터치/안전영역·반응형. 저장/밸런스 무관 |
| `arpg/js/ui/hub.js` | 여관 공간과 기능 목록, 상점 사전 결과, 비교 읽기 순서, 게시판/정산 마크업. 기존 `action`, 저장·정산·필수분배 순서 유지 |
| `arpg/js/ui/icons.js` | SVG 도형·접근성/라벨 규칙 통일. 기존 의미/아이템 매핑 유지 |
| `arpg/index.html` | HUD 공통 앵커와 무기 슬롯 마크업. 리뷰 탭/더미 수치/목업 스크립트는 옮기지 않음 |
| `arpg/js/ui/hud.js` | 공통 생존 상태 유지, `weaponKit → layout` 위젯 분리. 신규 가드/화살/주문은 sim에 없으면 숨김 |
| 신규 `arpg/js/ui/weapon-layouts.js`, `arpg/js/ui/kits/{blade,bow,focus}.js` | **M2 후속 게이트 승인 시에만** kit 데이터/표현 모듈. 목업의 가상 자원을 실기능으로 선행 구현하지 않음 |
| `arpg/js/input.js` | kit 데이터에서 입력 매핑 파생이 승인될 때만. 현행 held-attack release·터치 취소 안전성 유지 |
| UI 테스트 | 실제 Hub/HUD DOM 계약, 좁은 화면·safe-area·실제 keyboard/touch·파괴적 확인 테스트 추가 |

이번 작업에서 `arpg/js`, `arpg/css`, `arpg/index.html`, sim/meta/자산은 **모두 수정하지 않았다**. 물리/밸런스/서클 습득/필드 무기 스왑은 별도 작업이고 UI 2단계에 자동 편입하지 않는다. 이 폴더 전체는 승인용으로만 별도 배포 가능하며, 본 에이전트는 로컬 커밋만 수행한다.
