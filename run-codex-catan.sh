#!/bin/bash
export NVM_DIR="$HOME/.nvm"
source "$NVM_DIR/nvm.sh"

cd /mnt/c/Users/user/games

codex --full-auto "catan/index.html 카탄 게임 점검 및 수정:

1) 게임이 정상적으로 플레이 가능한지 전체 점검
2) 버그가 있으면 수정
3) 게임 흐름 확인: 
   - 초기 정착지/도로 배치
   - 주사위 굴리기
   - 자원 획득
   - 건물 건설
   - 턴 종료
4) UI/UX 문제 있으면 수정
5) 콘솔 에러 없는지 확인

완료 후:
git add catan/
git commit -m 'fix: catan game - ensure playable state'
git push"
