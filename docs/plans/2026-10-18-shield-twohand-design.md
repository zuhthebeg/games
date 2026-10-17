# 방패 지속방어·반격돌진·양손무기 승인 설계

사용자 30509 요청, 30512 07:44 승인. GPT 진행 승인 유효. 목표: 누르고 지속방어, 타이밍 방어 돌진, 입체적 방패, 양손검/양손둔기 2배무기피해+방패금지.

## 입력/방어 (승인)
방패장착한손검/한손둔기만 회피 버튼 대신 방어. PC 기존Space, 모바일기존dodge버튼 hold; held와edge분리, release/blur/pointercancel/touchcancel/death/종료/해제시즉시풀림. 계속누르면계속유지, 재입력edge없이는완벽막기다시안열림. 방어중기본공격중단/스킬금지. 정면공격만70%피해감소(×.3), 후방/DOT변화없음. 무적프레임으로구현하지않음. 방어중제자리(기존stationary와동일), 방향은입력aim으로갱신가능하되피격순간일관된권한.

## 타이밍막기/방패돌진
새 누름edge 이후 기존 perfect-dodge와동일한타이밍창 권장(현행balance상수재사용), 정면blockable공격실제적중때피해0+적방향짧은돌진/방패강타1회. 계속누르는동안다시발동금지, 새누름에도기존countercooldown재사용해연타악용방지. 돌진에는일반회피무적없음(성공적중만0피해). projectile도가능하면맞은투사체기점/적위치로방향명확히. 사망/피격/쿨다운/각도후방/해제/lifecycle정리. 기존sword/blunt/bow/staff비방패counter동작불변.

## 양손분류
handedness메타(1/2)추가. sword/blunt form과스킬은유지(새family불필요), exactloadouthistory손대지않되장착조건별도. 새양손검/양손둔기각T2/T3/T4 3티어계열추가(희귀도변종/제작/원래제한된완제품드랍규칙따름). 기존장비는기본한손(다른활/focus기존방패금지불변), 기존파수꾼대검 등명칭과불일치하는것은명시양손재분류가능하되중복동일ID/배율금지; 합리적으로기존sword/blunt중이름대검/전쟁망치만양손으로정리하고변경목록보고. 양손무기동급한손대비무기공격피해×2:기본타/직접무기기술만,힐/주문/DOT제외,강화/은특효와중복적용규칙공용단일경로. 동급기본power×2와runtime×2를동시적용금지. 신규손속성deriveMods→host→snapshot/predict/renderer이어짐. 방패동시장착불가/양손전환자동해제+경고/포지상점·제작·비교·획득설명표시. 장착save검증에서도막음. 기존저장파괴사용자허용있지만불필요삭제/리셋금지.

## 방패렌더
평면Pixi도형개선: 캐릭터와어울리는입체두께/금속테두리/전후면/손잡이. 원형방패명칭일치. 기존8방향손anchor/앞뒤depth/스케일/동작맞춤,guard/bashing때명확한위치. 가능하면원본Blender모델8방향방패장비sprite(캐릭터모든동작재베이크없이attach) 또는자연스러운경량입체shadedsprite. 기존캐릭터fallback/gpu자원lease/destroy정상. 스크린샷사용자승인없음, offlinecontactsheet는별도검토가능.

## 검증/경계
TDD+focusedregressions. 실제hold10sec/release/pointercancel/blur/buttonup키보드touch; 정면70%/후방DOT동일/완벽0+진짜돌진한번/hold재발동없음/연타쿨다운; 양손×2/힐주문비적용/silverstack/양손shield금지모든equip경로save검증; hostsnapshot/prediction/delayedrelease/reorder중stuckguard방지. InputQueue30/400msiframe/300msrewind/hostauthority/DTRNG변경금지. PC1280touch390격리validfixture native. 기존유저session/save접근없음. 부모stamp/push/deploy/CIexact/mainlab실요청hash/운영native후최종보고.
