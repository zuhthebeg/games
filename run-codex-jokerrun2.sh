#!/bin/bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

cd /mnt/c/Users/user/games

codex --full-auto "jokerrun/index.html 조커런 게임 점검 및 수정:

1) 게임이 정상적으로 플레이 가능한지 전체 점검
2) 특히 라운드 진행 버그 수정:
   - 첫 라운드 300점 달성 시 다음 단계로 진행되는지
   - canContinue() 함수가 제대로 동작하는지
   - winRound() 호출되어 상점 열리는지
3) 게임 흐름 확인:
   - 카드 선택/플레이
   - 점수 계산
   - 라운드 클리어 조건
   - 상점에서 조커 구매
   - 3라운드 클리어 시 런 완료
4) UI/UX 문제 있으면 수정
5) 콘솔 에러 없는지 확인

완료 후:
git add jokerrun/
git commit -m 'fix: jokerrun game - ensure playable state and round progression'
git push"
