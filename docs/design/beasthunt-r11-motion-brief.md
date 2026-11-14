# BeastHunt R11 — 활 접점 / 다운 회복 / 쌍검 휠윈드

## 방향과 변경
- 활은 왼손 손바닥 midpoint에 실제 프레임 그립(원점)을 고정한다. +X로 휜 팁/줄 쪽을 오른손 방향으로 정렬한다. 기존 world-up만 맞추던 방법은 yaw가 정의되지 않아 왼손에 줄이 겹칠 수 있었다.
- 오른손 손목이 아닌 손바닥 midpoint에 줄 두 세그먼트와 화살 노크를 일치시킨다. 거리 상한 clamp 및 dt lerp 제거. 조준 idle/이동도 이미 당긴 자세이므로 줄을 유지하고, 실제 h0 이후 줄 복귀 및 노크 화살 숨김. walk→attack 잔류 blend도 제거.
- GS/BOW/DB의 down은 기존 death 클립 전체 재생이 아니다. 동일 스킨의 ready/floor 표본으로 별도 60Hz 키클립을 작성: 0–30% 반동·낙하 / 30–43% 접지 / 43–100% 팔·무릎 보조 기상. down 1.15초 종료 전에 ready로 복귀. 중간 pose 보간에서 발생하는 발/손/머리 바닥 관통은 모델만 최소 lift(15mm 바닥 여유)로 보정. stun 원본의 서있는 비틀거림과 dead 원본의 바닥 마지막 자세는 유지.
- DB 기존 special 1.0초 / charge0 / cost22 / multi5 / active .12–.86을 그대로 둔다. 두 짧은 교차베기 악센트→긴 마무리 회전의 표현이다. 팔·상체·다리의 별도 키클립과 C1 yaw curve를 작성하고 자체 회전이 있는 원본 spin yaw를 제거해 최종 world 720° 한 경로만 사용한다. 양팔이 교대로 참여하고 발끝 최저높이를 35mm로 보정한다.
- 3단계 신규 게임플레이/입력/히트수/피해/VFX 추가 없음. 일반 콤보 및 authoritative sim/data/net/fixed/input 파일 미변경. GLB·텍스처·메타데이터 원본 byte 보존, 신규 원본 취득·Blender 재설치 없음. 필요한 키를 런타임에서 자산별 1회 생성·WeakMap cache하고 mixer만 개체별 독립.

## 검증 범위
- 신규 r11-motion.test.mjs: yaw 단조성·정확히 2회전·악센트 접합 C1/속도, 세 어댑터 연결, 줄 지연/상한 회귀.
- r11-motion-browser.mjs: full/lowfx, 활 8상태×121샘플의 최종 손/프레임/줄/화살 끝점, 3무기 down/stun/dead×121샘플, DB 601샘플 최종 world yaw·발높이·손 접점.
- r11-coop.mjs: 실제 배포 relay에 독립 Chromium 두 클라이언트, bow/db와 db/bow 양 host 순서, 원격 shot/spin 진행 및 mixer 분리. 스크린샷 없음.

## 한계 / 부모 통합
- 아트 승인 아님. 캡처 동의 전 스크린샷·영상 생성하지 않음. 배포 후 사용자 모션 평가가 최종 시각 판정이다.
- 기상은 승인된 스킨의 pose-key authoring이며 새 모캡 get-up FBX가 아니다. 발 높이/2회전 수치가 발바닥 수평 foot-lock·미끄러짐 없음이나 훌륭한 동작을 보장하지 않는다. 회전 피벗은 35mm 발끝 접지이고 수평 toe IK-lock은 미구현.
- 활 draw-arrow 원본에는 화살을 꺼내는 넓은 손 궤적이 있다. 접점은 전 구간 따라가지만 자연스러운 새 활 모캡/팔 IK를 재작성했다는 주장은 하지 않는다. 줄은 두 강체 링크(탄성 limb 시뮬레이션 아님).
- 원본 down/dead floor pose의 단순 death-derived 시간재생을 없앴지만 floor 정적 자세는 승인된 원본에서 재사용한다.
- cache key bump는 부모 최종 통합에 위임. 신규 motion-authoring.js와 3 adapters를 함께 새 캐시에 묶어야 한다. 본 branch는 push/deploy 안 함.
