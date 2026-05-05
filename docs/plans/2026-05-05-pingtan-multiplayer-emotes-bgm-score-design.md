# pingtan Multiplayer Emotes, BGM, and Clear Score Display Design

## Goal
Improve multiplayer usability and polish before production by adding lightweight player communication, making BGM settings actually produce music, and showing each map's clear/victory score target.

## Scope
- Add a multiplayer emote/reaction panel in the in-game UI.
- Send selected emotes through multiplayer action events without changing game state.
- Play short browser TTS lines for emotes when voice is enabled.
- Verify and fix BGM toggle/playback wiring.
- Display clear score/target victory points per map in map selection and active game UI.

## Emotes
Use a small fixed set:
- hurry: ⏰ “빨리해!” with shake motion
- hello: 👋 “안녕하세요” with wave/pop motion
- good: 👍 “좋아요”
- laugh: 😂 “ㅋㅋ”
- wow: 😱 “헉”
- nice: 🎉 “나이스”

Emotes are sent as `REACTION_EMOTE` actions. Receivers show a short toast/overlay with player name, emoji, and phrase. Emotes do not mutate core game state and should never block turn progression.

## Audio
Use browser `speechSynthesis` for short Korean TTS if `soundSettings.voice` is enabled. Do not add server-generated audio files.

BGM should use the existing BGM setting. If the current BGM engine is missing or silent, add a minimal WebAudio loop/pad so the BGM toggle has a real audible effect.

## Clear Score
Add a `targetScore`/clear-score helper based on map preset metadata, defaulting to 10. Show it in map cards and in-game header/status.

## Tests
Add static tests for:
- emote action handling and cooldown
- speech synthesis wiring
- BGM toggle/start wiring
- clear score display helpers

Run the full pingtan test set plus multiplayer lib tests before deploy.
