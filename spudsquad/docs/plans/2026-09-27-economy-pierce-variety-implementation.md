# 감자특공대 경제·관통·빌드 다양성 구현 계획

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 기본 판의 재화 인플레이션과 과도한 탄 관통을 줄이고, 상충 효과의 아이템과 캐릭터 2종으로 빌드 선택을 늘린다.

**Architecture:** 호스트 단일 시뮬레이터 `spudsquad/js/sim.js`에서 드롭의 XP/돈 가치와 투사체 남은 관통량을 계산한다. `data.js`는 수치/정의, `i18n.js`는 3개 언어 표기, `ui.js`는 상점 설명, `main.js`는 싱글 저장 복원을 담당한다. 게스트 스냅샷은 그대로 둔다.

**Tech Stack:** 순수 JS/CommonJS 테스트(node:test), Canvas 2D, 기존 정적 GitHub Pages·릴레이.

---

### Task 1: 관통 기본 규칙과 특수탄
**Files:** `spudsquad/js/data.js` (pistol/crossbow/item definitions), `spudsquad/js/sim.js` (weaponHit, projectile hit loop), `spudsquad/test/v2-combat.test.cjs`, `spudsquad/test/solo-save.test.cjs`.
1. 실패 테스트: 권총·석궁이 아이템 없이 앞 적만 맞힌다. 레이저·근접은 기존 범위를 맞힌다. 새총은 도탄, 로켓은 첫 충돌에서 폭발한다.
2. `node spudsquad/test/index.js`로 RED를 확인한다.
3. 일반 탄의 최대 추가 대상 수를 기본 0, 장착 관통 아이템 수만큼 증가시키며 후속 히트 피해를 감쇠시킨다. 현재 투사체의 `hit:Set`과 `power`가 저장/복원될 때 유효한지 확인한다. 무기 기본 `pierce`를 정리한다.
4. 테스트 GREEN, 커밋.

### Task 2: 돈과 XP 분리·지출 상한
**Files:** `spudsquad/js/sim.js` (`drop`, `gain`, `step`, `createWorld`), `spudsquad/js/data.js` (`curve`, 아이템), `spudsquad/test/sim.test.cjs`, `spudsquad/test/solo-save.test.cjs`.
1. 실패 테스트: 웨이브 1 드롭 돈=XP, 후반에도 XP는 유지하면서 돈만 줄어든다; 놓친 드롭 정산도 같은 돈 가치를 사용한다. 멀티 생존자에게 재료를 공정하게 나눈다.
2. `node spudsquad/test/index.js`로 RED 확인.
3. 드롭 조각에 0/1 화폐가치 필드를 두고 `gain(w,p,drop)`에서 XP 1·화폐 가치만 지급한다. 필드 없는 이전 저장은 1로 읽는다. 후반 감소율은 예를 들어 웨이브 5부터 완만하게 시작하고 최저값을 둔다. 저금통 복리 보너스는 중복 장착에 상한을 둔다.
4. 테스트 GREEN, 웨이브별 수급표 저장, 커밋.

### Task 3: 빌드 선택 2 캐릭터·4 아이템
**Files:** `spudsquad/js/data.js` (`chars`, `items`), `spudsquad/js/sim.js` (`trait`, 구매/아이템 훅), `spudsquad/js/i18n.js`, `spudsquad/js/ui.js`, `spudsquad/test/char-stats.test.cjs`, `spudsquad/test/v2-growth.test.cjs`.
1. 실패 테스트: `저축감자`는 재화 보유 보상과 약한 기본 화력, `가시감자`는 피격 반격과 이동/회피 비용. 관통 프리즘/균열 탄두/현상금 배지/가시 코일은 효과·패널티가 각각 실제로 작동한다.
2. RED 확인 후 기존 데이터·훅 패턴으로 최소 구현. 3개 언어 배열 순서와 상점 설명·상태 화면을 함께 업데이트한다.
3. GREEN, 커밋.

### Task 4: 신규 캐릭터/아이템 아트·UI
**Files:** `spudsquad/assets/char_<id>.webp`, `spudsquad/assets/item_<id>.webp`, `spudsquad/index.html`, `spudsquad/js/render.js`, `spudsquad/test/layout-smoke.mjs`.
1. 기존 에셋 톤을 살핀 뒤 신규 6개 아이콘을 이미지 생성 모델로 제작해 웹용 투명 배경에 맞춘다. 기존 파일은 덮어쓰지 않는다.
2. 화면 폭 390px/1280px에서 카드/상점/이름이 잘리지 않는지 검증. 등급 컬러와 투사체 효과가 관통 규칙에 맞는지 확인.
3. 캐시 버전을 올리고 커밋.

### Task 5: 밸런스와 배포 전 검증
**Files:** `spudsquad/test/balance.mjs`, `spudsquad/BALANCE.md`, 필요 시 `spudsquad/js/data.js`.
1. 이전 `BALANCE.md`의 16시드·10캐릭터 결과를 기준으로 신규 캐릭터 포함 10~20시드를 같은 봇으로 실행한다. 웨이브별 돈·XP·구매량과 캐릭터별 도달/클리어를 기록한다.
2. 초반 구매 기회가 있고 기본감자 클리어율이 이전 56.3%보다 낮아졌는지 검증하되 전 캐릭터 0%·100%로 쏠리지 않게 곡선을 조정한다.
3. `node spudsquad/test/index.js`, `node spudsquad/test/refresh-smoke.mjs`, 2인 릴레이 브라우저 스모크, `git diff --check`를 실행한다.
4. 커밋 후 사용자 배포 승인을 받고 푸시한다. 운영 `https://game.cocy.io/spudsquad/`에서 실제 관통·경제·싱글 저장 및 멀티를 재확인하고 결과를 보고한다.
