/* 동물상 판독기 — i18n (ko/en/ja).
   문자열은 전부 여기, 코드에선 AF.t(key, params) / AF.animal(id).name 로만 쓴다.
   전역은 AF_ 접두사로 감싼다 — 공용 lib(shared-wallet 등)와 이름이 겹치면
   인라인 스크립트가 통째로 죽는다(이 레포에서 반복된 사고). */
(function (global) {
  'use strict';

  var UI = {
    ko: {
      title: '🦊 동물상 판독기',
      sub: '얼굴 468개 점을 실측해서 23종 중에 찾아줍니다',
      metaTitle: '동물상 판독기 — 내 얼굴은 무슨 동물?',
      sexF: '여자', sexM: '남자', sexAny: '상관없음',
      pick: '📷 사진 선택', cam: '🎥 카메라로 찍기', shot: '📸 찍기', camClose: '닫기',
      privacy: '사진은 이 기기 안에서만 처리됩니다. 서버로 올리지 않습니다(결과 동물 종류만 분포 집계에 보냅니다).',
      phEmpty: '사진을 넣으면 여기에 결과가 나와요',
      mirror: '😀 표정 따라하기', mirrorStop: '⏹ 그만하기',
      gif: '🎞 GIF 만들기', gifRec: '🎞 녹화중 {i}/{n}', gifMaking: '🎞 만드는 중…',
      gifHint: '{kb}KB — 길게 눌러 저장하거나 아래 버튼', gifSave: '⬇ GIF 저장',
      gifFail: 'GIF 실패: {msg}', gifNeedMirror: '먼저 "표정 따라하기"를 켜주세요',
      basis: '근거: {why}',
      axisHint: '사진에서 잰 실제 비율입니다. 별점이나 랜덤이 아닙니다.',
      big: '큼', small: '작음', mid: '보통',
      celebSame: '같은 {name} 연예인',
      celebNear: '{name} 연예인은 아직 정리 중 — 다음으로 가까운 {near}({pct}%)',
      distTitle: '🏆 지금까지 나온 동물상',
      distMine: '내 {name} — 전체의 {share}%, 희귀도 {rank}위 / {kinds}종',
      distTotal: '누적 {total}회 판독',
      distLoading: '분포를 불러오는 중…',
      distFail: '분포를 불러오지 못했어요',
      errNoFace: '얼굴을 찾지 못했어요',
      errSmall: '얼굴이 너무 작아요 — 더 가까이 찍은 사진으로',
      errFront: '정면 얼굴 사진인지 확인해주세요',
      errStruct: '얼굴 구조를 인식하지 못했어요',
      errTurned: '고개를 돌린 사진이에요 — 정면으로 다시',
      errHint: '추측으로 결과를 만들지 않습니다. 다른 사진으로 다시 시도해주세요.',
      errModel: '모델을 불러오지 못했어요.<br>네트워크를 확인하고 새로고침해주세요.',
      errCam: '카메라를 열 수 없어요: {msg}',
      foot: '온디바이스 처리 · MediaPipe FaceLandmarker · 아트는 로컬 생성',
    },
    en: {
      title: '🦊 Animal Face Reader',
      sub: 'Measures 468 facial points and finds your match among 23 animals',
      metaTitle: 'Animal Face Reader — which animal is your face?',
      sexF: 'Female', sexM: 'Male', sexAny: 'Either',
      pick: '📷 Choose photo', cam: '🎥 Use camera', shot: '📸 Shoot', camClose: 'Close',
      privacy: 'Your photo is processed on this device only — never uploaded (only the resulting animal type is counted).',
      phEmpty: 'Add a photo and the result shows up here',
      mirror: '😀 Mirror my face', mirrorStop: '⏹ Stop',
      gif: '🎞 Make GIF', gifRec: '🎞 Recording {i}/{n}', gifMaking: '🎞 Building…',
      gifHint: '{kb}KB — long-press to save, or use the button', gifSave: '⬇ Save GIF',
      gifFail: 'GIF failed: {msg}', gifNeedMirror: 'Turn on "Mirror my face" first',
      basis: 'Why: {why}',
      axisHint: 'Ratios measured from your photo. Not a horoscope, not random.',
      big: 'large', small: 'small', mid: 'average',
      celebSame: 'Same {name}',
      celebNear: 'No celebrities tagged for {name} yet — closest is {near} ({pct}%)',
      distTitle: '🏆 What everyone is getting',
      distMine: 'Your {name} — {share}% of all readings, rarity #{rank} of {kinds}',
      distTotal: '{total} readings so far',
      distLoading: 'Loading distribution…',
      distFail: 'Could not load the distribution',
      errNoFace: 'No face found',
      errSmall: 'Face is too small — try a closer photo',
      errFront: 'Please use a front-facing photo',
      errStruct: 'Could not read the facial structure',
      errTurned: 'Head is turned — try facing the camera',
      errHint: 'We never guess a result. Try a different photo.',
      errModel: 'Could not load the model.<br>Check your connection and reload.',
      errCam: 'Cannot open the camera: {msg}',
      foot: 'On-device · MediaPipe FaceLandmarker · art generated locally',
    },
    ja: {
      title: '🦊 動物顔診断',
      sub: '顔の468点を実測して23種から探します',
      metaTitle: '動物顔診断 — あなたの顔はどの動物？',
      sexF: '女性', sexM: '男性', sexAny: 'どちらでも',
      pick: '📷 写真を選ぶ', cam: '🎥 カメラで撮る', shot: '📸 撮影', camClose: '閉じる',
      privacy: '写真はこの端末内だけで処理します。アップロードしません（結果の動物種だけ集計に送ります）。',
      phEmpty: '写真を入れると ここに結果が出ます',
      mirror: '😀 表情をまねる', mirrorStop: '⏹ やめる',
      gif: '🎞 GIFを作る', gifRec: '🎞 録画中 {i}/{n}', gifMaking: '🎞 作成中…',
      gifHint: '{kb}KB — 長押しで保存、または下のボタン', gifSave: '⬇ GIFを保存',
      gifFail: 'GIF失敗: {msg}', gifNeedMirror: '先に「表情をまねる」をオンにしてください',
      basis: '根拠: {why}',
      axisHint: '写真から実測した比率です。占いでも乱数でもありません。',
      big: '大きい', small: '小さい', mid: '普通',
      celebSame: '同じ{name}',
      celebNear: '{name}の芸能人はまだ整理中 — 次に近いのは{near}（{pct}%）',
      distTitle: '🏆 みんなの結果',
      distMine: 'あなたの{name} — 全体の{share}%、レア度{rank}位 / {kinds}種',
      distTotal: '累計{total}回',
      distLoading: '分布を読み込み中…',
      distFail: '分布を読み込めませんでした',
      errNoFace: '顔が見つかりません',
      errSmall: '顔が小さすぎます — もっと寄った写真で',
      errFront: '正面の顔写真か確認してください',
      errStruct: '顔の構造を認識できませんでした',
      errTurned: '顔が横を向いています — 正面で撮り直してください',
      errHint: '推測で結果は作りません。別の写真で試してください。',
      errModel: 'モデルを読み込めませんでした。<br>通信を確認して再読み込みしてください。',
      errCam: 'カメラを開けません: {msg}',
      foot: '端末内処理 · MediaPipe FaceLandmarker · アートはローカル生成',
    },
  };

  // 축 이름 — 결과 카드의 "근거"와 실측표에 함께 쓴다
  var AXES = {
    ko: { eyeSize:'눈 크기', eyeSlant:'눈꼬리 올라감', eyeGap:'미간 넓이', faceLength:'얼굴 길이',
          jawSharp:'턱 갸름함', cheek:'광대 발달', noseWidth:'코 넓이', lipThick:'입술 두께' },
    en: { eyeSize:'Eye size', eyeSlant:'Eye tilt', eyeGap:'Eye spacing', faceLength:'Face length',
          jawSharp:'Jaw taper', cheek:'Cheekbones', noseWidth:'Nose width', lipThick:'Lip fullness' },
    ja: { eyeSize:'目の大きさ', eyeSlant:'目尻の上がり', eyeGap:'目の間隔', faceLength:'顔の長さ',
          jawSharp:'あごの細さ', cheek:'頬骨', noseWidth:'鼻の幅', lipThick:'唇の厚み' },
  };

  /* 동물 이름·설명. animals.json은 한국어 정본을 그대로 두고 여기서 덮어쓴다
     (JSON을 언어별로 나누면 축값·박스까지 3벌이 되어 튜닝이 지옥이 된다). */
  var A = {
    dog:      { ko:['강아지상','보면 기분 좋아지는 얼굴. 첫인상에서 이미 반칙이다.'],
                en:['Puppy','A face that lifts the room. Unfair from the first second.'],
                ja:['子犬顔','見ると和む顔。第一印象からもう反則。'] },
    cat:      { ko:['고양이상','눈꼬리로 먹고 들어간다. 다가오면 도망가는 쪽은 상대다.'],
                en:['Cat','Wins with the eyes alone. You approach, they retreat.'],
                ja:['猫顔','目尻だけで勝負がつく。近づくと逃げるのは相手のほう。'] },
    rabbit:   { ko:['토끼상','눈이 얼굴의 절반. 놀란 표정이 기본값이다.'],
                en:['Rabbit','Eyes take up half the face. Default expression: startled.'],
                ja:['うさぎ顔','目が顔の半分。デフォルトが驚いた顔。'] },
    fennec:   { ko:['사막여우상','작고 또렷한 이목구비. 사진발이 유난히 잘 받는 타입.'],
                en:['Fennec fox','Small, sharply drawn features. Photographs unfairly well.'],
                ja:['フェネック顔','小づくりでくっきり。写真写りが異様にいいタイプ。'] },
    hamster:  { ko:['햄스터상','볼살이 인상을 다 가져간다. 나이를 안 먹는 얼굴.'],
                en:['Hamster','The cheeks run the whole face. Ages backwards.'],
                ja:['ハムスター顔','頬が全部持っていく。歳をとらない顔。'] },
    fox:      { ko:['여우상','웃지 않아도 웃는 것처럼 보인다. 그래서 오해도 많이 산다.'],
                en:['Fox','Looks amused even when you are not. Gets misread a lot.'],
                ja:['きつね顔','笑ってなくても笑って見える。だから誤解も多い。'] },
    bear:     { ko:['곰상','덩치와 상관없이 순해 보인다. 사람들이 자꾸 부탁을 한다.'],
                en:['Bear','Reads gentle regardless of size. People keep asking you for favors.'],
                ja:['くま顔','体格に関係なく優しく見える。よく頼まれごとをされる。'] },
    deer:     { ko:['사슴상','눈망울이 커서 뭘 해도 애처로워 보인다. 이득 보는 얼굴.'],
                en:['Deer','Big soft eyes make everything look sincere. A useful face.'],
                ja:['鹿顔','瞳が大きくて何をしても健気に見える。得な顔。'] },
    wolf:     { ko:['늑대상','가만히 있어도 화난 줄 안다. 알고 보면 제일 무른 쪽.'],
                en:['Wolf','Resting face reads angry. Actually the softest one here.'],
                ja:['狼顔','黙っていると怒っていると思われる。実は一番やわらかい。'] },
    shihtzu:  { ko:['시츄상','눈코입이 가운데 모여 있다. 억울한 표정이 특기.'],
                en:['Shih Tzu','Features gathered in the middle. Specialty: looking wronged.'],
                ja:['シーズー顔','目鼻口が中央に集合。得意技は不服そうな顔。'] },
    bulldog:  { ko:['불독상','인상 하나로 자리를 정리한다. 웃으면 반전이 크다.'],
                en:['Bulldog','Settles a room with one look. The smile is a plot twist.'],
                ja:['ブルドッグ顔','眼力だけで場が静まる。笑うとギャップが大きい。'] },
    pig:      { ko:['돼지상','복스럽다는 말을 평생 듣는다. 칭찬 맞다.'],
                en:['Pig','You will hear "lucky face" your whole life. It is a compliment.'],
                ja:['豚顔','「福々しい」と一生言われる。ほめ言葉です。'] },
    gumiho:   { ko:['구미호상','예쁜데 어딘가 서늘하다. 사람 홀리는 건 얼굴 탓이 맞다.'],
                en:['Nine-tailed fox','Beautiful with a chill in it. Yes, it is the face.'],
                ja:['九尾顔','きれいなのにどこか冷たい。人を惑わすのは顔のせい。'] },
    frog:     { ko:['개구리상','미간이 넓어서 시야가 넓다. 실제로 눈치도 빠르다.'],
                en:['Frog','Wide-set eyes, wide field of view. Quick to read a room, too.'],
                ja:['カエル顔','目が離れていて視野が広い。実際に察しもいい。'] },
    duck:     { ko:['오리상','입이 먼저 보인다. 말이 많다는 뜻은 아니지만 대개 맞다.'],
                en:['Duck','The mouth arrives first. Not necessarily talkative — usually is.'],
                ja:['アヒル顔','まず口が目に入る。おしゃべりとは限らないが、だいたい当たる。'] },
    snake:    { ko:['뱀상','눈매 하나로 분위기를 바꾼다. 첫인상과 실물 차이가 제일 큰 유형.'],
                en:['Snake','Changes the mood with one glance. Biggest gap between first impression and reality.'],
                ja:['蛇顔','目つきひとつで空気を変える。第一印象と実物の差が最大。'] },
    squirrel: { ko:['다람쥐상','작고 빠릿한 인상. 뭘 먹고 있으면 더 잘 어울린다.'],
                en:['Squirrel','Small and quick. Suits you even better mid-snack.'],
                ja:['リス顔','小さくてすばしこい印象。何か食べていると似合う。'] },
    blobfish: { ko:['블롭피시상','세상 다 산 표정. 아무것도 안 했는데 지쳐 보인다.'],
                en:['Blobfish','Seen-it-all face. Exhausted without doing anything.'],
                ja:['ブロブフィッシュ顔','人生を悟った表情。何もしてないのに疲れて見える。'] },
    molerat:  { ko:['벌거숭이두더지쥐상','앞니가 인상을 지배한다. 웃을 때 제일 매력 있는 얼굴.'],
                en:['Naked mole-rat','The front teeth run the show. Best-looking mid-laugh.'],
                ja:['ハダカデバネズミ顔','前歯が印象を支配。笑った時が一番魅力的。'] },
    starnose: { ko:['별코두더지상','코가 먼저 도착한다. 존재감으로는 20종 중 1등.'],
                en:['Star-nosed mole','The nose gets there first. Unbeatable presence.'],
                ja:['ホシバナモグラ顔','鼻が先に到着する。存在感なら断トツ。'] },
    tiger:    { ko:['호랑이상','이목구비가 진해서 가만히 있어도 존재감이 있다. 잘생쁨 쪽.'],
                en:['Tiger','Strong features that hold a room without trying. Handsome-pretty.'],
                ja:['虎顔','目鼻立ちが濃くて黙っていても存在感がある。'] },
    raccoon:  { ko:['너구리상','강아지도 햄스터도 아닌데 씩씩하다. 어딘가 능청스러운 인상.'],
                en:['Raccoon','Not a puppy, not a hamster — sturdy, and quietly mischievous.'],
                ja:['たぬき顔','子犬でもハムスターでもない、たくましさ。どこかとぼけた印象。'] },
    chick:    { ko:['병아리상','눈코입이 작고 오밀조밀. 나이를 물으면 다들 놀란다.'],
                en:['Chick','Small, neatly packed features. Everyone guesses younger.'],
                ja:['ひよこ顔','目鼻口が小さくこぢんまり。年齢を聞くとみんな驚く。'] },
  };

  var KEY = 'animalface_lang';
  var ORDER = ['ko', 'en', 'ja'];
  var current = null;

  function detect() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q && UI[q]) return q;
    try { var s = localStorage.getItem(KEY); if (s && UI[s]) return s; } catch (e) {}
    var n = (navigator.language || 'ko').toLowerCase();
    if (n.indexOf('ko') === 0) return 'ko';
    if (n.indexOf('ja') === 0) return 'ja';
    return 'en';
  }
  function lang() { if (!current) current = detect(); return current; }
  function setLang(l) {
    if (!UI[l]) return;
    current = l;
    try { localStorage.setItem(KEY, l); } catch (e) {}
    document.documentElement.lang = l;
  }
  function cycle() { setLang(ORDER[(ORDER.indexOf(lang()) + 1) % ORDER.length]); }
  function next() { return ORDER[(ORDER.indexOf(lang()) + 1) % ORDER.length]; }

  function t(key, params) {
    var d = UI[lang()] || UI.ko;
    var s = d[key] != null ? d[key] : (UI.ko[key] != null ? UI.ko[key] : key);
    if (params) Object.keys(params).forEach(function (k) {
      s = s.split('{' + k + '}').join(String(params[k]));
    });
    return s;
  }
  // 사전에 없는 동물은 한국어 정본(animals.json)으로 폴백한다 — 새 종을 추가해도 페이지는 안 깨진다.
  function animal(id, fallback) {
    var e = A[id];
    if (!e) return fallback || { name: id, desc: '' };
    var v = e[lang()] || e.ko;
    return { name: v[0], desc: v[1] };
  }
  function axis(k) { return (AXES[lang()] || AXES.ko)[k] || k; }

  global.AF_I18N = { t: t, lang: lang, setLang: setLang, cycle: cycle, next: next,
                     animal: animal, axis: axis, langs: ORDER };
})(window);
