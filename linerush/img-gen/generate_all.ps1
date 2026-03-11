# 실행: Windows PowerShell에서 실행할 것 (WSL 금지 - GPU VRAM 충돌)
# cd C:\Users\user\games\linerush\img-gen
# .\generate_all.ps1

$python = "C:\Users\user\ai-tools\diffusion-env\Scripts\python.exe"
$script = "C:\Users\user\ai-tools\generate-image.py"
$outDir = "C:\Users\user\games\linerush\img-gen\output"

New-Item -ItemType Directory -Force -Path $outDir | Out-Null

# generate-image.py가 현재 prompt만 받으므로 참고용으로만 유지
$negativePrompt = "lowres, blurry, bad anatomy, extra fingers, watermark, text, logo"

$prompts = @(
  "1girl, adult woman, blonde long hair, blue eyes, petite, shy smile, white bikini, beach shore, mild undressing, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver bob cut, confident expression, curvy body, black lace lingerie reveal, bedroom, soft morning light, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink twintails, playful wink, slim body, pastel swimsuit, poolside, water droplets, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue ponytail, athletic build, sporty mood, unzipped track jacket over bikini top, locker room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black straight hair, elegant aura, tall body, red evening dress slipped off shoulder, hotel room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown wavy hair, gentle smile, curvy, cream lingerie set, cozy bedroom, fluffy pillows, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red short hair, mischievous eyes, athletic, open hoodie over sports bra and shorts, rooftop sunset, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white long hair, sleepy expression, petite, towel only, onsen changing area, steam, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple drill hair, proud pose, curvy body, frilly lingerie, ornate bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient hair pink to purple, playful grin, slim body, school blazer open with camisole, classroom after hours, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde twin braids, shy expression, petite body, maid outfit with loosened apron, mansion hallway, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver ponytail, cool gaze, tall athletic body, black one-piece swimsuit, indoor pool, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink bob cut, cheerful smile, curvy, idol costume partially unbuttoned, backstage room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue long hair, dreamy eyes, slim body, translucent nightgown, moonlit bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black twintails, playful mood, petite, striped bikini, beach ball, sunny beach, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown short hair, confident smile, athletic body, sports towel around waist, locker room bench, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red ponytail, fiery expression, curvy body, red lingerie reveal, vanity mirror room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white bob cut, elegant smile, tall slim body, silk robe slipping down, luxury suite, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple long hair, sleepy eyes, curvy, oversized shirt off shoulder, bedroom desk, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient blue green hair, playful pose, athletic, bikini under open summer cardigan, boardwalk, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde ahoge, teasing smile, petite body, lace camisole and shorts, bedroom window light, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver twintails, elegant mood, slim body, shrine maiden outfit loosened collar, shrine courtyard dusk, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink ponytail, bright expression, curvy, polka dot bikini, tropical beach, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue short hair, composed face, athletic body, open varsity jacket and sports bra, gym storage room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black long hair, shy blush, curvy body, satin lingerie set, candle-lit bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown ponytail, playful wink, tall body, high-cut swimsuit, pool deck at sunset, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red twintails, mischievous smile, petite, oversized hoodie over lingerie, gaming room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white braided hair, calm expression, slim body, towel wrap loosening, onsen hallway, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple bob cut, confident pose, curvy body, lace bodysuit, neon-lit bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient orange pink hair, playful mood, athletic, open denim jacket over bikini top, seaside street, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde ponytail, sporty smile, athletic build, running shorts and bikini top, beach track, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver long hair, elegant eyes, tall curvy body, black silk slip dress, penthouse balcony, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink short hair, shy grin, petite body, frilled bikini, resort pool, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue drill hair, proud smile, curvy figure, ornate maid outfit with open neckline, tea room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black bob cut, sleepy look, slim body, loose pajama shirt, bedroom morning, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown twin braids, cheerful mood, petite, academy-style uniform jacket off shoulder, school rooftop evening, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red long hair, bold gaze, curvy body, red bikini with sarong, beach sunset, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white ponytail, cool expression, athletic body, one-piece swimsuit half unzipped, indoor locker room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple twintails, playful laugh, slim body, idol stage costume loosened ribbon, backstage mirror, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient violet blue hair, dreamy smile, curvy, sheer robe over lingerie, moonlit balcony, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde short hair, confident stance, athletic body, bikini top and open rash guard, beach volleyball court, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver wavy hair, soft smile, curvy body, white lace lingerie, elegant bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink long hair, playful pose, petite, ribbon swimsuit, poolside chair, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue bob cut, shy expression, slim body, cardigan slipping from shoulders over camisole, library corner, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black ponytail, serious eyes, tall athletic body, damp towel around body, onsen entrance, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown long hair, warm smile, curvy, open sweater over lace bra, cozy room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red bob cut, teasing grin, petite, maid dress skirt lifted slightly, mansion stairs, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white twintails, innocent smile, slim body, sailor-style top loosened tie, classroom window light, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple ponytail, elegant expression, curvy body, silk kimono opened at collar, tatami room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient mint blonde hair, cheerful wink, athletic, crop hoodie and bikini bottom, beach boardwalk, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde drill hair, proud look, curvy body, gothic lingerie, velvet room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver short hair, sleepy smile, petite, oversized towel shirt, bedroom floor cushions, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink twintails, lively expression, athletic body, sporty bikini with jacket tied waist, marina dock, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue long hair, calm gaze, slim body, lace camisole and shorts set, moonlit bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black braided ponytail, confident grin, curvy, leather-style bikini top and shorts, urban rooftop, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown bob cut, shy pose, petite, academy cardigan open over blouse, empty classroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red ponytail, energetic smile, athletic body, one-shoulder swimsuit, tropical beach, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white long hair, elegant eyes, tall body, slit dress slipped to reveal lingerie, suite interior, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple short hair, playful mood, curvy body, maid bodice loosened ribbon, kitchen backdrop, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient sunset hair, dreamy expression, slim body, translucent beach shirt over bikini, shoreline twilight, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde twintails, bashful smile, petite body, frilly lingerie reveal, bedroom vanity, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver ponytail, composed face, athletic body, zip swimsuit partially open, indoor poolside, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink bob cut, playful laugh, curvy, idol jacket off shoulder with crop top, rehearsal room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue braided hair, shy eyes, slim body, loose blouse over lace bra, school corridor evening, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black long hair, elegant smile, tall curvy body, black bikini with sheer wrap, private beach, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown ponytail, sleepy expression, athletic, towel only with wet hair, onsen changing room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red twintails, teasing look, petite, open cardigan and camisole, bedroom desk lamp, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white bob cut, calm aura, slim body, kimono robe loosened sash, ryokan room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple long hair, confident pose, curvy body, lace bodice and stockings, velvet sofa room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient cyan purple hair, playful smile, athletic body, crop jacket with bikini underlayer, beach cafe terrace, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde short bob, bright smile, petite, yellow bikini, sunny shoreline, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver drill twintails, regal gaze, curvy body, ornate lingerie set, royal bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink ponytail, sporty wink, athletic body, track jacket slipping off, locker room mirror, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue long hair, gentle expression, slim body, white slip dress transparent in light, bedroom window, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black twintails, playful pose, petite, maid costume with open collar and apron, mansion corridor, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown wavy hair, warm smile, curvy, red lingerie and loose shirt, cozy bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red bob cut, daring eyes, athletic body, sporty one-piece swimsuit, diving platform, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white ponytail, serene mood, tall slim body, shrine maiden outfit with loosened sleeves, shrine gate dusk, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple braided hair, shy blush, curvy body, lace camisole reveal under blazer, classroom sunset, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient pink blue hair, energetic smile, petite, bikini with transparent hoodie, boardwalk arcade, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde ponytail, confident grin, athletic build, sports bra and open windbreaker, rooftop morning, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver long straight hair, dreamy gaze, curvy body, black silk robe opened slightly, moonlit room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink twintails, cute smile, petite, frill bikini with ribbon, beach parasol shade, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue short hair, calm expression, slim athletic body, zipper swimsuit lowered a bit, pool locker hallway, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black bob hair, elegant pose, tall curvy body, evening gown slipped to reveal thigh strap, suite window, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown braided twintails, playful eyes, petite, school-style cardigan unbuttoned over camisole, library desk, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red long ponytail, fierce smile, athletic body, red bikini and open shirt, beach rocks, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white short hair, sleepy look, slim body, towel wrap after bath, onsen resting room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple twintails, proud smile, curvy body, idol costume with loose bow tie, backstage curtain, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient lavender silver hair, gentle smile, athletic body, cropped hoodie and bikini shorts, seaside steps, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",

  "1girl, adult woman, blonde long hair with ahoge, shy expression, petite, white lace bra under open shirt, bedroom curtain light, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, silver ponytail, elegant smile, tall body, navy swimsuit with wet shine, indoor pool at night, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, pink bob hair, playful wink, curvy body, maid dress top loosened ribbon, tea table room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, blue twintails, confident look, athletic, sports jacket open over bikini top, locker room lockers, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, black long hair, serene eyes, curvy body, silk nightwear partially slipped, moonlit bedroom, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, brown short hair, cheerful smile, petite, floral bikini, tropical shore, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, red ponytail, teasing grin, slim body, off-shoulder sweater over lingerie, city apartment room, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, white braided hair, soft expression, tall slim body, shrine robe open collar, shrine interior, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, purple bob cut, sleepy smile, curvy body, towel only with steam, hot spring bath edge, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed",
  "1girl, adult woman, gradient rainbow tips hair, playful pose, athletic curvy body, bikini and loose jacket, sunset beach, ecchi, tasteful nudity, masterpiece, best quality, anime style, detailed"
)

for ($i = 0; $i -lt $prompts.Count; $i++) {
  $outFile = "$outDir\char_{0:D3}.png" -f ($i + 1)
  Write-Host "[$($i+1)/100] Generating: $outFile"
  & $python $script $prompts[$i] 832 $outFile
}

Write-Host "완료!"
