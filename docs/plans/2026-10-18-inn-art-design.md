# 여관 시설 이미지·화로 재정비
사용자30530요청: 대장장이외장비제작별도진입없애기,창고/장비상아이콘명확히,이미지모델로여관이미지전반교체,화로살아있는불효과.
배경과여관시설동일화풍(기존차분한중세다크판타지,목재석재/황동·따뜻한호박불빛), 글자는이미지에생성하지않고DOM텍스트유지. 배경1+시설(만물상물약상자/장비상칼갑옷진열/대장장이모루망치/창고뚜껑열린목제상자철띠/가방배낭/아카데미책두루마리/월드맵게시판/화로벽난로)최소8패밀리모델생성. 해골묘지모드기존의미유지/화풍안맞으면변형필요하나인간저장/게임플레이불변.
로컬WindowsNativeLuminarQMixSDXL8GBVRAM등기존파이프라인사용(WSL생성금지), API추가과금/설치없음. 모델작업스크립트경로실재확인후사용. output/WebP최적화총용량적절. 생성모델/seed/prompt/hash/직접이미지검토기록,사진자르기만으로시설식별안되면재생성.
화로: 독립겹불꽃2~3층/불빛불규칙flicker/잔불spark소량/조명halo, transform+opacity GPU위주, 클릭가림없음/prefers-reduced-motion시정적타오르는프레임/탭숨김중애니멈춤. PC1280/390버튼라벨터치영역/가독성.
별도장비제작tile제거하되forge제작·분해기능/제작버튼경로보존. 창고와가방아이콘확연구분, 상인도weapon일반아이콘말고진열대. skeletonworker수정중 hub동일파일별도branch만편집(부모가순차merge). 사용자가승인한범위내commit/stamp/push/prod검증은부모수행.

## Design context and implementation contract
Audience: desktop and touch web ARPG players returning from combat to manage equipment and supplies. Jobs: identify storage vs carried bag instantly, buy equipment, and reach crafting through the smith. Tone: quiet, weathered medieval dark fantasy; oak, limestone, tarnished brass and restrained amber embers. Existing human/skeleton identities and all economy/save/combat rules remain unchanged.

Use the Windows-native existing `generate-image-win.py`/`diffusion-win` implementation and its cached LuminarQMix SDXL snapshot offline. Nine independent 30-step outputs; one shared style prompt. Keep raw PNGs in `C:\Users\user\ai-tools\arpg-art\inn-20261018`, outside the served repository. Deliver bounded-size WebP plus complete prompts, seeds, source/output SHA-256 and direct-image review notes.

Red/green: verify the duplicate crafting entry fails the new hub contract before editing; prove smith → crafting route stays accessible for both lineages without writes. Native isolated browser contexts exercise the actual ordinary `/arpg/` entry at 1280/390, decoded art, ink geometry, native navigation/crafting and animation lifecycle. The native runner accepts `ARPG_BASE_URL` and evidence path for parent production replay. No screenshots, deployments or stamps in this branch.


## Implementation evidence notes
- Existing cached model snapshot is used offline; no model download/API/install. Asset provenance is `arpg/assets/inn/manifest.json`; raw PNGs and rejected attempts stay outside the webroot.
- Anvil-only text prompts repeatedly produced wrong shapes/people. Rejected rather than shipping them. Final anvil uses the existing generator’s SDXL img2img option with an original composition guide at strength 0.42 (30 configured steps, 12 denoising steps).
- Native runner explicitly discloses its Page Visibility API signal injection: headless Chromium leaves real targets visible. The installed visibility handler is tested against a controlled `document.hidden` signal and its CSS animation time must stop; OS background-tab behavior is not falsely claimed.
- Existing `forgotten-graveyard`, `h1-inn-character` and `inn-restructure` contain three pre-existing stale assertions, reproduced against clean base `c72182e`; this task does not refresh unrelated historic snapshots or recipe/book expectations.
