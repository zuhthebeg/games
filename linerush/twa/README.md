# Line Rush TWA Setup Notes

## 1) Package name suggestion
- `io.cocy.linerush`

## 2) Start URL
- `https://game.cocy.io/linerush/`

## 3) Required Digital Asset Links
Create `https://game.cocy.io/.well-known/assetlinks.json` after generating signing cert fingerprint.

Use `assetlinks.example.json` in this folder as template.

## 4) Bubblewrap quick steps
```bash
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://game.cocy.io/linerush/manifest.webmanifest
bubblewrap build
```

## 5) Play Console
- Upload AAB
- Closed testing first
- KR + US release countries recommended
